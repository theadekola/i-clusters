# Install i-Clusters in a Debian LXC container on Proxmox VE

Use a dedicated, unprivileged Debian 12 (Bookworm) or Debian 13 (Trixie) system container for the i-Clusters controller. Docker Engine runs inside the CT. It hosts the API, web interface, PostgreSQL and Caddy. The installer sets up the same systemd service, updater and HTTPS dashboard as the Ubuntu installation.

## Prepare the CT on Proxmox

1. In the Proxmox web interface, open storage that supports **Container template**, select **CT Templates → Templates**, and download a Debian 12 or 13 **standard** template.
2. Select **Create CT**, choose the template and keep **Unprivileged container** enabled. Use a new CT with persistent root-disk storage that supports nested Docker. As a starting allocation for the local image builds, allow 4 CPU cores, 8 GiB RAM and 40 GiB disk. Increase these to suit image caches, updates, database growth and backups.
3. Give the CT a stable LAN address or DHCP reservation, gateway and working DNS. It needs outbound access to Debian and Docker package repositories, GitHub, image registries and build dependencies. Allow clients and paired connectors to reach its HTTPS port, normally TCP 6002.
4. While the CT is stopped, open **Options → Features**, enable **Nesting** and **keyctl**, and retain any other features you intentionally configured. Start the CT. If you changed the features on a running CT, fully shut it down and start it again. Enable **Start at boot** if the controller should return automatically when its Proxmox host restarts.

You can confirm the configuration from the **Proxmox host shell**. Replace `123` with the new CT ID. Look for `unprivileged: 1`, `nesting=1` and `keyctl=1`.

```sh
pct config 123
```

## Run the installer inside the Debian CT

Open the CT's **Console** and sign in as root. Run these commands **inside the CT**.

```sh
cat /etc/os-release
systemd-detect-virt --container
apt-get update
apt-get install -y ca-certificates curl
curl -fsSL https://raw.githubusercontent.com/theadekola/i-clusters/main/install.sh -o /tmp/iclusters-install.sh
bash /tmp/iclusters-install.sh
```

The virtualization check should print `lxc`. The installer selects Docker's Debian repository for the CT's release and architecture, or reuses an existing local Docker Engine with Compose. It starts a temporary BusyBox container to check nested Docker before creating `/opt/i-clusters`. At the HTTPS prompt, press Enter for the LAN address or supply your configured public hostname for trusted HTTPS.

## Open and verify the dashboard

```sh
systemctl is-active docker i-clusters
iclusters status
```

Look for `active` twice and five running services: `api`, `web`, `postgres`, `redis` and `caddy`. To check the database-backed API over HTTPS on the default LAN installation, run the following inside the CT. A working controller returns `"ok":true`.

```sh
cd /opt/i-clusters
origin=$(sed -n 's/^WEB_ORIGIN=//p' .env)
curl -fsS --cacert secrets/ca/controller-ca.pem "$origin/api/health"
```

Open the printed dashboard address, normally `https://CT-IP:6002`. On a fresh installation, use the private first-owner link from the installer console. Run `iclusters setup-link` from the CT console if you need another link. For LAN HTTPS, follow the [certificate trust instructions](../PRODUCTION.md#automatic-lan-https-on-port-6002).

Use `iclusters update`, `iclusters status` and the [controller backup and recovery procedure](../deployment/SECURITY-AND-RECOVERY.md) inside the CT. An existing Ubuntu controller can continue using its current installation. A fresh CT has its own database and credentials.

## If nested Docker fails

- **Docker key, package or image download fails.** Check DNS, outbound HTTPS, available disk space and the CT clock. The download error identifies the repository or registry involved.
- **Docker or the test container reports a mount, sysctl, AppArmor or cgroup permission error.** Check `journalctl -u docker -u containerd -b` inside the CT. On the host, check the features above, current Proxmox kernel and LXC packages, and the host's AppArmor logs. Keep the CT unprivileged and its confinement enabled.
- **Docker reports an OverlayFS mount permission error.** Re-download `install.sh` before retrying. On a fresh CT with no existing Docker daemon configuration or workloads, the installer retries with containerd’s `native` snapshotter. It keeps that setting if the test container starts and restores the previous configuration if the retry fails. The native snapshotter copies layers and can require more disk space. Check the active backend with `docker info --format '{{.Driver}}'`.
- **The retry still fails.** Check the storage backing the CT root disk and Docker data directory. Use storage compatible with the selected Docker driver, or use the [Ubuntu VM installation](../README.md#install-on-ubuntu) if your host policy or storage does not support nested Docker.

[Proxmox container features](https://pve.proxmox.com/pve-docs/pct.conf.5.html) · [Docker Engine on Debian](https://docs.docker.com/engine/install/debian/)
