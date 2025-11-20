import { supabase, isSupabaseConfigured, deviceId as initialDeviceId } from "./supabase-config.js";

const svgNS = "http://www.w3.org/2000/svg";
const wallStage = document.getElementById("wallStage");
const wallWrapper = document.getElementById("wallWrapper");
const wallSvg = document.getElementById("wallSvg");
const stickersLayer = document.getElementById("stickersLayer");
const effectsLayer = document.getElementById("effectsLayer");
const ambientLayer = document.getElementById("ambientLayer");
const dragOverlay = document.getElementById("dragOverlay");
const eaglePaths = Array.from(document.querySelectorAll(".eagle-shape"));
const paletteSticker = document.getElementById("paletteSticker");
const zoomSlider = document.getElementById("zoomSlider");
const zoomResetBtn = document.getElementById("zoomResetBtn");
const zoomIndicator = document.getElementById("zoomIndicator");
const settingsBtn = document.getElementById("settingsBtn");
const settingsDialog = document.getElementById("settingsDialog");
const settingsCloseBtn = document.getElementById("settingsCloseBtn");
const settingsForm = document.getElementById("settingsForm");
const audioToggle = document.getElementById("audioToggle");
const marqueeLayer = document.getElementById("marqueeLayer");
const marqueeLines = marqueeLayer ? Array.from(marqueeLayer.querySelectorAll(".marquee-line")) : [];
const MAX_ACTIVE_MARQUEE_LINES = 3;
const MIN_ACTIVE_MARQUEE_LINES = 2;
const MARQUEE_STAGGER_DELAY_MS = 3800;
const MARQUEE_RESPAWN_DELAY_MS = 900;
const MARQUEE_SEED_JITTER_MS = 900;
const MARQUEE_RESPAWN_JITTER_MS = 450;
const MARQUEE_RECENT_COUNT = 5;
const MARQUEE_RECENT_WEIGHT = 3;
const MOBILE_VIEWPORT_QUERY = "(max-width: 640px)";
const MOBILE_VISIBLE_MARQUEE_INDICES = new Set([0, 1, 4, 5]);
const MOBILE_SEED_BURST_COUNT = 2;
const statusToast = document.getElementById("statusToast");
const backgroundAudio = document.getElementById("backgroundAudio");
const noteDialog = document.getElementById("noteDialog");
const noteForm = document.getElementById("noteForm");
const noteInput = document.getElementById("noteInput");
const cancelModalBtn = document.getElementById("cancelModalBtn");
const formError = document.getElementById("formError");
const noteTimestamp = document.getElementById("noteTimestamp");
const dialogTitle = document.getElementById("dialogTitle");
const dialogSubtitle = document.getElementById("dialogSubtitle");
const flipCardInner = document.getElementById("flipCardInner");
const flipFront = document.getElementById("flipFront");
const flipBack = document.getElementById("flipBack");
const saveButton = noteForm.querySelector('button[type="submit"]');
const deleteStickerBtn = document.getElementById("deleteStickerBtn");
const mediaPrefersReducedMotion = typeof window !== "undefined" && typeof window.matchMedia === "function"
  ? window.matchMedia("(prefers-reduced-motion: reduce)")
  : null;
const ambientState = {
  nodes: [],
  animation: null,
  currentCount: 0,
  resizeTimer: null,
};
const DEVICE_STORAGE_KEY = "wallDeviceId";
const AUDIO_PREF_KEY = "wallAudioPreference";
const AUDIO_PREF_ON = "on";
const AUDIO_PREF_OFF = "off";
let timestampFormatter = null;
try {
  timestampFormatter = new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
} catch (error) {
  console.warn("Timestamp formatter unavailable", error);
}

const liveViewBox = wallSvg.viewBox.baseVal;
const viewBox = {
  x: liveViewBox.x,
  y: liveViewBox.y,
  width: liveViewBox.width,
  height: liveViewBox.height,
};
const WALL_ASPECT_RATIO = viewBox.width && viewBox.height ? viewBox.width / viewBox.height : 1;
const STICKER_DIAMETER = 36;
const STICKER_RADIUS = STICKER_DIAMETER / 2;
const MIN_DISTANCE = STICKER_DIAMETER;
const DRAG_ACTIVATION_DISTANCE = 12;
const TOUCH_DRAG_VERTICAL_OFFSET_PX = 56;
const POSITION_CONFLICT_CODE = "POSITION_CONFLICT";
const PLACEMENT_MESSAGES = {
  idle: "點擊下方貼紙放置",
  click: "在老鷹上點擊以貼上",
  drag: "拖曳到老鷹上方並鬆開以貼上",
};
const SUBTITLE_TEXT = "（最多 800 字，留言於一日後鎖定）";
const zoomState = {
  scale: 1,
  minScale: 1,
  maxScale: 10,
};
const viewportState = {
  offsetX: 0,
  offsetY: 0,
};
const panState = {
  pointerId: null,
  startX: 0,
  startY: 0,
  startOffsetX: 0,
  startOffsetY: 0,
  moved: false,
  pointers: new Map(),
  pinchStartDistance: 0,
  pinchStartScale: 1,
};
const marqueeState = {
  pool: [],
  activeLines: new Set(),
  activeMessages: new Set(),
  pendingTimeouts: new Set(),
  lineCursor: 0,
  activeLimit: 0,
  initialized: false,
  mobileViewport: null,
};

const state = {
  stickers: new Map(),
  pending: null,
  drag: null,
  placementMode: "idle",
  toastTimer: null,
  toastPersistent: false,
  toastContext: null,
  flipAnimation: null,
  zoomOverlay: null,
  zoomAnimation: null,
  zoomResolve: null,
  closing: false,
  lastClickWarning: 0,
  lastPendingToast: 0,
  deviceId: initialDeviceId ?? null,
};
const reviewSettings = {
  requireMarqueeApproval: true,
  requireStickerApproval: true,
  ready: false,
};
let reviewSettingsChannel = null;
const userAgent = typeof navigator !== "undefined" ? navigator.userAgent ?? "" : "";
const isIOSDevice = /iPad|iPhone|iPod/i.test(userAgent);
const isLineInApp = /Line\//i.test(userAgent);
const requiresStickerForceRedraw = isIOSDevice || isLineInApp;
const backgroundAudioState = {
  unlocked: !backgroundAudio,
  attempting: false,
  listenersBound: false,
  lastError: null,
  enabled: loadAudioPreference() !== AUDIO_PREF_OFF,
  resumeOnVisible: false,
  tryUnlock: null,
};

if (mediaPrefersReducedMotion) {
  const handleMotionPreferenceChange = (event) => {
    if (event.matches) {
      destroyAmbientGlow();
    } else {
      refreshAmbientGlow(true);
    }
  };
  if (typeof mediaPrefersReducedMotion.addEventListener === "function") {
    mediaPrefersReducedMotion.addEventListener("change", handleMotionPreferenceChange);
  } else if (typeof mediaPrefersReducedMotion.addListener === "function") {
    mediaPrefersReducedMotion.addListener(handleMotionPreferenceChange);
  }
}

init().catch((err) => console.error(err));
setupBackgroundAudioAutoplay();
initSettingsDialog();

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (reviewSettingsChannel && typeof supabase?.removeChannel === "function") {
      supabase.removeChannel(reviewSettingsChannel);
      reviewSettingsChannel = null;
    }
  });
}

function init() {
  state.deviceId = initialDeviceId ?? ensureDeviceId();
  wallSvg.addEventListener("click", handleEagleClick);
  paletteSticker?.addEventListener("pointerdown", handlePalettePointerDown);
  paletteSticker?.addEventListener("keydown", handlePaletteKeydown);
  noteForm.addEventListener("submit", handleFormSubmit);
  cancelModalBtn.addEventListener("click", handleCancelAction);
  noteDialog.addEventListener("cancel", handleDialogCancel);
  noteDialog.addEventListener("close", handleDialogClose);
  deleteStickerBtn?.addEventListener("click", handleDeleteSticker);
  document.addEventListener("keydown", handleGlobalKeyDown);
  window.addEventListener("resize", handleViewportChange);
  initZoomControls();
  setPlacementMode("idle", { force: true });
  updatePlacementHint();
  hideStatusMessage(true);
  updateDialogSubtitle(false);
  initAmbientGlow();
  if (isSupabaseConfigured()) {
    loadReviewSettings().catch((error) => console.warn("Failed to load review settings", error));
    subscribeToReviewSettings();
  } else {
    reviewSettings.ready = true;
  }
  if (!isSupabaseConfigured()) {
    showToast("請先在 supabase-config.js 填入專案設定", "danger");
  }
  return loadExistingStickers();
}

async function loadExistingStickers() {
  if (!isSupabaseConfigured()) {
    return;
  }
  const { data, error } = await supabase
    .from("wall_sticker_entries")
    .select(
      "id, x_norm, y_norm, note, created_at, updated_at, device_id, is_approved, can_view_note",
    )
    .order("created_at", { ascending: true });
  if (error) {
    showToast("讀取貼紙失敗，請稍後再試", "danger");
    console.error(error);
    return;
  }
  data.forEach((record) => {
    const x = record.x_norm * viewBox.width;
    const y = record.y_norm * viewBox.height;
    const node = createStickerNode(record.id, x, y, false);
    stickersLayer.appendChild(node);
    state.stickers.set(record.id, {
      id: record.id,
      x,
      y,
      xNorm: record.x_norm,
      yNorm: record.y_norm,
      note: record.note ?? "",
      node,
      created_at: record.created_at,
      updated_at: record.updated_at,
      deviceId: record.device_id ?? null,
      isApproved: Boolean(record.is_approved),
      canViewNote: Boolean(record.can_view_note),
    });
    runPopAnimation(node);
    updateStickerReviewState(state.stickers.get(record.id));
  });
  updateMarqueePool();
  initMarqueeTicker();
}

function setupBackgroundAudioAutoplay() {
  if (!backgroundAudio) {
    return;
  }
  const interactionEvents = ["pointerdown", "touchstart", "keydown"];

  const tryUnlock = (reason = "auto") => {
    if (!backgroundAudioState.enabled || backgroundAudioState.unlocked || backgroundAudioState.attempting) {
      return;
    }
    backgroundAudioState.attempting = true;
    const attempt = backgroundAudio.play();
    if (!attempt || typeof attempt.then !== "function") {
      backgroundAudioState.unlocked = true;
      backgroundAudioState.attempting = false;
      detachInteractionListeners();
      return;
    }
    attempt
      .then(() => {
        backgroundAudioState.unlocked = true;
        backgroundAudioState.attempting = false;
        detachInteractionListeners();
      })
      .catch((error) => {
        backgroundAudioState.attempting = false;
        backgroundAudioState.lastError = error;
        console.warn("背景音樂播放遭到阻擋 (" + reason + ")", error);
      });
  };

  backgroundAudioState.tryUnlock = tryUnlock;

  const handleInteraction = (event) => {
    if (!backgroundAudioState.enabled) {
      return;
    }
    tryUnlock(event.type);
  };

  const detachInteractionListeners = () => {
    if (!backgroundAudioState.listenersBound) {
      return;
    }
    interactionEvents.forEach((eventName) => document.removeEventListener(eventName, handleInteraction));
    backgroundAudioState.listenersBound = false;
  };

  interactionEvents.forEach((eventName) => document.addEventListener(eventName, handleInteraction, { passive: true }));
  backgroundAudioState.listenersBound = true;

  const handleVisibilityChange = () => {
    if (!backgroundAudio) {
      return;
    }
    if (document.visibilityState === "hidden") {
      if (!backgroundAudio.paused && backgroundAudioState.enabled) {
        backgroundAudioState.resumeOnVisible = true;
        backgroundAudio.pause().catch((error) => console.warn("背景音樂暫停失敗", error));
      } else {
        backgroundAudioState.resumeOnVisible = false;
      }
      return;
    }
    if (document.visibilityState === "visible") {
      if (backgroundAudioState.resumeOnVisible && backgroundAudioState.enabled) {
        tryUnlock("visibility");
      }
      backgroundAudioState.resumeOnVisible = false;
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);

  if (backgroundAudioState.enabled) {
    tryUnlock("auto");
  } else {
    backgroundAudio.muted = true;
    backgroundAudio.pause().catch((error) => console.warn("背景音樂靜音失敗", error));
  }
  updateAudioToggleUI();
}

function initSettingsDialog() {
  if (!settingsBtn || !settingsDialog) {
    return;
  }
  const openDialog = () => {
    updateAudioToggleUI();
    if (typeof settingsDialog.showModal === "function") {
      if (!settingsDialog.open) {
        settingsDialog.showModal();
      }
    } else {
      settingsDialog.setAttribute("open", "open");
    }
  };
  const closeDialog = () => {
    if (typeof settingsDialog.close === "function" && settingsDialog.open) {
      settingsDialog.close();
    } else {
      settingsDialog.removeAttribute("open");
    }
    settingsBtn?.focus();
  };
  settingsBtn.addEventListener("click", openDialog);
  settingsCloseBtn?.addEventListener("click", closeDialog);
  settingsDialog.addEventListener("click", (event) => {
    if (event.target === settingsDialog) {
      closeDialog();
    }
  });
  settingsDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog();
  });
  settingsDialog.addEventListener("close", () => {
    updateAudioToggleUI();
  });
  settingsForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    closeDialog();
  });
  audioToggle?.addEventListener("change", (event) => {
    setAudioPreference(Boolean(event.target.checked));
  });
  updateAudioToggleUI();
}

function setAudioPreference(enabled) {
  backgroundAudioState.enabled = Boolean(enabled);
  persistAudioPreference(enabled ? AUDIO_PREF_ON : AUDIO_PREF_OFF);
  updateAudioToggleUI();
  applyAudioPreference();
}

function applyAudioPreference() {
  if (!backgroundAudio) {
    return;
  }
  if (!backgroundAudioState.enabled) {
    backgroundAudio.muted = true;
    backgroundAudioState.resumeOnVisible = false;
    backgroundAudio.pause().catch((error) => console.warn("背景音樂靜音失敗", error));
    return;
  }
  backgroundAudio.muted = false;
  if (backgroundAudioState.unlocked) {
    if (backgroundAudio.paused) {
      backgroundAudio.play().catch((error) => console.warn("背景音樂播放失敗", error));
    }
    return;
  }
  backgroundAudioState.tryUnlock?.("preference");
}

function updateAudioToggleUI() {
  if (!audioToggle) {
    return;
  }
  audioToggle.checked = Boolean(backgroundAudioState.enabled);
}

function loadAudioPreference() {
  if (typeof window === "undefined" || !window.localStorage) {
    return AUDIO_PREF_ON;
  }
  try {
    return window.localStorage.getItem(AUDIO_PREF_KEY) ?? AUDIO_PREF_ON;
  } catch (error) {
    console.warn("讀取音訊偏好失敗", error);
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
    console.warn("寫入音訊偏好失敗", error);
  }
}

async function loadReviewSettings() {
  if (!isSupabaseConfigured()) {
    reviewSettings.ready = true;
    return;
  }
  try {
    const { data, error } = await supabase
      .from("wall_review_settings")
      .select("require_marquee_approval, require_sticker_approval")
      .limit(1)
      .maybeSingle();
    if (error && error.code !== "PGRST116") {
      throw error;
    }
    if (data) {
      applyReviewSettings(data);
    }
  } catch (error) {
    console.warn("讀取審核設定失敗", error);
  } finally {
    reviewSettings.ready = true;
    applyReviewSettingsToUi();
  }
}

function applyReviewSettings(data) {
  if (!data) {
    return;
  }
  reviewSettings.requireMarqueeApproval = Boolean(data.require_marquee_approval);
  reviewSettings.requireStickerApproval = reviewSettings.requireMarqueeApproval && Boolean(data.require_sticker_approval);
  applyReviewSettingsToUi();
}

function applyReviewSettingsToUi() {
  refreshStickerReviewIndicators();
  updateMarqueePool();
}

function refreshStickerReviewIndicators() {
  state.stickers.forEach((record) => {
    updateStickerReviewState(record);
  });
}

function subscribeToReviewSettings() {
  if (!isSupabaseConfigured() || typeof supabase.channel !== "function") {
    return;
  }
  if (reviewSettingsChannel) {
    return;
  }
  reviewSettingsChannel = supabase
    .channel("public:wall_review_settings")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "wall_review_settings" },
      (payload) => {
        if (payload?.new) {
          applyReviewSettings(payload.new);
        } else {
          void loadReviewSettings();
        }
      },
    )
    .subscribe();
}

function handleEagleClick(event) {
  if (event.target.closest(".sticker-node") || state.pending) {
    return;
  }
  if (state.placementMode !== "click") {
    const now = Date.now();
    if (now - state.lastClickWarning > 1400) {
      showToast("點擊下方貼紙放置", "info");
      state.lastClickWarning = now;
    }
    return;
  }
  const svgPoint = clientToSvg(event.clientX, event.clientY);
  const candidate = findAvailableSpot(svgPoint ?? undefined);
  if (!candidate) {
    showToast("暫時找不到可用位置，試試拖曳方式", "danger");
    return;
  }
  setPlacementMode("idle");
  beginPlacement(candidate.x, candidate.y);
}

function handlePalettePointerDown(event) {
  if (state.pending) {
    showToast("請先完成目前的留言", "danger");
    return;
  }
  if (event.button !== undefined && event.button !== 0 && event.pointerType === "mouse") {
    return;
  }
  event.preventDefault();
  if (state.drag?.node) {
    state.drag.node.remove();
  }
  state.drag = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    node: null,
    layer: null,
    x: 0,
    y: 0,
    valid: false,
    active: false,
    visualOffset: null,
  };
  paletteSticker.setPointerCapture(event.pointerId);
  paletteSticker.addEventListener("pointermove", handlePalettePointerMove);
  paletteSticker.addEventListener("pointerup", handlePalettePointerUp, { once: true });
  paletteSticker.addEventListener("pointercancel", handlePalettePointerCancel, { once: true });
}

function handlePalettePointerMove(event) {
  const drag = state.drag;
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }
  const dx = event.clientX - drag.startClientX;
  const dy = event.clientY - drag.startClientY;
  if (!drag.active) {
    const distance = Math.hypot(dx, dy);
    if (distance < DRAG_ACTIVATION_DISTANCE) {
      return;
    }
    if (!activatePaletteDrag(event)) {
      return;
    }
  }
  updateDragPosition(event);
}

function handlePalettePointerUp(event) {
  if (typeof paletteSticker?.hasPointerCapture === "function" && paletteSticker.hasPointerCapture(event.pointerId)) {
    paletteSticker.releasePointerCapture(event.pointerId);
  }
  paletteSticker.removeEventListener("pointermove", handlePalettePointerMove);
  paletteSticker.removeEventListener("pointercancel", handlePalettePointerCancel);
  const drag = state.drag;
  state.drag = null;
  if (drag?.active) {
    drag.node?.remove();
    drag.layer = null;
    if (!drag.valid) {
      setPlacementMode("idle");
      showToast("貼紙不可超出老鷹範圍或與其他貼紙重疊", "danger");
      return;
    }
    setPlacementMode("idle");
    beginPlacement(drag.x, drag.y);
    return;
  }
  toggleClickPlacement();
}

function handlePalettePointerCancel(event) {
  if (typeof paletteSticker?.hasPointerCapture === "function" && paletteSticker.hasPointerCapture(event.pointerId)) {
    paletteSticker.releasePointerCapture(event.pointerId);
  }
  paletteSticker.removeEventListener("pointermove", handlePalettePointerMove);
  paletteSticker.removeEventListener("pointerup", handlePalettePointerUp);
  if (state.drag?.node) {
    state.drag.node.remove();
    state.drag.layer = null;
  }
  state.drag = null;
  setPlacementMode("idle");
}

function activatePaletteDrag(event) {
  const drag = state.drag;
  if (!drag) {
    return false;
  }
  const visualOffset = getPointerVisualOffset(event);
  drag.visualOffset = visualOffset;
  const svgPoint = clientToSvg(event.clientX, event.clientY, visualOffset);
  if (!svgPoint) {
    return false;
  }
  const ghost = createStickerNode("drag-ghost", svgPoint.x, svgPoint.y, true);
  ghost.classList.add("drag-ghost");
  const hostLayer = dragOverlay ?? stickersLayer;
  hostLayer.appendChild(ghost);
  drag.node = ghost;
  drag.layer = hostLayer;
  drag.x = svgPoint.x;
  drag.y = svgPoint.y;
  drag.valid = isValidSpot(svgPoint.x, svgPoint.y);
  drag.active = true;
  ghost.classList.toggle("valid", drag.valid);
  ghost.classList.toggle("invalid", !drag.valid);
  setPlacementMode("drag");
  return true;
}

function updateDragPosition(event) {
  const drag = state.drag;
  if (!drag?.active || !drag.node) {
    return;
  }
  const svgPoint = clientToSvg(event.clientX, event.clientY, drag.visualOffset);
  if (!svgPoint) {
    return;
  }
  positionStickerNode(drag.node, svgPoint.x, svgPoint.y);
  const valid = isValidSpot(svgPoint.x, svgPoint.y);
  drag.node.classList.toggle("valid", valid);
  drag.node.classList.toggle("invalid", !valid);
  drag.x = svgPoint.x;
  drag.y = svgPoint.y;
  drag.valid = valid;
}

function getPointerVisualOffset(event) {
  if (!event) {
    return null;
  }
  if (event.pointerType === "touch") {
    return { x: 0, y: -TOUCH_DRAG_VERTICAL_OFFSET_PX };
  }
  return null;
}

function toggleClickPlacement() {
  if (!paletteSticker) {
    return;
  }
  if (state.pending) {
    showToast("請先完成目前的留言", "danger");
    return;
  }
  if (state.drag?.active) {
    return;
  }
  const nextMode = state.placementMode === "click" ? "idle" : "click";
  setPlacementMode(nextMode, { force: nextMode === "idle" });
}

function handlePaletteKeydown(event) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    toggleClickPlacement();
  } else if (event.key === "Escape" && state.placementMode === "click") {
    event.preventDefault();
    setPlacementMode("idle");
  }
}

function handleGlobalKeyDown(event) {
  if (event.key !== "Escape") {
    return;
  }
  if (noteDialog?.open) {
    return;
  }
  let handled = false;
  if (state.placementMode === "click") {
    setPlacementMode("idle");
    handled = true;
  }
  if (handled) {
    event.preventDefault();
  }
}

function setPlacementMode(mode, options = {}) {
  const normalized = mode === "click" || mode === "drag" ? mode : "idle";
  if (!options.force && state.placementMode === normalized) {
    return;
  }
  state.placementMode = normalized;
  if (document.body) {
    document.body.classList.toggle("placement-active", normalized !== "idle");
    document.body.classList.toggle("placement-click", normalized === "click");
    document.body.classList.toggle("placement-drag", normalized === "drag");
  }
  if (paletteSticker) {
    paletteSticker.setAttribute("aria-pressed", normalized === "click" ? "true" : "false");
  }
  updatePlacementHint(true);
}

function handleViewportChange() {
  scheduleAmbientGlowRefresh();
  updateZoomStageMetrics();
}

function initZoomControls() {
  if (!wallStage || !wallWrapper) {
    return;
  }
  applyZoomTransform();
  updateZoomIndicator();
  wallStage.addEventListener("wheel", handleStageWheel, { passive: false });
  wallStage.addEventListener("pointerdown", handleStagePointerDown);
  wallStage.addEventListener("pointermove", handleStagePointerMove);
  wallStage.addEventListener("pointerup", handleStagePointerUp);
  wallStage.addEventListener("pointercancel", handleStagePointerUp);
  if (zoomSlider) {
    const sliderMin = zoomState.minScale * 100;
    const sliderMax = zoomState.maxScale * 100;
    zoomSlider.min = String(sliderMin);
    zoomSlider.max = String(sliderMax);
    zoomSlider.value = String(zoomState.scale * 100);
    zoomSlider.step = "5";
    zoomSlider.addEventListener("input", handleZoomSliderInput);
  }
  zoomResetBtn?.addEventListener("click", resetZoomView);
  updateZoomStageMetrics();
}

function updateZoomStageMetrics() {
  applyZoomTransform();
  updateZoomIndicator();
}

function handleStageWheel(event) {
  if (!wallStage) {
    return;
  }
  const wantsZoom = event.ctrlKey || event.metaKey;
  if (!wantsZoom) {
    return;
  }
  event.preventDefault();
  const delta = -event.deltaY / 600;
  const nextScale = zoomState.scale * (1 + delta);
  setZoomScale(nextScale, event);
}

function handleStagePointerDown(event) {
  if (!isZoomTarget(event)) {
    return;
  }
  if (event.pointerType === "touch") {
    panState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (panState.pointers.size === 2) {
      panState.pinchStartDistance = getPointerDistance();
      panState.pinchStartScale = zoomState.scale;
      panState.pointerId = null;
      panState.moved = false;
      return;
    }
  }
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }
  panState.pointerId = event.pointerId;
  panState.startX = event.clientX;
  panState.startY = event.clientY;
  panState.startOffsetX = viewportState.offsetX;
  panState.startOffsetY = viewportState.offsetY;
  panState.moved = false;
}

function handleStagePointerMove(event) {
  if (panState.pointers.has(event.pointerId)) {
    panState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (panState.pointers.size === 2) {
      const distance = getPointerDistance();
      if (distance && panState.pinchStartDistance) {
        const scaleFactor = distance / panState.pinchStartDistance;
        const midpoint = getPointerMidpoint();
        if (midpoint) {
          setZoomScale(panState.pinchStartScale * scaleFactor, midpoint);
          event.preventDefault();
        }
      }
      return;
    }
  }
  if (panState.pointerId !== event.pointerId) {
    return;
  }
  const dx = event.clientX - panState.startX;
  const dy = event.clientY - panState.startY;
  if (!panState.moved) {
    panState.moved = Math.hypot(dx, dy) > 8;
    if (panState.moved && typeof wallStage?.setPointerCapture === "function") {
      try {
        wallStage.setPointerCapture(event.pointerId);
      } catch (error) {
        console.warn("Pointer capture failed", error);
      }
    }
  }
  if (!panState.moved && event.pointerType !== "touch") {
    return;
  }
  applyPanDelta(dx, dy);
  if (event.pointerType === "touch") {
    event.preventDefault();
  }
}

function handleStagePointerUp(event) {
  if (panState.pointerId === event.pointerId) {
    releasePointer(event.pointerId);
    panState.pointerId = null;
    panState.moved = false;
  }
  if (panState.pointers.has(event.pointerId)) {
    panState.pointers.delete(event.pointerId);
    if (panState.pointers.size < 2) {
      panState.pinchStartDistance = 0;
      if (panState.pointers.size === 1) {
        panState.pointerId = null;
        panState.moved = false;
      }
    }
  }
}

function releasePointer(pointerId) {
  if (typeof wallStage?.releasePointerCapture === "function") {
    try {
      wallStage.releasePointerCapture(pointerId);
    } catch {
      // ignore
    }
  }
}

function resetZoomView() {
  panState.pointerId = null;
  panState.moved = false;
  panState.pointers.clear();
  panState.pinchStartDistance = 0;
  zoomState.scale = 1;
  viewportState.offsetX = 0;
  viewportState.offsetY = 0;
  applyZoomTransform();
  updateZoomIndicator();
}

function setZoomScale(nextScale, anchorEvent) {
  const clamped = clampNumber(nextScale, zoomState.minScale, zoomState.maxScale);
  if (clamped === zoomState.scale || !wallStage) {
    updateZoomIndicator();
    return;
  }
  const anchorPoint = anchorEvent ?? getStageCenterPoint();
  let offsetX = viewportState.offsetX;
  let offsetY = viewportState.offsetY;
  if (anchorPoint) {
    const stageRect = wallStage.getBoundingClientRect();
    if (stageRect.width && stageRect.height) {
      const centerX = stageRect.left + stageRect.width / 2;
      const centerY = stageRect.top + stageRect.height / 2;
      const relativeX = anchorPoint.clientX - centerX;
      const relativeY = anchorPoint.clientY - centerY;
      const scaleDelta = clamped / zoomState.scale;
      offsetX = relativeX - scaleDelta * (relativeX - viewportState.offsetX);
      offsetY = relativeY - scaleDelta * (relativeY - viewportState.offsetY);
    }
  }
  zoomState.scale = clamped;
  viewportState.offsetX = offsetX;
  viewportState.offsetY = offsetY;
  applyZoomTransform();
  updateZoomIndicator();
}

function applyZoomTransform() {
  if (!wallSvg) {
    return;
  }
  wallSvg.style.transformOrigin = "center";
  wallSvg.style.transform = `translate(${viewportState.offsetX}px, ${viewportState.offsetY}px) scale(${zoomState.scale})`;
  invalidateStickerRendering();
}

function applyPanDelta(deltaX, deltaY) {
  viewportState.offsetX = panState.startOffsetX + deltaX;
  viewportState.offsetY = panState.startOffsetY + deltaY;
  applyZoomTransform();
}

function invalidateStickerRendering() {
  if (!stickersLayer || typeof window === "undefined") {
    return;
  }
  if (requiresStickerForceRedraw) {
    const parent = stickersLayer.parentNode;
    if (!parent) {
      return;
    }
    const nextSibling = stickersLayer.nextSibling;
    parent.removeChild(stickersLayer);
    window.requestAnimationFrame(() => {
      if (nextSibling && nextSibling.parentNode === parent) {
        parent.insertBefore(stickersLayer, nextSibling);
      } else {
        parent.appendChild(stickersLayer);
      }
    });
    return;
  }
  const originals = Array.from(stickersLayer.children);
  if (!originals.length) {
    return;
  }
  const fragment = document.createDocumentFragment();
  originals.forEach((node) => fragment.appendChild(node));
  window.requestAnimationFrame(() => {
    stickersLayer.appendChild(fragment);
  });
}

function updateZoomIndicator() {
  if (zoomIndicator) {
    const percentage = Math.round(zoomState.scale * 100);
    zoomIndicator.textContent = `${percentage}%`;
  }
  syncZoomSlider();
  updateZoomResetState();
}

function handleZoomSliderInput(event) {
  const value = Number(event.target.value);
  if (Number.isNaN(value)) {
    return;
  }
  const sliderScale = value / 100;
  const centerEvent = getStageCenterPoint();
  setZoomScale(sliderScale, centerEvent);
}

function getStageCenterPoint() {
  if (!wallStage) {
    return null;
  }
  const rect = wallStage.getBoundingClientRect();
  return {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
}

function syncZoomSlider() {
  if (!zoomSlider) {
    return;
  }
  const percent = clampNumber(Math.round(zoomState.scale * 100), Number(zoomSlider.min) || 100, Number(zoomSlider.max) || 1000);
  if (Number(zoomSlider.value) !== percent) {
    zoomSlider.value = String(percent);
  }
  zoomSlider.setAttribute("aria-valuetext", `${percent}%`);
}

function updateZoomResetState() {
  if (!zoomResetBtn) {
    return;
  }
  const nearScale = Math.abs(zoomState.scale - 1) < 0.01;
  const nearOffsetX = Math.abs(viewportState.offsetX) < 1;
  const nearOffsetY = Math.abs(viewportState.offsetY) < 1;
  const atDefault = nearScale && nearOffsetX && nearOffsetY;
  zoomResetBtn.disabled = false;
  zoomResetBtn.setAttribute("aria-disabled", "false");
  zoomResetBtn.classList.toggle("is-inactive", atDefault);
}


function updateMarqueePool() {
  if (!marqueeLines.length) {
    return;
  }
  const requireApproval = reviewSettings.requireMarqueeApproval;
  const eligibleRecords = Array.from(state.stickers.values()).filter((record) => {
    const note = (record.note ?? "").trim();
    if (!note) {
      return false;
    }
    return requireApproval ? Boolean(record.isApproved) : true;
  });
  const baseNotes = eligibleRecords.map((record) => record.note.trim());
  if (baseNotes.length && MARQUEE_RECENT_WEIGHT > 1) {
    const recentRecords = eligibleRecords.slice(-MARQUEE_RECENT_COUNT);
    recentRecords.forEach((record) => {
      const note = record.note.trim();
      for (let i = 1; i < MARQUEE_RECENT_WEIGHT; i += 1) {
        baseNotes.push(note);
      }
    });
  }
  marqueeState.pool = baseNotes;
  if (marqueeState.initialized) {
    refreshMarqueeFlow();
  }
}

function initMarqueeTicker() {
  if (!marqueeLines.length) {
    return;
  }
  initMarqueeViewportWatcher();
  resetMarqueeTicker();
  setupMarqueeLineListeners();
  marqueeState.initialized = true;
  refreshMarqueeFlow(true, true);
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
  marqueeLines.forEach((line) => {
    line.classList.remove("is-active");
    line.dataset.message = "";
  });
}

function setupMarqueeLineListeners() {
  marqueeLines.forEach((line) => {
    const track = line.querySelector(".marquee-track");
    if (!track || track.dataset.marqueeBound === "true") {
      return;
    }
    track.dataset.marqueeBound = "true";
    track.addEventListener("animationend", handleMarqueeAnimationEnd);
  });
}

function getResponsiveMarqueeLines() {
  if (!marqueeLines.length) {
    return [];
  }
  if (marqueeState.mobileViewport?.matches) {
    return marqueeLines.filter((_, index) => MOBILE_VISIBLE_MARQUEE_INDICES.has(index));
  }
  return marqueeLines;
}

function refreshMarqueeFlow(seed = false, immediate = false) {
  if (!marqueeLines.length) {
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
    const normalized = normalizeMarqueeText(candidate);
    if (!marqueeState.activeMessages.has(normalized)) {
      return candidate;
    }
  }
  return available[offset];
}

function getAvailableMarqueeMessages() {
  return marqueeState.pool.length ? marqueeState.pool : ["神蹟留言即將出現"];
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

function applyMarqueeText(line, text) {
  if (!line) {
    return "";
  }
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
  return normalized;
}

function normalizeMarqueeText(text) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function getPointerDistance() {
  if (panState.pointers.size < 2) {
    return 0;
  }
  const values = Array.from(panState.pointers.values());
  const [a, b] = values;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getPointerMidpoint() {
  if (panState.pointers.size < 2) {
    return null;
  }
  const values = Array.from(panState.pointers.values());
  const [a, b] = values;
  return { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 };
}

function isZoomTarget(event) {
  if (!wallStage) {
    return false;
  }
  const blocked = event.target.closest(".palette-sticker, .zoom-controls, #noteDialog, .note-dialog, .dialog-actions");
  return !blocked;
}

function ensureDeviceId() {
  if (state.deviceId) {
    return state.deviceId;
  }
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const storage = window.localStorage;
    if (!storage) {
      return createUuid();
    }
    let deviceId = storage.getItem(DEVICE_STORAGE_KEY);
    if (!deviceId) {
      deviceId = createUuid();
      storage.setItem(DEVICE_STORAGE_KEY, deviceId);
    }
    state.deviceId = deviceId;
    return deviceId;
  } catch (error) {
    console.warn("Unable to access localStorage for device binding", error);
    const fallbackId = createUuid();
    state.deviceId = fallbackId;
    return fallbackId;
  }
}

function beginPlacement(x, y) {
  setPlacementMode("idle");
  const tempId = `temp-${createUuid()}`;
  const node = createStickerNode(tempId, x, y, true);
  stickersLayer.appendChild(node);
  playPlacementPreviewEffect(x, y);
  if (!state.deviceId) {
    state.deviceId = ensureDeviceId();
  }
  state.pending = {
    id: tempId,
    x,
    y,
    node,
    isNew: true,
    locked: false,
    lockReason: null,
    deviceId: state.deviceId ?? null,
    isApproved: false,
    canViewNote: true,
  };
  dialogTitle.textContent = "新增神蹟留言";
  noteInput.value = "";
  resetNoteInputScrollPosition();
  formError.textContent = "";
  setTimestampDisplay(null);
  setNoteLocked(false);
  updateDeleteButton();
  focusDialog(node, { usePaletteSource: true });
}

function focusDialog(originNode, options = {}) {
  resetFlipCard();
  const { usePaletteSource = false } = options;
  const paletteRect = usePaletteSource ? getPaletteTargetRect() : null;
  const canAnimate = Boolean((paletteRect || originNode) && window.anime && typeof window.anime.timeline === "function");
  const openModal = () => {
    if (document.body) {
      document.body.classList.add("dialog-open");
    }
    try {
      if (typeof noteDialog.showModal === "function") {
        noteDialog.showModal();
      } else {
        noteDialog.setAttribute("open", "true");
      }
    } catch (error) {
      document.body?.classList.remove("dialog-open");
      throw error;
    }
    requestAnimationFrame(() => playFlipReveal());
  };
  if (canAnimate && originNode) {
    setStickerInFlight(originNode, true);
    animateStickerZoom(originNode, { sourceRect: paletteRect ?? undefined })
      .then(openModal)
      .catch((error) => {
        console.error("Sticker zoom animation failed", error);
        setStickerInFlight(originNode, false);
        cleanupZoomOverlay();
        try {
          openModal();
        } catch (openError) {
          console.error("Failed to open note dialog", openError);
        }
      });
  } else {
    if (originNode) {
      setStickerInFlight(originNode, true);
    }
    openModal();
  }
}

async function handleDialogClose() {
  const pendingSnapshot = state.pending;
  state.pending = null;
  formError.textContent = "";
  setTimestampDisplay(null);
  document.body?.classList.remove("dialog-open");
  setNoteLocked(false);
  updateDeleteButton();
  const result = noteDialog.returnValue || "";
  if (pendingSnapshot && pendingSnapshot.node) {
    try {
      await animateStickerReturn(pendingSnapshot, result);
    } catch (error) {
      console.error("Sticker return animation failed", error);
      finalizeReturnWithoutAnimation(pendingSnapshot.node, Boolean(pendingSnapshot.isNew && result !== "saved"));
    }
  }
  resetFlipCard();
  cleanupZoomOverlay();
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const message = noteInput.value.trim();
  if (!message) {
    formError.textContent = "請輸入留言內容";
    return;
  }
  const pending = state.pending;
  if (pending?.locked) {
    if (pending.lockReason === "approved") {
      formError.textContent = "留言已通過審核，如需調整請聯繫管理員";
    } else {
      formError.textContent = "";
    }
    return;
  }
  if (!pending) {
    await closeDialogWithResult("saved");
    return;
  }
  if (!isSupabaseConfigured()) {
    formError.textContent = "尚未設定 Supabase，請先完成設定";
    return;
  }
  if (pending.isNew) {
    await saveNewSticker(pending, message);
  } else {
    await updateStickerMessage(pending, message);
  }
}

async function handleDeleteSticker() {
  const pending = state.pending;
  if (!pending || pending.isNew || (pending.locked && pending.lockReason !== "approved")) {
    return;
  }
  if (pending.deviceId && state.deviceId && pending.deviceId !== state.deviceId) {
    formError.textContent = "此留言僅能由原建立裝置於 24 小時內刪除";
    return;
  }
  if (!isSupabaseConfigured()) {
    formError.textContent = "尚未設定 Supabase，無法刪除";
    return;
  }
  if (!deleteStickerBtn) {
    return;
  }
  const originalLabel = deleteStickerBtn.textContent;
  deleteStickerBtn.disabled = true;
  deleteStickerBtn.textContent = "刪除中…";
  formError.textContent = "";
  try {
    let deleteQuery = supabase.from("wall_stickers").delete().eq("id", pending.id);
    if (pending.deviceId) {
      deleteQuery = deleteQuery.eq("device_id", pending.deviceId);
    } else {
      deleteQuery = deleteQuery.is("device_id", null);
    }
    const { error } = await deleteQuery;
    if (error) {
      throw error;
    }
    if (pending.node?.isConnected) {
      pending.node.remove();
    }
    state.stickers.delete(pending.id);
    pending.deleted = true;
    pending.node = null;
    await closeDialogWithResult("deleted");
    showToast("貼紙已刪除", "success");
  } catch (error) {
    console.error(error);
    formError.textContent = "刪除失敗，請稍後再試";
    deleteStickerBtn.disabled = false;
    deleteStickerBtn.textContent = originalLabel;
  } finally {
    if (deleteStickerBtn.disabled) {
      deleteStickerBtn.disabled = false;
    }
    deleteStickerBtn.textContent = originalLabel;
  }
}

function handleCancelAction() {
  void closeDialogWithResult("cancelled");
}

function handleDialogCancel(event) {
  event.preventDefault();
  void closeDialogWithResult("cancelled");
}

function isPositionConflictError(error) {
  if (!error) {
    return false;
  }
  const code = typeof error.code === "string" ? error.code.toUpperCase() : "";
  const message = typeof error.message === "string" ? error.message.toUpperCase() : "";
  const details = typeof error.details === "string" ? error.details.toUpperCase() : "";
  return (
    code.includes(POSITION_CONFLICT_CODE)
    || message.includes(POSITION_CONFLICT_CODE)
    || details.includes(POSITION_CONFLICT_CODE)
  );
}

function handlePlacementConflict(pending) {
  if (!pending?.node) {
    formError.textContent = "這個位置剛被其他人貼上，請重新選擇位置。";
    showToast("這個位置剛被其他人貼上，請重新選擇位置", "danger");
    return;
  }
  pending.node.classList.add("pending");
  const fallback = findAvailableSpot({ x: pending.x, y: pending.y });
  if (fallback) {
    positionStickerNode(pending.node, fallback.x, fallback.y);
    pending.x = fallback.x;
    pending.y = fallback.y;
    formError.textContent = "這個位置剛被其他人貼上，已為你換到附近的新位置，請再儲存一次。";
    showToast("這個位置剛被其他人貼上，已為你換到附近的位置", "info");
    playPlacementPreviewEffect(fallback.x, fallback.y);
  } else {
    formError.textContent = "這個位置剛被其他人貼上，請關閉視窗後換個位置再試一次。";
    showToast("這個位置剛被其他人貼上，請換個位置", "danger");
  }
}

async function closeDialogWithResult(result) {
  if (state.closing) {
    return;
  }
  state.closing = true;
  try {
    await playFlipReturn().catch((error) => {
      console.error("Flip return animation failed", error);
    });
    if (noteDialog.open) {
      try {
        noteDialog.close(result);
      } catch (error) {
        console.error("Failed to close note dialog", error);
      }
    }
  } finally {
    state.closing = false;
  }
}

async function saveNewSticker(pending, message) {
  pending.node.classList.add("pending");
  const payload = {
    p_x_norm: pending.x / viewBox.width,
    p_y_norm: pending.y / viewBox.height,
    p_note: message,
    p_device_id: state.deviceId ?? null,
  };
  const { data, error } = await supabase.rpc("create_wall_sticker", payload);
  pending.node.classList.remove("pending");
  if (error) {
    if (isPositionConflictError(error)) {
      handlePlacementConflict(pending);
    } else {
      formError.textContent = "儲存失敗，請稍後再試";
      console.error(error);
    }
    return;
  }
  const inserted = Array.isArray(data) ? data[0] : data;
  if (!inserted?.id) {
    formError.textContent = "儲存失敗，請稍後再試";
    console.error("Unexpected insert payload", data);
    return;
  }
  const newId = inserted.id;
  pending.node.dataset.id = newId;
  pending.id = newId;
  pending.isNew = false;
  pending.deviceId = payload.p_device_id ?? null;
  pending.lockReason = null;
  const newRecord = {
    id: newId,
    x: pending.x,
    y: pending.y,
    xNorm: inserted.x_norm ?? payload.p_x_norm,
    yNorm: inserted.y_norm ?? payload.p_y_norm,
    note: message,
    node: pending.node,
    created_at: inserted.created_at,
    updated_at: inserted.updated_at,
    deviceId: inserted.device_id ?? payload.p_device_id ?? null,
    isApproved: Boolean(inserted.is_approved),
    canViewNote: true,
  };
  state.stickers.set(newId, newRecord);
  updateStickerReviewState(newRecord);
  runPopAnimation(pending.node);
  await closeDialogWithResult("saved");
  showToast("留言已保存", "success");
}

async function updateStickerMessage(pending, message) {
  if (pending.deviceId && state.deviceId && pending.deviceId !== state.deviceId) {
    formError.textContent = "";
    return;
  }
  let updateQuery = supabase
    .from("wall_stickers")
    .update({ note: message })
    .eq("id", pending.id);
  if (pending.deviceId) {
    updateQuery = updateQuery.eq("device_id", pending.deviceId);
  } else {
    updateQuery = updateQuery.is("device_id", null);
  }
  const { error, data } = await updateQuery.select().single();
  if (error) {
    formError.textContent = "更新失敗，請稍後再試";
    console.error(error);
    return;
  }
  const record = state.stickers.get(pending.id);
  if (record) {
    record.note = message;
    record.updated_at = data?.updated_at ?? null;
    if (data?.device_id) {
      record.deviceId = data.device_id;
    }
    if (typeof data?.is_approved !== "undefined") {
      record.isApproved = Boolean(data.is_approved);
    }
    record.canViewNote = true;
    updateStickerReviewState(record);
    runPulseAnimation(record.node);
  }
  await closeDialogWithResult("saved");
  showToast("留言已更新", "success");
}

function createStickerNode(id, x, y, isPending = false) {
  const group = document.createElementNS(svgNS, "g");
  group.classList.add("sticker-node");
  if (isPending) {
    group.classList.add("pending");
  }
  group.dataset.id = id;
  group.setAttribute("tabindex", "0");
  const use = document.createElementNS(svgNS, "use");
  use.setAttribute("href", "#heartSticker");
  use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#heartSticker");
  group.appendChild(use);
  positionStickerNode(group, x, y);
  group.addEventListener("click", (event) => {
    event.stopPropagation();
    const stickerId = group.dataset.id;
    if (!state.pending && stickerId) {
      handleStickerActivation(stickerId);
    }
  });
  group.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const stickerId = group.dataset.id;
      if (!state.pending && stickerId) {
        handleStickerActivation(stickerId);
      }
    }
  });
  return group;
}

function handleStickerActivation(stickerId) {
  setPlacementMode("idle");
  const record = state.stickers.get(stickerId);
  if (!record) {
    return;
  }
  if (!record.isApproved && !record.canViewNote) {
    triggerPendingReviewFeedback(record);
    return;
  }
  openStickerModal(stickerId);
}

function triggerPendingReviewFeedback(record) {
  const node = record?.node;
  if (node) {
    node.classList.add("review-blocked");
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        setTimeout(() => node.classList.remove("review-blocked"), 420);
      });
    } else {
      setTimeout(() => node.classList.remove("review-blocked"), 420);
    }
  }
  const now = Date.now();
  if (now - (state.lastPendingToast ?? 0) > 1400) {
    showToast("審核中，無法查看", "info");
    state.lastPendingToast = now;
  }
}

function positionStickerNode(node, x, y) {
  const centerX = x - STICKER_RADIUS;
  const centerY = y - STICKER_RADIUS;
  const useEl = node.firstElementChild;
  useEl.setAttribute("x", centerX.toFixed(2));
  useEl.setAttribute("y", centerY.toFixed(2));
  useEl.setAttribute("width", STICKER_DIAMETER);
  useEl.setAttribute("height", STICKER_DIAMETER);
  node.dataset.cx = x.toFixed(2);
  node.dataset.cy = y.toFixed(2);
}

function updateStickerReviewState(record) {
  if (!record || !record.node) {
    return;
  }
  const node = record.node;
  const requireApproval = reviewSettings.requireStickerApproval;
  const approved = Boolean(record.isApproved);
  const visibleAsApproved = approved || !requireApproval;
  node.classList.toggle("review-pending", requireApproval && !approved);
  node.setAttribute("aria-label", visibleAsApproved ? "留言" : "審核中留言");
  node.dataset.approved = approved ? "true" : "false";
}

function openStickerModal(id) {
  const record = state.stickers.get(id);
  if (!record) {
    return;
  }
  state.pending = {
    id,
    x: record.x,
    y: record.y,
    node: record.node,
    isNew: false,
    deviceId: record.deviceId ?? null,
    lockReason: null,
    isApproved: Boolean(record.isApproved),
    canViewNote: Boolean(record.canViewNote),
  };
  dialogTitle.textContent = "神蹟留言";
  noteInput.value = record.note ?? "";
  resetNoteInputScrollPosition();
  formError.textContent = "";
  setTimestampDisplay(record);
  const lockReason = resolveLockReason(record);
  state.pending.lockReason = lockReason;
  state.pending.locked = Boolean(lockReason);
  if (lockReason === "approved") {
    formError.textContent = "留言已通過審核，如需調整請聯繫管理員";
  } else {
    formError.textContent = "";
  }
  setNoteLocked(Boolean(lockReason), { reason: lockReason });
  updateDeleteButton();
  focusDialog(record.node);
}

function isValidSpot(x, y) {
  return isCircleInsideEagle(x, y, STICKER_RADIUS) && !isOverlapping(x, y);
}

function isCircleInsideEagle(cx, cy, radius) {
  const offsets = [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
    [radius * 0.7071, radius * 0.7071],
    [-radius * 0.7071, radius * 0.7071],
    [radius * 0.7071, -radius * 0.7071],
    [-radius * 0.7071, -radius * 0.7071],
  ];
  return offsets.every(([dx, dy]) => isPointInsidePaths(cx + dx, cy + dy));
}

function isPointInsidePaths(x, y) {
  const point = createDomPoint(x, y);
  return eaglePaths.some((path) => path.isPointInFill(point));
}

function createDomPoint(x, y) {
  if (typeof DOMPoint === "function") {
    return new DOMPoint(x, y);
  }
  if (typeof DOMPointReadOnly === "function") {
    return new DOMPointReadOnly(x, y);
  }
  const svgPoint = wallSvg.createSVGPoint();
  svgPoint.x = x;
  svgPoint.y = y;
  return svgPoint;
}

function isOverlapping(x, y) {
  for (const record of state.stickers.values()) {
    const distance = Math.hypot(record.x - x, record.y - y);
    if (distance < MIN_DISTANCE) {
      return true;
    }
  }
  if (state.pending && !state.pending.isNew) {
    const distance = Math.hypot(state.pending.x - x, state.pending.y - y);
    if (distance < MIN_DISTANCE) {
      return true;
    }
  }
  return false;
}

function findAvailableSpot(preferredPoint) {
  const maxAttempts = 1800;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = attempt < 280 && preferredPoint
      ? jitterAround(preferredPoint.x, preferredPoint.y, attempt)
      : randomWithinViewBox();
    if (isValidSpot(candidate.x, candidate.y)) {
      return candidate;
    }
  }
  return null;
}

function jitterAround(x, y, attempt) {
  const spread = Math.min(420, 60 + attempt * 2.5);
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * spread;
  return {
    x: clampToViewBox(x + Math.cos(angle) * radius),
    y: clampToViewBox(y + Math.sin(angle) * radius, true),
  };
}

function randomWithinViewBox() {
  return {
    x: viewBox.x + Math.random() * viewBox.width,
    y: viewBox.y + Math.random() * viewBox.height,
  };
}

function clampNumber(value, min, max) {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function clampToViewBox(value, isY = false) {
  if (isY) {
    return Math.min(viewBox.y + viewBox.height - STICKER_RADIUS, Math.max(viewBox.y + STICKER_RADIUS, value));
  }
  return Math.min(viewBox.x + viewBox.width - STICKER_RADIUS, Math.max(viewBox.x + STICKER_RADIUS, value));
}

function resetNoteInputScrollPosition() {
  if (!noteInput) {
    return;
  }
  requestAnimationFrame(() => {
    noteInput.scrollTop = 0;
    if (typeof noteInput.setSelectionRange === "function") {
      try {
        noteInput.setSelectionRange(0, 0);
      } catch {
        // ignore selection errors (e.g., readOnly inputs on some devices)
      }
    }
  });
}

function clientToSvg(clientX, clientY, offsetPx = null) {
  if (!wallSvg) {
    return null;
  }
  const rect = wallSvg.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }
  const offsetX = offsetPx?.x ?? 0;
  const offsetY = offsetPx?.y ?? 0;
  const normalizedX = (clientX + offsetX - rect.left) / rect.width;
  const normalizedY = (clientY + offsetY - rect.top) / rect.height;
  const clampedX = clampNumber(normalizedX, 0, 1);
  const clampedY = clampNumber(normalizedY, 0, 1);
  const svgX = viewBox.x + clampedX * viewBox.width;
  const svgY = viewBox.y + clampedY * viewBox.height;
  return { x: svgX, y: svgY };
}

const STATUS_TOAST_TIMEOUT = 2600;

function showToast(message, tone = "info") {
  setStatusMessage(message, tone, { context: "toast" });
}

function setStatusMessage(message, tone = "info", options = {}) {
  if (!statusToast) {
    return;
  }
  const { persist = false, context = null } = options;
  if (state.toastTimer) {
    clearTimeout(state.toastTimer);
    state.toastTimer = null;
  }
  statusToast.textContent = message;
  statusToast.dataset.tone = tone;
  statusToast.dataset.context = context ?? "";
  statusToast.classList.add("visible");
  statusToast.removeAttribute("aria-hidden");
  state.toastPersistent = Boolean(persist);
  state.toastContext = context ?? null;
  if (!persist) {
    state.toastTimer = setTimeout(() => {
      state.toastTimer = null;
      hideStatusMessage(true);
      updatePlacementHint();
    }, STATUS_TOAST_TIMEOUT);
  }
}

function hideStatusMessage(force = false) {
  if (!statusToast) {
    return;
  }
  if (!force && state.toastPersistent) {
    return;
  }
  if (state.toastTimer) {
    clearTimeout(state.toastTimer);
    state.toastTimer = null;
  }
  statusToast.classList.remove("visible");
  statusToast.setAttribute("aria-hidden", "true");
  statusToast.textContent = "";
  statusToast.dataset.tone = "";
  statusToast.dataset.context = "";
  state.toastPersistent = false;
  state.toastContext = null;
}

function updatePlacementHint(force = false) {
  if (!statusToast) {
    return;
  }
  const mode = state.placementMode;
  const statusVisible = statusToast.classList.contains("visible");
  const hasForeignContext = statusVisible && state.toastContext && state.toastContext !== "placement";
  if (!force && hasForeignContext) {
    return;
  }
  if (mode === "click") {
    setStatusMessage(PLACEMENT_MESSAGES.click, "info", { persist: true, context: "placement" });
  } else if (mode === "drag") {
    setStatusMessage(PLACEMENT_MESSAGES.drag, "info", { persist: true, context: "placement" });
  } else if (state.toastContext === "placement") {
    hideStatusMessage(true);
  }
}

function playPlacementPreviewEffect(x, y) {
  if (!effectsLayer) {
    return;
  }
  const cx = Number(x);
  const cy = Number(y);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
    return;
  }
  const group = document.createElementNS(svgNS, "g");
  group.classList.add("effect-preview");

  const glow = document.createElementNS(svgNS, "circle");
  glow.classList.add("effect-preview-glow");
  glow.setAttribute("cx", cx.toFixed(2));
  glow.setAttribute("cy", cy.toFixed(2));
  glow.setAttribute("r", "0");
  glow.setAttribute("opacity", "0.6");

  const ring = document.createElementNS(svgNS, "circle");
  ring.classList.add("effect-preview-ring");
  ring.setAttribute("cx", cx.toFixed(2));
  ring.setAttribute("cy", cy.toFixed(2));
  ring.setAttribute("r", "0");
  ring.setAttribute("opacity", "0.9");

  group.appendChild(glow);
  group.appendChild(ring);
  effectsLayer.appendChild(group);

  const removeGroup = () => {
    if (group.isConnected) {
      group.remove();
    }
  };

  if (window.anime && typeof window.anime.timeline === "function") {
    const timeline = window.anime.timeline({ easing: "easeOutCubic" });
    timeline
      .add(
        {
          targets: glow,
          r: [0, STICKER_DIAMETER * 3.6],
          opacity: [0.6, 0],
          duration: 620,
        },
        0,
      )
      .add(
        {
          targets: ring,
          r: [0, STICKER_DIAMETER * 2.1],
          strokeWidth: [8, 0],
          opacity: [0.9, 0],
          duration: 520,
          easing: "easeOutQuad",
        },
        40,
      );
    if (timeline.finished && typeof timeline.finished.then === "function") {
      timeline.finished.then(removeGroup).catch(removeGroup);
    } else {
      setTimeout(removeGroup, 640);
    }
  } else {
    setTimeout(removeGroup, 640);
  }
}

function playPlacementImpactEffect(node) {
  if (!effectsLayer || !node) {
    return;
  }
  const cx = Number(node.dataset.cx);
  const cy = Number(node.dataset.cy);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
    return;
  }
  const group = document.createElementNS(svgNS, "g");
  group.classList.add("effect-impact");

  const glow = document.createElementNS(svgNS, "circle");
  glow.classList.add("impact-glow");
  glow.setAttribute("cx", cx.toFixed(2));
  glow.setAttribute("cy", cy.toFixed(2));
  glow.setAttribute("r", "0");
  glow.setAttribute("opacity", "0.75");

  const halo = document.createElementNS(svgNS, "circle");
  halo.classList.add("impact-halo");
  halo.setAttribute("cx", cx.toFixed(2));
  halo.setAttribute("cy", cy.toFixed(2));
  halo.setAttribute("r", (STICKER_RADIUS * 0.6).toFixed(2));
  halo.setAttribute("opacity", "0.9");

  const wave = document.createElementNS(svgNS, "circle");
  wave.classList.add("impact-wave");
  wave.setAttribute("cx", cx.toFixed(2));
  wave.setAttribute("cy", cy.toFixed(2));
  wave.setAttribute("r", (STICKER_RADIUS * 0.75).toFixed(2));
  wave.setAttribute("opacity", "0.9");

  const ring = document.createElementNS(svgNS, "circle");
  ring.classList.add("impact-ring");
  ring.setAttribute("cx", cx.toFixed(2));
  ring.setAttribute("cy", cy.toFixed(2));
  ring.setAttribute("r", (STICKER_RADIUS * 0.5).toFixed(2));
  ring.setAttribute("opacity", "0.95");
  ring.setAttribute("stroke-dashoffset", "18");

  const core = document.createElementNS(svgNS, "circle");
  core.classList.add("impact-core");
  core.setAttribute("cx", cx.toFixed(2));
  core.setAttribute("cy", cy.toFixed(2));
  core.setAttribute("r", "0");
  core.setAttribute("opacity", "1");

  group.appendChild(glow);
  group.appendChild(halo);
  group.appendChild(wave);
  group.appendChild(ring);
  group.appendChild(core);

  const sparks = [];
  const sparkCount = 8;
  const sparkLength = STICKER_DIAMETER * 2.1;
  for (let i = 0; i < sparkCount; i += 1) {
    const angle = (Math.PI * 2 * i) / sparkCount;
    const spark = document.createElementNS(svgNS, "line");
    spark.classList.add("impact-spark");
    spark.setAttribute("x1", cx.toFixed(2));
    spark.setAttribute("y1", cy.toFixed(2));
    spark.setAttribute("x2", cx.toFixed(2));
    spark.setAttribute("y2", cy.toFixed(2));
    spark.dataset.x2 = (cx + Math.cos(angle) * sparkLength).toFixed(2);
    spark.dataset.y2 = (cy + Math.sin(angle) * sparkLength).toFixed(2);
    group.appendChild(spark);
    sparks.push(spark);
  }

  const embers = [];
  const emberCount = 6;
  for (let i = 0; i < emberCount; i += 1) {
    const ember = document.createElementNS(svgNS, "circle");
    ember.classList.add("impact-ember");
    const theta = Math.random() * Math.PI * 2;
    const distance = STICKER_RADIUS * (0.4 + Math.random() * 2.2);
    const ex = cx + Math.cos(theta) * distance;
    const ey = cy + Math.sin(theta) * distance;
    ember.setAttribute("cx", ex.toFixed(2));
    ember.setAttribute("cy", ey.toFixed(2));
    ember.setAttribute("r", "0");
    ember.setAttribute("opacity", "0.9");
    group.appendChild(ember);
    embers.push(ember);
  }

  effectsLayer.appendChild(group);

  if (window.anime && typeof window.anime.timeline === "function") {
    const cleanup = () => {
      if (group.isConnected) {
        group.remove();
      }
    };
    const timeline = window.anime.timeline({ easing: "easeOutCubic" });
    timeline
      .add(
        {
          targets: glow,
          r: [0, STICKER_DIAMETER * 4.2],
          opacity: [0.75, 0],
          duration: 880,
        },
        0,
      )
      .add(
        {
          targets: halo,
          r: [STICKER_RADIUS * 0.6, STICKER_DIAMETER * 2.4],
          strokeWidth: [10, 0],
          opacity: [0.9, 0],
          duration: 560,
          easing: "easeOutQuad",
        },
        0,
      )
      .add(
        {
          targets: wave,
          r: [STICKER_RADIUS * 0.75, STICKER_DIAMETER * 3.4],
          opacity: [0.9, 0],
          strokeWidth: [8, 0],
          duration: 700,
          easing: "easeOutCubic",
        },
        80,
      )
      .add(
        {
          targets: ring,
          r: [STICKER_RADIUS * 0.5, STICKER_DIAMETER * 2.9],
          opacity: [0.95, 0],
          strokeWidth: [3, 0],
          strokeDashoffset: [18, 0],
          duration: 620,
          easing: "easeOutQuad",
        },
        120,
      )
      .add(
        {
          targets: core,
          r: [0, STICKER_RADIUS * 0.55],
          opacity: [1, 0],
          duration: 340,
          easing: "easeOutQuad",
        },
        0,
      )
      .add(
        {
          targets: sparks,
          x2: (el) => Number(el.dataset.x2),
          y2: (el) => Number(el.dataset.y2),
          opacity: [0, 1],
          duration: 280,
          easing: "easeOutExpo",
          delay: window.anime.stagger(18),
        },
        0,
      )
      .add(
        {
          targets: sparks,
          opacity: [1, 0],
          strokeWidth: [3, 0],
          duration: 260,
          easing: "easeInQuad",
          delay: window.anime.stagger(22),
        },
        320,
      )
      .add(
        {
          targets: embers,
          r: [0, 5.5],
          opacity: [0.9, 0],
          duration: 540,
          easing: "easeOutCubic",
          delay: window.anime.stagger(60, { start: 100 }),
        },
        100,
      );
    if (timeline.finished && typeof timeline.finished.then === "function") {
      timeline.finished.then(cleanup).catch(cleanup);
    } else {
      setTimeout(cleanup, 880);
    }
  } else {
    setTimeout(() => {
      if (group.isConnected) {
        group.remove();
      }
    }, 720);
  }
}

function initAmbientGlow() {
  if (!ambientLayer) {
    return;
  }
  if (mediaPrefersReducedMotion?.matches) {
    destroyAmbientGlow();
    return;
  }
  if (!window.anime || typeof window.anime.timeline !== "function") {
    return;
  }
  destroyAmbientGlow();

  const pathNodes = Array.from(document.querySelectorAll("#eagleBody, #eagleTail"));
  const pathEntries = pathNodes
    .map((path) => {
      try {
        const length = path.getTotalLength();
        if (!Number.isFinite(length) || length <= 0) {
          return null;
        }
        return { path, length };
      } catch (error) {
        console.warn("Ambient glow path sampling failed", error);
        return null;
      }
    })
    .filter(Boolean);

  if (!pathEntries.length) {
    return;
  }

  const combinedLength = pathEntries.reduce((sum, entry) => sum + entry.length, 0);
  if (!Number.isFinite(combinedLength) || combinedLength <= 0) {
    return;
  }

  const isCompactViewport = typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 768px)").matches;
  const sparkCount = isCompactViewport ? 12 : 22;
  const averageSpacing = combinedLength / sparkCount;
  const jitterWindow = Math.min(averageSpacing * 0.6, 220);

  for (let i = 0; i < sparkCount; i += 1) {
    const offset = averageSpacing * i + (Math.random() - 0.5) * jitterWindow;
    const normalizedCombined = ((offset % combinedLength) + combinedLength) % combinedLength;

    let remaining = normalizedCombined;
    let targetEntry = pathEntries[0];
    for (const entry of pathEntries) {
      if (remaining <= entry.length) {
        targetEntry = entry;
        break;
      }
      remaining -= entry.length;
    }

    let point;
    try {
      point = targetEntry.path.getPointAtLength(Math.max(0, remaining));
    } catch (error) {
      continue;
    }
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      continue;
    }

    const jitterX = window.anime.random(-28, 28);
    const jitterY = window.anime.random(-26, 26);
    const maxRadius = window.anime.random(18, 36);
    const maxOpacity = window.anime.random(55, 88) / 100;
    const strokeWidth = window.anime.random(12, 26) / 10;

    const spark = document.createElementNS(svgNS, "circle");
    spark.classList.add("ambient-spark");
    spark.setAttribute("cx", (point.x + jitterX).toFixed(2));
    spark.setAttribute("cy", (point.y + jitterY).toFixed(2));
    spark.setAttribute("r", "0");
    spark.setAttribute("opacity", "0");
    spark.setAttribute("fill", "url(#eagleGlowGradient)");
    spark.setAttribute("stroke", "rgba(255, 228, 188, 0.6)");
    spark.setAttribute("stroke-width", strokeWidth.toFixed(2));
    spark.dataset.maxRadius = maxRadius.toFixed(2);
    spark.dataset.maxOpacity = maxOpacity.toFixed(2);
    ambientLayer.appendChild(spark);
    ambientState.nodes.push(spark);
  }

  ambientState.currentCount = ambientState.nodes.length;
  if (!ambientState.currentCount) {
    return;
  }

  const startDelay = window.anime.random(0, 360);
  const timeline = window.anime.timeline({ loop: true, autoplay: true });
  timeline
    .add({
      targets: ambientState.nodes,
      r: (el) => Number(el.dataset.maxRadius ?? 24),
      opacity: (el) => Number(el.dataset.maxOpacity ?? 0.7),
      duration: 1600,
      easing: "easeOutCubic",
      delay: window.anime.stagger(180, { start: startDelay }),
    })
    .add({
      targets: ambientState.nodes,
      r: 0,
      opacity: 0,
      duration: 1700,
      easing: "easeInQuad",
      delay: window.anime.stagger(210, { direction: "reverse" }),
    });

  ambientState.animation = timeline;
}

function destroyAmbientGlow() {
  if (ambientState.animation && typeof ambientState.animation.pause === "function") {
    ambientState.animation.pause();
  }
  ambientState.animation = null;
  ambientState.nodes.forEach((node) => {
    if (node?.isConnected) {
      node.remove();
    }
  });
  ambientState.nodes.length = 0;
  ambientState.currentCount = 0;
  if (ambientState.resizeTimer) {
    clearTimeout(ambientState.resizeTimer);
    ambientState.resizeTimer = null;
  }
}

function refreshAmbientGlow(force = false) {
  if (!ambientLayer) {
    destroyAmbientGlow();
    return;
  }
  if (mediaPrefersReducedMotion?.matches) {
    destroyAmbientGlow();
    return;
  }
  if (!force) {
    const isCompactViewport = typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(max-width: 768px)").matches;
    const desiredCount = isCompactViewport ? 12 : 22;
    if (ambientState.currentCount === desiredCount) {
      return;
    }
  }
  initAmbientGlow();
}

function scheduleAmbientGlowRefresh() {
  if (!ambientLayer) {
    return;
  }
  if (ambientState.resizeTimer) {
    clearTimeout(ambientState.resizeTimer);
  }
  ambientState.resizeTimer = window.setTimeout(() => {
    ambientState.resizeTimer = null;
    refreshAmbientGlow();
  }, 260);
}

function runPopAnimation(node) {
  if (!window.anime || !node) {
    return;
  }
  node.style.transformOrigin = "50% 50%";
  window.anime({
    targets: node,
    scale: [0.35, 1],
    easing: "easeOutBack",
    duration: 520,
    complete: () => {
      if (node?.style) {
        node.style.removeProperty("transform");
      }
    },
  });
}

function runPulseAnimation(node) {
  if (!window.anime || !node) {
    return;
  }
  node.style.transformOrigin = "50% 50%";
  window.anime({
    targets: node,
    scale: [1, 1.15, 1],
    duration: 620,
    easing: "easeInOutSine",
    complete: () => {
      if (node?.style) {
        node.style.removeProperty("transform");
      }
    },
  });
}

function resetFlipCard() {
  if (!flipCardInner) {
    return;
  }
  if (state.flipAnimation) {
    state.flipAnimation.pause();
    state.flipAnimation = null;
  }
  flipCardInner.dataset.state = "front";
  flipCardInner.style.transform = "rotateY(0deg)";
  flipFront?.setAttribute("aria-hidden", "false");
  flipBack?.setAttribute("aria-hidden", "true");
}

function playFlipReveal() {
  if (!flipCardInner) {
    noteInput.focus({ preventScroll: true });
    return;
  }
  flipCardInner.dataset.state = "transition";
  flipFront?.setAttribute("aria-hidden", "false");
  flipBack?.setAttribute("aria-hidden", "true");
  if (!window.anime) {
    finalizeFlipReveal();
    return;
  }
  if (state.flipAnimation) {
    state.flipAnimation.pause();
  }
  const timeline = window.anime.timeline({
    targets: flipCardInner,
    easing: "easeInOutCubic",
    duration: 520,
  });
  timeline
    .add({ rotateY: 96, scale: 1.04, duration: 220 })
    .add({ rotateY: 180, scale: 1, duration: 240, easing: "easeOutCubic" });
  state.flipAnimation = timeline;
  if (timeline.finished && typeof timeline.finished.then === "function") {
    timeline.finished
      .then(() => {
        if (state.flipAnimation === timeline) {
          state.flipAnimation = null;
          finalizeFlipReveal();
        }
      })
      .catch(() => {
        if (state.flipAnimation === timeline) {
          state.flipAnimation = null;
          finalizeFlipReveal();
        }
      });
  } else {
    setTimeout(() => {
      if (state.flipAnimation === timeline) {
        state.flipAnimation = null;
        finalizeFlipReveal();
      }
    }, 520);
  }
}

function finalizeFlipReveal() {
  if (!flipCardInner) {
    noteInput.focus({ preventScroll: true });
    return;
  }
  flipCardInner.dataset.state = "back";
  flipCardInner.style.transform = "rotateY(180deg)";
  flipFront?.setAttribute("aria-hidden", "true");
  flipBack?.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => noteInput.focus({ preventScroll: true }));
}

function playFlipReturn() {
  if (!flipCardInner) {
    return Promise.resolve();
  }
  if (state.flipAnimation) {
    state.flipAnimation.pause();
    state.flipAnimation = null;
  }
  const currentState = flipCardInner.dataset.state;
  if (currentState !== "back") {
    resetFlipCard();
    return Promise.resolve();
  }
  flipCardInner.dataset.state = "transition";
  flipFront?.setAttribute("aria-hidden", "false");
  flipBack?.setAttribute("aria-hidden", "true");

  if (!window.anime || typeof window.anime.timeline !== "function") {
    resetFlipCard();
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeline = window.anime.timeline({
      targets: flipCardInner,
      easing: "easeInOutCubic",
      duration: 360,
    });
    state.flipAnimation = timeline;

    const finalize = () => {
      if (state.flipAnimation === timeline) {
        state.flipAnimation = null;
      }
      resetFlipCard();
      resolve();
    };

    timeline
      .add({ rotateY: 120, scale: 1.02, duration: 150 })
      .add({ rotateY: 0, scale: 1, duration: 190, easing: "easeOutCubic" });

    if (timeline.finished && typeof timeline.finished.then === "function") {
      timeline.finished
        .then(finalize)
        .catch((error) => {
          console.error("Flip return animation timeline failed", error);
          finalize();
        });
    } else {
      setTimeout(finalize, 360);
    }
  });
}

function setTimestampDisplay(record) {
  if (!noteTimestamp) {
    return;
  }
  if (!record || !record.created_at) {
    noteTimestamp.textContent = "";
    noteTimestamp.hidden = true;
    return;
  }
  const createdText = formatDateTime(record.created_at);
  if (!createdText) {
    noteTimestamp.textContent = "";
    noteTimestamp.hidden = true;
    return;
  }
  noteTimestamp.textContent = `留言時間：${createdText}`;
  noteTimestamp.hidden = false;
}

function formatDateTime(value) {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    if (timestampFormatter) {
      return timestampFormatter.format(date);
    }
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
  } catch (error) {
    console.error("Failed to format date", error);
    return null;
  }
}

function animateStickerZoom(originNode, options = {}) {
  if (!window.anime || typeof window.anime.timeline !== "function") {
    return Promise.resolve();
  }
  const sourceRect = options?.sourceRect ?? originNode?.getBoundingClientRect?.();
  if (!sourceRect || !sourceRect.width || !sourceRect.height) {
    return Promise.reject(new Error("Origin sticker bounds unavailable"));
  }
  cleanupZoomOverlay();
  const overlay = createStickerOverlay({
    left: sourceRect.left,
    top: sourceRect.top,
    width: sourceRect.width,
    height: sourceRect.height,
    opacity: 0,
  });
  if (!overlay) {
    return Promise.reject(new Error("Failed to create zoom overlay"));
  }

  const targetSize = computeZoomTargetSize();
  const targetLeft = (window.innerWidth - targetSize) / 2;
  const targetTop = (window.innerHeight - targetSize) / 2;

  return new Promise((resolve) => {
    let resolved = false;
    const finishResolve = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    const timeline = window.anime.timeline({
      targets: overlay,
      easing: "easeInOutCubic",
    });
    state.zoomAnimation = timeline;

    const finalize = () => {
      if (state.zoomAnimation === timeline && typeof timeline.pause === "function") {
        timeline.pause();
      }
      if (state.zoomAnimation === timeline) {
        state.zoomAnimation = null;
      }
      if (state.zoomOverlay === overlay) {
        state.zoomOverlay = null;
      }
      overlay.remove();
      if (state.zoomResolve === finalizeAndResolve) {
        state.zoomResolve = null;
      }
    };

    const finalizeAndResolve = () => {
      finalize();
      finishResolve();
    };

    state.zoomResolve = finalizeAndResolve;

    timeline
      .add({
        left: targetLeft,
        top: targetTop,
        width: targetSize,
        height: targetSize,
        opacity: [0, 1],
        duration: 480,
        round: 2,
        complete: finishResolve,
      })
      .add({
        opacity: 0,
        duration: 140,
        easing: "easeInQuad",
        delay: 20,
        complete: finalizeAndResolve,
      });

    if (timeline.finished && typeof timeline.finished.then === "function") {
      timeline.finished.catch(finalizeAndResolve);
    } else {
      setTimeout(finalizeAndResolve, 640);
    }
  });
}

function animateStickerReturn(pendingSnapshot, result) {
  if (result === "deleted" || pendingSnapshot?.deleted) {
    if (pendingSnapshot?.node?.isConnected) {
      pendingSnapshot.node.remove();
    }
    return Promise.resolve();
  }
  const node = pendingSnapshot?.node;
  if (!node) {
    return Promise.resolve();
  }
  const returnToPalette = Boolean(pendingSnapshot.isNew && result !== "saved");
  const shouldPlayImpact = !returnToPalette && result === "saved";
  const hasAnime = Boolean(window.anime && typeof window.anime.timeline === "function");
  if (!hasAnime) {
    finalizeReturnWithoutAnimation(node, returnToPalette);
    if (shouldPlayImpact) {
      playPlacementImpactEffect(node);
    }
    return Promise.resolve();
  }

  const centerRect = computeCenterRect();
  const targetRaw = returnToPalette ? getPaletteTargetRect() : node.getBoundingClientRect();
  if (!centerRect || !targetRaw || !targetRaw.width || !targetRaw.height) {
    finalizeReturnWithoutAnimation(node, returnToPalette);
    if (shouldPlayImpact) {
      playPlacementImpactEffect(node);
    }
    return Promise.resolve();
  }

  cleanupZoomOverlay();
  const overlay = createStickerOverlay({
    left: centerRect.left,
    top: centerRect.top,
    width: centerRect.width,
    height: centerRect.height,
    opacity: 1,
  });
  if (!overlay) {
    finalizeReturnWithoutAnimation(node, returnToPalette);
    if (shouldPlayImpact) {
      playPlacementImpactEffect(node);
    }
    return Promise.resolve();
  }

  const targetRect = normalizeTargetRect(targetRaw, returnToPalette);
  if (!targetRect) {
    overlay.remove();
    finalizeReturnWithoutAnimation(node, returnToPalette);
    if (shouldPlayImpact) {
      playPlacementImpactEffect(node);
    }
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let finished = false;
    let timelineRef = null;

    const finalize = () => {
      if (finished) {
        return;
      }
      finished = true;
      if (state.zoomAnimation === timelineRef && timelineRef && typeof timelineRef.pause === "function") {
        timelineRef.pause();
      }
      if (state.zoomAnimation === timelineRef) {
        state.zoomAnimation = null;
      }
      if (state.zoomOverlay === overlay) {
        state.zoomOverlay = null;
      }
      overlay.remove();
      finalizeReturnWithoutAnimation(node, returnToPalette);
      if (shouldPlayImpact) {
        playPlacementImpactEffect(node);
      }
      if (state.zoomResolve === finalizeAndResolve) {
        state.zoomResolve = null;
      }
      resolve();
    };

    const finalizeAndResolve = () => finalize();

    state.zoomResolve = finalizeAndResolve;
    timelineRef = window.anime.timeline({
      targets: overlay,
      easing: "easeInOutCubic",
    });
    state.zoomAnimation = timelineRef;

    timelineRef
      .add({
        left: targetRect.left,
        top: targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
        duration: 420,
        round: 2,
      })
      .add({
        opacity: 0,
        duration: 140,
        easing: "easeInQuad",
        delay: 30,
        complete: finalizeAndResolve,
      });

    if (timelineRef.finished && typeof timelineRef.finished.then === "function") {
      timelineRef.finished.catch(finalize);
    } else {
      setTimeout(finalize, 640);
    }
  });
}

function finalizeReturnWithoutAnimation(node, returnToPalette) {
  if (!node) {
    return;
  }
  if (returnToPalette) {
    if (node.isConnected) {
      node.remove();
    }
  } else {
    setStickerInFlight(node, false);
  }
}

function computeZoomTargetSize() {
  const viewportMin = Math.min(window.innerWidth || 0, window.innerHeight || 0);
  if (!viewportMin) {
    return 360;
  }
  const ideal = viewportMin * 0.52;
  const minSize = 320;
  const maxSize = 440;
  return Math.max(minSize, Math.min(ideal, maxSize));
}

function cleanupZoomOverlay() {
  if (state.zoomResolve) {
    const resolver = state.zoomResolve;
    state.zoomResolve = null;
    resolver();
    return;
  }
  if (state.zoomAnimation && typeof state.zoomAnimation.pause === "function") {
    state.zoomAnimation.pause();
  }
  state.zoomAnimation = null;
  if (state.zoomOverlay) {
    state.zoomOverlay.remove();
    state.zoomOverlay = null;
  }
}

function createStickerOverlay({ left, top, width, height, opacity = 0 }) {
  if (!document.body) {
    return null;
  }
  const overlay = document.createElement("div");
  overlay.className = "zoom-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;
  overlay.style.width = `${width}px`;
  overlay.style.height = `${height}px`;
  overlay.style.opacity = Number.isFinite(opacity) ? String(opacity) : "0";
  const image = document.createElement("img");
  image.src = "svg/Top Heart Mark.svg";
  image.alt = "";
  image.draggable = false;
  image.setAttribute("aria-hidden", "true");
  overlay.appendChild(image);
  document.body.appendChild(overlay);
  state.zoomOverlay = overlay;
  return overlay;
}

function computeCenterRect() {
  const size = computeZoomTargetSize();
  const left = (window.innerWidth - size) / 2;
  const top = (window.innerHeight - size) / 2;
  return { left, top, width: size, height: size };
}

function getPaletteTargetRect() {
  if (!paletteSticker) {
    return null;
  }
  const svg = paletteSticker.querySelector("svg");
  if (svg) {
    const svgRect = svg.getBoundingClientRect();
    if (svgRect && svgRect.width && svgRect.height) {
      return {
        left: svgRect.left,
        top: svgRect.top,
        width: svgRect.width,
        height: svgRect.height,
      };
    }
  }
  const rect = paletteSticker.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }
  const size = Math.min(rect.width, rect.height);
  const left = rect.left + (rect.width - size) / 2;
  const top = rect.top + (rect.height - size) / 2;
  return { left, top, width: size, height: size };
}

function normalizeTargetRect(rect, preferSquare = false) {
  if (!rect) {
    return null;
  }
  let { left, top, width, height } = rect;
  if (!width || !height) {
    return null;
  }
  if (preferSquare) {
    const size = Math.min(width, height);
    if (!size) {
      return null;
    }
    left += (width - size) / 2;
    top += (height - size) / 2;
    width = size;
    height = size;
  }
  return { left, top, width, height };
}

function setStickerInFlight(node, inFlight) {
  if (!node) {
    return;
  }
  node.classList.toggle("in-flight", Boolean(inFlight));
}

function isStickerLocked(record) {
  if (!record) {
    return false;
  }
  const createdAt = record.created_at ?? record.createdAt ?? null;
  if (!createdAt) {
    return false;
  }
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return false;
  }
  const ageMs = Date.now() - created.getTime();
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  return ageMs > twentyFourHoursMs;
}

function resolveLockReason(record) {
  if (!record) {
    return null;
  }
  const recordDeviceId = record.deviceId ?? record.device_id ?? null;
  const ownsRecord = !recordDeviceId || !state.deviceId || recordDeviceId === state.deviceId;
  if (record.isApproved && ownsRecord) {
    return "approved";
  }
  if (isStickerLocked(record)) {
    return "time";
  }
  if (recordDeviceId && state.deviceId && recordDeviceId !== state.deviceId) {
    return "device";
  }
  return null;
}

function setNoteLocked(locked, options = {}) {
  const isLocked = Boolean(locked);
  noteInput.readOnly = isLocked;
  noteInput.classList.toggle("locked", isLocked);
  noteInput.setAttribute("aria-readonly", isLocked ? "true" : "false");
  if (saveButton) {
    saveButton.hidden = isLocked;
    saveButton.disabled = isLocked;
    if (isLocked) {
      saveButton.setAttribute("aria-hidden", "true");
      saveButton.setAttribute("aria-disabled", "true");
    } else {
      saveButton.removeAttribute("aria-hidden");
      saveButton.removeAttribute("aria-disabled");
      saveButton.disabled = false;
    }
  }
  if (!isLocked && !options.preserveMessage) {
    formError.textContent = "";
  }
  updateDialogSubtitle(isLocked, options.reason ?? null);
}

function updateDeleteButton() {
  if (!deleteStickerBtn) {
    return;
  }
  const pending = state.pending;
  const ownDevice = !pending?.deviceId || !state.deviceId || pending.deviceId === state.deviceId;
  const canDelete = Boolean(
    pending
      && !pending.isNew
      && ownDevice
      && (!pending.locked || pending.lockReason === "approved")
  );
  deleteStickerBtn.hidden = !canDelete;
  deleteStickerBtn.disabled = !canDelete;
  if (canDelete) {
    deleteStickerBtn.removeAttribute("aria-hidden");
  } else {
    deleteStickerBtn.setAttribute("aria-hidden", "true");
  }
}

function updateDialogSubtitle(isLocked, reason = null) {
  if (!dialogSubtitle) {
    return;
  }
  if (isLocked) {
    if (reason === "approved") {
      dialogSubtitle.textContent = "此留言已通過審核，內容目前為唯讀";
      dialogSubtitle.hidden = false;
    } else {
      dialogSubtitle.textContent = "";
      dialogSubtitle.hidden = true;
    }
    return;
  }
  dialogSubtitle.textContent = SUBTITLE_TEXT;
  dialogSubtitle.hidden = false;
}

function createUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}
