import {
  STORAGE_KEY,
  describeAlarm,
  describeTriggerActions,
  formatTimestamp,
  getAlarmSoundDefinition,
  normalizeEventConditions,
  normalizeEventSelections,
  normalizeTriggerActionSettings,
  normalizeTriggerActions,
  normalizeSettings
} from "./monitoring.js";

const armButton = document.querySelector("#arm-button");
const armedNote = document.querySelector("#armed-note");
const armedStatus = document.querySelector("#armed-status");
const disarmAllButton = document.querySelector("#disarm-all-button");
const disarmButton = document.querySelector("#disarm-button");
const lastAlarm = document.querySelector("#last-alarm");
const openAlarmCard = document.querySelector("#open-alarm-card");
const openDashboardButton = document.querySelector("#open-dashboard-button");
const openSettingsCard = document.querySelector("#open-settings-card");
const openTabsCard = document.querySelector("#open-tabs-card");
const popupTemplateSelect = document.querySelector("#popup-template-select");
const rulesNote = document.querySelector("#rules-note");
const rulesSummary = document.querySelector("#rules-summary");
const statusText = document.querySelector("#status-text");
const stopButton = document.querySelector("#stop-button");
const tabTitle = document.querySelector("#tab-title");
const tabsNote = document.querySelector("#tabs-note");
const tabsSummary = document.querySelector("#tabs-summary");
const tabUrl = document.querySelector("#tab-url");
const testButton = document.querySelector("#test-button");

const TITLE_MAX_CHARS = 28;
const URL_MAX_CHARS = 30;
const ALARM_MAX_CHARS = 60;

let activeTab = null;
let busy = false;
let defaultEventSelections = normalizeEventSelections();
let defaultEventConditions = normalizeEventConditions();
let defaultTriggerActionSettings = normalizeTriggerActionSettings();
let defaultTriggerActions = normalizeTriggerActions();
let savedDefaultEventSelections = normalizeEventSelections();
let savedDefaultEventConditions = normalizeEventConditions();
let savedDefaultTriggerActionSettings = normalizeTriggerActionSettings();
let savedDefaultTriggerActions = normalizeTriggerActions();
let activeRuleTemplateId = "";
let currentArmedTabCount = 0;
let ruleTemplates = [];

wireControls();
void refreshPopupState();

function wireControls() {
  armButton.addEventListener("click", () => {
    void armCurrentTab();
  });

  disarmButton.addEventListener("click", () => {
    void disarmCurrentTab();
  });

  disarmAllButton.addEventListener("click", () => {
    void disarmAllTabs();
  });

  stopButton.addEventListener("click", () => {
    void sendMessage({ type: "stop-alarm" })
      .then(() => setStatus("Alarm stopped."))
      .catch(handleError);
  });

  testButton.addEventListener("click", () => {
    void sendMessage({ type: "test-alarm" })
      .then(() => {
        const soundLabel = getSelectedAlarmSoundLabel(
          defaultTriggerActions,
          defaultTriggerActionSettings
        );
        setStatus(
          soundLabel
            ? `Playing the ${soundLabel} alarm test.`
            : "Playing the EVENTLISTENER alarm test."
        );
      })
      .catch(handleError);
  });

  openDashboardButton?.addEventListener("click", () => {
    if (!busy) {
      void openDashboardSection("rules");
    }
  });

  popupTemplateSelect?.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  popupTemplateSelect?.addEventListener("keydown", (event) => {
    event.stopPropagation();
  });

  popupTemplateSelect?.addEventListener("change", () => {
    activeRuleTemplateId = popupTemplateSelect.value;
    applySelectedTemplateToPopup();
    renderTemplatePicker();
    renderDefaultsSummary({
      armedTabCount: currentArmedTabCount
    });
    void persistActiveTemplateSelection(activeRuleTemplateId);
  });

  wireQuickCard(openAlarmCard);
  wireQuickCard(openSettingsCard);
  wireQuickCard(openTabsCard);
}

async function refreshPopupState() {
  setBusy(true);

  try {
    [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    renderActiveTab();

    const response = await getPopupState();

    savedDefaultEventSelections = response.defaultEventSelections;
    savedDefaultEventConditions = response.defaultEventConditions;
    savedDefaultTriggerActionSettings = response.defaultTriggerActionSettings;
    savedDefaultTriggerActions = response.defaultTriggerActions;
    defaultEventSelections = savedDefaultEventSelections;
    defaultEventConditions = savedDefaultEventConditions;
    defaultTriggerActionSettings = savedDefaultTriggerActionSettings;
    defaultTriggerActions = savedDefaultTriggerActions;
    currentArmedTabCount = response.armedTabCount;
    ruleTemplates = Array.isArray(response.ruleTemplates) ? response.ruleTemplates : [];
    activeRuleTemplateId = getRuleTemplateById(response.activeRuleTemplateId)?.id || "";
    applySelectedTemplateToPopup();
    renderTemplatePicker();
    renderDefaultsSummary(response);
    renderMonitoringState(response);

    const supportsPageMonitoring = /^https?:|^file:/i.test(activeTab?.url || "");

    if (!supportsPageMonitoring) {
      setStatus("This tab can still be armed, but page-level rules only work on standard web pages or file URLs.");
    } else if (response.degraded) {
      setStatus("Loaded saved settings, but the background worker is unavailable. Reload the extension if controls do not respond.");
    } else {
      setStatus("Ready. Adjust defaults in the dashboard when needed, then arm the current tab from here.");
    }
  } catch (error) {
    handleError(error);
  } finally {
    setBusy(false);
  }
}

async function armCurrentTab() {
  if (typeof activeTab?.id !== "number") {
    handleError(new Error("Could not find an active tab to arm."));
    return;
  }

  setBusy(true);

  try {
    const selectedTemplate = getRuleTemplateById(activeRuleTemplateId);

    await sendMessage({
      eventConditions: defaultEventConditions,
      eventSelections: defaultEventSelections,
      tabId: activeTab.id,
      templateId: selectedTemplate?.id || "",
      templateName: selectedTemplate?.name || "",
      title: activeTab.title || "Untitled tab",
      triggerActionSettings: defaultTriggerActionSettings,
      triggerActions: defaultTriggerActions,
      type: "arm-tab",
      url: activeTab.url || ""
    });

    setStatus(
      selectedTemplate
        ? `Current tab armed with "${selectedTemplate.name}".`
        : "Current tab armed. EVENTLISTENER will use your saved alarm rules on this tab."
    );
    await refreshPopupState();
  } catch (error) {
    handleError(error);
    setBusy(false);
  }
}

async function disarmCurrentTab() {
  if (typeof activeTab?.id !== "number") {
    handleError(new Error("Could not find an active tab to disarm."));
    return;
  }

  setBusy(true);

  try {
    await sendMessage({
      tabId: activeTab.id,
      type: "disarm-tab"
    });

    setStatus("Current tab disarmed.");
    await refreshPopupState();
  } catch (error) {
    handleError(error);
    setBusy(false);
  }
}

async function disarmAllTabs() {
  setBusy(true);

  try {
    await sendMessage({
      type: "disarm-all"
    });

    setStatus("All monitored tabs have been disarmed.");
    await refreshPopupState();
  } catch (error) {
    handleError(error);
    setBusy(false);
  }
}

function renderActiveTab() {
  const fullTitle = activeTab?.title || "No active tab";
  const fullUrl = activeTab?.url || "Open a tab to arm EVENTLISTENER.";

  tabTitle.textContent = truncateText(fullTitle, TITLE_MAX_CHARS);
  tabTitle.title = fullTitle;
  tabUrl.textContent = truncateText(fullUrl, URL_MAX_CHARS);
  tabUrl.title = fullUrl;
}

function renderDefaultsSummary(response) {
  const selectedTemplate = getRuleTemplateById(activeRuleTemplateId);
  const selectedCount = countSelectedEvents(defaultEventSelections);
  const enabledConditionCount = countEnabledConditions(
    defaultEventSelections,
    defaultEventConditions
  );
  const soundLabel = getSelectedAlarmSoundLabel(
    defaultTriggerActions,
    defaultTriggerActionSettings
  );

  rulesSummary.textContent = `${selectedCount} event group(s) / ${enabledConditionCount} live condition(s)`;
  const actionSummary = soundLabel
    ? `Actions: ${describeTriggerActions(defaultTriggerActions)}. Sound: ${soundLabel}.`
    : `Actions: ${describeTriggerActions(defaultTriggerActions)}.`;
  rulesNote.textContent = selectedTemplate
    ? `Template: ${selectedTemplate.name}. ${actionSummary}`
    : actionSummary;
  tabsSummary.textContent = formatTabCount(response.armedTabCount);
  tabsNote.textContent = response.armedTabCount === 0
    ? "No tabs are armed right now."
    : "Open the dashboard to inspect every armed tab and its applied conditions.";
}

function renderMonitoringState(response) {
  const isArmed = Boolean(response.session);
  const fullLastTriggeredText = response.lastAlarm
    ? `${describeAlarm(response.lastAlarm)} at ${formatTimestamp(response.lastAlarm.time)}`
    : "No alarms have fired yet.";
  const triggerActionLabel = describeTriggerActions(
    response.session?.triggerActions || response.defaultTriggerActions
  );

  armedStatus.textContent = isArmed ? "Armed" : "Not armed";
  armedNote.textContent = isArmed
    ? `This tab is armed to ${triggerActionLabel}. ${response.armedTabCount} tab(s) are currently monitored.`
    : `${response.armedTabCount} tab(s) are currently monitored.`;
  lastAlarm.textContent = truncateText(fullLastTriggeredText, ALARM_MAX_CHARS);
  lastAlarm.title = fullLastTriggeredText;
}

function renderTemplatePicker() {
  if (!(popupTemplateSelect instanceof HTMLSelectElement)) {
    return;
  }

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = ruleTemplates.length === 0
    ? "No templates saved"
    : "Saved defaults";

  popupTemplateSelect.replaceChildren(
    defaultOption,
    ...ruleTemplates.map((template) => {
      const option = document.createElement("option");
      option.value = template.id;
      option.textContent = template.name;
      return option;
    })
  );

  if (!getRuleTemplateById(activeRuleTemplateId)) {
    activeRuleTemplateId = "";
  }

  popupTemplateSelect.value = activeRuleTemplateId;
  popupTemplateSelect.disabled = busy || ruleTemplates.length === 0;
}

function applySelectedTemplateToPopup() {
  const selectedTemplate = getRuleTemplateById(activeRuleTemplateId);

  if (!selectedTemplate) {
    activeRuleTemplateId = "";
    defaultEventSelections = normalizeEventSelections(savedDefaultEventSelections);
    defaultEventConditions = normalizeEventConditions(savedDefaultEventConditions);
    defaultTriggerActionSettings = normalizeTriggerActionSettings(savedDefaultTriggerActionSettings);
    defaultTriggerActions = normalizeTriggerActions(savedDefaultTriggerActions);
    return;
  }

  defaultEventSelections = normalizeEventSelections(selectedTemplate.eventSelections);
  defaultEventConditions = normalizeEventConditions(selectedTemplate.eventConditions);
  defaultTriggerActionSettings = normalizeTriggerActionSettings(selectedTemplate.triggerActionSettings);
  defaultTriggerActions = normalizeTriggerActions(selectedTemplate.triggerActions);
}

async function persistActiveTemplateSelection(templateId) {
  try {
    await sendMessage({
      templateId,
      type: "set-active-rule-template"
    });
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      console.warn("EVENTLISTENER popup could not save the active template selection.", error);
    }
  }
}

function getRuleTemplateById(templateId) {
  return ruleTemplates.find((template) => template.id === templateId) || null;
}

function setBusy(isBusy) {
  busy = isBusy;
  armButton.disabled = isBusy;
  disarmAllButton.disabled = isBusy;
  disarmButton.disabled = isBusy;
  stopButton.disabled = isBusy;
  testButton.disabled = isBusy;
  if (popupTemplateSelect instanceof HTMLSelectElement) {
    popupTemplateSelect.disabled = isBusy || ruleTemplates.length === 0;
  }
  if (openDashboardButton instanceof HTMLButtonElement) {
    openDashboardButton.disabled = isBusy;
  }
  syncQuickCardState(openAlarmCard, isBusy);
  syncQuickCardState(openSettingsCard, isBusy);
  syncQuickCardState(openTabsCard, isBusy);
}

function setStatus(message) {
  statusText.textContent = message;
}

function handleError(error) {
  if (isMissingReceiverError(error)) {
    console.warn("EVENTLISTENER popup could not reach the background worker.", error);
    setStatus("Background worker unavailable. Reload the extension from chrome://extensions.");
    return;
  }

  console.error(error);
  setStatus(error instanceof Error ? error.message : "Unexpected popup failure.");
}

async function sendMessage(message) {
  const response = await sendMessageWithRetry(message);

  if (!response?.ok) {
    throw new Error(response?.error || "Unexpected extension response.");
  }

  return response;
}

async function sendMessageWithRetry(message) {
  let lastError = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      if (!isMissingReceiverError(error)) {
        throw error;
      }

      lastError = error;
      await delay(150 * (attempt + 1));
    }
  }

  throw lastError || new Error("Could not reach the extension background worker.");
}

function isMissingReceiverError(error) {
  return String(error?.message || error).includes("Receiving end does not exist");
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function getPopupState() {
  try {
    return await sendMessage({
      tabId: activeTab?.id,
      type: "get-popup-state"
    });
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      throw error;
    }

    return getPopupStateFallback();
  }
}

async function getPopupStateFallback() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const settings = normalizeSettings(stored[STORAGE_KEY]);
  const session = typeof activeTab?.id === "number"
    ? settings.monitoredTabs[String(activeTab.id)] || null
    : null;

  return {
    activeRuleTemplateId: settings.activeRuleTemplateId,
    armedTabCount: Object.keys(settings.monitoredTabs).length,
    cooldownMs: settings.cooldownMs,
    defaultEventConditions: settings.defaultEventConditions,
    defaultEventSelections: settings.defaultEventSelections,
    defaultTriggerActionSettings: settings.defaultTriggerActionSettings,
    defaultTriggerActions: settings.defaultTriggerActions,
    degraded: true,
    lastAlarm: settings.lastAlarm,
    ok: true,
    ruleTemplates: settings.ruleTemplates,
    session,
    sirenDurationMs: settings.sirenDurationMs
  };
}

async function openDashboardSection(sectionId) {
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`dashboard.html#${sectionId}`)
  });

  window.close();
}

function wireQuickCard(card) {
  if (!(card instanceof HTMLElement)) {
    return;
  }

  card.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("button, input, label, select")) {
      return;
    }

    const sectionId = card.dataset.dashboardSection;

    if (!busy && sectionId) {
      void openDashboardSection(sectionId);
    }
  });

  card.addEventListener("keydown", (event) => {
    if (busy || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    const sectionId = card.dataset.dashboardSection;

    if (!sectionId) {
      return;
    }

    event.preventDefault();
    void openDashboardSection(sectionId);
  });
}

function syncQuickCardState(card, isBusy) {
  if (!(card instanceof HTMLElement)) {
    return;
  }

  card.setAttribute("aria-disabled", String(isBusy));
  card.tabIndex = isBusy ? -1 : 0;
}

function countSelectedEvents(eventSelections) {
  return Object.values(eventSelections || {}).filter(Boolean).length;
}

function countEnabledConditions(eventSelections, eventConditions) {
  let total = 0;

  for (const [eventKey, isSelected] of Object.entries(eventSelections || {})) {
    if (!isSelected) {
      continue;
    }

    for (const condition of Object.values(eventConditions?.[eventKey] || {})) {
      if (condition?.enabled) {
        total += 1;
      }
    }
  }

  return total;
}

function formatTabCount(count) {
  return count === 1 ? "1 tab armed" : `${count} tabs armed`;
}

function truncateText(value, maxChars) {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
}

function getSelectedAlarmSoundLabel(triggerActions, triggerActionSettings) {
  const normalizedActions = normalizeTriggerActions(triggerActions);

  if (!normalizedActions.siren) {
    return "";
  }

  const normalizedSettings = normalizeTriggerActionSettings(triggerActionSettings);
  return getAlarmSoundDefinition(normalizedSettings.siren?.soundKey).label;
}
