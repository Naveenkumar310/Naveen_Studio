import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createStudio } from '../server/app.js';

// Starts the real HTTP app on a spare loopback port with temporary data.
async function server(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-http-test-'));
    const port = 41000 + Math.floor(Math.random() * 8000);
    const studio = createStudio({ root, port, watch: false });
    const listener = await new Promise(resolve => { const l = studio.app.listen(port, '127.0.0.1', () => resolve(l)); });
    t.after(() => { listener.close(); studio.stop(); fs.rmSync(root, { recursive: true, force: true }); });
    const request = (method, url, { body, headers = {} } = {}) => new Promise((resolve, reject) => {
        const data = body === undefined ? null : JSON.stringify(body);
        const req = http.request({ host: '127.0.0.1', port, method, path: url, headers: { Host: `127.0.0.1:${port}`, ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers } }, res => {
            let text = ''; res.on('data', c => text += c); res.on('end', () => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }));
        });
        req.on('error', reject); if (data) req.write(data); req.end();
    });
    return { root, port, studio, request };
}
const report = { repo: { path: '/Users/someone/site', name: 'site' }, summary: 'Day one', git: { branch: 'main' }, deploys: [], docs: [] };

test('requests addressed to another hostname are refused (DNS rebinding)', async t => {
    const { request, port } = await server(t);
    assert.equal((await request('GET', '/api/w/personal/state')).status, 200);
    assert.equal((await request('GET', '/api/w/personal/state', { headers: { Host: `attacker.example:${port}` } })).status, 421);
    assert.equal((await request('GET', '/api/w/personal/state', { headers: { Host: '127.0.0.1:5173' } })).status, 200, 'the Vite proxy keeps the UI host');
});

test('browser origins other than the local UI cannot write', async t => {
    const { request } = await server(t);
    const denied = await request('POST', '/api/workspaces', { body: { name: 'x' }, headers: { Origin: 'https://evil.example' } });
    assert.equal(denied.status, 403);
    const allowed = await request('POST', '/api/w/personal/projects', { body: { name: 'Mine' }, headers: { Origin: 'http://127.0.0.1:5173' } });
    assert.equal(allowed.status, 200);
});

test('reports need the local key and are refused from browsers', async t => {
    const { request, studio } = await server(t);
    assert.equal((await request('POST', '/api/ingest', { body: report })).status, 401);
    assert.equal((await request('POST', '/api/ingest', { body: report, headers: { Authorization: 'Bearer ' + '0'.repeat(64) } })).status, 401);
    assert.equal((await request('POST', '/api/ingest', { body: report, headers: { Authorization: `Bearer ${studio.key}`, Origin: 'http://127.0.0.1:5173' } })).status, 403);
    const ok = await request('POST', '/api/ingest', { body: report, headers: { Authorization: `Bearer ${studio.key}` } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.status, 'inbox');
    const bad = await request('POST', '/api/ingest', { body: { ...report, repo: { path: 'relative' } }, headers: { Authorization: `Bearer ${studio.key}` } });
    assert.equal(bad.status, 400);
});

test('the report key file is private to the user', async t => {
    const { root } = await server(t);
    const mode = fs.statSync(path.join(root, 'system/configurations/ingest-token')).mode & 0o777;
    assert.equal(mode, 0o600);
});

test('saving over an outside change returns 409 instead of overwriting', async t => {
    const { request } = await server(t);
    const doc = (await request('POST', '/api/w/personal/documents', { body: { title: 'Plan', content: 'v1' } })).body;
    const first = await request('POST', '/api/w/personal/documents', { body: { ...doc, content: 'mine', approved: true } });
    assert.equal(first.status, 200);
    const stale = await request('POST', '/api/w/personal/documents', { body: { ...doc, content: 'stale tab', approved: true } });
    assert.equal(stale.status, 409);
    const current = (await request('GET', '/api/w/personal/state')).body.documents[0];
    assert.equal(current.content, 'mine');
});

test('outbox reports are imported when the service starts', async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-outbox-test-'));
    fs.mkdirSync(path.join(root, 'system/outbox'), { recursive: true });
    fs.writeFileSync(path.join(root, 'system/outbox/a.json'), JSON.stringify(report));
    fs.writeFileSync(path.join(root, 'system/outbox/b.json'), '{not json');
    const studio = createStudio({ root, port: 41999, watch: false });
    t.after(() => { studio.stop(); fs.rmSync(root, { recursive: true, force: true }); });
    assert.equal(studio.drawer.inbox().length, 1);
    assert.deepEqual(fs.readdirSync(path.join(root, 'system/outbox')).sort(), ['b.json.rejected']);
});

test('unknown API paths return JSON 404s', async t => {
    const { request } = await server(t);
    const r = await request('GET', '/api/nope');
    assert.equal(r.status, 404);
    assert.equal(r.body.error, 'Not found');
});
