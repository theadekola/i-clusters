# Settings

Settings uses one primary location for each group of controls. Related tabs link to that location rather than repeating its form, credentials or action panel.

| Tab | Primary responsibility |
| --- | --- |
| General | Instance name and description, regional display, refresh preferences, dashboard widgets, runtime information, browser maintenance, settings restore and owner-only provider compatibility checks |
| Security | Authentication/access policy, current browser session, audit preview and audit history |
| Connections | Provider credentials, pairing, health and verification; Notifications workspace for delivery configuration and history |
| Appearance | Theme, accent, sidebar, density, fonts, backgrounds, radius and motion preferences |
| About | Product description, version/update controls, credits, licensing, project resources, legal information and developer details |

## Editing and persistence

Site Information is read-only. Administrators and owners can edit Refresh Preferences. Valid changes to the refresh interval save on field blur (or Enter), without edit/save icons; typing alone and unchanged values do not write. Saves are serialized and merge fresh server settings so independent sections cannot overwrite each other. Rejected writes retain the draft and show an error; leaving the field again retries. Dashboard switches apply immediately.

General → Backup & Restore has no duplicate editable fields or edit/save icons. Import validates and previews a whitelisted general-settings file; Restore Imported Settings requires explicit confirmation. Merely choosing a file never restores it. Active Sessions saves its inactivity selection immediately and preserves the previous selection on storage failure. Accent Style and its intensity slider apply immediately without edit/save icons. Other appearance input sections and notification severity retain their scoped editors. Switches retain immediate persistence and failure rollback.

Site name, description and the 15–300 second page-refresh preference require administrator or owner access and are shared. Dashboard widget preferences are saved in this browser and are editable by signed-in viewers. General saves do not rewrite appearance or sidebar preferences.

Appearance saves only this browser's preferences and never PUTs shared settings. Light, Dark and System themes are supported; System tracks the device's colour preference while i-Clusters is open. Other options include validated hex accents, solid/gradient accents, intensity, sidebar expansion, section labels, density, supported font families, bounded corner radius, solid/gradient backgrounds and reduced motion. On desktop the sidebar starts as a narrow column of page icons. Select an icon to open its page or expand the sidebar to see the page names. The desktop toggle remembers your choice in this browser. On mobile the navigation opens as a drawer. Terminals retain their own dark palette. Sidebar repositioning and image backgrounds remain unavailable.

## Runtime and maintenance

General displays actual API/container runtime facts rather than physical-host uptime claims. Its browser maintenance actions clear only in-memory API reads, refresh metadata or reload the interface. Reload asks for confirmation because terminals may disconnect. Host reboot, stop-all, factory reset and arbitrary service management are not exposed.

Runtime metadata is not repeated under About. About owns version/update information, while General owns hostname, OS, kernel, architecture, Node.js runtime, uptime and datastore facts. The global header updater remains an application-wide shortcut.

Provider inventory and per-provider health are owned by Connections. General runs explicit read-only API compatibility checks and displays the results. The checks do not create guests, change shares or prove write permissions. Only owners can run them. Failures remain visible and retryable. Compatibility scans have a 20-second overall budget, at most four active reads and two per paired node. Unrun checks are labelled not-checked. Use Diagnostic scope to retry one known Docker host without waiting for the whole fleet.

## Security

Security displays enforced policies without presenting deployment-managed protections as editable switches. It shows role policy, token lifetimes, password requirements, current transport observations and the available current-browser session. It includes optional authenticator MFA, recovery codes, password change and the current user’s revocable device-session inventory. Intrusion detection is not provided.

Sign Out This Browser appears once, under Active Sessions. It revokes this device’s server session and removes its browser credentials. Legacy sessions without a device identity revoke all sessions. The account controls also support explicit all-device revocation. Roles allowed to read /audit can load the preview on request and open Audit Logs for the full returned history. General does not duplicate these session or audit controls.

## Delivery and integrations

Connections → Notifications is the single delivery-management workspace. Owners can open secure configuration forms for all nine supported notification channels, set channel/master switches and severity/recovery preferences, send explicit tests, and inspect delivery history. Failed preference writes restore previous values. Unconfigured channels cannot be enabled.

All-channel tests and individual-channel tests have distinct scopes. Test actions ask before sending real messages. The embedded delivery history includes filters, paging and details without a second channel-configuration panel, dashboard or test runner. It does not send messages on open or refresh.

Links to the former System and Advanced tabs open General. The former Notifications tab opens Integrations.


## Backup and product information

General-settings files contain site name, description and refresh interval. Imports validate and stage only those fields for review before explicit restoration. Credentials, user accounts, application data, browser preferences and infrastructure backups are excluded. Import lives under General → Backup & Restore. Links to the former Backup & Restore tab open that section in General.

About uses reported version facts and verified project links. Build number, UTC date and source revision come from build-time API metadata; development builds without metadata are labelled explicitly. About links to the Apache License 2.0, verified release checks, security guidance, controller terms and privacy documentation, and the public website’s Terms of Service and Privacy Policy. Shared instance-name/description inputs stay in General. Project documentation and issue links are consolidated into Quick Links rather than repeated in a Support card.

All tabs retain responsive layouts, search where applicable and the existing permission checks. Removing duplicate sections does not add new provider capabilities or change live infrastructure.

AI configuration lives under Connections, with the same owner-only popup linked from Assistant. Proxmox storage registration uses one shared form across storage and backup destinations. Backup and snapshot schedule shortcuts open the canonical Schedules editor.
