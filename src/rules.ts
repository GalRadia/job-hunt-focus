import type { Mode } from './types.js';

export const RULE_ID = 1;

/** "https://www.YouTube.com/watch?v=1" -> "youtube.com"; non-English names become punycode; invalid -> "".
 *  Chrome rejects the whole blocking rule if a single domain is malformed, so this must never pass junk. */
export function cleanDomain(input: string): string {
  // No \s in the split: "bad domain.com" must be rejected, not truncated to "bad" (which would block a different site).
  const raw = input.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#:]/)[0];
  if (!raw) return '';
  try {
    const host = new URL(`http://${raw}`).hostname; // IDN -> punycode, validates characters
    return /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host) && host.length <= 253 ? host : '';
  } catch {
    return '';
  }
}

export function buildRules(mode: Mode, domains: string[]): chrome.declarativeNetRequest.Rule[] {
  const list = [...new Set(domains.map(cleanDomain).filter(Boolean))];
  const action = { type: 'redirect', redirect: { extensionPath: '/blocked.html' } } as const;

  if (mode === 'blocklist') {
    if (!list.length) return []; // an empty requestDomains array is rejected by Chrome
    return [{ id: RULE_ID, priority: 1, action, condition: { requestDomains: list, resourceTypes: ['main_frame'] } }];
  }
  return [{
    id: RULE_ID,
    priority: 1,
    action,
    condition: {
      urlFilter: '|http',
      resourceTypes: ['main_frame'],
      ...(list.length ? { excludedRequestDomains: list } : {}),
    },
  }];
}
