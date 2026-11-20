#!/usr/bin/env python3
"""Add a DNS-validated browser hostname to an installed LAN controller."""
import argparse
import fcntl
import getpass
import ipaddress
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
from urllib.error import URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
from browser_origin import hostname, remember_hostname

DIRECTORY = Path("secrets/trusted-https")
MOUNT = "/etc/iclusters/trusted-https"
RELOAD = ["docker", "compose", "exec", "-T", "caddy", "caddy", "reload",
          "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile", "--force"]


def temporary_file(directory, prefix, text):
    with tempfile.NamedTemporaryFile(mode="w", dir=directory, prefix=prefix, delete=False) as target:
        target.write(text)
        return Path(target.name)


def cloudflare_request(token, path, query=None, record=None):
    url = "https://api.cloudflare.com/client/v4" + path
    if query:
        url += "?" + urlencode(query)
    body = json.dumps(record).encode() if record is not None else None
    request = Request(url, data=body, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    try:
        with urlopen(request, timeout=15) as response:
            payload = json.load(response)
        if payload["success"] is True:
            return payload["result"]
    except (URLError, TimeoutError, ValueError, KeyError, TypeError):
        pass
    raise ValueError("Cloudflare DNS request failed. Check network access, token permissions and zone ownership.")


def ensure_dns_record(host, address, token):
    labels = host.split(".")
    for offset in range(len(labels) - 1):
        zones = cloudflare_request(token, "/zones", {"name": ".".join(labels[offset:]), "status": "active"})
        if zones:
            break
    else:
        raise ValueError("No active Cloudflare zone found for this hostname.")

    records_path = f"/zones/{zones[0]['id']}/dns_records"
    records = cloudflare_request(token, records_path, {"name.exact": host, "per_page": 100})
    addresses = [record for record in records if record["type"] in {"A", "AAAA", "CNAME", "NS", "HTTPS", "SVCB"}]
    if addresses:
        if all(record["type"] == "A" and record["content"] == address and record.get("proxied") is False
               for record in addresses):
            return
        raise ValueError(f"Existing DNS record for {host} conflicts with {address}. Choose an unused hostname.")
    cloudflare_request(token, records_path, record={
        "type": "A", "name": host, "content": address, "proxied": False, "ttl": 1,
    })


def private_lan_address(origin):
    host = urlsplit(origin.split(",")[0]).hostname
    try:
        address = ipaddress.IPv4Address(host)
    except ValueError:
        raise ValueError("Automatic Cloudflare DNS needs a private IPv4 address in WEB_ORIGIN.") from None
    if not any(address in ipaddress.IPv4Network(network)
               for network in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")):
        raise ValueError("Automatic Cloudflare DNS needs a private IPv4 address in WEB_ORIGIN.")
    return str(address)


def validate_token(token):
    # Check before provisioning. The upstream module includes malformed values in its errors.
    if not re.fullmatch(r"(?:[A-Za-z0-9_-]{35,50}|cf(?:ut|at)_[A-Za-z0-9_-]{32,256})", token):
        raise ValueError("Invalid Cloudflare API token format.")


def configure(directory, host, token):
    validate_token(token)
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


def healthy_https(url, *connection_options):
    response = subprocess.run([
        "curl", "--disable", "--noproxy", "*", "--silent", "--fail", "--max-time", "4",
        *connection_options, url + "/api/health",
    ], capture_output=True)
    if response.returncode == 0:
        try:
            health = json.loads(response.stdout)
            return isinstance(health, dict) and health.get("ok") is True
        except (ValueError, UnicodeError):
            pass
    return False


def verify(host, port, wait):
    url = f"https://{host}" + ("" if port == 443 else f":{port}")
    deadline = time.monotonic() + wait
    local_https = False
    while True:
        # Check Caddy's own certificate and API before following the hostname through DNS.
        if not local_https:
            local_https = healthy_https(url, "--resolve", f"{host}:{port}:127.0.0.1")
        if local_https and healthy_https(url):
            print(f"Trusted HTTPS and DNS verified from the controller: {url}")
            return True
        if time.monotonic() >= deadline:
            if local_https:
                print("The local certificate is valid, but the URL did not work through DNS. "
                      "Check that the hostname resolves to this controller from your LAN.", file=sys.stderr)
            else:
                print("Trusted HTTPS is not verified yet. Check Caddy logs, zone permissions and DNS propagation.",
                      file=sys.stderr)
            print(f"Check again with: sudo iclusters trusted-https {host} --check", file=sys.stderr)
            return False
        time.sleep(3)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("hostname", type=hostname)
    options = parser.add_mutually_exclusive_group()
    options.add_argument("--token-file", type=Path, help="Read a Cloudflare API token from this file.")
    options.add_argument("--check", action="store_true", help="Verify HTTPS without changing configuration.")
    options.add_argument("--activate", action="store_true", help="Select an already-provisioned hostname after verification.")
    parser.add_argument("--cloudflare-dns", action="store_true",
                        help="Publish the controller’s private IPv4 address in a DNS-only Cloudflare A record.")
    args = parser.parse_args()
    if args.cloudflare_dns and (args.check or args.activate):
        parser.error("--cloudflare-dns applies only when provisioning a hostname.")
    settings = dict(line.split("=", 1) for line in Path(".env").read_text().splitlines()
                    if "=" in line and not line.startswith("#"))
    port = int(settings.get("HTTPS_PORT", "443"))
    if args.check:
        return 0 if verify(args.hostname, port, 0) else 1
    if settings.get("CADDY_TLS") != "tls internal":
        raise ValueError("This additional hostname is for installations using the built-in LAN CA.")
    if not args.activate:
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
        if args.activate:
            if not (DIRECTORY / args.hostname / "browser.caddy").is_file():
                raise ValueError("Provision this hostname before activating it.")
        else:
            if args.cloudflare_dns:
                validate_token(token)
                address = private_lan_address(settings.get("WEB_ORIGIN", ""))
                ensure_dns_record(args.hostname, address, token)
                print(f"Cloudflare DNS-only record ready: {args.hostname} → {address}")
            configure(DIRECTORY, args.hostname, token)
            print("Hostname configured. Waiting for certificate issuance and the dashboard health check.", flush=True)
        if not verify(args.hostname, port, 0 if args.activate else 120):
            print(f"After fixing DNS or waiting for issuance, run sudo iclusters trusted-https {args.hostname} --activate.",
                  file=sys.stderr)
            return 1
        remember_hostname(DIRECTORY, args.hostname)
        return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, EOFError, subprocess.SubprocessError) as error:
        sys.exit(f"Trusted HTTPS setup failed: {error}")
