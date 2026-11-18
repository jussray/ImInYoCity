#!/usr/bin/env python3
"""Exercise the packaged Capacitor debug APK inside an Android emulator.

This test uses ADB for installation/screenshots and DevTools connected to the
running Android WebView for real touch input and gameplay state inspection.
It does not test a physical phone, release signing, or Play Store readiness.
"""
import json
import re
import subprocess
import time
import traceback
import urllib.request
from pathlib import Path

from PIL import Image, ImageStat
from websocket import create_connection

ART = Path("artifacts/android-emulator")
ART.mkdir(parents=True, exist_ok=True)
PACKAGE = "company.jussco.iminyocity"
report = {"environment": "Android API 35 emulator, Capacitor debug APK",
          "physicalDevice": False, "checks": {}}


def adb(*args, timeout=60, binary=False, check=True):
    result = subprocess.run(["adb", *map(str, args)], stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=timeout)
    if check and result.returncode:
        raise RuntimeError(f"adb {' '.join(map(str, args))}: "
                           f"{result.stderr.decode(errors='replace')[-900:]}")
    return result.stdout if binary else result.stdout.decode(errors="replace").strip()


def screenshot(name):
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

    def call(self, method, params=None):
        self.serial += 1
        ident = self.serial
        self.ws.send(json.dumps({"id": ident, "method": method, "params": params or {}}))
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            response = json.loads(self.ws.recv())
            if response.get("id") != ident:
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


def connect_webview():
    until = time.monotonic() + 90
    last_error = ""
    while time.monotonic() < until:
        try:
            sockets = adb("shell", "cat", "/proc/net/unix", timeout=10)
            matches = re.findall(r"@?(webview_devtools_remote_\d+)", sockets)
            for socket_name in dict.fromkeys(matches):
                adb("forward", "tcp:9222", f"localabstract:{socket_name}", timeout=10)
                with urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5) as response:
                    pages = json.load(response)
                for page in pages:
                    url = page.get("webSocketDebuggerUrl", "")
                    if page.get("type") == "page" and url:
                        return DevTools(re.sub(r"^ws://[^/]+", "ws://127.0.0.1:9222", url))
            last_error = "No debuggable WebView page yet"
        except Exception as exc:
            last_error = str(exc)
        time.sleep(2)
    raise AssertionError(f"No Android WebView DevTools target after app launch: {last_error}")


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
    initial = until(lambda: (s if (s := state()) and s["frames"] > 4 else None),
                    timeout=35, description="running JavaScript game loop")
    assert initial["webgl"] or initial["fallback"], f"No renderer: {initial}"
    assert initial["started"] is False, "Game skipped title"
    assert client.evaluate("getComputedStyle(document.querySelector('#fatal')).display") == "none", "Fatal graphics overlay"
    report["checks"]["renderer"] = ("webgl" if initial["webgl"] else "fallback")
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


def main():
    apk = list(Path("emulator-package").rglob("app-debug.apk"))
    assert len(apk) == 1, f"Expected one packaged APK; found: {apk}"
    print("APK:", apk[0], flush=True)
    adb("install", "-r", apk[0], timeout=120)
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
    print("Android emulator proof:", json.dumps(report, indent=2), flush=True)


try:
    main()
    report["status"] = "PASS"
except Exception as exc:
    report["status"] = "FAIL"
    report["error"] = f"{type(exc).__name__}: {exc}"
    traceback.print_exc()
    raise
finally:
    try:
        (ART / "logcat.txt").write_text(
            adb("logcat", "-d", "-v", "brief", "-t", "450", timeout=20),
            encoding="utf-8")
    except Exception:
        pass
    (ART / "result.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
