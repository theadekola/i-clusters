# Resource interaction audit

The connected browser was audited on 4 November 2026 before this change was deployed. All 13 primary navigation destinations were opened. Resource tabs were visited in Docker, Proxmox, Storage, Network, Backups, Alerts, Users and Settings, including user detail tabs.

## Live findings

- Docker container port cells did not open details. The same container's action button opened the correct details and actions dialog.
- Compose stack status cells did not select the stack. Its View button selected the correct stack.
- Image and volume Inspect buttons, the node View button and Monitoring service inspection opened their corresponding details.
- Docker, Proxmox, Storage, Network, Backup, Alert, User and Settings navigation responded. No visible alert banners were observed in the sampled tab states. Some inventories were empty, so those pages could not demonstrate live row selection.

No live service operations, installations, deletions, backup runs, account changes or settings saves were performed. This is an interaction audit, not a claim that every management operation was executed against production.

## Corrections

Resource rows now open their existing inspection destination from all ordinary data cells. Enter and Space work on focused rows. Resource name buttons remain available. Buttons, links, labels, checkboxes, switches, disclosure controls and form inputs keep their independent behaviour and do not also trigger row inspection.

The shared correction applies to Docker resources, storage resources, network resources, services, alerts, users, audit events and shared data tables. Older VM, CT, Proxmox task/storage, backup, schedule, retention, destination, report, notification and storage configuration tables now use the same row behaviour. Compose service rows open their existing logs view. Backup archive rows navigate to the existing restore-point view without submitting a restore.

Alert rules have a read-only details dialog and View action available to viewers. Editing, toggling, duplication and deletion retain their existing permission checks and separate controls.

Whole-section hover colours remain removed. Static summaries, chart measurements, technical preview records and explanatory text are not given artificial actions.

## Verification

- Regression tests cover resource cell selection, the correct target, keyboard access, independent nested controls, viewer permissions and container action targeting.
- All 677 frontend tests passed, including new interaction and permission regressions. The production TypeScript/Vite build passed. The control audit found no wiring issues across 691 button templates in 121 source files.
- The isolated Chromium harness passed resource cell clicks, name buttons, explicit View actions, keyboard access, popup layout and unchanged section hover surfaces at 320, 390, 430, 768 and 1280 pixels.

The live installation needs the merged software update before the new row behaviour can be verified there.
