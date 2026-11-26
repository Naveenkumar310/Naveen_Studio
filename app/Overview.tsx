import { useEffect, useMemo, useState } from 'react';
import { GitCommitHorizontal, FileClock, Rocket, ListTodo, AlertTriangle, CircleAlert, Inbox, ArrowUpRight, ChevronRight } from 'lucide-react';
import { StatTile, AreaChart, buckets } from './Charts';
import { api, message, ago, asset, initials, overdue, type StudioState, type Project } from './model';

type Event = { at: string; project: string };
export type Activity = {
    since: string; reports: Event[]; commits: Event[]; deploys: Event[]; tasks: Event[];
    recent: { id: string; project: string; created: string; source: string; version: string; branch: string; summary: string; screenshot: string }[];
};
const metrics = { commits: 'commits', reports: 'reports', deploys: 'deploys', tasks: 'tasks added' } as const;
type Metric = keyof typeof metrics;

function greeting() {
    const h = new Date().getHours();
    return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
const firstLine = (s: string) => s.replace(/[#*_`>]/g, '').split('\n').map(x => x.trim()).find(Boolean) || '';

export function Overview({ workspace, workspaceName, data, openProject, openInbox, openTasks, notify }: {
    workspace: string; workspaceName: string; data: StudioState;
    openProject: (id: string) => void; openInbox: () => void; openTasks: () => void; notify: (s: string) => void;
}) {
    const [activity, setActivity] = useState<Activity | null>(null);
    const [loading, setLoading] = useState(false);
    const [metric, setMetric] = useState<Metric>('commits');
    const [range, setRange] = useState(30);
    const stamp = data.drawer.map(s => s.reported).sort().at(-1) + '|' + data.tasks.length;
    useEffect(() => {
        let alive = true;
        setLoading(true);
        api(`/w/${workspace}/activity?days=90`).then(a => { if (alive) setActivity(a); }).catch(e => notify(message(e))).finally(() => alive && setLoading(false));
        return () => { alive = false; };
    }, [workspace, stamp]);

    const project = (id: string) => data.projects.find(p => p.id === id);
    const two = (events: Event[] = []) => {
        const days = buckets(events, 14);
        return { trend: days.slice(7), current: days.slice(7).reduce((s, d) => s + d.value, 0), previous: days.slice(0, 7).reduce((s, d) => s + d.value, 0) };
    };
    const commits = two(activity?.commits), reports = two(activity?.reports), deploys = two(activity?.deploys), tasksAdded = two(activity?.tasks);
    const open = data.tasks.filter(t => t.status !== 'Done').length;
    const series = useMemo(() => buckets(activity?.[metric] || [], range), [activity, metric, range]);

    const attention = [
        ...data.inbox.map(i => ({ key: 'inbox-' + i.id, icon: <Inbox size={16} />, level: 'info', title: `${i.name} is waiting for a project`, detail: 'New report in the Inbox', act: openInbox })),
        ...data.drawer.filter(s => (s.unpushed ?? 0) > 0).map(s => ({ key: 'push-' + s.project, icon: <AlertTriangle size={16} />, level: 'warning', title: `${project(s.project)?.name}: ${s.unpushed} ${s.unpushed === 1 ? 'commit' : 'commits'} not pushed`, detail: 'Another device cannot pull these yet', act: () => openProject(s.project) })),
        ...data.drawer.filter(s => s.dirty > 0).map(s => ({ key: 'dirty-' + s.project, icon: <AlertTriangle size={16} />, level: 'warning', title: `${project(s.project)?.name}: ${s.dirty} uncommitted ${s.dirty === 1 ? 'file' : 'files'}`, detail: `At the last report, ${ago(s.reported)}`, act: () => openProject(s.project) })),
        ...data.tasks.filter(t => overdue(t.due, t.status)).slice(0, 5).map(t => ({ key: 'task-' + t.id, icon: <CircleAlert size={16} />, level: 'critical', title: `Overdue: ${t.title}`, detail: project(t.project)?.name || '', act: openTasks }))
    ];
    const screens = data.drawer.filter(s => s.screenshot).sort((a, b) => b.reported.localeCompare(a.reported));

    return <div className="overview-page">
        <div className="greeting">
            <h1>{greeting()}.</h1>
            <p>Here’s what moved in {workspaceName} this week.</p>
        </div>
        <div className={'kpi-row' + (loading && activity ? ' refreshing' : '')}>
            <StatTile label="Commits" icon={<GitCommitHorizontal size={17} />} value={commits.current} delta={commits} trend={commits.trend} unit="commits" />
            <StatTile label="Reports" icon={<FileClock size={17} />} value={reports.current} delta={reports} trend={reports.trend} unit="reports" />
            <StatTile label="Deploys" icon={<Rocket size={17} />} value={deploys.current} delta={deploys} trend={deploys.trend} unit="deploys" />
            <StatTile label="Open tasks" icon={<ListTodo size={17} />} value={open} note={`${tasksAdded.current} added this week`} trend={tasksAdded.trend} unit="tasks added" />
        </div>

        <div className="filter-row" role="group" aria-label="Chart filters">
            <div className="segmented small">{(Object.keys(metrics) as Metric[]).map(m => <button key={m} className={metric === m ? 'active' : ''} onClick={() => setMetric(m)}>{m[0].toUpperCase() + m.slice(1)}</button>)}</div>
            <div className="segmented small">{[7, 30, 90].map(r => <button key={r} className={range === r ? 'active' : ''} onClick={() => setRange(r)}>{r} days</button>)}</div>
        </div>
        <div className="dash-grid">
            <section className={'card chart-card' + (loading && activity ? ' refreshing' : '')}>
                <header className="card-head"><div><h3>{metrics[metric][0].toUpperCase() + metrics[metric].slice(1)} per day</h3><small>Last {range} days · {series.reduce((s, d) => s + d.value, 0).toLocaleString()} in total</small></div></header>
                <AreaChart data={series} unit={metrics[metric]} title={`${metrics[metric]} per day, last ${range} days`} />
            </section>
            <section className="card attention">
                <header className="card-head"><div><h3>Needs attention</h3><small>{attention.length ? `${attention.length} ${attention.length === 1 ? 'item' : 'items'}` : 'All clear'}</small></div></header>
                {attention.length ? <ul>{attention.slice(0, 7).map(a => <li key={a.key}><button onClick={a.act} className={'attention-row level-' + a.level}><span className="attention-icon">{a.icon}</span><span><b>{a.title}</b><small>{a.detail}</small></span><ChevronRight size={16} /></button></li>)}</ul>
                    : <p className="muted">Nothing is unpushed, uncommitted or overdue.</p>}
            </section>
        </div>

        <section className="strip-section">
            <header className="section-head"><h2>Latest screens</h2><small>{screens.length ? 'From end-of-day reports' : 'Screenshots appear after reports with a live link'}</small></header>
            {screens.length ? <div className="screen-strip">{screens.map(s => {
                const p = project(s.project);
                return p && <button key={s.project} className="screen-card" onClick={() => openProject(s.project)} aria-label={`Open project ${p.name}`}>
                    <span className="screen-frame"><img src={asset(workspace, s.screenshot)} alt="" loading="lazy" /></span>
                    <span className="screen-meta"><span className={`app-icon cover-${p.color}`}>{initials(p.name)}</span><b>{p.name}</b><small>{ago(s.reported)}</small></span>
                </button>;
            })}</div> : <div className="strip-empty" />}
        </section>

        <section className="card recent">
            <header className="card-head"><div><h3>Recent reports</h3><small>From close-session and the reporter</small></div></header>
            {activity?.recent.length ? <ul>{activity.recent.map(r => {
                const p = project(r.project) as Project | undefined;
                return p && <li key={r.id}><button className="recent-row" onClick={() => openProject(r.project)}>
                    <span className={`app-icon cover-${p.color}`}>{initials(p.name)}</span>
                    <span className="recent-text"><b>{p.name}</b><small>{firstLine(r.summary) || 'No summary'}</small></span>
                    {r.version && <span className="chip">{/^\d/.test(r.version) ? 'v' + r.version : r.version}</span>}
                    <small className="recent-time">{ago(r.created)}</small><ArrowUpRight size={15} />
                </button></li>;
            })}</ul> : <p className="muted">No reports yet. Close a session in any project folder to send the first one.</p>}
        </section>
    </div>;
}
