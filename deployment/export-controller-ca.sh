#!/bin/sh
# Export only Caddy's public local root, never its private key, for SSH connector bootstrap.
set -eu
mkdir -p secrets/ca
if [ -f .env ] && grep -q '^CADDY_TLS=tls internal' .env; then
 temporary=$(mktemp secrets/ca/.controller-ca.XXXXXX)
 profile=$(mktemp secrets/ca/.apple-profile.XXXXXX)
 trap 'rm -f "$temporary" "$profile"' EXIT
 docker compose exec -T caddy cat /data/caddy/pki/authorities/local/root.crt </dev/null > "$temporary"
 openssl x509 -in "$temporary" -noout >/dev/null
 python3 "$(dirname "$0")/apple-trust-profile.py" < "$temporary" > "$profile"
 chmod 644 "$temporary" "$profile"
 mv "$temporary" secrets/ca/controller-ca.pem
 mv "$profile" secrets/ca/i-clusters.mobileconfig
else
 rm -f secrets/ca/controller-ca.pem secrets/ca/i-clusters.mobileconfig
fi
