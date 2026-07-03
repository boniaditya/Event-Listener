if (!globalThis.__eventlistenerContentLoaded) {
  globalThis.__eventlistenerContentLoaded = true;

  const BRIDGE_MESSAGE_SOURCE = "eventlistener-bridge";
  let bridgeRequestCounter = 0;
  let extensionContextValid = true;
  let mutationObserver = null;

  let monitoringState = {
    armed: false,
    eventConditions: {},
    eventSelections: {}
  };

  let clickState = createActivityState();
  let scrollState = createScrollState();
  let keyboardState = createActivityState();
  let visibilityState = createVisibilityState();
  let domState = createDomState();

  void initializeMonitoringState();
  attachListeners();
  attachMutationObserver();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "monitoring-updated") {
      monitoringState = {
        armed: Boolean(message.armed),
        eventConditions: message.eventConditions || {},
        eventSelections: message.eventSelections || {}
      };

      resetPageConditionState();
      return false;
    }

    if (message?.type === "execute-shortcut") {
      void requestPageBridgeAction("execute-shortcut", {
        shortcut: message.shortcut
      }).then(sendResponse);
      return true;
    }

    if (message?.type === "stop-screen-share") {
      void requestPageBridgeAction("stop-screen-share").then(sendResponse);
      return true;
    }

    return false;
  });

  async function initializeMonitoringState() {
    try {
      const response = await sendRuntimeMessage({
        type: "get-tab-monitoring-state"
      }, "EVENTLISTENER content bootstrap failed.");

      if (response?.ok) {
        monitoringState = {
          armed: Boolean(response.armed),
          eventConditions: response.eventConditions || {},
          eventSelections: response.eventSelections || {}
        };

        resetPageConditionState();
      }
    } catch (_error) {
      // sendRuntimeMessage handles logging and stale-extension cleanup.
    }
  }

  function attachListeners() {
    document.addEventListener(
      "click",
      (event) => {
        if (!isEventEnabled("click")) {
          return;
        }

        const now = Date.now();
        clickState.lastAt = now;
        clickState.idleTriggered = false;
        scheduleClickIdleTimeout();
        evaluateBurstCondition(
          clickState,
          "click",
          "burst",
          now,
          () => `At least ${getNumberValue("click", "burst", "count")} clicks happened within ${formatUnit(getNumberValue("click", "burst", "minutes"), "minute")}. Last click: ${describeElement(event.target)}.`,
          "Click burst detected"
        );
      },
      true
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (!isEventEnabled("keyboard") || event.repeat) {
          return;
        }

        const now = Date.now();
        keyboardState.lastAt = now;
        keyboardState.idleTriggered = false;
        scheduleKeyboardIdleTimeout();
        evaluateBurstCondition(
          keyboardState,
          "keyboard",
          "burst",
          now,
          () => `At least ${getNumberValue("keyboard", "burst", "count")} key presses happened within ${formatUnit(getNumberValue("keyboard", "burst", "minutes"), "minute")}. Last key: ${event.key}.`,
          "Typing burst detected"
        );
      },
      true
    );

    document.addEventListener(
      "scroll",
      () => {
        if (!isEventEnabled("scroll")) {
          return;
        }

        const now = Date.now();

        scrollState.lastAt = now;
        queueScrollActivityReport(now);
        evaluateScrollDepth();
      },
      {
        capture: true,
        passive: true
      }
    );

    document.addEventListener("visibilitychange", () => {
      if (!isEventEnabled("visibility")) {
        return;
      }

      visibilityState.state = document.visibilityState;
      visibilityState.stateSince = Date.now();
      visibilityState.hiddenTriggered = false;
      visibilityState.visibleTriggered = false;
      scheduleVisibilityTimeouts();
    });
  }

  function attachMutationObserver() {
    mutationObserver = new MutationObserver((mutations) => {
      if (!isEventEnabled("dom")) {
        return;
      }

      domState.pendingMutationCount += mutations.length;
      window.clearTimeout(domState.flushTimer);
      domState.flushTimer = window.setTimeout(() => {
        flushDomMutations();
      }, 900);
    });

    mutationObserver.observe(document, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true
    });
  }

  function resetPageConditionState() {
    clearAllTimers();

    clickState = createActivityState();
    scrollState = createScrollState();
    keyboardState = createActivityState();
    visibilityState = createVisibilityState();
    domState = createDomState();

    if (!monitoringState.armed) {
      return;
    }

    scheduleClickIdleTimeout();
    scheduleKeyboardIdleTimeout();
    scheduleVisibilityTimeouts();
    scheduleDomIdleTimeout();
  }

  function clearAllTimers() {
    window.clearTimeout(clickState.idleTimer);
    window.clearTimeout(scrollState.activityReportTimer);
    window.clearTimeout(keyboardState.idleTimer);
    window.clearTimeout(visibilityState.hiddenTimer);
    window.clearTimeout(visibilityState.visibleTimer);
    window.clearTimeout(domState.idleTimer);
    window.clearTimeout(domState.flushTimer);
  }

  function scheduleClickIdleTimeout() {
    window.clearTimeout(clickState.idleTimer);

    if (!isConditionEnabled("click", "idleForMinutes")) {
      return;
    }

    const minutes = getNumberValue("click", "idleForMinutes", "minutes");
    const waitMs = Math.max(0, clickState.lastAt + minutesToMs(minutes) - Date.now());

    clickState.idleTimer = window.setTimeout(() => {
      if (!isConditionEnabled("click", "idleForMinutes") || clickState.idleTriggered) {
        return;
      }

      clickState.idleTriggered = true;
      void emitCondition(
        "click",
        "idleForMinutes",
        "Click idle timeout",
        `No clicks happened for more than ${formatUnit(minutes, "minute")}.`
      );
    }, waitMs);
  }

  function queueScrollActivityReport(activityAt) {
    if (!isConditionEnabled("scroll", "idleForMinutes")) {
      return;
    }

    if (activityAt - scrollState.lastReportedAt >= 1000) {
      scrollState.lastReportedAt = activityAt;
      void reportPageActivity("scroll", activityAt);
    }

    window.clearTimeout(scrollState.activityReportTimer);
    scrollState.activityReportTimer = window.setTimeout(() => {
      if (scrollState.lastReportedAt >= scrollState.lastAt) {
        return;
      }

      scrollState.lastReportedAt = scrollState.lastAt;
      void reportPageActivity("scroll", scrollState.lastAt);
    }, 200);
  }

  function scheduleKeyboardIdleTimeout() {
    window.clearTimeout(keyboardState.idleTimer);

    if (!isConditionEnabled("keyboard", "idleForMinutes")) {
      return;
    }

    const minutes = getNumberValue("keyboard", "idleForMinutes", "minutes");
    const waitMs = Math.max(0, keyboardState.lastAt + minutesToMs(minutes) - Date.now());

    keyboardState.idleTimer = window.setTimeout(() => {
      if (!isConditionEnabled("keyboard", "idleForMinutes") || keyboardState.idleTriggered) {
        return;
      }

      keyboardState.idleTriggered = true;
      void emitCondition(
        "keyboard",
        "idleForMinutes",
        "Keyboard idle timeout",
        `No key presses happened for more than ${formatUnit(minutes, "minute")}.`
      );
    }, waitMs);
  }

  function scheduleVisibilityTimeouts() {
    window.clearTimeout(visibilityState.hiddenTimer);
    window.clearTimeout(visibilityState.visibleTimer);

    if (!isEventEnabled("visibility")) {
      return;
    }

    if (visibilityState.state === "hidden" && isConditionEnabled("visibility", "hiddenForMinutes")) {
      const minutes = getNumberValue("visibility", "hiddenForMinutes", "minutes");
      const waitMs = Math.max(0, visibilityState.stateSince + minutesToMs(minutes) - Date.now());

      visibilityState.hiddenTimer = window.setTimeout(() => {
        if (
          visibilityState.state !== "hidden" ||
          visibilityState.hiddenTriggered ||
          !isConditionEnabled("visibility", "hiddenForMinutes")
        ) {
          return;
        }

        visibilityState.hiddenTriggered = true;
        void emitCondition(
          "visibility",
          "hiddenForMinutes",
          "Page hidden timeout",
          `The page stayed hidden for more than ${formatUnit(minutes, "minute")}.`
        );
      }, waitMs);
    }

    if (visibilityState.state === "visible" && isConditionEnabled("visibility", "visibleForMinutes")) {
      const minutes = getNumberValue("visibility", "visibleForMinutes", "minutes");
      const waitMs = Math.max(0, visibilityState.stateSince + minutesToMs(minutes) - Date.now());

      visibilityState.visibleTimer = window.setTimeout(() => {
        if (
          visibilityState.state !== "visible" ||
          visibilityState.visibleTriggered ||
          !isConditionEnabled("visibility", "visibleForMinutes")
        ) {
          return;
        }

        visibilityState.visibleTriggered = true;
        void emitCondition(
          "visibility",
          "visibleForMinutes",
          "Page visible timeout",
          `The page stayed visible for more than ${formatUnit(minutes, "minute")}.`
        );
      }, waitMs);
    }
  }

  function scheduleDomIdleTimeout() {
    window.clearTimeout(domState.idleTimer);

    if (!isConditionEnabled("dom", "idleForMinutes")) {
      return;
    }

    const minutes = getNumberValue("dom", "idleForMinutes", "minutes");
    const waitMs = Math.max(0, domState.lastAt + minutesToMs(minutes) - Date.now());

    domState.idleTimer = window.setTimeout(() => {
      if (!isConditionEnabled("dom", "idleForMinutes") || domState.idleTriggered) {
        return;
      }

      domState.idleTriggered = true;
      void emitCondition(
        "dom",
        "idleForMinutes",
        "DOM idle timeout",
        `No DOM changes happened for more than ${formatUnit(minutes, "minute")}.`
      );
    }, waitMs);
  }

  function evaluateBurstCondition(state, category, conditionKey, now, buildDetail, label) {
    if (!isConditionEnabled(category, conditionKey)) {
      return;
    }

    const countThreshold = getNumberValue(category, conditionKey, "count");
    const windowMs = getBurstWindowMs(category, conditionKey);

    state.burstTimes = state.burstTimes.filter((time) => now - time <= windowMs);
    state.burstTimes.push(now);

    if (state.burstTimes.length < countThreshold) {
      state.burstTriggered = false;
      return;
    }

    if (state.burstTriggered) {
      return;
    }

    state.burstTriggered = true;
    void emitCondition(category, conditionKey, label, buildDetail());
  }

  function evaluateScrollDepth() {
    if (!isConditionEnabled("scroll", "pastPercent")) {
      return;
    }

    const percent = getScrollPercent();
    const threshold = getNumberValue("scroll", "pastPercent", "percent");

    if (percent < threshold) {
      scrollState.depthTriggered = false;
      return;
    }

    if (scrollState.depthTriggered) {
      return;
    }

    scrollState.depthTriggered = true;
    void emitCondition(
      "scroll",
      "pastPercent",
      "Scroll depth reached",
      `The page was scrolled past ${threshold}%. Current depth: ${percent}%.`
    );
  }

  function flushDomMutations() {
    const mutationCount = domState.pendingMutationCount;

    domState.pendingMutationCount = 0;
    domState.flushTimer = 0;

    if (mutationCount === 0 || !isEventEnabled("dom")) {
      return;
    }

    const now = Date.now();
    domState.lastAt = now;
    domState.idleTriggered = false;
    scheduleDomIdleTimeout();

    if (!isConditionEnabled("dom", "burst")) {
      return;
    }

    const countThreshold = getNumberValue("dom", "burst", "count");
    const windowMs = secondsToMs(getNumberValue("dom", "burst", "seconds"));

    domState.burstEntries = domState.burstEntries.filter((entry) => now - entry.time <= windowMs);
    domState.burstEntries.push({
      count: mutationCount,
      time: now
    });

    const totalMutations = domState.burstEntries.reduce((total, entry) => total + entry.count, 0);

    if (totalMutations < countThreshold) {
      domState.burstTriggered = false;
      return;
    }

    if (domState.burstTriggered) {
      return;
    }

    domState.burstTriggered = true;
    void emitCondition(
      "dom",
      "burst",
      "DOM burst detected",
      `At least ${countThreshold} DOM changes happened within ${formatUnit(getNumberValue("dom", "burst", "seconds"), "second")}.`
    );
  }

  function isEventEnabled(category) {
    return Boolean(
      extensionContextValid &&
      monitoringState.armed &&
      monitoringState.eventSelections?.[category]
    );
  }

  function isConditionEnabled(category, conditionKey) {
    return Boolean(
      isEventEnabled(category) &&
      monitoringState.eventConditions?.[category]?.[conditionKey]?.enabled
    );
  }

  function getNumberValue(category, conditionKey, fieldKey) {
    return Number(monitoringState.eventConditions?.[category]?.[conditionKey]?.values?.[fieldKey] || 0);
  }

  function getBurstWindowMs(category, conditionKey) {
    if (category === "dom" && conditionKey === "burst") {
      return secondsToMs(getNumberValue(category, conditionKey, "seconds"));
    }

    return minutesToMs(getNumberValue(category, conditionKey, "minutes"));
  }

  async function emitCondition(category, conditionKey, label, detail) {
    await sendRuntimeMessage({
      category,
      conditionKey,
      detail,
      label,
      pageUrl: window.location.href,
      type: "page-condition-triggered"
    }, "EVENTLISTENER could not report a condition trigger.");
  }

  async function reportPageActivity(category, at) {
    await sendRuntimeMessage({
      at,
      category,
      type: "page-activity"
    }, "EVENTLISTENER could not report page activity.");
  }

  async function sendRuntimeMessage(message, warningMessage) {
    if (!extensionContextValid) {
      return null;
    }

    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        deactivateStaleContentScript();
        return null;
      }

      console.warn(warningMessage, error);
      return null;
    }
  }

  function deactivateStaleContentScript() {
    if (!extensionContextValid) {
      return;
    }

    extensionContextValid = false;
    monitoringState = {
      armed: false,
      eventConditions: {},
      eventSelections: {}
    };

    clearAllTimers();
    mutationObserver?.disconnect();
    globalThis.__eventlistenerContentLoaded = false;
  }

  function isExtensionContextInvalidatedError(error) {
    return String(error?.message || error).includes("Extension context invalidated");
  }

  function describeElement(target) {
    if (!(target instanceof Element)) {
      return "Unknown element";
    }

    const tagName = target.tagName.toLowerCase();
    const idPart = target.id ? `#${target.id}` : "";
    const classNames = Array.from(target.classList).slice(0, 2).join(".");
    const classPart = classNames ? `.${classNames}` : "";
    return `${tagName}${idPart}${classPart}`;
  }

  function getScrollPercent() {
    const maxScrollableDistance = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
      document.body?.scrollHeight - window.innerHeight || 0
    );

    if (maxScrollableDistance === 0) {
      return 100;
    }

    return Math.min(100, Math.round((window.scrollY / maxScrollableDistance) * 100));
  }

  function createActivityState() {
    return {
      burstTimes: [],
      burstTriggered: false,
      idleTimer: 0,
      idleTriggered: false,
      lastAt: Date.now()
    };
  }

  function createScrollState() {
    return {
      activityReportTimer: 0,
      depthTriggered: false,
      lastAt: Date.now(),
      lastReportedAt: 0
    };
  }

  function createVisibilityState() {
    return {
      hiddenTimer: 0,
      hiddenTriggered: false,
      state: document.visibilityState,
      stateSince: Date.now(),
      visibleTimer: 0,
      visibleTriggered: false
    };
  }

  function createDomState() {
    return {
      burstEntries: [],
      burstTriggered: false,
      flushTimer: 0,
      idleTimer: 0,
      idleTriggered: false,
      lastAt: Date.now(),
      pendingMutationCount: 0
    };
  }

  function minutesToMs(value) {
    return Number(value) * 60 * 1000;
  }

  function secondsToMs(value) {
    return Number(value) * 1000;
  }

  function formatUnit(value, unit) {
    return `${value} ${unit}${Number(value) === 1 ? "" : "s"}`;
  }

  function requestPageBridgeAction(type, payload = {}) {
    const requestId = `${Date.now()}-${bridgeRequestCounter++}`;

    return new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => {
        cleanup();
        resolve({
          error: "The monitored page did not respond to the requested action.",
          ok: false
        });
      }, 1800);

      function cleanup() {
        window.clearTimeout(timeoutId);
        window.removeEventListener("message", handleMessage);
      }

      function handleMessage(event) {
        if (event.source !== window) {
          return;
        }

        const data = event.data;

        if (
          data?.source !== BRIDGE_MESSAGE_SOURCE ||
          data?.direction !== "page-to-content" ||
          data?.requestId !== requestId
        ) {
          return;
        }

        cleanup();
        resolve({
          error: data.error || "",
          ok: Boolean(data.ok),
          result: data.result || null
        });
      }

      window.addEventListener("message", handleMessage);
      window.postMessage(
        {
          direction: "content-to-page",
          payload,
          requestId,
          source: BRIDGE_MESSAGE_SOURCE,
          type
        },
        "*"
      );
    });
  }
}
