# Row selection and explicit actions

This follow-up replaces the interaction policy in the earlier resource-interaction audit. Clicking ordinary row content selects a record. Where a row has an action button, only that button opens its popup or section details. A resource row without an action button continues to open its existing inspection destination directly.

## Live audit

The connected browser was used to revisit all 13 primary navigation destinations and the resource tabs in Docker, Proxmox, Storage, Network, Backups, Alerts, Users and Settings. User detail tabs were also visited. These were read-only checks: no service operations, installations, backup runs, account changes or settings saves were performed.

On the installed version, n8n's port cell opened Container Actions immediately. Image size and volume folder cells also opened inspection immediately; their Inspect buttons opened the same corresponding dialogs. Storage configuration names navigated directly to contents, while the View contents action also worked. These demonstrate the behaviour this change replaces. VM rows had no action column and selected their corresponding inline details directly, which remains supported.

No visible alert banners were observed in the sampled tab states and the browser reported no captured console errors. Empty inventories and transient loading states could not demonstrate live row selection. These observations do not claim that every management operation was executed against production.

## Corrections

- Each resource table has an independent, exclusive row selection. Selecting another row clears the previous selection in that table.
- Data cells and resource names select rows without inspection reads, popup opening, or management requests when an action control exists.
- Existing name controls are rendered as ordinary row content. The nested outlined selection box is removed; one highlight spans the selected row instead.
- Explicit actions retain their original callbacks and targets. Inputs, checkboxes, switches, links and disclosure controls keep their own behaviour.
- Enter and Space follow the same policy as mouse or touch activation. Keyboard focus remains visible on the row.
- Rows without action controls retain direct access to their existing read-only inspection destination.
- Restore points now have a separate View action available to viewers. Viewing a restore point does not submit a restore or open its restore workflow.
- Whole-section hover effects remain removed.

## Validation

All 678 frontend tests and the production TypeScript/Vite build passed. The control audit found no wiring issues across 691 button templates in 121 source files. Browser fixture checks passed at 320, 390, 430, 768 and 1280 pixels, covering selection without popups, explicit inspection, keyboard selection, independent action controls, popup layout, and the absence of nested name buttons.

The regression suite additionally covers single selection within one table, independent selection across tables, disabled actions, checkboxes, exact container action targets, and direct activation of actionless rows. Browser fixtures use isolated data and reject management writes.

The merged software update must be installed before the corrected behaviour can be verified on the live controller.
