# My Studio

A local-first personal drawer for your projects: every project's git state, versions, Cloudflare deploy links, docs, screenshots, tasks and notes in one place on this Mac. Later capabilities are tracked in [docs/ROADMAP.md](docs/ROADMAP.md).

## Start

Clone the repository anywhere on your Mac. Double-click **Start My Studio.command** in Finder to install dependencies on first run, start the services and open the browser. Keep the Terminal window open while using the app; Control-C stops it.

## Project structure

```
app/                 React + TypeScript interface (Vite)
  main.tsx           shell: sidebar, navigation, forms, settings
  Overview.tsx       dashboard: stat tiles, activity chart, needs attention
  Drawer.tsx         drawer grid and project pages
  Charts.tsx         hand-written SVG charts
  Library.tsx        Markdown editor with versions
  Tasks.tsx          task board and lists
  style.css          design tokens and styles
server/              local API (Express + SQLite)
  index.js           starts the service
  app.js             routes, host/origin checks, report endpoint, scans
  store.js           documents, versions, full-text search
  projects.js        projects and tasks
  drawer.js          reports, inbox, folder links, builds, docs, screenshots
  auto-update.js     evening auto-update
reporter/collect.js  reads one project folder (git, docs, tech, deploy links)
bin/studio-report.mjs  end-of-day report command
tests/               Node unit and HTTP tests; tests/browser/ Playwright tests
docs/                architecture, data model, design system, integrations, roadmap, progress
Start My Studio.command  Finder launcher
```

Created at runtime and never committed: `system/` (database, settings, report key, inbox, outbox), `workspaces/` (Markdown and screenshots), `backups/`.

## Run

Requires Node.js 22 and npm. From this directory:

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. The API listens on **127.0.0.1:4310**. Both bind to loopback only. Build with `npm run build`; run the unit and HTTP tests with `npm test`.

## Use

- **Overview** (home): greeting, stat tiles for commits, reports, deploys and open tasks with seven-day trends and "vs last week", an activity chart (commits, reports, deploys or tasks; 7, 30 or 90 days; hover for each day, or open the table view), a Needs attention list (unpushed commits, uncommitted files, overdue tasks, Inbox reports), the latest screens and recent reports.
- **Drawer**: every project as a large card with its newest screenshot. Filter by type (Web, Mobile, Tool, Other) and status, search, sort, and switch card size (L, M, S). Hover a card to scroll through its full-page screenshot.
- **Project page**: Overview (screenshot viewer with a version scrubber, thumbnails and full screen; details with branch, commit, pushed and uncommitted state, live link, linked folder and a 30-day commit sparkline), Tasks (board and list), Timeline (one entry per report), Builds (deploy links, plus links you add), Visuals (grid, or before/after compare), Docs (read-only copies of the project's README, CHANGELOG, handoff notes and `docs/*.md`) and Notes (linked Library documents).
- **Tasks**, **Library** (Markdown editor with preview, version history and approval before overwriting), **Activity**, and Workspaces, AI Agents, Settings and Developer Tools in the sidebar.
- ⌘K searches projects, tasks and full document text in the current workspace.

## End-of-day reports

At the end of a session, the `close-session` skill runs the reporter in the project folder:

```sh
node "<My Studio folder>/bin/studio-report.mjs" --summary "What changed today" --link "Production=https://…"
```

It reads only that folder: git branch, commit, today's commits, unpushed and uncommitted counts, remote URL (credentials removed), version from package.json or the latest tag, tech from package.json and config files, the docs listed above, and Cloudflare deploy links from Wrangler's output. It takes a full-page screenshot of the newest production link (or `--screenshot <url>`) with the installed Chrome, then sends everything to My Studio on this Mac.

- A folder's first report waits in the **Inbox**. Choosing a project there links the folder; later reports from it go straight to that project. Unlink it from the project page or Settings.
- If My Studio is not running, the report is saved to `system/outbox/` and imported at the next start.
- **Evening auto-update** (Settings, on by default at 7 pm): once a day My Studio runs the same reporter for every linked folder that has not reported that day, taking a screenshot of the project's live link at most once a week. It runs only while My Studio is open; "Run now" starts it immediately.
- Remotes that use SSH shortcuts such as `github-work` are resolved to their real host (read from `~/.ssh/config` with `ssh -G`; nothing connects).
- Cloudflare links need Wrangler's output file: deploy with `WRANGLER_OUTPUT_FILE_DIRECTORY=.wrangler/output` (for example in the deploy script). Links can also be added by hand on a project's Builds tab.
- Run with `--help` for all options, or `--dry-run` to see what would be sent.

## Storage

- `workspaces/<id>/*.md`: canonical Markdown content.
- `workspaces/<id>/assets/`: report screenshots.
- `system/studio.sqlite`: metadata, projects, tasks, reports, deploy links, copied docs, versions, activity, FTS5 index.
- `system/configurations/`: indexing preferences and the private report key (`ingest-token`, readable only by your user).
- `system/inbox/`, `system/outbox/`: screenshots for unfiled reports; reports saved while the app was stopped.
- `backups/studio-<timestamp>/`: database and `workspaces/` backup.

The starter has no fabricated projects, documents, reports or connected agents. See [SECURITY.md](SECURITY.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/PROGRESS.md](docs/PROGRESS.md).

## Backup recovery

Create a backup in Settings. To restore, stop both services, keep the current `system/studio.sqlite` and `workspaces/` elsewhere, then replace them with `studio.sqlite` and `workspaces/` from the chosen backup. Remove stale `studio.sqlite-wal` and `studio.sqlite-shm` only while the service is stopped. Guided, transaction-safe recovery is pending; back up while nothing is being edited.

## Browser verification

`PLAYWRIGHT_CHANNEL=chrome npm run test:browser` runs the browser tests with the installed Google Chrome (or run `npx playwright install chromium` and omit the variable). They start isolated services on ports 4311 and 5174 with temporary data and never touch your workspaces.
