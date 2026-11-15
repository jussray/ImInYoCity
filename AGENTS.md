# I'm In Yo City agent implementation contract

Authoritative repository: `jussray/ImInYoCity`; target branch `main`. Reuse ideas from `jussray/steel-city` without modifying Steel City or copying Pittsburgh scenery into Philly. Read current main SHA and branch SHA before every change. Do not create duplicate games, PRs, command centers, or deployment claims.

Current runtime entrypoint `index.html`, actual WebGL scene and controls in `src/game.js`, UI in `src/styles.css`. `tests/verify_game.py` tests the live browser code path through local HTTP. Android `www` build is pre-production only. Mobile Playwright emulation != physical Android GPU, Android package, or Play Store evidence. Preserve visual continuity, missions, controller and copyright-clean original assets; do not disable failing tests.

For Juss & Co. work: REALITY → FIX → PROOF → RISK → ROLLBACK → NEXT GATE; present exact file paths, commits, screenshots, and blockers. Seek only one focused reversible fix and verify before reporting or merging. Game Development Studio CLI production/package/adapter commands require exact independent authorization and may be unavailable in this environment.
