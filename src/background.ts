import { get, set, addJobFromTab, markSeen } from './storage.js';
import { buildRules, RULE_ID } from './rules.js';
import { minutesLeft } from './dom.js';
import { htmlToLines, isClosed, isPublicWebUrl, newSignal, MAX_HTML } from './jobs.js';
import type { Phase, Timer } from './types.js';

const IDLE: Timer = { phase: 'idle', endsAt: 0 };

// ---------- focus timer + blocking ----------

async function applyBlocking(on: boolean) {
  const s = await get('settings');
  const addRules = on ? buildRules(s.mode, s.mode === 'blocklist' ? s.blocklist : s.allowlist) : [];
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [RULE_ID], addRules });
  } catch (e) {
    // Never fail silently: the user would think they're protected while nothing is blocked.
    console.error('Blocking rule rejected', e);
    notify("Blocking couldn't start", 'Check the site lists in Settings for typos, then start the session again.');
  }
}

async function updateBadge() {
  const t = await get('timer');
  await chrome.action.setBadgeText({ text: t.phase === 'idle' ? '' : String(minutesLeft(t.endsAt)) });
  await chrome.action.setBadgeBackgroundColor({ color: t.phase === 'focus' ? '#1f6f50' : '#b7862b' });
}

async function setTimer(t: Timer) {
  await set('timer', t);
  // Only the timer's own alarms: clearAll() would also kill the posting-watch alarm.
  await Promise.all([chrome.alarms.clear('phase-end'), chrome.alarms.clear('tick')]);
  if (t.phase !== 'idle') {
    await chrome.alarms.create('phase-end', { when: t.endsAt });
    await chrome.alarms.create('tick', { periodInMinutes: 1 });
  }
  await applyBlocking(t.phase === 'focus');
  await updateBadge();
}

async function startPhase(phase: Exclude<Phase, 'idle'>) {
  const s = await get('settings');
  const min = phase === 'focus' ? s.focusMin : s.breakMin;
  await setTimer({ phase, endsAt: Date.now() + min * 60000 });
}

function notify(title: string, message: string, id?: string) {
  const opts: chrome.notifications.NotificationCreateOptions = { type: 'basic', iconUrl: 'icons/icon-128.png', title, message };
  if (id) chrome.notifications.create(id, opts);
  else chrome.notifications.create(opts);
}

// ---------- posting watch ----------

async function ensureWatchAlarm() {
  const { watchEveryMin } = await get('settings');
  const a = await chrome.alarms.get('watch-check');
  if (a?.periodInMinutes !== watchEveryMin) await chrome.alarms.create('watch-check', { periodInMinutes: watchEveryMin, delayInMinutes: 1 });
}

let checking = false;

/** Reads at most MAX_HTML bytes, so a huge (or endless) response can't exhaust the worker's memory. */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    if (size >= MAX_HTML) { await reader.cancel(); break; }
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  return new TextDecoder().decode(all.subarray(0, MAX_HTML));
}

/** Checks up to 30 watched postings (oldest first). Saves after each one: progress survives a service-worker
 *  restart, edits made meanwhile aren't overwritten, and the storage calls keep the worker alive. */
async function checkPostings(): Promise<number> {
  if (checking) return 0;
  checking = true;
  try {
    const due = (await get('positions'))
      .filter((p) => p.watch && p.url && (p.status === 'saved' || p.status === 'applied'))
      .sort((a, b) => (a.lastChecked ?? 0) - (b.lastChecked ?? 0))
      .slice(0, 30);
    for (const [i, d] of due.entries()) {
      if (i) await new Promise((r) => setTimeout(r, 1000)); // be polite to job boards
      let closed = false;
      let error: string | undefined;
      if (!isPublicWebUrl(d.url)) {
        error = 'Only public job sites are checked'; // never probe localhost, the LAN or IP addresses
      } else {
        try {
          const res = await fetch(d.url!, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000) });
          const type = res.headers.get('content-type') ?? '';
          // A public page that redirected to a local/private address: don't read what came back.
          const readable = res.ok && isPublicWebUrl(res.url) && /text\/html|application\/xhtml|text\/plain/i.test(type);
          closed = isClosed(res.status, readable ? htmlToLines(await readCapped(res)) : []);
          if (!readable) await res.body?.cancel();
          if (!closed && !res.ok) error = `The page returned HTTP ${res.status}`;
        } catch {
          error = "Couldn't load the page";
        }
      }
      const positions = await get('positions');
      const p = positions.find((x) => x.id === d.id);
      if (!p) continue; // deleted meanwhile
      p.lastChecked = Date.now();
      p.checkError = error;
      if (closed && (p.status === 'saved' || p.status === 'applied')) {
        p.status = 'closed';
        p.updatedAt = Date.now();
        p.signals = [newSignal('page', 'Posting closed', true), ...p.signals].slice(0, 10);
        notify('Posting closed', `${p.title}${p.company ? ` at ${p.company}` : ''}`, `pos:${p.id}`);
      }
      await set('positions', positions);
    }
    return due.length;
  } finally {
    checking = false;
  }
}

// ---------- events ----------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'tick') return updateBadge();
  if (alarm.name === 'watch-check') return void checkPostings();
  const t = await get('timer');
  if (t.phase === 'focus') {
    notify('Focus session done', 'Nice work. Take a short break.');
    await startPhase('break');
  } else {
    notify('Break over', 'Ready for another focus session?');
    await setTimer(IDLE);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only our own pages may drive the timer (there are no content scripts; this is defense in depth).
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  const job =
    msg?.type === 'start' ? startPhase('focus')
    : msg?.type === 'stop' ? setTimer(IDLE)
    : msg?.type === 'check-postings' ? checkPostings()
    : null;
  if (!job) return false;
  job.then((r) => sendResponse(r ?? true), (e) => sendResponse({ error: String(e) }));
  return true; // keep the channel open for the async response
});

// Edited lists/mode should take effect mid-session; a new interval re-schedules the watch.
chrome.storage.onChanged.addListener(async (changes) => {
  if (!changes.settings) return;
  await applyBlocking((await get('timer')).phase === 'focus');
  await ensureWatchAlarm();
});

chrome.notifications.onClicked.addListener(async (id) => {
  if (!id.startsWith('pos:')) return;
  chrome.notifications.clear(id);
  await chrome.tabs.create({ url: chrome.runtime.getURL('tracker.html') });
  await markSeen(id.slice(4));
});

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll(); // onInstalled also fires on update/reload
  chrome.contextMenus.create({ id: 'save-job', title: 'Save job to tracker', contexts: ['page'] });
  await ensureWatchAlarm();
});
chrome.runtime.onStartup.addListener(ensureWatchAlarm);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'save-job' || !tab) return;
  const result = await addJobFromTab(tab);
  if (result === 'not-a-page') return notify("This page can't be saved", 'Open a job posting on a website, then try again.');
  notify(result === 'added' ? 'Saved to your tracker' : 'Already in your tracker', tab.title || tab.url || '');
});
