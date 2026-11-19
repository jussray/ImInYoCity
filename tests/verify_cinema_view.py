#!/usr/bin/env python3
"""Cinema View proof: a film-still mode modeled on the storyboard panels.

Desktop toggles with C; phones use the CINEMA button. In Cinema View the HUD and objective
marker are hidden, letterbox bars show, the camera drops to a low hero angle, the city keeps
running, and an Exit control stays visible and clear of the bars. Leaving restores the HUD and
the normal chase camera. Emulated Chromium viewports only.
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
VIEWS = [('desktop', {'width': 1280, 'height': 720}, False),
         ('phone-portrait', {'width': 390, 'height': 844}, True),
         ('phone-landscape', {'width': 844, 'height': 390}, True)]


def visible(page, sel):
    el = page.locator(sel)
    return el.count() > 0 and el.first.is_visible()


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
        page.evaluate('player.x=0;player.z=30;cameraYaw=0;camPos=null')
        page.wait_for_timeout(600)
        normal = page.evaluate(D)
        assert normal['cinema'] is False and visible(page, '#cinemaBtn'), f'{name}: no Cinema View entry point'
        # Enter
        if touch:
            page.locator('#cinemaBtn').click()
        else:
            page.keyboard.press('c')
        page.wait_for_function(D + '.cinema === true', timeout=3000)
        page.wait_for_timeout(1200)  # camera eases into the cinema angle
        cine = page.evaluate(D)
        r = {'normalEyeY': round(normal['camPos'][1], 2), 'cinemaEyeY': round(cine['camPos'][1], 2)}
        hidden_ok = [s for s in ['.hud-tools', '#chapter', '#marker', '#controls', '#mini-wrap'] if visible(page, s)]
        assert not hidden_ok, f'{name}: HUD still visible in Cinema View: {hidden_ok}'
        bars = [page.locator(s).bounding_box() for s in ['#letterboxTop', '#letterboxBottom']]
        assert all(b and b['height'] >= vp['height'] * .06 for b in bars), f'{name}: letterbox bars missing {bars}'
        assert visible(page, '#cinemaExit'), f'{name}: no visible Exit control'
        ex = page.locator('#cinemaExit').bounding_box()
        assert ex['x'] >= 0 and ex['y'] >= 0 and ex['x'] + ex['width'] <= vp['width'] and ex['y'] + ex['height'] <= vp['height'], (name, ex)
        assert r['cinemaEyeY'] < r['normalEyeY'] - .5, f'{name}: camera did not drop to a low hero angle {r}'
        f0 = page.evaluate(D + '.frames'); page.wait_for_timeout(300)
        assert page.evaluate(D + '.frames') > f0, f'{name}: game froze in Cinema View'
        page.screenshot(path=str(ART / f'cinema-{name}.png'))
        # Exit
        page.locator('#cinemaExit').click()
        page.wait_for_function(D + '.cinema === false', timeout=3000)
        page.wait_for_timeout(1200)
        back = page.evaluate(D)
        assert visible(page, '.hud-tools') and visible(page, '#chapter'), f'{name}: HUD not restored'
        assert not visible(page, '#letterboxTop'), f'{name}: letterbox stuck after exit'
        assert abs(back['camPos'][1] - normal['camPos'][1]) < .6, f'{name}: chase camera not restored {back["camPos"]} vs {normal["camPos"]}'
        if not touch:
            page.keyboard.press('c'); page.wait_for_function(D + '.cinema === true')
            page.keyboard.press('Escape'); page.wait_for_function(D + '.cinema === false')
        assert not errors, f'{name}: JavaScript exceptions {errors}'
        out[name] = r
        ctx.close()
    browser.close()
print(json.dumps({'status': 'PASS', 'views': out}, indent=1))
