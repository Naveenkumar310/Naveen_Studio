import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Evening auto-update: once a day, after the chosen time, run the reporter for every folder the user
// linked in the Inbox that has not reported yet that day. Opt-in (Settings), and only linked folders.

const reporter = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/studio-report.mjs');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const midnight = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
export const validTime = (t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export function autoUpdater({ db, root, port, settings, save, run }) {
    const report = run || ((repo, { screenshot, live }) => new Promise((resolve, reject) => {
        const args = [reporter, '--repo', repo, '--source', 'auto-update', '--since', '7 days ago', '--data', root, '--api', `http://127.0.0.1:${port}`, '--json'];
        if (!screenshot) args.push('--no-screenshot'); else if (live) args.push('--screenshot', live);
        execFile(process.execPath, args, { timeout: 180000 }, (error, stdout, stderr) => {
            if (error) return reject(new Error((stderr || error.message).trim().split('\n').pop()));
            resolve(stdout);
        });
    }));
    let running = false;

    function due(now = new Date()) {
        if (!settings.enabled || running || settings.lastDay === dayKey(now)) return false;
        const [h, m] = settings.time.split(':').map(Number);
        return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
    }

    async function runAll(now = new Date()) {
        if (running) return { ...settings.lastResult, busy: true };
        running = true;
        const result = { at: now.toISOString(), updated: 0, skipped: 0, failed: [] };
        try {
            const since = midnight(now), week = new Date(now.getTime() - 7 * 86400000).toISOString();
            for (const link of db.prepare('SELECT * FROM repo_links ORDER BY created').all()) {
                if (db.prepare('SELECT 1 FROM snapshots WHERE repo=? AND created>=?').get(link.path, since)) { result.skipped++; continue; }
                const recentShot = db.prepare("SELECT 1 FROM snapshots WHERE project=? AND screenshot!='' AND created>=?").get(link.project, week);
                // Screenshot the project's live link (set on the project, or its newest production deploy) at most weekly.
                const live = db.prepare("SELECT live_url FROM projects WHERE id=?").get(link.project)?.live_url
                    || db.prepare("SELECT url FROM deploys WHERE project=? AND environment='production' ORDER BY created DESC, length(url) LIMIT 1").get(link.project)?.url || '';
                try { await report(link.path, { screenshot: !recentShot, live }); result.updated++; }
                catch (e) { result.failed.push({ name: link.name, error: String(e.message || e).slice(0, 200) }); }
            }
        } finally {
            running = false;
            Object.assign(settings, { lastRun: result.at, lastDay: dayKey(now), lastResult: result });
            save();
        }
        return result;
    }

    return { due, runAll, isRunning: () => running };
}
