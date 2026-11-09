#!/usr/bin/env python3
"""Add a DNS-validated browser hostname to an installed LAN controller."""
import argparse
import fcntl
import getpass
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

DIRECTORY = Path("secrets/trusted-https")
MOUNT = "/etc/iclusters/trusted-https"
RELOAD = ["docker", "compose", "exec", "-T", "caddy", "caddy", "reload",
          "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile", "--force"]


def hostname(value):
    value = value.lower()
    labels = value.split(".")
    if (len(value) > 253 or len(labels) < 2 or not re.fullmatch(r"[a-z][a-z0-9-]*", labels[-1])
            or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in labels)
            or labels[-1] in {"arpa", "internal", "invalid", "lan", "local", "localhost", "onion", "test"}):
        raise argparse.ArgumentTypeError("Use a hostname in a public DNS zone you own.")
    return value


def temporary_file(directory, prefix, text):
    with tempfile.NamedTemporaryFile(mode="w", dir=directory, prefix=prefix, delete=False) as target:
        target.write(text)
        return Path(target.name)


def configure(directory, host, token):
    # Check before provisioning. The upstream module includes malformed values in its errors.
    if not re.fullmatch(r"(?:[A-Za-z0-9_-]{35,50}|cf(?:ut|at)_[A-Za-z0-9_-]{32,256})", token):
        raise ValueError("Invalid Cloudflare API token format.")
    directory.mkdir(parents=True, exist_ok=True)
    directory.chmod(0o700)
    directory = directory / host
    directory.mkdir(mode=0o700, exist_ok=True)
    active = directory / "browser.caddy"
    previous = active.read_text() if active.exists() else None
    credential = temporary_file(directory, "cf-token-", token)
    site = f"""https://{host} {{
  tls {{
    dns cloudflare {{file.{MOUNT}/{host}/{credential.name}}}
    resolvers 1.1.1.1 1.0.0.1
  }}
  handle /local-ca.crt {{
    respond 404
  }}
  import controller
}}
"""
    try:
        temporary_file(directory, "site-", site).replace(active)
        subprocess.run(RELOAD, check=True, timeout=30)
    except (OSError, subprocess.SubprocessError, KeyboardInterrupt):
        if previous is None:
            active.unlink(missing_ok=True)
        else:
            temporary_file(directory, "site-", previous).replace(active)
        # Reconcile a reload that may have reached Caddy before the client lost contact.
        # If that also fails, leave both credentials available for the next restart.
        subprocess.run(RELOAD, check=True, timeout=30)
        credential.unlink(missing_ok=True)
        raise
    for old in directory.glob("cf-token-*"):
        if old != credential:
            old.unlink()


def verify(host, port, wait):
    url = f"https://{host}" + ("" if port == 443 else f":{port}")
    deadline = time.monotonic() + wait
    while True:
        # Connect to this controller, preserving the actual HTTPS name and system trust checks.
        response = subprocess.run([
            "curl", "--disable", "--noproxy", "*", "--silent", "--fail", "--max-time", "4",
            "--resolve", f"{host}:{port}:127.0.0.1", url + "/api/health",
        ], capture_output=True)
        if response.returncode == 0:
            try:
                health = json.loads(response.stdout)
            except (ValueError, UnicodeError):
                health = None
            if isinstance(health, dict) and health.get("ok") is True:
                print(f"Trusted HTTPS verified on the controller: {url}")
                print(f"Point {host} to this VM in your LAN or VPN DNS, then share that URL.")
                return True
        if time.monotonic() >= deadline:
            print(f"Trusted HTTPS is not verified yet. Check Caddy logs, zone permissions and DNS propagation.\n"
                  f"Recheck with: sudo iclusters trusted-https {host} --check", file=sys.stderr)
            return False
        time.sleep(3)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("hostname", type=hostname)
    options = parser.add_mutually_exclusive_group()
    options.add_argument("--token-file", type=Path, help="Read a Cloudflare API token from this file.")
    options.add_argument("--check", action="store_true", help="Verify HTTPS without changing configuration.")
    args = parser.parse_args()
    settings = dict(line.split("=", 1) for line in Path(".env").read_text().splitlines()
                    if "=" in line and not line.startswith("#"))
    port = int(settings.get("HTTPS_PORT", "443"))
    if args.check:
        return 0 if verify(args.hostname, port, 0) else 1
    if settings.get("CADDY_TLS") != "tls internal":
        raise ValueError("This additional hostname is for installations using the built-in LAN CA.")
    if args.token_file:
        if not args.token_file.is_absolute():
            raise ValueError("Supply an absolute token file path.")
        token = args.token_file.read_text().strip()
    elif sys.stdin.isatty():
        print("Use a token restricted to the hostname’s Cloudflare zone with Zone Read and DNS Edit permissions.")
        token = getpass.getpass("Cloudflare API token for this DNS zone (hidden): ").strip()
    else:
        raise ValueError("Use a terminal for the hidden token prompt or supply --token-file with an absolute path.")
    with open("/run/lock/iclusters-maintenance.lock", "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("Controller maintenance is running. Try again when it finishes.") from None
        configure(DIRECTORY, args.hostname, token)
        print("Hostname configured. Waiting for certificate issuance and the dashboard health check.", flush=True)
        return 0 if verify(args.hostname, port, 120) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, EOFError, subprocess.SubprocessError) as error:
        sys.exit(f"Trusted HTTPS setup failed: {error}")
