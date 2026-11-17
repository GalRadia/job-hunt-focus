import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJobTitle, isClosed, htmlToLines, statusFromText, safeUrl } from '../extension/js/jobs.js';

test('parseJobTitle: pipe-separated with site suffix', () => {
  assert.deepEqual(parseJobTitle('(3) Senior Frontend Engineer | Wix | LinkedIn'), { title: 'Senior Frontend Engineer', company: 'Wix' });
});

test('parseJobTitle: LinkedIn "X hiring Y in Z"', () => {
  assert.deepEqual(parseJobTitle('Monday.com hiring Full Stack Developer in Tel Aviv | LinkedIn'), { title: 'Full Stack Developer', company: 'Monday.com' });
});

test('parseJobTitle: "Title at Company - Greenhouse"', () => {
  assert.deepEqual(parseJobTitle('Job Application for React Developer at Fiverr - Greenhouse'), { title: 'Job Application for React Developer', company: 'Fiverr' });
});

test('parseJobTitle: plain title', () => {
  assert.deepEqual(parseJobTitle('Backend Engineer'), { title: 'Backend Engineer', company: '' });
});

test('safeUrl keeps only http(s)', () => {
  assert.equal(safeUrl(' https://wix.com/jobs/1 '), 'https://wix.com/jobs/1');
  assert.equal(safeUrl('javascript:alert(1)'), undefined);
  assert.equal(safeUrl('chrome://newtab'), undefined);
  assert.equal(safeUrl(''), undefined);
});

test('htmlToLines strips scripts/styles, splits blocks, decodes entities, dedupes', () => {
  const html = `<html><head><title>x</title><style>.a{}</style></head><body>
    <script>var secret = 1</script><h1>Senior&nbsp;Engineer</h1><p>Tom &amp; Jerry &#8211; &#x41;</p>
    <div>Apply   now</div><div>Apply now</div><!-- hidden --></body></html>`;
  assert.deepEqual(htmlToLines(html), ['Senior Engineer', 'Tom & Jerry – A', 'Apply now']);
});

test('htmlToLines caps line count and length', () => {
  const lines = htmlToLines(Array.from({ length: 4000 }, (_, i) => `<p>${i}${'x'.repeat(400)}</p>`).join(''));
  assert.equal(lines.length, 3000);
  assert.equal(lines[0].length, 300);
});

test('isClosed: HTTP gone or closing phrases', () => {
  assert.equal(isClosed(404, []), true);
  assert.equal(isClosed(410, []), true);
  assert.equal(isClosed(200, ['Senior Engineer', 'No longer accepting applications']), true);
  assert.equal(isClosed(200, ['This position has been filled.']), true);
  assert.equal(isClosed(200, ['This job has expired']), true);
  assert.equal(isClosed(200, ['Senior Engineer', 'Apply now']), false);
  assert.equal(isClosed(500, []), false);
});

test('statusFromText maps free text in English and Hebrew', () => {
  assert.equal(statusFromText('Phone screen'), 'interview');
  assert.equal(statusFromText('Sent CV'), 'applied');
  assert.equal(statusFromText('Rejected'), 'rejected');
  assert.equal(statusFromText('Got an offer!'), 'offer');
  assert.equal(statusFromText('נדחה'), 'rejected');
  assert.equal(statusFromText('ראיון שני'), 'interview');
  assert.equal(statusFromText('Position filled'), 'closed');
  assert.equal(statusFromText('Want to apply'), 'saved');
  assert.equal(statusFromText('Applied'), 'applied');
  assert.equal(statusFromText(''), undefined);
  assert.equal(statusFromText('???'), undefined);
});
