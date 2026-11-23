# Connect and manage Proxmox in i-Clusters

Open **Settings → Connections → Add Connection → Proxmox** as an i-Clusters owner. Use the Proxmox API address that the i-Clusters controller can reach. The usual API port is `8006`.

## Choose connection access

| Mode | Proxmox role to assign | What users can do in i-Clusters |
| --- | --- | --- |
| Monitoring only | PVEAuditor | Read inventory, status and metrics. |
| Management | PVEAdmin | Use supported VM and container operations, such as power actions and configuration, subject to effective permissions. |

Use **Monitoring only** when your team needs visibility. The **Management** verification checks inherited cluster-level privileges and permissions on the guests visible to the token. Node shutdown and Proxmox access-control changes have separate permission requirements.

## Create a dedicated user and token

1. In Proxmox, open **Datacenter → Permissions → Users → Add**. Create an enabled user named `iclusters` in the **Proxmox VE authentication server** realm. The resulting user ID is `iclusters@pve`.
2. Open **Datacenter → Permissions → Add → User Permission**. Set **Path** to `/`, select `iclusters@pve`, choose **PVEAuditor** or **PVEAdmin**, and enable **Propagate**.
3. Open **Datacenter → Permissions → API Tokens → Add**. Select `iclusters@pve`, enter a token name such as `hub`, and keep **Privilege Separation** enabled. Copy the full ID `iclusters@pve!hub` and store the one-time secret securely. If you set an expiry, plan to rotate the token before that date.
4. Open **Datacenter → Permissions → Add → API Token Permission**. Select `iclusters@pve!hub`. Use path `/`, the same role and **Propagate**.
5. In i-Clusters, select the corresponding connection mode. Enter the name, hostname or IP without a URL scheme or port, API port, full token ID and secret. Choose **Test Connection** to check the settings, then **Save** to verify and store them. A failed check preserves your existing connection.

With privilege separation, the token can use only permissions granted to both the account and the token. This setup creates one user, one token and two permission entries. The `@pve` identity is for the Proxmox API. Use a Linux account and its own credentials for SSH.

Enable Proxmox certificate verification wherever the connection form offers it. If Proxmox uses a private CA, provide the issuing public CA certificate. Re-enter the token secret when editing. Test a replacement token in i-Clusters before revoking the old one in Proxmox.

## Troubleshoot permissions

- **Invalid credentials or HTTP 401:** Verify the full ID, token secret, account status and expiry. If the secret was lost, create a replacement token.
- **Permission denied or HTTP 403:** Check both permission entries, including **Propagate**. Review any more specific ACLs on the resources named in the error.
- **Console denied:** The effective Proxmox token needs **VM.Console** for that guest or **Sys.Console** for a node. Check the i-Clusters account's permission as well.
- **Missing guest details:** For VM guest OS information, verify that QEMU Guest Agent is enabled and running inside the VM. Pair Docker separately to manage the Docker Engine.
- **Certificate or network error:** Verify port `8006`, API connectivity from the controller and the certificate name or CA.

Administrators who prefer the Proxmox shell can inspect effective permissions with `pveum user permissions iclusters@pve` and `pveum user token permissions iclusters@pve hub`.

## Nodes and services

In **Proxmox → Nodes**, choose a node to inspect resource usage, storage, services and provider status. Check whether the node is online before opening its console or submitting tasks. Host actions require the corresponding i-Clusters and Proxmox permissions.

## Virtual machines

In **Proxmox → Virtual Machines**, filter by node or power state, then open a VM to inspect resources and configuration. Use **Console** for the guest display and **Shell** for SSH. Check **Tasks & Logs** after submitting a lifecycle, snapshot or backup action.

## LXC containers

In **Proxmox → LXC Containers**, select the container and verify its node and status before changing configuration. **Console** opens a running container even before guest SSH is available. If SSH is rejected or unavailable, **Open Proxmox Console** appears in Connection Settings when the guest console can be opened.

## Proxmox storage

In **Proxmox → Storage**, inspect pools, usage and configured content types. Check the target node and available space before selecting storage for a guest, ISO, template or backup.

## Proxmox networks

In **Proxmox → Networks**, select the node to inspect its reported interfaces, bridges and VLAN configuration. Keep a separate management connection available when changing the interface used to reach Proxmox.

## Tasks and logs

In **Proxmox → Tasks & Logs**, find the task on the node that accepted it. Open its log to confirm the outcome of a power, creation, snapshot or backup action.

## Switch between clusters

1. Sign in as the installation owner and open **Switch cluster** beside the navigation toggle. An existing installation shows its current Proxmox connection here automatically.
2. Choose **Add cluster**. Give the cluster a recognisable name and enter one reachable Proxmox API endpoint, its token ID and its secret. TLS verification is enabled in this form. Supply the issuing public CA certificate for a private CA. **Test Connection** previews discovery and checks permissions. **Save** repeats those checks and saves the profile.
3. Close the success message to open the new cluster. Use the header button to return to any saved cluster. The header and the list show each cluster’s connection status beside its name. Select a different cluster, check its name and endpoint, then choose **Yes** to switch or **No** to stay. Online means at least one Proxmox node reports online. Offline means the controller cannot reach the endpoint or all reported nodes are offline. Unknown means the reading is inconclusive, for example after a token or certificate error.

Each browser tab keeps its own cluster in its address. You can bookmark a cluster or monitor two side by side. Switching opens the same main page and clears guest selections. A maintenance task already submitted to Proxmox stays with the cluster that accepted it. Switch back to follow its progress.

Accounts use their installation role by default. An owner can select a non-owner account under Users → Roles & Permissions and assign cluster-specific access up to its account role. Unassigned clusters are inaccessible in this mode. Saving access changes revokes existing sessions. Monitoring history, audit views, connector pairings, Docker hosts, SSH approvals, and infrastructure operations belong to the selected cluster. Configure each cluster's integrations there. Pair one connector per node where needed, using the instructions generated in that cluster. Register each independent cluster once, using a stable hostname for its API. Removing an added cluster takes it out of the switcher. Adding the same endpoint again restores access to that cluster’s saved history and pairings.

The controller must be able to reach each Proxmox endpoint and any SSH targets used for management. Connectors must be able to reach the controller over HTTPS. Back up the entire controller runtime, PostgreSQL database and original encryption secrets together. Additional profiles live under the runtime's `clusters/` directory. The original connection keeps its existing files, URLs and connector addresses.

See the [multi-cluster reporting audit](audits/2026-11-12-multi-cluster-reporting.md) for the page coverage, fixes and steps to compare two endpoints.

### Guest console

Open **Console** on a running VM or LXC container to access its Proxmox display inside i-Clusters. The controller opens the display using the selected cluster's management connection. The Proxmox user and its privilege-separated API token need **VM.Console** on that guest. The console is available before guest networking or SSH is configured. **Shell** opens an SSH session.

The embedded viewer uses [noVNC 1.7.0](https://github.com/novnc/noVNC/tree/v1.7.0), distributed under the [Mozilla Public License 2.0](https://www.mozilla.org/MPL/2.0/).
