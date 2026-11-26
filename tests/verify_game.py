#!/usr/bin/env python3
"""Actual browser DOM/JS interaction smoke. Inline sources because this test host blocks localhost/file navigation.

Local source-tested Playwright != production HTTP, physical GPU, WebGL proof or Android Play Store approval.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageStat
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
    launch_options = {'headless': True, 'args': [
        '--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle',
        '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    ]}
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
            scene = page.evaluate('''() => {const a=makeCity(),b=dynamicGeometry();return {staticVertices:a.length/10,dynamicVertices:b.length/10,aligned:a.length%10===0&&b.length%10===0,finite:[...a.slice(0,3000)].every(Number.isFinite),districts:[districtAt(-2,-43),districtAt(-2,8),districtAt(-2,34),districtAt(52,0),districtAt(-42,0),districtAt(-18,-56)],gatePillars:cameraSolids.filter(w=>w[0]>=-6.3&&w[3]<=2.3&&w[2]>-44&&w[5]<-42).length,museumCollision:cameraSolids.some(w=>w[0]<-26&&w[3]>-10&&w[2]<-60&&w[5]>-52&&w[5]<13),museumRoofCoverage:cameraSolids.some(w=>w[0]<-26&&w[3]>-10&&w[2]<-62.5&&w[5]>-49.5&&w[5]<13)};}''')
            assert scene['aligned'] and scene['finite'] and scene['staticVertices'] > 30000 and scene['dynamicVertices'] > 1000, scene
            assert scene['districts'] == ['CHINATOWN','CENTER CITY','SOUTH PHILLY','DELAWARE RIVERFRONT','UNIVERSITY CITY','FAIRMOUNT'], scene
            assert scene['gatePillars'] >= 2, f'Chinatown Gate collision piers missing: {scene}'
            assert scene['museumCollision'], f'Fairmount Museum collision volume missing: {scene}'
            assert scene['museumRoofCoverage'], f'Fairmount Museum pediment is outside camera collision: {scene}'
            # Avatar vertices must rotate in world space (not just slide unrotated body boxes).
            facing = page.evaluate('''() => {const a=new Mesh(),b=new Mesh();humanoid(a,0,0,0,C.shirt,C.skin,0,0,1,0);humanoid(b,0,0,0,C.shirt,C.skin,Math.PI/2,0,1,0);const ext=m=>{let xs=[],zs=[];for(let i=0;i<m.data.length;i+=10){xs.push(m.data[i]);zs.push(m.data[i+2]);}return {x:Math.max(...xs)-Math.min(...xs),z:Math.max(...zs)-Math.min(...zs),finite:m.data.every(Number.isFinite)};};return {front:ext(a),side:ext(b)};}''')
            assert facing['front']['finite'] and facing['side']['finite'], facing
            assert abs(facing['front']['x']-facing['side']['x']) > .3, f'Avatar geometry did not rotate: {facing}'
        assert initial['webgl'] is True, (
            f"3D WebGL renderer required for gameplay proof; got {initial}"
        )
        assert not initial['started'], 'Should begin with title overlay'
        assert page.locator('#gameTitle').is_visible()
        page.screenshot(path=str(ART / f'{kind}-title.png'), animations='disabled')
        page.locator('#playMuted').click()
        page.wait_for_function('window.__imInYoCityDebug().started')
        assert page.locator('#hud').is_visible()
        assert page.locator('#missionTitle').inner_text() == 'Meet Nova at LOVE Park'
        if kind == 'mobile':
            hud_rects = page.evaluate("""() => {
                const rect = selector => {
                    const r = document.querySelector(selector).getBoundingClientRect();
                    return {left:r.left, right:r.right, top:r.top, bottom:r.bottom};
                };
                return {mission:rect('#chapter'),tools:rect('.hud-tools')};
            }""")
            mission_box, tools_box = hud_rects['mission'], hud_rects['tools']
            overlaps = (mission_box['left'] < tools_box['right']
                        and mission_box['right'] > tools_box['left']
                        and mission_box['top'] < tools_box['bottom']
                        and mission_box['bottom'] > tools_box['top'])
            assert not overlaps, f'Mobile mission and menu overlap: {hud_rects}'
        page.keyboard.press('e')
        assert page.evaluate('window.__imInYoCityDebug().stage') == 1, 'Nova interaction failed'
        before = page.evaluate('window.__imInYoCityDebug()')
        if kind == 'desktop':
            page.keyboard.down('w')
            page.wait_for_function(
                "({z}) => window.__imInYoCityDebug().z < z - 1",
                arg={'z': before['z']}, timeout=10000,
            )
            page.keyboard.up('w')
            after=page.evaluate('window.__imInYoCityDebug()')
            assert after['z'] < before['z'] - 1, (before,after)
            # Regression: camera auto-follow must not steer a rightward strafe into a circle.
            straight_start=page.evaluate('window.__imInYoCityDebug()')
            page.keyboard.down('d')
            page.wait_for_function(
                "({x}) => window.__imInYoCityDebug().x > x + 3",
                arg={'x': straight_start['x']}, timeout=10000,
            )
            page.keyboard.up('d')
            straight_end=page.evaluate('window.__imInYoCityDebug()')
            assert straight_end['x']-straight_start['x'] > 3, (straight_start, straight_end)
            assert abs(straight_end['z']-straight_start['z']) < .8, 'Camera feedback bent keyboard movement into a spiral'
            assert straight_end['cameraYaw'] > .8 and straight_end['heading'] > 1.2, 'Avatar/camera did not follow movement'
        else:
            assert page.locator('#moveJoystick').is_visible(), 'Analog joystick not visible on phone'
            joy=page.locator('#joy-ring').bounding_box()
            assert joy and joy['width'] > 90
            x=joy['x']+joy['width']/2
            y=joy['y']+joy['height']/2
            page.mouse.move(x,y)
            page.mouse.down()
            page.mouse.move(x+joy['width']*.33,y,steps=4)
            page.wait_for_timeout(1500)
            moved=page.evaluate('window.__imInYoCityDebug()')
            page.mouse.up()
            reset=page.evaluate('window.__imInYoCityDebug()')
            assert moved['x'] > before['x'] + 4, (before,moved)
            assert abs(moved['z']-before['z']) < .8, 'Camera feedback bent joystick movement into a spiral'
            assert abs(moved['cameraYaw']-before['cameraYaw']) > .6, 'Joystick must turn follow camera'
            assert moved['heading'] > 1.2 and moved['gait'] > .7, 'Avatar rotation/walk animation missing'
            assert moved['sprinting'] is True, 'Outer joystick range must activate analog sprint'
            assert reset['inputX']==0 and reset['inputY']==0, 'Joystick stuck'
            assert reset['sprinting'] is False, 'Sprint must reset after pointer release'
            page.wait_for_timeout(300)
            assert page.evaluate('window.__imInYoCityDebug().gait') < .2, 'Avatar remains in walk cycle after release'
            page.mouse.move(x,y);page.mouse.down()
            page.mouse.move(x+joy['width']*.12,y,steps=3)
            assert page.evaluate('window.__imInYoCityDebug().sprinting') is False, 'Gentle joystick must not sprint'
            page.mouse.up()
            # Independent right-hand orbit: pitch and yaw both change after a drag.
            look=page.locator('#lookArea').bounding_box()
            lx,ly=look['x']+look['width']*.5,look['y']+look['height']*.5
            before_look=page.evaluate('window.__imInYoCityDebug()')
            page.mouse.move(lx,ly)
            page.mouse.down()
            page.mouse.move(lx+60,ly+35,steps=5)
            page.mouse.up()
            after_look=page.evaluate('window.__imInYoCityDebug()')
            assert after_look['cameraYaw'] > before_look['cameraYaw']+.3, (before_look,after_look)
            assert after_look['cameraPitch'] > before_look['cameraPitch']+.08, (before_look,after_look)
            # Real multi-pointer path: left thumb keeps steering while right thumb orbits.
            session=context.new_cdp_session(page)
            def touch_point(px,py,identifier):
                return {'x':int(px),'y':int(py),'id':identifier,'radiusX':1,'radiusY':1,'force':1}
            def multi_touch(typ,points):
                session.send('Input.dispatchTouchEvent',{'type':typ,'touchPoints':points})
            joy_x,joy_y=x,y
            multi_touch('touchStart',[touch_point(joy_x,joy_y,11)])
            multi_touch('touchMove',[touch_point(joy_x+40,joy_y,11)])
            multi_touch('touchStart',[touch_point(joy_x+40,joy_y,11),touch_point(lx,ly,12)])
            both_start=page.evaluate('window.__imInYoCityDebug()')
            multi_touch('touchMove',[touch_point(joy_x+40,joy_y,11),touch_point(lx+48,ly-25,12)])
            page.wait_for_timeout(150)
            both=page.evaluate('window.__imInYoCityDebug()')
            assert both['inputX']>.8 and both['cameraYaw']>both_start['cameraYaw']+.25, 'Dual-thumb camera/joystick conflict'
            # CDP touchEnd lists the contact being released, unlike touchMove.
            multi_touch('touchEnd',[touch_point(lx+48,ly-25,12)])
            assert page.evaluate('window.__imInYoCityDebug().inputX')>.8, 'Releasing camera thumb stopped joystick'
            multi_touch('touchEnd',[])
            assert page.evaluate('window.__imInYoCityDebug().inputX')==0, 'Joystick stuck after two-touch release'
            # Android regression: a second finger on the stick must not steal its pointer.
            multi_touch('touchStart',[touch_point(joy_x,joy_y,21)])
            multi_touch('touchMove',[touch_point(joy_x+40,joy_y,21)])
            assert page.evaluate('window.__imInYoCityDebug().inputX') > .8, 'Primary touch did not steer'
            multi_touch('touchStart',[touch_point(joy_x+40,joy_y,21),touch_point(joy_x-23,joy_y,22)])
            assert page.evaluate('window.__imInYoCityDebug().inputX') > .8, 'Secondary touch stole the joystick'
            multi_touch('touchEnd',[touch_point(joy_x-23,joy_y,22)])
            assert page.evaluate('window.__imInYoCityDebug().inputX') > .8, 'Releasing secondary touch stopped primary thumb'
            # WebView background/phone interruption must cancel the stick and orbit.
            page.evaluate("window.dispatchEvent(new Event('blur'))")
            interrupted = page.evaluate('window.__imInYoCityDebug()')
            assert interrupted['inputX'] == 0 and interrupted['inputY'] == 0 and interrupted['basisYaw'] is None, interrupted
            knob_xy = page.locator('#joy-knob').evaluate('''el => {const m = new DOMMatrixReadOnly(el.style.transform); return [m.m41, m.m42];}''')
            assert all(abs(v) < .1 for v in knob_xy), f'Joystick knob stuck after app blur: {knob_xy}'
            multi_touch('touchEnd',[])
            multi_touch('touchStart',[touch_point(joy_x,joy_y,23)])
            multi_touch('touchMove',[touch_point(joy_x+40,joy_y,23)])
            assert page.evaluate('window.__imInYoCityDebug().inputX') > .8, 'Joystick failed to recover after app blur'
            multi_touch('touchEnd',[])
            assert page.evaluate('window.__imInYoCityDebug().inputX') == 0, 'Recovered joystick did not release'
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
        capture = ART / f'{kind}-gameplay.png'
        page.screenshot(path=str(capture), animations='disabled')
        # Visual guard: reject a gameplay view occupied by one wall or blank sky.
        with Image.open(capture) as shot:
            picture = shot.convert('RGB')
            width, height = picture.size
            center = picture.crop((int(width*.20), int(height*.31), int(width*.80), int(height*.48)))
            center_contrast = sum(ImageStat.Stat(center).stddev) / 3
        if kind == 'desktop':
            # A near-camera building used to cover the entire left flank; check it.
            with Image.open(capture) as shot:
                picture = shot.convert('RGB')
                ww, hh = picture.size
                left = picture.crop((int(ww*.10), int(hh*.27), int(ww*.41), int(hh*.80)))
                left_stats = ImageStat.Stat(left)
                left_brightness = sum(left_stats.mean) / 3
                left_contrast = sum(left_stats.stddev) / 3
            assert left_brightness > 24 and left_contrast > 11, (
                f'Desktop left side obstructed: brightness={left_brightness:.1f}, '
                f'contrast={left_contrast:.1f}'
            )
        min_contrast = 18 if kind == 'desktop' else 12
        assert center_contrast > min_contrast, f'{kind}: playfield obscured (center contrast {center_contrast:.2f})'
        camera_state = page.evaluate('window.__imInYoCityDebug()')
        if camera_state['webgl']:
            eye = camera_state['camPos']
            gap = ((eye[0]-camera_state['x'])**2+(eye[2]-camera_state['z'])**2)**.5
            assert gap > 4.5, f'{kind}: follow camera too close to avatar (distance {gap:.2f})'
        assert not errors, f'{kind} JavaScript exceptions: {errors}'
        result=page.evaluate('window.__imInYoCityDebug()')
        results[kind]={k:result[k] for k in ('started','stage','skyMode','webgl','fallback','frames','pulses','cameraYaw','energy')}
        page.close();context.close()
    browser.close()

# CPU geometry is separately checked in the browser source path, even if WebGL unavailable.
print(json.dumps({'status':'PASS','source':'inline local browser execution, not network route','checks':results,
    'screenshots':[str(p.relative_to(ROOT)) for p in sorted(ART.glob('*.png'))],
    'limits':'Browser source smoke; GPU/Android/production/Google Play NOT verified'},indent=2))
