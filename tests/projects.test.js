import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/store.js';
import { projectManagement } from '../server/projects.js';
function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-project-test-'));
    const store = createStore(root);
    const pm = projectManagement(store);
    t.after(() => { store.db.close(); fs.rmSync(root, { recursive: true, force: true }); });
    return { store, pm, root };
}
test('projects persist metadata and support partial updates', t => {
    const { pm } = fixture(t);
    const p = pm.saveProject('personal', { name: 'Studio redesign', due: '2026-12-20', owner: 'Naveen', priority: 'High', color: 'blue' });
    const updated = pm.saveProject('personal', { status: 'In progress' }, p.id);
    assert.equal(updated.name, p.name);
    assert.equal(updated.due, '2026-12-20');
    assert.equal(updated.owner, 'Naveen');
    assert.equal(updated.status, 'In progress');
    assert.throws(() => pm.saveProject('anne', { name: 'Access attempt' }, p.id), /not found/);
});
test('tasks require a project in the same workspace and retain fields on status changes', t => {
    const { pm, store } = fixture(t);
    const p = pm.saveProject('personal', { name: 'A project' });
    const task = pm.saveTask('personal', p.id, { title: 'Design board', due: '2026-12-01', owner: 'Anne', priority: 'Urgent' });
    const updated = pm.saveTask('personal', p.id, { status: 'Done' }, task.id);
    assert.equal(updated.due, task.due);
    assert.equal(updated.owner, 'Anne');
    assert.equal(updated.status, 'Done');
    assert.throws(() => pm.saveTask('professional', p.id, { title: 'Cross workspace' }), /not found/);
    const another = pm.saveProject('personal', { name: 'Another project' });
    assert.throws(() => pm.saveTask('personal', another.id, { status: 'Done' }, task.id), /not found/);
    assert.ok(store.db.prepare('SELECT message FROM activity WHERE workspace=?').all('personal').some(a => a.message.includes('Design board')));
});
test('document associations cannot cross workspace boundaries', t => {
    const { pm, store } = fixture(t);
    const p = pm.saveProject('personal', { name: 'Brief' });
    const own = store.save('personal', { title: 'Local brief', content: 'Own data' });
    const secret = store.save('professional', { title: 'Private', content: 'Secret' });
    assert.throws(() => pm.linkDocument('personal', p.id, secret.id, true), /not found/);
    pm.linkDocument('personal', p.id, own.id, true);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM project_documents').get().n, 1);
    pm.linkDocument('personal', p.id, own.id, false);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM project_documents').get().n, 0);
});
test('invalid status, date, empty titles and priority cannot be stored', t => {
    const { pm } = fixture(t);
    assert.throws(() => pm.saveProject('personal', { name: '   ' }), /Invalid/);
    assert.throws(() => pm.saveProject('personal', { name: 'Bad date', due: '2026-02-31' }), /Invalid/);
    const p = pm.saveProject('personal', { name: 'Valid' });
    assert.throws(() => pm.saveProject('personal', { status: 'Invented' }, p.id), /Invalid/);
    assert.throws(() => pm.saveTask('personal', p.id, { title: 'Task', status: 'Unknown' }), /Invalid/);
    assert.throws(() => pm.saveTask('personal', p.id, { title: 'Task', priority: 'Really high' }), /Invalid/);
});
test('project migration preserves existing projects and is idempotent', t => {
    const { pm, store } = fixture(t);
    const p = pm.saveProject('personal', { name: 'Keep this project' });
    const migrated = projectManagement(store);
    assert.equal(migrated.project('personal', p.id).name, p.name);
});
