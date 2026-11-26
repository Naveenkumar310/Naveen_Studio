# Data model

| Table | Purpose | Isolation |
| --- | --- | --- |
| workspaces | Stable ID and display name | Workspace root |
| projects | Name, description, status, priority, owner, due date, icon colour, type (`kind`), live and repository links, timestamps | workspace column |
| tasks | Project ID, title, description, status, priority, owner, due date, timestamps | workspace + project validation |
| project_documents | Library documents linked to a project | project and document must share the workspace |
| documents, files, versions, search | Markdown documents, filename mapping, previous versions, FTS5 index | workspace column; versions via their document |
| activity | Ordered messages | workspace column |
| repo_links | A local folder path linked to one project (the user's explicit choice in the Inbox) | workspace column; path unique |
| snapshots | One end-of-day report: summary, source, branch, commit, remote, version, type, uncommitted and unpushed counts, new commits, tech, screenshot file | workspace + project |
| deploys | Production, preview and other links from reports or added by hand; unique per project and key | workspace + project |
| repo_docs | Read-only copies of a project's docs, one row per distinct content hash | workspace + project |
| inbox | Reports from unlinked folders, waiting for a project | global until filed; shows only folder name, path, branch and time |

IDs are cryptographic UUIDs except the four predefined workspace IDs. Commits already listed in an earlier report of the same project are not stored again. Deleting a folder link keeps its past reports. Existing schemas are migrated additively.
