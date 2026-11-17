import { get, set, addPosition, updatePosition, markSeen, addTodo, toggleTodo, removeTodo, deletePosition } from './storage.js';
import { parseCsv, importRows, toCsv } from './csv.js';
import { newPosition, newSignal, safeUrl, skillTodos } from './jobs.js'; // safeUrl also guards rendered links
import { el, $, ago } from './dom.js';
import { STATUSES, STATUS_LABEL, type Position, type Status, type Todo } from './types.js';

const params = new URLSearchParams(location.search);
let filter = (params.get('status') as Status | null) ?? null;
let pendingRows: string[][] | null = null;
const highlight = new Set<string>(); // positions with unseen updates when this page was opened
const expanded = new Set<string>(params.getAll('open')); // open details rows; ?open=<id> deep-links from the popup

// ---------- debounced text saves ----------

const pendingSaves = new Map<string, () => Promise<void>>();
const saveTimers = new Map<string, number>();

function scheduleSave(key: string, save: () => Promise<void>) {
  clearTimeout(saveTimers.get(key));
  pendingSaves.set(key, save);
  saveTimers.set(key, setTimeout(() => flushSave(key), 500));
}

function flushSave(key: string): Promise<void> {
  clearTimeout(saveTimers.get(key));
  const save = pendingSaves.get(key);
  pendingSaves.delete(key);
  return save ? save() : Promise.resolve();
}

const flushAll = () => Promise.all([...pendingSaves.keys()].map(flushSave));
addEventListener('pagehide', () => void flushAll()); // closing the tab right after typing keeps the text

// ---------- rendering ----------

function statusSelect(p: Position) {
  const select = el('select', { className: `status-select status-${p.status}`, ariaLabel: `Status for ${p.title}` },
    ...STATUSES.map((s) => el('option', { value: s, textContent: STATUS_LABEL[s], selected: s === p.status })));
  select.onchange = async () => {
    const status = select.value as Status;
    await updatePosition(p.id, { status }, newSignal('manual', `Moved to ${STATUS_LABEL[status]}`));
    if (status === 'rejected') { // nudge: open the details and start the reflection
      expanded.add(p.id);
      await rerender(`#reflection-${p.id}`);
    }
  };
  return select;
}

function cellInput(p: Position, field: 'company' | 'title', label: string) {
  return el('input', {
    type: 'text', className: 'cell-input', value: p[field], ariaLabel: label,
    onchange: (e: Event) => updatePosition(p.id, { [field]: (e.target as HTMLInputElement).value.trim() }),
  });
}

function deleteButton(p: Position) {
  const b = el('button', { className: 'del', ariaLabel: `Delete ${p.title}`, textContent: '×' });
  b.onclick = async () => {
    if (!b.dataset.armed) { // two clicks instead of a blocking confirm()
      b.dataset.armed = '1';
      b.textContent = 'Delete?';
      setTimeout(() => { delete b.dataset.armed; b.textContent = '×'; }, 3000);
      return;
    }
    expanded.delete(p.id);
    await deletePosition(p.id);
    await rerender();
  };
  return b;
}

function latest(p: Position) {
  if (p.checkError) return el('span', { className: 'warn', textContent: p.checkError, title: 'The posting check failed. The status was not changed.' });
  const s = p.signals[0];
  if (!s) return el('span', { className: 'muted', textContent: p.lastChecked ? `Checked ${ago(p.lastChecked)}` : '' });
  return el('span', {}, s.text, el('span', { className: 'muted', textContent: `  ${ago(s.at)}` }));
}

function summary(p: Position, mine: Todo[]): string {
  const parts: string[] = [];
  if (p.notes) parts.push('Has notes');
  if (mine.length) parts.push(`${mine.filter((t) => t.done).length} of ${mine.length} todos done`);
  if (p.reflection) parts.push('Reflection added');
  else if (p.status === 'rejected') parts.push('Add a reflection');
  return parts.join(', ');
}

function row(p: Position, mine: Todo[]) {
  const open = expanded.has(p.id);
  const note = summary(p, mine);
  const chev = el('button', {
    className: 'chev', textContent: '›', ariaExpanded: String(open), ariaLabel: `Notes, reflection and todos for ${p.title}`,
    onclick: async () => {
      if (open) expanded.delete(p.id);
      else expanded.add(p.id);
      await rerender(`[data-chev="${p.id}"]`);
    },
  });
  chev.dataset.chev = p.id;
  return el('tr', { className: `${highlight.has(p.id) ? 'fresh' : ''}${open ? ' open' : ''}` },
    el('td', { className: 'toggle-cell' }, chev),
    el('td', {}, cellInput(p, 'company', 'Company')),
    el('td', {}, el('div', { className: 'role' },
      cellInput(p, 'title', 'Role'),
      safeUrl(p.url) ? el('a', { href: safeUrl(p.url)!, target: '_blank', rel: 'noopener noreferrer', className: 'open-link', textContent: 'Open posting' }) : '',
      note ? el('span', { className: `row-note${p.status === 'rejected' && !p.reflection ? ' nudge' : ''}`, textContent: note }) : '')),
    el('td', {}, statusSelect(p)),
    el('td', { className: 'muted', textContent: p.appliedOn ?? '' }),
    el('td', { className: 'latest' }, latest(p)),
    el('td', {}, el('input', {
      type: 'checkbox', className: 'check', checked: p.watch && !!p.url, disabled: !p.url,
      ariaLabel: `Check the posting for ${p.title}`, title: p.url ? 'Check this posting in the background' : 'Add a posting link to check it',
      onchange: (e: Event) => updatePosition(p.id, { watch: (e.target as HTMLInputElement).checked }),
    })),
    el('td', {}, deleteButton(p)),
  );
}

function textBox(p: Position, field: 'notes' | 'reflection', label: string, placeholder: string) {
  const ta = el('textarea', { id: `${field}-${p.id}`, value: p[field] ?? '', placeholder, ariaLabel: label, rows: 5 });
  const save = () => updatePosition(p.id, { [field]: ta.value.trim() || undefined });
  ta.oninput = () => scheduleSave(`${field}-${p.id}`, save);
  ta.onblur = () => void flushSave(`${field}-${p.id}`);
  return ta;
}

function todoBlock(p: Position, mine: Todo[]) {
  const input = el('input', { type: 'text', id: `todo-input-${p.id}`, placeholder: 'Add a todo, e.g. Learn Python basics', ariaLabel: `New todo for ${p.title}`, autocomplete: 'off' });
  const add = async (text: string) => {
    await addTodo(text, undefined, p.id);
    await rerender(`#todo-input-${p.id}`);
  };
  const suggestions = mine.length ? [] : skillTodos(p.title);
  return el('section', { className: 'detail-block' },
    el('h3', { textContent: 'Todos for this position' }),
    mine.length ? el('ul', { className: 'list' }, ...mine.map((t) =>
      el('li', { className: t.done ? 'done' : '' },
        el('input', { type: 'checkbox', className: 'check', checked: t.done, ariaLabel: t.text, onchange: async () => { await toggleTodo(t.id); await rerender(); } }),
        el('span', { className: 'item-text', textContent: t.text, title: t.text }),
        el('button', { className: 'del', ariaLabel: `Delete ${t.text}`, textContent: '×', onclick: async () => { await removeTodo(t.id); await rerender(`#todo-input-${p.id}`); } }),
      ))) : '',
    suggestions.length ? el('div', { className: 'chips suggestions' },
      el('span', { className: 'muted small', textContent: 'Suggested:' }),
      ...suggestions.map((s) => el('button', { type: 'button', className: 'chip', textContent: `+ ${s}`, onclick: () => add(s) }))) : '',
    el('form', {
      className: 'add',
      onsubmit: (e: Event) => { e.preventDefault(); if (input.value.trim()) add(input.value.trim()); },
    }, input, el('button', { className: 'small-btn', textContent: 'Add' })),
  );
}

function detailsRow(p: Position, mine: Todo[]) {
  return el('tr', { className: 'details' }, el('td', { colSpan: 8 }, el('div', { className: 'details-grid' },
    el('section', { className: 'detail-block' },
      el('h3', { textContent: 'Notes' }),
      textBox(p, 'notes', `Notes for ${p.title}`, 'Contacts, interview dates, salary range, anything worth remembering')),
    p.status === 'rejected' || p.reflection
      ? el('section', { className: 'detail-block reflection' },
        el('h3', { textContent: 'What would I do better next time?' }),
        textBox(p, 'reflection', `Reflection for ${p.title}`,
          'How far did it get? What went well? What would you prepare or do differently next time?'))
      : '',
    todoBlock(p, mine),
  )));
}

function renderLessons(positions: Position[]) {
  const items = positions.filter((p) => p.reflection?.trim());
  $('lessons').hidden = !items.length;
  $('lesson-list').replaceChildren(...items.map((p) =>
    el('li', {},
      el('p', { className: 'lesson-head' },
        el('strong', { textContent: p.company || p.title }),
        p.company ? ` ${p.title}` : '',
        p.appliedOn ? el('span', { className: 'muted', textContent: `  applied ${p.appliedOn}` }) : ''),
      el('p', { className: 'lesson-text', textContent: p.reflection }),
    )));
}

let pendingRender = false;

async function render(force = false) {
  // Don't rebuild the table under the user's cursor; catch up when they leave the cell.
  if (!force && document.activeElement?.closest('#rows')) { pendingRender = true; return; }
  pendingRender = false;
  const [all, todos] = await Promise.all([get('positions'), get('todos')]);
  const positions = all.sort((a, b) => b.updatedAt - a.updatedAt);
  const count = (s: Status) => positions.filter((p) => p.status === s).length;
  const active = count('applied') + count('interview') + count('offer');
  $('summary').textContent = positions.length ? `${positions.length} positions, ${active} in progress` : '';
  $('filters').replaceChildren(
    chip('All', positions.length, null),
    ...STATUSES.filter((s) => count(s)).map((s) => chip(STATUS_LABEL[s], count(s), s)),
  );
  const shown = filter ? positions.filter((p) => p.status === filter) : positions;
  $('rows').replaceChildren(...shown.flatMap((p) => {
    const mine = todos.filter((t) => t.positionId === p.id);
    return expanded.has(p.id) ? [row(p, mine), detailsRow(p, mine)] : [row(p, mine)];
  }));
  renderLessons(positions);
  $('empty').hidden = positions.length > 0;
  document.querySelector<HTMLElement>('.table-wrap')!.hidden = positions.length === 0;
  $('filters').hidden = positions.length === 0;
}

/** For the user's own structural actions (expand, add/remove todo): save typed text, rebuild now, restore focus. */
async function rerender(focus?: string) {
  await flushAll();
  await render(true);
  if (focus) document.querySelector<HTMLElement>(focus)?.focus();
}

function chip(label: string, n: number, status: Status | null) {
  return el('button', {
    className: `chip${status ? ` status-${status}` : ''}`, ariaPressed: String(filter === status),
    onclick: () => { filter = status; history.replaceState(null, '', status ? `?status=${status}` : location.pathname); render(); },
  }, label, el('strong', { textContent: ` ${n}` }));
}

document.addEventListener('focusout', () => setTimeout(() => pendingRender && render(), 0));
chrome.storage.onChanged.addListener((c) => (c.positions || c.todos) && render());

// ---------- toolbar ----------

$('add-toggle').onclick = () => {
  const f = $('add-form');
  f.hidden = !f.hidden;
  if (!f.hidden) $('add-company').focus();
};

$<HTMLFormElement>('add-form').onsubmit = async (e) => {
  e.preventDefault();
  const v = (id: string) => $<HTMLInputElement>(id).value.trim();
  const added = await addPosition(newPosition({ company: v('add-company'), title: v('add-title'), url: safeUrl(v('add-url')) }));
  if (added) $<HTMLFormElement>('add-form').reset();
  else $<HTMLInputElement>('add-url').setCustomValidity('A position with this link is already in your tracker.');
};
$<HTMLInputElement>('add-url').oninput = (e) => (e.target as HTMLInputElement).setCustomValidity('');

$('check-now').onclick = async () => {
  const b = $<HTMLButtonElement>('check-now');
  b.disabled = true;
  b.textContent = 'Checking…';
  const n = await chrome.runtime.sendMessage({ type: 'check-postings' });
  b.disabled = false;
  b.textContent = typeof n === 'number' ? `Checked ${n} posting${n === 1 ? '' : 's'}` : 'Check postings now';
  setTimeout(() => (b.textContent = 'Check postings now'), 4000);
};

$('export').onclick = async () => {
  await flushAll();
  const a = el('a', {
    href: URL.createObjectURL(new Blob([toCsv(await get('positions'))], { type: 'text/csv;charset=utf-8' })),
    download: `job-applications-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

$('import-btn').onclick = () => $<HTMLInputElement>('import-file').click();

$<HTMLInputElement>('import-file').onchange = async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // allow picking the same file again
  if (!file) return;
  if (file.size > 5_000_000) { // storage holds ~10 MB in total; a sheet of applications is far smaller
    $('import-text').textContent = `${file.name} is larger than 5 MB. Remove unused columns or rows and try again.`;
    $('import-confirm').hidden = true;
    $('import-banner').hidden = false;
    return;
  }
  pendingRows = parseCsv(await file.text());
  const r = importRows(pendingRows, await get('positions'));
  const rows = Math.max(0, pendingRows.length - 1);
  const noColumns = rows > 0 && r.skipped === rows;
  $('import-text').textContent = noColumns
    ? `${file.name} has no Company or Title column. Rename a column to "Company" or "Title" and try again.`
    : `${file.name}: ${rows} rows. ${r.added} new, ${r.updated} updated` + (r.skipped ? `, ${r.skipped} skipped (no company or title).` : '.');
  $('import-confirm').hidden = noColumns || r.added + r.updated === 0;
  $('import-banner').hidden = false;
};

$('import-cancel').onclick = () => { pendingRows = null; $('import-banner').hidden = true; };
$('import-confirm').onclick = async () => {
  if (!pendingRows) return;
  // Re-run against the latest list so anything that changed since the preview is kept.
  try {
    await set('positions', importRows(pendingRows, await get('positions')).next);
  } catch {
    $('import-text').textContent = 'Not enough storage space for this import. Export a backup, delete old positions, then try again.';
    $('import-confirm').hidden = true;
    return; // nothing was written; existing data is untouched
  }
  pendingRows = null;
  $('import-banner').hidden = true;
};

// ---------- start ----------

(async () => {
  for (const p of await get('positions')) if (p.signals.some((s) => s.unseen)) highlight.add(p.id);
  await render();
  const first = params.get('open');
  if (first) document.querySelector(`[data-chev="${CSS.escape(first)}"]`)?.scrollIntoView({ block: 'nearest' });
  if (highlight.size) await markSeen(); // you've now seen them; the popup count clears
})();
