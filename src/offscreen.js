import { DEFAULT_ALARM_SOUND_KEY } from "./monitoring.js";

const MIN_GAIN = 0.0001;

let audioContext = null;
let activePlayback = null;
let cleanupTimer = 0;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== "offscreen") {
    return false;
  }

  void handleMessage(message)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.error("EVENTLISTENER offscreen audio failed.", error);
      sendResponse({
        error: error instanceof Error ? error.message : "Unexpected offscreen failure.",
        ok: false
      });
    });

  return true;
});

async function handleMessage(message) {
  if (message.type === "play-siren") {
    await playSiren(message.durationMs, message.soundKey);
    return;
  }

  if (message.type === "stop-siren") {
    stopSiren();
  }
}

async function playSiren(durationMs = 8000, soundKey = DEFAULT_ALARM_SOUND_KEY) {
  stopSiren();

  const context = await getAudioContext();
  const playback = createPlayback(context);
  const durationSeconds = Math.max(1, durationMs / 1000);
  const builder = SOUND_BUILDERS[soundKey] || SOUND_BUILDERS[DEFAULT_ALARM_SOUND_KEY];

  builder(playback, durationSeconds);

  activePlayback = playback;
  window.clearTimeout(cleanupTimer);
  cleanupTimer = window.setTimeout(() => {
    if (activePlayback === playback) {
      cleanupPlayback(playback);
      activePlayback = null;
    }
  }, durationMs + 600);
}

function stopSiren() {
  if (!activePlayback) {
    return;
  }

  const playback = activePlayback;
  const stopAt = playback.context.currentTime + 0.08;

  try {
    playback.masterGain.gain.cancelScheduledValues(playback.context.currentTime);
    playback.masterGain.gain.setValueAtTime(0.14, playback.context.currentTime);
    playback.masterGain.gain.linearRampToValueAtTime(MIN_GAIN, stopAt);
  } catch (error) {
    console.warn("EVENTLISTENER could not ramp down the alarm gain.", error);
  }

  for (const oscillator of playback.oscillators) {
    try {
      oscillator.stop(stopAt);
    } catch (_error) {
      // Some short-lived tones may already be stopped by the time the user interrupts playback.
    }
  }

  window.clearTimeout(cleanupTimer);
  cleanupTimer = window.setTimeout(() => {
    cleanupPlayback(playback);
  }, 180);
  activePlayback = null;
}

function createPlayback(context) {
  const masterGain = context.createGain();
  masterGain.gain.setValueAtTime(MIN_GAIN, context.currentTime);
  masterGain.connect(context.destination);

  return {
    context,
    masterGain,
    nodes: [masterGain],
    oscillators: []
  };
}

function armMasterEnvelope(playback, durationSeconds, peakGain = 0.16) {
  const now = playback.context.currentTime;
  const sustainUntil = now + Math.max(0.16, durationSeconds - 0.16);

  playback.masterGain.gain.setValueAtTime(MIN_GAIN, now);
  playback.masterGain.gain.linearRampToValueAtTime(peakGain, now + 0.05);
  playback.masterGain.gain.setValueAtTime(peakGain, sustainUntil);
  playback.masterGain.gain.linearRampToValueAtTime(MIN_GAIN, now + durationSeconds + 0.22);
}

function scheduleTone(playback, options) {
  const context = playback.context;
  const start = context.currentTime + (options.start || 0);
  const duration = Math.max(0.05, options.duration || 0.2);
  const stopAt = start + duration + (options.release || 0.08) + 0.05;
  const gainNode = context.createGain();
  const oscillator = context.createOscillator();
  const attack = options.attack ?? 0.01;
  const holdUntil = Math.max(start + attack, start + duration - (options.release || 0.08));
  const gain = options.gain ?? 0.1;
  const frequency = options.frequency ?? 440;
  const frequencyEnd = options.frequencyEnd ?? frequency;

  oscillator.type = options.type || "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.linearRampToValueAtTime(frequencyEnd, start + duration);

  if (typeof options.detune === "number") {
    oscillator.detune.setValueAtTime(options.detune, start);
  }

  gainNode.gain.setValueAtTime(MIN_GAIN, start);
  gainNode.gain.linearRampToValueAtTime(gain, start + attack);
  gainNode.gain.setValueAtTime(gain, holdUntil);
  gainNode.gain.linearRampToValueAtTime(MIN_GAIN, start + duration + (options.release || 0.08));

  oscillator.connect(gainNode);
  gainNode.connect(playback.masterGain);

  oscillator.start(start);
  oscillator.stop(stopAt);

  playback.oscillators.push(oscillator);
  playback.nodes.push(gainNode, oscillator);
}

function repeatPattern(durationSeconds, intervalSeconds, callback) {
  for (let start = 0; start < durationSeconds; start += intervalSeconds) {
    callback(start);
  }
}

function buildAmbulance(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.18);

  repeatPattern(durationSeconds, 1.4, (start) => {
    scheduleTone(playback, {
      duration: 1.4,
      frequency: 640,
      frequencyEnd: 940,
      gain: 0.085,
      start,
      type: "sawtooth"
    });
    scheduleTone(playback, {
      duration: 1.4,
      frequency: 980,
      frequencyEnd: 1320,
      gain: 0.05,
      start,
      type: "triangle"
    });
  });
}

function buildKlaxon(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.18);
  const pattern = [430, 360, 430];

  repeatPattern(durationSeconds, 0.9, (start) => {
    pattern.forEach((frequency, index) => {
      const pulseStart = start + index * 0.28;
      scheduleTone(playback, {
        duration: 0.18,
        frequency,
        gain: 0.095,
        release: 0.05,
        start: pulseStart,
        type: "square"
      });
      scheduleTone(playback, {
        duration: 0.2,
        frequency: frequency * 0.5,
        gain: 0.035,
        release: 0.06,
        start: pulseStart,
        type: "sawtooth"
      });
    });
  });
}

function buildBeacon(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.15);

  repeatPattern(durationSeconds, 0.75, (start) => {
    scheduleTone(playback, {
      attack: 0.005,
      duration: 0.16,
      frequency: 920,
      frequencyEnd: 1080,
      gain: 0.11,
      release: 0.09,
      start,
      type: "triangle"
    });
    scheduleTone(playback, {
      attack: 0.005,
      duration: 0.12,
      frequency: 1380,
      frequencyEnd: 1540,
      gain: 0.045,
      release: 0.08,
      start: start + 0.08,
      type: "sine"
    });
  });
}

function buildSonar(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.15);

  repeatPattern(durationSeconds, 1.05, (start) => {
    scheduleTone(playback, {
      attack: 0.004,
      duration: 0.45,
      frequency: 1240,
      frequencyEnd: 720,
      gain: 0.115,
      release: 0.18,
      start,
      type: "sine"
    });
    scheduleTone(playback, {
      attack: 0.004,
      duration: 0.38,
      frequency: 1860,
      frequencyEnd: 1080,
      gain: 0.04,
      release: 0.15,
      start: start + 0.02,
      type: "triangle"
    });
  });
}

function buildPulse(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.18);

  repeatPattern(durationSeconds, 0.48, (start) => {
    scheduleTone(playback, {
      duration: 0.22,
      frequency: 180,
      frequencyEnd: 132,
      gain: 0.12,
      release: 0.12,
      start,
      type: "triangle"
    });
    scheduleTone(playback, {
      duration: 0.26,
      frequency: 90,
      frequencyEnd: 78,
      gain: 0.055,
      release: 0.14,
      start,
      type: "sine"
    });
  });
}

function buildWarning(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.16);

  repeatPattern(durationSeconds, 0.68, (start) => {
    scheduleTone(playback, {
      duration: 0.13,
      frequency: 880,
      gain: 0.12,
      release: 0.05,
      start,
      type: "square"
    });
    scheduleTone(playback, {
      duration: 0.18,
      frequency: 620,
      gain: 0.105,
      release: 0.06,
      start: start + 0.23,
      type: "square"
    });
    scheduleTone(playback, {
      duration: 0.1,
      frequency: 880,
      gain: 0.08,
      release: 0.05,
      start: start + 0.47,
      type: "triangle"
    });
  });
}

function buildChime(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.14);
  const notes = [784, 988, 1175];

  repeatPattern(durationSeconds, 1.7, (start) => {
    notes.forEach((frequency, index) => {
      scheduleTone(playback, {
        duration: 0.32,
        frequency,
        gain: [0.09, 0.07, 0.055][index],
        release: 0.14,
        start: start + index * 0.18,
        type: "sine"
      });
    });
  });
}

function buildShimmer(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.13);
  const notes = [1320, 1480, 1760, 1480, 1568];

  repeatPattern(durationSeconds, 1.1, (start) => {
    notes.forEach((frequency, index) => {
      scheduleTone(playback, {
        attack: 0.005,
        duration: 0.14,
        frequency,
        gain: 0.055,
        release: 0.08,
        start: start + index * 0.12,
        type: index % 2 === 0 ? "triangle" : "sine"
      });
    });
  });
}

function buildArcade(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.15);
  const notes = [1318, 988, 784, 1175];

  repeatPattern(durationSeconds, 0.95, (start) => {
    notes.forEach((frequency, index) => {
      scheduleTone(playback, {
        duration: 0.11,
        frequency,
        gain: 0.095,
        release: 0.04,
        start: start + index * 0.13,
        type: "square"
      });
    });
  });
}

function buildRadar(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.145);

  repeatPattern(durationSeconds, 0.42, (start) => {
    scheduleTone(playback, {
      attack: 0.005,
      duration: 0.1,
      frequency: 540,
      frequencyEnd: 980,
      gain: 0.09,
      release: 0.06,
      start,
      type: "sine"
    });
    scheduleTone(playback, {
      attack: 0.005,
      duration: 0.07,
      frequency: 980,
      frequencyEnd: 540,
      gain: 0.04,
      release: 0.05,
      start: start + 0.17,
      type: "triangle"
    });
  });
}

function buildBell(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.16);

  repeatPattern(durationSeconds, 1.5, (start) => {
    scheduleBellCluster(playback, start, 660);
  });
}

function buildUplink(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.14);
  const notes = [330, 440, 660, 880, 990];

  repeatPattern(durationSeconds, 1.45, (start) => {
    notes.forEach((frequency, index) => {
      scheduleTone(playback, {
        duration: 0.1,
        frequency,
        frequencyEnd: frequency * 1.04,
        gain: 0.07,
        release: 0.06,
        start: start + index * 0.11,
        type: index < 2 ? "triangle" : "sawtooth"
      });
    });
  });
}

function buildAirhorn(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.18);

  repeatPattern(durationSeconds, 0.88, (start) => {
    scheduleTone(playback, {
      duration: 0.42,
      frequency: 392,
      frequencyEnd: 418,
      gain: 0.12,
      release: 0.12,
      start,
      type: "sawtooth"
    });
    scheduleTone(playback, {
      duration: 0.42,
      frequency: 196,
      frequencyEnd: 208,
      gain: 0.05,
      release: 0.14,
      start,
      type: "square"
    });
  });
}

function buildCascade(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.14);
  const notes = [1244, 1046, 880, 740, 622];

  repeatPattern(durationSeconds, 1.05, (start) => {
    notes.forEach((frequency, index) => {
      scheduleTone(playback, {
        duration: 0.14,
        frequency,
        frequencyEnd: frequency * 0.985,
        gain: 0.075 - index * 0.007,
        release: 0.08,
        start: start + index * 0.12,
        type: index % 2 === 0 ? "triangle" : "sine"
      });
    });
  });
}

function buildEcho(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.135);

  repeatPattern(durationSeconds, 0.94, (start) => {
    scheduleTone(playback, {
      attack: 0.004,
      duration: 0.16,
      frequency: 988,
      gain: 0.105,
      release: 0.1,
      start,
      type: "sine"
    });
    scheduleTone(playback, {
      attack: 0.004,
      duration: 0.14,
      frequency: 988,
      gain: 0.055,
      release: 0.08,
      start: start + 0.18,
      type: "triangle"
    });
    scheduleTone(playback, {
      attack: 0.004,
      duration: 0.12,
      frequency: 988,
      gain: 0.03,
      release: 0.08,
      start: start + 0.34,
      type: "triangle"
    });
  });
}

function buildFlare(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.16);

  repeatPattern(durationSeconds, 0.86, (start) => {
    scheduleTone(playback, {
      duration: 0.24,
      frequency: 620,
      frequencyEnd: 980,
      gain: 0.095,
      release: 0.08,
      start,
      type: "sawtooth"
    });
    scheduleTone(playback, {
      duration: 0.2,
      frequency: 980,
      frequencyEnd: 1480,
      gain: 0.05,
      release: 0.08,
      start: start + 0.12,
      type: "triangle"
    });
  });
}

function buildIntercom(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.13);

  repeatPattern(durationSeconds, 1.2, (start) => {
    scheduleTone(playback, {
      duration: 0.16,
      frequency: 784,
      gain: 0.085,
      release: 0.06,
      start,
      type: "square"
    });
    scheduleTone(playback, {
      duration: 0.22,
      frequency: 523,
      gain: 0.075,
      release: 0.08,
      start: start + 0.22,
      type: "square"
    });
  });
}

function buildOrbit(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.145);
  const notes = [523, 659, 784, 659];

  repeatPattern(durationSeconds, 0.82, (start) => {
    notes.forEach((frequency, index) => {
      scheduleTone(playback, {
        duration: 0.13,
        frequency,
        frequencyEnd: frequency * 1.018,
        gain: 0.075,
        release: 0.06,
        start: start + index * 0.14,
        type: index % 2 === 0 ? "triangle" : "sine"
      });
    });
  });
}

function buildQuartz(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.125);
  const notes = [1568, 1760, 2093];

  repeatPattern(durationSeconds, 0.92, (start) => {
    notes.forEach((frequency, index) => {
      scheduleTone(playback, {
        attack: 0.004,
        duration: 0.1,
        frequency,
        gain: 0.06 - index * 0.008,
        release: 0.09,
        start: start + index * 0.1,
        type: "triangle"
      });
    });
  });
}

function buildReactor(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.17);

  repeatPattern(durationSeconds, 0.64, (start) => {
    scheduleTone(playback, {
      duration: 0.3,
      frequency: 164,
      frequencyEnd: 148,
      gain: 0.12,
      release: 0.14,
      start,
      type: "sawtooth"
    });
    scheduleTone(playback, {
      duration: 0.16,
      frequency: 740,
      gain: 0.04,
      release: 0.08,
      start: start + 0.09,
      type: "triangle"
    });
  });
}

function buildSentinel(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.14);

  repeatPattern(durationSeconds, 1.02, (start) => {
    scheduleTone(playback, {
      duration: 0.1,
      frequency: 698,
      gain: 0.095,
      release: 0.05,
      start,
      type: "square"
    });
    scheduleTone(playback, {
      duration: 0.1,
      frequency: 698,
      gain: 0.085,
      release: 0.05,
      start: start + 0.18,
      type: "square"
    });
    scheduleTone(playback, {
      duration: 0.16,
      frequency: 988,
      gain: 0.045,
      release: 0.07,
      start: start + 0.44,
      type: "triangle"
    });
  });
}

function buildTremor(playback, durationSeconds) {
  armMasterEnvelope(playback, durationSeconds, 0.18);

  repeatPattern(durationSeconds, 0.44, (start) => {
    scheduleTone(playback, {
      duration: 0.22,
      frequency: 172,
      frequencyEnd: 126,
      gain: 0.11,
      release: 0.1,
      start,
      type: "triangle"
    });
    scheduleTone(playback, {
      duration: 0.18,
      frequency: 86,
      frequencyEnd: 72,
      gain: 0.05,
      release: 0.1,
      start: start + 0.04,
      type: "sine"
    });
  });
}

function scheduleBellCluster(playback, start, baseFrequency) {
  const harmonics = [1, 2.02, 2.99, 4.18];
  const gains = [0.1, 0.05, 0.03, 0.02];
  const durations = [1.05, 0.82, 0.64, 0.44];

  harmonics.forEach((harmonic, index) => {
    const frequency = baseFrequency * harmonic;
    scheduleTone(playback, {
      attack: 0.004,
      duration: durations[index],
      frequency,
      frequencyEnd: frequency * 0.988,
      gain: gains[index],
      release: 0.22,
      start,
      type: "sine"
    });
  });
}

const SOUND_BUILDERS = Object.freeze({
  airhorn: buildAirhorn,
  ambulance: buildAmbulance,
  arcade: buildArcade,
  beacon: buildBeacon,
  bell: buildBell,
  cascade: buildCascade,
  chime: buildChime,
  echo: buildEcho,
  flare: buildFlare,
  intercom: buildIntercom,
  klaxon: buildKlaxon,
  orbit: buildOrbit,
  pulse: buildPulse,
  quartz: buildQuartz,
  radar: buildRadar,
  reactor: buildReactor,
  sentinel: buildSentinel,
  shimmer: buildShimmer,
  sonar: buildSonar,
  tremor: buildTremor,
  uplink: buildUplink,
  warning: buildWarning
});

async function getAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  return audioContext;
}

function cleanupPlayback(playback) {
  for (const node of playback.nodes) {
    try {
      node.disconnect();
    } catch (error) {
      console.warn("EVENTLISTENER playback cleanup was partial.", error);
    }
  }
}
