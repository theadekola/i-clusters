#!/usr/bin/env bash
# Integration test for a disposable GitHub-hosted runner with LXD installed.
set -Eeuo pipefail
release=${1:?Supply a Debian release}
case "$release" in 12|13) ;; *) exit 2;; esac
ct="iclusters-debian-$release"
work=$(mktemp -d)
cleanup() {
  local rc=$?
  if ((rc)); then
    sudo lxc info "$ct" --show-log || true
    sudo lxc exec "$ct" -- journalctl -b -u docker -u containerd -u i-clusters --no-pager -n 80 || true
  fi
  sudo lxc delete "$ct" --force || true
  rm -rf "$work"
}
trap cleanup EXIT

# Make the installer clone the exact checkout tested, including a PR merge commit.
git clone --bare --quiet . "$work/source.git"
git -C "$work/source.git" update-ref refs/heads/ci "$(git rev-parse HEAD)"
git -C "$work/source.git" symbolic-ref HEAD refs/heads/ci
git -C "$work/source.git" bundle create "$work/source.bundle" refs/heads/ci HEAD
sudo lxc launch "images:debian/$release" "$ct" \
  -c security.privileged=false -c security.nesting=true \
  -c security.syscalls.intercept.mknod=true -c security.syscalls.intercept.setxattr=true
guest() { sudo lxc exec "$ct" -- "$@"; }
wait_guest() {
  for ((attempt=0;attempt<60;attempt++)); do
    if guest sh -c 'test -d /run/systemd/system && getent hosts download.docker.com >/dev/null'; then return 0; fi
    sleep 2
  done
  return 1
}
wait_guest
[[ $(guest systemd-detect-virt --container) == lxc ]]
guest awk 'NR == 1 { exit !($1 == 0 && $2 > 0) }' /proc/self/uid_map
sudo lxc file push install.sh "$ct/root/install.sh"
sudo lxc file push "$work/source.bundle" "$ct/root/source.bundle"
guest git --version >/dev/null 2>&1 || guest sh -ec 'apt-get update && apt-get install -y git ca-certificates'
guest git clone --bare /root/source.bundle /root/source.git
guest git config --system url.file:///root/source.git.insteadOf https://github.com/theadekola/i-clusters.git
guest env DEBIAN_FRONTEND=noninteractive bash /root/install.sh </dev/null
guest git -C /opt/i-clusters rev-parse HEAD | grep -Fx "$(git rev-parse HEAD)"
guest grep -Fx 'URIs: https://download.docker.com/linux/debian' /etc/apt/sources.list.d/docker.sources
guest docker compose version
guest systemctl is-enabled i-clusters.service iclusters-updater.timer iclusters-updater.path

verify() {
  guest sh -ec '
    cd /opt/i-clusters
    systemctl is-active --quiet i-clusters.service
    test "$(docker compose ps --status running --services | sort | paste -sd,)" = api,caddy,postgres,redis,web
    origin=$(sed -n "s/^WEB_ORIGIN=//p" .env)
    curl -fsS --cacert secrets/ca/controller-ca.pem "$origin/api/health" | python3 -c "import json,sys; assert json.load(sys.stdin)[\"ok\"]"
    iclusters status
  '
}
verify
sudo lxc restart "$ct"
wait_guest
guest timeout 240 sh -c 'until systemctl is-active --quiet i-clusters.service; do sleep 2; done'
verify
