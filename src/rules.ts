import type { Mode } from './types.js';

export const RULE_ID = 1;

/** "https://www.YouTube.com/watch?v=1" -> "youtube.com" */
export function cleanDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#:]/)[0];
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
