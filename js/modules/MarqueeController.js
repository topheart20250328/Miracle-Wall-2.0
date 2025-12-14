
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
  onItemClick: null,
  animations: new Map(), // track -> Animation
  dragState: {
    active: false,
    track: null,
    startX: 0,
    startTime: 0,
    animation: null,
    hasMoved: false
  },
  listenersAttached: false
};

export function initMarqueeController(layer, lines, onItemClick) {
  marqueeState.layer = layer;
  marqueeState.lines = lines;
  marqueeState.onItemClick = onItemClick;
  
  if (!marqueeState.listenersAttached && typeof window !== "undefined") {
    document.addEventListener("pointermove", handleDragMove);
    document.addEventListener("pointerup", handleDragEnd);
    document.addEventListener("pointercancel", handleDragEnd);
    marqueeState.listenersAttached = true;
  }
}

export function initMarqueeTicker() {
  if (!marqueeState.lines.length) {
    return;
  }
  initMarqueeViewportWatcher();
  resetMarqueeTicker();
  setupMarqueeLineListeners();
  marqueeState.initialized = true;
  // Use false for immediate to allow staggered start
  refreshMarqueeFlow(true, false);
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
  marqueeState.activeLines.forEach((line) => {
    line.classList.remove("is-active");
    const track = line.querySelector(".marquee-track");
    if (track && marqueeState.animations.has(track)) {
      marqueeState.animations.get(track).cancel();
      marqueeState.animations.delete(track);
    }
  });
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
    
    // Add pointer listeners for drag
    track.addEventListener("pointerdown", handleDragStart);
    
    // Prevent default drag behavior to avoid issues
    track.addEventListener("dragstart", (e) => e.preventDefault());
  });
}

function handleDragStart(e) {
  const track = e.currentTarget;
  const animation = marqueeState.animations.get(track);
  
  if (!animation) return;
  
  // Only allow left click or touch
  if (e.button !== 0 && e.pointerType === 'mouse') return;

  // Stop propagation to prevent dragging the underlying wall
  e.stopPropagation();

  marqueeState.dragState = {
    active: true,
    track: track,
    startX: e.clientX,
    startTime: animation.currentTime || 0,
    animation: animation,
    hasMoved: false,
    originalTarget: e.target // Store the original target for click detection
  };
  
  animation.pause();
  track.setPointerCapture(e.pointerId);
  track.style.cursor = 'grabbing';
}

function handleDragMove(e) {
  if (!marqueeState.dragState.active) return;
  
  const { startX, startTime, animation } = marqueeState.dragState;
  const deltaX = e.clientX - startX;
  
  if (Math.abs(deltaX) > 5) {
    marqueeState.dragState.hasMoved = true;
  }
  
  // Calculate new time based on drag distance
  // Moving left (negative delta) should advance the animation (positive time shift)
  // because the animation moves right-to-left.
  const timeShift = (-deltaX / MARQUEE_SPEED_PX_PER_SEC) * 1000;
  let newTime = startTime + timeShift;
  
  animation.currentTime = newTime;
}

function handleDragEnd(e) {
  if (!marqueeState.dragState.active) return;
  
  const { track, animation, hasMoved, originalTarget } = marqueeState.dragState;
  
  track.style.cursor = '';
  if (track.hasPointerCapture(e.pointerId)) {
    track.releasePointerCapture(e.pointerId);
  }
  
  if (!hasMoved) {
    // It was a click
    const textSpan = track.querySelector(".marquee-text");
    // Check if the original target was the text or inside it
    if (originalTarget === textSpan || textSpan.contains(originalTarget)) {
       const line = track.closest(".marquee-line");
       const id = line.dataset.stickerId;
       if (id && marqueeState.onItemClick) {
         marqueeState.onItemClick(id);
       }
    }
  }
  
  animation.play();
  marqueeState.dragState = { active: false, track: null, animation: null, originalTarget: null };
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
    let baseDelay;
    let jitter;

    if (seed) {
      // Random staggered start for initial load
      // Spread start times between 0s and 8s (approx)
      baseDelay = Math.random() * 8000; 
      jitter = 1000; 
    } else {
      // Normal respawn logic
      baseDelay = (i === 0 ? 0 : MARQUEE_RESPAWN_DELAY_MS);
      jitter = MARQUEE_RESPAWN_JITTER_MS;
    }

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
  
  // Clean up old animation if exists
  if (marqueeState.animations.has(track)) {
    marqueeState.animations.get(track).cancel();
    marqueeState.animations.delete(track);
  }

  line.classList.add("is-active");
  
  // Calculate geometry
  const viewportWidth = line.clientWidth || window.innerWidth;
  const trackWidth = track.scrollWidth || track.offsetWidth;
  
  // Calculate duration
  const travelDistance = viewportWidth + trackWidth;
  const minSeconds = MARQUEE_MIN_DURATION_MS / 1000;
  const maxSeconds = MARQUEE_MAX_DURATION_MS / 1000;
  const rawSeconds = travelDistance / MARQUEE_SPEED_PX_PER_SEC;
  const durationSeconds = clampNumber(rawSeconds, minSeconds, maxSeconds);
  const durationMs = durationSeconds * 1000;

  // Define Keyframes
  // Start: Just outside right edge (translateX = viewportWidth)
  // End: Just outside left edge (translateX = -trackWidth)
  const keyframes = [
    { transform: `translateX(${viewportWidth}px)`, opacity: 0, offset: 0 },
    { opacity: 1, offset: 0.08 },
    { opacity: 1, offset: 0.92 },
    { transform: `translateX(-${trackWidth}px)`, opacity: 0, offset: 1 }
  ];

  const animation = track.animate(keyframes, {
    duration: durationMs,
    easing: 'linear',
    fill: 'forwards'
  });

  animation.onfinish = () => {
    deactivateMarqueeLine(line);
    ensureMarqueeFlow(false, true);
    marqueeState.animations.delete(track);
  };

  marqueeState.animations.set(track, animation);
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
  
  const track = line.querySelector(".marquee-track");
  if (track && marqueeState.animations.has(track)) {
    marqueeState.animations.get(track).cancel();
    marqueeState.animations.delete(track);
  }
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
  line.dataset.stickerId = id;
  return normalized;
}

function normalizeMarqueeText(text) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}
