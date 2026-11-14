# Compatibility and deployment scope

Applies to 1.0.0. Developed by The Adekola Labs.

| Component | Supported workflows and release checks | What to check on your installation |
| --- | --- | --- |
| Controller runtime | Node.js 24; PostgreSQL 17; Docker Engine and Compose on an Ubuntu VM or an [unprivileged Debian 12/13 CT](debian-lxc-install.md); Caddy 2.11.7 HTTPS with patched x/net and go-jose dependencies; compiled React frontend | The Debian LXC install check builds the stack, checks HTTPS and restarts the CT. For a deployment, record the controller OS, host kernel, Docker Engine and Compose versions. |
| Proxmox VE | API-token inventory and supported VM/LXC, storage, backup, restore, task and network routes; paired Linux node connector | Record your VE and guest OS versions. Exercise the token permissions for the actions you enable on a disposable guest. |
| Docker | Paired Linux hosts/eligible Linux Proxmox guests or authenticated direct Engine API; image updates for supported lifecycle/configuration | Shared namespaces/lifecycle dependencies, local-only images and digest-pinned tag checks have explicit restrictions. Compose file deployment and coordinated stack migration are not supplied. |
| TrueNAS | HTTPS JSON-RPC integration for 25.04+ method families, with method-dependent compatibility | Check your SCALE version, credentials and certificate trust. Test each enabled write operation on a disposable dataset. |
| Guest setup | UI offers supported Debian/Ubuntu Linux flows; VM paths need guest agent or verified SSH bootstrap | No Windows Docker provisioning. Do not run generic setup in appliances such as TrueNAS. |
| Browsers | Responsive web interface; automated DOM/UI tests and wake-lock lifecycle simulations | Record accessibility and performance on the specific iOS, Android and desktop devices used by the installation. Wake locks are best effort. |
| Notifications | Nine configured external channel adapters and local activity | Send a test to each configured destination and confirm receipt of a failure alert and its recovery. |
| Deployment tenancy | One controller and account database per installation, with an isolated runtime for each additional cluster | User roles are installation-wide. No shared SaaS tenant isolation or horizontal multi-writer journal coordination. |

Measure latency, concurrency and resource growth under sustained load at the intended fleet size. Use the measured results when agreeing capacity and availability targets.
