if (!globalThis.__eventlistenerPageBridgeLoaded) {
  globalThis.__eventlistenerPageBridgeLoaded = true;

  const BRIDGE_MESSAGE_SOURCE = "eventlistener-bridge";
  const trackedDisplayStreams = new Set();
  const DISPLAY_LABEL_PATTERN = /\b(screen|window|tab)\b/i;
  const MODIFIER_ALIASES = {
    alt: "altKey",
    cmd: "metaKey",
    command: "metaKey",
    control: "ctrlKey",
    ctrl: "ctrlKey",
    meta: "metaKey",
    option: "altKey",
    shift: "shiftKey"
  };
  const SPECIAL_KEYS = {
    " ": { code: "Space", key: " " },
    arrowdown: { code: "ArrowDown", key: "ArrowDown" },
    arrowleft: { code: "ArrowLeft", key: "ArrowLeft" },
    arrowright: { code: "ArrowRight", key: "ArrowRight" },
    arrowup: { code: "ArrowUp", key: "ArrowUp" },
    backspace: { code: "Backspace", key: "Backspace" },
    backquote: { code: "Backquote", key: "`" },
    backslash: { code: "Backslash", key: "\\" },
    bracketleft: { code: "BracketLeft", key: "[" },
    bracketright: { code: "BracketRight", key: "]" },
    comma: { code: "Comma", key: "," },
    delete: { code: "Delete", key: "Delete" },
    down: { code: "ArrowDown", key: "ArrowDown" },
    end: { code: "End", key: "End" },
    enter: { code: "Enter", key: "Enter" },
    equal: { code: "Equal", key: "=" },
    esc: { code: "Escape", key: "Escape" },
    escape: { code: "Escape", key: "Escape" },
    home: { code: "Home", key: "Home" },
    insert: { code: "Insert", key: "Insert" },
    left: { code: "ArrowLeft", key: "ArrowLeft" },
    minus: { code: "Minus", key: "-" },
    numpadadd: { code: "NumpadAdd", key: "+" },
    numpaddecimal: { code: "NumpadDecimal", key: "." },
    numpaddivide: { code: "NumpadDivide", key: "/" },
    numpadenter: { code: "NumpadEnter", key: "Enter" },
    numpadmultiply: { code: "NumpadMultiply", key: "*" },
    numpadsubtract: { code: "NumpadSubtract", key: "-" },
    pagedown: { code: "PageDown", key: "PageDown" },
    pageup: { code: "PageUp", key: "PageUp" },
    period: { code: "Period", key: "." },
    quote: { code: "Quote", key: "'" },
    right: { code: "ArrowRight", key: "ArrowRight" },
    semicolon: { code: "Semicolon", key: ";" },
    slash: { code: "Slash", key: "/" },
    space: { code: "Space", key: " " },
    spacebar: { code: "Space", key: " " },
    tab: { code: "Tab", key: "Tab" },
    up: { code: "ArrowUp", key: "ArrowUp" }
  };

  patchGetDisplayMedia();

  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }

    const data = event.data;

    if (data?.source !== BRIDGE_MESSAGE_SOURCE || data?.direction !== "content-to-page") {
      return;
    }

    void handleBridgeRequest(data.requestId, data.type, data.payload || {});
  });

  async function handleBridgeRequest(requestId, type, payload) {
    try {
      let response = null;

      if (type === "execute-shortcut") {
        response = runShortcut(payload.shortcut);
      } else if (type === "stop-screen-share") {
        response = stopScreenShare();
      } else {
        response = {
          error: `Unknown page action: ${type}`,
          ok: false
        };
      }

      postResponse(requestId, response);
    } catch (error) {
      postResponse(requestId, {
        error: error instanceof Error ? error.message : String(error),
        ok: false
      });
    }
  }

  function postResponse(requestId, response = {}) {
    window.postMessage(
      {
        direction: "page-to-content",
        error: response.error || "",
        ok: Boolean(response.ok),
        requestId,
        result: response.result || null,
        source: BRIDGE_MESSAGE_SOURCE
      },
      "*"
    );
  }

  function patchGetDisplayMedia() {
    const mediaDevices = navigator.mediaDevices;

    if (!mediaDevices || typeof mediaDevices.getDisplayMedia !== "function") {
      return;
    }

    const originalGetDisplayMedia = mediaDevices.getDisplayMedia.bind(mediaDevices);

    try {
      mediaDevices.getDisplayMedia = async (...args) => {
        const stream = await originalGetDisplayMedia(...args);
        trackDisplayStream(stream);
        return stream;
      };
    } catch (error) {
      console.warn("EVENTLISTENER could not patch getDisplayMedia in the page context.", error);
    }
  }

  function trackDisplayStream(stream) {
    if (!(stream instanceof MediaStream)) {
      return;
    }

    trackedDisplayStreams.add(stream);

    for (const track of stream.getTracks()) {
      track.addEventListener(
        "ended",
        () => {
          if (stream.getTracks().every((currentTrack) => currentTrack.readyState === "ended")) {
            trackedDisplayStreams.delete(stream);
          }
        },
        {
          once: true
        }
      );
    }
  }

  function stopScreenShare() {
    const candidateStreams = new Set([
      ...trackedDisplayStreams,
      ...collectDisplayStreamsFromMediaElements()
    ]);
    let stoppedTrackCount = 0;

    for (const stream of candidateStreams) {
      const isTracked = trackedDisplayStreams.has(stream);

      if (!isTracked && !isProbablyDisplayStream(stream)) {
        continue;
      }

      for (const track of stream.getTracks()) {
        if (track.readyState === "ended") {
          continue;
        }

        track.stop();
        stoppedTrackCount += 1;
      }

      trackedDisplayStreams.delete(stream);
    }

    if (stoppedTrackCount === 0) {
      return {
        error: "No active screen share started from this page was found.",
        ok: false
      };
    }

    return {
      ok: true,
      result: {
        stoppedTrackCount
      }
    };
  }

  function collectDisplayStreamsFromMediaElements() {
    const streams = [];

    for (const element of document.querySelectorAll("audio, video")) {
      const stream = element.srcObject;

      if (stream instanceof MediaStream) {
        streams.push(stream);
      }
    }

    return streams;
  }

  function isProbablyDisplayStream(stream) {
    if (!(stream instanceof MediaStream)) {
      return false;
    }

    return stream.getTracks().some((track) => {
      const displaySurface = track.getSettings?.().displaySurface;

      if (typeof displaySurface === "string" && displaySurface.length > 0) {
        return true;
      }

      return DISPLAY_LABEL_PATTERN.test(track.label || "");
    });
  }

  function runShortcut(shortcut) {
    const parsedShortcut = parseShortcut(shortcut);

    if (!parsedShortcut.ok) {
      return parsedShortcut;
    }

    const target = getShortcutTarget();

    if (target instanceof HTMLElement && typeof target.focus === "function") {
      try {
        target.focus({
          preventScroll: true
        });
      } catch (_error) {
        target.focus();
      }
    }

    target.dispatchEvent(new KeyboardEvent("keydown", parsedShortcut.eventInit));

    if (parsedShortcut.includeKeypress) {
      target.dispatchEvent(new KeyboardEvent("keypress", parsedShortcut.eventInit));
    }

    target.dispatchEvent(new KeyboardEvent("keyup", parsedShortcut.eventInit));

    return {
      ok: true,
      result: {
        shortcut: parsedShortcut.shortcut
      }
    };
  }

  function getShortcutTarget() {
    if (document.activeElement instanceof HTMLElement) {
      return document.activeElement;
    }

    if (document.body instanceof HTMLElement) {
      return document.body;
    }

    return document.documentElement || document;
  }

  function parseShortcut(shortcut) {
    const sourceValue = String(shortcut || "").trim();

    if (!sourceValue) {
      return {
        error: "No shortcut is configured for this rule.",
        ok: false
      };
    }

    const tokens = sourceValue
      .split("+")
      .map((token) => token.trim())
      .filter(Boolean);

    if (tokens.length === 0) {
      return {
        error: "The shortcut format is empty.",
        ok: false
      };
    }

    const modifiers = {
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false
    };
    let primaryToken = "";

    for (const token of tokens) {
      const normalizedToken = token.toLowerCase();
      const modifierKey = MODIFIER_ALIASES[normalizedToken];

      if (modifierKey) {
        modifiers[modifierKey] = true;
        continue;
      }

      if (primaryToken) {
        return {
          error: `Only one non-modifier key is supported per shortcut. Received "${sourceValue}".`,
          ok: false
        };
      }

      primaryToken = token;
    }

    if (!primaryToken) {
      return {
        error: "The shortcut needs one non-modifier key.",
        ok: false
      };
    }

    const keyData = resolveKey(primaryToken);

    if (!keyData) {
      return {
        error: `The shortcut key "${primaryToken}" is not supported yet.`,
        ok: false
      };
    }

    return {
      eventInit: {
        altKey: modifiers.altKey,
        bubbles: true,
        cancelable: true,
        code: keyData.code,
        composed: true,
        ctrlKey: modifiers.ctrlKey,
        key: keyData.key,
        metaKey: modifiers.metaKey,
        shiftKey: modifiers.shiftKey
      },
      includeKeypress: keyData.includeKeypress,
      ok: true,
      shortcut: sourceValue
    };
  }

  function resolveKey(token) {
    const normalizedToken = token.toLowerCase();

    if (SPECIAL_KEYS[normalizedToken]) {
      return {
        ...SPECIAL_KEYS[normalizedToken],
        includeKeypress: normalizedToken === "enter" || normalizedToken === "space" || normalizedToken === "spacebar"
      };
    }

    if (/^numpad[0-9]$/i.test(token)) {
      const digit = token.slice(-1);
      return {
        code: `Numpad${digit}`,
        includeKeypress: true,
        key: digit
      };
    }

    if (/^f([1-9]|1[0-2])$/i.test(token)) {
      const functionKey = token.toUpperCase();
      return {
        code: functionKey,
        includeKeypress: false,
        key: functionKey
      };
    }

    if (/^[a-z]$/i.test(token)) {
      const letter = token.toUpperCase();
      return {
        code: `Key${letter}`,
        includeKeypress: true,
        key: letter
      };
    }

    if (/^[0-9]$/.test(token)) {
      return {
        code: `Digit${token}`,
        includeKeypress: true,
        key: token
      };
    }

    return null;
  }
}
