#!/usr/bin/env python3
"""Verify the packaged Capacitor APK on an emulator or explicitly selected phone.

Default: CI Android emulator. Pass --physical --apk PATH on a connected Android
phone to exercise the same WebView touch path and capture LOCAL evidence.
Injected WebView events do not prove human-touch feel or Google Play readiness.
"""
import argparse
import hashlib
import json
import re
import subprocess
import time
import traceback
import urllib.request
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageStat
from websocket import create_connection

ART = Path("artifacts/android-emulator")
PACKAGE = "company.jussco.iminyocity"
ADB_SERIAL = None
options = argparse.Namespace(physical=False, apk=None, serial=None)
report = {"environment": "Android API 35 emulator, Capacitor debug APK",
          "physicalDevice": False, "checks": {}}


def configure_cli():
    global ART, options
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--physical", action="store_true",
                        help="Require a real Android phone; reject all emulators")
    parser.add_argument("--apk", type=Path, help="Path to the debug APK on this computer")
    parser.add_argument("--serial", help="ADB serial to select; never written to the report")
    options = parser.parse_args()
    if options.physical and not options.apk:
        parser.error("--physical requires --apk /path/to/app-debug.apk")
    if options.apk and not options.physical:
        parser.error("--apk is only supported with --physical")
    ART = Path("artifacts/android-phone" if options.physical else "artifacts/android-emulator")
    ART.mkdir(parents=True, exist_ok=True)


def adb(*args, timeout=60, binary=False, check=True):
    command = ["adb"] + (["-s", ADB_SERIAL] if ADB_SERIAL else []) + list(map(str, args))
    result = subprocess.run(command, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=timeout)
    if check and result.returncode:
        raise RuntimeError(f"adb {' '.join(map(str, args))}: "
                           f"{result.stderr.decode(errors='replace')[-900:]}")
    return result.stdout if binary else result.stdout.decode(errors="replace").strip()


def select_device():
    """Choose exactly one authorized ADB device and reject emulators in phone mode."""
    global ADB_SERIAL
    connected = subprocess.run(["adb", "devices"], stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, timeout=15, check=True)
    devices = []
    for line in connected.stdout.decode(errors="replace").splitlines()[1:]:
        fields = line.split()
        if len(fields) >= 2 and fields[1] == "device":
            devices.append(fields[0])
    if options.serial:
        if options.serial not in devices:
            raise AssertionError("Selected ADB device is not connected and authorized")
        ADB_SERIAL = options.serial
    elif len(devices) == 1:
        ADB_SERIAL = devices[0]
    else:
        raise AssertionError("Connect exactly one authorized ADB device or pass --serial")

    if not options.physical:
        return
    qemu = (adb("shell", "getprop", "ro.kernel.qemu", check=False).strip().lower(),
            adb("shell", "getprop", "ro.boot.qemu", check=False).strip().lower())
    hardware = adb("shell", "getprop", "ro.hardware", check=False).lower()
    fingerprint = adb("shell", "getprop", "ro.build.fingerprint", check=False).lower()
    if (any(value in ("1", "true", "yes") for value in qemu) or
            any(marker in hardware for marker in ("ranchu", "goldfish", "qemu")) or
            any(marker in fingerprint for marker in ("generic", "emulator", "sdk_gphone"))):
        raise AssertionError("Physical phone required: emulator detected; no phone proof recorded")
    if not hardware.strip() or not fingerprint.strip():
        raise AssertionError("Cannot establish physical device identity from Android properties")
    report["physicalDevice"] = True
    report["environment"] = "ADB-connected physical Android device; debug APK/WebView"
    report["device"] = {
        "model": adb("shell", "getprop", "ro.product.model", check=False),
        "androidApi": adb("shell", "getprop", "ro.build.version.sdk", check=False),
    }
    # Never include the ADB serial, raw phone logs, or identifying data in receipts.


def center_of_android_bounds(value):
    """Return button center from Android's standard [left,top][right,bottom] bounds."""
    match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", value)
    if match is None:
        raise AssertionError("Pixel Launcher Wait button has no valid bounds")
    x1, y1, x2, y2 = map(int, match.groups())
    if x2 <= x1 or y2 <= y1:
        raise AssertionError("Pixel Launcher Wait button has empty bounds")
    return (x1 + x2) // 2, (y1 + y2) // 2


def dismiss_emulator_launcher_dialog():
    """Clear only a host Pixel Launcher ANR overlay; never dismiss a game ANR.

    The hosted emulator sometimes runs a slow Pixel Launcher process that
    covers both screenshots while the game's own WebView is healthy.
    Save the recovery count in the report; do not paper over game failures.
    """
    if options.physical:
        return
    for _ in range(2):
        try:
            adb("shell", "uiautomator", "dump",
                "/sdcard/iminyocity-emulator-ui.xml", timeout=25)
            xml = adb("shell", "cat", "/sdcard/iminyocity-emulator-ui.xml", timeout=12)
            start = xml.find("<hierarchy")
            if start < 0:
                return
            nodes = list(ET.fromstring(xml[start:]).iter("node"))
        except (RuntimeError, TimeoutError, ET.ParseError, ValueError):
            return
        labels = [node.attrib.get("text", "") or node.attrib.get("content-desc", "")
                  for node in nodes]
        if not any("Pixel Launcher" in text and "responding" in text
                   for text in labels):
            if any("isn't responding" in text for text in labels):
                raise AssertionError("Android ANR dialog is not from Pixel Launcher")
            return
        wait = next((node for node in nodes
                     if node.attrib.get("text") == "Wait"), None)
        if wait is None:
            raise AssertionError("Pixel Launcher ANR has no safe Wait action")
        x, y = center_of_android_bounds(wait.attrib.get("bounds", ""))
        adb("shell", "input", "tap", x, y)
        report["checks"]["hostLauncherWaitActions"] = (
            report["checks"].get("hostLauncherWaitActions", 0) + 1)
        time.sleep(1)


def screenshot(name):
    if not options.physical:
        dismiss_emulator_launcher_dialog()
    path = ART / f"{name}.png"
    raw = adb("exec-out", "screencap", "-p", binary=True, timeout=30)
    if len(raw) < 1500 or not raw.startswith(b"\x89PNG"):
        raise AssertionError(f"Invalid Android screenshot: {name}")
    path.write_bytes(raw)
    with Image.open(path) as image:
        stats = ImageStat.Stat(image.convert("RGB"))
        contrast = sum(stats.stddev) / 3
    if contrast < 5:
        raise AssertionError(f"Android view was nearly blank: {name}, contrast={contrast:.1f}")
    report["checks"][f"screenshot_{name}"] = round(contrast, 2)


class DevTools:
    def __init__(self, url):
        self.ws = create_connection(url, timeout=20, suppress_origin=True)
        self.serial = 0
        self.events = []

    def call(self, method, params=None):
        self.serial += 1
        ident = self.serial
        self.ws.send(json.dumps({"id": ident, "method": method, "params": params or {}}))
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            response = json.loads(self.ws.recv())
            if response.get("id") != ident:
                if response.get("method") in (
                    "Runtime.exceptionThrown", "Runtime.consoleAPICalled",
                    "Log.entryAdded",
                ):
                    self.events.append(response)
                    self.events = self.events[-40:]
                continue
            if "error" in response:
                raise RuntimeError(f"DevTools {method}: {response['error']}")
            return response.get("result", {})
        raise TimeoutError(f"DevTools method timed out: {method}")

    def evaluate(self, expression):
        result = self.call("Runtime.evaluate",
                           {"expression": expression, "returnByValue": True,
                            "awaitPromise": True})
        if "exceptionDetails" in result:
            raise RuntimeError(f"WebView JS exception: {result['exceptionDetails']}")
        return result.get("result", {}).get("value")

    def rect(self, selector):
        expression = f"""(() => {{
          const e=document.querySelector({json.dumps(selector)});
          if (!e || getComputedStyle(e).display === 'none') return null;
          const r=e.getBoundingClientRect();
          return {{x:r.x,y:r.y,width:r.width,height:r.height}};
        }})()"""
        r = self.evaluate(expression)
        assert r and r["width"] > 10 and r["height"] > 10, f"Hidden control: {selector}"
        return r

    def touch(self, action, points):
        self.call("Input.dispatchTouchEvent",
                  {"type": action, "touchPoints":
                   [{"x": round(x), "y": round(y), "id": i,
                     "radiusX": 2, "radiusY": 2, "force": 1}
                    for x, y, i in points]})

    def tap(self, selector):
        r = self.rect(selector)
        cx, cy = r["x"] + r["width"] / 2, r["y"] + r["height"] / 2
        self.touch("touchStart", [(cx, cy, 1)])
        self.touch("touchEnd", [])

    def close(self):
        self.ws.close()


def game_webview_sockets(unix_sockets, package_pids):
    """Accept only WebView DevTools sockets owned by the launched game process."""
    pids = {pid for pid in package_pids.split() if pid.isdecimal()}
    available = set(re.findall(r"@?(webview_devtools_remote_\d+)", unix_sockets))
    return [f"webview_devtools_remote_{pid}" for pid in sorted(pids)
            if f"webview_devtools_remote_{pid}" in available]


def is_game_webview_page(page):
    """Only inspect our Capacitor HTTPS localhost page, never another app."""
    if page.get("type") != "page" or not page.get("webSocketDebuggerUrl"):
        return False
    try:
        location = urlsplit(page.get("url", ""))
        return location.scheme == "https" and location.hostname == "localhost"
    except ValueError:
        return False


def connect_webview():
    until = time.monotonic() + 90
    last_error = ""
    while time.monotonic() < until:
        try:
            package_pids = adb("shell", "pidof", PACKAGE, timeout=10, check=False)
            sockets = adb("shell", "cat", "/proc/net/unix", timeout=10)
            for socket_name in game_webview_sockets(sockets, package_pids):
                adb("forward", "tcp:9222", f"localabstract:{socket_name}", timeout=10)
                with urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5) as response:
                    pages = json.load(response)
                for page in pages:
                    if is_game_webview_page(page):
                        url = page["webSocketDebuggerUrl"]
                        return DevTools(re.sub(r"^ws://[^/]+", "ws://127.0.0.1:9222", url))
            last_error = "No Capacitor WebView belonging to game process yet"
        except Exception as exc:
            last_error = str(exc)
        time.sleep(2)
    raise AssertionError(f"No Android game WebView DevTools target after app launch: {last_error}")


def until(condition, timeout=20, description="condition"):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            result = condition()
            if result:
                return result
        except Exception:
            pass
        time.sleep(.4)
    raise AssertionError(f"Timed out waiting for {description}")


def gameplay(client):
    state = lambda: client.evaluate(
        "window.__imInYoCityDebug && window.__imInYoCityDebug()")
    client.call("Runtime.enable")
    client.call("Log.enable")
    try:
        initial = until(lambda: (s if (s := state()) and s["frames"] > 4 else None),
                        timeout=45, description="running JavaScript game loop")
    except AssertionError as exc:
        diagnostics = client.evaluate("""(() => {
          const fatal = document.querySelector('#fatal');
          const probe = document.createElement('canvas');
          let webgl = null;
          try {
            const gl = probe.getContext('webgl2') || probe.getContext('webgl');
            if (gl) webgl = {
              version: gl.getParameter(gl.VERSION),
              renderer: gl.getParameter(gl.RENDERER),
            };
          } catch (error) { webgl = {error: String(error)}; }
          return {
            url: location.href,
            readyState: document.readyState,
            debugHook: typeof window.__imInYoCityDebug,
            debugState: window.__imInYoCityDebug?.() ?? null,
            fatalDisplay: fatal ? getComputedStyle(fatal).display : 'missing',
            fatalText: fatal?.textContent ?? '',
            canvas: (() => {
              const e = document.querySelector('#game');
              return e ? {width:e.width,height:e.height,connected:e.isConnected} : null;
            })(),
            webglProbe: webgl,
            scripts: [...document.scripts].map(s => ({type:s.type,src:s.src})),
            gameResources: performance.getEntriesByType('resource')
              .map(e => e.name).filter(n => n.includes('game.js')).slice(-5),
          };
        })()""")
        report["checks"]["bootDiagnostics"] = diagnostics
        report["checks"]["devtoolsEvents"] = client.events
        try:
            screenshot("boot-failure")
        except Exception as screenshot_error:
            report["checks"]["failureScreenshotError"] = str(screenshot_error)
        raise AssertionError(
            f"Android game loop did not start; diagnostics={diagnostics}; "
            f"DevTools events={client.events[-12:]}"
        ) from exc
    assert initial["webgl"] is True, (
        f"Android gameplay proof requires the 3D WebGL renderer; got {initial}"
    )
    assert initial["started"] is False, "Game skipped title"
    assert client.evaluate("getComputedStyle(document.querySelector('#fatal')).display") == "none", "Fatal graphics overlay"
    report["checks"]["renderer"] = ("webgl" if initial["webgl"] else "fallback")
    if options.physical:
        assert initial["webgl"], "Physical phone must run actual WebGL; 2D fallback is not a GPU pass"
        info = client.evaluate("""(() => {
          const canvas = document.querySelector('#game');
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
          if (!gl) return null;
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          return {webglVersion: gl.getParameter(gl.VERSION),
                  renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)};
        })()""")
        assert info and info["webglVersion"], "WebGL context not inspectable on phone"
        report["checks"]["webglContext"] = info
    report["checks"]["title"] = True
    screenshot("title")

    client.tap("#playMuted")
    until(lambda: state() and state()["started"], description="touch-to-play")
    until(lambda: client.evaluate(
        "getComputedStyle(document.querySelector('#titlecover')).display") == "none",
        description="title overlay disappeared")
    initial_frames = state()["frames"]
    until(lambda: state()["frames"] >= initial_frames + 8,
          description="rendered gameplay frames")
    time.sleep(.5)
    screenshot("gameplay")
    # A screenshot taken before Android commits the new WebView frame can look
    # like the title even though JavaScript reports that the game has started.
    from PIL import ImageChops
    with Image.open(ART / "title.png").convert("RGB") as title, \
         Image.open(ART / "gameplay.png").convert("RGB") as gameplay_image:
        difference = ImageChops.difference(title, gameplay_image)
        changed = sum(ImageStat.Stat(difference).mean) / 3
    assert changed > 12, f"Gameplay screenshot remained on title view: {changed:.1f}"
    report["checks"]["gameplayVisualDifference"] = round(changed, 2)
    report["checks"]["touchPlay"] = True

    client.tap("#talkButton")
    until(lambda: state()["stage"] == 1, description="first mission interaction")
    report["checks"]["mission"] = 1

    start = state()
    joy = client.rect("#joy-ring")
    x, y = joy["x"] + joy["width"] / 2, joy["y"] + joy["height"] / 2
    client.touch("touchStart", [(x, y, 11)])
    client.touch("touchMove", [(x + joy["width"] * .33, y, 11)])
    time.sleep(1.25)
    moving = state()
    client.touch("touchEnd", [])
    released = until(lambda: (s if (s := state()) and abs(s["inputX"]) < .01 else None),
                     description="joystick release")
    assert moving["inputX"] > .5 and moving["x"] > start["x"] + .5, (
        f"Real Android touch joystick did not move avatar: {start} -> {moving}")
    assert moving["gait"] > .3, "Walking animation did not respond to Android touch"
    report["checks"]["joystickDeltaX"] = round(moving["x"] - start["x"], 3)
    assert released["sprinting"] is False, "Sprint stuck after releasing touch"

    before = state()["cameraYaw"]
    look = client.rect("#lookArea")
    lx, ly = look["x"] + look["width"] / 2, look["y"] + look["height"] / 2
    client.touch("touchStart", [(lx, ly, 12)])
    client.touch("touchMove", [(lx + 60, ly + 25, 12)])
    turned = state()["cameraYaw"]
    client.touch("touchEnd", [])
    assert abs(turned - before) > .12, f"Right-hand orbit not responding: {before} -> {turned}"
    report["checks"]["cameraYawDelta"] = round(turned - before, 3)

    client.tap("#skyButton")
    until(lambda: state()["skyMode"], description="Sky Mode button")
    report["checks"]["skyMode"] = True
    client.tap("#journalBtn")
    until(lambda: state()["paused"], description="mission journal")
    client.tap("#journalClose")
    until(lambda: not state()["paused"], description="journal close")
    report["checks"]["journal"] = True
    screenshot("controls-tested")
    assert state()["frames"] > start["frames"], "Game rendering stopped after input"
    report["checks"]["framesAdvanced"] = True
    if options.physical:
        start_frame = state()["frames"]
        sampled_at = time.monotonic()
        time.sleep(2)
        measured = max(time.monotonic() - sampled_at, .01)
        report["checks"]["jsRenderLoopTicksPerSecond"] = round(
            (state()["frames"] - start_frame) / measured, 1)
        # JS loop cadence is diagnostic, not a verified GPU frame-time measure.


def main():
    if options.physical:
        assert options.apk.is_file(), f"Android APK not found: {options.apk}"
        apk = options.apk
    else:
        packages = list(Path("emulator-package").rglob("app-debug.apk"))
        assert len(packages) == 1, f"Expected one packaged APK; found: {packages}"
        apk = packages[0]
    select_device()
    report["checks"]["apkSha256"] = hashlib.sha256(apk.read_bytes()).hexdigest()
    print("APK:", apk, flush=True)
    adb("install", "-r", apk, timeout=120)
    if not options.physical:
        adb("logcat", "-c", timeout=20)
    launched = adb("shell", "am", "start", "-W",
                   "-n", PACKAGE + "/.MainActivity", timeout=60)
    assert "Error:" not in launched, f"Android launch rejected: {launched}"
    until(lambda: adb("shell", "pidof", PACKAGE, check=False),
          timeout=40, description="Android app process")
    report["checks"]["appProcess"] = True
    client = connect_webview()
    try:
        gameplay(client)
    finally:
        client.close()
    assert adb("shell", "pidof", PACKAGE, check=False), "Game process crashed"
    print("Android device proof:", json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    configure_cli()
    try:
        main()
        report["status"] = "PASS"
    except Exception as exc:
        report["status"] = "FAIL"
        report["error"] = f"{type(exc).__name__}: {exc}"
        traceback.print_exc()
        raise
    finally:
        if not options.physical:
            try:
                (ART / "logcat.txt").write_text(
                    adb("logcat", "-d", "-v", "brief", "-t", "450", timeout=20),
                    encoding="utf-8")
            except Exception:
                pass
        (ART / "result.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
