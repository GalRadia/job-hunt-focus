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

// [pattern, suggestion]. Boundaries use lookarounds because \b doesn't work next to "#", "+" or ".".
const SKILLS: [RegExp, string][] = [
  [/python|django|flask|fastapi/i, 'Learn Python'],
  [/(?<![\w.])java(?![\w#+])(?!script)/i, 'Learn Java'],
  [/typescript|(?<![\w.])ts(?!\w)/i, 'Learn TypeScript'],
  [/javascript|(?<![\w.])js(?!\w)/i, 'Practice JavaScript'],
  [/react(?!ive)/i, 'Practice React'],
  [/angular/i, 'Practice Angular'],
  [/(?<!\w)vue/i, 'Practice Vue'],
  [/node(\.js|js)?(?!\w)/i, 'Practice Node.js'],
  [/(?<![\w.])(go|golang)(?![\w#+])/i, 'Learn Go'],
  [/c#|\.net|dotnet/i, 'Learn C# and .NET'],
  [/c\+\+/i, 'Practice C++'],
  [/(?<![\w.])rust(?!\w)/i, 'Learn Rust'],
  [/kotlin|android/i, 'Learn Kotlin and Android'],
  [/swift|(?<!\w)ios(?!\w)/i, 'Learn Swift and iOS'],
  [/sql|postgres|mysql|database/i, 'Practice SQL'],
  [/(?<!\w)aws(?!\w)/i, 'Learn AWS basics'],
  [/azure/i, 'Learn Azure basics'],
  [/(?<!\w)gcp(?!\w)|google cloud/i, 'Learn Google Cloud basics'],
  [/docker|container/i, 'Practice Docker'],
  [/kubernetes|(?<!\w)k8s(?!\w)/i, 'Learn Kubernetes'],
  [/linux/i, 'Practice Linux'],
  [/devops|(?<!\w)sre(?!\w)|ci\/cd/i, 'Practice CI/CD'],
  [/machine learning|(?<!\w)ml(?!\w)|(?<!\w)ai(?!\w)|deep learning/i, 'Review machine learning basics'],
  [/data (scien|analy|engineer)|analyst/i, 'Practice data analysis'],
  [/(?<!\w)qa(?!\w)|(?<!\w)test(ing|er)?(?!\w)|automation/i, 'Practice test automation'],
  [/figma|(?<!\w)ux(?!\w)|ui designer|product designer/i, 'Polish your design portfolio'],
  [/product manager|(?<!\w)pm(?!\w)/i, 'Prepare product case studies'],
  [/frontend|front-end|front end/i, 'Practice frontend interview questions'],
  [/backend|back-end|back end/i, 'Practice system design'],
  [/full ?stack|full-stack/i, 'Build a small full-stack project'],
];

/** Learning todos suggested by a role title, e.g. "Python Developer" -> ["Learn Python"]. Max 3. */
export function skillTodos(title: string): string[] {
  return [...new Set(SKILLS.filter(([r]) => r.test(title)).map(([, s]) => s))].slice(0, 3);
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
