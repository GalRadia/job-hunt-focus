import { get, set, addJobTodo } from './storage.js';
import { buildRules, RULE_ID } from './rules.js';
import { minutesLeft } from './dom.js';
import type { Phase, Timer } from './types.js';

const IDLE: Timer = { phase: 'idle', endsAt: 0 };

async function applyBlocking(on: boolean) {
  const s = await get('settings');
  const addRules = on ? buildRules(s.mode, s.mode === 'blocklist' ? s.blocklist : s.allowlist) : [];
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [RULE_ID], addRules });
}

async function updateBadge() {
  const t = await get('timer');
  await chrome.action.setBadgeText({ text: t.phase === 'idle' ? '' : String(minutesLeft(t.endsAt)) });
  await chrome.action.setBadgeBackgroundColor({ color: t.phase === 'focus' ? '#c0392b' : '#27ae60' });
}

async function setTimer(t: Timer) {
  await set('timer', t);
  await chrome.alarms.clearAll();
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

function notify(title: string, message: string) {
  chrome.notifications.create({ type: 'basic', iconUrl: 'icon.png', title, message });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'tick') return updateBadge();
  const t = await get('timer');
  if (t.phase === 'focus') {
    notify('Focus session done', 'Nice work. Take a short break.');
    await startPhase('break');
  } else {
    notify('Break over', 'Ready for another focus session?');
    await setTimer(IDLE);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const job = msg?.type === 'start' ? startPhase('focus') : msg?.type === 'stop' ? setTimer(IDLE) : null;
  if (!job) return false;
  job.then(() => sendResponse(true), (e) => sendResponse({ error: String(e) }));
  return true; // keep the channel open for the async response
});

// Edited lists/mode should take effect mid-session.
chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.settings) await applyBlocking((await get('timer')).phase === 'focus');
});

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll(); // onInstalled also fires on update/reload
  chrome.contextMenus.create({ id: 'save-job', title: 'Save job as todo', contexts: ['page'] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'save-job' && tab) addJobTodo(tab);
});
