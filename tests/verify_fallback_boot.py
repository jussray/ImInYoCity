#!/usr/bin/env python3
"""Graphics-failure boot proof: the game must stay playable when WebGL is missing or breaks mid-init.

Cases (forced in real Chromium via init scripts before game code runs):
- normal: WebGL works -> 3D path.
- no_webgl: getContext('webgl') returns null -> 2D fallback.
- shader_fails: WebGL context is created but shader compile fails (old/buggy GPU drivers);
  the canvas is already bound to WebGL, so the fallback needs a fresh canvas.
Each case must reach the title without the fatal screen, start, talk to Nova, and keep
desktop mouse-look bound to the live canvas. Emulated Chromium, not an Android GPU.
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

CASES = {
    'normal': ('', 'webgl'),
    'no_webgl': ("const g=HTMLCanvasElement.prototype.getContext;"
                 "HTMLCanvasElement.prototype.getContext=function(t,...r){return /webgl/.test(t)?null:g.call(this,t,...r)};", 'fallback'),
    'shader_fails': ("WebGLRenderingContext.prototype.getShaderParameter=function(){return false};", 'fallback'),
}
D = 'window.__imInYoCityDebug()'
results = {}
with sync_playwright() as p:
    chromium = os.getenv('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
    launch_options = {'headless': True}
    if chromium:
        launch_options['executable_path'] = chromium
    browser = p.chromium.launch(**launch_options)
    for name, (init, expected) in CASES.items():
        page = browser.new_page(viewport={'width': 1280, 'height': 720})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        if init:
            page.add_init_script(init)
        # A real navigation (not set_content) so init scripts run before the game script.
        page.route('http://game.test/**', lambda route: route.fulfill(status=200, content_type='text/html', body=page_html))
        page.goto('http://game.test/')
        page.wait_for_function('window.__imInYoCityDebug && ' + D + '.frames > 3', timeout=10000)
        r = {'renderer': 'webgl' if page.evaluate(D + '.webgl') else 'fallback' if page.evaluate(D + '.fallback') else 'none',
             'fatalVisible': page.evaluate("!document.getElementById('fatal').classList.contains('hidden')"),
             'playEnabled': not page.evaluate("document.getElementById('playMuted').disabled")}
        assert r['renderer'] == expected, (name, r)
        assert not r['fatalVisible'] and r['playEnabled'], f'{name}: dead-end fatal screen {r}'
        page.locator('#playMuted').click()
        page.wait_for_function(D + '.started', timeout=5000)
        page.keyboard.press('e')
        r['stageAfterNova'] = page.evaluate(D + '.stage')
        assert r['stageAfterNova'] == 1, (name, r)
        # Desktop mouse-look must be bound to the canvas that is actually on screen.
        yaw0 = page.evaluate(D + '.cameraYaw')
        page.mouse.move(640, 360); page.mouse.down(); page.mouse.move(760, 360, steps=6); page.mouse.up()
        r['mouseLookTurned'] = abs(page.evaluate(D + '.cameraYaw') - yaw0) > .2
        assert r['mouseLookTurned'], f'{name}: mouse-look not bound to the live canvas'
        f0 = page.evaluate(D + '.frames'); page.wait_for_timeout(300)
        r['framesAdvancing'] = page.evaluate(D + '.frames') > f0
        assert r['framesAdvancing'], (name, r)
        r['canvases'] = page.evaluate("document.querySelectorAll('canvas#game').length")
        assert r['canvases'] == 1, (name, r)
        assert not errors, f'{name}: JavaScript exceptions {errors}'
        results[name] = r
        page.close()
    browser.close()
print(json.dumps({'status': 'PASS', 'cases': results,
                  'limits': 'Forced failures in Chromium; real Android GPU drivers NOT verified'}, indent=1))
