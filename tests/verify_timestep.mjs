#!/usr/bin/env node
// Verify the production animation loop advances real elapsed time in bounded
// physics steps. A frozen CI runner must not make avatar controls run in slow motion.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
const begin = src.indexOf('function animate(now)');
const end = src.indexOf('function setupInput(', begin);
assert.ok(begin >= 0 && end > begin, 'Cannot locate production animation loop');
const animateSource = src.slice(begin, end);

function simulate(ms) {
  // Invoke the *actual* animation function with a minimal rendering boundary.
  // This test measures simulation time, not GPU availability or DOM appearance.
  const exercise = new Function('now', `
    let lastFrame = 0, renderDt = 0, state = {frame: 0, webgl: true};
    const steps = [];
    let renders = 0, nextFrames = 0;
    const update = dt => steps.push(dt);
    const renderer = () => {renders++};
    const requestAnimationFrame = () => {nextFrames++};
    const updateHUD = () => {};
    const clamp = (v, low, high) => Math.max(low, Math.min(v, high));
    const $ = () => ({classList: {remove(){}}});
    const console = {error() {}};
    ${animateSource}
    animate(now);
    return {steps, elapsed: steps.reduce((sum, dt) => sum + dt, 0), renders, nextFrames};
  `);
  return exercise(ms);
}
const checks = [
  {ms: 16, expected: .016},
  {ms: 110, expected: .110},
  {ms: 380, expected: .250},
  {ms: 5000, expected: .250},
];
for (const {ms, expected} of checks) {
  const outcome = simulate(ms);
  assert.ok(Math.abs(outcome.elapsed - expected) < 0.000001,
    `Frame ${ms}ms advances ${outcome.elapsed}s, expected ${expected}s`);
  assert.ok(outcome.steps.every(dt => dt > 0 && dt <= .050001),
    `Large or invalid physics substep for ${ms}ms frame`);
  assert.equal(outcome.renders, 1, 'Render exactly once after catching up');
  assert.equal(outcome.nextFrames, 1, 'Schedule exactly one subsequent frame');
}
console.log(JSON.stringify({status: 'PASS', test: 'real elapsed-time simulation with bounded catch-up',
  frames: checks.map(c => ({ms: c.ms, simulatedSeconds: simulate(c.ms).elapsed}))}));
