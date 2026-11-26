import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Collects an end-of-day report for one project folder. Reads only the folder it is given:
// git metadata, package.json, a fixed list of Markdown docs and Wrangler's deploy output.
// Never reads .env files, source code or credentials.

export const DOC_NAME = /^[\w .()-]+(\/[\w .()-]+)?\.(md|markdown|mdx|txt)$/i;
const ROOT_DOCS = /^(readme|changelog|architecture|roadmap|progress|design_system|data_model|security|integrations|handoff[\w-]*)\.md$/i;
const DOC_LIMIT = 256 * 1024;

export function git(cwd, args) {
    try {
        // GIT_OPTIONAL_LOCKS=0 stops `git status` from refreshing .git/index, so reading a project never writes to it.
        return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).trim();
    } catch {
        return null;
    }
}

const entries = dir => { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; } };
const readText = file => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };
const readJson = file => {
    const text = readText(file);
    if (text === null) return null;
    try { return JSON.parse(text); } catch { }
    try { return JSON.parse(stripJsonComments(text)); } catch { return null; }
};
export const stripJsonComments = text => text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1');

/**
 * Real hostname for an SSH host alias such as "github-work" (from ~/.ssh/config).
 * `ssh -G` only prints the resolved configuration; it never connects.
 */
export function resolveSshHost(alias) {
    if (alias.includes('.')) return alias;
    try {
        const config = execFileSync('ssh', ['-G', alias], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 });
        const host = config.match(/^hostname\s+(\S+)$/m)?.[1];
        if (host && host.includes('.')) return host.toLowerCase();
    } catch { }
    return /^github/i.test(alias) ? 'github.com' : /^gitlab/i.test(alias) ? 'gitlab.com' : /^bitbucket/i.test(alias) ? 'bitbucket.org' : alias;
}

/** Turns any git remote into a browsable https URL without credentials. */
export function normalizeRemote(remote, resolve = resolveSshHost) {
    if (!remote) return '';
    let m = remote.match(/^[\w.-]+@([\w.-]+):(.+?)(\.git)?\/?$/);
    if (m) return `https://${resolve(m[1])}/${m[2]}`;
    m = remote.match(/^ssh:\/\/(?:[^@/]+@)?([\w.-]+)(?::\d+)?\/(.+?)(\.git)?\/?$/);
    if (m) return `https://${resolve(m[1])}/${m[2]}`;
    try {
        const url = new URL(remote);
        if (!['http:', 'https:'].includes(url.protocol)) return '';
        url.username = ''; url.password = '';
        url.pathname = url.pathname.replace(/\.git\/?$/, '');
        return url.toString().replace(/\/$/, '');
    } catch {
        return '';
    }
}

export function repoRoot(dir) {
    const top = git(dir, ['rev-parse', '--show-toplevel']);
    return fs.realpathSync(top || dir);
}

export function collectGit(repo, { since }) {
    if (git(repo, ['rev-parse', '--is-inside-work-tree']) !== 'true') return null;
    const status = git(repo, ['status', '--porcelain']);
    const ahead = git(repo, ['rev-list', '--count', '@{upstream}..HEAD']);
    const log = git(repo, ['log', `--since=${since}`, '--max-count=1000', '--pretty=format:%H%x1f%aI%x1f%s']) || '';
    return {
        branch: git(repo, ['branch', '--show-current']) || '',
        head: git(repo, ['rev-parse', 'HEAD']) || '',
        remote: normalizeRemote(git(repo, ['remote', 'get-url', 'origin']) || ''),
        dirty: status ? status.split('\n').filter(Boolean).length : 0,
        unpushed: ahead === null ? null : Number(ahead),
        commits: log.split('\n').filter(Boolean).map(line => {
            const [hash, date, subject = ''] = line.split('\x1f');
            return { hash, date, subject: subject.slice(0, 300) };
        })
    };
}

const PACKAGES = [
    ['next', 'Next.js'], ['react-native', 'React Native'], ['expo', 'Expo'], ['react', 'React'], ['vue', 'Vue'],
    ['nuxt', 'Nuxt'], ['svelte', 'Svelte'], ['@sveltejs/kit', 'SvelteKit'], ['astro', 'Astro'], ['vite', 'Vite'],
    ['tailwindcss', 'Tailwind'], ['express', 'Express'], ['hono', 'Hono'], ['electron', 'Electron'],
    ['better-sqlite3', 'SQLite'], ['prisma', 'Prisma'], ['@prisma/client', 'Prisma'], ['drizzle-orm', 'Drizzle'],
    ['@supabase/supabase-js', 'Supabase'], ['firebase', 'Firebase'], ['three', 'Three.js'], ['wrangler', 'Cloudflare'],
    ['@cloudflare/workers-types', 'Cloudflare'], ['typescript', 'TypeScript'], ['@anthropic-ai/sdk', 'Claude API']
];
const FILES = [
    ['wrangler.toml', 'Cloudflare'], ['wrangler.json', 'Cloudflare'], ['wrangler.jsonc', 'Cloudflare'], ['vercel.json', 'Vercel'],
    ['.vercel/project.json', 'Vercel'], ['Dockerfile', 'Docker'], ['pyproject.toml', 'Python'], ['requirements.txt', 'Python'],
    ['Cargo.toml', 'Rust'], ['go.mod', 'Go'], ['Package.swift', 'Swift'], ['pubspec.yaml', 'Flutter'], ['tsconfig.json', 'TypeScript']
];

/** Tech labels, project type and version, from package.json and well-known config files. */
export function detectProject(repo) {
    const pkg = readJson(path.join(repo, 'package.json'));
    const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
    const tech = new Set();
    for (const [name, label] of PACKAGES) if (deps[name]) tech.add(label);
    for (const [file, label] of FILES) if (fs.existsSync(path.join(repo, file))) tech.add(label);
    if (entries(repo).some(e => e.name.endsWith('.xcodeproj'))) tech.add('Swift');
    const has = (...labels) => labels.some(l => tech.has(l));
    const kind = has('React Native', 'Expo', 'Flutter', 'Swift') ? 'Mobile'
        : has('Electron') || pkg?.bin ? 'Tool'
            : has('Next.js', 'React', 'Vue', 'Nuxt', 'Svelte', 'SvelteKit', 'Astro', 'Vite', 'Cloudflare', 'Vercel') || fs.existsSync(path.join(repo, 'index.html')) ? 'Web' : '';
    const version = (typeof pkg?.version === 'string' && pkg.version) || git(repo, ['describe', '--tags', '--abbrev=0']) || '';
    return { tech: [...tech], kind, version };
}

/** Copies of the project's own docs: README, CHANGELOG, handoff notes and docs/*.md. Symlinks and large files are skipped. */
export function readDocs(repo, extra = []) {
    const docs = new Map();
    const add = rel => {
        const name = rel.split(path.sep).join('/');
        if (docs.size >= 20 || docs.has(name) || !DOC_NAME.test(name)) return;
        const full = path.join(repo, rel);
        try {
            const stat = fs.lstatSync(full);
            if (!stat.isFile() || stat.size > DOC_LIMIT) return;
            docs.set(name, { name, content: fs.readFileSync(full, 'utf8') });
        } catch { }
    };
    for (const e of entries(repo)) if (e.isFile() && ROOT_DOCS.test(e.name)) add(e.name);
    for (const e of entries(path.join(repo, 'docs'))) if (e.isFile() && /\.md$/i.test(e.name)) add(path.join('docs', e.name));
    for (const file of extra) {
        const rel = path.relative(repo, path.resolve(repo, file));
        if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) add(rel);
    }
    return [...docs.values()];
}

export function wranglerNames(repo) {
    const names = new Set();
    const toml = readText(path.join(repo, 'wrangler.toml'));
    if (toml) for (const m of toml.matchAll(/^\s*name\s*=\s*["']([^"']+)["']/gm)) names.add(m[1]);
    for (const file of ['wrangler.json', 'wrangler.jsonc']) {
        const config = readJson(path.join(repo, file));
        if (typeof config?.name === 'string') names.add(config.name);
        for (const env of Object.values(config?.env || {})) if (typeof env?.name === 'string') names.add(env.name);
    }
    return names;
}

function toUrl(target) {
    let s = String(target || '').trim().replace(/\/\*$/, '');
    if (!s || s.includes('*') || /\s/.test(s)) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    try { return new URL(s).toString(); } catch { return ''; }
}
const rank = { production: 2, preview: 1, link: 0 };

/**
 * Parses Wrangler's ND-JSON output (written when WRANGLER_OUTPUT_FILE_DIRECTORY or
 * WRANGLER_OUTPUT_FILE_PATH is set). When `names` is given, entries for other Workers or
 * Pages projects are ignored, so a shared output folder can be used safely.
 */
export function parseWranglerOutput(text, { since = 0, names = null } = {}) {
    const found = [];
    for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        let e;
        try { e = JSON.parse(line); } catch { continue; }
        const created = e.timestamp;
        if (!created || Number.isNaN(Date.parse(created)) || Date.parse(created) < since) continue;
        const owner = e.worker_name || e.pages_project || '';
        if (names && !(owner && [...names].some(n => owner === n || owner.startsWith(n + '-')))) continue;
        const push = (target, environment, label, ref, key) => {
            const url = toUrl(target);
            if (url) found.push({ provider: 'cloudflare', environment, label, url, ref: String(ref || '').slice(0, 100), created, key: key.slice(0, 300) });
        };
        const worker = e.worker_name ? `${e.worker_name}${e.wrangler_environment ? ` (${e.wrangler_environment})` : ''}` : 'Worker';
        if (e.type === 'deploy') {
            for (const t of e.targets || []) push(t, 'production', worker, e.version_id, `cf-worker:${e.version_id || created}:${t}`);
        } else if (e.type === 'pages-deploy-detailed' || e.type === 'pages-deploy') {
            const environment = e.type === 'pages-deploy' ? 'link' : e.environment === 'production' ? 'production' : 'preview';
            const ref = e.deployment_trigger?.metadata?.commit_hash || e.deployment_id;
            push(e.url, environment, e.pages_project || 'Pages', ref, `cf-pages:${e.deployment_id}:${e.url}`);
            if (e.alias) push(e.alias, environment, `${e.pages_project || 'Pages'} alias`, ref, `cf-pages:${e.deployment_id}:${e.alias}`);
        } else if (e.type === 'version-upload') {
            push(e.preview_url, 'preview', worker, e.version_id, `cf-version:${e.version_id}:${e.preview_url}`);
            push(e.preview_alias_url, 'preview', `${worker} alias`, e.version_id, `cf-version:${e.version_id}:${e.preview_alias_url}`);
        } else if (e.type === 'preview') {
            for (const u of [...(e.preview_urls || []), ...(e.deployment_urls || [])]) push(u, 'preview', worker, e.deployment_id, `cf-preview:${e.deployment_id}:${u}`);
        }
    }
    const byKey = new Map();
    for (const d of found) {
        const seen = byKey.get(d.key);
        if (!seen || rank[d.environment] > rank[seen.environment]) byKey.set(d.key, d);
    }
    return [...byKey.values()];
}

/** Deploy links from the project's .wrangler/output folder, plus shared Wrangler output locations. */
export function cloudflareDeploys(repo, env, since) {
    const names = wranglerNames(repo);
    const sources = [];
    const scan = (dir, shared) => {
        for (const e of entries(dir)) if (e.isFile() && /^wrangler-output-.*\.json$/.test(e.name)) sources.push({ file: path.join(dir, e.name), shared });
    };
    const inside = dir => !path.relative(repo, dir).startsWith('..');
    scan(path.join(repo, '.wrangler', 'output'), false);
    if (env.WRANGLER_OUTPUT_FILE_DIRECTORY) {
        const dir = path.resolve(repo, env.WRANGLER_OUTPUT_FILE_DIRECTORY);
        if (dir !== path.join(repo, '.wrangler', 'output')) scan(dir, !inside(dir));
    }
    if (env.WRANGLER_OUTPUT_FILE_PATH) {
        const file = path.resolve(repo, env.WRANGLER_OUTPUT_FILE_PATH);
        sources.push({ file, shared: !inside(file) });
    }
    const deploys = [];
    for (const { file, shared } of sources) {
        if (shared && !names.size) continue; // cannot tell which project a shared entry belongs to
        const text = readText(file);
        if (text) deploys.push(...parseWranglerOutput(text, { since, names: shared ? names : null }));
    }
    const byKey = new Map();
    for (const d of deploys) if (!byKey.has(d.key) || rank[d.environment] > rank[byKey.get(d.key).environment]) byKey.set(d.key, d);
    return [...byKey.values()].sort((a, b) => b.created.localeCompare(a.created)).slice(0, 40);
}

/** `--link "Production=https://…"` style links passed by the caller (for example close-session). */
export function parseLink(value) {
    const at = value.indexOf('=');
    const label = at > 0 && !/^https?:/i.test(value) ? value.slice(0, at).trim() : '';
    const url = toUrl(label ? value.slice(at + 1) : value);
    if (!url) return null;
    const environment = /^(live|prod|production)$/i.test(label) ? 'production' : /^(preview|staging|dev|development)$/i.test(label) ? 'preview' : 'link';
    return { provider: 'link', environment, label: label.slice(0, 80), url, ref: '', created: new Date().toISOString(), key: `link:${url}` };
}

export function localMidnight(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
}

export function buildReport(dir, options = {}, env = process.env) {
    const repo = repoRoot(dir);
    const since = options.since || localMidnight();
    const gitInfo = collectGit(repo, { since });
    const project = detectProject(repo);
    const deploySince = Date.now() - 14 * 24 * 3600 * 1000;
    const links = (options.links || []).map(parseLink).filter(Boolean);
    let summary = options.summary || '';
    if (!summary && options.summaryFile) summary = readText(path.resolve(dir, options.summaryFile)) || '';
    return {
        repo: { path: repo, name: path.basename(repo) },
        source: options.source || 'studio-report',
        summary: summary.slice(0, 20000),
        version: project.version.slice(0, 60),
        kind: project.kind,
        tech: project.tech,
        git: gitInfo || {},
        deploys: [...cloudflareDeploys(repo, env, deploySince), ...links],
        docs: readDocs(repo, options.docs || [])
    };
}
