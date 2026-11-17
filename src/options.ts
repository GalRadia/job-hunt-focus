import { get, set } from './storage.js';
import { cleanDomain } from './rules.js';
import { $ } from './dom.js';

const lines = (id: string) => [...new Set($<HTMLTextAreaElement>(id).value.split('\n').map(cleanDomain).filter(Boolean))];
const num = (id: string, min = 1) => Math.max(min, Math.round(Number($<HTMLInputElement>(id).value)) || min);

async function load() {
  const s = await get('settings');
  $<HTMLTextAreaElement>('blocklist').value = s.blocklist.join('\n');
  $<HTMLTextAreaElement>('allowlist').value = s.allowlist.join('\n');
  $<HTMLInputElement>('focusMin').value = String(s.focusMin);
  $<HTMLInputElement>('breakMin').value = String(s.breakMin);
  $<HTMLInputElement>('dailyGoal').value = String(s.dailyGoal);
  $<HTMLInputElement>('watchEveryMin').value = String(s.watchEveryMin);
}

$<HTMLFormElement>('form').onsubmit = async (e) => {
  e.preventDefault();
  const s = await get('settings');
  await set('settings', {
    ...s,
    blocklist: lines('blocklist'),
    allowlist: lines('allowlist'),
    focusMin: num('focusMin'),
    breakMin: num('breakMin'),
    dailyGoal: num('dailyGoal'),
    watchEveryMin: num('watchEveryMin', 30),
  });
  await load(); // show the cleaned-up domains
  $('saved').hidden = false;
  setTimeout(() => ($('saved').hidden = true), 1500);
};

load();
