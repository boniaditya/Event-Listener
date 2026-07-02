import {
  STORAGE_KEY,
  TRIGGER_ACTIONS,
  buildAlarmRecord,
  describeAlarm,
  normalizeEventConditions,
  normalizeEventSelections,
  normalizeTriggerActionSettings,
  normalizeTriggerActions,
  normalizeSettings,
  sanitizeTabSession
} from "./monitoring.js";

const OFFSCREEN_PATH = "offscreen.html";
const NOTIFICATION_ID = "eventlistener-alarm";
const RUNTIME_ALARM_PREFIX = "eventlistener-runtime";
const RUNTIME_TIMER_CONDITIONS = [
  ["tab", "loadingForMinutes"],
  ["audio", "silentForMinutes"],
  ["audio", "activeForMinutes"]
];

let offscreenCreationPromise = null;
let settingsCache = null;

chrome.runtime.onInstalled.addListener(() => {
  void initializeExtension();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeExtension();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type || message.target === "offscreen") {
    return false;
  }

  void handleMessage(message, sender)
    .then((result) => sendResponse(result))
    .catch((error) => {
      console.error("EVENTLISTENER background request failed.", error);
      sendResponse({
        error: error instanceof Error ? error.message : "Unexpected background failure.",
        ok: false
      });
    });

  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void handleTabUpdated(tabId, changeInfo, tab);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void removeTabSession(tabId);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  void handleRuntimeAlarm(alarm);
});

async function initializeExtension() {
  const settings = await getSettings();
  const entries = Object.entries(settings.monitoredTabs);

  if (entries.length === 0) {
    await updateBadge(settings);
    return;
  }

  for (const [tabIdString, session] of entries) {
    const tabId = Number(tabIdString);
    const tab = await safeGetTab(tabId);

    if (!tab) {
      delete settings.monitoredTabs[tabIdString];
      continue;
    }

    resetSessionRuntime(session, tab);
  }

  await saveSettings(settings);

  for (const [tabIdString, session] of Object.entries(settings.monitoredTabs)) {
    const tabId = Number(tabIdString);
    await syncSessionAlarms(tabId, session, settings);
    await notifyTabMonitoringState(tabId, session);
  }
}

async function handleMessage(message, sender) {
  switch (message.type) {
    case "arm-tab":
      return armTab(message);
    case "disarm-all":
      return disarmAllTabs();
    case "disarm-tab":
      return disarmTab(message.tabId);
    case "get-dashboard-state":
      return getDashboardState();
    case "get-popup-state":
      return getPopupState(message.tabId);
    case "get-tab-monitoring-state":
      return getTabMonitoringState(sender.tab?.id);
    case "page-condition-triggered":
      return handlePageConditionTriggered(message, sender.tab);
    case "set-event-configuration":
      return setEventConfiguration(message);
    case "set-event-selections":
      return setEventConfiguration(message);
    case "stop-alarm":
      await stopAlarm();
      return { ok: true };
    case "test-alarm": {
      const settings = await getSettings();
      await playSiren(
        typeof message.durationMs === "number" ? message.durationMs : settings.sirenDurationMs,
        message.soundKey || settings.defaultTriggerActionSettings?.[TRIGGER_ACTIONS.SIREN]?.soundKey
      );
      return { ok: true };
    }
    default:
      return { error: `Unknown message type: ${message.type}`, ok: false };
  }
}

async function armTab(message) {
  if (typeof message.tabId !== "number") {
    throw new Error("No tab was provided to arm.");
  }

  const settings = await getSettings();
  const existingSession = settings.monitoredTabs[String(message.tabId)];
  const eventSelections = normalizeEventSelections(
    message.eventSelections || existingSession?.eventSelections || settings.defaultEventSelections
  );
  const eventConditions = normalizeEventConditions(
    message.eventConditions || existingSession?.eventConditions || settings.defaultEventConditions
  );
  const triggerActions = normalizeTriggerActions(
    message.triggerActions ||
      message.triggerAction ||
      existingSession?.triggerActions ||
      existingSession?.triggerAction ||
      settings.defaultTriggerActions ||
      settings.defaultTriggerAction
  );
  const triggerActionSettings = normalizeTriggerActionSettings(
    message.triggerActionSettings ||
      existingSession?.triggerActionSettings ||
      settings.defaultTriggerActionSettings
  );
  const tab = await safeGetTab(message.tabId);
  const session = sanitizeTabSession({
    ...existingSession,
    armedAt: Date.now(),
    eventConditions,
    eventSelections,
    triggerActions,
    triggerActionSettings,
    title: tab?.title || message.title || existingSession?.title || "Untitled tab",
    url: tab?.url || message.url || existingSession?.url || ""
  });

  resetSessionRuntime(session, tab || {
    title: session.title,
    url: session.url
  });

  settings.defaultEventConditions = eventConditions;
  settings.defaultEventSelections = eventSelections;
  settings.defaultTriggerActions = triggerActions;
  settings.defaultTriggerActionSettings = triggerActionSettings;
  settings.monitoredTabs[String(message.tabId)] = session;

  await saveSettings(settings);
  await syncSessionAlarms(message.tabId, session, settings);
  await notifyTabMonitoringState(message.tabId, session);

  return {
    ok: true,
    session
  };
}

async function disarmAllTabs() {
  const settings = await getSettings();
  const tabIds = Object.keys(settings.monitoredTabs).map((value) => Number(value));

  settings.monitoredTabs = {};
  await saveSettings(settings);

  for (const tabId of tabIds) {
    await clearTabAlarms(tabId);
    await notifyTabMonitoringState(tabId, null);
  }

  return { ok: true };
}

async function disarmTab(tabId) {
  if (typeof tabId !== "number") {
    throw new Error("No tab was provided to disarm.");
  }

  const settings = await getSettings();
  delete settings.monitoredTabs[String(tabId)];
  await saveSettings(settings);
  await clearTabAlarms(tabId);
  await notifyTabMonitoringState(tabId, null);

  return { ok: true };
}

async function getPopupState(tabId) {
  const settings = await getSettings();
  const session = typeof tabId === "number" ? settings.monitoredTabs[String(tabId)] || null : null;

  return {
    armedTabCount: Object.keys(settings.monitoredTabs).length,
    cooldownMs: settings.cooldownMs,
    defaultEventConditions: settings.defaultEventConditions,
    defaultEventSelections: settings.defaultEventSelections,
    defaultTriggerActions: settings.defaultTriggerActions,
    defaultTriggerActionSettings: settings.defaultTriggerActionSettings,
    lastAlarm: settings.lastAlarm,
    ok: true,
    session,
    sirenDurationMs: settings.sirenDurationMs
  };
}

async function getDashboardState() {
  const settings = await getSettings();

  return {
    armedTabCount: Object.keys(settings.monitoredTabs).length,
    cooldownMs: settings.cooldownMs,
    defaultEventConditions: settings.defaultEventConditions,
    defaultEventSelections: settings.defaultEventSelections,
    defaultTriggerActions: settings.defaultTriggerActions,
    defaultTriggerActionSettings: settings.defaultTriggerActionSettings,
    lastAlarm: settings.lastAlarm,
    monitoredTabs: Object.entries(settings.monitoredTabs)
      .map(([tabId, session]) => ({
        session,
        tabId: Number(tabId)
      }))
      .sort((left, right) => (right.session?.armedAt || 0) - (left.session?.armedAt || 0)),
    ok: true,
    sirenDurationMs: settings.sirenDurationMs
  };
}

async function getTabMonitoringState(tabId) {
  const settings = await getSettings();
  const session = typeof tabId === "number" ? settings.monitoredTabs[String(tabId)] : null;

  return {
    armed: Boolean(session),
    eventConditions: session?.eventConditions || settings.defaultEventConditions,
    eventSelections: session?.eventSelections || settings.defaultEventSelections,
    ok: true
  };
}

async function handlePageConditionTriggered(message, tab) {
  if (typeof tab?.id !== "number") {
    return { ignored: true, ok: true };
  }

  const settings = await getSettings();
  const session = settings.monitoredTabs[String(tab.id)];

  if (
    !session ||
    !isConditionEnabled(session, message.category, message.conditionKey)
  ) {
    return { ignored: true, ok: true };
  }

  const record = buildAlarmRecord({
    category: message.category,
    detail: message.detail,
    label: message.label,
    tabId: tab.id,
    tabTitle: tab.title || session.title,
    tabUrl: tab.url || message.pageUrl || session.url,
    time: Date.now()
  });

  return maybeTriggerAlarmForSession(settings, session, record);
}

async function setEventConfiguration(message) {
  const settings = await getSettings();
  const eventSelections = normalizeEventSelections(
    message.eventSelections || settings.defaultEventSelections
  );
  const eventConditions = normalizeEventConditions(
    message.eventConditions || settings.defaultEventConditions
  );
  const triggerActions = normalizeTriggerActions(
    message.triggerActions ||
      message.triggerAction ||
      settings.defaultTriggerActions ||
      settings.defaultTriggerAction
  );
  const triggerActionSettings = normalizeTriggerActionSettings(
    message.triggerActionSettings || settings.defaultTriggerActionSettings
  );

  settings.defaultEventSelections = eventSelections;
  settings.defaultEventConditions = eventConditions;
  settings.defaultTriggerActions = triggerActions;
  settings.defaultTriggerActionSettings = triggerActionSettings;

  if (typeof message.tabId === "number") {
    const session = settings.monitoredTabs[String(message.tabId)];

    if (session) {
      session.eventSelections = eventSelections;
      session.eventConditions = eventConditions;
      session.triggerActions = triggerActions;
      session.triggerActionSettings = triggerActionSettings;
      resetSessionRuntime(session, await safeGetTab(message.tabId) || session);
      await saveSettings(settings);
      await syncSessionAlarms(message.tabId, session, settings);
      await notifyTabMonitoringState(message.tabId, session);

      return {
        eventConditions,
        eventSelections,
        triggerActions,
        triggerActionSettings,
        ok: true
      };
    }
  }

  await saveSettings(settings);

  return {
    eventConditions,
    eventSelections,
    triggerActions,
    triggerActionSettings,
    ok: true
  };
}

async function handleTabUpdated(tabId, changeInfo, tab) {
  const settings = await getSettings();
  const session = settings.monitoredTabs[String(tabId)];

  if (!session) {
    return;
  }

  const now = Date.now();
  let shouldSave = false;
  let shouldSyncAlarms = false;

  if (typeof changeInfo.url === "string") {
    session.url = changeInfo.url;
    session.runtime.tab.currentUrl = changeInfo.url;
    shouldSave = true;

    const keyword = getConditionTextValue(session, "tab", "urlContains", "keyword");

    if (keyword && isConditionEnabled(session, "tab", "urlContains") && matchesKeyword(changeInfo.url, keyword)) {
      const result = await maybeTriggerAlarmForSession(
        settings,
        session,
        buildAlarmRecord({
          category: "tab",
          detail: `Matched "${keyword}" in the URL.`,
          label: "URL matched your rule",
          tabId,
          tabTitle: tab?.title || session.title,
          tabUrl: changeInfo.url,
          time: now
        }),
        false
      );

      if (result.shouldStopProcessing) {
        return;
      }

      shouldSave = shouldSave || result.triggered;
    }
  }

  if (typeof changeInfo.title === "string") {
    session.title = changeInfo.title;
    session.runtime.tab.currentTitle = changeInfo.title;
    shouldSave = true;

    const keyword = getConditionTextValue(session, "tab", "titleContains", "keyword");

    if (
      keyword &&
      isConditionEnabled(session, "tab", "titleContains") &&
      matchesKeyword(changeInfo.title, keyword)
    ) {
      const result = await maybeTriggerAlarmForSession(
        settings,
        session,
        buildAlarmRecord({
          category: "tab",
          detail: `Matched "${keyword}" in the title.`,
          label: "Title matched your rule",
          tabId,
          tabTitle: changeInfo.title,
          tabUrl: tab?.url || session.url,
          time: now
        }),
        false
      );

      if (result.shouldStopProcessing) {
        return;
      }

      shouldSave = shouldSave || result.triggered;
    }
  }

  if (typeof changeInfo.status === "string") {
    if (changeInfo.status === "loading") {
      if (session.runtime.tab.loadingSince === 0 || typeof changeInfo.url === "string") {
        session.runtime.tab.loadingSince = now;
      }

      session.runtime.tab.loadingTriggered = false;
      shouldSave = true;
      shouldSyncAlarms = true;
    } else if (changeInfo.status === "complete") {
      session.runtime.tab.loadingSince = 0;
      session.runtime.tab.loadingTriggered = false;
      shouldSave = true;
      shouldSyncAlarms = true;
    }
  }

  if (typeof changeInfo.audible === "boolean") {
    applyAudioState(session, changeInfo.audible, now);
    shouldSave = true;
    shouldSyncAlarms = true;
  }

  if (!shouldSave) {
    return;
  }

  await saveSettings(settings);

  if (shouldSyncAlarms) {
    await syncSessionAlarms(tabId, session, settings);
  }
}

async function handleRuntimeAlarm(alarm) {
  const parsed = parseRuntimeAlarmName(alarm.name);

  if (!parsed) {
    return;
  }

  const settings = await getSettings();
  const session = settings.monitoredTabs[String(parsed.tabId)];

  if (!session) {
    await clearConditionAlarm(parsed.tabId, parsed.category, parsed.conditionKey);
    return;
  }

  const record = buildRuntimeConditionRecord(session, parsed.tabId, parsed.category, parsed.conditionKey);

  if (!record) {
    await clearConditionAlarm(parsed.tabId, parsed.category, parsed.conditionKey);
    return;
  }

  const result = await maybeTriggerAlarmForSession(settings, session, record, false);

  if (result.shouldStopProcessing) {
    return;
  }

  if (result.triggered) {
    markRuntimeConditionTriggered(session, parsed.category, parsed.conditionKey, true);
  }

  await saveSettings(settings);
  await syncSessionAlarms(parsed.tabId, session, settings);
}

async function maybeTriggerAlarmForSession(settings, session, record, persistAfterTrigger = true) {
  const lastTriggeredAt = session.lastTriggeredAtByCategory[record.category] || 0;
  const triggerActions = normalizeTriggerActions(
    session.triggerActions || settings.defaultTriggerActions || settings.defaultTriggerAction
  );
  const triggerActionSettings = normalizeTriggerActionSettings(
    session.triggerActionSettings || settings.defaultTriggerActionSettings
  );

  if (record.time - lastTriggeredAt < settings.cooldownMs) {
    return {
      nextAllowedAt: lastTriggeredAt + settings.cooldownMs,
      ok: true,
      shouldStopProcessing: false,
      throttled: true,
      triggerActionSettings,
      triggerActions,
      triggered: false
    };
  }

  session.lastTriggeredAtByCategory[record.category] = record.time;
  session.lastEvent = record;
  session.title = record.tabTitle || session.title;
  session.url = record.tabUrl || session.url;
  settings.lastAlarm = record;

  if (persistAfterTrigger || shouldPersistBeforeTriggerAction(triggerActions)) {
    await saveSettings(settings);
  }

  const executionResult = await executeTriggerActions(
    record,
    settings,
    triggerActions,
    triggerActionSettings
  );

  return {
    ok: true,
    shouldStopProcessing: executionResult.closed || executionResult.disarmed,
    triggerActionSettings,
    triggerActions,
    triggered: true
  };
}

async function executeTriggerActions(record, settings, triggerActions, triggerActionSettings) {
  const normalized = normalizeTriggerActions(triggerActions);
  const normalizedSettings = normalizeTriggerActionSettings(triggerActionSettings);

  if (hasTriggerAction(normalized, TRIGGER_ACTIONS.NOTIFICATION)) {
    await showNotification(record, settings);
  }

  if (hasTriggerAction(normalized, TRIGGER_ACTIONS.SIREN)) {
    await playSiren(settings.sirenDurationMs, normalizedSettings[TRIGGER_ACTIONS.SIREN]?.soundKey);
  }

  if (hasTriggerAction(normalized, TRIGGER_ACTIONS.SHORTCUT)) {
    await executeShortcutAction(record.tabId, normalizedSettings[TRIGGER_ACTIONS.SHORTCUT]);
  }

  if (hasTriggerAction(normalized, TRIGGER_ACTIONS.STOP_SHARING)) {
    await stopTabScreenShare(record.tabId);
  }

  const closed = hasTriggerAction(normalized, TRIGGER_ACTIONS.CLOSE)
    ? await closeTriggeredTab(record.tabId)
    : false;
  const disarmed = hasTriggerAction(normalized, TRIGGER_ACTIONS.DISARM) && !closed
    ? await disarmTriggeredTab(record.tabId)
    : false;

  return {
    closed,
    disarmed
  };
}

async function showNotification(record, settings) {
  if (settings.notificationsEnabled) {
    await chrome.notifications.create(NOTIFICATION_ID, {
      iconUrl: "icons/icon-128.png",
      message: describeAlarm(record),
      priority: 2,
      requireInteraction: true,
      title: "EVENTLISTENER alarm",
      type: "basic"
    });
  }
}

async function closeTriggeredTab(tabId) {
  if (typeof tabId !== "number") {
    return false;
  }

  try {
    await chrome.tabs.remove(tabId);
    return true;
  } catch (error) {
    console.warn("EVENTLISTENER could not close the triggered tab.", error);
    return false;
  }
}

async function disarmTriggeredTab(tabId) {
  if (typeof tabId !== "number") {
    return false;
  }

  try {
    await disarmTab(tabId);
    return true;
  } catch (error) {
    console.warn("EVENTLISTENER could not disarm the triggered tab.", error);
    return false;
  }
}

async function executeShortcutAction(tabId, shortcutSettings = {}) {
  const shortcut = String(shortcutSettings?.accelerator || "").trim();

  if (!shortcut) {
    console.warn("EVENTLISTENER skipped the shortcut action because no shortcut is configured.");
    return false;
  }

  const response = await sendTabActionMessage(tabId, {
    shortcut,
    type: "execute-shortcut"
  });

  if (!response?.ok) {
    console.warn(
      `EVENTLISTENER could not run shortcut "${shortcut}" on tab ${tabId}.`,
      response?.error || "No receiver response."
    );
    return false;
  }

  return true;
}

async function stopTabScreenShare(tabId) {
  const response = await sendTabActionMessage(tabId, {
    type: "stop-screen-share"
  });

  if (!response?.ok) {
    console.warn(
      `EVENTLISTENER could not stop screen sharing on tab ${tabId}.`,
      response?.error || "No receiver response."
    );
    return false;
  }

  return true;
}

async function playSiren(durationMs = 8000, soundKey) {
  await ensureOffscreenDocument();
  await chrome.runtime.sendMessage({
    durationMs,
    soundKey,
    target: "offscreen",
    type: "play-siren"
  });
}

async function stopAlarm() {
  await chrome.notifications.clear(NOTIFICATION_ID);

  try {
    await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "stop-siren"
    });
  } catch (error) {
    console.warn("EVENTLISTENER could not stop the offscreen siren.", error);
  }
}

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (!offscreenCreationPromise) {
    offscreenCreationPromise = chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Play the siren alarm when a monitored tab event occurs."
    });
  }

  try {
    await offscreenCreationPromise;
  } finally {
    offscreenCreationPromise = null;
  }
}

async function notifyTabMonitoringState(tabId, session) {
  if (typeof tabId !== "number") {
    return;
  }

  let tab = null;

  try {
    tab = await chrome.tabs.get(tabId);
  } catch (error) {
    console.warn("EVENTLISTENER could not read the tab before sending monitoring state.", error);
  }

  if (!isPageMonitorableUrl(tab?.url || session?.url || "")) {
    return;
  }

  const payload = {
    armed: Boolean(session),
    eventConditions: session?.eventConditions || normalizeEventConditions(),
    eventSelections: session?.eventSelections || normalizeEventSelections(),
    type: "monitoring-updated"
  };

  try {
    await chrome.tabs.sendMessage(tabId, payload);
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      console.warn("EVENTLISTENER could not notify the tab about monitoring state.", error);
      return;
    }

    try {
      await ensureContentScript(tabId, tab?.url || session?.url || "");
      await chrome.tabs.sendMessage(tabId, payload);
    } catch (retryError) {
      console.warn("EVENTLISTENER could not notify the tab after reinjecting the content script.", retryError);
    }
  }
}

async function ensureContentScript(tabId, url) {
  if (typeof tabId !== "number" || !isPageMonitorableUrl(url)) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      files: ["src/content.js"],
      target: {
        tabId
      }
    });
  } catch (error) {
    if (!String(error?.message || error).includes("Cannot access")) {
      throw error;
    }
  }
}

async function ensurePageBridge(tabId, url) {
  if (typeof tabId !== "number" || !isPageMonitorableUrl(url)) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      files: ["src/page-bridge.js"],
      target: {
        tabId
      },
      world: "MAIN"
    });
  } catch (error) {
    if (!String(error?.message || error).includes("Cannot access")) {
      throw error;
    }
  }
}

async function sendTabActionMessage(tabId, message) {
  if (typeof tabId !== "number") {
    return {
      error: "No monitored tab is available for that action.",
      ok: false
    };
  }

  const tab = await safeGetTab(tabId);
  const url = tab?.url || "";

  if (!isPageMonitorableUrl(url)) {
    return {
      error: "The current tab does not allow page actions on this URL.",
      ok: false
    };
  }

  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      return {
        error: error instanceof Error ? error.message : String(error),
        ok: false
      };
    }

    try {
      await ensureContentScript(tabId, url);
      await ensurePageBridge(tabId, url);
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (retryError) {
      return {
        error: retryError instanceof Error ? retryError.message : String(retryError),
        ok: false
      };
    }
  }
}

async function syncSessionAlarms(tabId, session, settings = settingsCache) {
  for (const [category, conditionKey] of RUNTIME_TIMER_CONDITIONS) {
    const dueAt = getRuntimeConditionDueAt(session, category, conditionKey);

    if (!dueAt) {
      await clearConditionAlarm(tabId, category, conditionKey);
      continue;
    }

    const nextAllowedAt = (session.lastTriggeredAtByCategory[category] || 0) + (settings?.cooldownMs || 0);

    await chrome.alarms.create(buildRuntimeAlarmName(tabId, category, conditionKey), {
      when: Math.max(dueAt, nextAllowedAt, Date.now() + 100)
    });
  }
}

async function clearTabAlarms(tabId) {
  for (const [category, conditionKey] of RUNTIME_TIMER_CONDITIONS) {
    await clearConditionAlarm(tabId, category, conditionKey);
  }
}

async function clearConditionAlarm(tabId, category, conditionKey) {
  await chrome.alarms.clear(buildRuntimeAlarmName(tabId, category, conditionKey));
}

async function removeTabSession(tabId) {
  const settings = await getSettings();

  if (!settings.monitoredTabs[String(tabId)]) {
    await clearTabAlarms(tabId);
    return;
  }

  delete settings.monitoredTabs[String(tabId)];
  await saveSettings(settings);
  await clearTabAlarms(tabId);
}

async function getSettings() {
  if (settingsCache) {
    return settingsCache;
  }

  const stored = await chrome.storage.local.get(STORAGE_KEY);
  settingsCache = normalizeSettings(stored[STORAGE_KEY]);
  return settingsCache;
}

async function saveSettings(settings) {
  settingsCache = settings;
  await chrome.storage.local.set({
    [STORAGE_KEY]: settings
  });
  await updateBadge(settings);
}

async function updateBadge(settings) {
  const armedTabCount = Object.keys(settings.monitoredTabs).length;

  await chrome.action.setBadgeBackgroundColor({
    color: armedTabCount > 0 ? "#cf5d2e" : "#8a93a8"
  });
  await chrome.action.setBadgeText({
    text: armedTabCount === 0 ? "" : armedTabCount === 1 ? "ON" : String(Math.min(armedTabCount, 99))
  });
}

function resetSessionRuntime(session, tab) {
  const now = Date.now();
  const title = tab?.title || session.title;
  const url = tab?.url || session.url;
  const isAudible = Boolean(tab?.audible);
  const isLoading = tab?.status === "loading";

  session.title = title;
  session.url = url;
  session.runtime.tab.currentTitle = title;
  session.runtime.tab.currentUrl = url;
  session.runtime.tab.loadingSince = isLoading ? now : 0;
  session.runtime.tab.loadingTriggered = false;
  session.runtime.audio.isAudible = isAudible;
  session.runtime.audio.audibleSince = isAudible ? now : 0;
  session.runtime.audio.activeTriggered = false;
  session.runtime.audio.silentSince = isAudible ? 0 : now;
  session.runtime.audio.silentTriggered = false;
}

function applyAudioState(session, isAudible, now) {
  const runtimeAudio = session.runtime.audio;

  if (runtimeAudio.isAudible === isAudible) {
    return;
  }

  runtimeAudio.isAudible = isAudible;

  if (isAudible) {
    runtimeAudio.audibleSince = now;
    runtimeAudio.activeTriggered = false;
    runtimeAudio.silentSince = 0;
    runtimeAudio.silentTriggered = false;
    return;
  }

  runtimeAudio.audibleSince = 0;
  runtimeAudio.activeTriggered = false;
  runtimeAudio.silentSince = now;
  runtimeAudio.silentTriggered = false;
}

function buildRuntimeConditionRecord(session, tabId, category, conditionKey) {
  if (!isConditionEnabled(session, category, conditionKey)) {
    return null;
  }

  const now = Date.now();

  if (category === "tab" && conditionKey === "loadingForMinutes") {
    const minutes = getConditionNumberValue(session, category, conditionKey, "minutes");
    const dueAt = session.runtime.tab.loadingSince + minutesToMs(minutes);

    if (
      session.runtime.tab.loadingTriggered ||
      session.runtime.tab.loadingSince === 0 ||
      now < dueAt
    ) {
      return null;
    }

    return buildAlarmRecord({
      category,
      detail: `The page has been loading for more than ${formatUnit(minutes, "minute")}.`,
      label: "Page loading timeout",
      tabId,
      tabTitle: session.title,
      tabUrl: session.url,
      time: now
    });
  }

  if (category === "audio" && conditionKey === "silentForMinutes") {
    const minutes = getConditionNumberValue(session, category, conditionKey, "minutes");
    const dueAt = session.runtime.audio.silentSince + minutesToMs(minutes);

    if (
      session.runtime.audio.silentTriggered ||
      session.runtime.audio.isAudible ||
      session.runtime.audio.silentSince === 0 ||
      now < dueAt
    ) {
      return null;
    }

    return buildAlarmRecord({
      category,
      detail: `Audio has been silent for more than ${formatUnit(minutes, "minute")}.`,
      label: "Audio silent timeout",
      tabId,
      tabTitle: session.title,
      tabUrl: session.url,
      time: now
    });
  }

  if (category === "audio" && conditionKey === "activeForMinutes") {
    const minutes = getConditionNumberValue(session, category, conditionKey, "minutes");
    const dueAt = session.runtime.audio.audibleSince + minutesToMs(minutes);

    if (
      session.runtime.audio.activeTriggered ||
      !session.runtime.audio.isAudible ||
      session.runtime.audio.audibleSince === 0 ||
      now < dueAt
    ) {
      return null;
    }

    return buildAlarmRecord({
      category,
      detail: `Audio has been active for more than ${formatUnit(minutes, "minute")}.`,
      label: "Audio active timeout",
      tabId,
      tabTitle: session.title,
      tabUrl: session.url,
      time: now
    });
  }

  return null;
}

function getRuntimeConditionDueAt(session, category, conditionKey) {
  if (!isConditionEnabled(session, category, conditionKey)) {
    return null;
  }

  if (category === "tab" && conditionKey === "loadingForMinutes") {
    if (session.runtime.tab.loadingTriggered || session.runtime.tab.loadingSince === 0) {
      return null;
    }

    return session.runtime.tab.loadingSince + minutesToMs(
      getConditionNumberValue(session, category, conditionKey, "minutes")
    );
  }

  if (category === "audio" && conditionKey === "silentForMinutes") {
    if (
      session.runtime.audio.silentTriggered ||
      session.runtime.audio.isAudible ||
      session.runtime.audio.silentSince === 0
    ) {
      return null;
    }

    return session.runtime.audio.silentSince + minutesToMs(
      getConditionNumberValue(session, category, conditionKey, "minutes")
    );
  }

  if (category === "audio" && conditionKey === "activeForMinutes") {
    if (
      session.runtime.audio.activeTriggered ||
      !session.runtime.audio.isAudible ||
      session.runtime.audio.audibleSince === 0
    ) {
      return null;
    }

    return session.runtime.audio.audibleSince + minutesToMs(
      getConditionNumberValue(session, category, conditionKey, "minutes")
    );
  }

  return null;
}

function markRuntimeConditionTriggered(session, category, conditionKey, triggered) {
  if (category === "tab" && conditionKey === "loadingForMinutes") {
    session.runtime.tab.loadingTriggered = triggered;
    return;
  }

  if (category === "audio" && conditionKey === "silentForMinutes") {
    session.runtime.audio.silentTriggered = triggered;
    return;
  }

  if (category === "audio" && conditionKey === "activeForMinutes") {
    session.runtime.audio.activeTriggered = triggered;
  }
}

function isConditionEnabled(session, category, conditionKey) {
  return Boolean(
    session.eventSelections?.[category] &&
    session.eventConditions?.[category]?.[conditionKey]?.enabled
  );
}

function getConditionNumberValue(session, category, conditionKey, fieldKey) {
  return Number(session.eventConditions?.[category]?.[conditionKey]?.values?.[fieldKey] || 0);
}

function getConditionTextValue(session, category, conditionKey, fieldKey) {
  const value = session.eventConditions?.[category]?.[conditionKey]?.values?.[fieldKey];
  return typeof value === "string" ? value.trim() : "";
}

function buildRuntimeAlarmName(tabId, category, conditionKey) {
  return `${RUNTIME_ALARM_PREFIX}:${tabId}:${category}:${conditionKey}`;
}

function parseRuntimeAlarmName(name) {
  const [prefix, tabIdString, category, conditionKey] = String(name || "").split(":");

  if (prefix !== RUNTIME_ALARM_PREFIX || !tabIdString || !category || !conditionKey) {
    return null;
  }

  const tabId = Number(tabIdString);

  if (!Number.isFinite(tabId)) {
    return null;
  }

  return {
    category,
    conditionKey,
    tabId
  };
}

function matchesKeyword(value, keyword) {
  return value.toLowerCase().includes(keyword.toLowerCase());
}

function minutesToMs(value) {
  return Number(value) * 60 * 1000;
}

function formatUnit(value, unit) {
  return `${value} ${unit}${Number(value) === 1 ? "" : "s"}`;
}

function isMissingReceiverError(error) {
  return String(error?.message || error).includes("Receiving end does not exist");
}

function hasTriggerAction(triggerActions, actionKey) {
  return Boolean(triggerActions?.[actionKey]);
}

function isPageMonitorableUrl(url) {
  return /^https?:|^file:/i.test(url);
}

function shouldPersistBeforeTriggerAction(triggerActions) {
  return (
    hasTriggerAction(triggerActions, TRIGGER_ACTIONS.CLOSE) ||
    hasTriggerAction(triggerActions, TRIGGER_ACTIONS.DISARM)
  );
}

async function safeGetTab(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch (error) {
    console.warn("EVENTLISTENER could not read tab state.", error);
    return null;
  }
}
