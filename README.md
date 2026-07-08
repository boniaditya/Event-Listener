# EVENTLISTENER

EVENTLISTENER is a Chrome extension for monitoring live tab activity and triggering one or more automated actions when your selected rules are matched.

## Overview

EVENTLISTENER lets you arm a tab, define what kind of behavior should be watched, and decide what should happen when a rule fires. It is designed for live monitoring workflows where you want a sound, notification, shortcut, or cleanup action to run automatically when something changes on a page.

## Key Features

- Monitor multiple signal types from the same tab at the same time.
- Configure practical rule conditions instead of simple on or off triggers.
- Run more than one action when the same rule fires.
- Use saved defaults from the dashboard and apply them quickly from the popup.
- Review every armed tab from the live coverage view.
- Preview alarm sounds before using them.
- Configure shortcuts with both manual selection and keyboard capture.

## Monitored Event Groups

- `Tab activity`
  Watch URL changes, title changes, and long loading states.
- `Audio / media`
  Detect when audio stays silent too long or stays active too long.
- `Clicks`
  Detect click inactivity or click bursts within a time window.
- `Scrolling`
  Detect scroll inactivity or when the page crosses a scroll-depth threshold.
- `Keyboard`
  Detect typing inactivity or typing bursts.
- `Visibility`
  Detect when a page stays hidden or visible for too long.
- `DOM changes`
  Detect quiet periods or bursts of page mutations.

## Trigger Actions

- `Play alarm sound`
  Play the selected alarm sound in the background.
- `Show notification`
  Display a desktop notification with the alarm details.
- `Run shortcut`
  Send a configurable shortcut into the monitored page.
- `Stop screen share`
  Attempt to stop an active screen share from the monitored page.
- `Close tab`
  Close the monitored tab after the selected actions run.
- `Disarm tab`
  Stop monitoring the tab after the rule fires.

## Alarm Sound Support

- Includes a large built-in alarm sound library with options such as `Ambulance`, `Klaxon`, `Warning`, `Airhorn`, `Radar`, `Bell`, `Reactor`, and more.
- Lets you preview the selected alarm sound before saving it as part of a rule.

## Popup And Dashboard

- `Popup`
  Quickly arm or disarm the current tab, test or stop the alarm, and jump into the full dashboard.
- `Dashboard`
  Edit saved default rules, choose trigger actions, preview sounds, configure shortcuts, and review live monitored tabs.
- `Live coverage`
  Shows which tabs are currently armed and what actions and conditions are active on each one.

## Technical Notes

- Manifest version: `3`
- Minimum Chrome version: `116`
- Page-level monitoring is intended for normal web pages and file URLs.
- The shortcut action is meant for in-page shortcuts, not Chrome-level or operating-system-level shortcuts.

## Changelog

### Current branch updates

- Refined popup and dashboard visual styling.
- Lightened card icon treatments and improved readability in key UI sections.
- Fixed the dashboard alarm preview button so it no longer throws a `previewAlarmSound is not defined` runtime error.

### Version 0.4.0

- Added configurable trigger actions for `Run shortcut` and `Stop screen share`.
- Expanded the alarm sound library and added sound preview controls.
- Improved shortcut configuration with keyboard capture, manual composer controls, and clearer shortcut preview.
- Added stronger popup-to-dashboard workflow for saved defaults and live monitored tabs.
- Updated branding and packaged the extension as `EVENTLISTENER` version `0.4.0`.

### Initial release

- Introduced tab monitoring with popup controls and background rule processing.
- Added the first set of monitoring categories and siren-based alert handling.
- Added dashboard-based configuration and monitored-tab review.

## How To Use

1. Open `chrome://extensions/` in Chrome.
2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select the `Download/Event-Listener` folder.
5. Open the EVENTLISTENER popup from the Chrome toolbar.
6. Use `Open the full dashboard` to set your saved default event groups, conditions, actions, alarm sound, and shortcut behavior.
7. Return to the popup and click `Arm Current Tab` to apply those saved defaults to the active tab.
8. Leave the tab running while EVENTLISTENER watches for the selected conditions.
9. When a rule fires, EVENTLISTENER runs the actions you enabled, such as playing a sound, showing a notification, sending a shortcut, stopping sharing, closing the tab, or disarming it.
10. Open the dashboard again anytime to review live monitored tabs, focus a monitored tab, or disarm it.

## Recommended Usage Notes

- Use the dashboard first if you want to prepare rules before arming a tab.
- Use the popup when you need to arm or disarm the current tab quickly.
- Preview alarm sounds before saving them into your default rule set.
- Test shortcuts on real web pages because browser-level pages may not support injected page actions the same way.
