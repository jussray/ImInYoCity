#!/usr/bin/env python3
"""Regression gate: a virtual Android cannot be reported as a physical phone."""
import argparse
import importlib.util
import pathlib
import types
import unittest
from unittest.mock import patch

path = pathlib.Path(__file__).with_name("verify_android_emulator.py")
spec = importlib.util.spec_from_file_location("iminyocity_android_runner", path)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class PhoneIdentityGate(unittest.TestCase):
    def setUp(self):
        self.previous_options = runner.options
        self.previous_serial = runner.ADB_SERIAL
        self.previous_report = dict(runner.report)
        runner.options = argparse.Namespace(physical=True, apk=path, serial=None)
        runner.ADB_SERIAL = None
        runner.report["physicalDevice"] = False

    def tearDown(self):
        runner.options = self.previous_options
        runner.ADB_SERIAL = self.previous_serial
        runner.report.clear()
        runner.report.update(self.previous_report)

    def select(self, listing, properties):
        device_list = types.SimpleNamespace(stdout=listing.encode())
        def fake_adb(*args, **kwargs):
            key = args[-1] if args and args[0] == "shell" else ""
            return properties.get(key, "")
        with patch.object(runner.subprocess, "run", return_value=device_list), \
             patch.object(runner, "adb", side_effect=fake_adb):
            runner.select_device()

    def test_launcher_wait_bounds(self):
        self.assertEqual(runner.center_of_android_bounds("[100,700][500,900]"),
                         (300, 800))
        with self.assertRaisesRegex(AssertionError, "bounds"):
            runner.center_of_android_bounds("not-bounds")

    def test_emulator_must_fail(self):
        props = {"ro.kernel.qemu": "1", "ro.boot.qemu": "0",
                 "ro.hardware": "ranchu", "ro.build.fingerprint": "google/sdk_gphone64",
                 "ro.product.model": "Pixel", "ro.build.version.sdk": "35"}
        with self.assertRaisesRegex(AssertionError, "emulator detected"):
            self.select("List of devices attached\nemulator-5554\tdevice\n", props)
        self.assertFalse(runner.report["physicalDevice"])

    def test_ambiguous_device_must_fail(self):
        with self.assertRaisesRegex(AssertionError, "exactly one"):
            self.select("List of devices attached\nA\tdevice\nB\tdevice\n", {})

    def test_physical_phone_is_flagged_only_after_checks(self):
        props = {"ro.kernel.qemu": "0", "ro.boot.qemu": "0",
                 "ro.hardware": "qcom", "ro.build.fingerprint": "google/raven/raven:16",
                 "ro.product.model": "Pixel 6 Pro", "ro.build.version.sdk": "36"}
        self.select("List of devices attached\nPHONE123\tdevice\n", props)
        self.assertTrue(runner.report["physicalDevice"])
        self.assertNotIn("PHONE123", str(runner.report))
        self.assertEqual(runner.report["device"]["androidApi"], "36")


if __name__ == "__main__":
    unittest.main()
