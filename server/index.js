import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStudio } from './app.js';

const root = process.env.STUDIO_DATA_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.STUDIO_PORT || 4310);
const { app } = createStudio({ root, port, uiOrigins: process.env.STUDIO_UI_ORIGIN ? [process.env.STUDIO_UI_ORIGIN] : [] });
app.listen(port, '127.0.0.1', () => console.log(`Studio API http://127.0.0.1:${port}`));
