# My Studio implementation roadmap

## Phase 1 — Foundation and workspace separation
- [x] React + TypeScript + Vite + Tailwind application; Node localhost API.
- [x] Original responsive shell with sidebar, workspace switcher, Overview, Drawer, Tasks, Library, Activity and secondary pages.
- [x] Light/dark themes, compact top navigation, on-demand assistant, Command-K keyboard shortcut.
- [x] Four independent workspaces and dynamic workspace creation.
- [ ] Browser interaction and accessibility audit across Safari/Chrome and screen readers.

## Phase 2 — Projects, documents, and persistence
- [x] SQLite-backed project creation, status changes, grid/list views.
- [x] Markdown file creation, editing, live preview, tabs, favorites, tags, version history.
- [x] Explicit approval before overwriting existing Markdown; workspace-scoped activity history.
- [x] Local backup of database and managed Markdown.
- [ ] Hierarchical folder explorer, nested directory indexing, drag-and-drop moves with approval.
- [x] Per-project task boards and lists, editable project metadata, owners, priorities, due dates and workspace-isolated document associations.
- [x] Cross-project My tasks with due-today/overdue/completed filters and project filters.
- [x] Project gallery/list views, status filters, name search, sorting and task-derived progress.
- [x] Document title and tag editing with explicit save approval.
- [ ] Folder filtering and durable recent-file tracking.
- [ ] Guided backup recovery UI and transaction-safe database/filesystem recovery.

## Phase 2b — Personal drawer and end-of-day reports
- [x] Reporter command: git state, version, tech, docs, Cloudflare links from Wrangler output, extra links, full-page screenshot.
- [x] Local report key, browser refusal, payload validation, Inbox with explicit folder linking, outbox while stopped.
- [x] close-session step that sends the day's report.
- [x] Evening auto-update for linked folders (on/off, time, Run now), weekly live-link screenshots.
- [x] Bulk import of existing project folders into separate workspaces, grouping branch clones of one repository.
- [x] Project pages: viewer with version scrubber, timeline, builds with manual links, visuals compare, read-only docs, notes.
- [x] Overview dashboard: stat tiles, activity chart with table view, Needs attention, latest screens, recent reports.
- [ ] Cloudflare API access with a read-only token in the macOS Keychain (all Pages/Workers deployments).
- [ ] Vercel deployment links from its API or CLI output.
- [ ] Full-text search across copied repo docs; doc diffs between versions.
- [ ] Mobile app screenshots (simulator capture) and per-page screenshots.

## Phase 3 — Search and automatic indexing
- [x] Workspace-scoped SQLite FTS5 with safe tokenization, content excerpts and navigation.
- [x] Command palette and recent query history.
- [x] File watcher, incremental content updates, version capture, pause/resume/manual refresh.
- [x] Configurable scan interval, persistent indexing preferences, last successful scan and failure state.
- [ ] Deleted-file reconciliation and rename detection.
- [ ] External approved directory picker with persisted grants and revocation.
- [ ] Local semantic embeddings and hybrid ranking.
- [ ] Staleness thresholds, duplicate-content reports and index rebuild tooling.

## Phase 4 — Studio Agent and provider integrations
- [x] Local retrieval-only question panel with source file references.
- [x] Honest disconnected states for Codex, Claude Code, Antigravity, Ollama, custom providers.
- [x] Indexed content rendered as text, never executed as instructions.
- [ ] Provider adapter interface, supported API/CLI contracts and health checks.
- [ ] OS credential vault, workspace-scoped provider grants, outbound payload approval.
- [ ] Real provider execution, cancellation, task logs and reproducible source citations.
- [ ] Agent skill associations and effective-permission inspection.
- [ ] Relationship graphs, missing-documentation analysis and intelligent project summaries.

## Phase 5 — Automation, hardening, and performance
- [x] Storage regression tests for workspace isolation, approval enforcement, FTS, indexing, symlinks.
- [x] End-to-end browser tests (project, tasks, Library, unsaved-edit guard, reports, Inbox, phone layout).
- [ ] Keyboard/focus-management audit.
- [ ] Filesystem sandbox hardening against concurrent symlink substitution and large-file exhaustion.
- [x] Loopback Host check (DNS rebinding) and a local key for reports.
- [ ] Session tokens for the UI and a restrictive CSP.
- [ ] Queue-based indexing, measured performance budgets and Apple Silicon benchmarks.
- [ ] Workflow automation with reviewable approval queue and audit log.

## Incremental delivery policy
Build and test each functional slice before enabling it. Never present an integration as connected without a successful real health check. No external directory, company repository, cloud service, or personal file is authorized by default. Outstanding roadmap work is not represented as complete in the UI or documentation.
