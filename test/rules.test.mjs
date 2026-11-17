import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRules, cleanDomain, RULE_ID } from '../extension/js/rules.js';

test('cleanDomain strips protocol, www, path and port', () => {
  assert.equal(cleanDomain(' https://www.YouTube.com/watch?v=1 '), 'youtube.com');
  assert.equal(cleanDomain('mail.google.com:443'), 'mail.google.com');
  assert.equal(cleanDomain('   '), '');
});

test('cleanDomain: punycode for non-English domains, junk rejected', () => {
  assert.equal(cleanDomain('https://www.דוגמה.co.il/page'), new URL('http://דוגמה.co.il').hostname);
  assert.ok(cleanDomain('דוגמה.co.il').startsWith('xn--'));
  for (const bad of ['a b.com', 'exa_mple.com', '*.evil.com', '..', '"><script>']) {
    assert.equal(cleanDomain(bad).includes(' ') || /[^a-z0-9.-]/.test(cleanDomain(bad)), false, bad);
  }
  assert.equal(cleanDomain('exa_mple.com'), '');
  assert.equal(cleanDomain('bad domain.com'), '', 'inner spaces reject the entry instead of truncating it');
  assert.equal(cleanDomain('  youtube.com  '), 'youtube.com');
});

test('blocklist: one redirect rule with cleaned, de-duplicated domains', () => {
  const [r, ...rest] = buildRules('blocklist', ['youtube.com', 'https://www.youtube.com/', 'reddit.com', '']);
  assert.equal(rest.length, 0);
  assert.equal(r.id, RULE_ID);
  assert.deepEqual(r.condition.requestDomains, ['youtube.com', 'reddit.com']);
  assert.deepEqual(r.condition.resourceTypes, ['main_frame']);
  assert.equal(r.action.redirect.extensionPath, '/blocked.html');
});

test('blocklist: empty list produces no rules', () => {
  assert.deepEqual(buildRules('blocklist', ['', ' ']), []);
});

test('allowlist: blocks all http(s) except the listed domains', () => {
  const [r] = buildRules('allowlist', ['linkedin.com']);
  assert.equal(r.condition.urlFilter, '|http');
  assert.deepEqual(r.condition.excludedRequestDomains, ['linkedin.com']);
  assert.equal(r.condition.requestDomains, undefined);
});

test('allowlist: empty list omits excludedRequestDomains (Chrome rejects [])', () => {
  const [r] = buildRules('allowlist', []);
  assert.equal('excludedRequestDomains' in r.condition, false);
});
