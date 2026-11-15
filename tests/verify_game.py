#!/usr/bin/env python3
"""Actual browser DOM/JS interaction smoke. Inline sources because this test host blocks localhost/file navigation.

Local source-tested Playwright != production HTTP, physical GPU, WebGL proof or Android Play Store approval.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
import os

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'artifacts'
ART.mkdir(exist_ok=True)
html = (ROOT / 'index.html').read_text(encoding='utf-8')
css = (ROOT / 'src/styles.css').read_text(encoding='utf-8')
js = (ROOT / 'src/game.js').read_text(encoding='utf-8')
assert '<script type="module" src="./src/game.js"></script>' in html
assert '<link rel="stylesheet" href="./src/styles.css">' in html
assert 'https://cdn.' not in html + css + js, 'Unexpected external CDN in offline-first game'
assert (ROOT/'assets/icon-192.png').exists() and (ROOT/'assets/icon-512.png').exists()
assert (ROOT/'manifest.webmanifest').exists()
assembled = html.replace('<link rel="stylesheet" href="./src/styles.css">', '<style>' + css + '</style>')
assembled = assembled.replace('<script type="module" src="./src/game.js"></script>', '<script>' + js + '</script>')

with sync_playwright() as p:
    chromium = os.getenv('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
    launch_options = {'headless': True}
    if chromium:
        launch_options['executable_path'] = chromium
    browser = p.chromium.launch(**launch_options)
    results = {}
    for kind, viewport, touch in [('desktop', {'width':1280,'height':720}, False), ('mobile', {'width':390,'height':844}, True)]:
        context = browser.new_context(viewport=viewport, is_mobile=touch, has_touch=touch)
        page = context.new_page()
        errors=[]
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content(assembled, wait_until='domcontentloaded', timeout=20000)
        page.wait_for_function('window.__imInYoCityDebug && window.__imInYoCityDebug().frames > 3', timeout=10000)
        initial = page.evaluate('window.__imInYoCityDebug()')
        if kind == 'desktop':
            scene = page.evaluate('''() => {const a=makeCity(),b=dynamicGeometry();return {staticVertices:a.length/10,dynamicVertices:b.length/10,aligned:a.length%10===0&&b.length%10===0,finite:[...a.slice(0,3000)].every(Number.isFinite)};}''')
            assert scene['aligned'] and scene['finite'] and scene['staticVertices'] > 30000 and scene['dynamicVertices'] > 1000, scene
        assert initial['webgl'] or initial['fallback'], 'No renderer active'
        assert not initial['started'], 'Should begin with title overlay'
        assert page.locator('#gameTitle').is_visible()
        page.screenshot(path=str(ART / f'{kind}-title.png'), animations='disabled')
        page.locator('#playMuted').click()
        page.wait_for_function('window.__imInYoCityDebug().started')
        assert page.locator('#hud').is_visible()
        assert page.locator('#missionTitle').inner_text() == 'Meet Nova at LOVE Park'
        page.keyboard.press('e')
        assert page.evaluate('window.__imInYoCityDebug().stage') == 1, 'Nova interaction failed'
        before = page.evaluate('window.__imInYoCityDebug()')
        if kind == 'desktop':
            page.keyboard.down('w')
            page.wait_for_timeout(380)
            page.keyboard.up('w')
            after=page.evaluate('window.__imInYoCityDebug()')
            assert after['z'] < before['z'] - 1, (before,after)
        else:
            assert page.locator('#moveJoystick').is_visible(), 'Analog joystick not visible on phone'
            joy=page.locator('#joy-ring').bounding_box()
            assert joy and joy['width'] > 90
            x=joy['x']+joy['width']/2
            y=joy['y']+joy['height']/2
            page.mouse.move(x,y)
            page.mouse.down()
            page.mouse.move(x+joy['width']*.33,y,steps=4)
            page.wait_for_timeout(800)
            moved=page.evaluate('window.__imInYoCityDebug()')
            page.mouse.up()
            reset=page.evaluate('window.__imInYoCityDebug()')
            assert moved['x'] > before['x'] + .5, (before,moved)
            assert abs(moved['cameraYaw']-before['cameraYaw']) > .05, 'Joystick must turn follow camera'
            assert moved['sprinting'] is True, 'Outer joystick range must activate analog sprint'
            assert reset['inputX']==0 and reset['inputY']==0, 'Joystick stuck'
            assert reset['sprinting'] is False, 'Sprint must reset after pointer release'
            page.mouse.move(x,y)
            page.mouse.down()
            page.mouse.move(x+joy['width']*.12,y,steps=3)
            assert page.evaluate('window.__imInYoCityDebug().sprinting') is False, 'Gentle joystick movement must remain walking speed'
            page.mouse.up()
        # Regression: interrupted camera drag must restore camera-follow rotation.
        look_selector = '#lookArea' if kind == 'mobile' else '#game'
        point_x = viewport['width'] * (.83 if kind == 'mobile' else .18)
        point_y = viewport['height'] * .44
        page.evaluate("""selector => {
            window.__cameraCaptureId = null;
            document.querySelector(selector).addEventListener('pointerdown',
                e => { window.__cameraCaptureId = e.pointerId; }, {once: true});
        }""", look_selector)
        page.mouse.move(point_x, point_y)
        page.mouse.down()
        page.wait_for_function('window.__cameraCaptureId !== null')
        page.evaluate("""selector => {
            const surface = document.querySelector(selector);
            if (!surface.hasPointerCapture(window.__cameraCaptureId))
                throw Error('Camera capture was not established');
            surface.releasePointerCapture(window.__cameraCaptureId);
        }""", look_selector)
        page.wait_for_timeout(70)
        camera_before = page.evaluate('window.__imInYoCityDebug().cameraYaw')
        page.keyboard.down('d')
        page.wait_for_timeout(600)
        page.keyboard.up('d')
        camera_after = page.evaluate('window.__imInYoCityDebug().cameraYaw')
        page.mouse.up()
        assert abs(camera_after - camera_before) > .12, (
            f'{kind}: camera follow stuck after losing pointer capture',
            camera_before, camera_after
        )
        page.keyboard.press('f')
        flying=page.evaluate('window.__imInYoCityDebug()')
        assert flying['skyMode'], 'Sky Mode failed'
        page.keyboard.down('Space')
        page.wait_for_timeout(280)
        page.keyboard.up('Space')
        ascended=page.evaluate('window.__imInYoCityDebug()')
        assert ascended['y'] > flying['y'], (flying,ascended)
        page.keyboard.press('j')
        assert page.evaluate('window.__imInYoCityDebug().pulses') >= 1, 'Pulse action failed'
        page.locator('#journalBtn').click()
        assert page.locator('#missionList .mission-row').count()==4
        page.locator('#journalClose').click()
        page.locator('#pauseBtn').click()
        assert page.evaluate('window.__imInYoCityDebug().paused') is True
        page.locator('#resumeButton').click()
        assert page.evaluate('window.__imInYoCityDebug().paused') is False
        page.screenshot(path=str(ART / f'{kind}-gameplay.png'), animations='disabled')
        assert not errors, f'{kind} JavaScript exceptions: {errors}'
        result=page.evaluate('window.__imInYoCityDebug()')
        results[kind]={k:result[k] for k in ('started','stage','skyMode','webgl','fallback','frames','pulses','cameraYaw','energy')}
        page.close();context.close()
    browser.close()

# CPU geometry is separately checked in the browser source path, even if WebGL unavailable.
print(json.dumps({'status':'PASS','source':'inline local browser execution, not network route','checks':results,
    'screenshots':[str(p.relative_to(ROOT)) for p in sorted(ART.glob('*.png'))],
    'limits':'Browser source smoke; GPU/Android/production/Google Play NOT verified'},indent=2))
