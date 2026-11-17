// Preview server for UI work and store screenshots, no extension install needed.
// Serves extension/ with a fake in-memory `chrome` API (seeded with sample data) injected into each page,
// and store/ as-is.  usage: npm run preview  ->  http://127.0.0.1:5179/popup.html
// Query flags on extension pages: ?focus  ?break  ?empty
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.argv[2] || 5179);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };

const stub = `
<script>
(() => {
  const qs = new URLSearchParams(location.search);
  const day = (o) => { const d = new Date(); d.setDate(d.getDate() - o); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
  const data = qs.has('empty') ? {} : {
    timer: qs.has('focus') ? { phase: 'focus', endsAt: Date.now() + 18 * 60000 + 42000 } : qs.has('break') ? { phase: 'break', endsAt: Date.now() + 3 * 60000 } : { phase: 'idle', endsAt: 0 },
    todos: [
      { id: '1', text: 'Apply: Senior Frontend Engineer at Wix | LinkedIn', url: 'https://linkedin.com/jobs/1', done: false },
      { id: '2', text: 'Follow up with recruiter from Monday.com', done: false },
      { id: '3', text: 'Apply: Full Stack Developer at Check Point', url: 'https://indeed.com/2', done: true, doneAt: Date.now() },
      { id: '4', text: 'Update portfolio README with the extension GIF', done: true, doneAt: Date.now() },
      { id: '5', text: 'Apply: React Developer at Fiverr', url: 'https://fiverr.com/careers', done: true, doneAt: Date.now() },
    ],
    sessions: [
      { id: 'a', name: 'Morning applications', urls: Array(7).fill('https://linkedin.com'), savedAt: Date.now() },
      { id: 'b', name: 'Interview prep: system design', urls: Array(4).fill('https://github.com'), savedAt: Date.now() },
    ],
    history: { [day(0)]: 3, [day(1)]: 5, [day(2)]: 6, [day(3)]: 5, [day(4)]: 5 },
    positions: (() => {
      const h = 3600000, now = Date.now();
      const sig = (source, text, ago, unseen = false) => ({ at: now - ago, source, text, unseen });
      const pos = (id, company, title, status, extra = {}) => ({ id, company, title, status, watch: true, signals: [], updatedAt: now - Number(id) * h, ...extra });
      return [
        pos('1', 'Wix', 'Senior Frontend Engineer', 'interview', { url: 'https://www.wix.com/jobs/1', appliedOn: '2026-11-02', signals: [sig('manual', 'Moved to Interview', 5 * h)], notes: 'Tech interview Thursday 10:00' }),
        pos('2', 'Lemonade', 'Product Engineer', 'closed', { url: 'https://boards.greenhouse.io/lemonade/1', appliedOn: '2026-10-28', lastChecked: now - h, signals: [sig('page', 'Posting closed', h, true)] }),
        pos('3', 'Monday.com', 'Full Stack Developer', 'applied', { url: 'https://monday.com/careers/3', appliedOn: '2026-11-10', lastChecked: now - 2 * h }),
        pos('4', 'Fiverr', 'React Developer', 'applied', { url: 'https://www.linkedin.com/jobs/view/4', appliedOn: '2026-11-12', checkError: 'The page returned HTTP 999' }),
        pos('5', 'Check Point', 'Software Engineer, Web', 'rejected', { appliedOn: '2026-10-20', signals: [sig('import', 'Imported as Rejected', 30 * h)] }),
        pos('6', 'Riskified', 'Frontend Team Lead', 'offer', { appliedOn: '2026-10-15', signals: [sig('manual', 'Moved to Offer', 20 * h, true)] }),
        pos('7', 'Similarweb', 'Frontend Engineer', 'saved', { url: 'https://www.similarweb.com/corp/careers/7' }),
      ];
    })(),
  };
  const listeners = [];
  const fire = (changes) => listeners.forEach((f) => f(changes));
  window.chrome = {
    storage: {
      local: {
        get: async (k) => (k in data ? { [k]: structuredClone(data[k]) } : {}),
        set: async (o) => { const c = {}; for (const k in o) { c[k] = { newValue: o[k] }; data[k] = structuredClone(o[k]); } fire(c); },
      },
      onChanged: { addListener: (f) => listeners.push(f) },
    },
    runtime: {
      sendMessage: async (m) => {
        if (m.type === 'start') await chrome.storage.local.set({ timer: { phase: 'focus', endsAt: Date.now() + 25 * 60000 } });
        if (m.type === 'stop') await chrome.storage.local.set({ timer: { phase: 'idle', endsAt: 0 } });
        if (m.type === 'check-postings') { await new Promise((r) => setTimeout(r, 800)); return 4; }
      },
      openOptionsPage: () => console.log('openOptionsPage'),
      getURL: (p) => '/' + p,
    },
    tabs: {
      query: async () => [{ title: 'Product Engineer at Lemonade | LinkedIn', url: 'https://linkedin.com/jobs/9' }, { url: 'chrome://newtab' }],
      create: (o) => window.open(o.url, '_blank'),
    },
    windows: { create: (o) => console.log('windows.create', o) },
  };
})();
</script>`;

createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([\\/])+/, '');
    if (path.includes('..')) throw new Error('bad path');
    const isStore = /^store[\\/]/.test(path);
    let body = await readFile(isStore ? join(repo, path) : join(repo, 'extension', path || 'popup.html'));
    const type = types[extname(path)] || 'text/html';
    if (type === 'text/html' && !isStore) body = Buffer.from(body.toString().replace('<head>', '<head>' + stub));
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log('preview on http://127.0.0.1:' + port));
