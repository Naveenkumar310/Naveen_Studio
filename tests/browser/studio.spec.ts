import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true });
const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Project sections' }).getByRole('button', { name: new RegExp('^' + name) });

test('project lifecycle, task board, notes, unsaved-edit guard and workspace isolation', async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /^(Good (morning|afternoon|evening)|Working late)\.$/ })).toBeVisible();
    await expect(page.getByText('Commits', { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: info.outputPath('overview-empty.png'), fullPage: true });

    await nav(page, 'Drawer').click();
    await expect(page.getByRole('heading', { name: 'Drawer', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'New project', exact: true }).first().click();
    const projectForm = page.getByRole('dialog', { name: 'New project' });
    await projectForm.getByRole('textbox', { name: 'Name', exact: true }).fill('Studio experience');
    await projectForm.getByRole('textbox', { name: 'Description' }).fill('A real project for a more focused workspace.');
    await projectForm.getByRole('combobox', { name: 'Status', exact: true }).selectOption('In progress');
    await projectForm.getByRole('combobox', { name: 'Priority', exact: true }).selectOption('High');
    await projectForm.getByLabel('Owner').fill('Naveen');
    await projectForm.getByLabel('Live link').fill('https://studio.example.com');
    await projectForm.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Studio experience', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /Live/ })).toHaveAttribute('href', 'https://studio.example.com/');

    await tab(page, 'Tasks').click();
    await page.getByRole('button', { name: 'Add task', exact: true }).first().click();
    const taskForm = page.getByRole('dialog', { name: 'New task' });
    await taskForm.getByLabel('Task title').fill('Build the project board');
    await taskForm.getByLabel('Description').fill('Make every status transition persistent.');
    await taskForm.getByRole('combobox', { name: 'Priority', exact: true }).selectOption('Urgent');
    await taskForm.getByLabel('Due date').fill('2026-12-15');
    await taskForm.getByRole('button', { name: 'Create task', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Build the project board', exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Status of Build the project board' }).selectOption('In progress');
    await expect(page.locator('.column-in-progress .task-title-button')).toHaveText('Build the project board');

    await page.reload();
    await nav(page, 'Drawer').click();
    await page.getByRole('button', { name: 'Open project Studio experience' }).click();
    await tab(page, 'Tasks').click();
    await expect(page.locator('.column-in-progress .task-title-button')).toHaveText('Build the project board');
    await page.locator('.column-in-progress .task-card').dragTo(page.locator('.column-done'));
    await expect(page.locator('.column-done .task-title-button')).toHaveText('Build the project board');
    await page.getByRole('group', { name: 'Task view' }).getByRole('button', { name: 'List' }).click();
    await expect(page.getByRole('button', { name: 'Reopen Build the project board' })).toBeVisible();
    await tab(page, 'Overview').click();
    await expect(page.locator('.facts')).toContainText('1/1');

    await nav(page, 'Tasks').click();
    await page.getByRole('navigation', { name: 'Task filters' }).getByRole('button', { name: /^Done/ }).click();
    await expect(page.getByRole('button', { name: 'Build the project board', exact: true })).toBeVisible();

    await nav(page, 'Library').click();
    await page.getByRole('button', { name: 'New document', exact: true }).click();
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Project brief');
    await page.getByRole('dialog', { name: 'New document' }).getByRole('button', { name: 'Create document', exact: true }).click();
    await page.getByRole('textbox', { name: 'Markdown editor' }).fill('# Project brief\n\nA thoughtful local workspace.');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Document saved');

    // Unsaved edits: leaving through the sidebar asks first, and declining keeps the editor open.
    await page.getByRole('textbox', { name: 'Markdown editor' }).fill('# Project brief\n\nUnsaved thought.');
    page.once('dialog', dialog => { expect(dialog.message()).toContain('unsaved'); dialog.dismiss(); });
    await nav(page, 'Overview').click();
    await expect(page.getByRole('textbox', { name: 'Markdown editor' })).toHaveValue(/Unsaved thought/);
    page.once('dialog', dialog => dialog.accept());
    await nav(page, 'Drawer').click();

    await page.getByRole('button', { name: 'Open project Studio experience' }).click();
    await tab(page, 'Notes').click();
    await page.getByRole('button', { name: 'Link documents', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Project brief Documents' }).check();
    await expect(page.locator('.linked-document')).toContainText('Project brief');
    await page.screenshot({ path: info.outputPath('project.png'), fullPage: true });

    await page.getByRole('combobox', { name: 'Active workspace' }).selectOption('anne');
    await nav(page, 'Drawer').click();
    await expect(page.getByRole('button', { name: 'Open project Studio experience' })).toHaveCount(0);
    await nav(page, 'Tasks').click();
    await expect(page.getByRole('button', { name: 'Build the project board', exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
});

test('an end-of-day report waits in the Inbox, then fills the project drawer', async ({ page, request }) => {
    const key = readFileSync(join(process.env.STUDIO_TEST_DATA!, 'system/configurations/ingest-token'), 'utf8').trim();
    const report = {
        repo: { path: '/Users/tester/Projects/aurora', name: 'aurora' }, source: 'close-session', summary: 'Shipped the **waitlist**.',
        version: '0.4.2', kind: 'Web', tech: ['React', 'Cloudflare'],
        git: { branch: 'main', head: 'a'.repeat(40), remote: 'https://github.com/acme/aurora', dirty: 2, unpushed: 1, commits: [{ hash: 'a'.repeat(40), date: new Date().toISOString(), subject: 'Waitlist form' }] },
        deploys: [{ provider: 'cloudflare', environment: 'production', label: 'aurora', url: 'https://aurora.pages.dev', ref: 'abc', key: 'cf:1' }],
        docs: [{ name: 'README.md', content: '# Aurora\n\nSunrise alarm.' }]
    };
    const sent = await request.post('http://127.0.0.1:4311/api/ingest', { data: report, headers: { Authorization: `Bearer ${key}` } });
    expect((await sent.json()).status).toBe('inbox');
    await page.goto('/');
    await nav(page, 'Drawer').click();
    await page.locator('.inbox-banner').click();
    await page.getByRole('dialog', { name: 'Inbox' }).getByRole('textbox', { name: 'New project name for aurora' }).fill('Aurora');
    await page.getByRole('button', { name: 'Add to drawer' }).click();
    await expect(page.getByRole('heading', { name: 'Aurora', exact: true })).toBeVisible();
    await expect(page.locator('.facts')).toContainText('v0.4.2');
    await expect(page.locator('.facts')).toContainText('1 not pushed');
    await tab(page, 'Timeline').click();
    await expect(page.locator('.timeline-entry')).toContainText('Waitlist form');
    await tab(page, 'Docs').click();
    await expect(page.locator('.doc-view')).toContainText('Sunrise alarm.');
    const again = await request.post('http://127.0.0.1:4311/api/ingest', { data: { ...report, summary: 'Day two' }, headers: { Authorization: `Bearer ${key}` } });
    expect((await again.json()).status).toBe('linked');
    await nav(page, 'Overview').click();
    await expect(page.locator('.attention')).toContainText('1 commit not pushed');
});

test('small screens use a menu and never scroll sideways', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(nav(page, 'Drawer')).toBeVisible();
    await nav(page, 'Drawer').click();
    await expect(page.getByRole('heading', { name: 'Drawer', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('mobile.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
