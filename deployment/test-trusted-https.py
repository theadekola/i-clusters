import argparse
import importlib.util
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("trusted_https", Path(__file__).with_name("trusted-https.py"))
tls = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tls)


class TrustedHTTPSTests(unittest.TestCase):
    def test_hostnames_are_validated_before_use_in_caddyfile(self):
        self.assertEqual(tls.hostname("Cloud.My-Org.NET"), "cloud.my-org.net")
        for bad in ["domain", "192.168.1.1", "my.internal", "a.home.arpa", "*.zone.com", "-a.com", "abc..com",
                    "bad.com/path", "test.com:443", "a.com\nimport secret", "foo." + "a" * 64 + ".org"]:
            with self.subTest(bad=bad), self.assertRaises(argparse.ArgumentTypeError):
                tls.hostname(bad)

    def test_config_token_isolation_rotation_and_rollback(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            first = "cfut_" + "A" * 40
            second = "cfat_" + "B" * 40
            host = "controller.example.org"
            with patch.object(tls.subprocess, "run") as reload:
                tls.configure(directory, host, first)
                reload.assert_called_once_with(tls.RELOAD, check=True, timeout=30)
                tls.configure(directory, "other.example.org", second)
            site = directory / host / "browser.caddy"
            credential, = site.parent.glob("cf-token-*")
            self.assertEqual(credential.read_text(), first)
            self.assertEqual(stat.S_IMODE(credential.stat().st_mode), 0o600)
            old = site.read_text()
            self.assertNotIn(first, old)
            self.assertIn(f"{{file.{tls.MOUNT}/{host}/{credential.name}}}", old)
            self.assertIn("import controller", old)
            with patch.object(tls.subprocess, "run", side_effect=[subprocess.CalledProcessError(1, "reload"), None]):
                with self.assertRaises(subprocess.CalledProcessError):
                    tls.configure(directory, host, second)
            self.assertEqual(site.read_text(), old)
            self.assertEqual(list(site.parent.glob("cf-token-*")), [credential])
            with patch.object(tls.subprocess, "run"):
                tls.configure(directory, host, second)
            self.assertFalse(credential.exists())
            new, = site.parent.glob("cf-token-*")
            self.assertEqual(new.read_text(), second)
            self.assertTrue((directory / "other.example.org" / "browser.caddy").exists())
            with self.assertRaises(ValueError):
                tls.configure(directory, host, "malformed")
            self.assertEqual(new.read_text(), second)

    def test_verification_requires_a_verified_https_response_and_healthy_api(self):
        for code, body, expected in [(60, b"", False), (0, b"<html>Proxy login</html>", False),
                                     (0, b'{"ok":false}', False), (0, b'{"ok":true}', True)]:
            with self.subTest(code=code, body=body):
                result = subprocess.CompletedProcess([], code, stdout=body)
                with patch.object(tls.subprocess, "run", return_value=result) as curl:
                    self.assertEqual(tls.verify("controller.example.org", 6002, 0), expected)
                args = curl.call_args.args[0]
                self.assertIn("controller.example.org:6002:127.0.0.1", args)
                self.assertIn("https://controller.example.org:6002/api/health", args)
                self.assertNotIn("--insecure", args)
                self.assertNotIn("-k", args)


if __name__ == "__main__":
    unittest.main()
