import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, mapHeader, importRows, toCsv } from '../extension/js/csv.js';

test('parseCsv: quotes, escaped quotes, newline in quotes, CRLF, BOM', () => {
  const text = '﻿Company,Title,Notes\r\n"Wix, Ltd","Senior ""FE"" Engineer","line1\nline2"\r\nFiverr,React Dev,\r\n';
  assert.deepEqual(parseCsv(text), [
    ['Company', 'Title', 'Notes'],
    ['Wix, Ltd', 'Senior "FE" Engineer', 'line1\nline2'],
    ['Fiverr', 'React Dev', ''],
  ]);
});

test('parseCsv: semicolon and tab delimiters, blank lines dropped', () => {
  assert.deepEqual(parseCsv('a;b\n1;2\n\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
});

test('mapHeader: aliases, order (Job Link is a url, not a title), Hebrew', () => {
  assert.deepEqual(mapHeader(['Company Name', 'Job Title', 'Job Link', 'Stage', 'Date Applied', 'Comments']),
    { company: 0, title: 1, url: 2, status: 3, appliedOn: 4, notes: 5 });
  assert.deepEqual(mapHeader(['חברה', 'תפקיד', 'סטטוס', 'קישור']), { company: 0, title: 1, status: 2, url: 3 });
});

test('importRows: adds, maps status, infers Applied from a date, rejects unsafe urls', () => {
  const rows = parseCsv([
    'Company,Position,Status,Link,Date',
    'Wix,Frontend Engineer,Phone screen,https://wix.com/j/1,',
    'Fiverr,React Dev,,javascript:alert(1),2026-11-01',
    ',,,,',
    'Lemonade,,,,',
  ].join('\n'));
  const r = importRows(rows, []);
  assert.equal(r.added, 3);
  assert.equal(r.skipped, 0); // fully blank rows are dropped by parseCsv already
  const [wix, fiverr, lemonade] = r.next;
  assert.equal(wix.status, 'interview');
  assert.equal(wix.url, 'https://wix.com/j/1');
  assert.equal(fiverr.status, 'applied');
  assert.equal(fiverr.url, undefined);
  assert.equal(lemonade.status, 'saved');
  assert.equal(wix.signals[0].source, 'import');
});

test('importRows: re-import updates by url or company+title instead of duplicating', () => {
  const first = importRows(parseCsv('Company,Title,Status,URL\nWix,FE,Applied,https://wix.com/j/1\nFiverr,React Dev,Applied,'), []).next;
  const r = importRows(parseCsv('Company,Title,Status,URL\nWix Ltd,FE,Interview,https://wix.com/j/1\nfiverr,react dev,Applied,\nMonday,BE,,'), first);
  assert.equal(r.added, 1);
  assert.equal(r.updated, 1); // Wix changed; Fiverr matched by company+title with nothing new
  assert.equal(r.next.length, 3);
  assert.equal(r.next[0].status, 'interview');
  assert.equal(r.next[0].company, 'Wix Ltd');
  assert.equal(first[0].status, 'applied', 'input is not mutated');
});

test('importRows: no company/title columns -> everything skipped', () => {
  const r = importRows(parseCsv('foo,bar\n1,2\n3,4'), []);
  assert.deepEqual([r.added, r.updated, r.skipped], [0, 0, 2]);
});

test('toCsv: round-trips and defuses formulas', () => {
  const { next } = importRows(parseCsv('Company,Title,URL\n"=HYPERLINK(""x"")","A, B",https://x.com/1'), []);
  const out = toCsv(next);
  assert.ok(out.startsWith('﻿Company,Title,Status'));
  assert.ok(out.includes(`"'=HYPERLINK(""x"")"`));
  const back = parseCsv(out);
  assert.deepEqual(back[1].slice(0, 3), [`'=HYPERLINK("x")`, 'A, B', 'Saved']);
});
