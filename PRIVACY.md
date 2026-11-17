# Privacy Policy for Job Hunt Focus

_Last updated: November 17, 2026 (version 0.2)_

Job Hunt Focus does not collect, transmit, sell or share any personal data.

## What the extension stores

Everything the extension saves stays in your browser's local extension storage (`chrome.storage.local`) on your own device:

- your to-do items
- the positions in your application tracker: company, role, status, posting address, dates and notes, whether you saved them from a page, added them by hand or imported them from a CSV file
- saved tab sessions (the addresses of tabs in a window you choose to save)
- your settings: site lists, timer durations, daily goal and posting-check interval
- a count of completed to-dos and applications per day, used for the daily goal and streak

None of this data is sent to the developer or to any other server. The extension contains no analytics or tracking.

## Network requests

The only network requests the extension makes are **posting checks**. For positions where you've turned on "Watch", the extension periodically loads that posting's address directly from your browser, without your cookies. It does this to see whether the posting has been taken down. The page is read only to look for closing phrases (such as "no longer accepting applications"), and nothing from it is stored except the result. You can turn this off for any position.

## Permissions

- **tabs**: reads the title and address of the current tab when you save a job or a tab session.
- **declarativeNetRequest** and **host access to all sites**: redirect blocked sites to the extension's focus page during a focus session (matched by domain only, without reading the page), and load the postings you watch for posting checks.
- **notifications**: also used to tell you when a watched posting closes.
- **storage**: saves the data listed above on your device.
- **alarms** and **notifications**: run the focus timer and tell you when a session or break ends.
- **contextMenus**: adds "Save job as todo" to the right-click menu.

## Deleting your data

Remove items in the extension at any time, or export your tracker to CSV first. Uninstalling the extension deletes all of its stored data.

## Contact

Questions about this policy: open an issue on the project's GitHub repository.
