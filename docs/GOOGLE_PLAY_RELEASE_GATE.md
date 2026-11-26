# I'm In Yo City — Android and Google Play Release Gate

**Repository:** `jussray/ImInYoCity`  
**Baseline inspected:** `f729c0061a4d3236acb481290f3cb929d2bc6e2a`  
**Release posture:** playable web vertical slice; Android packaging is automated; not approved or signed for public distribution.

## 1. Android device verification

### Automated evidence already wired into CI
- Build the web bundle with `npm run build`.
- Generate the Capacitor Android project and compile an API 36 debug APK.
- Compile an unsigned release AAB and compare the packaged game sources with the web bundle.
- Run the packaged game in an Android API 35 emulator and exercise its WebView controls.
- Save emulator screenshots and a machine-readable result artifact.

These checks are not physical-device evidence. The generated APK is a debug build; the AAB is unsigned.

### Physical-phone gate
1. Download the latest successful `iminyocity-android-api36-debug-not-for-play` artifact from the Android workflow.
2. Connect one authorized Android phone with USB debugging enabled.
3. Run `adb devices` and confirm the intended phone is the only authorized device, or pass its selected serial locally.
4. Run:

   ```bash
   python3 tests/verify_android_emulator.py --physical --apk /path/to/app-debug.apk
   ```

5. Inspect `artifacts/android-phone/result.json` and all three screenshots.
6. Separately perform human finger testing. WebView-injected touch events cannot judge tactile feel.

Required manual checks: left-stick movement, simultaneous right-side camera orbit, jump/fly/land, pulse/interact, pause/resume, app background/foreground recovery, orientation changes, safe-area layout, audio, frame pacing, device heat and battery behavior.

**Gate owner action required:** connect and test a real phone. No physical phone is connected to this development session, so this gate cannot be marked passed here.

## 2. First-playable stabilization

The browser workflow is the regression gate for:
- desktop and mobile boot and first actionable screen;
- joystick movement, camera rotation, dual-thumb ownership and interruption cleanup;
- mission interaction, Sky Mode, pulse, journal and pause/resume;
- WebGL fallback, camera clearance, service-worker freshness and bounded frame catch-up;
- screenshot-based playfield visibility and mobile HUD overlap.

Run the full local suite before merging code changes:

```bash
node scripts/build.mjs
node tests/verify_timestep.mjs
python3 tests/verify_game.py
python3 tests/verify_service_worker.py
python3 tests/verify_fallback_boot.py
python3 tests/verify_camera_clearance.py
python3 tests/verify_nova_dialogue.py
python3 tests/verify_hud_layout.py
python3 tests/verify_cinema_view.py
```

CI results and screenshots must be inspected on the exact PR head. A green browser test is not proof of physical GPU behavior.

## 3. Philadelphia world expansion

The current game is a stylized, deterministic procedural city, not a geographically accurate scan. Expand it in small, testable additions:
- give districts recognizable names and transitions;
- add original landmark silhouettes and local environmental details;
- register building-scale collision volumes with the camera/player collision system;
- preserve existing mission routes and camera clearance;
- add deterministic Playwright checks for new district names, landmark geometry and collision proxies.

This increment adds a stylized Chinatown Gate with two collision-tested piers and adds Chinatown and Delaware Riverfront district labels. Future landmark work should follow the same geometry-plus-collision-plus-browser-test pattern.

## 4. Google Play preparation

Before a public submission:
- confirm the publisher owns and intends to use Android application ID `company.jussco.iminyocity`;
- complete app icon, feature graphic, phone/tablet screenshots and store listing text;
- prepare a public privacy-policy URL and verify it matches the shipped app and SDK inventory;
- complete Play Console Data safety, content rating, target audience, ads declaration and app-access declarations as applicable;
- inspect generated Android permissions and every dependency for collection or sharing behavior;
- generate and securely protect the release signing key; never commit keystores or passwords;
- build a signed release AAB, verify its package ID, version code, target SDK and digest;
- upload to an internal testing track, install from Play, verify upgrade behavior and collect tester feedback;
- complete policy review and production access requirements before public rollout.

### Privacy and data inventory — preliminary, not a legal certification

The inspected web source and package manifest show no game account flow, analytics SDK, ad SDK or game backend integration. That observation is not a final Data safety declaration. Recheck the generated Android manifest, transitive dependencies, SDK behavior and any services added before submission. If the game begins collecting, sharing or transmitting data, update the policy and Play declarations first.

### Hard release blockers
- physical Android phone test and human touch review;
- confirmed app-ID ownership and release versioning;
- public, reviewed privacy policy and accurate Play Console declarations;
- signed release AAB and internal-track validation;
- final Play Console policy review.

Do not label an unsigned CI artifact as a Play Store release.
