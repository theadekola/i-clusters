# Release and maintenance policy

Developed by The Adekola Labs.

## Source release and verification

i-Clusters 1.0.0 is available through the source installer. Package manifests, root lockfile entries, build metadata and release notes identify the application version. The Git revision and build number distinguish builds of that version.

The [release notes](releases/v1.0.0.md) link to a passing check run. Each run reports its own source revision, test outcomes, deployment and recovery checks, component inventories and image scan results. Operators can review [workflow runs](https://github.com/theadekola/i-clusters/actions/workflows/checks.yml) for later changes. Scan reports include any unfixed findings.

## Installation channels and tagged releases

The default installer and update service follow the configured branch, usually `main`. For a repeatable source checkout, use an existing tag or commit and record its revision. A detached checkout requires an explicit choice of the next revision before updating.

[GitHub Releases](https://github.com/theadekola/i-clusters/releases) lists published tags and downloadable assets. Automatic tag publication is disabled. Publishing a tag is a separate maintainer action after reviewing the checks for the selected commit. The 3.x tags identify archived development builds that preceded the v1.0.0 source release.

Keep a verified encrypted off-host controller backup, preserve original encryption keys and finish active Docker operations before maintenance. The new upgrade rollback protects the consistent local controller state but does not reverse operations already submitted to providers or data migrations in their applications. See the [recovery guide](../deployment/SECURITY-AND-RECOVERY.md).

## Private acceptance evidence

Release verification is recorded against the tested source revision. For each customer installation, use the [deployment acceptance procedure](commercial-acceptance.md) to record provider versions, guest restore results, physical-device and load tests, and the independent security review. The reviewer examines the evidence and signs off the installation.
