import express from 'express';
import chokidar from 'chokidar';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { projectManagement } from './projects.js';
import { drawerManagement } from './drawer.js';
import { autoUpdater, validTime } from './auto-update.js';

/** Reads the local report key, creating it on first start. Only processes on this Mac can read it. */
function reportKey(file) {
    try {
        const key = fs.readFileSync(file, 'utf8').trim();
        if (/^[0-9a-f]{64}$/.test(key)) return key;
    } catch { }
    const key = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(file, key, { mode: 0o600 });
    return key;
}

export function createStudio({ root, port = 4310, uiOrigins = [], watch = true }) {
    for (const dir of ['system/configurations', 'system/inbox', 'system/outbox', 'backups', 'workspaces']) {
        fs.mkdirSync(path.join(root, dir), { recursive: true });
    }
    const store = createStore(path.join(root, 'system'), path.join(root, 'workspaces'));
    const { db } = store;
    const pm = projectManagement(store);
    const drawer = drawerManagement(store, pm, { inboxDir: path.join(root, 'system/inbox') });
    const key = reportKey(path.join(root, 'system/configurations/ingest-token'));
    const outbox = path.join(root, 'system/outbox');

    // Requests must name this service by its loopback address. This blocks DNS-rebinding pages,
    // which reach 127.0.0.1 under their own hostname and send no Origin header on GET.
    const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, 'http://127.0.0.1:5173', 'http://localhost:5173', ...uiOrigins]);
    const hosts = new Set([...origins].map(o => new URL(o).host));

    const app = express();
    app.disable('x-powered-by');
    app.use((req, res, next) => {
        if (!hosts.has(String(req.headers.host || '').toLowerCase())) return res.status(421).json({ error: 'Host denied' });
        const origin = req.headers.origin;
        if (origin && !origins.has(origin)) return res.status(403).json({ error: 'Origin denied' });
        next();
    });

    // End-of-day reports from bin/studio-report.mjs. Browsers always send Origin on POST, so any
    // request with one is refused; the key file must also match.
    app.post('/api/ingest', express.json({ limit: '12mb' }), (req, res, next) => {
        if (req.headers.origin) return res.status(403).json({ error: 'Reports cannot be sent from a browser' });
        const given = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
        const expected = Buffer.from(key);
        if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return res.status(401).json({ error: 'Invalid report key' });
        try { res.json(drawer.ingest(req.body)); } catch (e) { next(e); }
    });

    app.use(express.json({ limit: '2mb' }));
    const configPath = path.join(root, 'system/configurations/indexing.json');
    let config = { paused: false, interval: 30, autoUpdate: {} };
    try { config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) }; } catch { }
    if (![10, 30, 60, 300].includes(config.interval)) config.interval = 30;
    const autoSettings = { enabled: true, time: '19:00', lastRun: null, lastDay: '', lastResult: null, ...config.autoUpdate };
    if (!validTime(autoSettings.time)) autoSettings.time = '19:00';
    const codeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const sync = { paused: config.paused, interval: config.interval, lastScan: null, error: null, outbox: null, reporter: `node "${path.join(codeRoot, 'bin/studio-report.mjs')}"`, autoUpdate: autoSettings };
    const saveConfig = () => fs.writeFileSync(configPath, JSON.stringify({ paused: sync.paused, interval: sync.interval, autoUpdate: autoSettings }));
    const auto = autoUpdater({ db, root, port, settings: autoSettings, save: saveConfig });

    function importOutbox() {
        for (const file of fs.readdirSync(outbox, { withFileTypes: true })) {
            if (!file.isFile() || !file.name.endsWith('.json')) continue;
            const full = path.join(outbox, file.name);
            try {
                drawer.ingest(JSON.parse(fs.readFileSync(full, 'utf8')));
                fs.rmSync(full);
                sync.outbox = null;
            } catch (e) {
                fs.renameSync(full, full + '.rejected');
                sync.outbox = `A saved report could not be imported: ${e.message}`;
            }
        }
    }
    function scan(force = false) {
        try { importOutbox(); } catch (e) { sync.outbox = e.message; }
        if (sync.paused && !force) return;
        try {
            for (const w of db.prepare('SELECT id FROM workspaces').all()) store.scan(w.id);
            sync.lastScan = new Date().toISOString(); sync.error = null;
        } catch (e) { sync.error = e.message; }
    }
    let timer;
    const schedule = () => { clearInterval(timer); timer = setInterval(scan, sync.interval * 1000); };
    const watcher = watch
        ? chokidar.watch(path.join(root, 'workspaces'), { ignoreInitial: true, awaitWriteFinish: true, usePolling: true, interval: 1500 })
            .on('all', () => scan()).on('error', e => { sync.error = e.message; })
        : null;
    if (watch) schedule();
    // Evening auto-update: checked once a minute; runs once per day after the chosen time.
    const autoTimer = watch ? setInterval(() => { if (auto.due()) auto.runAll().catch(e => { sync.error = e.message; }); }, 60000) : null;
    scan();

    app.get('/api/workspaces', (req, res) => res.json(db.prepare('SELECT * FROM workspaces').all()));
    app.post('/api/workspaces', (req, res) => res.json(store.addWorkspace(req.body.name || 'New workspace')));
    app.get('/api/sync', (req, res) => res.json({ ...sync, autoRunning: auto.isRunning() }));
    app.post('/api/sync', (req, res) => {
        if (typeof req.body.paused === 'boolean') sync.paused = req.body.paused;
        if (req.body.interval !== undefined) {
            const interval = Number(req.body.interval);
            if (![10, 30, 60, 300].includes(interval)) return res.status(400).json({ error: 'Invalid scan interval' });
            sync.interval = interval; if (watch) schedule();
        }
        const a = req.body.autoUpdate;
        if (a !== undefined) {
            if (typeof a !== 'object' || a === null) return res.status(400).json({ error: 'Invalid auto-update settings' });
            if (a.enabled !== undefined) autoSettings.enabled = a.enabled === true;
            if (a.time !== undefined) { if (!validTime(a.time)) return res.status(400).json({ error: 'Invalid auto-update time' }); autoSettings.time = a.time; }
        }
        saveConfig();
        if (req.body.refresh) scan(true); // an explicit "Scan now" runs even while paused
        res.json({ ...sync, autoRunning: auto.isRunning() });
    });
    app.post('/api/auto-update/run', async (req, res, next) => {
        try { res.json(await auto.runAll()); } catch (e) { next(e); }
    });
    app.get('/api/inbox', (req, res) => res.json(drawer.inbox()));
    app.post('/api/inbox/:id/assign', (req, res) => res.json(drawer.assign(req.params.id, String(req.body.workspace || ''), req.body)));
    app.post('/api/inbox/:id/dismiss', (req, res) => { drawer.dismiss(req.params.id); res.json({ ok: true }); });

    app.use('/api/w/:w', (req, res, next) => {
        try { store.workspace(req.params.w); next(); } catch (e) { res.status(404).json({ error: e.message }); }
    });
    app.get('/api/w/:w/state', (req, res) => {
        const w = req.params.w;
        res.json({
            projects: db.prepare('SELECT * FROM projects WHERE workspace=? ORDER BY created DESC').all(w),
            tasks: db.prepare('SELECT * FROM tasks WHERE workspace=? ORDER BY created DESC').all(w),
            links: db.prepare('SELECT * FROM project_documents WHERE workspace=?').all(w),
            documents: db.prepare('SELECT * FROM documents WHERE workspace=? ORDER BY updated DESC').all(w),
            activity: db.prepare('SELECT * FROM activity WHERE workspace=? ORDER BY id DESC LIMIT 80').all(w),
            drawer: drawer.summaries(w),
            repos: drawer.repos(w),
            inbox: drawer.inbox()
        });
    });
    app.post('/api/w/:w/projects', (req, res) => res.json(pm.saveProject(req.params.w, req.body)));
    app.patch('/api/w/:w/projects/:id', (req, res) => res.json(pm.saveProject(req.params.w, req.body, req.params.id)));
    app.get('/api/w/:w/activity', (req, res) => res.json(drawer.activity(req.params.w, req.query.days)));
    app.get('/api/w/:w/projects/:id/drawer', (req, res) => res.json(drawer.projectDrawer(req.params.w, req.params.id)));
    app.post('/api/w/:w/projects/:id/links', (req, res) => res.json(drawer.addLink(req.params.w, req.params.id, req.body)));
    app.post('/api/w/:w/projects/:id/links/:link/remove', (req, res) => { drawer.removeLink(req.params.w, req.params.id, req.params.link); res.json({ ok: true }); });
    app.post('/api/w/:w/projects/:id/tasks', (req, res) => res.json(pm.saveTask(req.params.w, req.params.id, req.body)));
    app.patch('/api/w/:w/projects/:id/tasks/:task', (req, res) => res.json(pm.saveTask(req.params.w, req.params.id, req.body, req.params.task)));
    app.post('/api/w/:w/projects/:id/documents/:document', (req, res) => { pm.linkDocument(req.params.w, req.params.id, req.params.document, req.body.linked === true); res.json({ ok: true }); });
    app.get('/api/w/:w/repo-docs/:id', (req, res) => res.json(drawer.repoDoc(req.params.w, req.params.id)));
    app.post('/api/w/:w/repos/:id/unlink', (req, res) => { drawer.unlink(req.params.w, req.params.id); res.json({ ok: true }); });
    app.get('/api/w/:w/assets/:name', (req, res) => res.sendFile(drawer.asset(req.params.w, req.params.name), { headers: { 'Cache-Control': 'private, max-age=31536000, immutable' } }));
    app.post('/api/w/:w/documents', (req, res) => res.json(store.save(req.params.w, req.body, req.body.approved === true)));
    app.get('/api/w/:w/search', (req, res) => res.json(store.search(req.params.w, String(req.query.q || ''))));
    app.get('/api/w/:w/documents/:id/versions', (req, res) => res.json(db.prepare('SELECT versions.* FROM versions JOIN documents ON documents.id=versions.document WHERE documents.workspace=? AND documents.id=? ORDER BY version DESC').all(req.params.w, req.params.id)));
    app.post('/api/w/:w/documents/:id/favorite', (req, res) => { db.prepare('UPDATE documents SET favorite=1-favorite WHERE id=? AND workspace=?').run(req.params.id, req.params.w); res.json({ ok: true }); });
    app.post('/api/w/:w/ask', (req, res) => {
        const sources = store.search(req.params.w, String(req.body.question || ''));
        res.json({
            answer: sources.length ? 'I found these passages in your workspace. This is local keyword retrieval; no AI provider is connected.' : 'No matching sources found. Try a specific project name or topic.',
            sources: sources.slice(0, 4).map(d => ({ id: d.id, title: d.title, path: `workspaces/${d.workspace}/${db.prepare('SELECT filename FROM files WHERE id=? AND workspace=?').get(d.id, d.workspace)?.filename || d.id + '.md'}`, excerpt: d.content.slice(0, 400) }))
        });
    });
    app.post('/api/backup', (req, res, next) => {
        const target = path.join(root, 'backups', `studio-${Date.now()}`);
        try {
            fs.mkdirSync(target, { recursive: true });
            fs.cpSync(path.join(root, 'workspaces'), path.join(target, 'workspaces'), { recursive: true });
            db.backup(path.join(target, 'studio.sqlite')).then(() => res.json({ path: target })).catch(next);
        } catch (e) { next(e); }
    });
    app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
    app.use((err, req, res, next) => res.status(err.status || 400).json({ error: err.message }));

    function stop() {
        clearInterval(timer);
        clearInterval(autoTimer);
        watcher?.close();
        db.close();
    }
    return { app, store, drawer, key, stop };
}
