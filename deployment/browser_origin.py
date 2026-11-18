"""Choose the configured browser address without changing connector origins."""
import argparse
from pathlib import Path
import re
import tempfile


def hostname(value):
    value = value.lower()
    labels = value.split(".")
    if (len(value) > 253 or len(labels) < 2 or not re.fullmatch(r"[a-z][a-z0-9-]*", labels[-1])
            or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in labels)
            or labels[-1] in {"arpa", "internal", "invalid", "lan", "local", "localhost", "onion", "test"}):
        raise argparse.ArgumentTypeError("Use a hostname in a public DNS zone you own.")
    return value


def remember_hostname(directory, host):
    host = hostname(host)
    # Called only after the certificate and local API have been verified.
    with tempfile.NamedTemporaryFile(mode="w", dir=directory, prefix="browser-", delete=False) as target:
        target.write(host + "\n")
        temporary = Path(target.name)
    temporary.replace(directory / "selected-hostname")


def dashboard_origin(root=Path(".")):
    settings = dict(line.split("=", 1) for line in (root / ".env").read_text().splitlines()
                    if "=" in line and not line.startswith("#"))
    fallback = settings.get("WEB_ORIGIN", "").split(",")[0].strip()
    directory = root / "secrets/trusted-https"
    try:
        host = hostname((directory / "selected-hostname").read_text().strip())
        port = int(settings.get("HTTPS_PORT", "443"))
        if not 1 <= port <= 65535 or not (directory / host / "browser.caddy").is_file():
            return fallback
    except (OSError, ValueError, argparse.ArgumentTypeError):
        return fallback
    return f"https://{host}" + ("" if port == 443 else f":{port}")


if __name__ == "__main__":
    print(dashboard_origin())
