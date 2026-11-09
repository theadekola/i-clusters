import hashlib
import pathlib
import plistlib
import ssl
import subprocess
import sys
import tempfile
import unittest

exporter = pathlib.Path(__file__).with_name("apple-trust-profile.py")


class AppleTrustProfileTests(unittest.TestCase):
    def certificate(self, folder, is_ca):
        cert, key = folder / "cert.pem", folder / "key.pem"
        subprocess.run([
            "openssl", "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256",
            "-nodes", "-keyout", key, "-out", cert, "-days", "2", "-subj", "/CN=Fixture",
            "-addext", "basicConstraints=critical,CA:" + ("TRUE" if is_ca else "FALSE"),
        ], check=True, capture_output=True)
        return cert.read_bytes(), key.read_bytes()

    def export(self, data):
        return subprocess.run([sys.executable, exporter], input=data, capture_output=True)

    def test_repeat_export_and_distinct_controllers(self):
        with tempfile.TemporaryDirectory() as folder:
            identifiers = set()
            for _ in range(2):
                pem, _ = self.certificate(pathlib.Path(folder), True)
                der = ssl.PEM_cert_to_DER_cert(pem.decode())
                result = self.export(pem)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(hashlib.sha256(der).digest().hex(":").upper().encode(), result.stderr)
                profile = plistlib.loads(result.stdout)
                self.assertEqual(profile["PayloadType"], "Configuration")
                cert, = profile["PayloadContent"]
                self.assertEqual(cert["PayloadType"], "com.apple.security.root")
                self.assertEqual(cert["PayloadContent"], der)
                self.assertNotEqual(cert["PayloadUUID"], profile["PayloadUUID"])
                self.assertEqual(self.export(pem).stdout, result.stdout)
                identifiers.add(profile["PayloadIdentifier"])
            self.assertEqual(len(identifiers), 2)

    def test_invalid_inputs_emit_no_profile(self):
        with tempfile.TemporaryDirectory() as folder:
            pem, key = self.certificate(pathlib.Path(folder), False)
            for value in [b"", key, pem, pem + key, pem + pem]:
                result = self.export(value)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, b"")


if __name__ == "__main__":
    unittest.main()
