# Chrome Web Store listing

Copy these into the Developer Dashboard (https://chrome.google.com/webstore/devconsole).

## Store listing tab

**Name:** Job Hunt Focus

**Summary** (max 132 characters):
> Stay focused while job hunting: block distracting sites, run Pomodoro sessions, track applications and keep a daily streak.

**Category:** Productivity → Workflow & Planning

**Language:** English

**Description:**
> Job hunting takes focus. Job Hunt Focus keeps the distractions away and your applications moving.
>
> FOCUS SESSIONS
> Start a Pomodoro session and distracting sites are blocked until your break. Choose between blocking a list of sites or allowing only job-search sites like LinkedIn, Indeed, Glassdoor and Gmail. A countdown shows on the toolbar icon.
>
> APPLICATION TRACKER
> Every position in one table, from Saved to Applied, Interview, Offer, Rejected or Closed. Save a posting in one click from the popup or the right-click menu, or import the spreadsheet you already keep (CSV from Excel or Google Sheets, with English or Hebrew column names). Export back to CSV at any time.
>
> KNOW WHEN A POSTING CLOSES
> Postings you choose to watch are checked in the background. When one is taken down, it's marked Closed and you get a notification.
>
> DAILY GOAL AND STREAK
> Set how many tasks or applications you want to finish each day. Every position you move to Applied counts. Your progress and streak are always visible in the popup.
>
> TAB SESSIONS
> Save a window full of job-search tabs as a named session and reopen it later in one click.
>
> PRIVATE BY DESIGN
> Everything stays on your device. No accounts, no tracking, no data sent anywhere.

**Screenshots** (1280×800): upload `store/screenshots/1-focus.png` to `5-jobs.png` in order.

**Icon:** `extension/icon.png` (128×128)

## Privacy practices tab

**Single purpose:**
> Help job seekers stay focused and organized: block distracting websites during timed focus sessions, and track job applications with a daily goal.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `declarativeNetRequest` | Redirects user-chosen distracting sites to the extension's focus page, only while a focus session the user started is running. |
| Host permission `<all_urls>` | Needed so the blocking rule can redirect any site the user adds to their block list, or every site except their allow list. Also used to load job postings the user chose to watch (from any job board or company site), without cookies, to detect when a posting is taken down. |
| `tabs` | Reads the current tab's title and URL when the user clicks "Save this tab as a job", and the URLs of open tabs when the user saves a tab session. |
| `storage` | Stores the user's to-dos, tracked positions, sessions, settings and daily counts locally on the device. |
| `alarms` | Ends focus sessions and breaks on time, updates the toolbar countdown, and schedules the periodic posting checks. |
| `notifications` | Tells the user when a focus session or break ends, or when a watched posting closes. |
| `contextMenus` | Adds "Save job to tracker" to the page right-click menu. |

**Remote code:** No, I am not using remote code. (All scripts and the font are packaged with the extension.)

**Data usage:** check none of the data types. The extension collects no user data; everything stays in `chrome.storage.local`. Posting checks only load public posting pages the user chose to watch and store just the result (open or closed).
Certify the three disclosures (no selling, no unrelated use, no creditworthiness use).

**Privacy policy URL:** a public link to `PRIVACY.md`, e.g. `https://github.com/GalRadia/job-hunt-focus/blob/master/PRIVACY.md` once the repo is public.

## Package

Upload `job-hunt-focus.zip`: download it from the latest CI run's artifacts, or build it locally:

```powershell
npm run build
Compress-Archive -Path extension\* -DestinationPath job-hunt-focus.zip -Force
```

Bump `version` in `extension/manifest.json` before every new upload.
