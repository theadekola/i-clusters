# Operational monitoring, recovery tests and remote access

These features are available for controlled evaluation. They do not change the commercial acceptance gates or publish a new release.

## Hardware and power

Open **Monitoring → Hardware & Diagnostics**. Update paired node connectors to version 7 through **Settings → Connections → Update Connector**. The connector collects SMART health and local Network UPS Tools readings in a background cycle, waiting one minute between collections. Collection time depends on the number of devices. Freshness is shown separately from measurement availability. Offline, old, waiting and stale connectors do not establish hardware health.

**Install Monitoring Tools** installs `smartmontools` and `nut-client` on Debian/Ubuntu hosts after owner confirmation. It does not configure UPS drivers, an NUT server, battery shutdown policy, disk passthrough or unsupported USB bridges. Configure your actual UPS and vendor shutdown policy separately; no shutdown commands are issued by this feature. Disks that cannot be read show unavailable values. SMART collection requests standby preservation, never starts a disk self-test, and is bounded to 16 devices. Tools/device firmware may not report every measurement.

Fresh failed SMART health and UPS on-battery/low-battery observations generate normal alerts and use existing notification channels. Missing readings do not resolve previous hardware alerts; explicit healthy measurements are required.

## Network and response-time diagnostics

**Run Network Diagnostics** checks fixed HTTPS Docker registry endpoints from the selected paired host. It reports HTTP reachability, DNS lookup, connection and TLS cumulative timings. HTTP 401/405 can establish reachability without proving an authenticated image pull. This does not test every guest, a container's DNS namespace, registry credentials or a complete update. No arbitrary URL scan or DNS/network rewrite is performed.

The same page shows controller GET response median, p95, maximum and failure counts from a bounded in-memory sample over the last hour. Data resets on restart and caps at 2,000 responses. Routes are templates; tokens, query parameters and request bodies are not recorded. These are controller HTTP times, including provider waits; browser rendering, device transit and full fleet load/soak results remain separate.

## Guided recovery tests

Open **Backups → Recovery Tests** as an administrator. Select a VM archive, unused VM ID, destination node and active compatible storage. Read and approve the action confirmation. Restore always requests a stopped VM with unique identity; existing guests are never overwritten. Leave sufficient disk space and RAM.

After the provider task succeeds, **Check Restore & Isolate** removes network adapters, passthrough devices, physical disk paths, custom arguments and host hooks, disables automatic boot, and marks the test guest. The guest must remain stopped until isolation is verified. **Boot Isolated Test VM** is a separate confirmed action and rechecks that marker and configuration. Do not concurrently reconfigure or replace the test VM outside i-Clusters; provider administration can bypass this workflow.

Use the Proxmox console to inspect important files, database recovery and application services. A running VM alone is not data verification. **View Verification** requires explicit file/service checks and evidence notes before recording a user-confirmed success. Keep credentials and private contents out of notes. The workflow retains the test VM and record; stop and remove the test VM explicitly through Proxmox after review. It does not automate deletion or reconnect the recovered guest to production networking. LXC, application-specific dumps, off-site copies and disaster recovery of the controller remain separate procedures.

## TrueNAS authentication

TrueNAS monitoring now uses the same safe, actionable diagnostic messages as connection tests. An authentication rejection requires checking the saved API key, expiry/revocation, enabled user account and appropriate API permissions, then testing the connection and refreshing monitoring. Use the API protocol matching the installed TrueNAS version. Manually resolving an alert does not fix authentication. No credentials were changed and no live TrueNAS authentication was tested here.

## Hardware monitoring scope

Temperature collection, displays and alerts have been removed. Legacy connectors' temperature fields are ignored. Update paired connectors to stop their previous collection code. Existing i-Clusters temperature and sensor-fault alerts and their queued notifications are removed during controller startup; unrelated alerts, SMART health and UPS monitoring remain available.

### Monitoring-tool installation approval

**Install Monitoring Tools** opens the same host-credential form used for connector maintenance: paired host address, SSH port, fresh username/password, fingerprint verification and an installation consent checkbox. A typed challenge is no longer used for this action. HTTPS is required before credentials can be entered. The API remains owner-only and validates the selected pairing on the SSH host before package changes. Credentials are used for the action and are not saved.

The fixed host-only operation installs `smartmontools` and `nut-client`, then verifies package status before reporting success. It cannot target a guest or run arbitrary commands. Completion and fresh hardware measurements are separate checks. Closing the popup cannot stop an installation already running; after an interruption, inspect package-manager status on that host before retrying. Package installation is not automatically rolled back. Existing paired connector versions remain compatible because this maintenance operation runs through authenticated SSH.

### Container action approval and Docker network addresses

Container **Stop, Restart, Pause, Unpause and Remove** require a server confirmation challenge before execution. Where the selected Proxmox Docker host has an SSH mapping, the approval popup uses the connector-maintenance layout with fresh root/sudo credentials, host fingerprint verification and explicit consent. A grant is bound to the user, host, container action, method and body and is single-use. Saved passwords do not approve these actions. Connections without an SSH mapping use an explicit confirmation popup rather than requesting credentials for an unidentified host. Removal still requires administrator/owner access. Changing Docker host during a reviewed request cancels its retry; clicking Cancel does not run the container action.

Docker Networks initially shows the full-width table. **View** opens the selected network's details beside it, and **Close** at the top hides those details. Filtering out or removing the selected network closes its panel instead of selecting another deletion target. The former permanent Connected Containers card is removed; **View Containers** remains available within the details.

The table's **Container IPs** come from each container's reported network endpoint (`IPAddress` / `GlobalIPv6Address`). It does not substitute the IPAM subnet or gateway. Subnet/gateway information remains labelled in the details panel. Multiple network attachments may give a container multiple IP addresses. Host networking does not allocate a separate container IP; an absent address stays unavailable. A Docker bridge address is an internal endpoint and does not by itself establish LAN reachability. Published ports are reached through the Docker host as configured by the operator.

### Shell sessions during page navigation

After opening Tools → Shell, its workspace stays mounted within the signed-in application. Navigating to another page hides the workspace while retaining each SSH connection, terminal output, and active session tab. Return to Tools → Shell to resume. Hidden terminals cannot receive clipboard input and do not lock page scrolling.

Use **Disconnect** or a session tab's close button to end that session. Signing out, losing the required admin/owner role, or closing/reloading the application releases the workspace. Existing server inactivity limits, authentication expiry, remote host disconnects, and transport failures still apply. This does not provide detached sessions across browser reloads or server restarts; use a host-side tool such as `tmux` for that purpose. SFTP page lifecycle is unchanged.

### Reporting when a Proxmox node is offline

An offline member remains in the node inventory, but its previous CPU, memory, uptime, guest runtime state and storage readings are not treated as live measurements. Collection continues for online members. Individual node API failures are recorded by section without discarding successful sections.

The Proxmox Overview and Nodes summaries show **Available CPU**, **Available Memory** and **Available Storage** when coverage is incomplete. The coverage line identifies online nodes and measured CPU, memory and storage entries. Charts use available measured storage entries; missing values remain unknown rather than becoming zero. These are per-node storage entries, so shared pools can appear more than once.

Normal automatic polling retries collection. When a node reports online again, its sections are read afresh and successful measurements rejoin the summaries. Manual Refresh requests an immediate update. No node restart or other infrastructure change is needed for reporting recovery.

The configured Proxmox API endpoint must still be reachable. If that endpoint itself is down, configure a reachable cluster member or a separately managed highly available API address in Connections. This change does not introduce automatic endpoint failover or restore cluster quorum.

### Partial reporting across pages

Storage Overview and Datasets show measured capacity, used and available space from successfully read online pools even when full inventory coverage is incomplete. Full-cluster totals remain distinct from these measured subtotals. Offline node registrations remain visible without contributing stale capacity; shared pools are counted once through an available instance.

Dashboard and Network Devices use resource-inventory coverage independently of optional node service failures. VM and CT summaries use paired memory/disk readings from reporting guests. Docker container CPU and memory summaries show how many running containers contributed readings. Network interface, bridge, VLAN, disk, share and snapshot counts describe reported resources when coverage is partial.

Storage, network, DNS and task collection skip explicitly offline nodes, preserve successful reads and retry returned nodes on subsequent automatic polling. Backup archive collection already isolates offline nodes and retains accessible archives. Storage Performance refreshes automatically by default; this can be turned off in its controls. An explicitly selected offline target remains distinct from another host; selecting or reporting another node never redirects management actions to it.

To verify without disrupting services, use an already unavailable node: compare the available node's cards and resource rows with its provider API, confirm the missing-node notice, then observe normal polling after that node is restored by its administrator. Manual Refresh can request an immediate reread. Do not shut down production nodes merely to exercise these checks.

### Clearing alert history

Admins and owners can use **Alerts → Alert History → Clear History**, beside the date-filter Apply button. In the popup, choose From and To dates and either **Clear now** or **Schedule once**. Both dates are inclusive in the browser's local timezone, and the range applies to each alert's triggered date. The review popup shows the current matching count before confirmation.

Only resolved records are removed. Active and acknowledged alerts, alert rules, provider data and audit logs are preserved. Clearing cannot be undone; Export History first if a copy is needed. Scheduled matching counts may change before execution as more records are resolved.

One-time schedules are stored durably, listed in the popup and can be cancelled before execution. The server executes due schedules on its normal monitoring tick; a missed schedule runs after restart. Maintenance pauses execution. Completed schedules record their completion time and removed count. This is a bounded one-time date-range operation, not recurring retention or backup cleanup.

### Opt-in automatic connector updates (protocol 9)

In Settings → Connections, open a paired node's Connection Health and expand Update paired connector. Owners can explicitly enable Automatic connector updates for that node. The policy is disabled by default and is stored per pairing. Existing protocol 8 and older connectors need one manual update to install protocol 9 support. Initial installation and pairing still require suitable host access; subsequent routine updates use the existing outbound pairing without storing or requesting SSH credentials.

An enabled connector offers update readiness only after its read/write queues have drained. The controller also checks pending work and allows one automatic update at a time, followed by a 30-second stagger after successful verification. New reads remain queued during the brief update lease; management writes are rejected with a retryable maintenance message. Offline nodes become eligible when they reconnect and are idle. A failed or unverified update pauses that release's rollout until an owner inspects it and authorizes a retry. Revoking a pairing releases its tracking lease. Controller maintenance prevents new offers.

Updates contain only the connector source bundled with the installed controller. The connector requires its configured HTTPS controller, verifies a pairing-bound HMAC manifest, node identity, request nonce, expiry, SHA-256 digest, Python syntax and protocol version, and rejects protocol downgrades. This authenticates the paired controller's bundle; it is not an independent publisher signing service. Keep the controller, pairing credentials and host clocks secure.

The connector saves its prior script, preserves the configuration byte-for-byte, arms an independent systemd rollback timer, atomically replaces its own script and reloads its own process. A fresh paired heartbeat must match the offered revision before the rollback receipt is marked verified. Verification acknowledgements are repeated to tolerate lost responses. The controller releases the update lease only after the connector reports its durable verification receipt; queued work cannot start merely because a new process sent its first heartbeat. Without verification, the timer restores the prior script and restarts only iclusters-node-agent.service after approximately 60 seconds. Recent discovered-host identities are carried across the process reload for up to 120 seconds while fresh discovery runs. Live workload measurements still come from provider reads.

No Proxmox node, VM, container or Docker service is restarted by this updater. Pairing is retained. A brief monitoring delay is possible, and network, disk or systemd failures cannot be guaranteed interruption-free. Backups and external host recovery access remain useful. Disabling automatic updates prevents future offers; an already offered update is allowed to finish verification. Automatic updating requires the standard root-owned Linux/systemd connector installation.

Check the per-node state and fresh heartbeat after enabling. A completed state verifies that the offered revision reported back, not that every guest service was tested. Review failed/unverified states before Authorize retry. For manual recovery, inspect iclusters-node-agent.service and the private /var/lib/iclusters-connector-update directory. Do not delete or replace the pairing configuration to repair an update. Source tests use isolated fixtures; no live connector rollout is performed during development.

## Mobile dashboard and installation

The Remote Access tab includes a local QR encoder and a responsive mobile-access card. The dashboard QR contains only an HTTPS origin and `/?install=1`, never a session token, password. Scanning opens the normal dashboard sign-in in the phone browser. Use the same Wi-Fi, and a dashboard name/address reachable from that phone with a trusted TLS certificate. A QR code does not provide public hosting, certificate trust.

Android offers an explicit **Install i-Clusters** action when the browser supplies its installation event. The event is used only after a user gesture and is single-use. If unavailable, the page provides browser-menu instructions. iPhone/iPad show **Share → Add to Home Screen**, with **Open as Web App** when available. Installed/standalone windows suppress the prompt. The prompt is also available before sign-in for scanned links. Installation remains subject to device/browser eligibility and trusted HTTPS.

The service worker handles navigation network failures with a connection notice. It does not cache HTML, API responses, keys or credentials and does not intercept API requests. It supplies no offline authenticated dashboard.
