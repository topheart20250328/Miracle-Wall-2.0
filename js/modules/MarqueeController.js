
import { clampNumber } from "./Utils.js";
import * as StickerManager from "./StickerManager.js";

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
  recentHistory: [], // Array of message strings to avoid repetition
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
  listenersAttached: false,
  onInteractionStart: null
};

export function initMarqueeController(layer, lines, onItemClick, onInteractionStart) {
  marqueeState.layer = layer;
  marqueeState.lines = lines;
  marqueeState.onItemClick = onItemClick;
  marqueeState.onInteractionStart = onInteractionStart;
  
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

  // Notify interaction start (e.g. to cancel placement mode)
  if (marqueeState.onInteractionStart) {
    marqueeState.onInteractionStart();
  }

  // Find associated sticker (but don't highlight yet - wait for drag)
  const line = track.closest(".marquee-line");
  const stickerId = line?.dataset.stickerId;
  let highlightedNode = null;
  
  if (stickerId) {
    highlightedNode = document.querySelector(`.sticker-node[data-id="${stickerId}"]`);
  }

  marqueeState.dragState = {
    active: true,
    track: track,
    startX: e.clientX,
    startTime: animation.currentTime || 0,
    animation: animation,
    hasMoved: false,
    visualsActivated: false, // New flag to track if visuals are active
    originalTarget: e.target,
    highlightedNode: highlightedNode
  };
  
  animation.pause();
  track.setPointerCapture(e.pointerId);
  track.style.cursor = 'grabbing';
}

function handleDragMove(e) {
  if (!marqueeState.dragState.active) return;
  
  const { startX, startTime, animation, highlightedNode, visualsActivated } = marqueeState.dragState;
  const deltaX = e.clientX - startX;
  
  if (Math.abs(deltaX) > 5) {
    marqueeState.dragState.hasMoved = true;

    // Activate visuals only once when threshold is crossed
    if (!visualsActivated) {
      marqueeState.dragState.visualsActivated = true;
      if (highlightedNode) {
        StickerManager.attachDragHighlight(highlightedNode, 'marquee');
        document.body.classList.add("marquee-drag-active");
        highlightedNode.classList.add("marquee-highlight");
      }
    }
  }
  
  // Calculate new time based on drag distance
  
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
  
  const { track, animation, hasMoved, originalTarget, highlightedNode, visualsActivated } = marqueeState.dragState;
  
  // Cleanup highlight (only if activated)
  if (visualsActivated) {
    if (highlightedNode) {
      StickerManager.removeDragHighlight(highlightedNode);
      highlightedNode.classList.remove("marquee-highlight");
    }
    document.body.classList.remove("marquee-drag-active");
  }

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
    animation.play();
  } else {
    // Check if dragged to end (Swipe to Dismiss/Refresh)
    // If the animation is near the end (e.g. > 95% or within last 1s), treat as dismissed
    const duration = animation.effect.getTiming().duration;
    const currentTime = animation.currentTime;
    
    if (currentTime >= duration - 500) { // Within last 0.5s or finished
       // Force immediate finish and respawn
       const line = track.closest(".marquee-line");
       deactivateMarqueeLine(line);
       // Immediately queue next one without delay (Swipe to Refresh mechanic)
       queueMarqueeActivation(0, 0, { immediate: true });
    } else {
       animation.play();
    }
  }
  
  marqueeState.dragState = { active: false, track: null, animation: null, originalTarget: null, highlightedNode: null };
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
  
  // Configuration for Smart Timeout
  const SMART_MAX_DURATION_MS = 60000; // 60 seconds hard limit
  const BLINK_WARNING_DURATION_MS = 10000; // 10 seconds warning
  const FADE_DURATION_MS = 3000; // 3 seconds fade in/out
  
  // Calculate natural duration based on constant speed
  const travelDistance = viewportWidth + trackWidth;
  const naturalDurationMs = (travelDistance / MARQUEE_SPEED_PX_PER_SEC) * 1000;
  
  // Calculate when the tail enters the screen (when the last character becomes visible)
  const timeToTailEnterMs = (trackWidth / MARQUEE_SPEED_PX_PER_SEC) * 1000;

  // Determine if we need to enforce timeout
  // We only enforce timeout if the tail hasn't even entered the screen by the limit time.
  // If the tail is visible (or will be visible) within the limit, we let it finish naturally.
  const isTimeoutMode = timeToTailEnterMs > SMART_MAX_DURATION_MS;
  
  const durationMs = isTimeoutMode ? SMART_MAX_DURATION_MS : Math.max(MARQUEE_MIN_DURATION_MS, naturalDurationMs);
  
  // Calculate end position
  // If timeout, we stop where we are at 60s. If normal, we go all the way to -trackWidth
  const endTranslateX = isTimeoutMode 
    ? viewportWidth - (MARQUEE_SPEED_PX_PER_SEC * (durationMs / 1000))
    : -trackWidth;

  // Build Keyframes
  const keyframes = [];
  
  // 1. Start (Fade In)
  const fadeInOffset = Math.min(FADE_DURATION_MS / durationMs, 0.2);
  keyframes.push({ transform: `translateX(${viewportWidth}px)`, opacity: 0, offset: 0 });
  keyframes.push({ opacity: 1, offset: fadeInOffset });

  if (isTimeoutMode) {
    // 2. Timeout Mode: Long Fade Out (10s)
    const TIMEOUT_FADE_DURATION_MS = 10000;
    const fadeStartMs = Math.max(0, durationMs - TIMEOUT_FADE_DURATION_MS);
    const fadeStartOffset = fadeStartMs / durationMs;
    
    // Ensure we are fully visible until fade starts
    if (fadeStartOffset > fadeInOffset) {
      keyframes.push({ opacity: 1, offset: fadeStartOffset });
    }
    
    // Final fade out
    keyframes.push({ transform: `translateX(${endTranslateX}px)`, opacity: 0, offset: 1 });
    
  } else {
    // 2. Normal Mode: Fade Out at end
    const fadeOutOffset = 1 - fadeInOffset;
    if (fadeOutOffset > fadeInOffset) {
      keyframes.push({ opacity: 1, offset: fadeOutOffset });
    }
    keyframes.push({ transform: `translateX(${endTranslateX}px)`, opacity: 0, offset: 1 });
  }

  // Disable CSS animation to ensure WAAPI takes full control (important for drag interactions)
  track.style.animation = 'none';

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

  // Filter out messages that are currently active OR in recent history
  // If the pool is small, we relax the history constraint to avoid starvation
  const maxHistory = Math.max(0, Math.floor(available.length * 0.6)); // Keep history size reasonable relative to pool
  
  // Trim history if needed
  if (marqueeState.recentHistory.length > maxHistory) {
    marqueeState.recentHistory = marqueeState.recentHistory.slice(marqueeState.recentHistory.length - maxHistory);
  }

  const candidates = available.filter(item => {
    const normalized = normalizeMarqueeText(item.text);
    return !marqueeState.activeMessages.has(normalized) && !marqueeState.recentHistory.includes(normalized);
  });

  let selected = null;

  if (candidates.length > 0) {
    // Pick random from valid candidates
    const randomIndex = Math.floor(Math.random() * candidates.length);
    selected = candidates[randomIndex];
  } else {
    // Fallback: If all are in history/active (should be rare due to maxHistory), 
    // just pick one that is NOT active.
    const nonActive = available.filter(item => !marqueeState.activeMessages.has(normalizeMarqueeText(item.text)));
    if (nonActive.length > 0) {
      const offset = Math.floor(Math.random() * nonActive.length);
      selected = nonActive[offset];
    } else {
      // Absolute fallback
      const offset = Math.floor(Math.random() * available.length);
      selected = available[offset];
    }
  }

  if (selected) {
    const normalized = normalizeMarqueeText(selected.text);
    marqueeState.recentHistory.push(normalized);
  }

  return selected;
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
