import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJobTitle, isClosed, htmlToLines, statusFromText, safeUrl, skillTodos } from '../extension/js/jobs.js';

test('skillTodos: suggests learning todos from the role title', () => {
  assert.deepEqual(skillTodos('Python Developer'), ['Learn Python']);
  assert.deepEqual(skillTodos('Senior Backend Engineer (Node.js, AWS)'), ['Practice Node.js', 'Learn AWS basics', 'Practice system design']);
  assert.equal(skillTodos('Full Stack Developer: React, TypeScript, Python, SQL').length, 3);
});

test('skillTodos: word boundaries avoid false matches', () => {
  assert.deepEqual(skillTodos('JavaScript Engineer'), ['Practice JavaScript']); // not Java
  assert.deepEqual(skillTodos('Java Developer'), ['Learn Java']);
  assert.deepEqual(skillTodos('Google Ads Specialist'), []); // not Go
  assert.deepEqual(skillTodos('Go Engineer'), ['Learn Go']);
  assert.deepEqual(skillTodos('Linux Support'), ['Practice Linux']); // not UX
  assert.deepEqual(skillTodos('Latest Opportunities at Studios'), []); // not test, not iOS
  assert.deepEqual(skillTodos('C# .NET Developer'), ['Learn C# and .NET']);
  assert.deepEqual(skillTodos('Office Manager'), []);
});

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

test('htmlToLines: doctype, literal "<" in text, unterminated script hides the rest', () => {
  assert.deepEqual(htmlToLines('<!DOCTYPE html><?xml x?><p>a < b</p><p>c</p><script>evil'), ['a < b', 'c']);
  assert.deepEqual(htmlToLines('<P>Upper</P><SCRIPT>x</SCRIPT><Div>Case</Div>'), ['Upper', 'Case']);
});

test('htmlToLines stays linear on hostile markup (no ReDoS)', () => {
  const hostile = [
    '<script'.repeat(200000),
    '<!--'.repeat(300000),
    '<p'.repeat(300000) + '>',
    'x<1'.repeat(300000) + '>',
    '&' + 'a'.repeat(500000),
    '<style>' + '</styl'.repeat(200000),
  ];
  for (const h of hostile) {
    const t = performance.now();
    htmlToLines(h);
    assert.ok(performance.now() - t < 1000, `slow on ${h.slice(0, 12)}…`);
  }
});

test('isPublicWebUrl refuses local, private and credentialed URLs', async () => {
  const { isPublicWebUrl } = await import('../extension/js/jobs.js');
  for (const ok of ['https://boards.greenhouse.io/x/jobs/1', 'http://careers.example.com/a']) assert.equal(isPublicWebUrl(ok), true, ok);
  for (const bad of [
    'http://localhost:3000/', 'http://127.0.0.1/', 'http://0x7f.1/', 'http://2130706433/', 'http://192.168.1.1/admin',
    'http://10.0.0.5/', 'http://[::1]/', 'http://[fd00::1]/', 'http://router/', 'http://nas.local/', 'http://app.internal/',
    'https://user:pass@jobs.example.com/', 'javascript:alert(1)', 'file:///C:/x', '',
  ]) assert.equal(isPublicWebUrl(bad), false, bad);
});

test('parseJobTitle stays fast on a hostile title', () => {
  const t = performance.now();
  parseJobTitle('a hiring ' + ' in a'.repeat(50000) + ' | ' + 'x'.repeat(50000));
  assert.ok(performance.now() - t < 200);
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
