set -e
. /etc/os-release
case "$ID" in debian|ubuntu) ;; *) echo "Unsupported OS: ${PRETTY_NAME:-unknown}. Use the vendor updater."; exit 1;; esac
if [ -e /etc/pve ] || [ -e /etc/truenas-release ] || [ -e /etc/version.freenas ] || command -v pveversion >/dev/null || command -v midclt >/dev/null; then
  echo "Host or appliance OS detected. Use its own updater."; exit 1
fi
echo "Checking packages on $(hostname) ($PRETTY_NAME)"
as_root() { if [ "$(id -u)" = 0 ]; then "$@"; else sudo -- "$@"; fi; }
as_root apt-get -o APT::Update::Error-Mode=any update
apt-get -s upgrade
printf "Apply the available package upgrades to this guest? [y/N] "
read -r answer
case "$answer" in y|Y|yes|YES) as_root apt-get --no-remove upgrade;; *) echo "No packages installed."; exit 0;; esac
if [ -e /var/run/reboot-required ]; then echo "A guest reboot is required."; fi
