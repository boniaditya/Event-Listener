export const STORAGE_KEY = "eventlistener-settings";
export const SETTINGS_SCHEMA_VERSION = 6;

export const EVENT_DEFINITIONS = [
  {
    key: "tab",
    label: "Tab activity",
    description: "Watch URL changes, title changes, and how long the tab keeps loading.",
    conditions: [
      {
        key: "urlContains",
        label: "URL keyword",
        sentence: [
          "Trigger alarm if the URL changes and contains",
          { fieldKey: "keyword" },
          "."
        ],
        fields: [
          {
            key: "keyword",
            placeholder: "checkout, login, success",
            type: "text",
            defaultValue: ""
          }
        ]
      },
      {
        key: "titleContains",
        label: "Title keyword",
        sentence: [
          "Trigger alarm if the title changes and contains",
          { fieldKey: "keyword" },
          "."
        ],
        fields: [
          {
            key: "keyword",
            placeholder: "completed, error, verified",
            type: "text",
            defaultValue: ""
          }
        ]
      },
      {
        key: "loadingForMinutes",
        label: "Loading timeout",
        sentence: [
          "Trigger alarm if the page keeps loading for more than",
          { fieldKey: "minutes" },
          "minutes."
        ],
        fields: [
          {
            key: "minutes",
            max: 240,
            min: 1,
            step: 1,
            type: "number",
            defaultValue: 3
          }
        ]
      }
    ]
  },
  {
    key: "audio",
    label: "Audio / media",
    description: "Monitor audible tab state and media activity over time.",
    conditions: [
      {
        key: "silentForMinutes",
        label: "Silent timeout",
        sentence: [
          "Trigger alarm if audio is silent for more than",
          { fieldKey: "minutes" },
          "minutes."
        ],
        fields: [
          {
            key: "minutes",
            max: 240,
            min: 1,
            step: 1,
            type: "number",
            defaultValue: 5
          }
        ]
      },
      {
        key: "activeForMinutes",
        label: "Active timeout",
        sentence: [
          "Trigger alarm if audio is active for more than",
          { fieldKey: "minutes" },
          "minutes."
        ],
        fields: [
          {
            key: "minutes",
            max: 240,
            min: 1,
            step: 1,
            type: "number",
            defaultValue: 10
          }
        ]
      }
    ]
  },
  {
    key: "click",
    label: "Clicks",
    description: "Track click inactivity and click bursts inside the page.",
    conditions: [
      {
        key: "idleForMinutes",
        label: "No clicks",
        sentence: [
          "Trigger alarm if there are no clicks for more than",
          { fieldKey: "minutes" },
          "minutes."
        ],
        fields: [
          {
            key: "minutes",
            max: 240,
            min: 1,
            step: 1,
            type: "number",
            defaultValue: 5
          }
        ]
      },
      {
        key: "burst",
        label: "Click burst",
        sentence: [
          "Trigger alarm if at least",
          { fieldKey: "count" },
          "clicks happen within",
          { fieldKey: "minutes" },
          "minutes."
        ],
        fields: [
          {
            key: "count",
            max: 1000,
            min: 1,
            step: 1,
            type: "number",
            defaultValue: 3
          },
          {
            key: "minutes",
            max: 240,
            min: 1,
            step: 1,
            type: "number",
            defaultValue: 1
          }
        ]
      }
    ]
  },
  {
    key: "scroll",
    label: "Scrolling",
    description: "Track scroll inactivity and how far down the page the user goes.",
    conditions: [
      {
        key: "idleForMinutes",
        label: "No scrolling",
        sentence: [
          "Trigger alarm if scrolling stops for more than",
          { fieldKey: "minutes" },
          "minutes."
        ],
        fields: [
          {
            key: "minutes",
            max: 240,
            min: 1,
            step: 1,
            type: "number",
            defaultValue: 5
          }
        ]
      },
      {
        key: "pastPercent",
        label: "Scroll depth",
        sentence: [
          "Trigger alarm when the page is scrolled past",
          { fieldKey: "percent" },
          "%."
        ],
        fields: [
          {
            key: "percent",
            max: 100,
            min: 1,
            step: 1,
            type: "number",
            defaultValue: 80
          }
        ]
      }
    ]
  },
  {
    key: "keyboard",
    label: "Keyboard",
    description: "Track keyboard inactivity and bursts of typing inside the page.",
    conditions: [
      {
        key: "idleForMinutes",
        label: "No typing",
        sentence: [
          "Trigger alarm if there are no key presses for more than",
          { fieldKey: "minutes" },
          "minutes."
        ],
        fields: [
          {
            key: "minutes",
            max: 240,
            min: 1,
            step: 1,
            type: "number",
            defaultValue: 5
          }
        ]
      },
      {
        key: "burst",
        label: "Typing burst",
        sentence: [
          "Trigger alarm if at least",
          { fieldKey: "count" },
          "key presses happen within",
          { fieldKey: "minutes" },
          "minutes."
        ],
        fields: [
          {
            key: "count",
            max: 10000,
            min: 1,
            step: 1,
            type: "number",
            defaultValue: 20
          },
          {
            key: "minutes",
            max: 240,
            min: 1,
            step: 1,
            type: "number",
            defaultValue: 2
          }
        ]
      }
    ]
  },
  {
    key: "visibility",
    label: "Visibility",
    description: "Watch how long the page stays hidden or visible.",
    conditions: [
      {
        key: "hiddenForMinutes",
        label: "Hidden timeout",
        sentence: [
          "Trigger alarm if the page stays hidden for more than",
          { fieldKey: "minutes" },
          "minutes."
        ],
        fields: [
          {
            key: "minutes",
            max: 240,
            min: 1,
            step: 1,
            type: "number",
            defaultValue: 5
          }
        ]
      },
      {
        key: "visibleForMinutes",
        label: "Visible timeout",
        sentence: [
          "Trigger alarm if the page stays visible for more than",
          { fieldKey: "minutes" },
          "minutes."
        ],
        fields: [
          {
            key: "minutes",
            max: 1440,
            min: 1,
            step: 1,
            type: "number",
            defaultValue: 30
          }
        ]
      }
    ]
  },
  {
    key: "dom",
    label: "DOM changes",
    description: "Track quiet periods and heavy page mutation bursts.",
    conditions: [
      {
        key: "idleForMinutes",
        label: "No page changes",
        sentence: [
          "Trigger alarm if there are no DOM changes for more than",
          { fieldKey: "minutes" },
          "minutes."
        ],
        fields: [
          {
            key: "minutes",
            max: 240,
            min: 1,
            step: 1,
            type: "number",
            defaultValue: 5
          }
        ]
      },
      {
        key: "burst",
        label: "Mutation burst",
        sentence: [
          "Trigger alarm if at least",
          { fieldKey: "count" },
          "DOM changes happen within",
          { fieldKey: "seconds" },
          "seconds."
        ],
        fields: [
          {
            key: "count",
            max: 50000,
            min: 1,
            step: 1,
            type: "number",
            defaultValue: 20
          },
          {
            key: "seconds",
            max: 3600,
            min: 1,
            step: 1,
            type: "number",
            defaultValue: 30
          }
        ]
      }
    ]
  }
];

export const EVENT_DEFINITION_MAP = Object.freeze(
  Object.fromEntries(EVENT_DEFINITIONS.map((definition) => [definition.key, definition]))
);

export const DEFAULT_ALARM_SOUND_KEY = "ambulance";

export const ALARM_SOUND_DEFINITIONS = Object.freeze([
  {
    key: DEFAULT_ALARM_SOUND_KEY,
    label: "Ambulance",
    description: "The original rising emergency siren."
  },
  {
    key: "klaxon",
    label: "Klaxon",
    description: "A heavier mechanical warning horn."
  },
  {
    key: "beacon",
    label: "Beacon",
    description: "Bright repeating beacon pulses."
  },
  {
    key: "sonar",
    label: "Sonar",
    description: "Clean scanning pings."
  },
  {
    key: "pulse",
    label: "Pulse",
    description: "Low rhythmic alert thumps."
  },
  {
    key: "warning",
    label: "Warning",
    description: "Alternating high and low alert beeps."
  },
  {
    key: "chime",
    label: "Chime",
    description: "A crisp repeating three-note chime."
  },
  {
    key: "shimmer",
    label: "Shimmer",
    description: "Glassy sparkling tones."
  },
  {
    key: "arcade",
    label: "Arcade",
    description: "An 8-bit retro alarm."
  },
  {
    key: "airhorn",
    label: "Airhorn",
    description: "A loud brassy emergency blast."
  },
  {
    key: "radar",
    label: "Radar",
    description: "Fast rotating radar blips."
  },
  {
    key: "bell",
    label: "Bell",
    description: "Resonant metallic bell strikes."
  },
  {
    key: "uplink",
    label: "Uplink",
    description: "A futuristic uplink sequence."
  },
  {
    key: "cascade",
    label: "Cascade",
    description: "Falling alert tones in a repeating sweep."
  },
  {
    key: "echo",
    label: "Echo",
    description: "Layered repeating pings with a trailing feel."
  },
  {
    key: "flare",
    label: "Flare",
    description: "A sharp rising alert burst."
  },
  {
    key: "intercom",
    label: "Intercom",
    description: "A clean office-style paging beep."
  },
  {
    key: "orbit",
    label: "Orbit",
    description: "Circular cycling tones with a steady rhythm."
  },
  {
    key: "quartz",
    label: "Quartz",
    description: "Precise glassy ticks and chimes."
  },
  {
    key: "reactor",
    label: "Reactor",
    description: "A tense sci-fi core warning pulse."
  },
  {
    key: "sentinel",
    label: "Sentinel",
    description: "Measured watch-station alert beeps."
  },
  {
    key: "tremor",
    label: "Tremor",
    description: "A low shaking rumble alarm."
  }
]);

export const ALARM_SOUND_DEFINITION_MAP = Object.freeze(
  Object.fromEntries(ALARM_SOUND_DEFINITIONS.map((definition) => [definition.key, definition]))
);

export const DEFAULT_EVENT_SELECTIONS = Object.freeze(
  Object.fromEntries(EVENT_DEFINITIONS.map((definition) => [definition.key, false]))
);

export const DEFAULT_EVENT_CONDITIONS = Object.freeze(buildDefaultEventConditions());

export const TRIGGER_ACTIONS = Object.freeze({
  CLOSE: "close",
  DISARM: "disarm",
  NOTIFICATION: "notification",
  SHORTCUT: "shortcut",
  SIREN: "siren",
  STOP_SHARING: "stopSharing"
});

export const TRIGGER_ACTION_DEFINITIONS = Object.freeze([
  {
    key: TRIGGER_ACTIONS.SIREN,
    label: "Play alarm sound",
    description: "Play the selected alarm sound in the background.",
    fields: [
      {
        key: "soundKey",
        label: "Alarm sound",
        type: "select",
        defaultValue: DEFAULT_ALARM_SOUND_KEY,
        options: ALARM_SOUND_DEFINITIONS.map((definition) => ({
          label: definition.label,
          value: definition.key
        })),
        description: "Choose which alarm sound should play when this rule fires."
      }
    ]
  },
  {
    key: TRIGGER_ACTIONS.NOTIFICATION,
    label: "Show notification",
    description: "Display a desktop notification with the alarm details."
  },
  {
    key: TRIGGER_ACTIONS.SHORTCUT,
    label: "Run shortcut",
    description: "Send a configurable key combination into the monitored page.",
    fields: [
      {
        key: "accelerator",
        label: "Shortcut",
        placeholder: "Ctrl+Shift+K or Space",
        type: "text",
        defaultValue: "",
        description: "Works with in-page shortcuts, not Chrome or operating-system shortcuts."
      }
    ]
  },
  {
    key: TRIGGER_ACTIONS.STOP_SHARING,
    label: "Stop screen share",
    description: "Attempt to stop the current page's active screen share before cleanup actions run."
  },
  {
    key: TRIGGER_ACTIONS.CLOSE,
    label: "Close tab",
    description: "Close the monitored tab after the other selected actions run."
  },
  {
    key: TRIGGER_ACTIONS.DISARM,
    label: "Disarm tab",
    description: "Stop monitoring the tab after the rule fires."
  }
]);

export const DEFAULT_TRIGGER_ACTIONS = Object.freeze({
  [TRIGGER_ACTIONS.CLOSE]: false,
  [TRIGGER_ACTIONS.DISARM]: false,
  [TRIGGER_ACTIONS.NOTIFICATION]: true,
  [TRIGGER_ACTIONS.SHORTCUT]: false,
  [TRIGGER_ACTIONS.SIREN]: true,
  [TRIGGER_ACTIONS.STOP_SHARING]: false
});

export const DEFAULT_TRIGGER_ACTION_SETTINGS = Object.freeze(buildDefaultTriggerActionSettings());

export const DEFAULT_SETTINGS = Object.freeze({
  cooldownMs: 6000,
  defaultEventConditions: DEFAULT_EVENT_CONDITIONS,
  defaultEventSelections: DEFAULT_EVENT_SELECTIONS,
  defaultTriggerActions: DEFAULT_TRIGGER_ACTIONS,
  defaultTriggerActionSettings: DEFAULT_TRIGGER_ACTION_SETTINGS,
  lastAlarm: null,
  monitoredTabs: {},
  notificationsEnabled: true,
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  sirenDurationMs: 8000
});

export function normalizeEventSelections(value) {
  const normalized = {};

  for (const definition of EVENT_DEFINITIONS) {
    normalized[definition.key] = value?.[definition.key] ?? DEFAULT_EVENT_SELECTIONS[definition.key];
  }

  return normalized;
}

export function normalizeEventConditions(value) {
  const normalized = {};

  for (const definition of EVENT_DEFINITIONS) {
    const nextCategory = {};
    const sourceCategory = value?.[definition.key];

    for (const condition of definition.conditions || []) {
      const sourceCondition = sourceCategory?.[condition.key];
      const nextCondition = {
        enabled: Boolean(sourceCondition?.enabled),
        values: {}
      };

      for (const field of condition.fields || []) {
        nextCondition.values[field.key] = normalizeConditionFieldValue(
          sourceCondition?.values?.[field.key],
          field
        );
      }

      nextCategory[condition.key] = nextCondition;
    }

    normalized[definition.key] = nextCategory;
  }

  return normalized;
}

export function sanitizeTabSession(value = {}) {
  const armedAt = typeof value.armedAt === "number" ? value.armedAt : Date.now();
  const title = typeof value.title === "string" ? value.title : "Untitled tab";
  const url = typeof value.url === "string" ? value.url : "";

  return {
    armedAt,
    eventConditions: normalizeEventConditions(value.eventConditions),
    eventSelections: normalizeEventSelections(value.eventSelections),
    lastEvent: normalizeAlarmRecord(value.lastEvent),
    lastTriggeredAtByCategory: normalizeTriggeredMap(value.lastTriggeredAtByCategory),
    runtime: normalizeSessionRuntime(value.runtime, {
      armedAt,
      title,
      url
    }),
    triggerActions: normalizeTriggerActions(value.triggerActions ?? value.triggerAction),
    triggerActionSettings: normalizeTriggerActionSettings(value.triggerActionSettings),
    title,
    url
  };
}

export function normalizeSettings(value = {}) {
  const isCurrentSchema = [SETTINGS_SCHEMA_VERSION, 5, 4, 3, 2].includes(value.schemaVersion);
  const monitoredTabs = {};

  if (isCurrentSchema) {
    for (const [tabId, session] of Object.entries(value.monitoredTabs || {})) {
      monitoredTabs[tabId] = sanitizeTabSession(session);
    }
  }

  return {
    cooldownMs: normalizePositiveNumber(value.cooldownMs, DEFAULT_SETTINGS.cooldownMs),
    defaultEventConditions: isCurrentSchema
      ? normalizeEventConditions(value.defaultEventConditions)
      : DEFAULT_EVENT_CONDITIONS,
    defaultEventSelections: isCurrentSchema
      ? normalizeEventSelections(value.defaultEventSelections)
      : DEFAULT_EVENT_SELECTIONS,
    defaultTriggerActions: isCurrentSchema
      ? normalizeTriggerActions(value.defaultTriggerActions ?? value.defaultTriggerAction)
      : DEFAULT_TRIGGER_ACTIONS,
    defaultTriggerActionSettings: isCurrentSchema
      ? normalizeTriggerActionSettings(value.defaultTriggerActionSettings)
      : DEFAULT_TRIGGER_ACTION_SETTINGS,
    lastAlarm: isCurrentSchema ? normalizeAlarmRecord(value.lastAlarm) : null,
    monitoredTabs,
    notificationsEnabled: value.notificationsEnabled ?? DEFAULT_SETTINGS.notificationsEnabled,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    sirenDurationMs: normalizePositiveNumber(value.sirenDurationMs, DEFAULT_SETTINGS.sirenDurationMs)
  };
}

export function buildAlarmRecord(value = {}) {
  return normalizeAlarmRecord({
    category: value.category,
    detail: value.detail,
    label: value.label,
    tabId: value.tabId,
    tabTitle: value.tabTitle,
    tabUrl: value.tabUrl,
    time: value.time ?? Date.now()
  });
}

export function describeAlarm(record) {
  if (!record) {
    return "No alarms have fired yet.";
  }

  const location = record.tabTitle || record.tabUrl || "Unknown tab";
  const suffix = record.detail ? ` (${record.detail})` : "";
  return `${record.label} on ${location}${suffix}`;
}

export function formatTimestamp(timestamp) {
  if (typeof timestamp !== "number") {
    return "Never";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(timestamp);
}

export function normalizeTriggerAction(value) {
  return value === TRIGGER_ACTIONS.CLOSE ? TRIGGER_ACTIONS.CLOSE : TRIGGER_ACTIONS.SIREN;
}

export function normalizeTriggerActions(value) {
  if (typeof value === "string") {
    return value === TRIGGER_ACTIONS.CLOSE
      ? {
          [TRIGGER_ACTIONS.CLOSE]: true,
          [TRIGGER_ACTIONS.DISARM]: false,
          [TRIGGER_ACTIONS.NOTIFICATION]: false,
          [TRIGGER_ACTIONS.SHORTCUT]: false,
          [TRIGGER_ACTIONS.SIREN]: false,
          [TRIGGER_ACTIONS.STOP_SHARING]: false
        }
      : { ...DEFAULT_TRIGGER_ACTIONS };
  }

  if (Array.isArray(value)) {
    return Object.fromEntries(
      TRIGGER_ACTION_DEFINITIONS.map((definition) => [definition.key, value.includes(definition.key)])
    );
  }

  const normalized = {};

  for (const definition of TRIGGER_ACTION_DEFINITIONS) {
    normalized[definition.key] = value?.[definition.key] ?? DEFAULT_TRIGGER_ACTIONS[definition.key];
  }

  return normalized;
}

export function normalizeTriggerActionSettings(value) {
  const normalized = {};

  for (const definition of TRIGGER_ACTION_DEFINITIONS) {
    const nextSettings = {};
    const sourceSettings = value?.[definition.key];

    for (const field of definition.fields || []) {
      nextSettings[field.key] = normalizeConditionFieldValue(sourceSettings?.[field.key], field);
    }

    normalized[definition.key] = nextSettings;
  }

  return normalized;
}

export function describeTriggerActions(triggerActions) {
  const normalized = normalizeTriggerActions(triggerActions);
  const labels = TRIGGER_ACTION_DEFINITIONS.filter((definition) => normalized[definition.key]).map(
    (definition) => definition.label.toLowerCase()
  );

  if (labels.length === 0) {
    return "take no action";
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

export function getAlarmSoundDefinition(soundKey) {
  return ALARM_SOUND_DEFINITION_MAP[soundKey] || ALARM_SOUND_DEFINITION_MAP[DEFAULT_ALARM_SOUND_KEY];
}

export function getEventDefinition(category) {
  return EVENT_DEFINITION_MAP[category] || null;
}

export function getConditionDefinition(category, conditionKey) {
  return (
    EVENT_DEFINITION_MAP[category]?.conditions?.find((condition) => condition.key === conditionKey) ||
    null
  );
}

function buildDefaultEventConditions() {
  const defaults = {};

  for (const definition of EVENT_DEFINITIONS) {
    const categoryDefaults = {};

    for (const condition of definition.conditions || []) {
      const conditionDefaults = {
        enabled: false,
        values: {}
      };

      for (const field of condition.fields || []) {
        conditionDefaults.values[field.key] = field.defaultValue;
      }

      categoryDefaults[condition.key] = conditionDefaults;
    }

    defaults[definition.key] = categoryDefaults;
  }

  return defaults;
}

function buildDefaultTriggerActionSettings() {
  const defaults = {};

  for (const definition of TRIGGER_ACTION_DEFINITIONS) {
    const actionDefaults = {};

    for (const field of definition.fields || []) {
      actionDefaults[field.key] = field.defaultValue ?? "";
    }

    defaults[definition.key] = actionDefaults;
  }

  return defaults;
}

function normalizeAlarmRecord(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    category: typeof value.category === "string" ? value.category : "tab",
    detail: typeof value.detail === "string" ? value.detail : "",
    label: typeof value.label === "string" ? value.label : "Alarm triggered",
    tabId: typeof value.tabId === "number" ? value.tabId : null,
    tabTitle: typeof value.tabTitle === "string" ? value.tabTitle : "",
    tabUrl: typeof value.tabUrl === "string" ? value.tabUrl : "",
    time: typeof value.time === "number" ? value.time : Date.now()
  };
}

function normalizeConditionFieldValue(value, field) {
  if (field.type === "number") {
    return normalizeNumberFieldValue(value, field);
  }

  if (field.type === "select") {
    return normalizeSelectFieldValue(value, field);
  }

  return typeof value === "string" ? value.trim() : String(field.defaultValue ?? "");
}

function normalizeNumberFieldValue(value, field) {
  const fallback = Number(field.defaultValue);
  const numericValue = typeof value === "string" ? Number(value) : value;

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  if (typeof field.min === "number" && numericValue < field.min) {
    return field.min;
  }

  if (typeof field.max === "number" && numericValue > field.max) {
    return field.max;
  }

  return numericValue;
}

function normalizeSelectFieldValue(value, field) {
  const fallback = String(field.defaultValue ?? "");
  const nextValue = typeof value === "string" ? value.trim() : String(value ?? fallback);
  const allowedValues = Array.isArray(field.options)
    ? field.options.map((option) => option?.value)
    : [];

  if (!allowedValues.includes(nextValue)) {
    return fallback;
  }

  return nextValue;
}

function normalizeTriggeredMap(value) {
  const normalized = {};

  for (const definition of EVENT_DEFINITIONS) {
    const currentValue = value?.[definition.key];
    normalized[definition.key] = typeof currentValue === "number" ? currentValue : 0;
  }

  return normalized;
}

function normalizeSessionRuntime(value, seed) {
  const baseTime = typeof seed.armedAt === "number" ? seed.armedAt : Date.now();

  return {
    audio: {
      audibleSince: normalizeTimestamp(value?.audio?.audibleSince, 0),
      isAudible: Boolean(value?.audio?.isAudible),
      activeTriggered: Boolean(value?.audio?.activeTriggered),
      silentSince: normalizeTimestamp(value?.audio?.silentSince, baseTime),
      silentTriggered: Boolean(value?.audio?.silentTriggered)
    },
    tab: {
      currentTitle:
        typeof value?.tab?.currentTitle === "string" ? value.tab.currentTitle : seed.title || "",
      currentUrl: typeof value?.tab?.currentUrl === "string" ? value.tab.currentUrl : seed.url || "",
      loadingSince: normalizeTimestamp(value?.tab?.loadingSince, 0),
      loadingTriggered: Boolean(value?.tab?.loadingTriggered)
    }
  };
}

function normalizeTimestamp(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizePositiveNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
