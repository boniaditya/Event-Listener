import test from "node:test";
import assert from "node:assert/strict";

import {
  ALARM_SOUND_DEFINITIONS,
  DEFAULT_EVENT_CONDITIONS,
  DEFAULT_EVENT_SELECTIONS,
  DEFAULT_TRIGGER_ACTIONS,
  DEFAULT_TRIGGER_ACTION_SETTINGS,
  EVENT_DEFINITIONS,
  TRIGGER_ACTIONS,
  buildAlarmRecord,
  describeAlarm,
  describeTriggerActions,
  normalizeEventConditions,
  normalizeEventSelections,
  normalizeSettings,
  normalizeTriggerActionSettings,
  normalizeTriggerActions,
  sanitizeTabSession
} from "../src/monitoring.js";

test("normalizeEventSelections fills in every defined event key", () => {
  const selections = normalizeEventSelections({
    audio: false,
    click: true
  });

  assert.equal(selections.audio, false);
  assert.equal(selections.click, true);
  assert.deepEqual(Object.keys(selections).sort(), Object.keys(DEFAULT_EVENT_SELECTIONS).sort());
});

test("normalizeEventConditions fills in every defined condition and keeps defaults off", () => {
  const conditions = normalizeEventConditions({
    audio: {
      silentForMinutes: {
        enabled: true,
        values: {
          minutes: 9
        }
      }
    }
  });

  assert.equal(conditions.audio.silentForMinutes.enabled, true);
  assert.equal(conditions.audio.silentForMinutes.values.minutes, 9);
  assert.equal(conditions.click.idleForMinutes.enabled, false);
  assert.deepEqual(Object.keys(conditions).sort(), Object.keys(DEFAULT_EVENT_CONDITIONS).sort());
});

test("normalizeTriggerActions supports multiple actions and fills missing keys", () => {
  const actions = normalizeTriggerActions({
    close: true,
    disarm: true,
    notification: false,
    siren: false
  });

  assert.equal(actions.close, true);
  assert.equal(actions.disarm, true);
  assert.equal(actions.notification, false);
  assert.equal(actions.siren, false);
  assert.equal(actions.shortcut, false);
  assert.equal(actions.stopSharing, false);
  assert.deepEqual(Object.keys(actions).sort(), Object.keys(DEFAULT_TRIGGER_ACTIONS).sort());
});

test("normalizeTriggerActionSettings fills in configurable action fields", () => {
  const actionSettings = normalizeTriggerActionSettings({
    shortcut: {
      accelerator: "Ctrl+Shift+K"
    }
  });

  assert.equal(actionSettings.shortcut.accelerator, "Ctrl+Shift+K");
  assert.equal(actionSettings.siren.soundKey, "ambulance");
  assert.deepEqual(
    Object.keys(actionSettings).sort(),
    Object.keys(DEFAULT_TRIGGER_ACTION_SETTINGS).sort()
  );
});

test("alarm sound library exposes a broad preset list", () => {
  assert.ok(ALARM_SOUND_DEFINITIONS.length >= 20);
  assert.ok(ALARM_SOUND_DEFINITIONS.some((definition) => definition.key === "airhorn"));
  assert.ok(ALARM_SOUND_DEFINITIONS.some((definition) => definition.key === "tremor"));
});

test("sanitizeTabSession keeps event bookkeeping, runtime state, conditions, and actions stable", () => {
  const session = sanitizeTabSession({
    eventConditions: {
      audio: {
        activeForMinutes: {
          enabled: true,
          values: {
            minutes: 15
          }
        }
      }
    },
    eventSelections: {
      click: false
    },
    title: "Sample tab",
    triggerActions: {
      close: true,
      disarm: false,
      notification: true,
      shortcut: true,
      siren: true
    },
    triggerActionSettings: {
      siren: {
        soundKey: "beacon"
      },
      shortcut: {
        accelerator: "Ctrl+Shift+Y"
      }
    },
    url: "https://example.com"
  });

  assert.equal(session.title, "Sample tab");
  assert.equal(session.url, "https://example.com");
  assert.equal(session.eventSelections.click, false);
  assert.equal(session.eventConditions.audio.activeForMinutes.enabled, true);
  assert.equal(session.eventConditions.audio.activeForMinutes.values.minutes, 15);
  assert.equal(session.triggerActions.close, true);
  assert.equal(session.triggerActions.notification, true);
  assert.equal(session.triggerActions.shortcut, true);
  assert.equal(session.triggerActionSettings.siren.soundKey, "beacon");
  assert.equal(session.triggerActionSettings.shortcut.accelerator, "Ctrl+Shift+Y");
  assert.equal(typeof session.lastTriggeredAtByCategory.click, "number");
  assert.equal(typeof session.runtime.audio.silentSince, "number");
});

test("normalizeSettings preserves monitored tab sessions and default actions", () => {
  const settings = normalizeSettings({
    defaultEventConditions: {
      audio: {
        silentForMinutes: {
          enabled: true,
          values: {
            minutes: 12
          }
        }
      }
    },
    defaultEventSelections: {
      audio: true
    },
    defaultTriggerActions: {
      close: true,
      disarm: false,
      notification: false,
      shortcut: true,
      siren: true
    },
    defaultTriggerActionSettings: {
      siren: {
        soundKey: "sonar"
      },
      shortcut: {
        accelerator: "Ctrl+Shift+K"
      }
    },
    monitoredTabs: {
      12: {
        title: "Legacy tab"
      }
    },
    schemaVersion: 5
  });

  assert.equal(settings.monitoredTabs["12"].title, "Legacy tab");
  assert.equal(settings.defaultEventSelections.audio, true);
  assert.equal(settings.defaultEventConditions.audio.silentForMinutes.enabled, true);
  assert.equal(settings.defaultEventConditions.audio.silentForMinutes.values.minutes, 12);
  assert.equal(settings.defaultTriggerActions.close, true);
  assert.equal(settings.defaultTriggerActions.siren, true);
  assert.equal(settings.defaultTriggerActions.shortcut, true);
  assert.equal(settings.defaultTriggerActionSettings.siren.soundKey, "sonar");
  assert.equal(settings.defaultTriggerActionSettings.shortcut.accelerator, "Ctrl+Shift+K");
});

test("normalizeSettings resets unsupported legacy saved defaults to current action defaults", () => {
  const settings = normalizeSettings({
    defaultEventSelections: {
      audio: true,
      click: true
    },
    monitoredTabs: {
      12: {
        title: "Legacy tab"
      }
    }
  });

  assert.equal(settings.defaultEventSelections.audio, false);
  assert.equal(settings.defaultEventConditions.audio.silentForMinutes.enabled, false);
  assert.deepEqual(settings.defaultTriggerActions, DEFAULT_TRIGGER_ACTIONS);
  assert.equal(Object.keys(settings.monitoredTabs).length, 0);
});

test("normalizeTriggerActions migrates legacy single-action values", () => {
  const closeActions = normalizeTriggerActions("close");
  const sirenActions = normalizeTriggerActions("anything-else");

  assert.equal(closeActions.close, true);
  assert.equal(closeActions.siren, false);
  assert.equal(closeActions.notification, false);
  assert.equal(sirenActions.siren, true);
  assert.equal(sirenActions.notification, true);
});

test("describeTriggerActions formats readable summaries", () => {
  assert.equal(
    describeTriggerActions({
      close: true,
      disarm: false,
      notification: true,
      siren: true
    }),
    "play alarm sound, show notification, and close tab"
  );
  assert.equal(
    describeTriggerActions({
      close: false,
      disarm: false,
      notification: false,
      siren: false
    }),
    "take no action"
  );
});

test("describeAlarm formats a readable alarm line", () => {
  const record = buildAlarmRecord({
    detail: "Muted",
    label: "Tab muted",
    tabTitle: "Inbox"
  });

  assert.equal(describeAlarm(record), "Tab muted on Inbox (Muted)");
});

test("every trigger definition includes configurable conditions", () => {
  for (const definition of EVENT_DEFINITIONS) {
    assert.ok(Array.isArray(definition.conditions));
    assert.ok(definition.conditions.length >= 2);

    for (const condition of definition.conditions) {
      assert.ok(Array.isArray(condition.fields));
      assert.ok(Array.isArray(condition.sentence));
    }
  }
});
