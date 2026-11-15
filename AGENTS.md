# I'm In Yo City: engineering guardrails

This repository is the authoritative **Philadelphia** game. It is not `jussray/steel-city`, not a new Founder Control Room, and not a ChatGPT Plugin distribution project.

- Keep an original cinematic 3D open-world Philadelphia game direction, not an endless runner or generic 2D arcade substitute.
- Preserve mobile joystick, desktop keys, camera follow/drag, mission progression, sound, and runnable static browser entry point.
- City landmarks are currently procedural artistic approximations; do not market them as accurate photogrammetry or realistic PS5 assets.
- Inspect `main`, target branch HEAD, changed files, current CI status, and merge base before changing code. Preserve existing changes and minimize diffs.
- Use the installed Game Studio and Codex Engineering Guardrails workflows when available. Reuse existing repo and tools; avoid duplicate game projects, PRs, sites and runtime architectures.
- Check `node --check game.js` and `node tests/smoke.mjs`; real Playwright `python3 tests/playtest.py` and screenshot review are mandatory before calling the runtime visually verified.
- Treat mocked simulation smoke evidence as distinct from real browser WebGL/Android device proof. On any GPU failure, fail honestly rather than silently claiming the scene is correct.
- No automatic merge, deployment, Google Play upload, publishing, or public playable claim without fresh exact-head Playwright/device evidence and authorized release gate.
- Report REALITY, FIX, PROOF, RISK, ROLLBACK, NEXT GATE with exact commits and affected paths. Preserve the independent human review requirement on protected branches.
