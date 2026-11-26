# Changelog

## 0.3.1 — 2026-11-26

Bulk import of existing project folders into separate workspaces, with branch clones of one repository grouped into one project. Added the evening auto-update with Settings controls, per-folder state on project pages, git health added up across a project's folders, sorting by last commit, SSH host alias resolution for repository links, plain HTML sites detected as Web, up to 1,000 commits per report with a collapsible list, the Google Sans Flex typeface, live links taken from each project's own docs, screenshots that remember their address, and strictly read-only git access. Six new tests (36 total).

## 0.3.0 — 2026-11-26

Turned My Studio into a personal drawer. Added end-of-day reports (`bin/studio-report.mjs`) with git state, version, tech, read-only doc copies, Cloudflare deploy links from Wrangler output, extra links and full-page screenshots; an Inbox for unlinked folders; folder linking and unlinking; an outbox for reports made while the app is stopped; and a close-session step that sends the report. Added the Overview dashboard (stat tiles, activity chart, Needs attention, latest screens, recent reports), a sidebar layout, Mobbin-scale spacing with the bundled Google Sans Flex font (as on m3.material.io), feature-card drawer with L/M/S sizes, and project pages with a screenshot viewer, version scrubber, timeline, builds, visuals compare, docs and notes. Fixed silent loss of unsaved document edits, silent overwrite of outside edits (409 conflicts), DNS-rebinding reads, "Scan now" doing nothing while paused, remote images in Markdown previews, partial document saves blanking fields, and duplicate commits across reports. Added 20 unit and HTTP tests and rewrote the browser tests.

## 0.2.0 — 2026-11-26

Replaced the left sidebar and permanent assistant with compact top navigation, full-width project gallery and on-demand retrieval sheet. Added project detail pages, persistent task board/list, drag-and-drop and keyboard-accessible status changes, project/task editing, priorities, owners, due dates, task-derived progress, project filters/search/sorting, My tasks, and workspace-safe project/document links. Preserved Markdown library, version history, full-text search, activity, settings and backups. Added a Finder launcher and a permanent project location. Added five project-management regression tests and isolated Playwright browser flows.

## 0.1.0 — 2026-11-26

Initial local-first foundation: React/TypeScript desktop UI, loopback Node service, four isolated workspaces, dynamic workspace creation, SQLite persistence, project status/grid/list, Markdown editor and live preview, tabs, favorites, version history, full-text command palette, incremental watcher, indexing controls, activity, source-cited local retrieval, local backups and disconnected provider catalog. Added security/architecture/design/data/integration documentation and regression tests. Semantic search, real provider adapters, automation and advanced filesystem features remain pending.
