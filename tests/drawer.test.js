import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/store.js';
import { projectManagement } from '../server/projects.js';
import { drawerManagement, cleanReport } from '../server/drawer.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]).toString('base64');
function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-drawer-test-'));
    const store = createStore(root);
    const pm = projectManagement(store);
    const drawer = drawerManagement(store, pm, { inboxDir: path.join(root, 'inbox') });
    t.after(() => { store.db.close(); fs.rmSync(root, { recursive: true, force: true }); });
    return { root, store, pm, drawer };
}
const report = (extra = {}) => ({
    repo: { path: '/Users/someone/Projects/aurora', name: 'aurora' }, source: 'close-session', summary: 'Shipped the hero',
    version: '1.0.0', kind: 'Web', tech: ['React', 'Cloudflare'],
    git: { branch: 'main', head: 'a'.repeat(40), remote: 'https://github.com/acme/aurora', dirty: 0, unpushed: 2, commits: [{ hash: 'a'.repeat(40), date: '2026-11-26T10:00:00Z', subject: 'Hero' }] },
    deploys: [{ provider: 'cloudflare', environment: 'production', label: 'aurora', url: 'https://aurora.pages.dev', ref: 'abc', created: '2026-11-26T10:00:00Z', key: 'cf:1' }],
    docs: [{ name: 'README.md', content: '# Aurora' }],
    ...extra
});

test('reports from unlinked folders wait in the inbox until the user files them', t => {
    const { drawer, store } = fixture(t);
    const first = drawer.ingest(report());
    assert.equal(first.status, 'inbox');
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM snapshots').get().n, 0);
    assert.equal(drawer.inbox().length, 1);
    const again = drawer.ingest(report({ summary: 'Newer' }));
    assert.equal(again.id, first.id, 'a second report from the same folder replaces the waiting one');
    const filed = drawer.assign(first.id, 'personal', { name: 'Aurora' });
    assert.equal(drawer.inbox().length, 0);
    const page = drawer.projectDrawer('personal', filed.project);
    assert.equal(page.snapshots[0].summary, 'Newer');
    assert.equal(page.repos[0].path, '/Users/someone/Projects/aurora');
    const linked = drawer.ingest(report({ summary: 'Day two' }));
    assert.equal(linked.status, 'linked');
    assert.equal(linked.project, 'Aurora');
    assert.equal(drawer.projectDrawer('personal', filed.project).snapshots.length, 2);
});

test('linked reports stay inside their workspace', t => {
    const { drawer, pm } = fixture(t);
    const p = pm.saveProject('professional', { name: 'Client site' });
    drawer.assign(drawer.ingest(report()).id, 'professional', { project: p.id });
    assert.throws(() => drawer.projectDrawer('personal', p.id), /not found/);
    assert.equal(drawer.summaries('personal').length, 0);
    assert.equal(drawer.summaries('professional').length, 1);
    assert.throws(() => drawer.assign('missing', 'personal', {}), /not found/);
    const waiting = drawer.ingest(report({ repo: { path: '/Users/someone/Projects/other' } }));
    assert.throws(() => drawer.assign(waiting.id, 'anne', { project: p.id }), /not found/, 'a project from another workspace cannot be chosen');
    assert.equal(drawer.inbox().length, 1, 'the report keeps waiting');
});

test('deploys, docs and commits are de-duplicated across reports', t => {
    const { drawer } = fixture(t);
    const { project } = drawer.assign(drawer.ingest(report()).id, 'personal', {});
    drawer.ingest(report({ docs: [{ name: 'README.md', content: '# Aurora' }, { name: 'docs/plan.md', content: 'Plan' }] }));
    drawer.ingest(report({ docs: [{ name: 'README.md', content: '# Aurora v2' }] }));
    const page = drawer.projectDrawer('personal', project);
    assert.equal(page.deploys.length, 1);
    assert.deepEqual(page.docs.map(d => [d.name, d.versions]), [['docs/plan.md', 1], ['README.md', 2]]);
    assert.equal(page.snapshots[0].commits.length, 0, 'commits already reported are not repeated');
    assert.equal(page.snapshots.at(-1).commits.length, 1);
    assert.equal(drawer.summaries('personal')[0].live, 'https://aurora.pages.dev/');
});

test('invalid reports are rejected before anything is stored', t => {
    const { drawer, store } = fixture(t);
    assert.throws(() => cleanReport(report({ repo: { path: 'relative/path' } })), /folder path/);
    assert.throws(() => cleanReport(report({ deploys: [{ environment: 'production', url: 'javascript:alert(1)' }] })), /deploy link/);
    assert.throws(() => cleanReport(report({ docs: [{ name: '../../etc/passwd.md', content: 'x' }] })), /document name/);
    assert.throws(() => cleanReport(report({ git: { head: 'not-a-hash' } })), /commit/);
    assert.throws(() => cleanReport(report({ screenshot: { type: 'jpg', data: Buffer.from('<svg/>').toString('base64') } })), /screenshot/);
    assert.equal(cleanReport(report({ git: { remote: 'https://user:secret@github.com/acme/aurora' } })).report.git.remote, 'https://github.com/acme/aurora');
    assert.throws(() => drawer.ingest(null), /Invalid report/);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM inbox').get().n, 0);
});

test('screenshots move from the inbox into the workspace and are served by safe name only', t => {
    const { drawer, store } = fixture(t);
    const waiting = drawer.ingest(report({ screenshot: { type: 'jpg', data: JPEG } }));
    const { project } = drawer.assign(waiting.id, 'personal', {});
    const shot = drawer.summaries('personal')[0].screenshot;
    assert.match(shot, /^[0-9a-f-]{36}\.jpg$/);
    assert.ok(fs.existsSync(drawer.asset('personal', shot)));
    assert.throws(() => drawer.asset('personal', '../../system/studio.sqlite'), /Not found/);
    assert.throws(() => drawer.asset('anne', shot), /Not found/);
    assert.equal(fs.readdirSync(path.join(path.dirname(store.directory('personal')), '..', 'inbox')).length, 0);
    assert.ok(project);
});

test('manual links can be added and removed; reported links cannot be removed', t => {
    const { drawer } = fixture(t);
    const { project } = drawer.assign(drawer.ingest(report()).id, 'personal', {});
    const link = drawer.addLink('personal', project, { label: 'Staging', url: 'https://staging.example.com', environment: 'preview' });
    assert.throws(() => drawer.addLink('personal', project, { url: 'file:///etc/passwd' }), /Invalid/);
    const reported = drawer.projectDrawer('personal', project).deploys.find(d => d.provider === 'cloudflare');
    assert.throws(() => drawer.removeLink('personal', project, reported.id), /not found/);
    drawer.removeLink('personal', project, link.id);
    assert.equal(drawer.projectDrawer('personal', project).deploys.length, 1);
});

test('unlinking a folder sends its next report back to the inbox', t => {
    const { drawer } = fixture(t);
    const { project } = drawer.assign(drawer.ingest(report()).id, 'personal', {});
    const [repo] = drawer.repos('personal');
    assert.throws(() => drawer.unlink('anne', repo.id), /not found/);
    drawer.unlink('personal', repo.id);
    assert.equal(drawer.ingest(report()).status, 'inbox');
    assert.equal(drawer.projectDrawer('personal', project).snapshots.length, 1, 'past reports stay');
});

test('git health adds up every linked folder of a project', t => {
    const { drawer } = fixture(t);
    const web = report({ repo: { path: '/Users/someone/admin-web' }, git: { branch: 'web', dirty: 11, unpushed: 2 } });
    const tablet = report({ repo: { path: '/Users/someone/admin-tablet' }, git: { branch: 'tablet', dirty: 0, unpushed: null } });
    const { project } = drawer.assign(drawer.ingest(web).id, 'personal', { name: 'Admin' });
    drawer.assign(drawer.ingest(tablet).id, 'personal', { project });
    const [summary] = drawer.summaries('personal');
    assert.equal(drawer.summaries('personal').length, 1, 'one summary per project, even for reports in the same millisecond');
    assert.equal(summary.dirty, 11, 'but the web folder’s uncommitted files still count');
    assert.equal(summary.unpushed, 2);
});

test('a screenshot keeps the address it was taken from, through the inbox', t => {
    const { drawer } = fixture(t);
    const waiting = drawer.ingest(report({ screenshot: { type: 'jpg', data: JPEG, url: 'https://module.example.com' } }));
    const { project } = drawer.assign(waiting.id, 'personal', {});
    assert.equal(drawer.projectDrawer('personal', project).snapshots[0].screenshot_url, 'https://module.example.com/');
    assert.throws(() => cleanReport(report({ screenshot: { type: 'jpg', data: JPEG, url: 'javascript:x' } })), /screenshot link/);
});
