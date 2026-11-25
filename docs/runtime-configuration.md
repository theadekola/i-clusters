# Runtime integration configuration

Owners configure Discord, Telegram, SMTP, Slack, Microsoft Teams, Pushover, Gotify, custom webhooks and IFTTT under Settings → Integrations. Configure TrueNAS under Settings → Connections.

1. Open Configure and enter the endpoint and required credentials.
2. Click Save Configuration. Changes apply without restarting i-Clusters.
3. Use Test Connection. Notification tests explicitly ask before sending a real message; provider tests perform only a read. All configuration popups can test the entered details before saving. Testing never saves or enables an integration; blank secret fields retain the saved credential for the test.
4. Enable configured notification channels using their delivery switches. A saved configuration is not evidence of successful delivery or provider permissions.

The popup retains entered values after a failed save. Closing a changed form asks before discarding. Saved tokens and passwords are never returned; blank secret fields retain their previous value. An optional SMTP password can be explicitly cleared together with its username. Disconnect overrides both saved and legacy environment credentials and stops i-Clusters use of that integration. It does not delete external resources.

## Fields and transport

- Discord: an HTTPS webhook on discord.com.
- Telegram: bot token and chat ID.
- SMTP: hostname, port, optional username/password, sender, recipient and optional trusted PEM CA. Port 465 uses implicit TLS; all other ports require STARTTLS. TLS verification stays enabled.
- TrueNAS: HTTPS origin, API key, current/legacy protocol and optional trusted PEM CA.

The application still requires normal database, signing-key and deployment bootstrap configuration. This feature configures supported service connections rather than rewriting deployment files. See [notification channels](notification-channels.md) for provider setup, individual alert cards and per-channel severity/recovery selectors. Browser push is not implemented.

## Storage and APIs

Credentials are AES-256-GCM encrypted under DATA_DIR/configuration using the existing JWT_SECRET key protection. Files are replaced atomically with mode 0600. Preserve the existing signing key and data volume during application updates and backups. Existing environment values remain a fallback until the service is saved or disconnected in i-Clusters.

Owner-only authenticated endpoints:

- GET /api/configuration/:service returns field metadata, nonsecret values and secret-presence flags.
- PUT /api/configuration/:service validates and saves known fields; unknown fields and services are rejected.
- DELETE /api/configuration/:service saves a disabled override.
- POST /api/configuration/:service/test checks the saved connection, or accepts a configuration object to validate and test an unsaved draft for any supported notification channel, or TrueNAS. Notification tests require `confirm=true`.

Mutations use the existing audit and cache-invalidation mechanisms. Audit results contain only masked configuration or sanitized test results. Tokens, passwords and webhook secrets are not written to audit records or returned in errors. Failed tests do not report success, restart guests or grant privileges. Test notifications are recorded in delivery history without connection secrets. Safe errors identify common SMTP authentication/TLS problems, Telegram chat/token failures and Discord webhook/rate-limit failures.

## Connection test feedback

Configuration dialogs show testing, success and failure feedback beside their
action buttons. Results receive focus and scroll into view. Testing a draft keeps
the form open for Save Configuration; testing an already saved connection uses
the existing success message and automatic close. Invalid protocol values show a
required choice instead of silently displaying a different first option.

TrueNAS uses `current` for JSON-RPC and `legacy` for the older API. Existing
`TRUENAS_API_MODE=jsonrpc` environment or saved values are accepted as an alias
for `current`, including when testing or saving an unchanged protocol.
