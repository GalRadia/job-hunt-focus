export type Mode = 'blocklist' | 'allowlist';
export type Phase = 'idle' | 'focus' | 'break';

export type Status = 'saved' | 'applied' | 'interview' | 'offer' | 'rejected' | 'closed';
export const STATUSES: Status[] = ['saved', 'applied', 'interview', 'offer', 'rejected', 'closed'];
export const STATUS_LABEL: Record<Status, string> = {
  saved: 'Saved', applied: 'Applied', interview: 'Interview', offer: 'Offer', rejected: 'Rejected', closed: 'Closed',
};

export interface Signal { at: number; source: 'page' | 'email' | 'import' | 'manual'; text: string; unseen: boolean }

export interface Position {
  id: string;
  company: string;
  title: string;
  url?: string;
  status: Status;
  /** kept as written in the imported sheet */
  appliedOn?: string;
  notes?: string;
  updatedAt: number;
  /** check the posting page in the background */
  watch: boolean;
  lastChecked?: number;
  checkError?: string;
  /** newest first, max 10 */
  signals: Signal[];
}

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
  watchEveryMin: number;
}

export interface Store {
  settings: Settings;
  timer: Timer;
  todos: Todo[];
  sessions: Session[];
  positions: Position[];
  /** completed todos + positions moved to Applied, per local day, key YYYY-MM-DD */
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
    watchEveryMin: 180,
  },
  timer: { phase: 'idle', endsAt: 0 },
  todos: [],
  sessions: [],
  positions: [],
  history: {},
};
