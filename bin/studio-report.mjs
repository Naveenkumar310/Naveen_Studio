#!/usr/bin/env node
// Sends an end-of-day report for the current project folder to My Studio on this Mac.
// Usage: node "<My Studio>/bin/studio-report.mjs" [options]   (run inside the project folder)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildReport } from '../reporter/collect.js';

const studioRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HELP = `Send today's project snapshot to My Studio.

  --summary "text"        What was done today (shown on the project timeline)
  --summary-file <file>   Read the summary from a file
  --link "Label=URL"      Add a link; repeatable. Labels Live/Production and Preview/Staging are recognised
  --doc <file>            Include another Markdown file from this folder; repeatable
  --screenshot <url>      Page to screenshot (default: the newest production link)
  --no-screenshot         Skip the screenshot
  --since <date>          Include commits since this date (default: local midnight)
  --source <name>         Who sent the report (default: studio-report)
  --repo <dir>            Project folder (default: current folder)
  --dry-run               Show what would be sent, send nothing
  --json                  Print the result as JSON

Only folders you have linked in My Studio go straight into a project. Reports from other
folders wait in My Studio's Inbox until you choose a project for them.`;

function parseArgs(argv) {
    const o = { links: [], docs: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i], next = () => {
            const v = argv[++i];
            if (v === undefined) throw Error(`${a} needs a value`);
            return v;
        };
        if (a === '--summary') o.summary = next();
        else if (a === '--summary-file') o.summaryFile = next();
        else if (a === '--link') o.links.push(next());
        else if (a === '--doc') o.docs.push(next());
        else if (a === '--screenshot') o.screenshot = next();
        else if (a === '--no-screenshot') o.noScreenshot = true;
        else if (a === '--since') o.since = next(); // any date git understands, e.g. 2026-11-01 or "30 days ago"
        else if (a === '--source') o.source = next();
        else if (a === '--repo') o.repo = next();
        else if (a === '--dry-run') o.dryRun = true;
        else if (a === '--json') o.json = true;
        else if (a === '--data') o.data = next();
        else if (a === '--api') o.api = next();
        else if (a === '--help' || a === '-h') o.help = true;
        else throw Error(`Unknown option ${a}`);
    }
    return o;
}

async function capture(url) {
    let playwright;
    try { playwright = createRequire(path.join(studioRoot, 'package.json'))('playwright'); } catch { return { error: 'Playwright is not installed in My Studio' }; }
    let browser;
    try {
        try { browser = await playwright.chromium.launch({ channel: 'chrome', headless: true }); } catch { browser = await playwright.chromium.launch({ headless: true }); }
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        await page.goto(url, { waitUntil: 'load', timeout: 25000 });
        await page.waitForTimeout(1500);
        // Full page (capped) so the drawer can scroll through it on hover, like a site preview.
        const height = Math.min(await page.evaluate(() => document.documentElement.scrollHeight).catch(() => 900), 4800);
        const data = await page.screenshot({ type: 'jpeg', quality: 70, clip: { x: 0, y: 0, width: 1440, height: Math.max(height, 900) }, fullPage: height > 900 });
        return { screenshot: { type: 'jpg', data: data.toString('base64') } };
    } catch (e) {
        return { error: String(e.message || e).split('\n')[0] };
    } finally {
        await browser?.close().catch(() => { });
    }
}

async function main() {
    const o = parseArgs(process.argv.slice(2));
    if (o.help) { console.log(HELP); return 0; }
    const dataRoot = path.resolve(o.data || process.env.STUDIO_DATA_DIR || studioRoot);
    const report = buildReport(path.resolve(o.repo || process.cwd()), o);
    const notes = [];
    if (!report.git.head) notes.push('This folder is not a git repository with commits; git details are empty.');
    if (!o.noScreenshot) {
        const production = report.deploys.filter(d => d.environment === 'production')
            .sort((a, b) => b.created.localeCompare(a.created) || a.url.length - b.url.length);
        const target = o.screenshot || production[0]?.url;
        if (target) {
            const shot = await capture(target);
            if (shot.screenshot) report.screenshot = { ...shot.screenshot, url: target }; else notes.push(`No screenshot of ${target}: ${shot.error}`);
        }
    }
    if (o.dryRun) {
        const preview = { ...report, docs: report.docs.map(d => `${d.name} (${d.content.length} chars)`), screenshot: report.screenshot ? `${report.screenshot.type}, ${Math.round(report.screenshot.data.length * 0.75 / 1024)} KB` : null };
        console.log(JSON.stringify({ dryRun: true, report: preview, notes }, null, 2));
        return 0;
    }

    let result = null, problem = '';
    const keyFile = path.join(dataRoot, 'system/configurations/ingest-token');
    const key = fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8').trim() : '';
    if (key) {
        try {
            const response = await fetch((o.api || process.env.STUDIO_API_URL || 'http://127.0.0.1:4310') + '/api/ingest', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
                body: JSON.stringify(report), signal: AbortSignal.timeout(30000)
            });
            const body = await response.json().catch(() => ({}));
            if (response.ok) result = body;
            else if (response.status === 400 || response.status === 413) throw Object.assign(Error(body.error || 'Report rejected'), { fatal: true });
            else problem = body.error || `HTTP ${response.status}`;
        } catch (e) {
            if (e.fatal) throw e;
            problem = e.cause?.code === 'ECONNREFUSED' ? 'the app is not running' : e.message;
        }
    } else problem = 'the app has not been started yet';

    if (!result) {
        const outbox = path.join(dataRoot, 'system/outbox');
        fs.mkdirSync(outbox, { recursive: true });
        const file = path.join(outbox, `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}.json`);
        fs.writeFileSync(file, JSON.stringify(report), { mode: 0o600 });
        result = { status: 'outbox', problem, file };
    }
    const message = result.status === 'linked'
        ? `My Studio: saved today's report for ${report.repo.name} to the project “${result.project}” (${result.workspace}).`
        : result.status === 'inbox'
            ? `My Studio: ${report.repo.name} is not linked to a project yet. The report is waiting in My Studio's Inbox; choose its project there and future reports will go straight in.`
            : `My Studio: ${result.problem}, so the report was saved to the outbox. It will be imported when My Studio next starts.`;
    if (o.json) console.log(JSON.stringify({ ...result, message, notes }));
    else console.log([message, ...notes].join('\n'));
    return 0;
}

main().then(code => process.exit(code)).catch(e => {
    console.error(`My Studio report failed: ${e.message}`);
    process.exit(1);
});
