#!/usr/bin/env python3
"""Package the controller's public Caddy root for manual installation on Apple devices."""
import hashlib
import plistlib
import re
import ssl
import subprocess
import sys
import tempfile
import uuid


def profile_for(pem):
    if not re.fullmatch(rb"-----BEGIN CERTIFICATE-----\s+[A-Za-z0-9+/=\r\n]+\s+-----END CERTIFICATE-----\s*", pem):
        raise ValueError("Expected one public root certificate from Caddy.")
    constraints = subprocess.run(
        ["openssl", "x509", "-noout", "-ext", "basicConstraints", "-checkend", "0"],
        input=pem, capture_output=True, check=True,
    ).stdout
    if b"CA:TRUE" not in constraints:
        raise ValueError("The controller certificate must be a CA certificate.")
    with tempfile.NamedTemporaryFile() as root:
        root.write(pem)
        root.flush()
        subprocess.run(
            ["openssl", "verify", "-check_ss_sig", "-trusted", root.name, root.name],
            check=True, capture_output=True,
        )
    der = ssl.PEM_cert_to_DER_cert(pem.decode("ascii").strip())
    fingerprint = hashlib.sha256(der).hexdigest()
    identifier = "com.i-clusters.trust." + fingerprint
    name = "i-Clusters LAN CA (" + fingerprint[:12].upper() + ")"

    def identity(suffix):
        payload_id = identifier + suffix
        return {
            "PayloadIdentifier": payload_id,
            "PayloadUUID": str(uuid.uuid5(uuid.NAMESPACE_DNS, payload_id)).upper(),
            "PayloadVersion": 1,
            "PayloadDisplayName": name,
        }

    certificate = {
        **identity(".root"),
        "PayloadType": "com.apple.security.root",
        "PayloadCertificateFileName": "i-clusters-root.cer",
        "PayloadContent": der,
    }
    profile = {**identity(""), "PayloadType": "Configuration", "PayloadContent": [certificate]}
    return plistlib.dumps(profile), fingerprint


if __name__ == "__main__":
    try:
        profile, fingerprint = profile_for(sys.stdin.buffer.read())
    except (ValueError, subprocess.CalledProcessError) as error:
        sys.exit(f"Cannot export the i-Clusters trust profile: {error}")
    print("Root SHA-256: " + bytes.fromhex(fingerprint).hex(":").upper(), file=sys.stderr)
    sys.stdout.buffer.write(profile)
