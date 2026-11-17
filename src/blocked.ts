import { get } from './storage.js';
import { goalText } from './streak.js';
import { el, $, minutesLeft } from './dom.js';

const LINES = [
  'The job you want is on the other side of this focus session.',
  'One more application beats one more scroll.',
  'Future you will thank you for this.',
  'Small steps every day. Back to it.',
  'You blocked this for a reason.',
];

async function render() {
  const [t, todos, history, s] = await Promise.all([get('timer'), get('todos'), get('history'), get('settings')]);
  $('line').textContent = LINES[Math.floor(Math.random() * LINES.length)];
  $('left').textContent = t.phase === 'focus' ? `${minutesLeft(t.endsAt)} min left in this focus session` : 'Focus session is over, so reload the page.';
  $('goal').textContent = goalText(history, s.dailyGoal);
  const open = todos.filter((x) => !x.done).slice(0, 5);
  $('todos').replaceChildren(
    ...(open.length
      ? open.map((x) => el('li', {}, x.url ? el('a', { href: x.url, textContent: x.text }) : x.text))
      : [el('li', { textContent: 'No open todos. Add your next application!' })]),
  );
}

render();
