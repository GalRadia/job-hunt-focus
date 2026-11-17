# Job Hunt Focus

A Chrome extension (Manifest V3, TypeScript) that keeps you focused while job hunting.

<!-- TODO: add a screenshot / GIF of the popup here -->

## Features
- **Pomodoro focus sessions**: focus and break timer with a countdown on the toolbar badge and a notification when each phase ends.
- **Site blocker**, active only during focus:
  - *Blocklist mode*: block distracting sites (YouTube, Reddit, …).
  - *Job-search allowlist mode*: block everything except job sites (LinkedIn, Indeed, Gmail, Docs, …).
  - A blocked visit opens a page showing a motivation line and your next todos.
- **Todo list**, plus **"Save job as todo"** from the popup or the right-click menu. It turns the current posting into `Apply: <title>` with its link.
- **Daily goal and streak**: counts completed todos per day, e.g. `3/5 done today · 🔥 4-day streak`.
- **Tab sessions**: save the current window's tabs under a name and restore them later in one click.

## Tech
- MV3 service worker
- `declarativeNetRequest` dynamic rules
- `chrome.alarms`, `chrome.storage`, `contextMenus`, `notifications`
- TypeScript compiled by `tsc` (no bundler)
- Unit tests with `node:test`

## Develop
```sh
npm install
npm run build      # or: npm run watch
npm test           # builds, then runs unit tests
```
To load the extension:
1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick the `extension/` folder.
3. After a rebuild, click the reload button on the extension card.

## Project layout
- `src/`: TypeScript sources.
  - `rules.ts` and `streak.ts` are pure and unit-tested.
  - `background.ts` is the service worker.
- `extension/`: manifest, HTML, CSS and icon. `extension/js/` holds the build output.
- `test/`: unit tests.
