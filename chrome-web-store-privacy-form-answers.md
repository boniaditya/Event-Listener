# Chrome Web Store Privacy Form Answers For EVENTLISTENER

Use these answers for the Chrome Web Store privacy and permission justification form.

Important: In the screenshot, "Yes, I am using remote code" is selected. Based on the current extension package, select **No, I am not using remote code** instead. All scripts appear to be local packaged files, and no remote JavaScript or Wasm is loaded.

## Single Purpose Description

EVENTLISTENER monitors browser tabs that the user chooses to arm and runs user-configured actions when selected tab or page conditions are met. Users can monitor signals such as URL, title, loading state, audio activity, clicks, scrolling, keyboard activity, page visibility, and DOM changes. When a rule fires, the extension can play an alarm, show a notification, run an in-page shortcut, attempt to stop a tracked screen share, close the tab, or disarm monitoring.

## alarms Justification

The alarms permission is used to schedule time-based monitoring conditions and cooldowns for armed tabs. This supports rules such as loading too long, audio active too long, audio silent too long, and inactivity timers. It lets EVENTLISTENER trigger the user's configured actions at the correct time even when the popup or dashboard is closed.

## notifications Justification

The notifications permission is used only to show a Chrome notification when a user-configured monitoring rule fires. Notifications help alert the user that a selected tab or page condition was matched and include a short description of the event so the user understands why the alert appeared.

## offscreen Justification

The offscreen permission is used to create an offscreen document for alarm audio playback. Manifest V3 service workers cannot reliably play audio directly, so EVENTLISTENER uses an offscreen document only to generate and stop local alarm sounds when the user tests an alarm or when a configured monitoring rule fires.

## scripting Justification

The scripting permission is used to inject packaged extension scripts into monitorable tabs so EVENTLISTENER can synchronize monitoring state and support user-enabled page actions. These local scripts listen for selected page events, such as clicks, scrolling, keyboard activity, visibility changes, and DOM changes, and can run configured actions such as in-page shortcut execution or screen-share stop attempts. No remote scripts are injected.

## storage Justification

The storage permission is used to save the user's settings locally, including event selections, rule conditions, rule templates, trigger actions, alarm sound choice, cooldown settings, shortcut settings, armed tab sessions, and last alarm state. This lets the popup and dashboard restore the user's configuration across browser sessions.

## tabs Justification

The tabs permission is used to identify the current tab, arm and disarm monitored tabs, read tab URL, title, loading, and audible status for configured rules, update the extension badge, open the dashboard, focus monitored tabs, and close a tab only when the user enables the close-tab action.

## Host Permission Justification

Host permission is required because EVENTLISTENER's single purpose is to monitor tabs and page activity on websites the user chooses to arm. The extension must support normal web pages across different sites, so packaged content scripts may load on monitorable pages and remain inactive for rule evaluation unless monitoring is enabled for that tab. Access is used to observe configured signals such as clicks, scrolling, keyboard activity, visibility, DOM changes, URL/title state, and to perform user-enabled page actions such as in-page shortcuts or screen-share stop attempts.

## Remote Code Question

Select:

No, I am not using remote code

## Remote Code Justification

Not needed if "No" is selected.

If the form still asks for a note, use:

EVENTLISTENER does not use remote code. All JavaScript, HTML, CSS, icons, and audio-generation logic are included in the extension package. The extension does not load remote scripts, remote Wasm, external modules, or code strings evaluated through eval.

## Optional User Data / Privacy Summary

EVENTLISTENER does not sell user data. The extension stores settings locally using Chrome extension storage, including rules, preferences, selected actions, alarm settings, shortcut settings, and armed tab state. The extension does not require an account and does not transmit browsing data to the developer's server.

## Data Usage Checklist

For the "What user data do you plan to collect from users now or in the future?" screen, select:

- Web history
- User activity

Leave these unchecked unless the extension is changed to collect them:

- Personally identifiable information
- Health information
- Financial and payment information
- Authentication information
- Personal communications
- Location
- Website content

Reasoning:

EVENTLISTENER monitors tabs that the user chooses to arm. It stores URL/title information for monitored tabs and rule events, so "Web history" is the accurate Chrome Web Store disclosure even though the extension does not collect the user's full browser history. It also monitors user/page activity such as clicks, scroll activity, keyboard activity timing, visibility, and DOM-change counts, so "User activity" should be selected.

Do not select "Website content" for the current code because the extension does not collect page text, images, sounds, videos, hyperlinks, screenshots, form contents, emails, or chat messages. It observes DOM-change counts and page state for rule matching, but does not store or transmit actual page content.

## Web History Follow-Up Answers

Purpose:

Extension functionality

Disclosure text:

EVENTLISTENER uses URL, page title, tab status, audible state, and event timing for tabs the user chooses to arm. This information is used only to determine whether the user's configured monitoring rules have matched and to show the monitored tab state in the popup and dashboard.

Data handling:

The data is stored locally using Chrome extension storage. It is not sold, not used for advertising, not transferred to third parties, and not transmitted to the developer's server.

## User Activity Follow-Up Answers

Purpose:

Extension functionality

Disclosure text:

EVENTLISTENER observes user activity and page activity on tabs the user chooses to arm, including click events, scroll activity, keyboard activity timing, visibility state, and DOM-change counts. This activity is used only to evaluate the user's configured monitoring rules and trigger the selected actions, such as alarms, notifications, shortcuts, tab close, screen-share stop attempts, or disarming.

Data handling:

The data is processed locally in the browser and stored locally only as needed for rule state, armed-tab state, cooldowns, and last-event information. It is not sold, not used for advertising, not transferred to third parties, and not transmitted to the developer's server.

## Limited Use Certification

If the dashboard asks for limited-use certification, select the options confirming that:

- The data is used only for the extension's single purpose and user-facing features.
- The data is not sold.
- The data is not used or transferred for personalized advertising.
- The data is not used for creditworthiness or lending purposes.
- The data is not transferred except as necessary to provide or improve the extension, comply with law, or handle security/abuse.
- Humans do not read user data except with user consent for support, for security, to comply with law, or as aggregated/anonymized internal operations.
