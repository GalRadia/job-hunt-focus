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
