import argparse
import importlib.util
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import patch, mock_open
from browser_origin import dashboard_origin, remember_hostname

spec = importlib.util.spec_from_file_location("trusted_https", Path(__file__).with_name("trusted-https.py"))
tls = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tls)


class TrustedHTTPSTests(unittest.TestCase):
    def test_setup_selects_hostname_only_after_success_and_check_is_read_only(self):
        for success, check in [(False, False), (True, False), (True, True)]:
            args = ['trusted-https.py', 'dashboard.example.org']
            args += ['--check'] if check else ['--token-file', '/private/token']
            with self.subTest(success=success, check=check), \
                    patch.object(tls.sys, 'argv', args), \
                    patch.object(tls.Path, 'read_text', return_value='CADDY_TLS=tls internal\nHTTPS_PORT=6002\n'), \
                    patch.object(tls, 'open', mock_open(), create=True), \
                    patch.object(tls.fcntl, 'flock'), \
                    patch.object(tls, 'configure') as configure, \
                    patch.object(tls, 'verify', return_value=success), \
                    patch.object(tls, 'remember_hostname') as remember:
                self.assertEqual(tls.main(), 0 if success else 1)
                self.assertEqual(configure.call_count, 0 if check else 1)
                self.assertEqual(remember.call_count, 1 if success and not check else 0)

    def test_automatic_dns_creates_only_a_missing_dns_only_private_record(self):
        token, host, address = "A" * 40, "console.example.org", "192.168.20.104"
        zone = [{"id": "zone"}]
        matching = {"type": "A", "content": address, "proxied": False}
        for records in [[], [matching], [dict(matching, proxied=True)], [dict(matching, content="192.168.20.105")],
                        [matching, {"type": "AAAA", "content": "::1"}], [{"type": "CNAME", "content": "old.example.org"}]]:
            with self.subTest(records=records), patch.object(
                    tls, "cloudflare_request", side_effect=[[], zone, records, matching]) as api:
                if records not in ([], [matching]):
                    with self.assertRaisesRegex(ValueError, "conflicts"):
                        tls.ensure_dns_record(host, address, token)
                else:
                    tls.ensure_dns_record(host, address, token)
                self.assertEqual(api.call_count, 3 if records else 4)
                self.assertEqual(api.call_args_list[1].args[2]["name"], "example.org")
                self.assertEqual(api.call_args_list[2].args[2]["name.exact"], host)
                if not records:
                    self.assertEqual(api.call_args.kwargs["record"], {
                        "type": "A", "name": host, "content": address, "proxied": False, "ttl": 1,
                    })

    def test_automatic_dns_requires_an_rfc1918_controller_address(self):
        self.assertEqual(tls.private_lan_address("https://192.168.20.104:6002"), "192.168.20.104")
        for origin in ("", "https://127.0.0.1", "https://1.1.1.1", "https://controller.example.org"):
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                tls.private_lan_address(origin)

    def test_pending_issuance_can_be_activated_without_the_token(self):
        host = "console.example.org"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / host).mkdir()
            (root / host / "browser.caddy").touch()
            for ready in (False, True):
                with patch.object(tls.sys, "argv", ["trusted-https.py", host, "--activate"]), \
                        patch.object(tls, "DIRECTORY", root), \
                        patch.object(tls.Path, "read_text", return_value="CADDY_TLS=tls internal"), \
                        patch.object(tls, "open", mock_open(), create=True), \
                        patch.object(tls.fcntl, "flock"), \
                        patch.object(tls, "configure") as configure, \
                        patch.object(tls, "verify", return_value=ready):
                    self.assertEqual(tls.main(), 0 if ready else 1)
                    configure.assert_not_called()
                self.assertEqual((root / "selected-hostname").exists(), ready)

    def test_browser_links_use_verified_hostname_and_retain_lan_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            env = root / '.env'
            env.write_text('WEB_ORIGIN=https://192.168.20.104:6002,https://old.example.org\nHTTPS_PORT=6002\n')
            original = env.read_text()
            self.assertEqual(dashboard_origin(root), 'https://192.168.20.104:6002')
            directory = root / 'secrets/trusted-https'
            (directory / 'dashboard.example.org').mkdir(parents=True)
            site = directory / 'dashboard.example.org/browser.caddy'
            site.write_text('fixture configured site')
            remember_hostname(directory, 'dashboard.example.org')
            self.assertEqual(dashboard_origin(root), 'https://dashboard.example.org:6002')
            self.assertEqual(env.read_text(), original, 'Connector and API origins remain unchanged')
            self.assertEqual(stat.S_IMODE((directory / 'selected-hostname').stat().st_mode), 0o600)
            env.write_text(original.replace('HTTPS_PORT=6002', 'HTTPS_PORT=443'))
            self.assertEqual(dashboard_origin(root), 'https://dashboard.example.org')
            site.unlink()
            self.assertEqual(dashboard_origin(root), 'https://192.168.20.104:6002')
            (directory / 'selected-hostname').write_text('../untrusted')
            self.assertEqual(dashboard_origin(root), 'https://192.168.20.104:6002')

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
                args = curl.call_args_list[0].args[0]
                self.assertIn("controller.example.org:6002:127.0.0.1", args)
                self.assertIn("https://controller.example.org:6002/api/health", args)
                self.assertNotIn("--insecure", args)
                self.assertNotIn("-k", args)
                self.assertEqual(curl.call_count, 2 if expected else 1)
                if expected:
                    self.assertNotIn("--resolve", curl.call_args.args[0])

    def test_local_certificate_alone_is_insufficient_when_dns_fails(self):
        with patch.object(tls, "healthy_https", side_effect=[True, False]) as health:
            self.assertFalse(tls.verify("controller.example.org", 6002, 0))
        self.assertEqual(health.call_count, 2)


if __name__ == "__main__":
    unittest.main()
