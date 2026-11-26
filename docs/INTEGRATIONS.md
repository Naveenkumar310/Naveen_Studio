# Integrations

| Source | Status | Notes |
| --- | --- | --- |
| close-session (Claude Code skill) | One-way reports | Runs `bin/studio-report.mjs` after committing. My Studio never runs Claude Code. |
| Git | Read by the reporter in the project folder | Branch, commit, today's commits, unpushed/uncommitted counts, remote URL without credentials. |
| Cloudflare (Wrangler) | Deploy links from Wrangler's output file | Requires `WRANGLER_OUTPUT_FILE_DIRECTORY` (recommended `.wrangler/output`) or `WRANGLER_OUTPUT_FILE_PATH` at deploy time. No Cloudflare token is stored. |
| Vercel, Figma, other links | Passed with `--link "Name=URL"` or added on the Builds tab | No API access. |
| OpenAI Codex, Claude Code execution, Google Antigravity, Ollama, custom agents | Disconnected; no execution | Supported adapter, authorisation, health checks and history required. |

No connection status or execution output is fabricated. A Cloudflare API integration (read-only token in the macOS Keychain) is a possible later addition; see ROADMAP.md.
