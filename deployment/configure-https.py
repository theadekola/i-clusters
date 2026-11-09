#!/usr/bin/env python3
"""Migrate managed LAN installations to HTTPS without changing credentials."""
import ipaddress
import os
from pathlib import Path
from urllib.parse import urlsplit


def configure(path):
    original = path.read_text()
    values = dict(line.split("=", 1) for line in original.splitlines() if "=" in line and not line.lstrip().startswith("#"))
    origin = urlsplit(values.get("WEB_ORIGIN", ""))
    host = origin.hostname
    if not host:
        raise ValueError("WEB_ORIGIN must contain the installation address")
    try:
        local = ipaddress.ip_address(host).is_private
    except ValueError:
        local = host == "localhost" or host.endswith(".local")
    # Public domains retain their ACME settings and chosen port.
    if not local:
        return False
    # Only the original HTTP-only layout reused port 6002 for HTTPS on migration.
    https_port = values.get("HTTPS_PORT") or str((origin.port or 443) if origin.scheme == "https" else 6002)
    http_port = values.get("WEB_PORT") or "6003"
    if origin.scheme == "http" and http_port == https_port == "6002":
        http_port = "6003"
    if not all(port.isascii() and port.isdecimal() and 1 <= int(port) <= 65535 for port in (http_port, https_port)) or int(http_port) == int(https_port):
        raise ValueError("WEB_PORT and HTTPS_PORT must be distinct valid ports")
    authority = f"[{host}]" if ":" in host else host
    site = "https://" + authority
    public_url = site if int(https_port) == 443 else f"{site}:{https_port}"
    replacements = {"DOMAIN": site, "WEB_PORT": http_port, "HTTPS_PORT": https_port,
                    "WEB_ORIGIN": public_url, "CADDY_DEFAULT_SNI": host, "CADDY_TLS": "tls internal"}
    lines = [line for line in original.splitlines() if line.split("=", 1)[0] not in replacements]
    lines.extend(key + "=" + value for key, value in replacements.items())
    updated = "\n".join(lines) + "\n"
    if original == updated:
        return False
    backup = path.with_name(".env.before-https-6002")
    if not backup.exists():
        backup.write_text(original)
        os.chmod(backup, 0o600)
    temporary = path.with_name(".env.https-tmp")
    temporary.write_text(updated)
    os.chmod(temporary, 0o600)
    temporary.replace(path)
    return True

if __name__ == "__main__":
    import runpy
    runpy.run_path(str(Path(__file__).with_name("migrate-brand.py")),run_name="__main__")
    configure(Path(".env"))
