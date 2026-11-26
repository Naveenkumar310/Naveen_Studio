import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { kinds, webUrl } from './projects.js';

// The drawer stores what linked project folders report at the end of a day:
// git state, version, deploy links, copies of their docs and a screenshot.
// Reports from folders that are not linked wait in a global inbox until the
// user files them under a project. Nothing here reads outside folders.

export const environments = ['production', 'preview', 'link'];
const LIMITS = { summary: 20000, commits: 1000, deploys: 60, docs: 24, doc: 256 * 1024, tech: 30, screenshot: 6 * 1024 * 1024 };
const ASSET = /^[0-9a-f-]{36}\.(jpg|png)$/;
const DOC_NAME = /^[\w .()-]+(\/[\w .()-]+)?\.(md|markdown|mdx|txt)$/i;

const invalid = message => Object.assign(Error(message), { status: 400 });
function str(value, name, max) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string' || value.length > max) throw invalid(`Invalid ${name}`);
    return value.trim();
}
function list(value, name, max) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.length > max) throw invalid(`Invalid ${name}`);
    return value;
}
function when(value) {
    if (!value) return new Date().toISOString();
    const time = typeof value === 'string' ? Date.parse(value) : NaN;
    if (Number.isNaN(time)) throw invalid('Invalid date');
    return new Date(time).toISOString();
}
function link(value, name) {
    try { return webUrl(value, name); } catch (e) { throw invalid(e.message); }
}
function count(value) {
    return Number.isInteger(value) && value >= 0 && value < 1e7 ? value : null;
}
const hex = (value, name) => {
    const v = str(value, name, 64).toLowerCase();
    if (v && !/^[0-9a-f]{7,64}$/.test(v)) throw invalid(`Invalid ${name}`);
    return v;
};

/** Validates a report sent by bin/studio-report.mjs. Returns the clean report and screenshot bytes. */
export function cleanReport(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalid('Invalid report');
    const repoPath = str(raw.repo?.path, 'folder path', 1000);
    if (!repoPath || !path.isAbsolute(repoPath)) throw invalid('Invalid folder path');
    const git = raw.git && typeof raw.git === 'object' ? raw.git : {};
    const report = {
        repo: { path: path.normalize(repoPath), name: str(raw.repo?.name, 'folder name', 120) || path.basename(repoPath) },
        source: str(raw.source, 'source', 40) || 'report',
        summary: str(raw.summary, 'summary', LIMITS.summary),
        version: str(raw.version, 'version', 60),
        kind: kinds.includes(raw.kind) ? raw.kind : '',
        tech: [...new Set(list(raw.tech, 'tech', LIMITS.tech).map(t => str(t, 'tech', 40)).filter(Boolean))],
        git: {
            branch: str(git.branch, 'branch', 200),
            head: hex(git.head, 'commit'),
            remote: link(git.remote, 'repository link'),
            dirty: count(git.dirty) ?? 0,
            unpushed: count(git.unpushed),
            commits: list(git.commits, 'commits', LIMITS.commits).map(c => ({
                hash: hex(c?.hash, 'commit'), date: when(c?.date), subject: str(c?.subject, 'commit message', 300)
            }))
        },
        deploys: list(raw.deploys, 'deploys', LIMITS.deploys).map(d => {
            if (!environments.includes(d?.environment)) throw invalid('Invalid deploy environment');
            const url = link(d.url, 'deploy link');
            if (!url) throw invalid('Invalid deploy link');
            return {
                provider: str(d.provider, 'provider', 30) || 'link', environment: d.environment,
                label: str(d.label, 'label', 80), url, ref: str(d.ref, 'reference', 100),
                created: when(d.created), key: str(d.key, 'key', 300) || `${d.environment}:${url}`
            };
        }),
        docs: list(raw.docs, 'docs', LIMITS.docs).map(d => {
            const name = str(d?.name, 'document name', 160);
            if (!DOC_NAME.test(name) || name.split('/').some(part => part === '..' || part === '.')) throw invalid('Invalid document name');
            if (typeof d.content !== 'string' || Buffer.byteLength(d.content) > LIMITS.doc) throw invalid(`Document too large: ${name}`);
            return { name, content: d.content };
        })
    };
    let screenshot = null;
    if (raw.screenshot) {
        const { type, data } = raw.screenshot;
        if (!['jpg', 'png'].includes(type) || typeof data !== 'string' || data.length > LIMITS.screenshot * 1.4) throw invalid('Invalid screenshot');
        const bytes = Buffer.from(data, 'base64');
        const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        const png = bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        if (bytes.length > LIMITS.screenshot || (type === 'jpg' ? !jpeg : !png)) throw invalid('Invalid screenshot');
        screenshot = { type, data: bytes, url: link(raw.screenshot.url, 'screenshot link') };
    }
    return { report, screenshot };
}

export function drawerManagement(store, pm, { inboxDir }) {
    const { db, workspace, directory, log } = store;
    fs.mkdirSync(inboxDir, { recursive: true });
    db.exec(`
        CREATE TABLE IF NOT EXISTS repo_links (
            id TEXT PRIMARY KEY, workspace TEXT NOT NULL, project TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS snapshots (
            id TEXT PRIMARY KEY, workspace TEXT NOT NULL, project TEXT NOT NULL, repo TEXT NOT NULL DEFAULT '',
            created TEXT NOT NULL, source TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '',
            branch TEXT NOT NULL DEFAULT '', head TEXT NOT NULL DEFAULT '', remote TEXT NOT NULL DEFAULT '',
            version TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT '', dirty INTEGER NOT NULL DEFAULT 0,
            unpushed INTEGER, commits TEXT NOT NULL DEFAULT '[]', tech TEXT NOT NULL DEFAULT '[]',
            screenshot TEXT NOT NULL DEFAULT '');
        CREATE INDEX IF NOT EXISTS snapshots_project ON snapshots(workspace, project, created);
        CREATE TABLE IF NOT EXISTS deploys (
            id TEXT PRIMARY KEY, workspace TEXT NOT NULL, project TEXT NOT NULL, snapshot TEXT NOT NULL DEFAULT '',
            key TEXT NOT NULL, provider TEXT NOT NULL, environment TEXT NOT NULL, label TEXT NOT NULL DEFAULT '',
            url TEXT NOT NULL, ref TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, UNIQUE(project, key));
        CREATE TABLE IF NOT EXISTS repo_docs (
            id TEXT PRIMARY KEY, workspace TEXT NOT NULL, project TEXT NOT NULL, name TEXT NOT NULL,
            hash TEXT NOT NULL, content TEXT NOT NULL, snapshot TEXT NOT NULL, created TEXT NOT NULL,
            UNIQUE(project, name, hash));
        CREATE TABLE IF NOT EXISTS inbox (
            id TEXT PRIMARY KEY, repo TEXT NOT NULL UNIQUE, name TEXT NOT NULL, branch TEXT NOT NULL DEFAULT '',
            created TEXT NOT NULL, payload TEXT NOT NULL, screenshot TEXT NOT NULL DEFAULT '');`);
    if (!db.prepare('PRAGMA table_info(snapshots)').all().some(c => c.name === 'screenshot_url')) db.exec("ALTER TABLE snapshots ADD COLUMN screenshot_url TEXT NOT NULL DEFAULT ''");
    const now = () => new Date().toISOString();
    const parse = row => ({ ...row, commits: JSON.parse(row.commits), tech: JSON.parse(row.tech) });
    const workspaceName = w => db.prepare('SELECT name FROM workspaces WHERE id=?').get(w)?.name || w;

    function assets(w) {
        const dir = path.join(directory(w), 'assets');
        fs.mkdirSync(dir, { recursive: true });
        if (fs.lstatSync(dir).isSymbolicLink()) throw Error('Symbolic asset folders are not allowed');
        return dir;
    }

    function attach(w, projectId, report, screenshot) {
        const project = pm.project(w, projectId);
        const id = crypto.randomUUID(), created = now();
        // Show each commit once: drop commits an earlier report of this project already listed.
        const seen = new Set(db.prepare('SELECT commits FROM snapshots WHERE workspace=? AND project=? ORDER BY created DESC LIMIT 30')
            .all(w, projectId).flatMap(r => JSON.parse(r.commits).map(c => c.hash)));
        report = { ...report, git: { ...report.git, commits: report.git.commits.filter(c => !seen.has(c.hash)) } };
        const file = screenshot ? `${id}.${screenshot.type}` : '';
        if (screenshot) fs.writeFileSync(path.join(assets(w), file), screenshot.data, { flag: 'wx' });
        try {
            db.transaction(() => {
                db.prepare(`INSERT INTO snapshots (id,workspace,project,repo,created,source,summary,branch,head,remote,version,kind,dirty,unpushed,commits,tech,screenshot,screenshot_url)
                    VALUES (@id,@workspace,@project,@repo,@created,@source,@summary,@branch,@head,@remote,@version,@kind,@dirty,@unpushed,@commits,@tech,@screenshot,@screenshot_url)`).run({
                    id, workspace: w, project: projectId, repo: report.repo.path, created, source: report.source,
                    summary: report.summary, branch: report.git.branch, head: report.git.head, remote: report.git.remote,
                    version: report.version, kind: report.kind, dirty: report.git.dirty, unpushed: report.git.unpushed,
                    commits: JSON.stringify(report.git.commits), tech: JSON.stringify(report.tech), screenshot: file, screenshot_url: screenshot?.url || ''
                });
                const deploy = db.prepare(`INSERT OR IGNORE INTO deploys (id,workspace,project,snapshot,key,provider,environment,label,url,ref,created)
                    VALUES (@id,@workspace,@project,@snapshot,@key,@provider,@environment,@label,@url,@ref,@created)`);
                for (const d of report.deploys) deploy.run({ ...d, id: crypto.randomUUID(), workspace: w, project: projectId, snapshot: id });
                const doc = db.prepare(`INSERT OR IGNORE INTO repo_docs (id,workspace,project,name,hash,content,snapshot,created)
                    VALUES (@id,@workspace,@project,@name,@hash,@content,@snapshot,@created)`);
                for (const d of report.docs) doc.run({
                    id: crypto.randomUUID(), workspace: w, project: projectId, name: d.name, content: d.content,
                    hash: crypto.createHash('sha256').update(d.content).digest('hex'), snapshot: id, created
                });
            })();
        } catch (e) {
            if (file) fs.rmSync(path.join(assets(w), file), { force: true });
            throw e;
        }
        log(w, `End-of-day report received for ${project.name}`);
        return { id, created, screenshot: file, project };
    }

    function ingest(raw) {
        const { report, screenshot } = cleanReport(raw);
        let linked = db.prepare('SELECT * FROM repo_links WHERE path=?').get(report.repo.path);
        if (linked && !db.prepare('SELECT id FROM projects WHERE workspace=? AND id=?').get(linked.workspace, linked.project)) {
            db.prepare('DELETE FROM repo_links WHERE id=?').run(linked.id);
            linked = undefined;
        }
        if (linked) {
            const snapshot = attach(linked.workspace, linked.project, report, screenshot);
            return { status: 'linked', workspace: workspaceName(linked.workspace), project: snapshot.project.name, snapshot: snapshot.id };
        }
        const existing = db.prepare('SELECT id, screenshot FROM inbox WHERE repo=?').get(report.repo.path);
        const id = existing?.id || crypto.randomUUID();
        if (existing?.screenshot) fs.rmSync(path.join(inboxDir, existing.screenshot), { force: true });
        const file = screenshot ? `${id}.${screenshot.type}` : '';
        if (screenshot) fs.writeFileSync(path.join(inboxDir, file), screenshot.data);
        db.prepare('INSERT OR REPLACE INTO inbox (id,repo,name,branch,created,payload,screenshot) VALUES (?,?,?,?,?,?,?)')
            .run(id, report.repo.path, report.repo.name, report.git.branch, now(), JSON.stringify({ ...report, screenshotUrl: screenshot?.url || '' }), file);
        return { status: 'inbox', id, name: report.repo.name };
    }

    function inbox() {
        return db.prepare('SELECT id, repo, name, branch, created FROM inbox ORDER BY created DESC').all();
    }

    function dismiss(id) {
        const item = db.prepare('SELECT * FROM inbox WHERE id=?').get(id);
        if (!item) throw Object.assign(Error('Report not found'), { status: 404 });
        if (item.screenshot) fs.rmSync(path.join(inboxDir, item.screenshot), { force: true });
        db.prepare('DELETE FROM inbox WHERE id=?').run(id);
    }

    /** The user's explicit choice: file an inbox report under a project and link its folder for future reports. */
    function assign(id, w, input = {}) {
        workspace(w);
        const item = db.prepare('SELECT * FROM inbox WHERE id=?').get(id);
        if (!item) throw Object.assign(Error('Report not found'), { status: 404 });
        const report = JSON.parse(item.payload);
        const target = input.project
            ? pm.project(w, input.project)
            : pm.saveProject(w, { name: String(input.name || report.repo.name).slice(0, 160), status: 'In progress', kind: report.kind, repo_url: report.git.remote });
        let screenshot = null;
        if (item.screenshot) {
            const file = path.join(inboxDir, item.screenshot);
            if (fs.existsSync(file) && !fs.lstatSync(file).isSymbolicLink()) screenshot = { type: path.extname(file).slice(1), data: fs.readFileSync(file), url: report.screenshotUrl || '' };
        }
        db.transaction(() => {
            db.prepare('DELETE FROM repo_links WHERE path=?').run(item.repo);
            db.prepare('INSERT INTO repo_links (id,workspace,project,path,name,created) VALUES (?,?,?,?,?,?)')
                .run(crypto.randomUUID(), w, target.id, item.repo, item.name, now());
        })();
        const snapshot = attach(w, target.id, report, screenshot);
        dismiss(id);
        log(w, `Linked folder ${item.name} to ${target.name}`);
        return { project: target.id, snapshot: snapshot.id };
    }

    function repos(w) {
        workspace(w);
        return db.prepare('SELECT * FROM repo_links WHERE workspace=? ORDER BY created DESC').all(w);
    }

    function unlink(w, id) {
        workspace(w);
        const row = db.prepare('SELECT * FROM repo_links WHERE workspace=? AND id=?').get(w, id);
        if (!row) throw Object.assign(Error('Linked folder not found'), { status: 404 });
        db.prepare('DELETE FROM repo_links WHERE id=?').run(id);
        log(w, `Unlinked folder ${row.name}`);
    }

    /** One row per project with its latest report, latest screenshot and live link. */
    function summaries(w) {
        workspace(w);
        // One row per project even when two reports share a timestamp.
        const latest = db.prepare(`SELECT * FROM (SELECT s.*, row_number() OVER (PARTITION BY project ORDER BY created DESC, rowid DESC) AS n
                FROM snapshots s WHERE workspace=?) WHERE n=1`).all(w);
        const shots = new Map(db.prepare(`SELECT project, screenshot, max(created) FROM snapshots
            WHERE workspace=? AND screenshot!='' GROUP BY project`).all(w).map(r => [r.project, r.screenshot]));
        // Newest production link; among links from the same deploy the shortest is usually the stable alias or custom domain.
        const live = new Map();
        for (const r of db.prepare(`SELECT project, url FROM deploys WHERE workspace=? AND environment='production'
            ORDER BY created DESC, length(url) ASC`).all(w)) if (!live.has(r.project)) live.set(r.project, r.url);
        // Git health adds up the newest report of every folder still linked to the project,
        // so one clean folder cannot hide another folder's uncommitted or unpushed work.
        const linked = new Set(db.prepare('SELECT project, path FROM repo_links WHERE workspace=?').all(w).map(r => r.project + '\0' + r.path));
        const health = new Map();
        for (const r of db.prepare(`SELECT project, repo, dirty, unpushed FROM (SELECT s.*, row_number() OVER (PARTITION BY project, repo ORDER BY created DESC, rowid DESC) AS n
                FROM snapshots s WHERE workspace=?) WHERE n=1`).all(w)) {
            if (!linked.has(r.project + '\0' + r.repo)) continue;
            const h = health.get(r.project) || { dirty: 0, unpushed: null };
            h.dirty += r.dirty;
            if (r.unpushed !== null) h.unpushed = (h.unpushed || 0) + r.unpushed;
            health.set(r.project, h);
        }
        const lastCommit = new Map();
        for (const r of db.prepare('SELECT project, commits FROM snapshots WHERE workspace=?').all(w)) {
            for (const c of JSON.parse(r.commits)) if (c.date > (lastCommit.get(r.project) || '')) lastCommit.set(r.project, c.date);
        }
        return latest.map(s => ({
            project: s.project, reported: s.created, source: s.source, version: s.version, branch: s.branch, head: s.head,
            kind: s.kind, tech: JSON.parse(s.tech), screenshot: shots.get(s.project) || '', live: live.get(s.project) || '',
            unpushed: health.get(s.project)?.unpushed ?? s.unpushed, dirty: health.get(s.project)?.dirty ?? s.dirty,
            lastCommit: lastCommit.get(s.project) || ''
        }));
    }

    /** Raw dated events for the workspace charts; the browser buckets them into local days. */
    function activity(w, days = 90) {
        workspace(w);
        const since = new Date(Date.now() - Math.min(Math.max(Number(days) || 90, 7), 366) * 86400000).toISOString();
        const commits = new Map();
        for (const row of db.prepare('SELECT project, commits FROM snapshots WHERE workspace=? AND created>=?').all(w, since)) {
            for (const c of JSON.parse(row.commits)) if (c.date >= since && !commits.has(c.hash)) commits.set(c.hash, { at: c.date, project: row.project });
        }
        return {
            since,
            reports: db.prepare('SELECT created AS at, project FROM snapshots WHERE workspace=? AND created>=?').all(w, since),
            commits: [...commits.values()],
            deploys: db.prepare("SELECT created AS at, project FROM deploys WHERE workspace=? AND created>=? AND provider!='manual'").all(w, since),
            tasks: db.prepare('SELECT created AS at, project FROM tasks WHERE workspace=? AND created>=?').all(w, since),
            recent: db.prepare(`SELECT id, project, created, source, version, branch, substr(summary, 1, 280) AS summary, screenshot
                FROM snapshots WHERE workspace=? ORDER BY created DESC LIMIT 8`).all(w)
        };
    }

    function projectDrawer(w, p) {
        pm.project(w, p);
        const snapshots = db.prepare(`SELECT id, repo, created, source, summary, branch, head, remote, version, kind, dirty, unpushed, commits, tech, screenshot, screenshot_url
            FROM snapshots WHERE workspace=? AND project=? ORDER BY created DESC LIMIT 200`).all(w, p).map(parse);
        const deploys = db.prepare('SELECT * FROM deploys WHERE workspace=? AND project=? ORDER BY created DESC LIMIT 300').all(w, p);
        const docs = new Map();
        for (const d of db.prepare(`SELECT id, name, snapshot, created, length(content) AS size FROM repo_docs
            WHERE workspace=? AND project=? ORDER BY created DESC`).all(w, p)) {
            const seen = docs.get(d.name);
            if (seen) seen.versions++; else docs.set(d.name, { ...d, versions: 1 });
        }
        const repos = db.prepare('SELECT * FROM repo_links WHERE workspace=? AND project=?').all(w, p);
        return { snapshots, deploys, docs: [...docs.values()].sort((a, b) => a.name.localeCompare(b.name)), repos };
    }

    function repoDoc(w, id) {
        workspace(w);
        const doc = db.prepare('SELECT * FROM repo_docs WHERE workspace=? AND id=?').get(w, id);
        if (!doc) throw Object.assign(Error('Document not found'), { status: 404 });
        return doc;
    }

    function addLink(w, p, input = {}) {
        const project = pm.project(w, p);
        const url = link(input.url, 'link');
        if (!url) throw invalid('Invalid link');
        const environment = environments.includes(input.environment) ? input.environment : 'link';
        const row = {
            id: crypto.randomUUID(), workspace: w, project: p, snapshot: '', key: `manual:${crypto.randomUUID()}`,
            provider: 'manual', environment, label: str(input.label, 'label', 80), url, ref: '', created: now()
        };
        db.prepare(`INSERT INTO deploys (id,workspace,project,snapshot,key,provider,environment,label,url,ref,created)
            VALUES (@id,@workspace,@project,@snapshot,@key,@provider,@environment,@label,@url,@ref,@created)`).run(row);
        log(w, `Added link to ${project.name}`);
        return row;
    }

    function removeLink(w, p, id) {
        pm.project(w, p);
        const removed = db.prepare("DELETE FROM deploys WHERE workspace=? AND project=? AND id=? AND provider='manual'").run(w, p, id);
        if (!removed.changes) throw Object.assign(Error('Link not found'), { status: 404 });
    }

    function asset(w, name) {
        workspace(w);
        if (!ASSET.test(name)) throw Object.assign(Error('Not found'), { status: 404 });
        const file = path.join(assets(w), name);
        if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink()) throw Object.assign(Error('Not found'), { status: 404 });
        return file;
    }

    return { ingest, inbox, dismiss, assign, repos, unlink, summaries, activity, projectDrawer, repoDoc, addLink, removeLink, asset };
}
