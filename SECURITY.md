# Security and privacy

## Implemented boundaries

- Services bind to 127.0.0.1. No cloud synchronisation, remote AI calls or remote fonts.
- Requests must use a loopback Host header (blocks DNS rebinding); browser Origins other than the local UI are refused.
- End-of-day reports need the local key file (mode 600) and are refused from browsers. Payloads are validated: absolute folder paths, http(s) links only with credentials stripped, safe document names, size limits, and JPEG/PNG signatures for screenshots.
- A folder's reports reach a project only after the user files its first report from the Inbox. The reporter reads only the folder it runs in and never `.env` files or source code. The app itself reads project folders only through the evening auto-update, which runs the same reporter for folders the user linked; it can be switched off in Settings.
- Four workspace datasets are isolated by server-scoped SQL queries and separate folders. Unknown workspace IDs are rejected; clients cannot supply filesystem paths.
- Symlinked documents, docs and screenshot files are skipped or refused; workspace and asset folders may not be symlinks.
- Saving an existing document requires approval and the version the edit started from; a newer version returns 409 instead of overwriting. Previous content is kept in version history.
- Markdown renders without raw HTML and without loading images. Retrieved instructions are never executed.
- SQL parameters and quoted FTS tokens prevent query injection.

## Current limits

This is a single-user local app, not a hardened multi-user service. Any process running as you can read the database and the report key. Backups are not encrypted. Document approval is a UX gate, not authentication. Symlink checks are not race-free sandboxing. Filesystem writes and SQLite commits are not atomic together. Scans read only direct Markdown children and do not reconcile deletions. The Inbox is shared across workspaces until a report is filed. Do not store highly sensitive production information here until further hardening is complete.

Never link company repositories or personal folders without deciding to. Future provider adapters must require explicit authorisation before sending any workspace content.
