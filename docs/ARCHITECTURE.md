# Architecture

The browser runs a React/TypeScript app served by Vite. Relative `/api` requests are proxied to an Express service on 127.0.0.1:4310. There is no cloud dependency at runtime; the Google Sans Flex font is bundled locally.

## Server

- `server/app.js` builds the HTTP app (`createStudio`): host and origin checks, the report endpoint, workspace-scoped routes, the chokidar watcher, scans, outbox import and backups. `server/index.js` only starts it.
- `server/store.js` owns SQLite, workspace validation, Markdown writes, version capture, optimistic version checks on save (409 on conflict) and FTS5 queries.
- `server/projects.js` owns project and task validation, additive migrations (including `kind`, `live_url`, `repo_url`) and document links.
- `server/drawer.js` owns end-of-day reports: validation (`cleanReport`), the inbox, folder links, snapshots, deploy links, copied repo docs, screenshots, per-workspace summaries and the activity series used by the charts.

Every request must name the service by a loopback host (`127.0.0.1` or `localhost` with the API or UI port); others get 421, which blocks DNS-rebinding pages. Browser requests from other origins get 403. `POST /api/ingest` additionally requires the key in `system/configurations/ingest-token` and refuses any request that carries an Origin header, so web pages cannot submit reports.

No endpoint accepts arbitrary filesystem paths. A report names its folder only as data. The only time the server touches a project folder is `server/auto-update.js`: once a day after the chosen time (default 19:00, `system/configurations/indexing.json`), it runs the reporter for linked folders that have not reported that day, passing the project's live link for a weekly screenshot. Summaries add up git health across all folders linked to a project and pick exactly one latest report per project. Screenshots are written under the workspace's `assets/` folder with server-generated names and served only by that exact name pattern.

## Reporter

`bin/studio-report.mjs` with `reporter/collect.js` runs inside a project folder. It reads git metadata, package.json, a fixed list of Markdown docs (symlinks and files over 256 KB skipped) and Wrangler's ND-JSON output from `.wrangler/output/` or the `WRANGLER_OUTPUT_FILE_*` locations. Shared output folders are filtered by the project's Wrangler name. It never reads `.env` files or source code. It posts to the local API with the key file, or writes to `system/outbox/` when the app is not running.

## Client

`app/main.tsx` is the shell: sidebar, breadcrumb header, ⌘K palette, forms and the unsaved-edit guard (every navigation path, workspace switch, document switch and tab close asks before discarding Library edits). `app/Overview.tsx` is the dashboard, `app/Drawer.tsx` the drawer and project pages, `app/Charts.tsx` hand-written SVG charts, `app/Tasks.tsx` boards and lists, `app/Library.tsx` the Markdown editor (it follows outside changes when there are no local edits and shows a keep-or-load banner when there are). `app/SafeMarkdown.tsx` renders Markdown without raw HTML and without loading images.

The client polls `/state` every 10 seconds. Synchronous small-file I/O, nested folders, deletion reconciliation and large-corpus optimisation remain pending; see ROADMAP.md.
