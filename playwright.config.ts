import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Workers load this file again; reuse the folder the main process created so tests can read its report key.
const data = process.env.STUDIO_TEST_DATA || mkdtempSync(join(tmpdir(), 'studio-browser-test-'));
process.env.STUDIO_TEST_DATA = data;
export default defineConfig({
    testDir: './tests/browser',
    workers: 1,
    timeout: 120000,
    use: { baseURL: 'http://127.0.0.1:5174', viewport: { width: 1440, height: 1000 }, channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
    webServer: [
        { command: 'node server/index.js', url: 'http://127.0.0.1:4311/api/workspaces', env: { STUDIO_DATA_DIR: data, STUDIO_PORT: '4311', STUDIO_UI_ORIGIN: 'http://127.0.0.1:5174' } },
        { command: 'npx vite --host 127.0.0.1 --port 5174', url: 'http://127.0.0.1:5174', env: { STUDIO_API_URL: 'http://127.0.0.1:4311' } }
    ]
});
