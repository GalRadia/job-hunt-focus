import type { Position } from './types.js';
import { newPosition, newSignal, safeUrl, statusFromText } from './jobs.js';
import { STATUS_LABEL } from './types.js';

const count = (s: string, ch: string) => s.split(ch).length - 1;

/** RFC 4180-ish: quotes, "" escapes, newlines inside quotes, CRLF, BOM; delimiter , ; or tab from the header. */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '');
  const header = text.split(/\r?\n/, 1)[0];
  const delim = [';', '\t'].reduce((best, d) => (count(header, d) > count(header, best) ? d : best), ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim()));
}

type Field = 'url' | 'company' | 'status' | 'appliedOn' | 'notes' | 'title';
// Order matters: "Job link" must become url before "job" can claim it as the title.
const ALIASES: [Field, string[]][] = [
  ['url', ['url', 'link', 'קישור', 'לינק']],
  ['company', ['company', 'employer', 'organization', 'חברה']],
  ['status', ['status', 'stage', 'state', 'סטטוס', 'מצב']],
  ['appliedOn', ['date', 'applied', 'תאריך']],
  ['notes', ['note', 'comment', 'הערות', 'הערה']],
  ['title', ['title', 'position', 'role', 'job', 'תפקיד', 'משרה']],
];

export function mapHeader(header: string[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  header.forEach((h, i) => {
    const name = h.trim().toLowerCase();
    const field = ALIASES.find(([f, words]) => map[f] === undefined && words.some((w) => name.includes(w)))?.[0];
    if (field) map[field] = i;
  });
  return map;
}

const key = (p: Pick<Position, 'company' | 'title'>) => `${p.company}|${p.title}`.toLowerCase().replace(/\s+/g, ' ').trim();

export interface ImportResult { next: Position[]; added: number; updated: number; skipped: number }

/** Merges CSV rows (header first) into existing positions, matching by url, then by company + title. */
export function importRows(rows: string[][], existing: Position[]): ImportResult {
  const map = mapHeader(rows[0] ?? []);
  const next = structuredClone(existing);
  const res: ImportResult = { next, added: 0, updated: 0, skipped: 0 };
  if (map.company === undefined && map.title === undefined) {
    res.skipped = Math.max(0, rows.length - 1);
    return res;
  }
  for (const r of rows.slice(1)) {
    const cell = (f: Field) => (map[f] === undefined ? '' : (r[map[f]!] ?? '').trim());
    const company = cell('company');
    const title = cell('title');
    if (!company && !title) { res.skipped++; continue; }
    const url = safeUrl(cell('url'));
    const appliedOn = cell('appliedOn') || undefined;
    // An empty status on a dated row means it came from an application log.
    const status = statusFromText(cell('status')) ?? (appliedOn ? 'applied' : 'saved');
    const notes = cell('notes') || undefined;

    const found = next.find((p) => (url && p.url === url) || key(p) === key({ company, title }));
    if (!found) {
      next.push(newPosition({ company, title, url, status, appliedOn, notes, signals: [newSignal('import', `Imported as ${STATUS_LABEL[status]}`)] }));
      res.added++;
      continue;
    }
    const patch: Partial<Position> = {};
    const differs = (a: string, b: string) => a.toLowerCase() !== b.toLowerCase(); // "fiverr" shouldn't overwrite "Fiverr"
    if (company && differs(company, found.company)) patch.company = company;
    if (title && differs(title, found.title)) patch.title = title;
    if (url && url !== found.url) patch.url = url;
    if (appliedOn && appliedOn !== found.appliedOn) patch.appliedOn = appliedOn;
    if (notes && notes !== found.notes) patch.notes = notes;
    if (cell('status') && status !== found.status) patch.status = status;
    if (!Object.keys(patch).length) continue;
    Object.assign(found, patch, { updatedAt: Date.now() });
    if (patch.status) found.signals = [newSignal('import', `Imported as ${STATUS_LABEL[status]}`), ...found.signals].slice(0, 10);
    res.updated++;
  }
  return res;
}

/** Quotes when needed, and defuses spreadsheet formulas (=, +, -, @) that could come from scraped page titles. */
function csvCell(v: string | undefined): string {
  let s = v ?? '';
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(positions: Position[]): string {
  const rows = [['Company', 'Title', 'Status', 'Applied on', 'URL', 'Notes']];
  for (const p of positions) rows.push([p.company, p.title, STATUS_LABEL[p.status], p.appliedOn ?? '', p.url ?? '', p.notes ?? '']);
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'); // BOM so Excel reads UTF-8 (Hebrew) correctly
}
