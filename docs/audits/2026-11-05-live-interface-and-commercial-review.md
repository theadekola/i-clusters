# Live interface and commercial preparation review

Date: 2026-11-05. Product: i-Clusters. Status: **evaluation; commercial acceptance remains pending**.

## Evidence boundary

The authenticated live controller was inspected in the user's connected Chrome browser. It reported source revision `38b8729a86fd5caf17f11f929c37f3c300d64ba7`, build `20261105204214-38b8729a86fd`, version `1.0.0`. This is the pre-change deployment. The changes in this review were validated locally against the production web build and fixture APIs; the live controller was not updated during the audit.

Live inspection was read-only: navigation, tabs, filters, existing Docker host selection, mobile navigation and inspection dialogs. No provider power, create/delete, backup/restore submission, software installation, notification delivery, user save, SSH connection or SFTP transfer was executed. The original Docker selection, desktop viewport and Monitoring view were restored. Private addresses, customer names and raw inventory/logs are excluded from this report.

## Live coverage

| Area | Views inspected |
| --- | --- |
| Overview | Dashboard |
| Proxmox | Overview, Nodes, Virtual Machines, LXC Containers, Storage, Networks, Tasks & Logs |
| Docker | Containers, Images, Volumes, Compose Stacks, Events, Updates; Images/Volumes/Updates also checked with a second existing host |
| Storage | Storage Pools, Configuration, Disks, Datasets / Volumes, Snapshots, Shares, Performance |
| Network | Network Map, Interfaces, Devices, Routing, DNS, Traffic Analysis, Docker Networks |
| Backups | Backup Jobs, Backup Archives, Restore Points, Schedules, Retention Policies, Destinations, Reports |
| Monitoring | Overview, Provider Jobs, Hardware & Diagnostics |
| Alerts | Active Alerts, Alert History, Alert Rules |
| Users | Accounts, Audit Logs |
| Settings | General, System, Security, Connections, Appearance, About; Connected, Needs Setup, Notifications and Remote Access connection sections |
| Tools | AI landing view, Shell landing view, SFTP landing view |
| Phone viewport | 390 × 844: Monitoring, Storage, Backups, Alerts, Settings General, SFTP and navigation menu |
| Popups | Storage pool inspection; Restore to New Guest opened and cancelled, destination/ID selectors present with no horizontal overflow |

No visible error banners or whole-page horizontal overflow were observed in these views. Browser error/warning logs were empty at the sampled checkpoints. This does not establish that every API, destructive button, permission combination or provider failure has been exercised.

## Findings and corrections

1. Monitoring provider links appeared below the title. They now share the period/action toolbar; the diagnostics link remains restricted to owners/admins.
2. Live title sizes varied from about 21px to 27px; tab sizes varied from 11px to 13px and card headings also differed. A [shared typography scale](../interface-typography.md) now covers pages, sections, panels, tabs, body text, controls and captions. Narrow layouts wrap controls; xterm helper metrics remain untouched.
3. All 13 icon-only collapsed sidebar links lacked accessible names. Each now retains its translated label through `aria-label` and a collapsed-state title.
4. About inferred “Versioned release” from a plain semantic version despite paused publication. It now explicitly says “Evaluation build” and records that deployment acceptance remains pending, in all five supported languages.
5. The dependency audit identified a moderate Vite development-server advisory. Vite was upgraded to 6.4.5. See [GHSA-8g5g-mxqh-grgj](https://github.com/advisories/GHSA-8g5g-mxqh-grgj). This advisory concerns exposed development servers, not evidence of an exploited live production server.

## Verification

- API automated suite: 613 passed, zero failed.
- Web automated suite: 704 passed, zero failed, including toolbar permissions, collapsed navigation labels and evaluation-status regressions.
- Node-agent Python suite: 35 passed.
- Static control inventory: 683 button templates across 125 files, zero static wiring findings. This is not proof of every runtime operation.
- Clean web dependency installation and production TypeScript/Vite build passed. All five language packs contain 6,819 entries and passed catalog validation.
- API and web production npm dependency scans reported zero known findings at audit time; the full web scan also reported zero after the Vite patch. This does not cover unknown vulnerabilities or replace the runtime-image scans retained by CI.
- Installer and deployment shell scripts passed syntax checks.
- Popup geometry passed at 320, 390, 430, 768 and 1280px.
- The production fixture route audit inspected 58 route variants at each of 1280, 768, 390 and 320px (232 layouts). It found only the Diagnostics title mismatch, which was corrected to a semantic page h1 and passed a targeted rerun at all four widths. Six additional Monitoring/About/DNS layouts at 1760/390px passed and the screenshots were visually inspected. The complete audit is now required in CI, checking runtime errors, page/control overflow, shared title/tab/panel sizes and named navigation.

## Deployment observations and remaining acceptance

The production build still emits a non-failing warning for chunks over 500kB, including lazy language packs. Measure first-load and language-switch performance under customer network conditions before a performance commitment; this patch does not claim to remove that warning.

Hardware diagnostics clearly reported unavailable/unconfigured SMART/UPS tooling. Configure only the intended host tooling and record supported devices before promising hardware monitoring coverage.

The live performance view contained a small, in-process request sample: nine Docker samples with p95 around 4.3 seconds, and network p95 around 1.8 seconds. Provider wait time can affect these requests. These samples do not establish end-to-end latency, capacity or an SLA; investigate under the intended host count and polling load during a controlled soak test.

Publication remains paused under the existing [release policy](../release-policy.md). No tag or release assets were published. Before commercial approval, complete a private dated [acceptance record](../acceptance-checklist.md) for the exact deployment:

- Disposable real-provider lifecycle and least-privilege failure checks across supported versions.
- Fresh backup and isolated guest restore with representative application/data checks; encrypted off-host controller restore and key custody.
- Interrupted updates, rollback and recovery drills on disposable deployments.
- Explicitly authorized notification failure/recovery deliveries to each enabled channel.
- Real iOS/Android and desktop browser testing, keyboard, screen reader and zoom checks. Viewport emulation is not a physical-device test.
- Intended-scale load/soak results, timeouts, memory/disk growth and measured latency targets.
- Independent authenticated security assessment, dependency/image findings review, licence/artwork review and agreed remediation.
- Named operator/support contacts, maintenance windows, incident handling, RPO/RTO, privacy responsibilities and customer terms.

Passing automated checks supports evaluation of this revision. It does not certify commercial readiness or complete customer-specific acceptance.
