import type { Position, Signal, Status } from './types.js';

export function newSignal(source: Signal['source'], text: string, unseen = false): Signal {
  return { at: Date.now(), source, text, unseen };
}

export function newPosition(fields: Partial<Position> & Pick<Position, 'company' | 'title'>): Position {
  return { id: crypto.randomUUID(), status: 'saved', watch: true, signals: [], updatedAt: Date.now(), ...fields };
}

/** Only http(s) links are kept: they end up in hrefs and background fetches. */
export function safeUrl(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t && /^https?:\/\/\S+$/i.test(t) ? t : undefined;
}

const SITE = /^(linkedin|indeed(\.com)?|glassdoor|greenhouse|lever|workday|comeet|ashby|alljobs|drushim|careers?|jobs?|job board)$/i;

/** "Senior Frontend Engineer | Wix | LinkedIn" -> { title: 'Senior Frontend Engineer', company: 'Wix' } */
export function parseJobTitle(tabTitle: string): { title: string; company: string } {
  const t = tabTitle.replace(/^\(\d+\)\s*/, '').trim(); // "(3) " unread counter
  const hiring = t.match(/^(.+?) hiring (.+?)(?: in .+?)?(?:\s+[|\-–—]\s+.*)?$/i); // LinkedIn: "Wix hiring X in Tel Aviv | LinkedIn"
  if (hiring) return { company: hiring[1].trim(), title: hiring[2].trim() };
  const parts = t.split(/\s+[|\-–—]\s+/).map((p) => p.trim()).filter((p, i) => p && (i === 0 || !SITE.test(p)));
  const at = parts[0]?.match(/^(.+?)\s+at\s+(.+)$/i);
  if (at) return { title: at[1].trim(), company: at[2].trim() };
  return { title: parts[0] ?? '', company: parts[1] ?? '' };
}

const CLOSED = [
  /no longer accepting applications/i,
  /(job|position|posting|role) (is )?no longer (available|open|active)/i,
  /position has been filled/i,
  /(job|posting) (has )?expired/i,
  /(job|posting|position) (is|has been) closed/i,
  /applications? (are|is) (now )?closed/i,
];

export function isClosed(httpStatus: number, lines: string[]): boolean {
  if (httpStatus === 404 || httpStatus === 410) return true;
  const text = lines.join('\n');
  return CLOSED.some((r) => r.test(text));
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== '#') return NAMED[e.toLowerCase()] ?? m;
    const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
  });
}

const BLOCK = /<\/?(?:br|p|div|li|ul|ol|h[1-6]|tr|td|th|table|section|article|header|footer|main|nav|aside|dt|dd|blockquote|pre|form|label|option|button)\b[^>]*>/gi;

/** Visible text of an HTML page as de-duplicated, whitespace-collapsed lines (max 3000 x 300 chars). */
export function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|head|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(BLOCK, '\n')
    .replace(/<[^>]+>/g, ' ');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of decodeEntities(text).split('\n')) {
    const line = raw.replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!line || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= 3000) break;
  }
  return out;
}

const STATUS_WORDS: [Status, RegExp][] = [
  ['offer', /offer|הצעה/i],
  ['rejected', /reject|declin|turned down|not (selected|moving)|^no$|נדח|דחי|לא התקבל/i],
  ['closed', /closed|filled|expired|נסגר/i],
  ['interview', /interview|screen|\bcall\b|\bhr\b|assignment|ראיון|שיחה|מבחן|מטלה/i],
  ['saved', /save|wish|to apply|interest|שמור/i], // before "applied": "Want to apply" contains "appl"
  ['applied', /appl|sent|submit|נשלח|הוגש|הגשתי/i],
];

/** Free-text status from a spreadsheet ("Phone screen", "נדחה") -> Status, or undefined if unrecognized. */
export function statusFromText(s: string): Status | undefined {
  const t = s.trim();
  if (!t) return undefined;
  return STATUS_WORDS.find(([, r]) => r.test(t))?.[0];
}
