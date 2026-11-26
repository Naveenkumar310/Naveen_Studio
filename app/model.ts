export type Doc = { id: string; title: string; category: string; content: string; tags: string; favorite: number; updated: string; version: number };
export type Project = { id: string; name: string; description: string; status: string; priority: string; due: string; owner: string; color: string; created: string; updated: string; kind: string; live_url: string; repo_url: string };
export type Task = { id: string; project: string; title: string; description: string; status: string; priority: string; due: string; owner: string; created: string };
export type DrawerSummary = { project: string; reported: string; source: string; version: string; branch: string; head: string; kind: string; tech: string[]; screenshot: string; live: string; unpushed: number | null; dirty: number; lastCommit: string };
export type InboxItem = { id: string; repo: string; name: string; branch: string; created: string };
export type RepoLink = { id: string; project: string; path: string; name: string; created: string };
export type Commit = { hash: string; date: string; subject: string };
export type Snapshot = { id: string; repo: string; created: string; source: string; summary: string; branch: string; head: string; remote: string; version: string; kind: string; dirty: number; unpushed: number | null; commits: Commit[]; tech: string[]; screenshot: string; screenshot_url: string };
export type Deploy = { id: string; snapshot: string; provider: string; environment: 'production' | 'preview' | 'link'; label: string; url: string; ref: string; created: string };
export type RepoDoc = { id: string; name: string; snapshot: string; created: string; size: number; versions: number };
export type ProjectDrawer = { snapshots: Snapshot[]; deploys: Deploy[]; docs: RepoDoc[]; repos: RepoLink[] };
export type StudioState = {
    projects: Project[]; tasks: Task[]; documents: Doc[]; links: { project: string; document: string }[];
    activity: { id: number; message: string; created: string }[]; drawer: DrawerSummary[]; repos: RepoLink[]; inbox: InboxItem[];
};

export const taskStatuses = ['Backlog', 'To do', 'In progress', 'Done'];
export const priorities = ['Low', 'Medium', 'High', 'Urgent'];
export const projectStatuses = ['Planned', 'In progress', 'On hold', 'Complete'];
export const kinds = ['Web', 'Mobile', 'Tool', 'Other'];
export const colors = ['lilac', 'peach', 'blue', 'mint', 'yellow', 'rose'];
export const categories = ['Documents', 'Skills', 'Research', 'Knowledge', 'Prompts', 'Resources'];
export const emptyState: StudioState = { projects: [], tasks: [], documents: [], links: [], activity: [], drawer: [], repos: [], inbox: [] };

export class ApiError extends Error {
    constructor(message: string, public status: number) { super(message); }
}
export async function api(url: string, body?: unknown, method = 'POST') {
    const r = await fetch('/api' + url, body === undefined ? undefined : {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const text = await r.text();
    let result: any = null;
    try { result = text ? JSON.parse(text) : null; } catch { result = { error: r.ok ? 'Unexpected response' : `The local service answered ${r.status}. Is My Studio running?` }; }
    if (!r.ok) throw new ApiError(result?.error || 'Request failed', r.status);
    return result;
}
export const message = (e: unknown) => e instanceof Error ? e.message : String(e);
export function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const overdue = (due: string, status: string) => !!due && due < today() && !['Done', 'Complete'].includes(status);
export const dateLabel = (due: string) => due ? new Date(due + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: due.slice(0, 4) === today().slice(0, 4) ? undefined : 'numeric' }) : 'No due date';
export const initials = (name: string) => Array.from(name.trim()).length ? name.trim().split(/\s+/).slice(0, 2).map(x => Array.from(x)[0] || '').join('').toUpperCase() : '·';
export const shortHash = (hash: string) => hash.slice(0, 7);
export const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };
export function ago(iso: string) {
    if (!iso) return '';
    const seconds = (Date.now() - Date.parse(iso)) / 1000;
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
    if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)} d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export const asset = (workspace: string, name: string) => `/api/w/${encodeURIComponent(workspace)}/assets/${name}`;
/** Project type: chosen by the user, else what the latest report detected. */
export const kindOf = (p: Project, s?: DrawerSummary) => p.kind || s?.kind || 'Other';
export const liveOf = (p: Project, s?: DrawerSummary) => p.live_url || s?.live || '';
export const repoOf = (p: Project, remote?: string) => p.repo_url || remote || '';
