import { get, set, addTodo, addJobTodo, toggleTodo } from './storage.js';
import { goalText } from './streak.js';
import { el, $, minutesLeft } from './dom.js';
import type { Mode, Todo, Session } from './types.js';

// ---- tabs ----
document.querySelectorAll<HTMLButtonElement>('nav button').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('main > section').forEach((s) => ((s as HTMLElement).hidden = s.id !== btn.dataset.tab));
  };
});

// ---- focus ----
async function renderFocus() {
  const [t, s] = await Promise.all([get('timer'), get('settings')]);
  $('status').textContent =
    t.phase === 'idle' ? 'Not in a session' : `${t.phase === 'focus' ? 'Focus' : 'Break'}: ${minutesLeft(t.endsAt)} min left`;
  $('start').hidden = t.phase !== 'idle';
  $('stop').hidden = t.phase === 'idle';
  $<HTMLSelectElement>('mode').value = s.mode;
}

$('start').onclick = () => chrome.runtime.sendMessage({ type: 'start' });
$('stop').onclick = () => chrome.runtime.sendMessage({ type: 'stop' });
$<HTMLSelectElement>('mode').onchange = async (e) => {
  const s = await get('settings');
  await set('settings', { ...s, mode: (e.target as HTMLSelectElement).value as Mode });
};
$('options').onclick = () => chrome.runtime.openOptionsPage();

// ---- todos ----
async function renderTodos() {
  const [todos, history, s] = await Promise.all([get('todos'), get('history'), get('settings')]);
  $('goal').textContent = goalText(history, s.dailyGoal);
  $('todo-list').replaceChildren(
    ...todos.map((t: Todo) =>
      el('li', { className: t.done ? 'done' : '' },
        el('input', { type: 'checkbox', checked: t.done, onchange: () => toggleTodo(t.id) }),
        t.url ? el('a', { href: t.url, target: '_blank', textContent: t.text }) : el('span', { textContent: t.text }),
        el('button', { className: 'x', title: 'Delete', textContent: '×', onclick: () => set('todos', todos.filter((x) => x.id !== t.id)) }),
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
$('save-job').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) await addJobTodo(tab);
};
$('clear-done').onclick = async () => set('todos', (await get('todos')).filter((t) => !t.done));

// ---- sessions ----
async function renderSessions() {
  const sessions = await get('sessions');
  $('session-list').replaceChildren(
    ...sessions.map((s: Session) =>
      el('li', {},
        el('span', { textContent: `${s.name} (${s.urls.length} tabs)` }),
        el('button', { textContent: 'Restore', onclick: () => chrome.windows.create({ url: s.urls }) }),
        el('button', { className: 'x', title: 'Delete', textContent: '×', onclick: () => set('sessions', sessions.filter((x) => x.id !== s.id)) }),
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
const renderAll = () => Promise.all([renderFocus(), renderTodos(), renderSessions()]);
chrome.storage.onChanged.addListener(renderAll);
renderAll();
