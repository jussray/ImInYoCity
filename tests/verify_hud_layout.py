#!/usr/bin/env python3
"""HUD layout proof (storyboard panels 04/07): the mission marker, level chip and compass stay clear
of HUD tools, mission panel, controls and minimap on desktop, phone portrait and phone landscape.
The marker is driven to the extremes of the screen to exercise its clamp. Emulated viewports only.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
import os

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / 'index.html').read_text(encoding='utf-8')
css = (ROOT / 'src/styles.css').read_text(encoding='utf-8')
js = (ROOT / 'src/game.js').read_text(encoding='utf-8')
page_html = html.replace('<link rel="stylesheet" href="./src/styles.css">', '<style>' + css + '</style>').replace(
    '<script type="module" src="./src/game.js"></script>', '<script>' + js + '</script>')
D = 'window.__imInYoCityDebug()'
BLOCKERS = ['.hud-tools', '#chapter', '#moveJoystick', '#actionButtons', '#mini-wrap', '.brand']
VIEWS = [('desktop', {'width': 1280, 'height': 720}, False),
         ('phone-portrait', {'width': 390, 'height': 844}, True),
         ('phone-landscape', {'width': 844, 'height': 390}, True)]


def rect(page, sel):
    el = page.locator(sel)
    return el.first.bounding_box() if el.count() and el.first.is_visible() else None


def hit(a, b):
    return a and b and a['x'] < b['x'] + b['width'] and b['x'] < a['x'] + a['width'] and \
        a['y'] < b['y'] + b['height'] and b['y'] < a['y'] + a['height']


out = {}
with sync_playwright() as p:
    chromium = os.getenv('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
    launch_options = {'headless': True}
    if chromium:
        launch_options['executable_path'] = chromium
    browser = p.chromium.launch(**launch_options)
    for name, vp, touch in VIEWS:
        ctx = browser.new_context(viewport=vp, is_mobile=touch, has_touch=touch)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content(page_html, wait_until='domcontentloaded')
        page.wait_for_function('window.__imInYoCityDebug && ' + D + '.frames > 3', timeout=10000)
        page.locator('#playMuted').click()
        page.wait_for_function(D + '.started')
        # Point the marker at a distant target (Reading Terminal), as after the first story beat.
        page.keyboard.press('e')
        if page.locator('#dialogueContinue').is_visible():
            page.locator('#dialogueContinue').click()
        assert page.evaluate(D + '.stage') == 1, f'{name}: could not reach the Reading Terminal objective'
        page.wait_for_timeout(2800)  # let the stage-up toast clear
        problems = []
        lvl = rect(page, '#level')
        for sel in ['.hud-tools', '#chapter', '.brand']:
            if hit(lvl, rect(page, sel)):
                problems.append(f'#level over {sel}')
        # Sweep camera yaw/pitch so the marker hits the top, bottom and side clamps.
        samples = 0
        for yaw in [0, 1.2, 2.4, 3.6, 4.8]:
            for pitch in [-0.35, 0.28, 0.9]:
                page.evaluate(f'cameraYaw={yaw};cameraPitch={pitch};camPos=null')
                page.wait_for_timeout(120)
                m = rect(page, '#marker')
                if not m:
                    continue
                samples += 1
                for sel in BLOCKERS:
                    if hit(m, rect(page, sel)):
                        problems.append(f'marker over {sel} at yaw={yaw} pitch={pitch}')
        assert samples >= 5, f'{name}: marker rarely visible ({samples})'
        # Storyboard panel 05: Sky Mode badge/hints appear while flying and stay clear of everything.
        page.keyboard.press('f')
        page.wait_for_function(D + '.skyMode')
        page.wait_for_timeout(200)
        sky = rect(page, '#skyHud')
        assert sky, f'{name}: Sky Mode HUD not shown while flying'
        for sel in BLOCKERS + ['#level', '#location', '#lookArea span']:
            if hit(sky, rect(page, sel)):
                problems.append(f'#skyHud over {sel}')
        for yaw in [0, 1.6, 3.2, 4.8]:
            for pitch in [-0.35, 0.9]:
                page.evaluate(f'cameraYaw={yaw};cameraPitch={pitch};camPos=null')
                page.wait_for_timeout(120)
                if hit(rect(page, '#marker'), sky):
                    problems.append(f'marker over #skyHud at yaw={yaw} pitch={pitch}')
        page.keyboard.press('f')
        page.wait_for_timeout(200)
        assert not page.locator('#skyHud').is_visible(), f'{name}: Sky Mode HUD stuck after landing'
        assert not problems, f'{name}: {sorted(set(problems))[:6]}'
        assert not errors, f'{name}: JavaScript exceptions {errors}'
        out[name] = {'skyHud': {k: round(v) for k, v in sky.items()}, 'markerSamples': samples, 'level': page.locator('#levelNum').inner_text()}
        ctx.close()
    browser.close()
print(json.dumps({'status': 'PASS', 'views': out}, indent=1))
