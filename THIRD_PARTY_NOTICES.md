# Third-party notices

The Adekola Labs develops and publishes i-Clusters. Copyright © 2026 The Adekola Labs. First-party source is licensed under the [Apache License 2.0](LICENSE).

Dependencies retain their respective licences. The API and web lockfiles and generated CycloneDX SBOMs identify selected components; consult each distributed package's licence before redistribution. SBOM metadata is an inventory aid, not a complete legal clearance report.

- Technology/OS icons: [brand asset notice](apps/web/public/assets/brands/NOTICE.txt).
- Page artwork: [page asset notice](apps/web/public/assets/pages/NOTICE.txt).
- React, Node.js, Express, PostgreSQL, Vite, Docker, Proxmox, TrueNAS, Caddy and other names/logos remain their owners' marks. Credits do not imply endorsement.

Preserve dependency/artwork notices in source and distributions. Review any customer-specific assets and modifications separately. The source release workflow does not issue a blanket third-party trademark or artwork rights guarantee.

## Controller image customizations

Caddy retains its upstream 2.11.7 source licence and base-image notices; the local build uses Go 1.27.3 and an explicit golang.org/x/net 0.62.0 update. PostgreSQL remains the upstream 17 image with its entrypoint privilege drop switched to Alpine su-exec. Alpine, Go, Caddy, PostgreSQL, su-exec and their dependencies retain their licences. Vendor/author image labels describe this deployment’s maintainer and do not replace upstream attribution.

## Country flag images

Earlier versions of the language picker used regional flag SVGs from [flag-icons](https://github.com/lipis/flag-icons), copyright Panayiotis Lipiridis, under the MIT licence. The original licence is retained in `apps/web/public/flags/LICENSE.txt`.

## Notification channel marks

Slack, Microsoft Teams and IFTTT artwork is sourced from [SVG Logos](https://github.com/gilbarbara/logos) via Iconify Logos 1.2.20. Gotify and Pushover artwork is sourced from [Dashboard Icons](https://github.com/homarr-labs/dashboard-icons). The marks identify their respective services. Discord and Telegram reuse the brand assets listed above. SMTP email and custom webhooks use project-owned protocol symbols.
