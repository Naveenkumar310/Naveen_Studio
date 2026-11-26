import crypto from 'node:crypto';

export const projectStatuses = ['Planned', 'In progress', 'On hold', 'Complete'];
export const taskStatuses = ['Backlog', 'To do', 'In progress', 'Done'];
export const priorities = ['Low', 'Medium', 'High', 'Urgent'];
export const kinds = ['Web', 'Mobile', 'Tool', 'Other'];

function text(value, name, limit, required = false) {
    if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) {
        throw Error(`Invalid ${name}`);
    }
    return value.trim();
}
function choice(value, allowed, name) {
    if (!allowed.includes(value)) throw Error(`Invalid ${name}`);
    return value;
}
export function webUrl(value, name = 'link') {
    if (!value) return '';
    if (typeof value !== 'string' || value.length > 500) throw Error(`Invalid ${name}`);
    let url;
    try { url = new URL(value.trim()); } catch { throw Error(`Invalid ${name}`); }
    if (!['http:', 'https:'].includes(url.protocol)) throw Error(`Invalid ${name}`);
    url.username = ''; url.password = '';
    return url.toString();
}
function date(value) {
    if (!value) return '';
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
        throw Error('Invalid due date');
    }
    return value;
}

export function projectManagement(store) {
    const { db, workspace, log } = store;
    const columns = new Set(db.prepare('PRAGMA table_info(projects)').all().map(c => c.name));
    for (const [name, declaration] of Object.entries({
        priority: "TEXT DEFAULT 'Medium'", due: "TEXT DEFAULT ''", owner: "TEXT DEFAULT ''",
        color: "TEXT DEFAULT 'lilac'", updated: "TEXT DEFAULT ''",
        kind: "TEXT DEFAULT ''", live_url: "TEXT DEFAULT ''", repo_url: "TEXT DEFAULT ''"
    })) {
        if (!columns.has(name)) db.exec(`ALTER TABLE projects ADD COLUMN ${name} ${declaration}`);
    }
    db.exec(`CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, workspace TEXT NOT NULL, project TEXT NOT NULL,
        title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL,
        priority TEXT NOT NULL, due TEXT NOT NULL DEFAULT '', owner TEXT NOT NULL DEFAULT '',
        created TEXT NOT NULL, updated TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS tasks_workspace_project ON tasks(workspace,project);
        CREATE TABLE IF NOT EXISTS project_documents (
            workspace TEXT NOT NULL, project TEXT NOT NULL, document TEXT NOT NULL,
            PRIMARY KEY(workspace,project,document));`);

    function project(w, id) {
        workspace(w);
        const p = db.prepare('SELECT * FROM projects WHERE workspace=? AND id=?').get(w, id);
        if (!p) throw Error('Project not found in this workspace');
        return p;
    }
    function saveProject(w, input, id) {
        workspace(w);
        const old = id ? project(w, id) : null;
        const data = { ...old, ...input };
        const p = {
            id: old?.id || crypto.randomUUID(), workspace: w,
            name: text(data.name, 'project name', 160, true),
            description: text(data.description || '', 'description', 10000),
            status: choice(data.status || 'Planned', projectStatuses, 'project status'),
            priority: choice(data.priority || 'Medium', priorities, 'priority'),
            due: date(data.due), owner: text(data.owner || '', 'owner', 120),
            color: choice(data.color || 'lilac', ['lilac', 'peach', 'blue', 'mint', 'yellow', 'rose'], 'color'),
            kind: choice(data.kind || '', ['', ...kinds], 'project type'),
            live_url: webUrl(data.live_url, 'live link'), repo_url: webUrl(data.repo_url, 'repository link'),
            created: old?.created || new Date().toISOString(), updated: new Date().toISOString()
        };
        db.prepare(`INSERT OR REPLACE INTO projects
            (id,workspace,name,description,status,created,priority,due,owner,color,updated,kind,live_url,repo_url)
            VALUES(@id,@workspace,@name,@description,@status,@created,@priority,@due,@owner,@color,@updated,@kind,@live_url,@repo_url)`).run(p);
        log(w, `${old ? 'Updated' : 'Created'} project: ${p.name}`);
        return p;
    }
    function saveTask(w, p, input, id) {
        project(w, p);
        const old = id ? db.prepare('SELECT * FROM tasks WHERE workspace=? AND project=? AND id=?').get(w, p, id) : null;
        if (id && !old) throw Error('Task not found in this project');
        const data = { ...old, ...input };
        const task = {
            id: old?.id || crypto.randomUUID(), workspace: w, project: p,
            title: text(data.title, 'task title', 240, true),
            description: text(data.description || '', 'task description', 10000),
            status: choice(data.status || 'To do', taskStatuses, 'task status'),
            priority: choice(data.priority || 'Medium', priorities, 'priority'),
            due: date(data.due), owner: text(data.owner || '', 'owner', 120),
            created: old?.created || new Date().toISOString(), updated: new Date().toISOString()
        };
        db.prepare(`INSERT OR REPLACE INTO tasks VALUES
            (@id,@workspace,@project,@title,@description,@status,@priority,@due,@owner,@created,@updated)`).run(task);
        log(w, `${old ? 'Updated' : 'Created'} task: ${task.title}`);
        return task;
    }
    function linkDocument(w, p, d, linked) {
        project(w, p);
        if (!db.prepare('SELECT id FROM documents WHERE workspace=? AND id=?').get(w, d)) {
            throw Error('Document not found in this workspace');
        }
        if (linked) db.prepare('INSERT OR IGNORE INTO project_documents VALUES(?,?,?)').run(w, p, d);
        else db.prepare('DELETE FROM project_documents WHERE workspace=? AND project=? AND document=?').run(w, p, d);
        log(w, `${linked ? 'Linked' : 'Unlinked'} document in project ${project(w, p).name}`);
    }
    return { project, saveProject, saveTask, linkDocument };
}
