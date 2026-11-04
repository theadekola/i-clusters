# Automatic SSH host verification

SSH dialogs automatically obtain and check the server host key. The manual fingerprint panel and its checkbox are no longer needed. Verification is mandatory before an operation, and the SSH handshake checks the key again before credentials can be sent. An unavailable host, corrupt trust record, changed key or mismatch with an existing saved connection blocks the connection.

Existing verified saved SSH fingerprints constrain enrollment. Other new endpoints use trust on first use: the first observed public host key is recorded, and all subsequent connections must match it. First contact establishes trust; it is not independent proof of the server's identity. Enroll new endpoints over your trusted LAN or VPN, or retain an already verified saved connection. Password/root/sudo approval and installation consent remain separate requirements.

The persistent registry is `runtime/ssh-known-hosts.json`, restricted to the application account. It contains public fingerprints and endpoint addresses, not SSH passwords or private keys. Keep it with the controller runtime and recovery backups. Host and port identify an endpoint, and changing an address creates a new endpoint. Host-key algorithm changes can also require a deliberate trust update.

A changed key is never accepted automatically. Check the host from its trusted console and investigate unexpected changes. After a legitimate rotation, stop the controller API and update only that endpoint's known-host fingerprint and any matching saved connection through an administrator-controlled maintenance procedure. Retain a recovery copy of the original registry; do not delete the whole registry to bypass a mismatch.
