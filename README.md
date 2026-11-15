# I'm In Yo City 🎮

**Philadelphia, Chapter 01:** a self-contained playable third-person 3D street exploration prototype by Juss & Co. Games. This is an original fictional game set in a Philadelphia-inspired environment. The city silhouettes and rowhomes are procedural interpretations, not photogrammetry, licensed maps, or a promise of exact geographic fidelity.

## Play

Serve the repository root from an HTTP server and open `index.html` in a current Chrome-compatible browser:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

Choose **ENTER PHILLY**, move with WASD / arrow keys or the mobile joystick, rotate the camera by dragging the scene, and press **E** or **INTERACT** near the mural and then the guide to complete the first mission. Optional sound is generated locally via Web Audio after a user gesture. The game requires no external CDN, paid assets, tracking scripts or accounts.

## Implemented in Build 01

- Actual WebGL2 3D rendering with a following third-person camera, directional lighting, depth haze and procedural Philadelphia rowhomes, storefronts, mural, street furniture and Center City-inspired distant skyline
- Keyboard and touch-joystick movement, drag-to-rotate follow-camera, player avatar, collision-bound walking corridor, short two-stop mission, mobile HUD and opt-in sound effects
- Rendering and gameplay simulation separated from DOM UI; read-only `window.__gameDebug()` evidence hook for browser testing
- No copyrighted characters or film/game assets

**Important:** This first block is deliberately scoped, and is **not** PS5-grade production art, an open-world city map, or an Android/Google Play-ready build. Google Play packaging, real device performance, landmarks, asset replacement, combat, NPC behavior, saves, and release sign-off are separate verified gates. Replace procedural blocks with original licensed optimized glTF/GLB assets when the art pipeline is ready.

## Test

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
python3 tests/test_game.py
```

The browser test checks runtime boot, real keyboard movement, touch joystick and mission interactions in Chromium. Screenshots are generated under `artifacts/` (ignored). On locked-down browser infrastructure that blocks localhost, set `GAME_TEST_INLINE=1` to execute the exact HTML and JS without local navigation. Inline mode does not prove HTTP routing; a Canvas2D fallback run does not prove WebGL2 GPU behavior. Passing desktop/mobile emulation is not proof of real Android hardware compatibility.

## Architecture

- `index.html`: accessible title/menu, HUD, touchscreen controls, intro and visual shell
- `src/game.js`: standalone WebGL2 renderer, procedural geometry, simulation, input, camera, missions and Web Audio
- `tests/test_game.py`: real-browser gameplay and screenshot verification

## Stop / rollback

Current source is a prototype; do not advertise as deployed or Google Play-ready until device, store-policy, rights, production URL and Playwright gates pass. Revert the Build 01 commit to restore the initial README-only repository state.