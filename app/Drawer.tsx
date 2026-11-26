import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUpRight, Plus, Search, Inbox, X, FileText, Link as LinkIcon, GitBranch, Trash2, Copy, Maximize2, Columns2, ChevronLeft, ChevronRight } from 'lucide-react';
import SafeMarkdown from './SafeMarkdown';
import { TaskBoard } from './Tasks';
import { Sparkline, buckets } from './Charts';
import {
    api, message, ago, asset, host, initials, shortHash, dateLabel, overdue, kinds, kindOf, liveOf, repoOf,
    type Project, type Task, type Doc, type DrawerSummary, type InboxItem, type ProjectDrawer, type Deploy, type StudioState, type Snapshot
} from './model';

const slug = (s: string) => s.toLowerCase().replaceAll(' ', '-');
const version = (v: string) => /^\d/.test(v) ? 'v' + v : v;
const external = { target: '_blank', rel: 'noopener noreferrer' } as const;
const commitUrl = (remote: string, head: string) => remote && head && host(remote) === 'github.com' ? `${remote}/commit/${head}` : '';
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const readSize = () => { try { return localStorage.getItem('drawer-size') || 'M'; } catch { return 'M'; } };

export function AppIcon({ project, size = '' }: { project: Project; size?: string }) {
    return <span className={`app-icon ${size} cover-${project.color || 'lilac'}`} aria-hidden="true">{initials(project.name)}</span>;
}

/** Mobbin-style feature card: title centred at the top, the visual bleeding off the edge; hovering scrolls a tall screenshot. */
export function FeatureCard({ title, meta, image, icon, label, onClick, children }: { title: string; meta?: string; image?: string; icon?: ReactNode; label: string; onClick: () => void; children?: ReactNode }) {
    return <div className="feature">
        <button className="feature-card" onClick={onClick} aria-label={label}>
            <span className="feature-head"><b>{title}</b>{meta && <small>{meta}</small>}</span>
            <span className={'feature-visual' + (image ? '' : ' centered')}>{image ? <img src={image} alt="" loading="lazy" /> : icon}</span>
        </button>
        {children}
    </div>;
}

export function Lightbox({ src, close }: { src: string; close: () => void }) {
    useEffect(() => {
        const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
        window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
    }, [close]);
    return <div className="overlay lightbox" onClick={close} role="dialog" aria-modal="true" aria-label="Screenshot">
        <button className="icon lightbox-close" onClick={close} aria-label="Close screenshot"><X size={20} /></button>
        <div className="lightbox-scroll" onClick={e => e.stopPropagation()}><img src={src} alt="Project screenshot" /></div>
    </div>;
}

export function DrawerHome({ workspace, projects, tasks, drawer, inbox, open, create, openInbox }: {
    workspace: string; projects: Project[]; tasks: Task[]; drawer: DrawerSummary[]; inbox: InboxItem[];
    open: (id: string) => void; create: () => void; openInbox: () => void;
}) {
    const [kind, setKind] = useState('All');
    const [status, setStatus] = useState('All');
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState('Latest');
    const [size, setSize] = useState(readSize);
    const summary = useMemo(() => new Map(drawer.map(s => [s.project, s])), [drawer]);
    // "Latest" = most recent real work: last commit, else last report, else last edit.
    const activity = (p: Project) => summary.get(p.id)?.lastCommit || [summary.get(p.id)?.reported || '', p.updated || '', p.created].sort().at(-1) || '';
    const shown = projects
        .filter(p => (kind === 'All' || kindOf(p, summary.get(p.id)) === kind) && (status === 'All' || p.status === status))
        .filter(p => `${p.name} ${p.description} ${p.owner} ${summary.get(p.id)?.tech.join(' ') || ''}`.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => sort === 'Name' ? a.name.localeCompare(b.name) : sort === 'Due date' ? (a.due || '9999').localeCompare(b.due || '9999') : activity(b).localeCompare(activity(a)));
    const resize = (s: string) => { setSize(s); try { localStorage.setItem('drawer-size', s); } catch { } };
    return <>
        <section className="hero">
            <h1>Drawer</h1>
            <p>Every project with its builds, docs and screenshots.</p>
            <div className="segmented" role="group" aria-label="Project type">{['All', ...kinds].map(k => <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>{k}</button>)}</div>
        </section>
        {inbox.length > 0 && <button className="inbox-banner" onClick={openInbox}>
            <span className="inbox-icon"><Inbox size={18} /></span><span><b>{inbox.length} new {inbox.length === 1 ? 'report' : 'reports'}</b> from {inbox.slice(0, 3).map(i => i.name).join(', ')}{inbox.length > 3 ? '…' : ''} {inbox.length === 1 ? 'is' : 'are'} waiting for a project</span><em>Review</em>
        </button>}
        <div className="toolbar">
            <nav className="text-tabs" aria-label="Project status">{['All', 'In progress', 'Planned', 'On hold', 'Complete'].map(s => <button key={s} className={status === s ? 'active' : ''} onClick={() => setStatus(s)}>{s}</button>)}</nav>
            <div className="toolbar-end">
                <label className="search-field"><Search size={16} /><input aria-label="Filter projects" placeholder="Find a project" value={query} onChange={e => setQuery(e.target.value)} /></label>
                <select aria-label="Sort projects" className="pill-select" value={sort} onChange={e => setSort(e.target.value)}>{['Latest', 'Name', 'Due date'].map(s => <option key={s}>{s}</option>)}</select>
                <div className="size-control" role="group" aria-label="Card size"><span>View</span>{['L', 'M', 'S'].map(s => <button key={s} className={size === s ? 'active' : ''} onClick={() => resize(s)} aria-label={{ L: 'Large cards', M: 'Medium cards', S: 'Small cards' }[s]}>{s}</button>)}</div>
                <button className="button dark" onClick={create}><Plus size={16} /> New project</button>
            </div>
        </div>
        <div className={'feature-grid size-' + size}>{shown.map(p => {
            const s = summary.get(p.id);
            const list = tasks.filter(t => t.project === p.id), done = list.filter(t => t.status === 'Done').length;
            const meta = [s?.version ? version(s.version) : '', s?.lastCommit ? `Last commit ${ago(s.lastCommit)}` : s ? `Report ${ago(s.reported)}` : list.length ? `${done}/${list.length} tasks` : 'No reports yet'].filter(Boolean).join(' · ');
            return <FeatureCard key={p.id} title={p.name} meta={meta} label={`Open project ${p.name}`} onClick={() => open(p.id)}
                image={s?.screenshot ? asset(workspace, s.screenshot) : ''} icon={<AppIcon project={p} size="xl" />}>
                <div className="chips">
                    <span className={'chip status-' + slug(p.status)}>{p.status}</span>
                    <span className="chip">{kindOf(p, s)}</span>
                    {s?.tech.slice(0, 3).map(t => <span className="chip" key={t}>{t}</span>)}
                    {(s?.unpushed ?? 0) > 0 && <span className="chip warn-chip">{s!.unpushed} unpushed</span>}
                </div>
            </FeatureCard>;
        })}</div>
        {!shown.length && (projects.length
            ? <div className="empty-state"><h2>No projects match</h2><p>Try another type, status or search.</p></div>
            : <div className="empty-state large"><h2>Your drawer is empty</h2><p>Create a project, or close a work session in any project folder. Its first end-of-day report waits in the Inbox until you choose where it belongs.</p><button className="button dark" onClick={create}><Plus size={15} /> New project</button></div>)}
    </>;
}

const tabs = ['Overview', 'Tasks', 'Timeline', 'Builds', 'Visuals', 'Docs', 'Notes'] as const;
type Tab = typeof tabs[number];

export function ProjectPage({ workspace, project: p, summary, data, reporter, edit, addTask, editTask, updateTask, openDoc, linkDoc, notify, refresh }: {
    workspace: string; project: Project; summary?: DrawerSummary; data: StudioState; reporter: string;
    edit: () => void; addTask: (status?: string) => void; editTask: (t: Task) => void; updateTask: (t: Task, s: string) => void;
    openDoc: (d: Doc) => void; linkDoc: (id: string, linked: boolean) => void; notify: (s: string) => void; refresh: () => Promise<void>;
}) {
    const [tab, setTab] = useState<Tab>('Overview');
    const [drawer, setDrawer] = useState<ProjectDrawer | null>(null);
    const [lightbox, setLightbox] = useState('');
    const [adding, setAdding] = useState(false);
    const load = () => api(`/w/${workspace}/projects/${p.id}/drawer`).then(setDrawer).catch(e => notify(message(e)));
    useEffect(() => { load(); }, [p.id, summary?.reported, data.repos.length]);
    const tasks = data.tasks.filter(t => t.project === p.id);
    const done = tasks.filter(t => t.status === 'Done').length;
    const latest = drawer?.snapshots[0];
    const live = liveOf(p, summary), repo = repoOf(p, latest?.remote);
    const unlink = async (id: string, name: string) => {
        if (!window.confirm(`Unlink the folder “${name}”? Its past reports stay here; new reports from it will wait in the Inbox.`)) return;
        try { await api(`/w/${workspace}/repos/${id}/unlink`, {}); await refresh(); await load(); } catch (e) { notify(message(e)); }
    };
    return <div className="project-page">
        <header className="project-head">
            <AppIcon project={p} size="xl" />
            <div className="project-title">
                <h1>{p.name}</h1>
                <p>{p.description || 'No description yet.'}</p>
                <div className="chips">
                    <span className={'chip status-' + slug(p.status)}>{p.status}</span>
                    <span className="chip">{kindOf(p, summary)}</span>
                    <span className="chip">{p.priority} priority</span>
                    {p.owner && <span className="chip">{p.owner}</span>}
                    {p.due && <span className={'chip ' + (overdue(p.due, p.status) ? 'overdue' : '')}>Due {dateLabel(p.due)}</span>}
                </div>
            </div>
            <div className="head-actions">
                {live && <a className="button dark" href={live} {...external}>Live <ArrowUpRight size={15} /></a>}
                {repo && <a className="button" href={repo} {...external}>Repo <ArrowUpRight size={15} /></a>}
                <button className="button" onClick={edit}>Edit</button>
            </div>
        </header>
        <nav className="text-tabs ruled" aria-label="Project sections">{tabs.map(t => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}
            {t === 'Tasks' && <span>{tasks.length}</span>}{t === 'Timeline' && !!drawer?.snapshots.length && <span>{drawer.snapshots.length}</span>}
            {t === 'Docs' && !!drawer?.docs.length && <span>{drawer.docs.length}</span>}{t === 'Notes' && <span>{data.links.filter(l => l.project === p.id).length}</span>}</button>)}</nav>

        {tab === 'Overview' && drawer && <>
            <div className="studio-grid">
                <Viewer workspace={workspace} project={p} drawer={drawer} live={live} full={setLightbox} />
                <aside className="card details">
                    <header className="card-head"><div><h3>Details</h3><small>{latest ? `From the report ${ago(latest.created)}` : 'No reports yet'}</small></div></header>
                    <dl className="facts">
                        <div><dt>Version</dt><dd>{latest?.version ? version(latest.version) : '—'}</dd></div>
                        <div><dt>Branch</dt><dd>{latest?.branch ? <><GitBranch size={13} /> {latest.branch}{latest.head && <> · {commitUrl(latest.remote, latest.head) ? <a href={commitUrl(latest.remote, latest.head)} {...external}><code>{shortHash(latest.head)}</code></a> : <code>{shortHash(latest.head)}</code>}</>}</> : '—'}</dd></div>
                        <div><dt>Pushed</dt><dd>{!latest || !latest.head ? '—' : (summary?.unpushed ?? latest.unpushed) === null ? 'No upstream branch' : (summary?.unpushed ?? latest.unpushed) === 0 ? <span className="ok">Up to date</span> : <span className="warn">{summary?.unpushed ?? latest.unpushed} not pushed</span>}</dd></div>
                        <div><dt>Uncommitted</dt><dd>{!latest ? '—' : (summary?.dirty ?? latest.dirty) ? <span className="warn">{summary?.dirty ?? latest.dirty} {(summary?.dirty ?? latest.dirty) === 1 ? 'file' : 'files'}</span> : latest.head ? <span className="ok">Clean</span> : '—'}</dd></div>
                        <div><dt>Live</dt><dd>{live ? <a href={live} {...external}>{host(live)}</a> : '—'}</dd></div>
                        <div><dt>Tasks</dt><dd>{tasks.length ? <span className="progress-inline"><span className="meter"><i style={{ width: `${(done / tasks.length) * 100}%` }} /></span>{done}/{tasks.length}</span> : 'None'}</dd></div>
                        {!drawer.repos.length && <div><dt>Folder</dt><dd>Not linked</dd></div>}
                    </dl>
                    {drawer.repos.length > 0 && <div className="folder-list"><small>{drawer.repos.length === 1 ? 'Linked folder' : `${drawer.repos.length} linked folders`}</small>{drawer.repos.map(r => {
                        const s = drawer.snapshots.find(x => x.repo === r.path);
                        return <div className="folder-row" key={r.id} title={r.path}>
                            <b>{r.name}</b>
                            <span className="muted">{s?.branch ? <><GitBranch size={12} /> {s.branch}</> : s ? 'no git' : 'no report yet'}</span>
                            {!!s?.dirty && <span className="chip warn-chip">{s.dirty} uncommitted</span>}
                            {!!s?.unpushed && <span className="chip warn-chip">{s.unpushed} unpushed</span>}
                            <button className="text-button" onClick={() => unlink(r.id, r.name)}>Unlink</button>
                        </div>;
                    })}</div>}
                    <div className="spark-block">
                        <div><small>Commits · last 30 days</small><b>{drawer.snapshots.flatMap(s => s.commits).filter(c => Date.now() - Date.parse(c.date) < 30 * 864e5).length}</b></div>
                        <Sparkline data={buckets(drawer.snapshots.flatMap(s => s.commits.map(c => ({ at: c.date }))), 30)} label="Commits per day, last 30 days" />
                    </div>
                    {!!latest?.tech.length && <div className="chips">{latest.tech.map(t => <span className="chip" key={t}>{t}</span>)}</div>}
                </aside>
            </div>
            <div className="studio-lower">
                <section className="card">
                    <header className="card-head"><div><h3>Latest update</h3><small>{latest ? `${ago(latest.created)} · ${latest.source}` : 'Waiting for the first report'}</small></div>{latest && <button className="text-button" onClick={() => setTab('Timeline')}>Timeline</button>}</header>
                    {latest?.summary ? <SafeMarkdown>{latest.summary}</SafeMarkdown> : latest ? <p className="muted">No summary was sent.</p> : <ReporterHint reporter={reporter} notify={notify} />}
                    {!!latest?.commits.length && <ul className="commit-list">{latest.commits.slice(0, 5).map(c => <li key={c.hash}><code>{shortHash(c.hash)}</code>{c.subject}</li>)}</ul>}
                </section>
                <section className="card">
                    <header className="card-head"><div><h3>Builds</h3><small>{drawer.deploys.length ? `${drawer.deploys.length} links` : 'No deploy links yet'}</small></div><button className="text-button" onClick={() => setTab('Builds')}>All builds</button></header>
                    <DeployLinks deploys={drawer.deploys.slice(0, 6)} />
                    {!drawer.deploys.length && <p className="muted">Cloudflare deploy links appear here after a report.</p>}
                </section>
            </div>
        </>}

        {tab === 'Tasks' && <TaskBoard tasks={tasks} addTask={addTask} editTask={editTask} updateTask={updateTask} />}

        {tab === 'Timeline' && (drawer?.snapshots.length ? <Timeline drawer={drawer} workspace={workspace} view={setLightbox} /> : drawer && <ReporterHint reporter={reporter} notify={notify} />)}

        {tab === 'Builds' && drawer && <Builds drawer={drawer} add={() => setAdding(true)} remove={async d => {
            if (!window.confirm(`Remove the link ${host(d.url)}?`)) return;
            try { await api(`/w/${workspace}/projects/${p.id}/links/${d.id}/remove`, {}); await load(); await refresh(); } catch (e) { notify(message(e)); }
        }} />}

        {tab === 'Visuals' && drawer && <Visuals workspace={workspace} drawer={drawer} view={setLightbox} />}

        {tab === 'Docs' && drawer && <RepoDocs workspace={workspace} drawer={drawer} notify={notify} />}

        {tab === 'Notes' && <Notes project={p} data={data} openDoc={openDoc} linkDoc={linkDoc} />}

        {adding && <AddLink close={() => setAdding(false)} save={async v => { await api(`/w/${workspace}/projects/${p.id}/links`, v); setAdding(false); await load(); await refresh(); }} />}
        {lightbox && <Lightbox src={lightbox} close={() => setLightbox('')} />}
    </div>;
}

/** Central viewer: the screenshot inside a browser frame, scrollable, with a version scrubber and a thumbnail strip. */
function Viewer({ workspace, project, drawer, live, full }: { workspace: string; project: Project; drawer: ProjectDrawer; live: string; full: (src: string) => void }) {
    const shots = drawer.snapshots.filter(s => s.screenshot).slice().reverse(); // oldest → newest
    const [index, setIndex] = useState(shots.length - 1);
    useEffect(() => { setIndex(shots.length - 1); }, [shots.length]);
    const shot: Snapshot | undefined = shots[Math.max(0, Math.min(index, shots.length - 1))];
    if (!shot) return <section className="card viewer empty">
        <div className="viewer-empty"><AppIcon project={project} size="xl" /><h3>No screenshot yet</h3><p className="muted">A report that includes a live link adds a full-page screenshot here. Each new report adds a version you can scrub through.</p></div>
    </section>;
    const src = asset(workspace, shot.screenshot);
    return <section className="card viewer">
        <div className="viewer-bar">
            <div className="scrubber">
                <button className="icon" aria-label="Previous version" disabled={index <= 0} onClick={() => setIndex(i => i - 1)}><ChevronLeft size={16} /></button>
                <input type="range" min={0} max={shots.length - 1} value={index} onChange={e => setIndex(Number(e.target.value))} aria-label="Screenshot version" disabled={shots.length < 2} />
                <button className="icon" aria-label="Next version" disabled={index >= shots.length - 1} onClick={() => setIndex(i => i + 1)}><ChevronRight size={16} /></button>
                <span className="scrub-label"><b>{shot.version ? version(shot.version) : 'Snapshot'}</b> · {shortDate(shot.created)}{index === shots.length - 1 ? ' · latest' : ''}</span>
            </div>
            <div className="viewer-tools">
                {live && <a className="tool" href={live} {...external}><ArrowUpRight size={15} /> Open live</a>}
                <button className="tool" onClick={() => full(src)}><Maximize2 size={14} /> Full screen</button>
            </div>
        </div>
        <div className="browser-frame">
            <div className="browser-chrome"><i /><i /><i /><span>{shot.screenshot_url ? host(shot.screenshot_url) : project.name}</span></div>
            <div className="browser-page"><img src={src} alt={`Screenshot of ${project.name}, ${shot.version || shortDate(shot.created)}`} /></div>
        </div>
        {shots.length > 1 && <div className="thumb-strip" role="listbox" aria-label="Versions">{shots.map((s, i) => <button key={s.id} role="option" aria-selected={i === index} className={i === index ? 'active' : ''} onClick={() => setIndex(i)}>
            <img src={asset(workspace, s.screenshot)} alt="" loading="lazy" /><small>{s.version ? version(s.version) : shortDate(s.created)}</small>
        </button>)}</div>}
    </section>;
}

/** Before/after comparison of two screenshots with a draggable divider. */
function Visuals({ workspace, drawer, view }: { workspace: string; drawer: ProjectDrawer; view: (src: string) => void }) {
    const shots = drawer.snapshots.filter(s => s.screenshot);
    const [mode, setMode] = useState<'Grid' | 'Compare'>('Grid');
    const [a, setA] = useState(shots[1]?.id || shots[0]?.id || '');
    const [b, setB] = useState(shots[0]?.id || '');
    const [split, setSplit] = useState(50);
    if (!shots.length) return <div className="empty-state"><h2>No screenshots yet</h2><p>Reports take a full-page screenshot of the newest production link, or of a page you pass with <code>--screenshot</code>.</p></div>;
    const label = (s: Snapshot) => `${s.version ? version(s.version) : 'Snapshot'} · ${new Date(s.created).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
    const before = shots.find(s => s.id === a) || shots[0], after = shots.find(s => s.id === b) || shots[0];
    return <>
        <div className="toolbar">
            <div className="segmented small" role="group" aria-label="Visuals view">{(['Grid', 'Compare'] as const).map(m => <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)} disabled={m === 'Compare' && shots.length < 2}>{m === 'Compare' ? <><Columns2 size={14} /> Compare</> : m}</button>)}</div>
            {mode === 'Compare' && <div className="toolbar-end">
                <select className="pill-select" aria-label="Before" value={before.id} onChange={e => setA(e.target.value)}>{shots.map(s => <option key={s.id} value={s.id}>Before: {label(s)}</option>)}</select>
                <select className="pill-select" aria-label="After" value={after.id} onChange={e => setB(e.target.value)}>{shots.map(s => <option key={s.id} value={s.id}>After: {label(s)}</option>)}</select>
            </div>}
        </div>
        {mode === 'Grid' ? <div className="feature-grid size-M">{shots.map(s => <FeatureCard key={s.id} title={s.version ? version(s.version) : 'Snapshot'} meta={shortDate(s.created)}
            image={asset(workspace, s.screenshot)} label={`Screenshot from ${new Date(s.created).toLocaleString()}`} onClick={() => view(asset(workspace, s.screenshot))} />)}</div>
            : <section className="card compare">
                <div className="compare-stage" style={{ ['--split' as string]: `${split}%` }}>
                    <img src={asset(workspace, after.screenshot)} alt={`After: ${label(after)}`} />
                    <div className="compare-before"><img src={asset(workspace, before.screenshot)} alt={`Before: ${label(before)}`} /></div>
                    <span className="compare-handle" aria-hidden="true" />
                    <input type="range" min={0} max={100} value={split} onChange={e => setSplit(Number(e.target.value))} aria-label="Move the divider between before and after" />
                    <span className="compare-tag left">Before</span><span className="compare-tag right">After</span>
                </div>
            </section>}
    </>;
}

function ReporterHint({ reporter, notify }: { reporter: string; notify: (s: string) => void }) {
    const command = `${reporter} --summary "What changed today"`;
    return <div className="hint">
        <p>When you close a session in this project’s folder, close-session sends its git status, version, deploy links, docs and a screenshot here. To send one yourself, run this in the project folder:</p>
        <div className="command"><code>{command}</code><button className="icon" aria-label="Copy command" onClick={() => navigator.clipboard.writeText(command).then(() => notify('Command copied.'), () => notify('Copy failed; select the command instead.'))}><Copy size={15} /></button></div>
        <p className="muted">A folder’s first report waits in the Inbox until you choose this project for it.</p>
    </div>;
}

function DeployLinks({ deploys }: { deploys: Deploy[] }) {
    if (!deploys.length) return null;
    return <div className="link-row">{deploys.map(d => <a key={d.id} className={'link-chip env-' + d.environment} href={d.url} {...external}><span className="env-dot" />{d.label || host(d.url)}<small>{d.environment === 'link' ? host(d.url) : d.environment}</small></a>)}</div>;
}

function Timeline({ drawer, workspace, view }: { drawer: ProjectDrawer; workspace: string; view: (src: string) => void }) {
    const days = new Map<string, ProjectDrawer['snapshots']>();
    for (const s of drawer.snapshots) {
        const day = new Date(s.created).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        days.set(day, [...(days.get(day) || []), s]);
    }
    return <div className="timeline">{[...days].map(([day, items]) => <section className="timeline-day" key={day}>
        <h3>{day}</h3>
        {items.map(s => <article className="timeline-entry" key={s.id}>
            <span className="timeline-dot" aria-hidden="true" />
            <div className="entry-meta">
                <span>{new Date(s.created).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                {s.version && <span className="chip">{version(s.version)}</span>}
                {s.branch && <span className="chip"><GitBranch size={11} /> {s.branch}</span>}
                <span className="muted">{s.source}</span>
            </div>
            <div className="entry-body">
                <div>
                    {s.summary ? <SafeMarkdown>{s.summary}</SafeMarkdown> : <p className="muted">No summary was sent.</p>}
                    {!!s.commits.length && <ul className="commit-list">{s.commits.slice(0, 8).map(c => <li key={c.hash}><code>{shortHash(c.hash)}</code>{c.subject}</li>)}</ul>}
                    {s.commits.length > 8 && <details className="more-commits"><summary>Show {s.commits.length - 8} more {s.commits.length - 8 === 1 ? 'commit' : 'commits'}</summary><ul className="commit-list">{s.commits.slice(8).map(c => <li key={c.hash}><code>{shortHash(c.hash)}</code>{c.subject}</li>)}</ul></details>}
                    <DeployLinks deploys={drawer.deploys.filter(d => d.snapshot === s.id)} />
                </div>
                {s.screenshot && <button className="thumb" onClick={() => view(asset(workspace, s.screenshot))} aria-label="View screenshot"><img src={asset(workspace, s.screenshot)} alt="" loading="lazy" /></button>}
            </div>
        </article>)}
    </section>)}</div>;
}

function Builds({ drawer, add, remove }: { drawer: ProjectDrawer; add: () => void; remove: (d: Deploy) => void }) {
    const versionOf = (d: Deploy) => drawer.snapshots.find(s => s.id === d.snapshot)?.version || '';
    return <>
        <div className="toolbar"><p className="muted">Links from Cloudflare deploy output, close-session, and links you add yourself.</p><div className="toolbar-end"><button className="button" onClick={add}><Plus size={15} /> Add link</button></div></div>
        {drawer.deploys.length ? <div className="card table-card"><div className="data-table builds">
            <div className="row head"><span>When</span><span>Type</span><span>Link</span><span>Version</span><span>Ref</span><span>Source</span></div>
            {drawer.deploys.map(d => <div className="row" key={d.id}>
                <span>{ago(d.created)}</span>
                <span><span className={'chip env-' + d.environment}><span className="env-dot" />{d.environment === 'link' ? 'Link' : d.environment === 'production' ? 'Production' : 'Preview'}</span></span>
                <span className="link-cell"><a href={d.url} {...external}>{d.label ? <b>{d.label}</b> : null}{host(d.url)} <ArrowUpRight size={13} /></a></span>
                <span>{versionOf(d) ? version(versionOf(d)) : '—'}</span>
                <span>{d.ref ? <code>{d.ref.slice(0, 12)}</code> : '—'}</span>
                <span className="source">{d.provider === 'manual' ? <>Added in My Studio <button className="icon" aria-label={`Remove link ${host(d.url)}`} onClick={() => remove(d)}><Trash2 size={14} /></button></> : d.provider === 'cloudflare' ? 'Cloudflare' : 'Report'}</span>
            </div>)}
        </div></div> : <div className="empty-state"><h2>No builds yet</h2><p>Deploy with <code>WRANGLER_OUTPUT_FILE_DIRECTORY=.wrangler/output</code> so reports can pick up Cloudflare links, or add a link here.</p></div>}
    </>;
}

function RepoDocs({ workspace, drawer, notify }: { workspace: string; drawer: ProjectDrawer; notify: (s: string) => void }) {
    const [selected, setSelected] = useState(drawer.docs.find(d => /^readme/i.test(d.name))?.id || drawer.docs[0]?.id || '');
    const [doc, setDoc] = useState<{ name: string; content: string; created: string; snapshot: string } | null>(null);
    useEffect(() => { if (selected) api(`/w/${workspace}/repo-docs/${selected}`).then(setDoc).catch(e => notify(message(e))); }, [selected]);
    if (!drawer.docs.length) return <div className="empty-state"><h2>No docs yet</h2><p>Reports copy README, CHANGELOG, handoff notes and <code>docs/*.md</code> from the project folder. The originals are never changed.</p></div>;
    const head = doc ? drawer.snapshots.find(s => s.id === doc.snapshot)?.head : '';
    return <div className="docs-layout">
        <nav className="card docs-list" aria-label="Project documents">{drawer.docs.map(d => <button key={d.id} className={selected === d.id ? 'active' : ''} onClick={() => setSelected(d.id)}><FileText size={15} /><span>{d.name}<small>{ago(d.created)}{d.versions > 1 ? ` · ${d.versions} versions` : ''}</small></span></button>)}</nav>
        <article className="card doc-view">{doc && <>
            <p className="muted doc-source">Copy of <b>{doc.name}</b> from {new Date(doc.created).toLocaleString()}{head ? <> at <code>{shortHash(head)}</code></> : null}. Read-only.</p>
            <SafeMarkdown>{doc.content}</SafeMarkdown>
        </>}</article>
    </div>;
}

function Notes({ project: p, data, openDoc, linkDoc }: { project: Project; data: StudioState; openDoc: (d: Doc) => void; linkDoc: (id: string, linked: boolean) => void }) {
    const [linking, setLinking] = useState(false);
    const linked = data.links.filter(l => l.project === p.id).map(l => data.documents.find(d => d.id === l.document)).filter((d): d is Doc => !!d);
    return <>
        <div className="toolbar"><p className="muted">Research and notes from your Library. Linking never moves a file.</p><div className="toolbar-end"><button className="button" onClick={() => setLinking(!linking)}><LinkIcon size={15} />{linking ? 'Done linking' : 'Link documents'}</button></div></div>
        {linking && <div className="link-picker">{data.documents.map(d => <label key={d.id}><input type="checkbox" checked={linked.some(x => x.id === d.id)} onChange={e => linkDoc(d.id, e.target.checked)} /><FileText size={16} />{d.title}<span>{d.category}</span></label>)}{!data.documents.length && <p>Create a document in the Library first.</p>}</div>}
        <div className="note-grid">{linked.map(d => <button className="note-card linked-document" key={d.id} onClick={() => openDoc(d)}><span className="chip">{d.category}</span><h3>{d.title}</h3><p>{d.content.replace(/[#*`>]/g, '').slice(0, 140)}</p><small>v{d.version} · {ago(d.updated)}</small></button>)}</div>
        {!linked.length && !linking && <div className="empty-state"><h2>No notes linked</h2><p>Link a brief, research notes or a specification from your Library.</p></div>}
    </>;
}

function AddLink({ close, save }: { close: () => void; save: (v: { label: string; url: string; environment: string }) => Promise<void> }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const submit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault(); setBusy(true); setError('');
        const v = Object.fromEntries(new FormData(e.currentTarget).entries()) as { label: string; url: string; environment: string };
        try { await save(v); } catch (err) { setError(message(err)); setBusy(false); }
    };
    return <div className="overlay" onClick={() => !busy && close()}><form className="dialog" role="dialog" aria-modal="true" aria-label="Add link" onClick={e => e.stopPropagation()} onSubmit={submit}
        onKeyDown={e => { if (e.key === 'Escape' && !busy) close(); }}>
        <div className="dialog-heading"><h2>Add link</h2><button type="button" className="icon" onClick={close} disabled={busy} aria-label="Close"><X size={18} /></button></div>
        <label>URL<input name="url" type="url" required autoFocus placeholder="https://my-site.pages.dev" /></label>
        <label>Label<input name="label" maxLength={80} placeholder="Production site" /></label>
        <label>Type<select name="environment" defaultValue="production"><option value="production">Production</option><option value="preview">Preview</option><option value="link">Other link</option></select></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions"><button type="button" className="button" onClick={close} disabled={busy}>Cancel</button><button className="button dark" disabled={busy}>{busy ? 'Saving…' : 'Add link'}</button></div>
    </form></div>;
}

export function InboxDialog({ workspace, workspaceName, inbox, projects, close, filed, notify }: {
    workspace: string; workspaceName: string; inbox: InboxItem[]; projects: Project[];
    close: () => void; filed: (project: string) => Promise<void>; notify: (s: string) => void;
}) {
    const [choice, setChoice] = useState<Record<string, string>>({});
    const [names, setNames] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState('');
    const file = async (item: InboxItem) => {
        const target = choice[item.id] || 'new';
        setBusy(item.id);
        try {
            const r = await api(`/inbox/${item.id}/assign`, target === 'new' ? { workspace, name: names[item.id] ?? item.name } : { workspace, project: target });
            await filed(r.project);
        } catch (e) { notify(message(e)); } finally { setBusy(''); }
    };
    const dismiss = async (item: InboxItem) => {
        if (!window.confirm(`Dismiss the report from ${item.name}? Nothing is linked; the folder’s next report will appear here again.`)) return;
        try { await api(`/inbox/${item.id}/dismiss`, {}); await filed(''); } catch (e) { notify(message(e)); }
    };
    return <div className="overlay" onClick={close}><section className="dialog wide" role="dialog" aria-modal="true" aria-label="Inbox" onClick={e => e.stopPropagation()}>
        <div className="dialog-heading"><div><h2>Inbox</h2><p className="muted">Reports from folders that are not linked yet. Choosing a project in <b>{workspaceName}</b> links the folder, so its future reports go straight there.</p></div><button className="icon" onClick={close} aria-label="Close inbox"><X size={18} /></button></div>
        {inbox.map(item => <div className="inbox-item" key={item.id}>
            <div><b>{item.name}</b><small title={item.repo}>{item.repo}</small><small>{item.branch ? `${item.branch} · ` : ''}{ago(item.created)}</small></div>
            <select aria-label={`Project for ${item.name}`} value={choice[item.id] || 'new'} onChange={e => setChoice({ ...choice, [item.id]: e.target.value })}>
                <option value="new">New project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {(choice[item.id] || 'new') === 'new' && <input aria-label={`New project name for ${item.name}`} value={names[item.id] ?? item.name} onChange={e => setNames({ ...names, [item.id]: e.target.value })} />}
            <div className="inbox-actions"><button className="button" onClick={() => dismiss(item)} disabled={!!busy}>Dismiss</button><button className="button dark" onClick={() => file(item)} disabled={!!busy}>{busy === item.id ? 'Adding…' : 'Add to drawer'}</button></div>
        </div>)}
        {!inbox.length && <p className="muted">Nothing waiting.</p>}
    </section></div>;
}
