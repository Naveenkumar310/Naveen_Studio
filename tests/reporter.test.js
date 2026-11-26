import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { normalizeRemote, parseWranglerOutput, parseLink, buildReport, readDocs, detectProject } from '../reporter/collect.js';

function repo(t) {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'studio-reporter-test-')));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
    git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@example.com'); git('config', 'user.name', 'T');
    return { dir, git };
}

test('remotes become browsable links without credentials', () => {
    assert.equal(normalizeRemote('git@github.com:acme/site.git'), 'https://github.com/acme/site');
    assert.equal(normalizeRemote('ssh://git@github.com:22/acme/site.git'), 'https://github.com/acme/site');
    assert.equal(normalizeRemote('https://user:ghp_secret@github.com/acme/site.git'), 'https://github.com/acme/site');
    assert.equal(normalizeRemote('file:///tmp/repo'), '');
});

test('Wrangler output becomes production and preview links', () => {
    const now = new Date().toISOString();
    const lines = [
        { type: 'deploy', worker_name: 'api', targets: ['https://api.acme.workers.dev', 'api.acme.com/*', 'schedule: */5 * * * *'], version_id: 'v1', timestamp: now },
        { type: 'pages-deploy', pages_project: 'site', deployment_id: 'd1', url: 'https://d1.site.pages.dev', timestamp: now },
        { type: 'pages-deploy-detailed', pages_project: 'site', deployment_id: 'd1', url: 'https://d1.site.pages.dev', alias: 'https://site.pages.dev', environment: 'production', deployment_trigger: { metadata: { commit_hash: 'abc' } }, timestamp: now },
        { type: 'version-upload', worker_name: 'api', version_id: 'v2', preview_url: 'https://v2-api.acme.workers.dev', timestamp: now },
        { type: 'deploy', worker_name: 'old', targets: ['https://old.workers.dev'], timestamp: '2020-01-01T00:00:00Z' }
    ].map(l => JSON.stringify(l)).join('\n') + '\nnot json\n';
    const deploys = parseWranglerOutput(lines, { since: Date.now() - 86400000 });
    const byUrl = Object.fromEntries(deploys.map(d => [d.url, d.environment]));
    assert.equal(byUrl['https://api.acme.workers.dev/'], 'production');
    assert.equal(byUrl['https://api.acme.com/'], 'production');
    assert.equal(byUrl['https://d1.site.pages.dev/'], 'production', 'the detailed entry wins over the plain one');
    assert.equal(byUrl['https://site.pages.dev/'], 'production');
    assert.equal(byUrl['https://v2-api.acme.workers.dev/'], 'preview');
    assert.ok(!deploys.some(d => d.url.includes('old.workers.dev')), 'old entries are skipped');
    assert.ok(!deploys.some(d => d.url.includes('schedule')), 'cron targets are not links');
    assert.equal(parseWranglerOutput(lines, { since: 0, names: new Set(['site']) }).every(d => d.label.startsWith('site')), true, 'shared output is filtered by project name');
});

test('links passed by close-session are classified by label', () => {
    assert.equal(parseLink('Production=https://site.com').environment, 'production');
    assert.equal(parseLink('Preview=https://p.site.com').environment, 'preview');
    assert.equal(parseLink('Figma=https://figma.com/file/x').environment, 'link');
    assert.equal(parseLink('https://bare.example.com').label, '');
    assert.equal(parseLink('javascript:alert(1)'), null);
});

test('reports include git state, docs and tech but never secrets', t => {
    const { dir, git } = repo(t);
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '2.1.0', dependencies: { react: '19', vite: '6' } }));
    fs.writeFileSync(path.join(dir, 'README.md'), '# Site');
    fs.writeFileSync(path.join(dir, 'HANDOFF_WEB.md'), 'Serve with npm run dev');
    fs.writeFileSync(path.join(dir, '.env'), 'SECRET=1');
    fs.writeFileSync(path.join(dir, 'notes.md'), 'not a standard doc');
    fs.mkdirSync(path.join(dir, 'docs'));
    fs.writeFileSync(path.join(dir, 'docs', 'plan.md'), 'Plan');
    fs.symlinkSync('/etc/hosts', path.join(dir, 'CHANGELOG.md'));
    git('add', '-A'); git('commit', '-qm', 'First');
    git('remote', 'add', 'origin', 'https://me:token@github.com/me/site.git');
    const r = buildReport(dir, { summary: 'Did things' }, {});
    assert.equal(r.repo.path, dir);
    assert.equal(r.version, '2.1.0');
    assert.equal(r.kind, 'Web');
    assert.deepEqual(r.tech, ['React', 'Vite']);
    assert.equal(r.git.branch, 'main');
    assert.equal(r.git.commits.length, 1);
    assert.equal(r.git.remote, 'https://github.com/me/site');
    assert.equal(r.git.unpushed, null);
    assert.deepEqual(r.docs.map(d => d.name).sort(), ['HANDOFF_WEB.md', 'README.md', 'docs/plan.md']);
    assert.ok(!JSON.stringify(r).includes('SECRET'));
});

test('extra docs must stay inside the project folder', t => {
    const { dir } = repo(t);
    fs.writeFileSync(path.join(dir, 'design.md'), 'Design');
    const names = readDocs(dir, ['design.md', '../../etc/passwd', '/etc/hosts']).map(d => d.name);
    assert.deepEqual(names, ['design.md']);
});

test('mobile and tool projects are detected', t => {
    const { dir } = repo(t);
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { expo: '50', 'react-native': '0.74' } }));
    assert.equal(detectProject(dir).kind, 'Mobile');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ bin: { tool: 'cli.js' } }));
    assert.equal(detectProject(dir).kind, 'Tool');
});
