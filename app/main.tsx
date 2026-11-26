import '@fontsource-variable/google-sans-flex/opsz.css';
import { useState, useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
    Search, X, ArrowRight, Check, Circle, Clock, FileText, Folder, Sparkles, Sun, Moon, RefreshCw, Pause, Play, Shield, Bot, Layers, Inbox, Copy,
    LayoutDashboard, Archive, ListChecks, BookOpen, Activity as ActivityIcon, Settings as SettingsIcon, Code, ChevronsUpDown, Plus, Menu
} from 'lucide-react';
import Library from './Library';
import { DrawerHome, ProjectPage, InboxDialog, AppIcon } from './Drawer';
import { Overview } from './Overview';
import { TaskHome } from './Tasks';
import { api, message, asset, colors, kinds, priorities, projectStatuses, taskStatuses, emptyState, ago, type Project, type Task, type Doc, type StudioState } from './model';
import './style.css';

type Page = 'Overview' | 'Drawer' | 'Tasks' | 'Library' | 'Activity' | 'Workspaces' | 'AI Agents' | 'Settings' | 'Developer Tools';
type Form = { kind: 'project'; item?: Project } | { kind: 'task'; project: string; item?: Task; status?: string } | { kind: 'workspace' };
type AutoResult = { at: string; updated: number; skipped: number; failed: { name: string; error: string }[] };
type Sync = {
    paused: boolean; interval: number; lastScan: string | null; error: string | null; outbox: string | null; reporter: string;
    autoUpdate: { enabled: boolean; time: string; lastRun: string | null; lastResult: AutoResult | null }; autoRunning?: boolean;
};
const mainPages: [Page, typeof LayoutDashboard][] = [['Overview', LayoutDashboard], ['Drawer', Archive], ['Tasks', ListChecks], ['Library', BookOpen], ['Activity', ActivityIcon]];
const morePages: [Page, typeof LayoutDashboard][] = [['Workspaces', Layers], ['AI Agents', Bot], ['Settings', SettingsIcon], ['Developer Tools', Code]];
const allPages: Page[] = [...mainPages, ...morePages].map(([p]) => p);
const icons = new Map([...mainPages, ...morePages]);
const readTheme = () => { try { const t = localStorage.getItem('theme'); return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; } };
const readRecent = (w: string): string[] => { try { return JSON.parse(localStorage.getItem('recent:' + w) || '[]'); } catch { return []; } };
const store = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { } };

function App() {
    const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
    const [workspace, setWorkspace] = useState('personal');
    const [data, setData] = useState<StudioState>(emptyState);
    const [page, setPage] = useState<Page>('Overview');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
    const [sync, setSync] = useState<Sync>({ paused: false, interval: 30, lastScan: null, error: null, outbox: null, reporter: '', autoUpdate: { enabled: true, time: '19:00', lastRun: null, lastResult: null } });
    const [form, setForm] = useState<Form | null>(null);
    const [palette, setPalette] = useState(false);
    const [inboxOpen, setInboxOpen] = useState(false);
    const [menu, setMenu] = useState(false);
    const [query, setQuery] = useState('');
    const [found, setFound] = useState<Doc[]>([]);
    const [notice, setNotice] = useState('');
    const [dark, setDark] = useState(readTheme);
    const [assistant, setAssistant] = useState(false);
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState<any>(null);
    const [asking, setAsking] = useState(false);
    const [recent, setRecent] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const active = useRef(workspace);
    const generation = useRef(0);
    const dirty = useRef(false); // unsaved edits in the open Library document
    active.current = workspace;
    const project = data.projects.find(p => p.id === selectedId);
    const wpath = '/w/' + workspace;
    const workspaceName = workspaces.find(w => w.id === workspace)?.name || 'Personal Workspace';

    const refresh = async () => {
        const version = ++generation.current;
        const [state, health] = await Promise.all([api(wpath + '/state'), api('/sync')]);
        if (active.current !== workspace || generation.current !== version) return;
        setData({ ...emptyState, ...state }); setSync(health); setLoading(false);
    };
    const run = async (fn: () => Promise<void>) => { try { await fn(); } catch (e) { setNotice(message(e)); } };
    /** Every way out of an open document goes through here, so unsaved edits are never dropped silently. */
    const leave = () => {
        if (!dirty.current) return true;
        if (!window.confirm('You have unsaved document changes. Discard them?')) return false;
        dirty.current = false;
        return true;
    };

    useEffect(() => { api('/workspaces').then(setWorkspaces).catch(e => setNotice(message(e))); }, []);
    useEffect(() => {
        run(refresh);
        setRecent(readRecent(workspace));
        const timer = setInterval(() => run(refresh), 10000);
        return () => clearInterval(timer);
    }, [workspace]);
    useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; store('theme', dark ? 'dark' : 'light'); }, [dark]);
    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); }
            if (e.key === 'Escape') { setPalette(false); setAssistant(false); setInboxOpen(false); setMenu(false); }
        };
        const unload = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('keydown', key); window.addEventListener('beforeunload', unload);
        return () => { window.removeEventListener('keydown', key); window.removeEventListener('beforeunload', unload); };
    }, []);
    useEffect(() => {
        let alive = true;
        setFound([]);
        const timer = setTimeout(() => { if (query.trim()) api(wpath + '/search?q=' + encodeURIComponent(query)).then(r => { if (alive) setFound(r); }).catch(e => { if (alive) setNotice(message(e)); }); }, 150);
        return () => { alive = false; clearTimeout(timer); };
    }, [query, workspace]);

    function changeWorkspace(id: string) {
        if (id === workspace || !leave()) return false;
        active.current = id; generation.current++;
        setWorkspace(id); setData(emptyState); setSelectedId(null); setSelectedDoc(null); setForm(null); setInboxOpen(false);
        setQuestion(''); setAnswer(null); setFound([]); setQuery(''); setLoading(true);
        return true;
    }
    function go(p: Page, projectId: string | null = null) {
        if (!leave()) return;
        setPage(p); setSelectedId(projectId); setSelectedDoc(null); setPalette(false); setMenu(false);
        window.scrollTo({ top: 0 });
    }
    function openDoc(d: Doc) {
        if (selectedDoc?.id !== d.id && !leave()) return;
        setSelectedDoc(d); setSelectedId(null); setPage('Library'); setPalette(false); setMenu(false);
        if (query.trim()) { const items = [query, ...recent.filter(x => x !== query)].slice(0, 6); setRecent(items); store('recent:' + workspace, JSON.stringify(items)); }
    }
    async function saveForm(value: Record<string, string>) {
        if (!form) return;
        if (form.kind === 'workspace') {
            const w = await api('/workspaces', { name: value.name });
            setWorkspaces(await api('/workspaces'));
            setForm(null);
            if (changeWorkspace(w.id)) setPage('Overview');
            return;
        }
        if (form.kind === 'project') {
            const p = await api(wpath + '/projects' + (form.item ? '/' + form.item.id : ''), value, form.item ? 'PATCH' : 'POST');
            await refresh(); setForm(null); go('Drawer', p.id);
            return;
        }
        await api(wpath + '/projects/' + (value.project || form.project) + '/tasks' + (form.item ? '/' + form.item.id : ''), value, form.item ? 'PATCH' : 'POST');
        await refresh(); setForm(null);
    }
    const updateTask = async (task: Task, status: string) => {
        await api(`${wpath}/projects/${task.project}/tasks/${task.id}`, { status }, 'PATCH'); await refresh();
    };
    const linkDoc = (projectId: string) => (id: string, linked: boolean) => run(async () => {
        setData(prev => ({ ...prev, links: linked ? [...prev.links.filter(l => !(l.project === projectId && l.document === id)), { project: projectId, document: id }] : prev.links.filter(l => !(l.project === projectId && l.document === id)) }));
        try { await api(`${wpath}/projects/${projectId}/documents/${id}`, { linked }); } finally { await refresh(); }
    });
    const status = sync.error ? { cls: 'error', short: 'Needs attention', text: 'Indexing needs attention: ' + sync.error } : sync.outbox ? { cls: 'error', short: 'Report problem', text: sync.outbox } : sync.paused ? { cls: 'paused', short: 'Paused', text: 'Indexing paused' } : { cls: '', short: 'Up to date', text: 'Local and up to date' };
    const summary = new Map(data.drawer.map(s => [s.project, s]));
    const recency = (p: Project) => summary.get(p.id)?.lastCommit || summary.get(p.id)?.reported || p.updated || p.created;
    const sideProjects = [...data.projects].sort((a, b) => recency(b).localeCompare(recency(a))).slice(0, 8);
    const openTasks = data.tasks.filter(t => t.status !== 'Done').length;
    const PageIcon = icons.get(page) || LayoutDashboard;

    return <div className="studio">
        <aside className={'sidebar' + (menu ? ' open' : '')} aria-label="Sidebar">
            <label className="ws-card" title={status.text}>
                <span className="ws-logo">✳</span>
                <span className="ws-text"><b>{workspaceName}</b><small><span className={'status-dot ' + status.cls} />{status.short}</small></span>
                <ChevronsUpDown size={16} />
                <select aria-label="Active workspace" value={workspace} onChange={e => changeWorkspace(e.target.value)}>{workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
            </label>
            <button className="side-search" onClick={() => { setPalette(true); setMenu(false); }}><Search size={16} /><span>Search anything</span><kbd>⌘K</kbd></button>
            <nav className="side-nav" aria-label="Main navigation">
                <small>Main</small>
                {mainPages.map(([p, Icon]) => <button key={p} className={page === p && !(p === 'Drawer' && selectedId) && !(p === 'Library' && selectedDoc) ? 'active' : ''} onClick={() => go(p)}><Icon size={18} />{p}{p === 'Tasks' && openTasks > 0 && <span className="count">{openTasks}</span>}</button>)}
                <small>Projects</small>
                {sideProjects.map(p => {
                    const s = summary.get(p.id);
                    return <button key={p.id} className={'side-project' + (page === 'Drawer' && selectedId === p.id ? ' active' : '')} onClick={() => go('Drawer', p.id)}>
                        {s?.screenshot ? <span className="side-thumb"><img src={asset(workspace, s.screenshot)} alt="" /></span> : <AppIcon project={p} />}
                        <span className="side-label">{p.name}</span><span className={'status-dot small status-' + p.status.toLowerCase().replaceAll(' ', '-')} title={p.status} />
                    </button>;
                })}
                <button className="side-add" onClick={() => { setForm({ kind: 'project' }); setMenu(false); }}><Plus size={16} /> New project</button>
            </nav>
            <div className="side-bottom">
                {data.inbox.length > 0 && <button onClick={() => { setInboxOpen(true); setMenu(false); }}><Inbox size={18} />Inbox<span className="count strong">{data.inbox.length}</span></button>}
                <button onClick={() => { setAssistant(true); setMenu(false); }}><Sparkles size={18} />Studio Agent</button>
                {morePages.map(([p, Icon]) => <button key={p} className={page === p ? 'active' : ''} onClick={() => go(p)}><Icon size={18} />{p}</button>)}
                <button onClick={() => setDark(!dark)}>{dark ? <Sun size={18} /> : <Moon size={18} />}{dark ? 'Light mode' : 'Dark mode'}</button>
            </div>
        </aside>
        {menu && <div className="side-scrim" onClick={() => setMenu(false)} />}
        <div className="main">
            <header className="main-head">
                <button className="icon menu-button" aria-label="Open navigation" onClick={() => setMenu(true)}><Menu size={20} /></button>
                <nav className="breadcrumb" aria-label="Breadcrumb">
                    <PageIcon size={18} />
                    {(project && page === 'Drawer') || (selectedDoc && page === 'Library') ? <button onClick={() => go(page)}>{page}</button> : <b>{page}</b>}
                    {project && page === 'Drawer' && <><span className="crumb-sep">/</span><b>{project.name}</b></>}
                    {selectedDoc && page === 'Library' && <><span className="crumb-sep">/</span><b>{selectedDoc.title}</b></>}
                </nav>
                <div className="head-tools">
                    <span className="sync-pill" title={status.text}><span className={'status-dot ' + status.cls} />{workspaceName}</span>
                    <button className="icon" onClick={() => setPalette(true)} aria-label="Search"><Search size={18} /></button>
                </div>
            </header>
            <main className="canvas">
                {notice && <div className="notice" role="status"><span>{notice}</span><button className="icon" onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={16} /></button></div>}
                {loading ? <div className="loading"><RefreshCw size={20} /> Opening your workspace…</div> : <>
                    {page === 'Overview' && <Overview workspace={workspace} workspaceName={workspaceName} data={data} openProject={id => go('Drawer', id)} openInbox={() => setInboxOpen(true)} openTasks={() => go('Tasks')} notify={setNotice} />}
                    {page === 'Drawer' && (project
                        ? <ProjectPage key={project.id} workspace={workspace} project={project} summary={summary.get(project.id)} data={data} reporter={sync.reporter}
                            edit={() => setForm({ kind: 'project', item: project })}
                            addTask={s => setForm({ kind: 'task', project: project.id, status: s })} editTask={t => setForm({ kind: 'task', project: project.id, item: t })}
                            updateTask={(t, s) => run(() => updateTask(t, s))} openDoc={openDoc} linkDoc={linkDoc(project.id)} notify={setNotice} refresh={refresh} />
                        : <DrawerHome workspace={workspace} projects={data.projects} tasks={data.tasks} drawer={data.drawer} inbox={data.inbox}
                            open={id => go('Drawer', id)} create={() => setForm({ kind: 'project' })} openInbox={() => setInboxOpen(true)} />)}
                    {page === 'Tasks' && <TaskHome tasks={data.tasks} projects={data.projects} edit={t => setForm({ kind: 'task', project: t.project, item: t })}
                        create={() => data.projects.length ? setForm({ kind: 'task', project: data.projects[0].id }) : setForm({ kind: 'project' })}
                        update={(t, s) => run(() => updateTask(t, s))} openProject={id => go('Drawer', id)} />}
                    {page === 'Library' && <Library key={workspace} workspace={workspace} documents={data.documents} selected={selectedDoc} onSelect={setSelectedDoc} refresh={refresh} notify={setNotice} onDirtyChange={d => { dirty.current = d; }} />}
                    {page === 'Activity' && <><PageHead title="Activity" description="What changed in this workspace." /><section className="card activity-feed">{data.activity.map(e => <div key={e.id}><span className="activity-icon"><Check size={14} /></span><div><b>{e.message}</b><small>{new Date(e.created).toLocaleString()}</small></div></div>)}{!data.activity.length && <div className="empty-state"><h2>Nothing yet</h2></div>}</section></>}
                    {page === 'Workspaces' && <><PageHead title="Workspaces" description="Each workspace keeps its projects, tasks, documents and reports separate." action={<button className="button dark" onClick={() => setForm({ kind: 'workspace' })}><Plus size={16} /> New workspace</button>} />
                        <div className="feature-grid size-M">{workspaces.map((w, i) => <div className="feature" key={w.id}><button className="feature-card" onClick={() => { if (changeWorkspace(w.id) || w.id === workspace) go('Overview'); }}>
                            <span className="feature-head"><b>{w.name}</b><small>{workspace === w.id ? 'Current workspace' : 'Open workspace'}</small></span>
                            <span className="feature-visual centered"><span className={`app-icon xl cover-${colors[i % colors.length]}`}><Layers size={30} /></span></span>
                        </button></div>)}</div></>}
                    {page === 'AI Agents' && <><PageHead title="AI Agents" description="Every provider is disconnected. Nothing is executed from this app." />
                        <div className="note-grid">{['OpenAI Codex', 'Claude Code', 'Google Antigravity', 'Ollama', 'Custom agent'].map((name, i) => <article key={name} className="note-card"><div className="note-card-top"><span className={'app-icon large cover-' + colors[i]}><Bot size={22} /></span><span className="chip">Not connected</span></div><h3>{name}</h3><p>{name === 'Claude Code' ? 'Close-session can send end-of-day reports to the Drawer. That is a one-way report; My Studio never runs Claude Code.' : name === 'Ollama' ? 'Local inference on your Mac. A supported adapter and authorization are required.' : 'A supported API or CLI integration, workspace permissions and execution history are pending.'}</p></article>)}</div></>}
                    {page === 'Settings' && <Settings sync={sync} setSync={setSync} data={data} workspace={workspace} dark={dark} setDark={setDark} run={run} notify={setNotice} refresh={refresh} />}
                    {page === 'Developer Tools' && <><PageHead title="Developer tools" description="React · TypeScript · Vite · Node.js · SQLite FTS5" /><section className="card"><h3>Managed files</h3><p>Markdown lives in <code>workspaces/{workspace}/</code>; report screenshots in <code>workspaces/{workspace}/assets/</code>. No outside folders are read by the app.</p><div className="command-list"><code>npm run dev</code><code>npm run build</code><code>npm test</code></div></section></>}
                </>}
            </main>
        </div>
        {form && <ItemForm key={form.kind + ('item' in form ? form.item?.id || 'new' : 'new')} form={form} projects={data.projects} close={() => setForm(null)} save={saveForm} />}
        {inboxOpen && <InboxDialog workspace={workspace} workspaceName={workspaceName} inbox={data.inbox} projects={data.projects} close={() => setInboxOpen(false)} notify={setNotice}
            filed={async id => { await refresh(); if (id) { setInboxOpen(false); go('Drawer', id); } }} />}
        {palette && <div className="overlay" onClick={() => setPalette(false)}><section className="command-palette" role="dialog" aria-label="Search workspace" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="command-input"><Search size={19} /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Projects, tasks, documents…" /><button className="icon" onClick={() => setPalette(false)} aria-label="Close search"><X size={17} /></button></div>
            <div className="command-results">{query.trim() ? <>
                <small>Projects</small>{data.projects.filter(p => (p.name + p.description).toLowerCase().includes(query.toLowerCase())).map(p => <button key={p.id} onClick={() => go('Drawer', p.id)}><Folder size={16} />{p.name}</button>)}
                <small>Tasks</small>{data.tasks.filter(t => (t.title + t.description).toLowerCase().includes(query.toLowerCase())).slice(0, 10).map(t => <button key={t.id} onClick={() => { setForm({ kind: 'task', project: t.project, item: t }); setPalette(false); }}><Circle size={16} />{t.title}</button>)}
                <small>Documents · full text</small>{found.map(d => <button key={d.id} onClick={() => openDoc(d)}><FileText size={16} /><div><b>{d.title}</b><p>{d.content.slice(0, 90)}</p></div></button>)}{!found.length && <p className="search-empty">No document matches.</p>}
            </> : <><small>Go to</small>{allPages.map(p => { const Icon = icons.get(p)!; return <button key={p} onClick={() => go(p)}><Icon size={16} />{p}</button>; })}{!!recent.length && <small>Recent searches</small>}{recent.map(q => <button key={q} onClick={() => setQuery(q)}><Clock size={15} />{q}</button>)}</>}</div>
            <div className="command-footer">Searching {workspaceName} only<span>esc to close</span></div>
        </section></div>}
        {assistant && <div className="assistant-backdrop" onClick={() => setAssistant(false)}><section className="assistant-sheet" role="dialog" aria-modal="true" aria-label="Studio Agent" onClick={e => e.stopPropagation()}>
            <div className="assistant-title"><h2>Studio Agent</h2><button className="icon" aria-label="Close Studio Agent" onClick={() => setAssistant(false)}><X size={19} /></button></div>
            <p className="muted">Finds source passages in this workspace with local keyword search. No AI provider is connected.</p>
            {answer && <div className="answer"><p>{answer.answer}</p>{answer.sources.map((s: any) => <button key={s.id} onClick={() => { const d = data.documents.find(x => x.id === s.id); if (d) { openDoc(d); setAssistant(false); } }}><b>{s.title}</b><p>{s.excerpt}</p><small>{s.path}</small></button>)}</div>}
            <form className="ask-form" onSubmit={e => { e.preventDefault(); const w = workspace; setAsking(true); run(async () => { try { const r = await api(wpath + '/ask', { question }); if (active.current === w) setAnswer(r); } finally { setAsking(false); } }); }}>
                <textarea aria-label="Ask Studio Agent" value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask about your documents…" />
                <button className="button dark" disabled={asking || !question.trim()}>{asking ? 'Finding sources…' : 'Find sources'}<ArrowRight size={15} /></button>
            </form>
        </section></div>}
    </div>;
}

function PageHead({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
    return <section className="hero compact"><h1>{title}</h1><p>{description}</p>{action}</section>;
}

function Settings({ sync, setSync, data, workspace, dark, setDark, run, notify, refresh }: {
    sync: Sync; setSync: (s: Sync) => void; data: StudioState; workspace: string; dark: boolean; setDark: (d: boolean) => void;
    run: (fn: () => Promise<void>) => Promise<void>; notify: (s: string) => void; refresh: () => Promise<void>;
}) {
    const [autoBusy, setAutoBusy] = useState(false);
    const last = sync.autoUpdate.lastResult;
    const times = [...new Set(['17:00', '18:00', '19:00', '20:00', '21:00', '22:00', sync.autoUpdate.time])].sort();
    const fmtTime = (t: string) => new Date(`2000-01-01T${t}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return <><PageHead title="Settings" description="Appearance, indexing, end-of-day reports and backups." />
        <div className="settings-grid">
            <section className="card"><h3>Appearance</h3><p className="muted">Light or dark.</p><div><button className="button" onClick={() => setDark(!dark)}>{dark ? <Sun size={15} /> : <Moon size={15} />} Switch to {dark ? 'light' : 'dark'}</button></div></section>
            <section className="card"><h3>Indexing</h3><p className="muted">{sync.error ? 'Scan failed: ' + sync.error : sync.lastScan ? 'Last successful scan ' + ago(sync.lastScan) : 'No successful scan yet'}</p>
                <label className="setting-select">Scan every<select value={sync.interval} onChange={e => run(async () => setSync(await api('/sync', { interval: Number(e.target.value) })))}>{[10, 30, 60, 300].map(n => <option key={n} value={n}>{n} seconds</option>)}</select></label>
                <div className="button-row"><button className="button" onClick={() => run(async () => setSync(await api('/sync', { paused: !sync.paused })))}>{sync.paused ? <Play size={15} /> : <Pause size={15} />} {sync.paused ? 'Resume' : 'Pause'}</button><button className="button" onClick={() => run(async () => { setSync(await api('/sync', { refresh: true })); notify('Scan finished.'); })}><RefreshCw size={15} /> Scan now</button></div></section>
            <section className="card wide"><h3>Evening auto-update</h3>
                <p className="muted">Each day after the chosen time, My Studio refreshes every linked folder that has not reported that day: git status, version, docs and Cloudflare links, plus a screenshot if the last one is more than a week old. It only runs while My Studio is open.</p>
                <div className="button-row">
                    <label className="switch"><input type="checkbox" checked={sync.autoUpdate.enabled} onChange={e => run(async () => setSync(await api('/sync', { autoUpdate: { enabled: e.target.checked } })))} /><span />{sync.autoUpdate.enabled ? 'On' : 'Off'}</label>
                    <label className="setting-select">at<select value={sync.autoUpdate.time} disabled={!sync.autoUpdate.enabled} onChange={e => run(async () => setSync(await api('/sync', { autoUpdate: { time: e.target.value } })))}>{times.map(t => <option key={t} value={t}>{fmtTime(t)}</option>)}</select></label>
                    <button className="button" disabled={autoBusy || sync.autoRunning || !data.repos.length && !sync.autoUpdate.lastRun} onClick={() => run(async () => {
                        setAutoBusy(true);
                        try { const r = await api('/auto-update/run', {}); notify(`Auto-update finished: ${r.updated} updated, ${r.skipped} already reported today${r.failed?.length ? `, ${r.failed.length} failed` : ''}.`); setSync(await api('/sync')); await refresh(); }
                        finally { setAutoBusy(false); }
                    })}><RefreshCw size={15} /> {autoBusy || sync.autoRunning ? 'Updating…' : 'Run now'}</button>
                </div>
                <p className="muted">{last ? <>Last run {ago(last.at)}: {last.updated} updated, {last.skipped} already reported{last.failed.length ? <>, <span className="warn">{last.failed.length} failed ({last.failed.map(f => f.name).join(', ')})</span></> : null}.</> : 'Not run yet.'}</p>
            </section>
            <section className="card wide"><h3>End-of-day reports</h3>
                <p className="muted">Close-session runs this command in the project folder. Only folders linked below go straight into a project; others wait in the Inbox.</p>
                {sync.reporter && <div className="command"><code>{sync.reporter}</code><button className="icon" aria-label="Copy reporter command" onClick={() => navigator.clipboard.writeText(sync.reporter).then(() => notify('Command copied.'), () => notify('Copy failed; select the command instead.'))}><Copy size={15} /></button></div>}
                {sync.outbox && <p className="form-error">{sync.outbox}</p>}
                <h4>Linked folders in this workspace</h4>
                {data.repos.length ? <div className="data-table">{data.repos.map(r => <div className="row" key={r.id}><span><b>{r.name}</b><small>{r.path}</small></span><span>{data.projects.find(p => p.id === r.project)?.name || '—'}</span><span><button className="button" onClick={() => {
                    if (window.confirm(`Unlink ${r.name}? Past reports stay; new ones will wait in the Inbox.`)) run(async () => { await api(`/w/${workspace}/repos/${r.id}/unlink`, {}); await refresh(); });
                }}>Unlink</button></span></div>)}</div> : <p className="muted">No folders linked yet.</p>}
            </section>
            <section className="card"><h3>Backups</h3><p className="muted">Copies the database, Markdown and screenshots into <code>backups/</code>. Nothing leaves this Mac.</p><div><button className="button" onClick={() => run(async () => { const b = await api('/backup', {}); notify('Backup created: ' + b.path); })}><Shield size={15} /> Create backup</button></div></section>
        </div></>;
}

function ItemForm({ form, projects, close, save }: { form: Form; projects: Project[]; close: () => void; save: (v: Record<string, string>) => Promise<void> }) {
    const item = 'item' in form ? form.item : undefined;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [color, setColor] = useState(form.kind === 'project' ? form.item?.color || 'lilac' : 'lilac');
    const [taskProject, setTaskProject] = useState(form.kind === 'task' ? form.project : '');
    const dialog = useRef<HTMLFormElement>(null);
    const previousFocus = useRef<HTMLElement | null>(document.activeElement as HTMLElement);
    useEffect(() => () => previousFocus.current?.focus(), []);
    const submit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault(); setBusy(true); setError('');
        const value = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
        if (form.kind === 'project') value.color = color;
        try { await save(value); } catch (err) { setError(message(err)); setBusy(false); }
    };
    const p = form.kind === 'project' ? form.item : undefined;
    return <div className="overlay" onClick={() => { if (!busy) close(); }}><form className="dialog" role="dialog" aria-modal="true" aria-label={(item ? 'Edit ' : 'New ') + form.kind} ref={dialog} onClick={e => e.stopPropagation()} onSubmit={submit} onKeyDown={e => {
        if (e.key === 'Escape' && !busy) { e.stopPropagation(); close(); }
        if (e.key === 'Tab') {
            const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('input,select,textarea,button:not(:disabled)') || []);
            const first = controls[0], last = controls[controls.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
            if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }
    }}>
        <div className="dialog-heading"><h2>{item ? 'Edit' : 'New'} {form.kind}</h2><button type="button" className="icon" onClick={close} disabled={busy} aria-label="Close form"><X size={19} /></button></div>
        {form.kind === 'project' && <div className="color-row" role="group" aria-label="Icon color">{colors.map(c => <button type="button" key={c} className={'color-option cover-' + c + (color === c ? ' picked' : '')} onClick={() => setColor(c)} aria-label={'Choose ' + c + ' icon'}>{color === c && <Check size={13} />}</button>)}</div>}
        <label>{form.kind === 'task' ? 'Task title' : 'Name'}<input name={form.kind === 'task' ? 'title' : 'name'} autoFocus required maxLength={form.kind === 'task' ? 240 : 160} defaultValue={form.kind === 'task' ? form.item?.title : p?.name || ''} placeholder={form.kind === 'task' ? 'What needs to happen?' : 'What are you working on?'} /></label>
        {form.kind !== 'workspace' && <>
            {form.kind === 'task' && !form.item && <label>Project<select name="project" value={taskProject} onChange={e => setTaskProject(e.target.value)}>{projects.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
            <label>Description<textarea name="description" maxLength={10000} defaultValue={item?.description || ''} placeholder="A little context goes a long way." /></label>
            <div className="form-grid">
                <label>Status<select name="status" defaultValue={item?.status || (form.kind === 'task' ? form.status || 'To do' : 'Planned')}>{(form.kind === 'project' ? projectStatuses : taskStatuses).map(s => <option key={s}>{s}</option>)}</select></label>
                <label>Priority<select name="priority" defaultValue={item?.priority || 'Medium'}>{priorities.map(x => <option key={x}>{x}</option>)}</select></label>
                <label>Due date<input type="date" name="due" defaultValue={item?.due || ''} /></label>
                <label>Owner<input name="owner" maxLength={120} defaultValue={item?.owner || ''} placeholder="e.g. You, Anne" /></label>
                {form.kind === 'project' && <>
                    <label>Type<select name="kind" defaultValue={p?.kind || ''}><option value="">Auto (from reports)</option>{kinds.map(k => <option key={k}>{k}</option>)}</select></label>
                    <label>Live link<input type="url" name="live_url" maxLength={500} defaultValue={p?.live_url || ''} placeholder="https://…" /></label>
                    <label className="span-2">Repository link<input type="url" name="repo_url" maxLength={500} defaultValue={p?.repo_url || ''} placeholder="https://github.com/…" /></label>
                </>}
            </div>
            {form.kind === 'task' && form.item && <div className="form-context"><Folder size={14} />{projects.find(x => x.id === taskProject)?.name}</div>}
        </>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions"><button type="button" className="button" disabled={busy} onClick={close}>Cancel</button><button className="button dark" disabled={busy}>{busy ? 'Saving…' : item ? 'Save changes' : 'Create ' + form.kind}<ArrowRight size={15} /></button></div>
    </form></div>;
}

createRoot(document.getElementById('root')!).render(<App />);
