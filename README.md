# I'm In Yo City: Philadelphia

An original, playable **3D Philadelphia-inspired exploration prototype**. This repository is distinct from Steel City. It runs as a static website with no build step, account connection, external dependencies, or downloaded assets.

## Run

```bash
python3 -m http.server 8080
# Open http://localhost:8080
```

The initial scene features stylized landmarks inspired by City Hall, Reading Terminal Market, and the Ben Franklin Bridge, plus street grids, a controllable character, three location objectives, a desktop keyboard, mobile joystick, camera follow and drag, optional synthesized sound, hopping, and running. Locations are artistic approximations, **not** a surveyed Philadelphia digital twin.

### Controls

- **Desktop:** WASD or arrows move; Shift runs; Space hops; drag the city view to turn the camera.
- **Mobile:** left joystick moves; drag the city view to turn; hold RUN to sprint; HOP jumps.
- **Sound:** tap ♪ ON/OFF. Audio unlocks only after the player presses ENTER PHILLY.

## Status and checks

This is an early browser/WebGL vertical slice. It is **not yet** a Google Play-ready Android package, photorealistic PS5-quality game, complete storyline, or live multiplayer city.

Run `node --check game.js` and `node tests/smoke.mjs` to validate the syntax and simulated gameplay/input paths. Run `python3 tests/playtest.py` with Playwright Python and Chromium for actual desktop/mobile WebGL screenshot and movement verification. Keep browser proof separate from simulated tests.

### Delivery gates

1. Execute real-device Playwright/screenshots and assess graphics fidelity and performance.
2. Replace simplified landmark geometry with approved optimized glTF/GLB asset art and deepen original Philly missions.
3. Package the validated game for Android, verify touch/performance on physical devices, then prepare Google Play listing and compliance.

Do not claim a release or deploy from this branch until the real-path, visual, and device gates are green.
