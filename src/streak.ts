/** Local-time YYYY-MM-DD. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Consecutive days meeting the goal, ending today (or yesterday if today isn't met yet). */
export function streak(history: Record<string, number>, goal: number, today: Date): number {
  if (goal < 1) return 0;
  const d = new Date(today);
  if ((history[dayKey(d)] ?? 0) < goal) d.setDate(d.getDate() - 1);
  let n = 0;
  while ((history[dayKey(d)] ?? 0) >= goal) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function goalText(history: Record<string, number>, goal: number, today = new Date()): string {
  const s = streak(history, goal, today);
  return `${history[dayKey(today)] ?? 0}/${goal} done today` + (s ? ` · 🔥 ${s}-day streak` : '');
}
