# Customer acceptance record

Version: 1.0.0 · Developed by The Adekola Labs.

Copy this checklist into a private customer record. Do not commit customer addresses, credentials, archives or raw logs. Enter the reviewer, date and evidence reference when each installation check is complete.

| Check | Required evidence | Dated evidence reference |
| --- | --- | --- |
| Deployed identity | Exact source revision, controller version, connector versions, host/Compose versions and customer scope | |
| Access | Trusted HTTPS; owner MFA enrollment/recovery; denied roles; logout and device revocation | |
| Providers | Exact Proxmox/Docker/TrueNAS releases; read and permitted write actions on disposable targets; least-privilege failures | |
| Fresh backups | Actual successful jobs from every in-scope node; destination capacity/retention; excluded guests recorded | |
| Guest restore | Restore fresh archive to unused isolated guest ID; boot, inspect representative data and application behavior | |
| Controller recovery | Encrypted off-host archive restored on isolated controller; MFA login, saved configuration decryption, audit/history and connector behavior | |
| Interrupted update | Disconnect browser/network and restart controller at pull, preparation, stop, rename and replacement stages; exclusive recovery and no duplicate mutation | |
| Software rollback | Real failed-image and migration rollback drill on disposable deployment, including failed-rollback handling | |
| Notifications | Actual failure and recovery delivery to each enabled channel; acknowledgment badge behavior | |
| Devices/accessibility | Real iOS Safari, Android and supported desktop browsers; keyboard/screen reader, zoom, navigation and permission-denied wake locks | |
| Load/soak | Intended hosts/containers/users, concurrency, duration, latency percentiles, timeout behavior, memory/disk growth | |
| Security | Review scan reports including unfixed findings; independent authenticated assessment; resolved findings | |
| Operations | Named contacts, maintenance windows, incident process, agreed RPO/RTO, retention/key custody and customer terms | |

CI exercises a separate empty-provider controller, authentication, encrypted restore and bounded concurrent read probes. The installation operator records who accepted the deployment evidence and when.

Use the [private record template](acceptance-record.example.json) and [commercial acceptance procedure](commercial-acceptance.md). After the reviewer examines the evidence, run `node deployment/acceptance-gate.mjs /private/path/acceptance.json` to check that the completed record contains the required fields, dates and references.

The [5 November 2026 live interface review](audits/2026-11-05-live-interface-and-commercial-review.md) identifies the deployed revision and workflows inspected. The [release notes](releases/v1.0.0.md) link to the automated results for the source release.
