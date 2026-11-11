# Connect Proxmox in one save

Sign in to Proxmox as an administrator and create one user and one API token. Use the Proxmox VE authentication server (`pve`) realm. The user and its privilege-separated token each need their own PVEAdmin permission entry.

1. Open **Datacenter → Permissions → Users → Add**. Create an enabled user such as `iclusters` in **Proxmox VE authentication server (pve)**.
2. Open **Datacenter → Permissions → Add → User Permission**. Set Path `/`, User `iclusters@pve`, Role **PVEAdmin**, and enable **Propagate**.
3. Open **Datacenter → Permissions → API Tokens → Add**. Choose that user and a token name such as `hub`. Keep **Privilege Separation** enabled. Ensure the token is unexpired. Copy the full token ID and secret immediately; the secret is displayed only once.
4. Open **Datacenter → Permissions → Add → API Token Permission**. Set Path `/`, Token `iclusters@pve!hub`, Role **PVEAdmin**, and enable **Propagate**.
5. In i-Clusters, enter the cluster name, Proxmox hostname/IP without a URL or port, API port (normally `8006`), full token ID and secret. Click **Save**.

These are two permission assignments, not two users or two tokens. Save verifies inherited cluster management and the effective permissions of visible nodes, VMs and CTs before replacing the connection. It enables the existing management flows and starts loading cluster inventory. Missing permissions stay in the same form with instructions; a failed check preserves the previous connection. There is no follow-up power-access popup or second administrator login.

PVEAdmin supports VM/CT power and configuration but does not grant Proxmox ACL administration or node shutdown. More-specific permission restrictions can still limit a guest. Guest OS information needs a QEMU Guest Agent, and Docker hosts require their separate connector or Engine connection. A `pve` account is not a Linux SSH account. Existing action approvals remain in effect.

New connections accept self-signed HTTPS certificates. Editing retains the existing verification policy and retains a saved CA only for the same host and port. Secrets are encrypted on the server and are never returned to the browser; re-enter the token secret when editing.

Reference: [Proxmox user management and API tokens](https://pve.proxmox.com/pve-docs/pveum.1.html).

## Switch between clusters

1. Sign in as the installation owner and open **Switch cluster** beside the hamburger menu. An existing installation shows its current Proxmox connection here automatically.
2. Choose **Add cluster**. Give the cluster a recognisable name and enter one reachable Proxmox API endpoint, its token ID and its secret. TLS verification is enabled in this form. Supply the issuing public CA certificate for a private CA. **Test Connection** previews discovery and checks permissions. **Save** repeats those checks and saves the profile.
3. Close the success message to open the new cluster. Use the header button to return to any saved cluster. The button shows the current cluster name. The list shows its endpoint to distinguish clusters with similar names.

Each browser tab keeps its own cluster in its address. You can bookmark a cluster or monitor two side by side. Switching opens the same main page and clears guest selections. A maintenance task already submitted to Proxmox stays with the cluster that accepted it. Switch back to follow its progress.

Accounts and roles are shared across the installation. Each account has its existing role on every saved cluster. Monitoring history, audit views, connector pairings, Docker hosts, SSH approvals, and infrastructure operations belong to the selected cluster. Configure each cluster's integrations there. Pair one connector per node where needed, using the instructions generated in that cluster. Register each independent cluster once, using a stable hostname for its API. Removing an added cluster takes it out of the switcher. Adding the same endpoint again restores access to that cluster’s saved history and pairings.

The controller must be able to reach each Proxmox endpoint and any SSH targets used for management. Connectors must be able to reach the controller over HTTPS. Back up the entire controller runtime, PostgreSQL database and original encryption secrets together. Additional profiles live under the runtime's `clusters/` directory. The original connection keeps its existing files, URLs and connector addresses.
