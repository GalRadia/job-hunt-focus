import { get, set, addPosition, updatePosition, markSeen } from './storage.js';
import { parseCsv, importRows, toCsv } from './csv.js';
import { newPosition, newSignal, safeUrl } from './jobs.js';
import { el, $, ago } from './dom.js';
import { STATUSES, STATUS_LABEL, type Position, type Status } from './types.js';

let filter = (new URLSearchParams(location.search).get('status') as Status | null) ?? null;
let pendingRows: string[][] | null = null;
const highlight = new Set<string>(); // positions with unseen updates when this page was opened

// ---------- rendering ----------

function statusSelect(p: Position) {
  const select = el('select', { className: `status-select status-${p.status}`, ariaLabel: `Status for ${p.title}` },
    ...STATUSES.map((s) => el('option', { value: s, textContent: STATUS_LABEL[s], selected: s === p.status })));
  select.onchange = () => {
    const status = select.value as Status;
    updatePosition(p.id, { status }, newSignal('manual', `Moved to ${STATUS_LABEL[status]}`));
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
    await set('positions', (await get('positions')).filter((x) => x.id !== p.id));
  };
  return b;
}

function latest(p: Position) {
  if (p.checkError) return el('span', { className: 'warn', textContent: p.checkError, title: 'The posting check failed. The status was not changed.' });
  const s = p.signals[0];
  if (!s) return el('span', { className: 'muted', textContent: p.lastChecked ? `Checked ${ago(p.lastChecked)}` : '' });
  return el('span', {}, s.text, el('span', { className: 'muted', textContent: `  ${ago(s.at)}` }));
}

function row(p: Position) {
  return el('tr', { className: highlight.has(p.id) ? 'fresh' : '' },
    el('td', {}, cellInput(p, 'company', 'Company')),
    el('td', {}, el('div', { className: 'role' },
      cellInput(p, 'title', 'Role'),
      p.url ? el('a', { href: p.url, target: '_blank', rel: 'noreferrer', className: 'open-link', textContent: 'Open posting' }) : '',
      p.notes ? el('span', { className: 'muted small notes', textContent: p.notes, title: p.notes }) : '')),
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

let pendingRender = false;

async function render() {
  // Don't rebuild the table under the user's cursor; catch up when they leave the cell.
  if (document.activeElement?.closest('#rows')) { pendingRender = true; return; }
  pendingRender = false;
  const positions = (await get('positions')).sort((a, b) => b.updatedAt - a.updatedAt);
  const count = (s: Status) => positions.filter((p) => p.status === s).length;
  const active = count('applied') + count('interview') + count('offer');
  $('summary').textContent = positions.length ? `${positions.length} positions, ${active} in progress` : '';
  $('filters').replaceChildren(
    chip('All', positions.length, null),
    ...STATUSES.filter((s) => count(s)).map((s) => chip(STATUS_LABEL[s], count(s), s)),
  );
  const shown = filter ? positions.filter((p) => p.status === filter) : positions;
  $('rows').replaceChildren(...shown.map(row));
  $('empty').hidden = positions.length > 0;
  document.querySelector<HTMLElement>('.table-wrap')!.hidden = positions.length === 0;
  $('filters').hidden = positions.length === 0;
}

function chip(label: string, n: number, status: Status | null) {
  return el('button', {
    className: `chip${status ? ` status-${status}` : ''}`, ariaPressed: String(filter === status),
    onclick: () => { filter = status; history.replaceState(null, '', status ? `?status=${status}` : location.pathname); render(); },
  }, label, el('strong', { textContent: ` ${n}` }));
}

document.addEventListener('focusout', () => setTimeout(() => pendingRender && render(), 0));
chrome.storage.onChanged.addListener((c) => c.positions && render());

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
  await set('positions', importRows(pendingRows, await get('positions')).next);
  pendingRows = null;
  $('import-banner').hidden = true;
};

// ---------- start ----------

(async () => {
  for (const p of await get('positions')) if (p.signals.some((s) => s.unseen)) highlight.add(p.id);
  await render();
  if (highlight.size) await markSeen(); // you've now seen them; the popup count clears
})();
