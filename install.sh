#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
fail() { echo "Error: $*" >&2; exit 1; }
usage() {
  echo 'Usage: sudo bash install.sh [--repo https://github.com/OWNER/REPO.git] [--ref BRANCH_OR_TAG] [--url https://SERVER-IP] [--port 6003] [--https-port 6002] [--trusted-hostname HOST [--cloudflare-token-file FILE]]'
}
repo='https://github.com/theadekola/i-clusters.git' ref='' url='' web_port=6003 https_port=6002 trusted_host='' cloudflare_token_file=''
while (($#)); do
  case "$1" in
    --repo|--ref|--url|--port|--https-port|--trusted-hostname|--cloudflare-token-file)
      (($# >= 2)) || fail "Missing value for $1"
      case "$1" in --repo) repo=$2;; --ref) ref=$2;; --url) url=$2;; --port) web_port=$2;; --https-port) https_port=$2;; --trusted-hostname) trusted_host=$2;; --cloudflare-token-file) cloudflare_token_file=$2;; esac
      shift 2;;
    -h|--help) usage; exit 0;;
    *) usage; fail "Unknown option: $1";;
  esac
done
[[ $repo =~ ^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(\.git)?$ ]] || fail 'Supply a public GitHub HTTPS repository with --repo.'
[[ -z $url || $url =~ ^https?://[A-Za-z0-9.-]+$ ]] || fail '--url must be http://SERVER-IP or https://hostname without a port or path.'
for selected_port in "$web_port" "$https_port"; do
  [[ $selected_port =~ ^[1-9][0-9]{0,4}$ ]] && ((selected_port <= 65535)) || fail 'Ports must be between 1 and 65535.'
done
[[ $web_port != "$https_port" ]] || fail 'HTTP and HTTPS ports must differ.'
[[ -z $ref || $ref != -* ]] || fail 'Invalid Git ref.'
[[ $EUID == 0 ]] || fail 'Run with sudo bash install.sh ...'
source /etc/os-release
[[ $ID == ubuntu ]] || fail 'This installer supports Ubuntu.'
command -v systemctl >/dev/null || fail 'Ubuntu with systemd is required.'
[[ ! -e /opt/homecloud-hub ]] || fail 'An existing installation must be upgraded, not reinstalled.'
[[ ! -e /opt/i-clusters ]] || fail '/opt/i-clusters already exists. Use sudo iclusters update for an existing installation.'
[[ ! -e /usr/local/bin/iclusters && ! -e /etc/systemd/system/i-clusters.service ]] || fail 'i-Clusters command or service already exists.'
[[ -z $cloudflare_token_file || -n $trusted_host ]] || fail '--cloudflare-token-file requires --trusted-hostname.'
[[ -z $trusted_host || -z $url ]] || fail 'Use --trusted-hostname with the default LAN installation, or --url for a custom site.'
if [[ -z $trusted_host && -z $url && -t 0 && -t 1 ]]; then
  echo 'To give users trusted HTTPS, enter a hostname in a Cloudflare DNS zone you control.'
  read -r -p 'Dashboard hostname (press Enter for LAN IP only): ' trusted_host
fi
if [[ -n $trusted_host && -z $cloudflare_token_file && ! -t 0 ]]; then
  fail 'Noninteractive trusted HTTPS requires --cloudflare-token-file FILE.'
fi
if [[ -n $cloudflare_token_file ]]; then
  [[ -f $cloudflare_token_file && -r $cloudflare_token_file ]] || fail 'Cannot read the Cloudflare token file.'
  cloudflare_token_file=$(realpath -- "$cloudflare_token_file")
fi
apt-get update
apt-get install -y ca-certificates curl git openssl nano iproute2 python3
if ! command -v docker >/dev/null; then
  for pkg in docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc; do
    if dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q 'install ok installed'; then
      fail "Existing package $pkg conflicts with Docker Engine. Configure Docker and Compose first using Docker's Ubuntu documentation."
    fi
  done
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
docker compose version >/dev/null || fail 'Install the Docker Compose plugin before continuing.'
[[ -x /usr/bin/docker ]] || fail 'The systemd service requires Docker at /usr/bin/docker.'
systemctl start docker
docker info >/dev/null || fail 'Docker Engine is unavailable.'
install -d -m 0755 /opt
stage=$(mktemp -d /opt/iclusters-install.XXXXXXXX)
trap 'rm -rf -- "$stage"' EXIT
git clone -- "$repo" "$stage/source"
if [[ -n $ref ]]; then git -C "$stage/source" checkout --detach "$ref"; fi
cd "$stage/source"
[[ -f docker-compose.yml && -f deployment/iclusters && -f deployment/i-clusters.service && -f .env.example ]] || fail 'Repository does not contain the i-Clusters installation files.'
if [[ -n $trusted_host && ! -f deployment/trusted-https.py ]]; then
  fail 'The selected revision does not support --trusted-hostname.'
fi
sh deployment/generate-secrets.sh
if [[ -z $url ]]; then
  source deployment/network.sh
  vm_ip=$(detect_vm_ip) || fail 'Cannot detect the VM IPv4 address. Check its network connection or supply --url.'
  url="https://$vm_ip"
  echo "Detected VM IP: $vm_ip"
fi
domain=':80'
if [[ $url == https://* ]]; then
  domain=${url#https://}
  if [[ $https_port != 443 ]]; then url="$url:$https_port"; fi
elif [[ $web_port != 80 ]]; then url="$url:$web_port"; fi
sed -i "s|^DOMAIN=.*|DOMAIN=$domain|;s|^WEB_ORIGIN=.*|WEB_ORIGIN=$url|;s|^WEB_PORT=.*|WEB_PORT=$web_port|;s|^HTTPS_PORT=.*|HTTPS_PORT=$https_port|" .env
sed -i "s|^CADDY_TLS=.*|CADDY_TLS=|;s|^CADDY_DEFAULT_SNI=.*|CADDY_DEFAULT_SNI=${domain#https://}|" .env
python3 deployment/configure-https.py
docker compose config --quiet
mv "$stage/source" /opt/i-clusters
cd /opt/i-clusters
install -m 0755 deployment/iclusters /usr/local/bin/iclusters
install -m 0644 deployment/i-clusters.service /etc/systemd/system/i-clusters.service
bash deployment/setup-updater.sh
source deployment/build-env.sh
docker compose build --pull
systemctl daemon-reload
systemctl enable --now i-clusters.service
sh deployment/export-controller-ca.sh
if [[ -n $trusted_host ]]; then
  trusted_args=("$trusted_host")
  if [[ -n $cloudflare_token_file ]]; then trusted_args+=(--token-file "$cloudflare_token_file"); fi
  /usr/local/bin/iclusters trusted-https "${trusted_args[@]}" || fail 'The LAN controller is installed. Retry trusted HTTPS with sudo iclusters trusted-https HOST, or use --check if issuance is pending.'
elif grep -qx 'CADDY_TLS=tls internal' .env; then
  if [[ -f secrets/ca/i-clusters.mobileconfig ]]; then
    echo 'Your iPhone/iPad trust profile is ready: /opt/i-clusters/secrets/ca/i-clusters.mobileconfig'
    echo 'Transfer this public profile through a trusted channel.'
  else
    echo 'Export the public LAN root from the VM and transfer it through a trusted channel.'
  fi
  echo 'Install the profile in Settings, then enable the matching root in General > About > Certificate Trust Settings.'
fi
# Read the final URL after optional trusted HTTPS updates the configuration.
installed_url=$(sed -n 's/^WEB_ORIGIN=//p' .env)
echo "Open guided connection setup after signing in: ${installed_url%/}/settings?tab=Connections&setup=choose"
echo 'Configure AI and notification channels under Settings > Integrations.'
printf '\n%s\n\n  Open i-Clusters: %s\n\n' 'i-Clusters installation completed successfully.' "$installed_url"

if [[ -f apps/api/scripts/owner-setup-link.mjs ]]; then
  setup_origin=${installed_url%%,*}
  if [[ -n $trusted_host ]]; then
    setup_origin="https://$trusted_host"
    if [[ $https_port != 443 ]]; then setup_origin+=":$https_port"; fi
  fi
  if [[ -t 1 && $setup_origin == https://* ]]; then
    /usr/local/bin/iclusters setup-link "$setup_origin" || {
      link_status=$?
      # An existing account already closes setup. Preserve normal sign-in.
      ((link_status == 3)) || exit "$link_status"
    }
  else
    echo 'From a private controller terminal with HTTPS configured, run sudo iclusters setup-link to register.'
  fi
fi
