#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
fail() { echo "Error: $*" >&2; exit 1; }
usage() {
  echo 'Install i-Clusters on an Ubuntu server/VM or a Debian 12/13 Proxmox LXC container.'
  echo 'Usage: sudo bash install.sh [--repo https://github.com/OWNER/REPO.git] [--ref BRANCH_OR_TAG] [--url https://SERVER-IP] [--port 6003] [--https-port 6002] [--trusted-hostname HOST [--cloudflare-token-file FILE] [--cloudflare-dns]]'
}
repo='https://github.com/theadekola/i-clusters.git' ref='' url='' web_port=6003 https_port=6002 trusted_host='' cloudflare_token_file='' cloudflare_dns=false
while (($#)); do
  case "$1" in
    --repo|--ref|--url|--port|--https-port|--trusted-hostname|--cloudflare-token-file)
      (($# >= 2)) || fail "Missing value for $1"
      case "$1" in --repo) repo=$2;; --ref) ref=$2;; --url) url=$2;; --port) web_port=$2;; --https-port) https_port=$2;; --trusted-hostname) trusted_host=$2;; --cloudflare-token-file) cloudflare_token_file=$2;; esac
      shift 2;;
    --cloudflare-dns) cloudflare_dns=true; shift;;
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
[[ $EUID == 0 ]] || fail 'Run the installer as root in the controller guest, or use sudo.'
if command -v pveversion >/dev/null || [[ -e /etc/pve/local ]]; then
  fail 'This is a Proxmox VE host. Run install.sh inside the dedicated controller VM or CT.'
fi
source /etc/os-release
case "${ID:-}" in
  ubuntu) docker_suite=${UBUNTU_CODENAME:-${VERSION_CODENAME:-}} ;;
  debian)
    case "${VERSION_ID:-}:${VERSION_CODENAME:-}" in
      12:bookworm|13:trixie) docker_suite=$VERSION_CODENAME ;;
      *) fail 'Use a Debian 12 (bookworm) or Debian 13 (trixie) standard system container.' ;;
    esac ;;
  *) fail 'This installer supports Ubuntu and Debian 12/13.' ;;
esac
[[ $docker_suite =~ ^[a-z][a-z0-9-]*$ ]] || fail 'Cannot identify the Docker APT distribution suite.'
docker_repo="https://download.docker.com/linux/$ID"
[[ -d /run/systemd/system ]] && command -v systemctl >/dev/null || fail 'Boot the controller guest with systemd before installing.'
guest_type=$(systemd-detect-virt --container 2>/dev/null || true)
docker_error() {
  if [[ $guest_type == lxc ]]; then
    echo 'In Proxmox, check that this unprivileged CT has Nesting and keyctl enabled, then fully stop and start the CT after changing features.' >&2
    echo 'Check journalctl -u docker -u containerd inside the CT and the host LXC packages and storage if Docker still cannot start.' >&2
  fi
  fail "$1"
}
probe_lxc_docker() {
  docker run --rm --pull=missing --security-opt no-new-privileges busybox:1.37 true
}
try_lxc_native_snapshotter() {
  local config=$1 inventory images candidate
  if [[ -e $config || -L $config || -n ${DOCKER_HOST:-} || -n ${DOCKER_CONTEXT:-} ]] ||
     [[ $(docker context show) != default ]]; then
    echo 'The installer can only change the snapshotter on a fresh local Docker Engine without a daemon.json.' >&2
    return 1
  fi
  inventory=$(docker info --format '{{.Driver}} {{.Containers}} {{.Swarm.LocalNodeState}} {{.DockerRootDir}}') || return 1
  if [[ $inventory != 'overlayfs 0 inactive /var/lib/docker' ]]; then
    echo 'The installer can only change the default OverlayFS setup on a Docker Engine with no containers or Swarm membership.' >&2
    return 1
  fi
  inventory=$(docker volume ls --quiet) || return 1
  images=$(docker image ls --format '{{.Repository}}:{{.Tag}}') || return 1
  if [[ -n $inventory || ( -n $images && $images != 'busybox:1.37' ) ]]; then
    echo 'Docker already has volumes or images. Review its storage configuration before retrying.' >&2
    return 1
  fi

  install -d -m 0755 -- "$(dirname -- "$config")" || return 1
  candidate=$(mktemp -- "$config.iclusters.XXXXXXXX") || return 1
  if ! printf '%s\n' '{"features":{"containerd-snapshotter":true},"storage-driver":"native"}' >"$candidate" ||
     ! dockerd --validate --config-file "$candidate" ||
     ! ln -- "$candidate" "$config"; then
    rm -f -- "$candidate"
    return 1
  fi

  echo 'OverlayFS mounts are blocked in this CT. Retrying the Docker check with the native snapshotter, which uses more disk space.'
  if systemctl restart docker &&
     [[ $(docker info --format '{{.Driver}}') == native ]] &&
     probe_lxc_docker; then
    rm -f -- "$candidate"
    echo 'Docker started the test container with the native snapshotter.'
    return 0
  fi

  # Restore startup defaults only while the file still belongs to this attempt.
  if [[ $config -ef $candidate ]]; then
    rm -f -- "$config"
    systemctl restart docker || echo 'Could not restart Docker after restoring its previous configuration.' >&2
  fi
  rm -f -- "$candidate"
  return 1
}
[[ ! -e /opt/homecloud-hub ]] || fail 'An existing installation must be upgraded, not reinstalled.'
[[ ! -e /opt/i-clusters ]] || fail '/opt/i-clusters already exists. Use sudo iclusters update for an existing installation.'
[[ ! -e /usr/local/bin/iclusters && ! -e /etc/systemd/system/i-clusters.service ]] || fail 'i-Clusters command or service already exists.'
[[ -z $cloudflare_token_file || -n $trusted_host ]] || fail '--cloudflare-token-file requires --trusted-hostname.'
[[ -z $trusted_host || -z $url ]] || fail 'Use --trusted-hostname with the default LAN installation, or --url for a custom site.'
if [[ -z $trusted_host && -z $url && -t 0 && -t 1 ]]; then
  echo 'Recommended: enter a hostname in a Cloudflare DNS zone you control. i-Clusters manages its certificate and renewal; users install nothing.'
  echo 'LAN IP only still requires device certificate trust. A web application cannot install trust on users’ devices.'
  read -r -p 'Dashboard hostname (press Enter for LAN IP only): ' trusted_host
  if [[ -n $trusted_host && $cloudflare_dns == false ]]; then
    echo 'Automatic DNS publishes the controller’s private IPv4 address in a public, DNS-only Cloudflare record.'
    read -r -p 'Create that record? Press Enter to use your LAN DNS instead [y/N]: ' publish_dns
    if [[ $publish_dns == [yY] || $publish_dns == [yY][eE][sS] ]]; then cloudflare_dns=true; fi
  fi
fi
[[ $cloudflare_dns == false || -n $trusted_host ]] || fail '--cloudflare-dns requires --trusted-hostname.'
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
      fail "Existing package $pkg conflicts with Docker Engine. Configure Docker and Compose first using Docker's $ID installation guide."
    fi
  done
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "$docker_repo/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: $docker_repo
Suites: $docker_suite
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  chmod 0644 /etc/apt/sources.list.d/docker.sources
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
docker compose version >/dev/null || fail 'Install the Docker Compose plugin before continuing.'
[[ -x /usr/bin/docker ]] || fail 'The systemd service requires Docker at /usr/bin/docker.'
systemctl start docker || docker_error 'Docker service failed to start.'
docker info >/dev/null || docker_error 'Docker Engine is unavailable.'
if [[ $guest_type == lxc ]]; then
  # A running daemon alone does not verify nested mounts and container startup.
  if ! probe_output=$(probe_lxc_docker 2>&1); then
    printf '%s\n' "$probe_output" >&2
    if [[ $probe_output != *'/tmp/containerd-mount'* || $probe_output != *'fstype: overlay'* ||
          ( $probe_output != *'permission denied'* && $probe_output != *'operation not permitted'* ) ]] ||
       ! try_lxc_native_snapshotter /etc/docker/daemon.json; then
      docker_error 'The nested Docker container check failed. Review the Docker error above before retrying the installer.'
    fi
  fi
fi
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
  vm_ip=$(detect_vm_ip) || fail 'Cannot detect the controller IPv4 address. Check its network connection or supply --url.'
  url="https://$vm_ip"
  echo "Detected controller IP: $vm_ip"
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
  if [[ $cloudflare_dns == true ]]; then trusted_args+=(--cloudflare-dns); fi
  /usr/local/bin/iclusters trusted-https "${trusted_args[@]}" || fail 'The LAN controller is installed. Retry trusted HTTPS with sudo iclusters trusted-https HOST, or use --activate if configuration succeeded and verification was pending.'
elif grep -qx 'CADDY_TLS=tls internal' .env; then
  if [[ -f secrets/ca/i-clusters.mobileconfig ]]; then
    echo 'Your iPhone/iPad trust profile is ready: /opt/i-clusters/secrets/ca/i-clusters.mobileconfig'
    echo 'Transfer this public profile through a trusted channel.'
  else
    echo 'Export the public LAN root from the controller and transfer it through a trusted channel.'
  fi
  echo 'Install the profile in Settings, then enable the matching root in General > About > Certificate Trust Settings.'
fi
# Prefer the verified browser hostname while retaining the LAN connector origin.
if [[ -f deployment/browser_origin.py ]]; then
  installed_url=$(python3 deployment/browser_origin.py)
else
  installed_url=$(sed -n 's/^WEB_ORIGIN=//p' .env)
fi
echo "Open guided connection setup after signing in: ${installed_url%/}/settings?tab=Connections&setup=choose"
echo 'Configure notification channels under Settings > Integrations, and AI providers on the AI Assistant page.'
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
