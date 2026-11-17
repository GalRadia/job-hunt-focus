import { DEFAULTS, type Store, type Todo } from './types.js';
import { dayKey } from './streak.js';

// Defaults are applied on read, so first install needs no seeding.
export async function get<K extends keyof Store>(key: K): Promise<Store[K]> {
  const r = await chrome.storage.local.get(key);
  return (r[key] ?? structuredClone(DEFAULTS[key])) as Store[K];
}

export function set<K extends keyof Store>(key: K, value: Store[K]): Promise<void> {
  return chrome.storage.local.set({ [key]: value });
}

export async function addTodo(text: string, url?: string): Promise<void> {
  const todos = await get('todos');
  todos.unshift({ id: crypto.randomUUID(), text, url, done: false });
  await set('todos', todos);
}

export async function toggleTodo(id: string): Promise<void> {
  const [todos, history] = await Promise.all([get('todos'), get('history')]);
  const t = todos.find((x: Todo) => x.id === id);
  if (!t) return;
  const today = dayKey(new Date());
  if (!t.done) {
    t.done = true;
    t.doneAt = Date.now();
    history[today] = (history[today] ?? 0) + 1;
  } else {
    // Only undo today's count; un-checking an old todo must not change past days.
    if (t.doneAt && dayKey(new Date(t.doneAt)) === today) history[today] = Math.max(0, (history[today] ?? 0) - 1);
    t.done = false;
    t.doneAt = undefined;
  }
  await chrome.storage.local.set({ todos, history });
}

export async function addJobTodo(tab: chrome.tabs.Tab): Promise<void> {
  await addTodo(`Apply: ${tab.title || tab.url || 'job'}`, tab.url);
}
