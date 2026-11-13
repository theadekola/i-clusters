# Disk configuration and storage contents

Storage → Configuration uses **Configure Disk** to edit an existing Proxmox storage registration or register a detected disk mount. The disk field is a selector. Existing backends retain their backing path, pool and storage type. Content choices are limited to uses supported by that backend: ISO images, backups, disk-image imports, container templates, VM disks, container volumes and snippets, as applicable. Node assignment, enabled state and shared state are configurable. Shared must describe storage that actually has the same backing resource on its assigned nodes.

New directory registrations select a detected mount from the node's Proxmox directory inventory, use that node explicitly and retain Proxmox's mount-point check. They do not format raw disks. Existing files and volumes prevent removing their content type or unassigning their node. Updates use fresh configuration revisions and the Proxmox configuration digest, with the existing administrator confirmation and node password approval.

The eye button opens **Storage Contents**, with a node selector for storage registered on multiple nodes. It shows files and volumes returned by Proxmox's managed-content API, rather than a generic resource-details popup. Backup-only storage opens Backups → Restore Points filtered by storage ID, labelled Backup Datasets. Mixed-use storage includes a link to that filtered page. Counts and file sizes in the filtered archive inventory use the selected storage.

## Importing files

On compatible directory, NFS, CIFS and CephFS storage, **Import File** transfers supported ISO images, container-template archives, or disk-image/appliance files directly to Proxmox's upload API. The import button only offers content types enabled on that storage. VM block storage is not offered ISO or file uploads. Proxmox's native upload API does not provide arbitrary document or snippet uploads; use the node's authenticated SFTP file manager for those.

Imports require an administrator, explicit confirmation and node password approval. A short-lived, single-use upload approval is bound to the user, target node, storage configuration, content type, filename, file size and controller connection. The binary transfer is revalidated before it starts, streamed with backpressure, and bounded by the approved byte count. Credentials remain on the server and existing per-connection TLS verification and CA settings are preserved.

Each import gets a unique destination filename to preserve existing files. The completed response displays that filename. ISO files must end in `.iso`; container templates in `.tar.gz`, `.tar.xz` or `.tar.zst`; supported disk-image/appliance extensions are `.qcow2`, `.raw`, `.vmdk` and `.ova`. Proxmox performs its own content validation. Files are limited to 64 GiB and original filenames to 150 characters, using letters, digits, dots, underscores and hyphens. No VM is created by a file import.

When Proxmox returns an asynchronous task, the UI reports task acceptance and directs the user to task history. Failed or interrupted imports require checking contents before retrying. Upload requests have a longer body deadline; ordinary JSON body reads retain a shorter deadline, and rejected unfinished requests close promptly.

The removed configuration notice and dataset Resource Details popup do not affect the datasets table or Edit workflow. Dataset Quick Actions includes snapshot creation.

Validation covers configuration revisions and digests, compatible content types, detected mount selection, preservation of occupied storage, scoped backup navigation, binary multipart bytes and lengths, user/connection approval binding, rejected requests and the browser workflows. Live disks are not reconfigured by the tests.
