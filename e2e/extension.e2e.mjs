// End-to-end tests: load the real unpacked extension into Chrome for Testing and exercise it.
// Every hostname resolves to a local test server (--host-resolver-rules), so nothing touches the internet.
// Setup once: npm run e2e:setup    Run: npm run test:e2e
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const extPath = join(root, 'extension');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = join(root, '.cache', 'browsers', 'chrome');
  const dirs = (p) => readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  for (const ver of existsSync(base) ? dirs(base) : []) {
    for (const dir of dirs(join(base, ver))) {
      for (const exe of ['chrome.exe', 'chrome', 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing']) {
        const p = join(base, ver, dir, exe);
        if (existsSync(p)) return p;
      }
    }
  }
  throw new Error('Chrome for Testing not found. Run: npm run e2e:setup (or set CHROME_PATH)');
}

// ---------- fake internet ----------
const hits = [];
let port;
const server = createServer((req, res) => {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '');
  hits.push(`${host}${req.url}`);
  const html = (body, status = 200) => { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }); res.end(body); };
  if (host === 'jobs.acme-e2e.com') {
    if (req.url === '/open') return html('<h1>Senior Engineer</h1><p>Apply now</p>');
    if (req.url === '/closed') return html('<h1>Senior Engineer</h1><p>No longer accepting applications</p>');
    if (req.url === '/gone') return html('Not found', 404);
    if (req.url === '/hostile') return html('<script'.repeat(300000)); // ~2 MB of unclosed tags (old regex: minutes)
    if (req.url === '/redirect-local') { res.writeHead(302, { location: `http://127.0.0.1:${port}/secret` }); return res.end(); }
  }
  if (req.url === '/secret') return html('<p>No longer accepting applications</p>'); // would mark "closed" if it were read
  if (host === 'attacker.example') return html(`<iframe id="f" src="${req.url.slice('/frame?src='.length) ? decodeURIComponent(req.url.slice('/frame?src='.length)) : ''}"></iframe>`);
  html(`<title>${host}</title><h1>Real site: ${host}</h1>`);
});

let browser, extId, worker;

async function extPage(file) {
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extId}/${file}`, { waitUntil: 'load' });
  return page;
}
const getStore = (key) => worker.evaluate(async (k) => (await chrome.storage.local.get(k))[k], key);
const setStore = (obj) => worker.evaluate(async (o) => chrome.storage.local.set(o), obj);
const dynamicRules = () => worker.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());

async function finalUrl(url) {
  const page = await browser.newPage();
  try { await page.goto(url, { waitUntil: 'load', timeout: 10000 }); } catch { /* the redirect can abort the original navigation */ }
  await wait(300);
  const u = page.url();
  await page.close();
  return u;
}

async function startFocus() {
  const popup = await extPage('popup.html');
  await popup.click('#start');
  for (let i = 0; i < 50 && (await getStore('timer'))?.phase !== 'focus'; i++) await wait(100);
  await popup.close();
}
async function stopFocus() {
  const popup = await extPage('popup.html');
  await popup.click('#stop');
  for (let i = 0; i < 50 && (await getStore('timer'))?.phase !== 'idle'; i++) await wait(100);
  await popup.close();
}

describe('Job Hunt Focus in a real Chrome', { timeout: 180000 }, () => {
  let profile;

  before(async () => {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
    profile = mkdtempSync(join(tmpdir(), 'jhf-e2e-'));
    browser = await puppeteer.launch({
      executablePath: findChrome(),
      headless: true,
      userDataDir: profile,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        `--disable-extensions-except=${extPath}`,
        `--load-extension=${extPath}`,
        `--host-resolver-rules=MAP * 127.0.0.1:${port}`,
        '--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable',
        '--no-first-run',
      ],
    });
    const target = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('/js/background.js'), { timeout: 15000 });
    extId = new URL(target.url()).host;
    worker = await target.worker();
  });

  after(async () => {
    await browser?.close();
    server.close();
    rmSync(profile, { recursive: true, force: true });
  });

  test('loads: Chrome accepts the manifest, including the strict CSP', async () => {
    assert.match(extId, /^[a-p]{32}$/);
    const csp = await worker.evaluate(() => chrome.runtime.getManifest().content_security_policy.extension_pages);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
  });

  test('every page renders without script errors', async () => {
    for (const file of ['popup.html', 'tracker.html', 'options.html', 'blocked.html']) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await page.goto(`chrome-extension://${extId}/${file}`, { waitUntil: 'load' });
      await wait(400);
      assert.deepEqual(errors, [], `${file}: ${errors.join(' | ')}`);
      await page.close();
    }
  });

  // Test domains are made up: real sites like youtube.com are HSTS-preloaded, so Chrome would force HTTPS
  // against the plain-HTTP test server.
  const settingsWith = async (patch) => setStore({ settings: { ...((await getStore('settings')) ?? {}), ...patch } });

  test('blocklist: blocked only during a focus session', async () => {
    await settingsWith({ mode: 'blocklist', blocklist: ['videos-e2e.com', 'social-e2e.com'] });
    assert.match(await finalUrl('http://videos-e2e.com/'), /^http:\/\/videos-e2e\.com/, 'open before the session');
    await startFocus();
    assert.equal((await dynamicRules()).length, 1);
    assert.match(await finalUrl('http://videos-e2e.com/watch?v=1'), new RegExp(`^chrome-extension://${extId}/blocked\\.html`));
    assert.match(await finalUrl('http://www.social-e2e.com/'), /blocked\.html/, 'subdomains are blocked too');
    assert.match(await finalUrl('http://jobs-e2e.com/'), /^http:\/\/jobs-e2e\.com/, 'other sites stay open');
    await stopFocus();
    assert.equal((await dynamicRules()).length, 0);
    assert.match(await finalUrl('http://videos-e2e.com/'), /^http:\/\/videos-e2e\.com/, 'open again after the session');
  });

  test('allowlist mode: only job sites load', async () => {
    await settingsWith({ mode: 'allowlist', allowlist: ['jobs-e2e.com'] });
    await startFocus();
    assert.match(await finalUrl('http://careers.jobs-e2e.com/'), /^http:\/\/careers\.jobs-e2e\.com/);
    assert.match(await finalUrl('http://news.example.com/'), /blocked\.html/);
    await stopFocus();
    await settingsWith({ mode: 'blocklist' });
  });

  test('a malformed block-list entry does not disable blocking', async () => {
    await settingsWith({ blocklist: ['bad domain.com', 'exa_mple.com', 'videos-e2e.com'] });
    await startFocus();
    const [rule] = await dynamicRules();
    assert.deepEqual(rule.condition.requestDomains, ['videos-e2e.com']);
    assert.match(await finalUrl('http://videos-e2e.com/'), /blocked\.html/);
    await stopFocus();
  });

  test('web pages cannot reach the extension or frame its data', async () => {
    const page = await browser.newPage();
    await page.goto(`http://attacker.example/frame?src=${encodeURIComponent(`chrome-extension://${extId}/blocked.html`)}`, { waitUntil: 'load' });
    await wait(800);
    assert.equal(await page.evaluate(() => typeof globalThis.chrome?.runtime?.sendMessage), 'undefined', 'no messaging channel from web pages');
    const framed = page.frames().find((f) => f.url().includes('blocked.html'));
    let leaked = '';
    try { leaked = framed ? await framed.evaluate(() => document.getElementById('goal-count')?.textContent ?? '') : ''; } catch { /* blocked by CSP: fine */ }
    assert.equal(leaked, '', 'the framed blocked page must not render the user\'s goal or todos');
    await page.close();
  });

  test('CSV import, status change counts toward the goal, notes persist', async () => {
    const page = await extPage('tracker.html');
    const input = await page.$('#import-file');
    await input.uploadFile(join(root, 'docs', 'sample-positions.csv'));
    await page.waitForSelector('#import-banner:not([hidden])');
    assert.match(await page.$eval('#import-text', (e) => e.textContent), /6 new/);
    await page.click('#import-confirm');
    await page.waitForFunction(() => document.querySelectorAll('#rows tr:not(.details)').length === 6);

    const before = Object.values((await getStore('history')) ?? {}).reduce((a, b) => a + b, 0);
    const orbit = (await getStore('positions')).find((p) => p.company === 'Orbit Analytics');
    assert.equal(orbit.status, 'saved');
    // Inputs get their value as a property (not an attribute), so find the row in the page.
    const inRow = (sel) => page.evaluateHandle((s) => [...document.querySelectorAll('#rows tr:not(.details)')]
      .find((tr) => tr.querySelector('input.cell-input').value === 'Orbit Analytics').querySelector(s), sel);
    await (await inRow('select')).select('applied');
    await wait(400);
    const afterCount = Object.values(await getStore('history')).reduce((a, b) => a + b, 0);
    assert.equal(afterCount, before + 1, 'moving to Applied counts toward the daily goal');

    await (await inRow('.chev')).click();
    await page.type(`#notes-${orbit.id}`, 'Recruiter call on Monday');
    await wait(800); // debounce
    await page.reload({ waitUntil: 'load' });
    assert.equal((await getStore('positions')).find((p) => p.id === orbit.id).notes, 'Recruiter call on Monday');
    await page.close();
  });

  test('posting checks: closed detection, and the security guards hold', async () => {
    const base = { company: 'Acme', status: 'applied', watch: true, signals: [], updatedAt: Date.now() };
    const mk = (id, url) => ({ ...base, id, title: id, url });
    await setStore({
      positions: [
        mk('open', 'http://jobs.acme-e2e.com/open'),
        mk('closed', 'http://jobs.acme-e2e.com/closed'),
        mk('gone', 'http://jobs.acme-e2e.com/gone'),
        mk('hostile', 'http://jobs.acme-e2e.com/hostile'),
        mk('lan', `http://127.0.0.1:${port}/secret`),
        mk('local-name', 'http://router.local/secret'),
        mk('redirect', 'http://jobs.acme-e2e.com/redirect-local'),
      ],
    });
    hits.length = 0;
    const page = await extPage('tracker.html');
    const t0 = Date.now();
    await page.click('#check-now'); // also proves the background accepts messages from the tracker tab
    await page.waitForFunction(() => document.getElementById('check-now').textContent.startsWith('Checked'), { timeout: 60000 });
    const took = Date.now() - t0;
    await page.close();

    const byId = Object.fromEntries((await getStore('positions')).map((p) => [p.id, p]));
    assert.equal(byId.open.status, 'applied');
    assert.equal(byId.closed.status, 'closed', 'closing phrase detected');
    assert.equal(byId.gone.status, 'closed', 'HTTP 404 means the posting is gone');
    assert.equal(byId.hostile.status, 'applied', 'hostile markup parsed without hanging');
    assert.ok(took < 30000, `checks took ${took} ms`);
    assert.equal(byId.lan.checkError, 'Only public job sites are checked');
    assert.equal(byId['local-name'].checkError, 'Only public job sites are checked');
    // /secret on 127.0.0.1 may be reached once, only by following the public redirect (fetch follows redirects
    // before the extension sees them; that response is then not read). A direct fetch of the IP URL would be a 2nd hit.
    const secretHits = hits.filter((h) => h === '127.0.0.1/secret').length;
    assert.ok(hits.includes('jobs.acme-e2e.com/redirect-local'));
    assert.ok(secretHits <= 1, `IP-literal URL fetched directly (${secretHits} hits)`);
    assert.ok(!hits.includes('router.local/secret'), 'local hostname never fetched');
    assert.equal(byId.redirect.status, 'applied', 'a redirect to a private address is not read');
    assert.ok(byId.closed.signals[0].unseen, 'closing creates an unseen update');
  });

  test('the background worker is still responsive afterwards', async () => {
    assert.equal(await worker.evaluate(() => 1 + 1), 2);
  });
});
