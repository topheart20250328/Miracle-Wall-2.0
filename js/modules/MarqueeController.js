
import { clampNumber } from "./Utils.js";

const MAX_ACTIVE_MARQUEE_LINES = 3;
const MIN_ACTIVE_MARQUEE_LINES = 2;
const MARQUEE_STAGGER_DELAY_MS = 3800;
const MARQUEE_RESPAWN_DELAY_MS = 900;
const MARQUEE_SEED_JITTER_MS = 900;
const MARQUEE_RESPAWN_JITTER_MS = 450;
const MARQUEE_RECENT_COUNT = 5;
const MARQUEE_RECENT_WEIGHT = 3;
const MARQUEE_SPEED_PX_PER_SEC = 60;
const MARQUEE_MIN_DURATION_MS = 20000;
const MARQUEE_MAX_DURATION_MS = 600000;
const MOBILE_VIEWPORT_QUERY = "(max-width: 640px)";
const MOBILE_VISIBLE_MARQUEE_INDICES = new Set([0, 1, 4, 5]);
const MOBILE_SEED_BURST_COUNT = 2;

const marqueeState = {
  pool: [],
  activeLines: new Set(),
  activeMessages: new Set(),
  pendingTimeouts: new Set(),
  lineCursor: 0,
  activeLimit: 0,
  initialized: false,
  mobileViewport: null,
  layer: null,
  lines: [],
  onItemClick: null
};

export function initMarqueeController(layer, lines, onItemClick) {
  marqueeState.layer = layer;
  marqueeState.lines = lines;
  marqueeState.onItemClick = onItemClick;
}

export function initMarqueeTicker() {
  if (!marqueeState.lines.length) {
    return;
  }
  initMarqueeViewportWatcher();
  resetMarqueeTicker();
  setupMarqueeLineListeners();
  marqueeState.initialized = true;
  refreshMarqueeFlow(true, true);
}

export function updateMarqueePool(stickersMap, reviewSettings) {
  if (!marqueeState.lines.length) {
    return;
  }
  const requireApproval = reviewSettings.requireMarqueeApproval;
  const eligibleRecords = Array.from(stickersMap.values()).filter((record) => {
    const note = (record.note ?? "").trim();
    if (!note) {
      return false;
    }
    return requireApproval ? Boolean(record.isApproved) : true;
  });
  
  // Store full records instead of just strings to keep IDs
  const baseItems = eligibleRecords.map((record) => ({
    text: record.note.trim(),
    id: record.id
  }));

  // Removed recent weighting logic to ensure equal probability for all messages
  marqueeState.pool = baseItems;
  if (marqueeState.initialized) {
    refreshMarqueeFlow();
  }
}

function initMarqueeViewportWatcher() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    marqueeState.mobileViewport = null;
    return;
  }
  marqueeState.mobileViewport = window.matchMedia(MOBILE_VIEWPORT_QUERY);
  const handler = () => refreshMarqueeFlow(false, true);
  if (typeof marqueeState.mobileViewport.addEventListener === "function") {
    marqueeState.mobileViewport.addEventListener("change", handler);
  } else if (typeof marqueeState.mobileViewport.addListener === "function") {
    marqueeState.mobileViewport.addListener(handler);
  }
}

function resetMarqueeTicker() {
  clearMarqueeTimeouts();
  marqueeState.activeLines.forEach((line) => line.classList.remove("is-active"));
  marqueeState.activeLines.clear();
  marqueeState.activeMessages.clear();
  marqueeState.lineCursor = 0;
  marqueeState.lines.forEach((line) => {
    line.classList.remove("is-active");
    line.dataset.message = "";
  });
}

function setupMarqueeLineListeners() {
  marqueeState.lines.forEach((line) => {
    const track = line.querySelector(".marquee-track");
    if (!track || track.dataset.marqueeBound === "true") {
      return;
    }
    track.dataset.marqueeBound = "true";
    track.addEventListener("animationend", handleMarqueeAnimationEnd);
    
    // Add click listener for interaction
    const textSpan = track.querySelector(".marquee-text");
    if (textSpan) {
      textSpan.addEventListener("click", (e) => {
        const id = line.dataset.stickerId;
        if (id && marqueeState.onItemClick) {
          e.stopPropagation();
          marqueeState.onItemClick(id);
        }
      });
    }
  });
}

function getResponsiveMarqueeLines() {
  if (!marqueeState.lines.length) {
    return [];
  }
  if (marqueeState.mobileViewport?.matches) {
    return marqueeState.lines.filter((_, index) => MOBILE_VISIBLE_MARQUEE_INDICES.has(index));
  }
  return marqueeState.lines;
}

function refreshMarqueeFlow(seed = false, immediate = false) {
  if (!marqueeState.lines.length) {
    return;
  }
  updateMarqueeActiveLimit();
  clearMarqueeTimeouts();
  ensureMarqueeFlow(seed, immediate);
}

function updateMarqueeActiveLimit() {
  const responsiveLines = getResponsiveMarqueeLines();
  if (!responsiveLines.length) {
    marqueeState.activeLimit = 0;
    marqueeState.activeLines.forEach((line) => deactivateMarqueeLine(line));
    return;
  }
  const allowedSet = new Set(responsiveLines);
  marqueeState.activeLines.forEach((line) => {
    if (!allowedSet.has(line)) {
      deactivateMarqueeLine(line);
    }
  });
  const cappedMax = Math.min(MAX_ACTIVE_MARQUEE_LINES, responsiveLines.length);
  const desired = Math.min(responsiveLines.length, Math.max(MIN_ACTIVE_MARQUEE_LINES, cappedMax));
  if (marqueeState.activeLimit === desired) {
    return;
  }
  marqueeState.activeLimit = desired;
  while (marqueeState.activeLines.size > marqueeState.activeLimit) {
    const line = marqueeState.activeLines.values().next().value;
    deactivateMarqueeLine(line);
  }
}

function ensureMarqueeFlow(seed = false, immediate = false) {
  const deficit = Math.max(0, marqueeState.activeLimit - marqueeState.activeLines.size);
  const isMobileSeed = seed && Boolean(marqueeState.mobileViewport?.matches);
  for (let i = 0; i < deficit; i += 1) {
    const baseDelay = seed ? i * MARQUEE_STAGGER_DELAY_MS : (i === 0 ? 0 : MARQUEE_RESPAWN_DELAY_MS);
    const jitter = seed && i === 0 ? 0 : seed ? MARQUEE_SEED_JITTER_MS : MARQUEE_RESPAWN_JITTER_MS;
    const shouldBurst = isMobileSeed && i < MOBILE_SEED_BURST_COUNT;
    queueMarqueeActivation(baseDelay, jitter, { immediate: immediate || shouldBurst });
  }
}

function queueMarqueeActivation(delay = 0, jitter = 0, options = {}) {
  const { immediate = false } = options;
  const totalDelay = immediate ? 0 : Math.max(0, delay + (jitter ? Math.random() * jitter : 0));
  const timerId = window.setTimeout(() => {
    marqueeState.pendingTimeouts.delete(timerId);
    startNextMarqueeLine();
  }, totalDelay);
  marqueeState.pendingTimeouts.add(timerId);
}

function clearMarqueeTimeouts() {
  marqueeState.pendingTimeouts.forEach((id) => clearTimeout(id));
  marqueeState.pendingTimeouts.clear();
}

function startNextMarqueeLine() {
  if (marqueeState.activeLines.size >= marqueeState.activeLimit) {
    return;
  }
  const line = findNextIdleMarqueeLine();
  if (!line) {
    return;
  }
  const message = pickUniqueMarqueeMessage();
  if (!message) {
    return;
  }
  const normalized = applyMarqueeText(line, message);
  if (!normalized) {
    return;
  }
  marqueeState.activeLines.add(line);
  marqueeState.activeMessages.add(normalized);
  restartMarqueeAnimation(line);
}

function restartMarqueeAnimation(line) {
  const track = line.querySelector(".marquee-track");
  if (!track) {
    return;
  }
  line.classList.remove("is-active");
  void track.offsetWidth;
  updateMarqueeDuration(line, track);
  requestAnimationFrame(() => line.classList.add("is-active"));
}

function findNextIdleMarqueeLine() {
  const responsiveLines = getResponsiveMarqueeLines();
  if (!responsiveLines.length) {
    return null;
  }
  const idleLines = responsiveLines.filter((line) => !marqueeState.activeLines.has(line));
  if (!idleLines.length) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * idleLines.length);
  return idleLines[randomIndex];
}

function pickUniqueMarqueeMessage() {
  const available = getAvailableMarqueeMessages();
  if (!available.length) {
    return null;
  }
  const offset = Math.floor(Math.random() * available.length);
  for (let i = 0; i < available.length; i += 1) {
    const candidate = available[(offset + i) % available.length];
    const normalized = normalizeMarqueeText(candidate.text);
    if (!marqueeState.activeMessages.has(normalized)) {
      return candidate;
    }
  }
  return available[offset];
}

function getAvailableMarqueeMessages() {
  return marqueeState.pool.length ? marqueeState.pool : [{ text: "神蹟留言即將出現", id: null }];
}

function handleMarqueeAnimationEnd(event) {
  if (event.animationName !== "marquee-slide") {
    return;
  }
  const track = event.currentTarget;
  const line = track?.closest(".marquee-line");
  if (!line) {
    return;
  }
  deactivateMarqueeLine(line);
  ensureMarqueeFlow(false, true);
}

function deactivateMarqueeLine(line) {
  if (!line) {
    return;
  }
  line.classList.remove("is-active");
  const normalized = line.dataset.message;
  if (normalized) {
    marqueeState.activeMessages.delete(normalized);
  }
  marqueeState.activeLines.delete(line);
  line.dataset.message = "";
}

function applyMarqueeText(line, item) {
  if (!line) {
    return "";
  }
  const text = item?.text ?? "";
  const id = item?.id ?? "";
  
  const displayText = (text ?? "").trim() || "神蹟留言即將出現";
  const normalized = normalizeMarqueeText(displayText);
  const track = line.querySelector(".marquee-track");
  if (track) {
    const span = track.querySelector(".marquee-text");
    if (span) {
      span.textContent = displayText;
    }
  }
  line.dataset.message = normalized;
  line.dataset.stickerId = id; // Store ID for click handler
  return normalized;
}

function normalizeMarqueeText(text) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function updateMarqueeDuration(line, track) {
  if (!track) {
    return;
  }
  const durationSeconds = computeMarqueeDurationSeconds(line, track);
  if (durationSeconds) {
    track.style.setProperty("--marquee-duration", `${durationSeconds.toFixed(2)}s`);
  } else {
    track.style.removeProperty("--marquee-duration");
  }
}

function computeMarqueeDurationSeconds(line, track) {
  if (!line || !track || !MARQUEE_SPEED_PX_PER_SEC) {
    return null;
  }
  const viewportWidth = line.clientWidth || marqueeState.layer?.clientWidth || window.innerWidth || 0;
  const trackWidth = track.scrollWidth || track.offsetWidth || viewportWidth;
  const travelDistance = viewportWidth + trackWidth;
  if (!Number.isFinite(travelDistance) || travelDistance <= 0) {
    return null;
  }
  const minSeconds = MARQUEE_MIN_DURATION_MS / 1000;
  const maxSeconds = MARQUEE_MAX_DURATION_MS / 1000;
  const rawSeconds = travelDistance / MARQUEE_SPEED_PX_PER_SEC;
  return clampNumber(rawSeconds, minSeconds, maxSeconds);
}
