import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createStore } from '../server/store.js';
import { projectManagement } from '../server/projects.js';
import { drawerManagement } from '../server/drawer.js';
import { autoUpdater, validTime } from '../server/auto-update.js';
import { normalizeRemote } from '../reporter/collect.js';

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-auto-test-'));
    const store = createStore(root);
    const pm = projectManagement(store);
    const drawer = drawerManagement(store, pm, { inboxDir: path.join(root, 'inbox') });
    t.after(() => { store.db.close(); fs.rmSync(root, { recursive: true, force: true }); });
    return { root, store, pm, drawer };
}
const at = (h, m) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m); };

test('the evening update runs once a day, only for linked folders that have not reported', async t => {
    const { store, drawer, root } = fixture(t);
    const reported = drawer.assign(drawer.ingest({ repo: { path: '/Users/me/reported' } }).id, 'personal', { name: 'Reported' });
    store.db.prepare('INSERT INTO repo_links VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(), 'personal', reported.project, '/Users/me/quiet', 'quiet', new Date().toISOString());
    const settings = { enabled: true, time: '19:00', lastDay: '' };
    const calls = [];
    let saves = 0;
    const auto = autoUpdater({ db: store.db, root, port: 0, settings, save: () => saves++, run: async (repo, o) => { calls.push([repo, o.screenshot]); } });
    assert.equal(auto.due(at(18, 59)), false);
    assert.equal(auto.due(at(19, 0)), true);
    const result = await auto.runAll(at(19, 1));
    assert.deepEqual(calls, [['/Users/me/quiet', true]], 'only the folder without a report today, with a screenshot because none is recent');
    assert.equal(result.updated, 1);
    assert.equal(result.skipped, 1);
    assert.equal(saves, 1);
    assert.equal(auto.due(at(22, 0)), false, 'already ran today');
    settings.lastDay = '';
    settings.enabled = false;
    assert.equal(auto.due(at(22, 0)), false, 'switched off');
});

test('a failing folder is reported and does not stop the others', async t => {
    const { store, drawer, root } = fixture(t);
    const { project } = drawer.assign(drawer.ingest({ repo: { path: '/Users/me/a' } }).id, 'personal', { name: 'A' });
    for (const p of ['/Users/me/gone', '/Users/me/fine']) store.db.prepare('INSERT INTO repo_links VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(), 'personal', project, p, path.basename(p), new Date().toISOString());
    const auto = autoUpdater({ db: store.db, root, port: 0, settings: { enabled: true, time: '19:00' }, save: () => { }, run: async repo => { if (repo.endsWith('gone')) throw Error('Folder not found'); } });
    const result = await auto.runAll(at(20, 0));
    assert.equal(result.updated, 1);
    assert.deepEqual(result.failed, [{ name: 'gone', error: 'Folder not found' }]);
});

test('auto-update times are validated', () => {
    assert.ok(validTime('19:00'));
    assert.ok(!validTime('7pm'));
    assert.ok(!validTime('24:00'));
});

test('SSH host aliases become real hosts in repository links', () => {
    const resolve = alias => ({ 'github-work': 'github.com', 'github-personal': 'github.com' })[alias] || alias;
    assert.equal(normalizeRemote('git@github-work:acme/dashboard.git', resolve), 'https://github.com/acme/dashboard');
    assert.equal(normalizeRemote('git@github-personal:me/site.git', resolve), 'https://github.com/me/site');
    assert.equal(normalizeRemote('git@github.com:me/site.git', resolve), 'https://github.com/me/site');
});
