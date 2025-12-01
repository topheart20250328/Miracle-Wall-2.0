
const AUDIO_PREF_KEY = "wallAudioPreference";
const AUDIO_PREF_ON = "on";
const AUDIO_PREF_OFF = "off";

const state = {
  unlocked: false,
  attempting: false,
  listenersBound: false,
  lastError: null,
  enabled: true,
  resumeOnVisible: false,
  tryUnlock: null,
  audioElement: null,
  toggleElement: null
};

export function initAudioManager(audioElement, toggleElement) {
  state.audioElement = audioElement;
  state.toggleElement = toggleElement;
  state.unlocked = !audioElement;
  state.enabled = loadAudioPreference() !== AUDIO_PREF_OFF;

  if (toggleElement) {
    toggleElement.addEventListener("change", (event) => {
      setAudioPreference(Boolean(event.target.checked));
    });
  }

  setupBackgroundAudioAutoplay();
  updateAudioToggleUI();
}

export function setAudioPreference(enabled) {
  state.enabled = Boolean(enabled);
  persistAudioPreference(enabled ? AUDIO_PREF_ON : AUDIO_PREF_OFF);
  updateAudioToggleUI();
  applyAudioPreference();
}

function setupBackgroundAudioAutoplay() {
  if (!state.audioElement) {
    return;
  }
  const interactionEvents = ["pointerdown", "touchstart", "keydown"];

  const tryUnlock = (reason = "auto") => {
    if (!state.enabled || state.unlocked || state.attempting) {
      return;
    }
    state.attempting = true;
    const attempt = state.audioElement.play();
    if (!attempt || typeof attempt.then !== "function") {
      state.unlocked = true;
      state.attempting = false;
      detachInteractionListeners();
      return;
    }
    attempt
      .then(() => {
        state.unlocked = true;
        state.attempting = false;
        detachInteractionListeners();
      })
      .catch((error) => {
        state.attempting = false;
        state.lastError = error;
        console.warn("背景音樂播放遭到阻擋 (" + reason + ")", error);
      });
  };

  state.tryUnlock = tryUnlock;

  const handleInteraction = (event) => {
    if (!state.enabled) {
      return;
    }
    tryUnlock(event.type);
  };

  const detachInteractionListeners = () => {
    if (!state.listenersBound) {
      return;
    }
    interactionEvents.forEach((eventName) => document.removeEventListener(eventName, handleInteraction));
    state.listenersBound = false;
  };

  interactionEvents.forEach((eventName) => document.addEventListener(eventName, handleInteraction, { passive: true }));
  state.listenersBound = true;

  const handleVisibilityChange = () => {
    if (!state.audioElement) {
      return;
    }
    if (document.visibilityState === "hidden") {
      if (!state.audioElement.paused && state.enabled) {
        state.resumeOnVisible = true;
        pauseBackgroundAudioSafely("背景音樂暫停失敗");
      } else {
        state.resumeOnVisible = false;
      }
      return;
    }
    if (document.visibilityState === "visible") {
      if (state.resumeOnVisible && state.enabled) {
        tryUnlock("visibility");
      }
      state.resumeOnVisible = false;
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);

  if (state.enabled) {
    tryUnlock("auto");
  } else {
    state.audioElement.muted = true;
    pauseBackgroundAudioSafely("背景音樂靜音失敗");
  }
  updateAudioToggleUI();
}

function pauseBackgroundAudioSafely(logLabel) {
  if (!state.audioElement) {
    return;
  }
  try {
    const result = state.audioElement.pause();
    if (result && typeof result.catch === "function") {
      result.catch((error) => console.warn(logLabel, error));
    }
  } catch (error) {
    console.warn(logLabel, error);
  }
}

function applyAudioPreference() {
  if (!state.audioElement) {
    return;
  }
  if (!state.enabled) {
    state.audioElement.muted = true;
    state.resumeOnVisible = false;
    pauseBackgroundAudioSafely("背景音樂靜音失敗");
    return;
  }
  state.audioElement.muted = false;
  if (state.unlocked) {
    if (state.audioElement.paused) {
      state.audioElement.play().catch((error) => console.warn("背景音樂播放失敗", error));
    }
    return;
  }
  state.tryUnlock?.("preference");
}

export function updateAudioToggleUI() {
  if (!state.toggleElement) {
    return;
  }
  state.toggleElement.checked = Boolean(state.enabled);
}

function loadAudioPreference() {
  if (typeof window === "undefined" || !window.localStorage) {
    return AUDIO_PREF_ON;
  }
  try {
    return window.localStorage.getItem(AUDIO_PREF_KEY) ?? AUDIO_PREF_ON;
  } catch (error) {
    console.warn("Failed to load audio preference", error);
    return AUDIO_PREF_ON;
  }
}

function persistAudioPreference(value) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(AUDIO_PREF_KEY, value);
  } catch (error) {
    console.warn("Failed to save audio preference", error);
  }
}
