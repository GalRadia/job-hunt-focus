// Renders 1280x800 Chrome Web Store screenshots with headless Chrome. Needs `npm run preview` running.
// usage: node tools/screenshots.mjs   (set CHROME=path/to/chrome if it isn't in the default Windows location)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const out = fileURLToPath(new URL('../store/screenshots/', import.meta.url));
const base = 'http://127.0.0.1:5179';
const frame = (o) => `${base}/store/frame.html?` + new URLSearchParams(o);

const shots = {
  '1-focus.png': frame({
    page: 'popup.html?focus', tone: 'focus',
    title: 'Distractions blocked while you focus',
    text: 'Start a Pomodoro session and the sites that pull you away are blocked until your break.',
  }),
  '5-jobs.png': frame({
    page: 'popup.html', tab: 'jobs',
    title: 'Know when a posting closes',
    text: 'Save any posting in one click. Watched postings are checked in the background, and your daily goal counts every application.',
  }),
  '3-blocked.png': `${base}/blocked.html?focus`,
  '2-tracker.png': `${base}/tracker.html?open=5`,
  '4-sessions.png': frame({
    page: 'popup.html', tab: 'sessions',
    title: 'Pick up exactly where you left off',
    text: 'Save a window of job-search tabs as a named session and reopen it whenever you’re ready.',
  }),
};

const sizes = { 'promo-440x280.png': '440,280' }; // everything else is 1280x800
shots['promo-440x280.png'] = `${base}/store/promo.html`;

const profile = mkdtempSync(join(tmpdir(), 'jhf-shots-'));
for (const [file, url] of Object.entries(shots)) {
  const r = spawnSync(chrome, [
    '--headless=new', `--user-data-dir=${profile}`, '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${sizes[file] ?? '1280,800'}`, '--virtual-time-budget=4000', `--screenshot=${join(out, file)}`, url,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) throw new Error(`chrome failed for ${file}`);
  console.log('wrote', file);
}
rmSync(profile, { recursive: true, force: true });
