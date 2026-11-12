# Multi-cluster reporting audit

## What identifies the selected cluster

Each browser tab has a cluster profile. The original installation uses the root URL. Additional profiles use `/clusters/<profile-id>/`. The controller routes infrastructure requests to the profile’s own runtime, which has its own connection credentials, monitor, connector registry, SSH sessions, job state and audit scope. Sign-in, accounts and roles, software updates, the profile list and product preferences are installation-wide.

A saved profile name identifies a connection chosen by the owner. To compare two connections on an installation, open the switcher and compare their endpoints. In each profile open **Proxmox → Nodes**, select a node and look at **Node Information → Cluster name** together with the member names and IPs. Two endpoints serving the same Proxmox cluster inventory can legitimately list the same guests. An endpoint address, a matching node name or VM ID alone does not establish cluster identity.

## Findings corrected

| Area | Finding | Correction |
| --- | --- | --- |
| Overview and Monitoring | A failed Proxmox read could retain hosts and guests from the preceding successful sample while another provider was still scanning. A responding API could also mask offline nodes in the summary. | Failed readings drop their prior inventory. Recent successful readings can remain visible while their own replacement is pending. Summaries account for offline nodes and failed reads. |
| Proxmox → Nodes | The node list and details called every discovered server a cluster member. | Membership now requires both a cluster record and a matching node record from Proxmox. Node Information shows the reported cluster name when available. Missing membership evidence displays **Not reported**. |
| Settings → General and Connections → Remote Access | The homepage, mobile QR code, copied address and open-dashboard buttons used the installation root from a secondary profile. | These links carry the selected profile to the destination browser. QR generation retains its HTTPS checks. |
| Notifications and software updates | A secondary worker could look for the installation updater in its own data directory. | The update bridge uses the controller directory for shared updater state. The test checks that the same software update is visible from both profiles. |
| Downloads | Exports from two clusters with matching guest, disk or container IDs could have identical filenames and no source information. | Secondary-profile report filenames include the profile ID and its display name when available. Overview, discovery, Monitoring, backup reports, audit JSON, network and provider diagnostics JSON include a `sourceCluster` object. Existing CSV columns, file payloads and default-profile filenames are retained. |

## Coverage by area

| Area | Sections and evidence |
| --- | --- |
| Overview | Node and guest counts, inventory, resource readings, refresh, notifications and a downloaded Overview JSON from each profile. The downloaded guest and source profile were checked together. |
| Proxmox | Overview, Nodes, VMs, LXC, Storage, Networks, Tasks & Logs. Node details include Overview, Services, Storage, Network, Tasks, Logs and Configuration. Two endpoints reused `node01`, VM 100 and CT 101. Guest names, CPU readings, storage pools and task owners distinguished the endpoints. |
| Docker | Containers, Images, Volumes, Compose Stacks, Events and Updates. Two Engine fixtures reused a container ID with different names. The audit checked selected-cluster routing and rendered inventory. |
| Storage | Pools, Configuration, Disks, Datasets / Volumes, Snapshots, Shares and Performance. Independent TrueNAS JSON-RPC fixtures returned different pool, dataset and share names. |
| Network | Map, Interfaces, Devices, Routing, DNS, Traffic Analysis and Docker Networks. Device inventory was checked against the selected profile’s guest. |
| Backups | Jobs, Archives, Restore Points, Schedules, Retention Policies and Destinations, plus Reports and the older direct URLs. Each profile returned its own backup job. |
| Monitoring and Alerts | Overview, Provider Jobs, Hardware & Diagnostics, Active Alerts, Alert History and Alert Rules. Creating rules through the API established different rules in each profile. |
| AI Assistant | Page, controls, account access and request scope. External model completions depend on the configured provider. |
| Shell and SFTP | Both pages, target selection and session scope. The SSH fixture returned terminal output and SFTP file metadata. Reusing either session ID in the other cluster returned 404. |
| Users and Audit | Shared accounts and role gating, cluster-filtered audit events, exports and the legacy audit link. Rules created in each cluster were present only in its own audit results. |
| Settings | General, System, Security, Connections, Integrations, Appearance and About. Checked the connection workspaces, remote dashboard addresses, independent saved settings and common account/update routes. System Information describes the i-Clusters API runtime. |
| Action boundaries | The suite used an actual SSH test service, two simulated Proxmox endpoints and PostgreSQL. Only the selected endpoint received the approved VM reboot. The other profile rejected the grant, pairing code and connector token. The restart receipt survived a controller restart. |

## Evidence and limits

The source scan counted 705 JSX button templates across 129 files and found zero missing handlers or invalid form-button wiring under its checks. The mobile layout audit rendered 58 pages and sections at 390 pixels. These counts describe different checks. A button template can appear repeatedly for different resources and roles.

The integration tests use separate Proxmox HTTPS endpoints, Docker Engine endpoint fixtures and TrueNAS WebSockets, a real PostgreSQL database, and real SSH/SFTP protocol exchanges with a test host. They verify cluster-specific results and report provenance without relying on distinct node names or guest IDs.

## Reproduce the browser and control audit

Run from a development checkout with API and web dependencies installed, a built web app, a disposable PostgreSQL database, OpenSSL and the Chromium/Playwright tools used by the repository's layout audit. The integration test creates a temporary database schema and loopback provider fixtures.

```sh
npm --prefix apps/web run build
node apps/web/scripts/audit-controls.mjs
ICLUSTERS_AUDIT_WEB=1 ICLUSTERS_AUDIT_CONTROLS=1 \
ICLUSTERS_AUDIT_OUTPUT=/tmp/iclusters-multicluster-audit.json \
OWNER_SETUP_TEST_DATABASE_URL="$DISPOSABLE_DATABASE_URL" \
ICLUSTERS_BROWSER_TOOLS="$BROWSER_TOOLS_DIRECTORY" \
node --test apps/api/test/multi-cluster.test.js
```

The page pass runs the production frontend against a real controller and isolated worker. It checks API routing and looks for foreign resource names in responses and rendered content. The control pass replays recorded responses for the secondary profile and intercepts writes. Its output distinguishes clicked controls, disabled controls, state-dependent controls, missing fixture reads and intercepted requests. The source scanner inventories button templates separately.

Live host reachability, real backup restoration, device permissions, OS patching and reboots, delivery through external AI or notification services, and provider-specific writes require evidence from the installation where they run.
