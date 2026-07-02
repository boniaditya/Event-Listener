import {
  EVENT_DEFINITIONS,
  STORAGE_KEY,
  TRIGGER_ACTIONS,
  TRIGGER_ACTION_DEFINITIONS,
  describeAlarm,
  describeTriggerActions,
  formatTimestamp,
  getAlarmSoundDefinition,
  normalizeEventConditions,
  normalizeEventSelections,
  normalizeSettings,
  normalizeTriggerActionSettings,
  normalizeTriggerActions
} from "./monitoring.js";

const ACTION_ICON_MAP = Object.freeze({
  close: "close-tab",
  disarm: "shield-off",
  notification: "bell",
  shortcut: "shortcut",
  siren: "siren",
  stopSharing: "screen-share-off"
});
const EVENT_ICON_MAP = Object.freeze({
  audio: "audio",
  click: "click",
  dom: "dom",
  keyboard: "keyboard",
  scroll: "scroll",
  tab: "tab",
  visibility: "eye"
});
const ICON_SPRITE_PATH = "icons/ui-sprite.svg";
const IS_APPLE_PLATFORM = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || "");
const SVG_NS = "http://www.w3.org/2000/svg";
const SHORTCUT_MODIFIER_DEFINITIONS = Object.freeze([
  {
    key: "ctrl",
    label: "Ctrl",
    token: "Ctrl"
  },
  {
    key: "alt",
    label: IS_APPLE_PLATFORM ? "Option" : "Alt",
    token: IS_APPLE_PLATFORM ? "Option" : "Alt"
  },
  {
    key: "shift",
    label: "Shift",
    token: "Shift"
  },
  {
    key: "meta",
    label: IS_APPLE_PLATFORM ? "Cmd" : "Meta",
    token: IS_APPLE_PLATFORM ? "Cmd" : "Meta"
  }
]);
const SHORTCUT_PRIMARY_OPTIONS = Object.freeze(buildShortcutPrimaryOptions());

const actionChoice = document.querySelector("#action-choice");
const dashboardTabButtons = document.querySelectorAll("[data-dashboard-tab]");
const dashboardPanels = document.querySelectorAll("[data-dashboard-panel]");
const disarmAllButton = document.querySelector("#disarm-all-button");
const eventList = document.querySelector("#event-list");
const lastAlarm = document.querySelector("#last-alarm");
const monitoredTabsList = document.querySelector("#monitored-tabs");
const refreshButton = document.querySelector("#refresh-button");
const statusText = document.querySelector("#status-text");
const summaryActionPlan = document.querySelector("#summary-action-plan");
const summaryArmedCount = document.querySelector("#summary-armed-count");
const summaryArmedNote = document.querySelector("#summary-armed-note");
const summaryCooldown = document.querySelector("#summary-cooldown");
const summaryRuleCount = document.querySelector("#summary-rule-count");
const summaryRuleNote = document.querySelector("#summary-rule-note");

let busy = false;
let currentEventSelections = normalizeEventSelections();
let currentEventConditions = normalizeEventConditions();
let currentTriggerActionSettings = normalizeTriggerActionSettings();
let currentTriggerActions = normalizeTriggerActions();

renderActionControls();
renderEventControls();
wireControls();
syncDashboardTabFromHash();
void refreshDashboardState();

function wireControls() {
  actionChoice.addEventListener("change", (event) => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement
    ) {
      if (event.target instanceof HTMLInputElement && event.target.name === "trigger-action") {
        void handleTriggerActionChange();
        return;
      }

      if (event.target.classList.contains("action-setting-field")) {
        void handleTriggerActionSettingsChange();
      }
    }
  });

  disarmAllButton.addEventListener("click", () => {
    void disarmAllTabs();
  });

  refreshButton.addEventListener("click", () => {
    void refreshDashboardState();
  });

  for (const button of dashboardTabButtons) {
    button.addEventListener("click", () => {
      setDashboardTab(button.dataset.dashboardTab || "rules");
    });
  }

  window.addEventListener("hashchange", () => {
    syncDashboardTabFromHash();
  });

  monitoredTabsList.addEventListener("click", (event) => {
    const trigger = event.target instanceof Element
      ? event.target.closest("button")
      : null;

    if (!(trigger instanceof HTMLButtonElement)) {
      return;
    }

    if (trigger.dataset.action === "focus-tab") {
      void focusTab(Number(trigger.dataset.tabId));
      return;
    }

    if (trigger.dataset.action === "disarm-tab") {
      void disarmTab(Number(trigger.dataset.tabId));
    }
  });
}

async function refreshDashboardState() {
  setBusy(true);

  try {
    const response = await getDashboardState();

    currentEventSelections = response.defaultEventSelections;
    currentEventConditions = response.defaultEventConditions;
    currentTriggerActionSettings = response.defaultTriggerActionSettings;
    currentTriggerActions = response.defaultTriggerActions;

    syncEventControls(currentEventSelections, currentEventConditions);
    syncTriggerActionControls(currentTriggerActions, currentTriggerActionSettings);
    renderSummary(response);
    renderMonitoredTabs(response.monitoredTabs);

    if (response.degraded) {
      setStatus("Loaded saved settings from storage. Reload the extension if live actions do not respond.");
    } else {
      setStatus("Saved defaults are ready. Update the rule editor here, then arm tabs from the popup.");
    }
  } catch (error) {
    handleError(error);
  } finally {
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
    await refreshDashboardState();
  } catch (error) {
    handleError(error);
    setBusy(false);
  }
}

async function disarmTab(tabId) {
  if (!Number.isFinite(tabId)) {
    handleError(new Error("Could not determine which monitored tab to disarm."));
    return;
  }

  setBusy(true);

  try {
    await sendMessage({
      tabId,
      type: "disarm-tab"
    });

    setStatus(`Tab ${tabId} has been disarmed.`);
    await refreshDashboardState();
  } catch (error) {
    handleError(error);
    setBusy(false);
  }
}

async function focusTab(tabId) {
  if (!Number.isFinite(tabId)) {
    handleError(new Error("Could not determine which monitored tab to open."));
    return;
  }

  try {
    const tab = await chrome.tabs.get(tabId);

    if (typeof tab.windowId === "number") {
      await chrome.windows.update(tab.windowId, {
        focused: true
      });
    }

    await chrome.tabs.update(tabId, {
      active: true
    });

    setStatus(`Moved focus to tab ${tabId}.`);
  } catch (error) {
    handleError(new Error("That tab is no longer available."));
  }
}

function renderActionControls() {
  actionChoice.replaceChildren(
    ...TRIGGER_ACTION_DEFINITIONS.map((definition) => {
      const option = document.createElement("label");
      option.className = "action-option";
      option.dataset.actionKey = definition.key;

      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "trigger-action";
      input.value = definition.key;

      const copy = document.createElement("span");
      copy.className = "action-option-copy";

      const title = buildIconText(
        ACTION_ICON_MAP[definition.key] || "spark",
        definition.label,
        "action-option-head",
        "action-option-title"
      );

      const note = document.createElement("span");
      note.className = "action-option-note";
      note.textContent = definition.description;

      copy.append(title, note);

      if ((definition.fields || []).length > 0) {
        const details = document.createElement("div");
        details.className = "action-option-details";
        details.hidden = true;

        for (const field of definition.fields) {
          details.append(buildActionSettingField(definition, field));
        }

        copy.append(details);
      }

      option.append(input, copy);
      return option;
    })
  );
}

function renderEventControls() {
  eventList.replaceChildren(
    ...EVENT_DEFINITIONS.map((definition) => {
      const item = document.createElement("section");
      item.className = "event-item";
      item.dataset.eventKey = definition.key;

      const eventToggle = document.createElement("label");
      eventToggle.className = "event-toggle";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "event-checkbox";
      checkbox.dataset.eventKey = definition.key;
      checkbox.addEventListener("change", handleEventSelectionChange);

      const copy = document.createElement("span");
      copy.className = "event-copy";

      const title = buildIconText(
        EVENT_ICON_MAP[definition.key] || "monitor",
        definition.label,
        "event-title-row",
        "event-title"
      );

      const description = document.createElement("span");
      description.className = "event-description";
      description.textContent = definition.description;

      copy.append(title, description);
      eventToggle.append(checkbox, copy);

      const conditions = document.createElement("div");
      conditions.className = "event-conditions";

      const conditionsTitle = document.createElement("span");
      conditionsTitle.className = "event-conditions-title";
      conditionsTitle.textContent = "Alarm conditions";

      const conditionsList = document.createElement("div");
      conditionsList.className = "condition-list";

      for (const condition of definition.conditions || []) {
        conditionsList.append(renderConditionControl(definition, condition));
      }

      conditions.append(conditionsTitle, conditionsList);
      item.append(eventToggle, conditions);
      return item;
    })
  );
}

function renderConditionControl(definition, condition) {
  const item = document.createElement("section");
  item.className = "condition-item";
  item.dataset.eventKey = definition.key;
  item.dataset.conditionKey = condition.key;

  const toggle = document.createElement("label");
  toggle.className = "condition-toggle";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "condition-checkbox";
  checkbox.dataset.eventKey = definition.key;
  checkbox.dataset.conditionKey = condition.key;
  checkbox.addEventListener("change", handleConditionToggleChange);

  const label = document.createElement("span");
  label.className = "condition-label";
  label.textContent = condition.label;

  toggle.append(checkbox, label);

  const sentence = document.createElement("div");
  sentence.className = "condition-sentence";

  for (const token of condition.sentence || []) {
    if (typeof token === "string") {
      const text = document.createElement("span");
      text.className = "condition-text";
      text.textContent = token;
      sentence.append(text);
      continue;
    }

    const field = condition.fields.find((currentField) => currentField.key === token.fieldKey);

    if (!field) {
      continue;
    }

    sentence.append(buildConditionField(definition, condition, field));
  }

  item.append(toggle, sentence);
  return item;
}

function buildConditionField(definition, condition, field) {
  const input = document.createElement("input");
  input.className = "condition-field";
  input.dataset.conditionKey = condition.key;
  input.dataset.eventKey = definition.key;
  input.dataset.fieldKey = field.key;
  input.placeholder = field.placeholder || "";
  input.type = field.type === "number" ? "number" : "text";
  input.addEventListener("change", handleConditionValueChange);

  if (field.type === "number") {
    if (typeof field.min === "number") {
      input.min = String(field.min);
    }

    if (typeof field.max === "number") {
      input.max = String(field.max);
    }

    if (typeof field.step === "number") {
      input.step = String(field.step);
    }
  }

  return input;
}

function buildShortcutCaptureField(input) {
  input.classList.add("shortcut-capture-field");
  input.placeholder = "Click here, then press the shortcut";
  input.readOnly = true;
  input.spellcheck = false;
  input.autocomplete = "off";
  input.addEventListener("keydown", handleShortcutFieldKeydown);
}

function syncEventControls(eventSelections, eventConditions) {
  const eventItems = eventList.querySelectorAll(".event-item");

  for (const eventItem of eventItems) {
    const eventKey = eventItem.dataset.eventKey;
    const isSelected = Boolean(eventSelections[eventKey]);
    const eventCheckbox = eventItem.querySelector(".event-checkbox");

    if (eventCheckbox) {
      eventCheckbox.checked = isSelected;
      eventCheckbox.disabled = busy;
    }

    eventItem.classList.toggle("is-expanded", isSelected);

    const conditionItems = eventItem.querySelectorAll(".condition-item");

    for (const conditionItem of conditionItems) {
      const conditionKey = conditionItem.dataset.conditionKey;
      const conditionConfig = eventConditions?.[eventKey]?.[conditionKey];
      const isConditionEnabled = Boolean(conditionConfig?.enabled);
      const conditionCheckbox = conditionItem.querySelector(".condition-checkbox");

      if (conditionCheckbox) {
        conditionCheckbox.checked = isConditionEnabled;
        conditionCheckbox.disabled = busy || !isSelected;
      }

      conditionItem.classList.toggle("is-enabled", isConditionEnabled && isSelected);

      const fieldInputs = conditionItem.querySelectorAll(".condition-field");

      for (const fieldInput of fieldInputs) {
        const fieldValue = conditionConfig?.values?.[fieldInput.dataset.fieldKey];
        fieldInput.value = fieldValue ?? "";
        fieldInput.disabled = busy || !isSelected || !isConditionEnabled;
      }
    }
  }
}

async function handleEventSelectionChange() {
  currentEventSelections = collectEventSelections();
  syncEventControls(currentEventSelections, currentEventConditions);
  await persistEventConfiguration("Saved default event selection.");
}

async function handleConditionToggleChange() {
  currentEventConditions = collectEventConditions();
  syncEventControls(currentEventSelections, currentEventConditions);
  await persistEventConfiguration("Saved default condition update.");
}

async function handleConditionValueChange() {
  currentEventConditions = collectEventConditions();
  syncEventControls(currentEventSelections, currentEventConditions);
  await persistEventConfiguration("Saved default condition update.");
}

async function handleTriggerActionChange() {
  currentTriggerActions = collectTriggerActions();
  currentTriggerActionSettings = collectTriggerActionSettings();
  syncTriggerActionControls(currentTriggerActions, currentTriggerActionSettings);
  await persistEventConfiguration(
    `Saved default actions. Matching rules will ${describeTriggerActions(currentTriggerActions)}.`
  );
}

async function handleTriggerActionSettingsChange() {
  currentTriggerActionSettings = collectTriggerActionSettings();
  syncTriggerActionControls(currentTriggerActions, currentTriggerActionSettings);
  await persistEventConfiguration("Saved default action settings.");
}

function collectEventSelections() {
  const checkboxes = eventList.querySelectorAll(".event-checkbox");
  const eventSelections = {};

  for (const checkbox of checkboxes) {
    eventSelections[checkbox.dataset.eventKey] = checkbox.checked;
  }

  return normalizeEventSelections(eventSelections);
}

function collectEventConditions() {
  const nextConditions = normalizeEventConditions(currentEventConditions);

  for (const definition of EVENT_DEFINITIONS) {
    for (const condition of definition.conditions || []) {
      const conditionCheckbox = eventList.querySelector(
        `.condition-checkbox[data-event-key="${definition.key}"][data-condition-key="${condition.key}"]`
      );

      const nextCondition = {
        enabled: Boolean(conditionCheckbox?.checked),
        values: {}
      };

      for (const field of condition.fields || []) {
        const input = eventList.querySelector(
          `.condition-field[data-event-key="${definition.key}"][data-condition-key="${condition.key}"][data-field-key="${field.key}"]`
        );

        nextCondition.values[field.key] = field.type === "number"
          ? Number(input?.value)
          : input?.value || "";
      }

      nextConditions[definition.key][condition.key] = nextCondition;
    }
  }

  return normalizeEventConditions(nextConditions);
}

function collectTriggerActions() {
  const nextActions = {};
  const actionInputs = actionChoice.querySelectorAll("input[name='trigger-action']");

  for (const input of actionInputs) {
    nextActions[input.value] = input.checked;
  }

  return normalizeTriggerActions(nextActions);
}

function collectTriggerActionSettings() {
  const nextSettings = normalizeTriggerActionSettings(currentTriggerActionSettings);

  for (const definition of TRIGGER_ACTION_DEFINITIONS) {
    for (const field of definition.fields || []) {
      const control = actionChoice.querySelector(
        `.action-setting-field[data-action-key="${definition.key}"][data-field-key="${field.key}"]`
      );

      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) {
        continue;
      }

      nextSettings[definition.key][field.key] = field.type === "number"
        ? Number(control.value)
        : control.value || "";
    }
  }

  return normalizeTriggerActionSettings(nextSettings);
}

async function persistEventConfiguration(successMessage) {
  try {
    await sendMessage({
      eventConditions: currentEventConditions,
      eventSelections: currentEventSelections,
      triggerActionSettings: currentTriggerActionSettings,
      triggerActions: currentTriggerActions,
      type: "set-event-configuration"
    });

    setStatus(successMessage);
  } catch (error) {
    handleError(error);
  }
}

function renderSummary(response) {
  const selectedCount = countSelectedEvents(response.defaultEventSelections);
  const enabledConditionCount = countEnabledConditions(
    response.defaultEventSelections,
    response.defaultEventConditions
  );
  const fullLastTriggeredText = response.lastAlarm
    ? `${describeAlarm(response.lastAlarm)} at ${formatTimestamp(response.lastAlarm.time)}`
    : "No alarms have fired yet.";

  summaryArmedCount.textContent = formatTabCount(response.armedTabCount);
  summaryArmedNote.textContent = response.armedTabCount === 0
    ? "No tabs are armed right now."
    : "Open the live coverage tab to review the rules already applied to each armed tab.";
  summaryRuleCount.textContent = `${selectedCount} event group(s) / ${enabledConditionCount} live condition(s)`;
  summaryRuleNote.textContent = selectedCount === 0
    ? "All event groups are currently off by default."
    : "These defaults are copied when you arm a tab from the popup.";
  summaryActionPlan.textContent = buildActionPlanSummary(
    response.defaultTriggerActions,
    response.defaultTriggerActionSettings
  );
  summaryCooldown.textContent = `${Math.round(response.cooldownMs / 1000)} seconds`;
  lastAlarm.textContent = fullLastTriggeredText;
  lastAlarm.title = fullLastTriggeredText;
}

function renderMonitoredTabs(monitoredTabs) {
  if (!Array.isArray(monitoredTabs) || monitoredTabs.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    const title = buildIconText("stack", "No live coverage yet", "empty-state-head");
    const copy = document.createElement("div");
    copy.className = "detail-copy";
    copy.textContent = "Arm a tab from the popup and it will appear here with its saved rule set.";
    emptyState.append(title, copy);
    monitoredTabsList.replaceChildren(emptyState);
    return;
  }

  monitoredTabsList.replaceChildren(
    ...monitoredTabs.map(({ session, tabId }) => buildMonitoredTabCard(session, tabId))
  );
}

function buildMonitoredTabCard(session, tabId) {
  const card = document.createElement("article");
  card.className = "monitored-card";

  const header = document.createElement("div");
  header.className = "monitored-header";

  const titleBlock = document.createElement("div");
  titleBlock.className = "monitored-title-block";

  const title = document.createElement("h3");
  title.className = "monitored-title";
  title.append(buildIconText("tab", session.title || "Untitled tab", "title-with-icon"));

  const url = document.createElement("span");
  url.className = "monitored-url";
  url.textContent = session.url || "No URL saved for this tab.";
  url.title = session.url || "";

  titleBlock.append(title, url);

  const badge = document.createElement("span");
  badge.className = "tab-badge";
  badge.textContent = `Tab ${tabId}`;

  header.append(titleBlock, badge);

  const metaRow = document.createElement("div");
  metaRow.className = "meta-row";
  metaRow.append(
    buildMetaChip(`Armed at ${formatTimestamp(session.armedAt)}`, "clock"),
    buildMetaChip(toSentenceCase(describeTriggerActions(session.triggerActions)), "spark")
  );

  const detailGrid = document.createElement("div");
  detailGrid.className = "monitored-detail-grid";

  const actionsCard = document.createElement("div");
  actionsCard.className = "detail-card";
  actionsCard.append(
    buildDetailLabel("Actions", "spark"),
    buildDetailCopy(buildTriggerActionCopy(session.triggerActions, session.triggerActionSettings))
  );

  const rulesCard = document.createElement("div");
  rulesCard.className = "detail-card";
  rulesCard.append(buildDetailLabel("Applied conditions", "sliders"));

  const ruleLines = buildRuleLines(session.eventSelections, session.eventConditions);

  if (ruleLines.length === 0) {
    rulesCard.append(
      buildDetailCopy("No enabled conditions are active on this tab yet.")
    );
  } else {
    const ruleList = document.createElement("div");
    ruleList.className = "rule-list";

    for (const line of ruleLines) {
      const item = document.createElement("div");
      item.className = "rule-line";

      const label = document.createElement("strong");
      label.textContent = `${line.label}: `;

      item.append(label, document.createTextNode(line.copy));
      ruleList.append(item);
    }

    rulesCard.append(ruleList);
  }

  detailGrid.append(actionsCard, rulesCard);

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const focusButton = document.createElement("button");
  focusButton.className = "mini-button";
  focusButton.type = "button";
  focusButton.dataset.action = "focus-tab";
  focusButton.dataset.tabId = String(tabId);
  focusButton.append(buildIconText("focus", "Focus Tab", "mini-button-content"));

  const disarmButton = document.createElement("button");
  disarmButton.className = "mini-button";
  disarmButton.type = "button";
  disarmButton.dataset.action = "disarm-tab";
  disarmButton.dataset.tabId = String(tabId);
  disarmButton.append(buildIconText("shield-off", "Disarm Tab", "mini-button-content"));

  actions.append(focusButton, disarmButton);
  card.append(header, metaRow, detailGrid, actions);
  return card;
}

function buildRuleLines(eventSelections, eventConditions) {
  const lines = [];

  for (const definition of EVENT_DEFINITIONS) {
    if (!eventSelections?.[definition.key]) {
      continue;
    }

    for (const condition of definition.conditions || []) {
      const config = eventConditions?.[definition.key]?.[condition.key];

      if (!config?.enabled) {
        continue;
      }

      lines.push({
        copy: buildConditionSentence(condition, config.values),
        label: definition.label
      });
    }
  }

  return lines;
}

function buildConditionSentence(condition, values = {}) {
  return (condition.sentence || []).map((token) => {
    if (typeof token === "string") {
      return token;
    }

    return values[token.fieldKey] ?? "";
  }).join(" ").replace(/\s+([.,%])/g, "$1").trim();
}

function buildMetaChip(label, iconName) {
  const chip = document.createElement("span");
  chip.className = "meta-chip";
  chip.append(buildIconText(iconName, label, "meta-chip-content"));
  return chip;
}

function buildDetailLabel(label, iconName) {
  const element = document.createElement("span");
  element.className = "detail-label";
  element.append(buildIconText(iconName, label, "detail-label-row"));
  return element;
}

function buildDetailCopy(copy) {
  const element = document.createElement("div");
  element.className = "detail-copy";
  element.textContent = copy;
  return element;
}

function buildActionSettingField(definition, field) {
  const label = document.createElement("label");
  label.className = "action-setting";

  const heading = document.createElement("span");
  heading.className = "action-setting-label";
  heading.textContent = field.label;

  const control = buildActionSettingControl(definition, field);

  label.append(heading, control);

  if (field.description) {
    const note = document.createElement("span");
    note.className = "action-setting-note";
    note.textContent = field.description;
    label.append(note);
  }

  return label;
}

function buildActionSettingControl(definition, field) {
  if (definition.key === TRIGGER_ACTIONS.SHORTCUT && field.key === "accelerator") {
    return buildShortcutComposer(definition, field);
  }

  if (definition.key === TRIGGER_ACTIONS.SIREN && field.key === "soundKey") {
    return buildAlarmSoundControl(definition, field);
  }

  if (field.type === "select") {
    const select = document.createElement("select");
    select.className = "action-setting-field";
    select.dataset.actionKey = definition.key;
    select.dataset.fieldKey = field.key;

    for (const optionDefinition of field.options || []) {
      const option = document.createElement("option");
      option.value = optionDefinition.value;
      option.textContent = optionDefinition.label;
      select.append(option);
    }

    return select;
  }

  const input = document.createElement("input");
  input.className = "action-setting-field";
  input.dataset.actionKey = definition.key;
  input.dataset.fieldKey = field.key;
  input.placeholder = field.placeholder || "";
  input.type = field.type === "number" ? "number" : "text";

  if (field.type === "number") {
    if (typeof field.min === "number") {
      input.min = String(field.min);
    }

    if (typeof field.max === "number") {
      input.max = String(field.max);
    }

    if (typeof field.step === "number") {
      input.step = String(field.step);
    }
  }

  return input;
}

function buildAlarmSoundControl(definition, field) {
  const row = document.createElement("div");
  row.className = "action-setting-row";

  const select = document.createElement("select");
  select.className = "action-setting-field";
  select.dataset.actionKey = definition.key;
  select.dataset.fieldKey = field.key;

  for (const optionDefinition of field.options || []) {
    const option = document.createElement("option");
    option.value = optionDefinition.value;
    option.textContent = optionDefinition.label;
    select.append(option);
  }

  const previewButton = document.createElement("button");
  previewButton.className = "action-preview-button";
  previewButton.dataset.actionKey = definition.key;
  previewButton.type = "button";
  previewButton.append(buildIconText("audio", "Preview", "link-content"));
  previewButton.addEventListener("click", async () => {
    const soundDefinition = getAlarmSoundDefinition(select.value);

    try {
      await sendMessage({
        durationMs: 2800,
        soundKey: soundDefinition.key,
        type: "test-alarm"
      });

      setStatus(`Previewing ${soundDefinition.label}.`);
    } catch (error) {
      handleError(error);
    }
  });

  row.append(select, previewButton);
  return row;
}

function buildShortcutComposer(definition, field) {
  const composer = document.createElement("div");
  composer.className = "shortcut-composer";

  const previewGroup = document.createElement("div");
  previewGroup.className = "shortcut-preview-group";

  const previewHeading = document.createElement("span");
  previewHeading.className = "shortcut-preview-heading";
  previewHeading.textContent = "Selected shortcut";

  const previewDisplay = document.createElement("div");
  previewDisplay.className = "shortcut-preview-display is-empty";

  const previewValue = document.createElement("span");
  previewValue.className = "shortcut-preview-value";
  previewValue.textContent = "Choose modifiers and a key below";

  previewDisplay.append(previewValue);

  const preview = document.createElement("input");
  preview.className = "action-setting-field shortcut-preview-input";
  preview.dataset.actionKey = definition.key;
  preview.dataset.fieldKey = field.key;
  preview.type = "text";
  preview.hidden = true;
  previewGroup.append(previewHeading, previewDisplay, preview);

  const builder = document.createElement("div");
  builder.className = "shortcut-builder";

  const captureGroup = document.createElement("div");
  captureGroup.className = "shortcut-capture-group";

  const captureHeading = document.createElement("span");
  captureHeading.className = "shortcut-capture-heading";
  captureHeading.textContent = "Choose shortcut from keyboard";

  const captureInput = document.createElement("input");
  captureInput.className = "action-setting-field shortcut-capture-field shortcut-capture-input";
  captureInput.placeholder = "Click here, then press the shortcut on your keyboard";
  captureInput.type = "text";
  buildShortcutCaptureField(captureInput);

  const modifierGrid = document.createElement("div");
  modifierGrid.className = "shortcut-modifier-grid";

  for (const modifier of SHORTCUT_MODIFIER_DEFINITIONS) {
    const modifierLabel = document.createElement("label");
    modifierLabel.className = "shortcut-modifier";

    const modifierInput = document.createElement("input");
    modifierInput.className = "shortcut-modifier-input";
    modifierInput.type = "checkbox";
    modifierInput.dataset.shortcutModifier = modifier.key;
    modifierInput.addEventListener("change", () => {
      syncShortcutComposerValue(composer);
    });

    const modifierCopy = document.createElement("span");
    modifierCopy.className = "shortcut-modifier-copy";
    modifierCopy.textContent = modifier.label;

    modifierLabel.append(modifierInput, modifierCopy);
    modifierGrid.append(modifierLabel);
  }

  const keyRow = document.createElement("div");
  keyRow.className = "shortcut-key-row";

  const keySelect = document.createElement("select");
  keySelect.className = "action-setting-field shortcut-key-select";
  keySelect.dataset.shortcutPrimary = "true";
  keySelect.addEventListener("change", () => {
    syncShortcutComposerValue(composer);
  });

  for (const optionDefinition of SHORTCUT_PRIMARY_OPTIONS) {
    const option = document.createElement("option");
    option.value = optionDefinition.value;
    option.textContent = optionDefinition.label;
    keySelect.append(option);
  }

  const clearButton = document.createElement("button");
  clearButton.className = "shortcut-clear-button";
  clearButton.type = "button";
  clearButton.textContent = "Clear";
  clearButton.addEventListener("click", () => {
    resetShortcutComposer(composer);
    updateShortcutFieldValue(preview, "");
  });

  keyRow.append(keySelect, clearButton);
  captureGroup.append(captureHeading, captureInput);
  builder.append(captureGroup, modifierGrid, keyRow);
  composer.append(previewGroup, builder);
  return composer;
}

function buildShortcutPrimaryOptions() {
  const options = [
    {
      label: "Choose key",
      value: ""
    }
  ];

  for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    options.push({
      label: letter,
      value: letter
    });
  }

  for (const digit of "0123456789") {
    options.push({
      label: digit,
      value: digit
    });
  }

  for (let digit = 0; digit <= 9; digit += 1) {
    options.push({
      label: `Numpad ${digit}`,
      value: `Numpad${digit}`
    });
  }

  options.push(
    { label: "Space", value: "Space" },
    { label: "Enter", value: "Enter" },
    { label: "Tab", value: "Tab" },
    { label: "Escape", value: "Escape" },
    { label: "Backspace", value: "Backspace" },
    { label: "Delete", value: "Delete" },
    { label: "Arrow Up", value: "ArrowUp" },
    { label: "Arrow Down", value: "ArrowDown" },
    { label: "Arrow Left", value: "ArrowLeft" },
    { label: "Arrow Right", value: "ArrowRight" },
    { label: "Home", value: "Home" },
    { label: "End", value: "End" },
    { label: "Page Up", value: "PageUp" },
    { label: "Page Down", value: "PageDown" },
    { label: "Numpad Enter", value: "NumpadEnter" },
    { label: "Numpad Plus (+)", value: "NumpadAdd" },
    { label: "Numpad Minus (-)", value: "NumpadSubtract" },
    { label: "Numpad Multiply (*)", value: "NumpadMultiply" },
    { label: "Numpad Divide (/)", value: "NumpadDivide" },
    { label: "Numpad Decimal (.)", value: "NumpadDecimal" },
    { label: "Minus (-)", value: "Minus" },
    { label: "Equal (=)", value: "Equal" },
    { label: "Comma (,)", value: "Comma" },
    { label: "Period (.)", value: "Period" },
    { label: "Slash (/)", value: "Slash" },
    { label: "Semicolon (;)", value: "Semicolon" },
    { label: "Quote (')", value: "Quote" },
    { label: "Backquote (`)", value: "Backquote" },
    { label: "Backslash (\\)", value: "Backslash" },
    { label: "Left Bracket ([)", value: "BracketLeft" },
    { label: "Right Bracket (])", value: "BracketRight" }
  );

  for (let functionKey = 1; functionKey <= 12; functionKey += 1) {
    options.push({
      label: `F${functionKey}`,
      value: `F${functionKey}`
    });
  }

  return options;
}

function syncShortcutComposerValue(composer) {
  const preview = composer.querySelector(".shortcut-preview-input");

  if (!(preview instanceof HTMLInputElement)) {
    return;
  }

  updateShortcutFieldValue(preview, buildShortcutValueFromComposer(composer));
}

function buildShortcutValueFromComposer(composer) {
  const tokens = [];

  for (const modifier of SHORTCUT_MODIFIER_DEFINITIONS) {
    const input = composer.querySelector(`[data-shortcut-modifier="${modifier.key}"]`);

    if (input instanceof HTMLInputElement && input.checked) {
      tokens.push(modifier.token);
    }
  }

  const primarySelect = composer.querySelector("[data-shortcut-primary='true']");

  if (primarySelect instanceof HTMLSelectElement && primarySelect.value) {
    tokens.push(primarySelect.value);
  }

  return tokens.join("+");
}

function resetShortcutComposer(composer) {
  const primarySelect = composer.querySelector("[data-shortcut-primary='true']");

  if (primarySelect instanceof HTMLSelectElement) {
    primarySelect.value = "";
  }

  for (const input of composer.querySelectorAll("[data-shortcut-modifier]")) {
    if (input instanceof HTMLInputElement) {
      input.checked = false;
    }
  }
}

function syncShortcutComposerFromValue(composer, value, isDisabled) {
  if (!(composer instanceof HTMLElement)) {
    return;
  }

  applyShortcutComposerState(composer, value, isDisabled);
}

function applyShortcutComposerState(composer, value, isDisabled) {
  if (!(composer instanceof HTMLElement)) {
    return;
  }

  const parsed = parseShortcutValue(value);
  const nextValue = String(value || "");
  const preview = composer.querySelector(".shortcut-preview-input");
  const previewDisplay = composer.querySelector(".shortcut-preview-display");
  const previewValue = composer.querySelector(".shortcut-preview-value");
  const captureInput = composer.querySelector(".shortcut-capture-input");
  const primarySelect = composer.querySelector("[data-shortcut-primary='true']");
  const clearButton = composer.querySelector(".shortcut-clear-button");

  if (preview instanceof HTMLInputElement) {
    preview.value = nextValue;
    preview.disabled = isDisabled;
  }

  if (captureInput instanceof HTMLInputElement) {
    captureInput.value = nextValue ? formatShortcutPreview(nextValue) : "";
    captureInput.disabled = isDisabled;
  }

  if (previewDisplay instanceof HTMLElement && previewValue instanceof HTMLElement) {
    const hasValue = Boolean(nextValue);
    previewDisplay.classList.toggle("is-empty", !hasValue);
    previewDisplay.setAttribute(
      "aria-label",
      hasValue ? `Selected shortcut ${formatShortcutPreview(nextValue)}` : "No shortcut selected yet"
    );
    previewDisplay.title = hasValue ? nextValue : "";
    previewValue.textContent = hasValue
      ? formatShortcutPreview(nextValue)
      : "Choose modifiers and a key below";
  }

  if (primarySelect instanceof HTMLSelectElement) {
    primarySelect.value = parsed.primaryKey;
    primarySelect.disabled = isDisabled;
  }

  if (clearButton instanceof HTMLButtonElement) {
    clearButton.disabled = isDisabled;
  }

  for (const modifier of SHORTCUT_MODIFIER_DEFINITIONS) {
    const input = composer.querySelector(`[data-shortcut-modifier="${modifier.key}"]`);

    if (!(input instanceof HTMLInputElement)) {
      continue;
    }

    input.checked = parsed.modifiers.has(modifier.key);
    input.disabled = isDisabled;
  }
}

function setShortcutFieldValue(input, value, dispatchChange = true) {
  const nextValue = String(value || "");
  const composer = input.closest(".shortcut-composer");

  if (composer instanceof HTMLElement) {
    applyShortcutComposerState(composer, nextValue, input.disabled);
  } else {
    input.value = nextValue;
  }

  if (dispatchChange) {
    input.dispatchEvent(new Event("change", {
      bubbles: true
    }));
  }
}

function formatShortcutPreview(value) {
  return String(value || "")
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean)
    .join(" + ");
}

function parseShortcutValue(value) {
  const tokens = String(value || "")
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);
  const modifiers = new Set();
  let primaryKey = "";

  for (const token of tokens) {
    const normalizedModifier = normalizeShortcutModifierToken(token);

    if (normalizedModifier) {
      modifiers.add(normalizedModifier);
      continue;
    }

    if (!primaryKey && hasShortcutPrimaryOption(token)) {
      primaryKey = token;
    }
  }

  return {
    modifiers,
    primaryKey
  };
}

function normalizeShortcutModifierToken(token) {
  const normalized = String(token || "").toLowerCase();

  if (normalized === "ctrl" || normalized === "control") {
    return "ctrl";
  }

  if (normalized === "alt" || normalized === "option") {
    return "alt";
  }

  if (normalized === "shift") {
    return "shift";
  }

  if (normalized === "cmd" || normalized === "command" || normalized === "meta") {
    return "meta";
  }

  return "";
}

function hasShortcutPrimaryOption(value) {
  return SHORTCUT_PRIMARY_OPTIONS.some((option) => option.value === value);
}

function handleShortcutFieldKeydown(event) {
  if (!(event.currentTarget instanceof HTMLInputElement)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const shortcut = formatShortcutFromKeyboardEvent(event);

  if (!shortcut) {
    if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey &&
      (event.key === "Backspace" || event.key === "Delete")
    ) {
      updateShortcutFieldValue(event.currentTarget, "");
    }

    return;
  }

  updateShortcutFieldValue(event.currentTarget, shortcut);
}

function updateShortcutFieldValue(input, value) {
  setShortcutFieldValue(input, value);
}

function formatShortcutFromKeyboardEvent(event) {
  const keyToken = getShortcutKeyToken(event);

  if (!keyToken) {
    return "";
  }

  const tokens = [];

  if (event.ctrlKey) {
    tokens.push("Ctrl");
  }

  if (event.altKey) {
    tokens.push(IS_APPLE_PLATFORM ? "Option" : "Alt");
  }

  if (event.shiftKey) {
    tokens.push("Shift");
  }

  if (event.metaKey) {
    tokens.push(IS_APPLE_PLATFORM ? "Cmd" : "Meta");
  }

  tokens.push(keyToken);
  return tokens.join("+");
}

function getShortcutKeyToken(event) {
  if (!event.key || isModifierKey(event.key)) {
    return "";
  }

  const code = event.code || "";
  const codeTokenMap = {
    ArrowDown: "ArrowDown",
    ArrowLeft: "ArrowLeft",
    ArrowRight: "ArrowRight",
    ArrowUp: "ArrowUp",
    Backquote: "Backquote",
    Backslash: "Backslash",
    BracketLeft: "BracketLeft",
    BracketRight: "BracketRight",
    Comma: "Comma",
    Delete: "Delete",
    End: "End",
    Enter: "Enter",
    Equal: "Equal",
    Escape: "Escape",
    Home: "Home",
    Insert: "Insert",
    Minus: "Minus",
    PageDown: "PageDown",
    PageUp: "PageUp",
    Period: "Period",
    Quote: "Quote",
    Semicolon: "Semicolon",
    Slash: "Slash",
    Space: "Space",
    Tab: "Tab"
  };

  if (codeTokenMap[code]) {
    return codeTokenMap[code];
  }

  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }

  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }

  if (/^F([1-9]|1[0-2])$/.test(code)) {
    return code;
  }

  if (/^Numpad[0-9]$/.test(code)) {
    return code;
  }

  const numpadTokenMap = {
    NumpadAdd: "NumpadAdd",
    NumpadDecimal: "NumpadDecimal",
    NumpadDivide: "NumpadDivide",
    NumpadEnter: "NumpadEnter",
    NumpadMultiply: "NumpadMultiply",
    NumpadSubtract: "NumpadSubtract"
  };

  if (numpadTokenMap[code]) {
    return numpadTokenMap[code];
  }

  if (event.key.length === 1 && /[A-Za-z0-9]/.test(event.key)) {
    return event.key.toUpperCase();
  }

  return "";
}

function isModifierKey(key) {
  return ["Alt", "Control", "Meta", "Shift"].includes(key);
}

function buildTriggerActionCopy(triggerActions, triggerActionSettings) {
  const normalizedActions = normalizeTriggerActions(triggerActions);
  const normalizedSettings = normalizeTriggerActionSettings(triggerActionSettings);
  const segments = [`When a rule fires, EVENTLISTENER will ${describeTriggerActions(triggerActions)}.`];

  if (normalizedActions.siren) {
    const soundName = getAlarmSoundDefinition(normalizedSettings.siren?.soundKey).label;
    segments.push(`Selected sound: ${soundName}.`);
  }

  if (normalizedActions.shortcut) {
    const shortcut = String(normalizedSettings.shortcut?.accelerator || "").trim();
    segments.push(
      shortcut
        ? `Configured shortcut: ${shortcut}.`
        : "Configured shortcut: not set yet."
    );
  }

  if (normalizedActions.stopSharing) {
    segments.push("Screen-share stop only affects page-managed shares that the extension can still reach.");
  }

  return segments.join(" ");
}

function buildActionPlanSummary(triggerActions, triggerActionSettings) {
  const summary = toSentenceCase(describeTriggerActions(triggerActions));
  const normalizedActions = normalizeTriggerActions(triggerActions);
  const normalizedSettings = normalizeTriggerActionSettings(triggerActionSettings);

  if (!normalizedActions.siren) {
    return summary;
  }

  const soundName = getAlarmSoundDefinition(normalizedSettings.siren?.soundKey).label;
  return `${summary} (${soundName})`;
}

function countSelectedEvents(eventSelections) {
  return Object.values(eventSelections || {}).filter(Boolean).length;
}

function countEnabledConditions(eventSelections, eventConditions) {
  let total = 0;

  for (const definition of EVENT_DEFINITIONS) {
    if (!eventSelections?.[definition.key]) {
      continue;
    }

    for (const condition of definition.conditions || []) {
      if (eventConditions?.[definition.key]?.[condition.key]?.enabled) {
        total += 1;
      }
    }
  }

  return total;
}

function formatTabCount(count) {
  return count === 1 ? "1 tab armed" : `${count} tabs armed`;
}

function toSentenceCase(text) {
  if (!text) {
    return "";
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function buildIcon(name, className = "ui-icon") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", className);

  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `${ICON_SPRITE_PATH}#${name}`);
  svg.append(use);
  return svg;
}

function buildIconText(iconName, text, wrapperClass, textClass = "") {
  const wrapper = document.createElement("span");
  wrapper.className = wrapperClass;
  wrapper.append(buildIcon(iconName));

  if (!text) {
    return wrapper;
  }

  const copy = document.createElement("span");

  if (textClass) {
    copy.className = textClass;
  }

  copy.textContent = text;
  wrapper.append(copy);
  return wrapper;
}

function syncDashboardTabFromHash() {
  const requestedTab = window.location.hash === "#tabs" ? "tabs" : "rules";
  applyDashboardTabState(requestedTab);
}

function setDashboardTab(tabKey) {
  const nextHash = tabKey === "tabs" ? "#tabs" : "#rules";

  if (window.location.hash === nextHash) {
    applyDashboardTabState(tabKey);
    return;
  }

  window.location.hash = nextHash;
}

function applyDashboardTabState(activeTab) {
  for (const button of dashboardTabButtons) {
    const isActive = button.dataset.dashboardTab === activeTab;
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  }

  for (const panel of dashboardPanels) {
    const isActive = panel.dataset.dashboardPanel === activeTab;
    panel.hidden = !isActive;
  }
}

function setBusy(isBusy) {
  busy = isBusy;
  disarmAllButton.disabled = isBusy;
  refreshButton.disabled = isBusy;
  syncEventControls(currentEventSelections, currentEventConditions);
  syncTriggerActionControls(currentTriggerActions);

  for (const button of monitoredTabsList.querySelectorAll("button")) {
    button.disabled = isBusy;
  }
}

function setStatus(message) {
  statusText.textContent = message;
}

function handleError(error) {
  if (isMissingReceiverError(error)) {
    console.warn("EVENTLISTENER dashboard could not reach the background worker.", error);
    setStatus("Background worker unavailable. Reload the extension from chrome://extensions.");
    return;
  }

  console.error(error);
  setStatus(error instanceof Error ? error.message : "Unexpected dashboard failure.");
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

async function getDashboardState() {
  try {
    return await sendMessage({
      type: "get-dashboard-state"
    });
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      throw error;
    }

    return getDashboardStateFallback();
  }
}

async function getDashboardStateFallback() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const settings = normalizeSettings(stored[STORAGE_KEY]);

  return {
    armedTabCount: Object.keys(settings.monitoredTabs).length,
    cooldownMs: settings.cooldownMs,
    defaultEventConditions: settings.defaultEventConditions,
    defaultEventSelections: settings.defaultEventSelections,
    defaultTriggerActionSettings: settings.defaultTriggerActionSettings,
    defaultTriggerActions: settings.defaultTriggerActions,
    degraded: true,
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

function syncTriggerActionControls(triggerActions, triggerActionSettings = currentTriggerActionSettings) {
  const normalized = normalizeTriggerActions(triggerActions);
  const normalizedSettings = normalizeTriggerActionSettings(triggerActionSettings);
  const actionInputs = actionChoice.querySelectorAll("input[name='trigger-action']");

  for (const input of actionInputs) {
    input.checked = Boolean(normalized[input.value]);
    input.disabled = busy;
  }

  for (const definition of TRIGGER_ACTION_DEFINITIONS) {
    const isEnabled = Boolean(normalized[definition.key]);
    const option = actionChoice.querySelector(`.action-option[data-action-key="${definition.key}"]`);
    const details = option?.querySelector(".action-option-details");

    option?.classList.toggle("is-selected", isEnabled);

    if (details instanceof HTMLElement) {
      details.hidden = !isEnabled;
    }

    for (const field of definition.fields || []) {
      const input = actionChoice.querySelector(
        `.action-setting-field[data-action-key="${definition.key}"][data-field-key="${field.key}"]`
      );
      const nextValue = normalizedSettings[definition.key]?.[field.key] ?? "";
      const isDisabled = busy || !isEnabled;

      if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) {
        continue;
      }

      if (definition.key === TRIGGER_ACTIONS.SHORTCUT && field.key === "accelerator") {
        syncShortcutComposerFromValue(input.closest(".shortcut-composer"), nextValue, isDisabled);
        continue;
      }

      input.value = nextValue;
      input.disabled = isDisabled;

      if (definition.key === TRIGGER_ACTIONS.SIREN && field.key === "soundKey") {
        const previewButton = option?.querySelector(".action-preview-button");

        if (previewButton instanceof HTMLButtonElement) {
          previewButton.disabled = isDisabled;
        }
      }
    }
  }
}
