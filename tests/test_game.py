"""Browser QA for the real 3D canvas and touchscreen controls.

Run from repository root: python3 tests/test_game.py
"""
import contextlib
import http.server
import os
import pathlib
import socketserver
import threading
from playwright.sync_api import sync_playwright, Error as PlaywrightError

ROOT = pathlib.Path(__file__).resolve().parent.parent
ART = ROOT / 'artifacts'
ART.mkdir(exist_ok=True)

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

@contextlib.contextmanager
def webserver():
    class S(socketserver.TCPServer):
        allow_reuse_address = True
    os.chdir(ROOT)
    with S(('127.0.0.1', 0), QuietHandler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f'http://127.0.0.1:{server.server_address[1]}'
        finally:
            server.shutdown()
            thread.join()

def load_page(page, url):
    if os.environ.get('GAME_TEST_INLINE') == '1':
        # Exact repository HTML/JS executed in the browser without navigation,
        # for locked-down runners that deny localhost. Not proof of HTTP serving.
        html = (ROOT / 'index.html').read_text().replace(
            '<script type="module" src="./src/game.js"></script>', '')
        page.set_content(html, wait_until='load')
        page.add_script_tag(content=(ROOT / 'src/game.js').read_text())
    else:
        page.goto(url, wait_until='load')

def run():
    with webserver() as url, sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'])
        errors=[]
        desktop=browser.new_page(viewport={'width':1280,'height':800}, device_scale_factor=1)
        desktop.on('pageerror',lambda e:errors.append(str(e)))
        load_page(desktop,url)
        desktop.get_by_role('button',name='ENTER PHILLY').click()
        desktop.wait_for_function('window.__gameDebug && window.__gameDebug().frames > 12')
        state=desktop.evaluate('window.__gameDebug()')
        assert state['started'] and state['objects'] > 150, state
        before=(state['x'],state['z'])
        desktop.keyboard.down('w')
        desktop.wait_for_timeout(700)
        desktop.keyboard.up('w')
        state=desktop.evaluate('window.__gameDebug()')
        assert state['z'] < before[1]-1, ('keyboard movement failed',state,before)
        desktop.screenshot(path=str(ART/'desktop-gameplay.png'),full_page=True)
        # Follow the actual game camera and walking corridor to interact with the mural.
        desktop.keyboard.down('w')
        desktop.wait_for_timeout(2850)
        desktop.keyboard.up('w')
        desktop.keyboard.down('a')
        desktop.wait_for_timeout(1400)
        desktop.keyboard.up('a')
        state=desktop.evaluate('window.__gameDebug()')
        assert state['z'] < -7 and state['x'] < -5, state
        desktop.keyboard.press('e')
        assert desktop.evaluate('window.__gameDebug().quest') == 1,desktop.evaluate('window.__gameDebug()')
        desktop.screenshot(path=str(ART/'desktop-first-mission.png'),full_page=True)
        assert not errors,errors
        mobile=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
        mobile.on('pageerror',lambda e:errors.append(str(e)))
        load_page(mobile,url)
        mobile.get_by_role('button',name='ENTER PHILLY').click()
        mobile.wait_for_function('window.__gameDebug && window.__gameDebug().frames > 12')
        start=mobile.evaluate('window.__gameDebug()')
        box=mobile.locator('#joystick').bounding_box()
        assert box and box['width']>30,'joystick hidden on mobile'
        x=box['x']+box['width']/2;y=box['y']+box['height']/2
        # Touch joystick using a real touchscreen pointer path (CDP dispatch).
        cdp=mobile.context.new_cdp_session(mobile)
        cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y-30,'id':1}]})
        mobile.wait_for_timeout(800)
        cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        end=mobile.evaluate('window.__gameDebug()')
        assert end['z'] < start['z']-1, ('touch joystick failed',start,end)
        mobile.screenshot(path=str(ART/'mobile-gameplay.png'),full_page=True)
        assert not errors,errors
        browser.close()
        print(f'PASS: actual game code ran; keyboard, mural mission, touch joystick, screenshots, no errors; WebGL2={state["webgl"]} (GPU unverified if false)')

if __name__=='__main__':
    run()