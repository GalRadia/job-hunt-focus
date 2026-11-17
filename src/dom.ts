import { goalSummary } from './streak.js';

/** Tiny element builder. Text goes through textContent, so page titles can't inject HTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function minutesLeft(endsAt: number): number {
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 60000));
}

/** ms -> "mm:ss" */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Fills #goal-count, #pips and #streak (shared by popup and blocked page). */
export function renderGoal(history: Record<string, number>, goal: number): void {
  const g = goalSummary(history, goal);
  $('goal-count').textContent = `${g.done} of ${g.goal}`;
  $('pips').replaceChildren(
    ...Array.from({ length: Math.max(g.goal, g.done) }, (_, i) =>
      el('span', { className: i < g.done ? (i < g.goal ? 'pip on' : 'pip extra') : 'pip' })),
  );
  $('pips').setAttribute('aria-label', `${g.done} of ${g.goal} done today`);
  $('streak').textContent = g.streakText;
}
