#!/usr/bin/env python3
"""Real served-path proof for sw.js: index.html + <script type=module> over http://localhost.

Guards two promises of the offline cache:
1. Freshness: once the service worker controls the page, an updated game.js must reach the
   player on the next online reload (no stale build pinned forever by cache-first).
2. Offline: after the server goes away, a reload still boots the game from cache.

Local Chromium != physical Android WebView, Capacitor packaging, or production CDN headers.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
import os
import shutil
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
FILES = ['index.html', 'src/game.js', 'src/styles.css', 'assets/icon.svg', 'assets/icon-192.png',
         'assets/icon-512.png', 'manifest.webmanifest', 'sw.js']
BOOTED = 'window.__imInYoCityDebug && window.__imInYoCityDebug().frames > 3'


class NoStoreHandler(SimpleHTTPRequestHandler):
    """Isolate service-worker policy from browser HTTP-cache heuristics."""
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *args):
        pass


site = Path(tempfile.mkdtemp(prefix='iiyc-sw-'))
for rel in FILES:
    (site / rel).parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / rel, site / rel)

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(NoStoreHandler, directory=str(site)))
threading.Thread(target=server.serve_forever, daemon=True).start()
# Hostname must be "localhost": game.js only registers the worker on https: or localhost.
url = f'http://localhost:{server.server_address[1]}/'

try:
    with sync_playwright() as p:
        chromium = os.getenv('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
        launch_options = {'headless': True}
        if chromium:
            launch_options['executable_path'] = chromium
        browser = p.chromium.launch(**launch_options)
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))

        page.goto(url, wait_until='load')
        page.wait_for_function(BOOTED, timeout=10000)
        page.wait_for_function('navigator.serviceWorker.controller !== null', timeout=10000)
        scope = page.evaluate('navigator.serviceWorker.ready.then(r => r.scope)')

        # Ship an update while the worker controls the page.
        game = site / 'src/game.js'
        game.write_text(game.read_text(encoding='utf-8') + "\nwindow.__swBuildProbe='fresh';\n", encoding='utf-8')
        page.reload(wait_until='load')
        page.wait_for_function(BOOTED, timeout=10000)
        probe = page.evaluate('window.__swBuildProbe || null')
        assert page.evaluate('navigator.serviceWorker.controller !== null'), 'Worker lost control after reload'
        assert probe == 'fresh', 'Service worker served a stale game.js after an update (cache-first pin)'

        # Server gone: the cached shell must still boot the updated game.
        server.shutdown()
        server.server_close()
        page.reload(wait_until='load')
        page.wait_for_function(BOOTED, timeout=10000)
        offline_probe = page.evaluate('window.__swBuildProbe || null')
        assert offline_probe == 'fresh', 'Offline reload did not boot the last fetched build'
        assert not errors, f'JavaScript exceptions: {errors}'
        browser.close()
finally:
    try:
        server.shutdown()
        server.server_close()
    except Exception:
        pass
    shutil.rmtree(site, ignore_errors=True)

print(json.dumps({'status': 'PASS', 'source': 'served http://localhost, module script, real service worker',
                  'scope': scope, 'updatedBuildServedOnline': probe == 'fresh', 'offlineBoot': offline_probe == 'fresh',
                  'limits': 'Chromium only; Android WebView/Capacitor and production cache headers NOT verified'}, indent=2))
