export type Mode = 'blocklist' | 'allowlist';
export type Phase = 'idle' | 'focus' | 'break';

export interface Todo { id: string; text: string; url?: string; done: boolean; doneAt?: number }
export interface Session { id: string; name: string; urls: string[]; savedAt: number }
export interface Timer { phase: Phase; endsAt: number }
export interface Settings {
  mode: Mode;
  blocklist: string[];
  allowlist: string[];
  focusMin: number;
  breakMin: number;
  dailyGoal: number;
}

export interface Store {
  settings: Settings;
  timer: Timer;
  todos: Todo[];
  sessions: Session[];
  /** completed todos per local day, key YYYY-MM-DD */
  history: Record<string, number>;
}

export const DEFAULTS: Store = {
  settings: {
    mode: 'blocklist',
    blocklist: ['youtube.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'x.com', 'reddit.com', 'netflix.com'],
    allowlist: [
      'linkedin.com', 'indeed.com', 'glassdoor.com', 'github.com',
      'mail.google.com', 'docs.google.com', 'drive.google.com', 'calendar.google.com',
    ],
    focusMin: 25,
    breakMin: 5,
    dailyGoal: 5,
  },
  timer: { phase: 'idle', endsAt: 0 },
  todos: [],
  sessions: [],
  history: {},
};
