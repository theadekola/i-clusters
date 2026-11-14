# Engineering review of the October 2026 build

Baseline: 20 October 2026 · Updated 21 October 2026 · i-Clusters 3.1.0-rc.3 · Developed by The Adekola Labs.

This archived review records corrections made to the October build and the checks assigned to individual installations. For current usage and verified results, see the [v1.0.0 release notes](../releases/v1.0.0.md).

| Earlier finding | Current correction | Remaining boundary |
| --- | --- | --- |
| No self-service MFA/revocation | Authenticator MFA, recovery codes, password change, device sessions and console recovery | Customer enrollment and account-recovery exercise |
| JavaScript-readable browser refresh tokens/no frontend CSP | Secure HttpOnly refresh cookies and frontend CSP | Short access tokens remain script-readable; independent XSS/authenticated review |
| No controller restore tooling | Encrypted consistent backup, offline history, isolated restore and MFA login drill | Customer off-host retention, connector recovery, measured RPO/RTO |
| Process-local Docker tracking | Encrypted durable checkpoints, interrupted locks, exclusive recovery and restart handling | Live crash injection at every destructive stage |
| Concurrent recovery | Exclusive durable recovering state; competing recoveries/installations rejected; release on error; restart returns to interrupted | Single API process only |
| Recovery success insufficiently checked | Original identity/state/policy/network aliases/static addresses verified | Real provider/host network acceptance |
| MFA renewal race | Renewal restricted to the account generation committed by the MFA transaction | Independent account-security review |
| Release/docs/attribution gaps | Synchronized build versions, policies, notes, company/developer attribution, CI release publication, SBOM/image reporting | Confirm published assets and actual support arrangements |
| No capacity baseline | Bounded CI concurrent-page read probe and acceptance template | Empty-provider CI is not fleet/load/soak certification |

The review used source checks and isolated test resources. Each recorded result applies to its tested commit. The deployment model covered one controller per installation.

## Verification tooling added

The Settings corrections passed automated checks. The follow-up added a completeness check for private deployment records, a bounded authenticated read probe and a Docker crash-recovery drill. The [deployment acceptance procedure](../commercial-acceptance.md) describes how the installation reviewer examines the evidence.
