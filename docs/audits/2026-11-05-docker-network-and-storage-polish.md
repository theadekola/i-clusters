# Docker, Network and Storage live follow-up

Date: 2026-11-05. Baseline: `073b55debec0ba4e18397b0770f8d904052fbb94`.

The authenticated live controller reported build `20261105222921-073b55debec0`. Navigation, visible typography, headers and browser warning/error logs were inspected read-only. No container action, storage enable/disable, user edit, terminal session, file transfer or provider mutation was submitted. The original Settings General view was restored.

## Findings and changes

- The Docker Containers heading used a wrapping flex row inside a narrow grid column. Its connection badge dropped below the host name. A dedicated title/status group now keeps them aligned, gives the title column more room and moves selectors/actions below it at narrower desktop widths. Long host names wrap inside the title rather than moving the badge to a separate row.
- Storage Configuration had no summary cards. Four cards now precede the tabs: storage registrations, enabled registrations, shared registrations and backup targets. Counts come from the complete cluster configuration inventory, independent of the table search. Configuration status does not claim node availability or capacity. Missing flags remain unknown; partially reported fields are labelled as reported counts. Failed/stale reports use the shared summary state rather than fabricated zeroes.
- Shell, SFTP Files and Users retained an extra inline legacy path below the shared breadcrumb. The three redundant labels are removed; the shared page path and page titles remain.
- All six Docker resource tabs and all seven Network views were inspected live. Their primary tab labels already computed to the shared 14px size and page headings to 28px on this deployed baseline. Network Interfaces/Devices inner tabs also used 14px. Removed conflicting legacy 13/12/11px per-view tab declarations so the shared scale remains the single source. Browser regression checks now verify tab weight as well as size across route changes.

No visible error banners, whole-page horizontal overflow or browser warning/error logs were observed during this focused live audit. Initial cached/refreshing states were treated as pending data, not connection failures.

## Validation

The production web build and all five language packs (6,824 entries each) passed locally. All 706 web tests passed; static inventory reported zero wiring findings across 683 control templates. Targeted workflow tests cover the aligned badge, configuration count coverage, complete empty inventories, missing fields and unavailable reads. Responsive browser checks cover the 17 requested route variants at 1760, 1280, 768, 390 and 320px, including title/status alignment, card placement, removed legacy labels, uniform tab typography and overflow. All 85 targeted layouts passed. Storage Configuration passed an additional five-width rerun after the final data-coverage handling and fixture correction. A final seven-width Docker breakpoint check (1760, 1400, 1399, 1280, 768, 390 and 320px) passed after visual review caught the short host-name wrap at 1280px. Desktop and phone screenshots were visually inspected. Popup geometry passed at five widths. CI repeats the full application route audit, suites, deployment/recovery drills and security gates before merge.

Live observations describe the baseline deployment. The corrected source is tested against the production web build with fixture APIs; it is not automatically installed on the user's controller. This follow-up does not change the outstanding commercial acceptance requirements in the [main review](2026-11-05-live-interface-and-commercial-review.md).
