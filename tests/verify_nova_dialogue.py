#!/usr/bin/env python3
"""Storyboard panel 03 (Nova intro): dialogue + NEW MISSION card on desktop, phone portrait and
phone landscape. The panel must stay on screen, never cover controls or HUD, keep the game
running, and close on Continue. Emulated Chromium viewports, not a physical device.
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
page_html = html.replace('<link rel="stylesheet" href="./src/styles.css">', '<style>' + css + '</style>').replace(
    '<script type="module" src="./src/game.js"></script>', '<script>' + js + '</script>')
D = 'window.__imInYoCityDebug()'
GUARDED = ['#moveJoystick', '#actionButtons', '#chapter', '.hud-tools', '#mini-wrap', '#lookArea span']
VIEWS = [('desktop', {'width': 1280, 'height': 720}, False),
         ('phone-portrait', {'width': 390, 'height': 844}, True),
         ('phone-landscape', {'width': 844, 'height': 390}, True)]


def overlap(a, b):
    return a and b and a['x'] < b['x'] + b['width'] and b['x'] < a['x'] + a['width'] and \
        a['y'] < b['y'] + b['height'] and b['y'] < a['y'] + a['height']


results = {}
with sync_playwright() as p:
    chromium = os.getenv('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
    launch_options = {'headless': True}
    if chromium:
        launch_options['executable_path'] = chromium
    browser = p.chromium.launch(**launch_options)
    for name, viewport, touch in VIEWS:
        ctx = browser.new_context(viewport=viewport, is_mobile=touch, has_touch=touch)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content(page_html, wait_until='domcontentloaded')
        page.wait_for_function('window.__imInYoCityDebug && ' + D + '.frames > 3', timeout=10000)
        page.locator('#playMuted').click()
        page.wait_for_function(D + '.started')
        assert not page.locator('#dialogue').is_visible(), f'{name}: dialogue open before talking'
        page.keyboard.press('e')
        dlg = page.locator('#dialogue')
        assert dlg.is_visible(), f'{name}: Nova dialogue did not open'
        r = {'speaker': page.locator('#dialogueSpeaker').inner_text(),
             'line': page.locator('#dialogueLine').inner_text(),
             'card': page.locator('#missionCardTitle').inner_text(),
             'missionTitle': page.locator('#missionTitle').inner_text(),
             'stage': page.evaluate(D + '.stage'), 'paused': page.evaluate(D + '.paused')}
        assert r['speaker'] == 'NOVA' and r['line'].startswith('Yo, finally.'), (name, r)
        assert r['card'] == r['missionTitle'] and r['stage'] == 1 and r['paused'] is False, (name, r)
        page.wait_for_timeout(450)  # let the entrance transition settle before measuring
        box = dlg.bounding_box()
        assert box['x'] >= 0 and box['y'] >= 0 and box['x'] + box['width'] <= viewport['width'] + 1 and \
            box['y'] + box['height'] <= viewport['height'] + 1, f'{name}: dialogue off screen {box}'
        hits = []
        for sel in GUARDED:
            el = page.locator(sel)
            if el.count() and el.first.is_visible() and overlap(box, el.first.bounding_box()):
                hits.append(sel)
        assert not hits, f'{name}: dialogue covers {hits}'
        f0 = page.evaluate(D + '.frames'); page.wait_for_timeout(250)
        assert page.evaluate(D + '.frames') > f0, f'{name}: game froze behind dialogue'
        if touch:
            # Non-modal: a camera drag that starts on the panel text must still turn the camera.
            cx, cy = box['x'] + box['width'] * .7, box['y'] + box['height'] * .3
            yaw0 = page.evaluate(D + '.cameraYaw')
            page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx + 60, cy + 10, steps=5); page.mouse.up()
            r['dragThroughPanelTurnsCamera'] = abs(page.evaluate(D + '.cameraYaw') - yaw0) > .2
            assert r['dragThroughPanelTurnsCamera'], f'{name}: dialogue swallows camera drags'
            assert dlg.is_visible(), f'{name}: camera drag closed the dialogue'
        page.screenshot(path=str(ART / f'nova-dialogue-{name}.png'))
        page.locator('#dialogueContinue').click()
        assert not dlg.is_visible(), f'{name}: Continue did not close dialogue'
        if name == 'desktop':
            # Storyboard panel 08: finishing Act One opens the completion card (Free Roam unlocked).
            page.evaluate('stageUp();stageUp();stageUp()')
            assert page.evaluate(D + '.stage') == 4 and dlg.is_visible(), f'{name}: no Act One completion card'
            r['actComplete'] = {'speaker': page.locator('#dialogueSpeaker').inner_text(),
                                'label': page.locator('#missionCard small').inner_text(),
                                'card': page.locator('#missionCardTitle').inner_text()}
            assert r['actComplete']['speaker'] == 'ACT 1 COMPLETE' and 'UNLOCKED' in r['actComplete']['label'], r
            assert r['actComplete']['card'] == page.locator('#missionTitle').inner_text(), r
            page.screenshot(path=str(ART / 'act-complete-desktop.png'))
            page.locator('#dialogueContinue').click()
        assert not errors, f'{name}: JavaScript exceptions {errors}'
        r['box'] = {k: round(v) for k, v in box.items()}
        results[name] = r
        ctx.close()
    browser.close()
print(json.dumps({'status': 'PASS', 'views': results}, indent=1))
