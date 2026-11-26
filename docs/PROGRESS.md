# Progress — 2026-11-26

## Permanent installation

Project folder: this repository. UI: http://127.0.0.1:5173/ — API: http://127.0.0.1:4310/. Double-click `Start My Studio.command` to reopen it later; keep its Terminal window open.

## 0.3.0 — Personal drawer

- **Review fixes.** Unsaved Library edits are guarded on every way out (sidebar, breadcrumb, ⌘K, Studio Agent, workspace switch, browser close). Saving over an outside change returns 409; the editor follows outside changes when there are no local edits and offers keep-or-load when there are. Requests with a non-loopback Host are refused (DNS rebinding).
- **End-of-day reports.** `bin/studio-report.mjs` collects git state, version, tech, docs, Cloudflare deploy links from Wrangler output, extra links and a full-page screenshot, and sends them with a local key. First reports wait in the Inbox; filing one links the folder. Reports made while the app is stopped go to the outbox. The `close-session` skill (in `~/.claude/skills`, edited with the user's permission) now runs the reporter after committing.
- **Drawer and project pages.** Mobbin-scale spacing and feature cards, Google Sans Flex type with m3.material.io weights; L/M/S card sizes; hover-scrolling screenshots; project Overview with version scrubber, browser frame, full screen, details and commit sparkline; Timeline, Builds (with manual links), Visuals (grid and before/after compare), Docs (read-only copies) and Notes.
- **Overview dashboard.** Stat tiles with seven-day trends, activity chart with metric and range filters, crosshair tooltip and table view, Needs attention, latest screens and recent reports. Sidebar navigation with a project list; phone menu.

## 0.3.1 — Projects imported (2026-11-26)

- The owner's local projects were imported into two workspaces: company work separate from personal work. Branch clones of one repository were grouped into one project; backup copies were skipped. Project names are deliberately kept out of this public file.
- Status was set from git activity (commits in 30 days → In progress, otherwise On hold); folders without git are Planned.
- Live links were added only where a project's own README or handoff note states one, each labelled with its source file; those projects have live-site screenshots. Other projects have no link.
- My Studio only reads projects: git runs with `GIT_OPTIONAL_LOCKS=0` so not even `.git/index` is refreshed, and the close-session step is told never to change project files for My Studio.
- Evening auto-update is on at 19:00. Verified: 36/36 Node tests, 3/3 Playwright tests, build passed; real workspaces show their commit history and list unpushed and uncommitted work under Needs attention.

## Verified

- 30/30 Node tests (`npm test`): storage, projects, drawer (inbox, linking, isolation, de-duplication, validation, screenshots, links, unlinking), HTTP (host and origin checks, report key and browser refusal, key file mode 600, 409 conflict, outbox import, JSON 404) and reporter (remote credential stripping, Wrangler parsing, link labels, git/docs/tech collection without secrets, folder containment, type detection).
- 3/3 Playwright tests with the installed Chrome (`PLAYWRIGHT_CHANNEL=chrome npm run test:browser`): project and task lifecycle, drag to Done, list view, Library save with approval, unsaved-edit prompt, notes linking, workspace isolation; report → Inbox → project → Timeline/Docs → Needs attention; 390 px menu without sideways scroll.
- `npm run build` (TypeScript and Vite) passed. `npm audit`: 0 known vulnerabilities.
- A separate demo instance with temporary data and throwaway git repositories was inspected in light and dark at 375, 768 and 1440 px with no sideways scrolling.
- The real instance was restarted on 5173/4310 with the new code; its workspaces still contain no projects or reports.

## Environment

npm uses `/private/tmp/my-studio-npm-cache`. Polling watchers avoid the macOS EMFILE limit. Playwright's bundled Chromium is not downloaded; tests and report screenshots use the installed Google Chrome. Cloudflare links require `WRANGLER_OUTPUT_FILE_DIRECTORY` at deploy time.

## Pending

Cloudflare API access (read-only token in the Keychain), Vercel API, search across copied repo docs, real AI execution, semantic search, nested folders, deletion reconciliation, guided recovery, screen-reader and contrast audits, a lighter `/state` payload for large libraries, and serving the production build from the API. See ROADMAP.md.
