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

export interface GoalSummary { done: number; goal: number; streak: number; streakText: string }

export function goalSummary(history: Record<string, number>, goal: number, today = new Date()): GoalSummary {
  const done = history[dayKey(today)] ?? 0;
  const s = streak(history, goal, today);
  const streakText = s ? `${s}-day streak${done >= goal ? ', goal met today' : ', keep it going today'}` : 'Hit your goal today to start a streak';
  return { done, goal, streak: s, streakText };
}
