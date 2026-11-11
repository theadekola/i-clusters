# Terms of use for the self-hosted application

Updated 11 November 2026 by The Adekola Labs.

## Licence and scope

The [Apache License 2.0](LICENSE) governs the use, modification and distribution of first-party i-Clusters software. It sets out the copyright and patent grants, redistribution conditions, warranty disclaimer and limitations of liability. Bundled dependencies and artwork retain their own licences and attribution. See [third-party notices](THIRD_PARTY_NOTICES.md).

The [website Terms of Service](https://www.i-clusters.com/terms.html) cover browsing the public site, using its forms and making donations. The [website Privacy Policy](https://www.i-clusters.com/privacy.html) explains how the site handles those interactions.

## Your installation

i-Clusters is self-hosted software. The project does not include a managed hosting service, guaranteed uptime, guaranteed recovery, a support response deadline or an individual service-level agreement. A separately operated hosted service may have its own terms, privacy notice and commercial agreement.

The installation operator is responsible for authorizing users, protecting the controller and provider credentials, choosing provider permissions, maintaining backups, installing updates, configuring network/TLS access and following applicable obligations. Users should act only on infrastructure they are authorized to manage.

## Privileged operations

i-Clusters can submit operations that stop services, change infrastructure, delete resources or affect data. Read the selected target and confirmation carefully. A reported queued task is not a guarantee of completion. Provider/API failures, missing measurements and incomplete inventories must be investigated before relying on them. Test recovery on disposable resources and keep independent backups.

AI assistance is read-only and can be inaccurate. Review its suggestions before making changes through other controls. Monitoring and security status displays do not certify security or guarantee detection of every outage or threat.

## External services and charges

You choose and provide access to connected providers, notification channels and AI services. Their availability, terms, permissions and charges are separate from i-Clusters. Tests can send real notifications and AI tests can be billable. See [privacy and data handling](PRIVACY.md) for the information sent by configured features.

## Support and reporting

Use the [repository issue tracker](https://github.com/theadekola/i-clusters/issues) for non-sensitive reproducible problems or feature requests. Do not include credentials or private infrastructure data. For security vulnerabilities, follow [SECURITY.md](SECURITY.md). No specific response time is promised.

## Release and support

Version 1.0.0 is distributed as a source release. The [release notes](docs/releases/v1.0.0.md) link to the automated verification results. Paid hosting, support response times and recovery commitments depend on the operator’s service agreement.
