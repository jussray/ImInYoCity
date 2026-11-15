"""Browser smoke tests: run python3 tests/playtest.py from repo root.
Requires Playwright Python and an installed Chromium browser. Read-only to source.
"""
from __future__ import annotations
import http.server
import json
import os
from pathlib import Path
import socketserver
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CAPTURES = ROOT / 'test-artifacts'
CAPTURES.mkdir(exist_ok=True)

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

class ReuseServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True

def main():
    os.chdir(ROOT)
    with ReuseServer(('127.0.0.1', 0), QuietHandler) as server:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        url = f'http://127.0.0.1:{server.server_address[1]}/'
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'])
            for device, viewport, is_mobile in [('desktop', {'width': 1360, 'height': 800}, False), ('mobile', {'width': 390, 'height': 844}, True)]:
                page = browser.new_page(viewport=viewport, has_touch=is_mobile, device_scale_factor=1)
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(url, wait_until='networkidle')
                page.wait_for_timeout(600)
                before = page.evaluate('window.__iminyocity()')
                assert before['renderer'] == 'WebGL', f'{device}: {before}'
                page.screenshot(path=str(CAPTURES / f'{device}-intro.png'))
                page.get_by_role('button', name='ENTER PHILLY').click()
                assert page.locator('#hud').is_visible(), f'{device}: HUD missing'
                assert page.locator('#controls').is_visible(), f'{device}: controls missing'
                before = page.evaluate('window.__iminyocity()')
                if is_mobile:
                    joy = page.locator('#joystick').bounding_box()
                    sx = joy['x'] + joy['width'] / 2
                    sy = joy['y'] + joy['height'] / 2
                    page.evaluate("""({sx,sy}) => {
                      const joy = document.querySelector('#joystick');
                      joy.dispatchEvent(new PointerEvent('pointerdown',{pointerId:21,clientX:sx,clientY:sy,bubbles:true}));
                      joy.dispatchEvent(new PointerEvent('pointermove',{pointerId:21,clientX:sx,clientY:sy-42,bubbles:true}));
                    }""", {'sx': sx, 'sy': sy})
                    page.wait_for_timeout(420)
                    page.evaluate("""({sx,sy})=>{
                      document.querySelector('#joystick').dispatchEvent(new PointerEvent('pointerup',{pointerId:21,clientX:sx,clientY:sy-42,bubbles:true}));
                    }""", {'sx': sx, 'sy': sy})
                else:
                    page.keyboard.down('w')
                    page.wait_for_timeout(480)
                    page.keyboard.up('w')
                after = page.evaluate('window.__iminyocity()')
                assert after['running'], f'{device}: game did not start'
                assert (after['x'],after['z']) != (before['x'],before['z']), f'{device}: movement broken {before} {after}'
                assert not errors, f'{device}: browser errors {errors}'
                page.screenshot(path=str(CAPTURES / f'{device}-gameplay.png'))
                print(json.dumps({'device':device,'before':before,'after':after,'browserErrors':errors,'screenshot':str(CAPTURES / f'{device}-gameplay.png')}))
                page.close()
            browser.close()
        server.shutdown()

if __name__ == '__main__':
    main()
