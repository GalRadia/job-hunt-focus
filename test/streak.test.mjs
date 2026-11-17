import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, streak, goalText } from '../extension/js/streak.js';

const today = new Date(2026, 10, 17); // Nov 17 2026, local time
const h = (counts) => Object.fromEntries(counts.map(([day, n]) => [dayKey(new Date(2026, 10, day)), n]));

test('dayKey is local YYYY-MM-DD', () => {
  assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('counts consecutive days including today when met', () => {
  assert.equal(streak(h([[17, 5], [16, 6], [15, 5], [14, 1]]), 5, today), 3);
});

test('today not met yet: streak continues from yesterday', () => {
  assert.equal(streak(h([[17, 2], [16, 5], [15, 5]]), 5, today), 2);
});

test('gap breaks the streak', () => {
  assert.equal(streak(h([[17, 5], [15, 5]]), 5, today), 1);
});

test('crosses month boundaries', () => {
  const hist = { '2026-11-01': 3, '2026-10-31': 3 };
  assert.equal(streak(hist, 3, new Date(2026, 10, 1)), 2);
});

test('goal < 1 returns 0 instead of looping forever', () => {
  assert.equal(streak({}, 0, today), 0);
});

test('goalText', () => {
  assert.equal(goalText(h([[17, 3]]), 5, today), '3/5 done today');
  assert.equal(goalText(h([[17, 5], [16, 5]]), 5, today), '5/5 done today · 🔥 2-day streak');
});
