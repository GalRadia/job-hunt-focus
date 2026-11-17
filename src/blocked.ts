import { get } from './storage.js';
import { el, $, minutesLeft, renderGoal } from './dom.js';

const LINES = [
  'The job you want is on the other side of this session.',
  'One more application beats one more scroll.',
  'Future you will thank you for this.',
  'Small steps every day. Back to it.',
  'You blocked this for a reason.',
];

async function render() {
  const [t, todos, history, s] = await Promise.all([get('timer'), get('todos'), get('history'), get('settings')]);
  $('line').textContent = LINES[Math.floor(Math.random() * LINES.length)];
  const m = minutesLeft(t.endsAt);
  $('left').textContent = t.phase === 'focus' ? `${m} minute${m === 1 ? '' : 's'} left in this focus session.` : 'Your focus session has ended. Reload the page to continue.';
  renderGoal(history, s.dailyGoal);
  const open = todos.filter((x) => !x.done).slice(0, 5);
  $('todos').replaceChildren(
    ...(open.length
      ? open.map((x) => el('li', {}, x.url ? el('a', { href: x.url, textContent: x.text }) : x.text))
      : [el('li', { textContent: 'Nothing queued. Pick a job posting and start an application.' })]),
  );
}

render();
