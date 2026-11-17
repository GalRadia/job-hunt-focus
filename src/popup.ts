import { get, set, addTodo, addJobFromTab, toggleTodo, markSeen } from './storage.js';
import { el, $, formatClock, renderGoal } from './dom.js';
import { STATUSES, STATUS_LABEL, type Mode, type Todo, type Session, type Timer, type Settings } from './types.js';

const trackerUrl = (q = '') => chrome.runtime.getURL('tracker.html') + q;

// ---- tabs ----
const tabs = document.querySelectorAll<HTMLButtonElement>('nav.tabs button');
tabs.forEach((btn) => {
  btn.onclick = () => {
    tabs.forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    document.querySelectorAll<HTMLElement>('main > .pane').forEach((p) => (p.hidden = p.id !== btn.dataset.tab));
  };
});

// ---- timer ----
let timer: Timer = { phase: 'idle', endsAt: 0 };
let settings: Settings;

function renderClock() {
  const { phase, endsAt } = timer;
  document.body.dataset.phase = phase;
  const total = (phase === 'break' ? settings.breakMin : settings.focusMin) * 60000;
  const left = phase === 'idle' ? total : endsAt - Date.now();
  $('clock').textContent = formatClock(left);
  $('progress').style.width = `${phase === 'idle' ? 0 : Math.min(100, Math.max(0, (1 - left / total) * 100))}%`;
  $('phase-label').textContent =
    phase === 'focus' ? 'Focusing. Distractions are blocked.' : phase === 'break' ? 'On a break. Every site is open.' : 'Ready when you are';
}

async function renderFocus() {
  [timer, settings] = await Promise.all([get('timer'), get('settings')]);
  $('start').hidden = timer.phase !== 'idle';
  $('stop').hidden = timer.phase === 'idle';
  document.querySelectorAll<HTMLInputElement>('input[name=mode]').forEach((r) => (r.checked = r.value === settings.mode));
  renderClock();
}

setInterval(() => settings && renderClock(), 1000);
$('start').onclick = () => chrome.runtime.sendMessage({ type: 'start' });
$('stop').onclick = () => chrome.runtime.sendMessage({ type: 'stop' });
document.querySelectorAll<HTMLInputElement>('input[name=mode]').forEach((r) => {
  r.onchange = async () => set('settings', { ...(await get('settings')), mode: r.value as Mode });
});
$('options').onclick = () => chrome.runtime.openOptionsPage();

// ---- todos ----
async function renderTodos() {
  const [todos, history, s] = await Promise.all([get('todos'), get('history'), get('settings')]);
  renderGoal(history, s.dailyGoal);
  const open = todos.filter((t) => !t.done).length;
  $('todo-count').textContent = open ? String(open) : '';
  $('todo-empty').hidden = todos.length > 0;
  $('clear-done').hidden = open === todos.length;
  $('todo-list').replaceChildren(
    ...todos.map((t: Todo) =>
      el('li', { className: t.done ? 'done' : '' },
        el('input', { type: 'checkbox', className: 'check', checked: t.done, ariaLabel: t.text, onchange: () => toggleTodo(t.id) }),
        t.url
          ? el('a', { href: t.url, target: '_blank', textContent: t.text, title: t.text, className: 'item-text' })
          : el('span', { textContent: t.text, title: t.text, className: 'item-text' }),
        el('button', { className: 'del', ariaLabel: `Delete ${t.text}`, textContent: '×', onclick: () => set('todos', todos.filter((x) => x.id !== t.id)) }),
      ),
    ),
  );
}

$<HTMLFormElement>('todo-form').onsubmit = async (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>('todo-text');
  if (input.value.trim()) await addTodo(input.value.trim());
  input.value = '';
};
$('clear-done').onclick = async () => set('todos', (await get('todos')).filter((t) => !t.done));

// ---- jobs ----
async function renderJobs() {
  const positions = await get('positions');
  $('status-chips').replaceChildren(
    ...STATUSES.map((s) => [s, positions.filter((p) => p.status === s).length] as const)
      .filter(([, n]) => n)
      .map(([s, n]) => el('a', { className: `chip status-${s}`, href: trackerUrl(`?status=${s}`), target: '_blank' },
        STATUS_LABEL[s], el('strong', { textContent: ` ${n}` }))),
  );
  const updates = positions
    .flatMap((p) => p.signals.filter((s) => s.unseen).map((s) => ({ p, s })))
    .sort((a, b) => b.s.at - a.s.at);
  $('update-count').textContent = updates.length ? String(updates.length) : '';
  $('update-empty').hidden = updates.length > 0;
  $('mark-read').hidden = !updates.length;
  $('update-list').replaceChildren(
    ...updates.slice(0, 6).map(({ p, s }) =>
      el('li', {},
        el('a', { className: 'item-text', href: trackerUrl(), target: '_blank', title: `${p.title} at ${p.company}` },
          el('strong', { textContent: p.company || p.title }), ` ${s.text}`),
      ),
    ),
  );
}

$('save-job').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const added = await addJobFromTab(tab);
  const msg = $('save-msg');
  msg.textContent = added ? 'Saved to your tracker as Saved.' : 'This job is already in your tracker.';
  msg.hidden = false;
};
$('open-tracker').onclick = () => chrome.tabs.create({ url: trackerUrl() });
$('mark-read').onclick = () => markSeen();

// ---- sessions ----
async function renderSessions() {
  const sessions = await get('sessions');
  $('session-empty').hidden = sessions.length > 0;
  $('session-list').replaceChildren(
    ...sessions.map((s: Session) =>
      el('li', {},
        el('span', { className: 'item-text', title: s.name }, s.name, el('span', { className: 'muted', textContent: `  ${s.urls.length} tabs` })),
        el('button', { className: 'small-btn', textContent: 'Open', onclick: () => chrome.windows.create({ url: s.urls }) }),
        el('button', { className: 'del', ariaLabel: `Delete ${s.name}`, textContent: '×', onclick: () => set('sessions', sessions.filter((x) => x.id !== s.id)) }),
      ),
    ),
  );
}

$<HTMLFormElement>('session-form').onsubmit = async (e) => {
  e.preventDefault();
  const tabs = await chrome.tabs.query({ currentWindow: true });
  // chrome:// and other internal pages can't be reopened by an extension
  const urls = tabs.map((t) => t.url ?? '').filter((u) => /^https?:|^file:/.test(u));
  if (!urls.length) return;
  const input = $<HTMLInputElement>('session-name');
  const name = input.value.trim() || new Date().toLocaleString();
  await set('sessions', [{ id: crypto.randomUUID(), name, urls, savedAt: Date.now() }, ...(await get('sessions'))]);
  input.value = '';
};

// ---- render + live updates ----
const renderAll = () => Promise.all([renderFocus(), renderTodos(), renderJobs(), renderSessions()]);
chrome.storage.onChanged.addListener(renderAll);
renderAll();
