import { useState } from 'react';
import { Plus, Flag, Calendar, Circle, CircleCheck, MoreHorizontal, Search } from 'lucide-react';
import { priorities, taskStatuses, today, overdue, dateLabel, initials, type Project, type Task } from './model';

const slug = (s: string) => s.toLowerCase().replaceAll(' ', '-');

export function TaskBoard({ tasks, addTask, editTask, updateTask }: { tasks: Task[]; addTask: (status?: string) => void; editTask: (t: Task) => void; updateTask: (t: Task, s: string) => void }) {
    const [priority, setPriority] = useState('All priorities');
    const [query, setQuery] = useState('');
    const [view, setView] = useState<'Board' | 'List'>('Board');
    const filtered = tasks.filter(t => (priority === 'All priorities' || t.priority === priority) && `${t.title} ${t.owner}`.toLowerCase().includes(query.toLowerCase()));
    return <>
        <div className="toolbar">
            <div className="segmented" role="group" aria-label="Task view">{(['Board', 'List'] as const).map(v => <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{v}</button>)}</div>
            <div className="toolbar-end">
                <label className="search-field"><Search size={15} /><input aria-label="Filter tasks" placeholder="Find a task" value={query} onChange={e => setQuery(e.target.value)} /></label>
                <select aria-label="Task priority filter" className="pill-select" value={priority} onChange={e => setPriority(e.target.value)}>{['All priorities', ...priorities].map(v => <option key={v}>{v}</option>)}</select>
                <button className="button dark" onClick={() => addTask()}><Plus size={15} /> Add task</button>
            </div>
        </div>
        {view === 'Board' ? <div className="kanban-board">{taskStatuses.map(status => <section className={'kanban-column column-' + slug(status)} key={status}
            onDragOver={e => { if (e.dataTransfer.types.includes('application/my-studio-task')) e.preventDefault(); }}
            onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('application/my-studio-task'); const t = tasks.find(t => t.id === id); if (t && t.status !== status) updateTask(t, status); }}>
            <div className="column-heading"><span>{status}<b>{filtered.filter(t => t.status === status).length}</b></span><button className="icon" onClick={() => addTask(status)} aria-label={'Add task to ' + status}><Plus size={16} /></button></div>
            <div className="column-tasks">{filtered.filter(t => t.status === status).map(t => <article className="task-card" key={t.id} draggable onDragStart={e => { e.dataTransfer.setData('application/my-studio-task', t.id); e.dataTransfer.effectAllowed = 'move'; }}>
                <div className="task-card-top"><span className={'priority-label priority-' + t.priority.toLowerCase()}><Flag size={11} />{t.priority}</span><button className="icon" onClick={() => editTask(t)} aria-label={'Edit task ' + t.title}><MoreHorizontal size={16} /></button></div>
                <button className="task-title-button" onClick={() => editTask(t)}>{t.title}</button>
                {t.description && <p>{t.description}</p>}
                <div className="task-card-bottom"><span className={overdue(t.due, t.status) ? 'overdue' : ''}><Calendar size={12} />{dateLabel(t.due)}</span>{t.owner && <span className="owner-badge" title={t.owner}>{initials(t.owner)}</span>}</div>
                <select aria-label={'Status of ' + t.title} value={t.status} onChange={e => updateTask(t, e.target.value)}>{taskStatuses.map(s => <option key={s}>{s}</option>)}</select>
            </article>)}</div>
        </section>)}</div> : <div className="card table-card"><TaskList tasks={filtered} projects={[]} edit={editTask} update={updateTask} /></div>}
    </>;
}

export function TaskList({ tasks, projects, edit, update, openProject }: { tasks: Task[]; projects: Project[]; edit: (t: Task) => void; update: (t: Task, s: string) => void; openProject?: (id: string) => void }) {
    return <div className="task-list">
        <div className="task-list-heading"><span>Task</span><span>Status</span><span>Priority</span><span>Due</span><span>Owner</span></div>
        {tasks.map(t => <div className="task-row" key={t.id}>
            <div className="task-name">
                <button className={'complete-task ' + (t.status === 'Done' ? 'is-done' : '')} onClick={() => update(t, t.status === 'Done' ? 'To do' : 'Done')} aria-label={(t.status === 'Done' ? 'Reopen ' : 'Complete ') + t.title}>{t.status === 'Done' ? <CircleCheck size={18} /> : <Circle size={18} />}</button>
                <div><button className={'task-title-button ' + (t.status === 'Done' ? 'finished' : '')} onClick={() => edit(t)}>{t.title}</button>{openProject && <button className="task-project-link" onClick={() => openProject(t.project)}>{projects.find(p => p.id === t.project)?.name}</button>}</div>
            </div>
            <select aria-label={'Status of ' + t.title} value={t.status} onChange={e => update(t, e.target.value)}>{taskStatuses.map(s => <option key={s}>{s}</option>)}</select>
            <span className={'priority-label priority-' + t.priority.toLowerCase()}><Flag size={11} />{t.priority}</span>
            <span className={'task-due ' + (overdue(t.due, t.status) ? 'overdue' : '')}>{dateLabel(t.due)}</span>
            <span>{t.owner ? <span className="owner-badge" title={t.owner}>{initials(t.owner)}</span> : '—'}</span>
        </div>)}
        {!tasks.length && <div className="empty-state"><h2>No tasks here</h2><p>Add a task or change the filters.</p></div>}
    </div>;
}

export function TaskHome({ tasks, projects, edit, create, update, openProject }: { tasks: Task[]; projects: Project[]; edit: (t: Task) => void; create: () => void; update: (t: Task, s: string) => void; openProject: (id: string) => void }) {
    const [filter, setFilter] = useState('Open');
    const [project, setProject] = useState('All projects');
    const counts: Record<string, number> = {
        Open: tasks.filter(t => t.status !== 'Done').length,
        'Due today': tasks.filter(t => t.due === today() && t.status !== 'Done').length,
        Overdue: tasks.filter(t => overdue(t.due, t.status)).length,
        Done: tasks.filter(t => t.status === 'Done').length,
        All: tasks.length
    };
    const filtered = tasks.filter(t => (filter === 'All' || filter === 'Open' && t.status !== 'Done' || filter === 'Due today' && t.status !== 'Done' && t.due === today() || filter === 'Overdue' && overdue(t.due, t.status) || filter === 'Done' && t.status === 'Done') && (project === 'All projects' || t.project === project))
        .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    return <>
        <section className="hero compact"><h1>Tasks</h1><p>Everything open across this workspace’s projects.</p><button className="button dark" onClick={create}><Plus size={16} />{projects.length ? 'New task' : 'Create a project'}</button></section>
        <div className="toolbar">
            <nav className="text-tabs" aria-label="Task filters">{Object.keys(counts).map(f => <button className={filter === f ? 'active' : ''} onClick={() => setFilter(f)} key={f}>{f}<span>{counts[f]}</span></button>)}</nav>
            <div className="toolbar-end"><select className="pill-select" aria-label="Filter by project" value={project} onChange={e => setProject(e.target.value)}><option>All projects</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        </div>
        <div className="card table-card"><TaskList tasks={filtered} projects={projects} edit={edit} update={update} openProject={openProject} /></div>
    </>;
}
