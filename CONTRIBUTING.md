# Contributing

Developer: The Adekola · Company: ATT-Tech.

Open a focused issue or pull request against the repository. Use SECURITY.md for private vulnerability handling. Do not include customer data or secrets. Keep existing third-party copyright/licence notices and do not add assets without a documented source/licence.

Use Node.js 24 and the existing API/web lockfiles. Run API/UI tests and the production build. Infrastructure writes must retain server authorization, exact target selection, fresh approvals, secret masking and verified outcomes. Test failure, duplicate submission and interruption behavior on disposable fixtures/resources. Preserve offline recovery and existing accounts during migrations.

Before merging, run `node deployment/check-pr-ready.mjs owner/repository PR_NUMBER REVIEWED_HEAD_SHA`.
It rejects drafts, a moved head, incomplete or failed checks, and failing commit statuses.
Merge using that same expected head SHA; do not merge while CI is running. A repository
administrator should also require the `checks` status in the `main` branch protection
rules so this is enforced for every client. The helper does not change GitHub settings.

Update the relevant guide, CHANGELOG, versioned notes and package/lock versions when preparing a release. Never claim a provider/device/version has passed without evidence. CI gates apply before merge; passing fixtures are not live customer acceptance. No contribution transfers third-party rights or grants an SLA by itself.
