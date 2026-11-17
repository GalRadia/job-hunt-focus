import { DEFAULTS, type Store, type Todo, type Position, type Signal } from './types.js';
import { dayKey } from './streak.js';
import { parseJobTitle, newPosition, safeUrl } from './jobs.js';

const isPlainObject = (v: unknown): v is object => typeof v === 'object' && v !== null && !Array.isArray(v);

// Defaults are applied on read, so first install needs no seeding. Stored objects are merged over their
// defaults so fields added in later versions (e.g. settings.watchEveryMin) exist for existing installs.
export async function get<K extends keyof Store>(key: K): Promise<Store[K]> {
  const r = await chrome.storage.local.get(key);
  const d = structuredClone(DEFAULTS[key]);
  if (r[key] === undefined) return d;
  return (isPlainObject(d) && isPlainObject(r[key]) ? { ...d, ...r[key] } : r[key]) as Store[K];
}

export function set<K extends keyof Store>(key: K, value: Store[K]): Promise<void> {
  return chrome.storage.local.set({ [key]: value });
}

function bumpToday(history: Store['history'], delta: number) {
  const today = dayKey(new Date());
  history[today] = Math.max(0, (history[today] ?? 0) + delta);
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
  if (!t.done) {
    t.done = true;
    t.doneAt = Date.now();
    bumpToday(history, 1);
  } else {
    // Only undo today's count; un-checking an old todo must not change past days.
    if (t.doneAt && dayKey(new Date(t.doneAt)) === dayKey(new Date())) bumpToday(history, -1);
    t.done = false;
    t.doneAt = undefined;
  }
  await chrome.storage.local.set({ todos, history });
}

/** Adds a position unless one with the same url exists. Returns false for a duplicate. */
export async function addPosition(p: Position): Promise<boolean> {
  const positions = await get('positions');
  if (p.url && positions.some((x) => x.url === p.url)) return false;
  await set('positions', [p, ...positions]);
  return true;
}

export async function addJobFromTab(tab: chrome.tabs.Tab): Promise<boolean> {
  const { title, company } = parseJobTitle(tab.title || '');
  return addPosition(newPosition({ title: title || 'Untitled job', company, url: safeUrl(tab.url) }));
}

/** Patches a position. Moving to Applied counts toward today's goal. */
export async function updatePosition(id: string, patch: Partial<Position>, signal?: Signal): Promise<void> {
  const [positions, history] = await Promise.all([get('positions'), get('history')]);
  const p = positions.find((x) => x.id === id);
  if (!p) return;
  // shortcut: moving away from Applied doesn't un-count it; fine for a daily nudge, revisit if goals get stricter
  if (patch.status === 'applied' && p.status !== 'applied') bumpToday(history, 1);
  Object.assign(p, patch, { updatedAt: Date.now() });
  if (signal) p.signals = [signal, ...p.signals].slice(0, 10);
  await chrome.storage.local.set({ positions, history });
}

export async function markSeen(id?: string): Promise<void> {
  const positions = await get('positions');
  for (const p of positions) if (!id || p.id === id) p.signals.forEach((s) => (s.unseen = false));
  await set('positions', positions);
}
