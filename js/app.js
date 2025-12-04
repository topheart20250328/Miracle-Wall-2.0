import { supabase, isSupabaseConfigured, deviceId as initialDeviceId } from "./supabase-config.js";
import * as Utils from "./modules/Utils.js";
import * as AudioManager from "./modules/AudioManager.js";
import * as MarqueeController from "./modules/MarqueeController.js";
import * as ZoomController from "./modules/ZoomController.js";
import * as EffectsManager from "./modules/EffectsManager.js";
import * as StickerManager from "./modules/StickerManager.js";
import * as PlaybackController from "./modules/PlaybackController.js";
import * as SearchController from "./modules/SearchController.js";
import * as RealtimeController from "./modules/RealtimeController.js";

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
const jumpToRecentBtn = document.getElementById("jumpToRecentBtn");
const playbackBtn = document.getElementById("playbackBtn");
const onlineCountBtn = document.getElementById("onlineCountBtn");
const onlineCountNum = document.getElementById("onlineCountNum");
const playbackDateContainer = document.getElementById("playbackDateContainer");
const playbackYearDisplay = document.getElementById("playbackYearDisplay");
const playbackDateDisplay = document.getElementById("playbackDateDisplay");
const playbackCounterDisplay = document.getElementById("playbackCounterDisplay");
const zoomIndicator = document.getElementById("zoomIndicator");
const settingsBtn = document.getElementById("settingsBtn");
const settingsDialog = document.getElementById("settingsDialog");
const settingsCloseBtn = document.getElementById("settingsCloseBtn");
const settingsForm = document.getElementById("settingsForm");
const audioToggle = document.getElementById("audioToggle");
const onlineToggle = document.getElementById("onlineToggle");
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
const MARQUEE_SPEED_PX_PER_SEC = 60;
const MARQUEE_MIN_DURATION_MS = 20000;
const MARQUEE_MAX_DURATION_MS = 180000;
const MOBILE_VIEWPORT_QUERY = "(max-width: 640px)";
const MOBILE_VISIBLE_MARQUEE_INDICES = new Set([0, 1, 4, 5]);
const MOBILE_SEED_BURST_COUNT = 2;
const statusToast = document.getElementById("statusToast");
const loadingSpinner = document.getElementById("loadingSpinner");
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
const DEVICE_STORAGE_KEY = "wallDeviceId";
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
const TOUCH_DRAG_OFFSET_X = 0;
const TOUCH_DRAG_OFFSET_Y = STICKER_DIAMETER * 2;
const POSITION_CONFLICT_CODE = "POSITION_CONFLICT";
const PLACEMENT_MESSAGES = {
  idle: "點擊下方貼紙放置",
  click: "在老鷹上點擊以貼上",
  drag: "拖曳到老鷹上方並鬆開以貼上",
};
const SUBTITLE_TEXT = "";

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
  isSubmitting: false,
  recentIndex: 0,
  dragRafId: null,
  isAnimatingReturn: false,
  isTransitioning: false,
};
const reviewSettings = {
  requireMarqueeApproval: true,
  requireStickerApproval: true,
  ready: false,
};
const userAgent = typeof navigator !== "undefined" ? navigator.userAgent ?? "" : "";
const isIOSDevice = /iPad|iPhone|iPod/i.test(userAgent);
const isLineInApp = /Line\//i.test(userAgent);
const requiresStickerForceRedraw = isIOSDevice || isLineInApp;

// Apply online status preference immediately to prevent flash of content
const initialOnlineStatus = localStorage.getItem("onlineStatus") !== "false";
if (onlineCountBtn) {
  onlineCountBtn.style.display = initialOnlineStatus ? "" : "none";
}

init().catch((err) => console.error(err));
initSettingsDialog();

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    StickerManager.cleanupReviewSettingsSubscription();
  });
}

function init() {
  state.deviceId = initialDeviceId ?? ensureDeviceId();
  wallSvg.addEventListener("click", handleEagleClick);
  wallSvg.addEventListener("keydown", handleWallKeydown);
  paletteSticker?.addEventListener("pointerdown", handlePalettePointerDown);
  paletteSticker?.addEventListener("keydown", handlePaletteKeydown);
  noteForm.addEventListener("submit", handleFormSubmit);
  cancelModalBtn.addEventListener("click", handleCancelAction);
  noteDialog.addEventListener("cancel", handleDialogCancel);
  noteDialog.addEventListener("close", handleDialogClose);
  noteDialog.addEventListener("click", (event) => {
    if (event.target === noteDialog) {
      handleCancelAction();
    }
  });
  initDialogSwipe();
  deleteStickerBtn?.addEventListener("click", handleDeleteSticker);
  jumpToRecentBtn?.addEventListener("click", handleJumpToRecent);
  document.addEventListener("keydown", handleGlobalKeyDown);
  window.addEventListener("resize", handleViewportChange);

  AudioManager.initAudioManager(backgroundAudio, audioToggle);
  ZoomController.initZoomController({
    wallStage, wallWrapper, wallSvg, stickersLayer, zoomSlider, zoomResetBtn, zoomIndicator,
    interactionTarget: document.body, // Allow zooming/panning from anywhere on the screen
    onZoomReset: () => {
        // If playback is active, do NOT refresh stickers, just reset view (which ZoomController does)
        if (document.body.classList.contains("playback-mode")) {
            return;
        }
        
        if (!isSupabaseConfigured()) return;
        // Only refresh if not using realtime (though we are, user asked for this logic)
        // But user said: "if you already have set real-time update stickers setting, then no need to add this function"
        // Since we DO have realtime subscription in init(), we technically don't need this.
        // However, to be safe and follow "refresh latest message" request explicitly:
        // We will just re-fetch to ensure sync if realtime missed something.
        StickerManager.loadExistingStickers().catch(console.error);
    }
  }, requiresStickerForceRedraw);
  EffectsManager.initEffectsManager({
    effectsLayer, ambientLayer, stickersLayer
  }, mediaPrefersReducedMotion);
  MarqueeController.initMarqueeController(marqueeLayer, marqueeLines, (stickerId) => {
    if (state.isTransitioning) return;
    if (stickerId) {
      const sticker = state.stickers.get(stickerId);
      if (sticker && Number.isFinite(sticker.x) && Number.isFinite(sticker.y)) {
        const isMobile = window.innerWidth <= 640;
        const targetZoom = isMobile ? 10 : 5;
        ZoomController.panToPoint(sticker.x, sticker.y, viewBox, targetZoom, () => {
          StickerManager.handleStickerActivation(stickerId);
        }, { duration: 500, easing: 'easeOutCubic' });
      } else {
        StickerManager.handleStickerActivation(stickerId);
      }
    }
  });
  SearchController.initSearchController({
    searchBtn: document.getElementById("searchBtn"),
    searchBar: document.getElementById("searchBar"),
    input: document.getElementById("searchInput"),
    clearBtn: document.getElementById("searchClearBtn"),
    closeBtn: document.getElementById("searchCloseBtn"),
    countDisplay: document.getElementById("searchCount"),
    dialogPrevBtn: document.getElementById("dialogPrevBtn"),
    dialogNextBtn: document.getElementById("dialogNextBtn"),
    dialogSearchCounter: document.getElementById("dialogSearchCounter"),
    searchQuickFilters: document.getElementById("searchQuickFilters")
  }, {
    getStickers: () => state.stickers,
    getDeviceId: () => state.deviceId,
    onFocusSticker: (sticker) => {
      if (state.isTransitioning) return;
      if (sticker && sticker.id) {
        StickerManager.handleStickerActivation(sticker.id);
      }
    },
    onNavigateSticker: (sticker, direction) => {
      // Only navigate content if dialog is open
      if (noteDialog && noteDialog.open) {
        handleStickerNavigation(sticker, direction);
      }
    },
    onPanToSticker: (sticker, onComplete, playEffect = true) => {
      if (sticker && Number.isFinite(sticker.x) && Number.isFinite(sticker.y)) {
        const isMobile = window.innerWidth <= 640;
        const targetZoom = isMobile ? 10 : 5;
        ZoomController.panToPoint(sticker.x, sticker.y, viewBox, targetZoom, () => {
          if (playEffect) {
            EffectsManager.playFocusHalo(sticker.x, sticker.y);
          }
          if (onComplete) onComplete();
        }, { duration: 500, easing: 'easeOutCubic' });
      } else if (onComplete) {
        onComplete();
      }
    },
    onSearchOpen: () => {
      EffectsManager.setShimmerPaused(true);
    },
    onSearchClose: () => {
      // Stop any active focus halo
      EffectsManager.stopFocusHalo();
      
      // Only resume shimmer if we are NOT entering playback mode
      // (PlaybackController closes search when starting, which would otherwise resume shimmer)
      if (!document.body.classList.contains("playback-mode")) {
        EffectsManager.setShimmerPaused(false);
      }
    },
    resetStickerScale: (node) => {
      StickerManager.resetStickerScale(node);
    }
  });

  // 初始化即時互動功能 (線上人數 + 共鳴)
  RealtimeController.initRealtimeController({
    onOnlineCountChange: (count) => {
      if (onlineCountNum) {
        onlineCountNum.textContent = count;
      }
      EffectsManager.updateOnlineCount(count);
    },
    onResonance: (payload) => {
      // 若已關閉上線狀態，則不顯示他人的共鳴效果
      if (onlineToggle && !onlineToggle.checked) return;

      // Pass the remote heat value to sync if needed
      EffectsManager.playResonanceEffect(payload?.heat);
    },
    getHeat: () => EffectsManager.getResonanceHeat(),
  });

  // Initialize Online Status
  const savedOnlineStatus = localStorage.getItem("onlineStatus") !== "false";
  updateOnlineStatus(savedOnlineStatus);

  // 綁定共鳴按鈕事件
  if (onlineCountBtn) {
    onlineCountBtn.addEventListener("click", () => {
      RealtimeController.triggerResonance();
      // 本地也立即播放一次效果，讓點擊者有即時回饋
      EffectsManager.playResonanceEffect();
    });
  }

  PlaybackController.initPlaybackController({
    playButton: playbackBtn,
    dateContainer: playbackDateContainer,
    yearDisplay: playbackYearDisplay,
    dateDisplay: playbackDateDisplay,
    counterDisplay: playbackCounterDisplay,
    wallSvg: wallSvg
  }, {
    getStickers: () => state.stickers,
    onUpdateIntensity: (count) => EffectsManager.setFireIntensity(count),
    onPlaybackStateChange: (isPlaying) => {
      EffectsManager.setShimmerPaused(isPlaying);
      if (isPlaying) {
        SearchController.closeSearch();
      } else {
        if (state.sweepInterval) {
          clearInterval(state.sweepInterval);
          state.sweepInterval = null;
        }
      }
    },
    onStickerReveal: (sticker) => {
      if (sticker && Number.isFinite(sticker.x) && Number.isFinite(sticker.y)) {
        EffectsManager.playRevealBurst(sticker.x, sticker.y);
      }
    },
    onPlaybackNearEnd: () => {
      EffectsManager.playEagleSweepEffect();
      
      // Repeat sweep effect every 8 seconds
      if (state.sweepInterval) clearInterval(state.sweepInterval);
      state.sweepInterval = setInterval(() => {
        EffectsManager.playEagleSweepEffect();
      }, 8000);
    },
    onPlaybackComplete: () => {
      PlaybackController.finalizePlaybackUI();
    }
  });
  StickerManager.initStickerManager({
    stickersLayer, loadingSpinner, paletteSticker
  }, state, viewBox, reviewSettings, {
    showToast,
    updateFireIntensity: (map) => EffectsManager.updateFireIntensity(map),
    updateMarqueePool: (map, settings) => MarqueeController.updateMarqueePool(map, settings),
    runPopAnimation: EffectsManager.runPopAnimation,
    triggerPendingReviewFeedback,
    openStickerModal,
    playPlacementImpactEffect: EffectsManager.playPlacementImpactEffect
  });

  setPlacementMode("idle", { force: true });
  updatePlacementHint();
  hideStatusMessage(true);
  updateDialogSubtitle(false);
  
  EffectsManager.initShimmerSystem(state.stickers, state);

  if (isSupabaseConfigured()) {
    StickerManager.loadReviewSettings().catch((error) => console.warn("Failed to load review settings", error));
    StickerManager.subscribeToReviewSettings();
  } else {
    reviewSettings.ready = true;
  }
  if (!isSupabaseConfigured()) {
    showToast("請先在 supabase-config.js 填入專案設定", "danger");
  }
  return StickerManager.loadExistingStickers().then(() => {
    MarqueeController.initMarqueeTicker();
    
    // Highlight palette sticker on load
    const palette = document.querySelector(".drag-palette");
    if (palette) {
      setTimeout(() => {
        palette.classList.add("palette-highlight");
        setTimeout(() => {
          palette.classList.remove("palette-highlight");
        }, 6000); // Highlight for 6 seconds
      }, 1000); // Start after 1 second
    }
  });
}





function initSettingsDialog() {
  if (!settingsBtn || !settingsDialog) {
    return;
  }
  const openDialog = () => {
    AudioManager.updateAudioToggleUI();
    if (typeof settingsDialog.showModal === "function") {
      if (!settingsDialog.open) {
        settingsDialog.showModal();
        if (window.anime) {
          settingsDialog.style.opacity = "0";
          settingsDialog.style.transform = "scale(0.92) translateY(10px)";
          window.anime({
            targets: settingsDialog,
            opacity: [0, 1],
            scale: [0.92, 1],
            translateY: [10, 0],
            easing: "easeOutExpo",
            duration: 400,
          });
        }
      }
    } else {
      settingsDialog.setAttribute("open", "open");
    }
  };
  const closeDialog = () => {
    const doClose = () => {
      if (typeof settingsDialog.close === "function" && settingsDialog.open) {
        settingsDialog.close();
      } else {
        settingsDialog.removeAttribute("open");
      }
      settingsBtn?.focus();
    };

    if (window.anime && settingsDialog.open) {
      window.anime({
        targets: settingsDialog,
        opacity: 0,
        scale: 0.96,
        translateY: 10,
        easing: "easeOutQuad",
        duration: 200,
        complete: () => {
          doClose();
          settingsDialog.style.removeProperty("opacity");
          settingsDialog.style.removeProperty("transform");
        },
      });
    } else {
      doClose();
    }
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
    AudioManager.updateAudioToggleUI();
  });
  settingsForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    closeDialog();
  });
  audioToggle?.addEventListener("change", (event) => {
    AudioManager.setAudioPreference(Boolean(event.target.checked));
  });
  onlineToggle?.addEventListener("change", (event) => {
    const isEnabled = event.target.checked;
    localStorage.setItem("onlineStatus", isEnabled);
    updateOnlineStatus(isEnabled);
  });
  
  // Sync UI state
  if (onlineToggle) {
    onlineToggle.checked = localStorage.getItem("onlineStatus") !== "false";
  }
  AudioManager.updateAudioToggleUI();
}

function updateOnlineStatus(isEnabled) {
  RealtimeController.setPresenceState(isEnabled);
  
  if (isEnabled) {
    document.documentElement.classList.remove("hide-online-status");
  } else {
    document.documentElement.classList.add("hide-online-status");
  }

  if (onlineCountBtn) {
    // Use visibility instead of display to keep layout if needed, 
    // but display: none is usually better for "hiding" completely.
    // However, if the layout depends on it, we might need to check.
    // Given it's a floating button usually, display: none is fine.
    onlineCountBtn.style.display = isEnabled ? "" : "none";
  }
}

function handleJumpToRecent() {
  const stickers = Array.from(state.stickers.values());
  if (!stickers.length) {
    showToast("目前沒有留言", "info");
    return;
  }

  // Sort by created_at descending (newest first)
  const sortedStickers = stickers.sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    return timeB - timeA;
  });

  // Get the next sticker in the sequence
  const targetSticker = sortedStickers[state.recentIndex % sortedStickers.length];
  
  if (targetSticker) {
    StickerManager.handleStickerActivation(targetSticker.id);
    
    // Increment index for next click
    state.recentIndex = (state.recentIndex + 1) % sortedStickers.length;
    
    // Reset index if we've cycled through top 20 to keep it fresh
    if (state.recentIndex >= 20) {
      state.recentIndex = 0;
    }
  }
}

function handleStickerNavigation(sticker, direction = 1) {
  if (!sticker || !sticker.id) return;
  
  // 1. Update state.pending
  const record = state.stickers.get(sticker.id);
  if (!record) return;

  // Restore previous sticker visibility if it exists
  if (state.pending && state.pending.node && state.pending.id !== record.id) {
    StickerManager.setStickerInFlight(state.pending.node, false);
  }

  // Hide new sticker (it's now "in" the dialog)
  if (record.node) {
    StickerManager.setStickerInFlight(record.node, true);
  }

  state.pending = {
    id: record.id,
    x: record.x,
    y: record.y,
    node: record.node,
    isNew: false,
    deviceId: record.deviceId ?? null,
    lockReason: null,
    isApproved: Boolean(record.isApproved),
    canViewNote: Boolean(record.canViewNote),
  };

  const lockReason = Utils.resolveLockReason(record, state.deviceId);
  state.pending.lockReason = lockReason;
  state.pending.locked = Boolean(lockReason);

  // 2. Animate Flip (Back -> Front -> Back) to swap content
  if (!flipCardInner || !window.anime) {
    // Fallback if no animation support
    updateDialogContent(record, lockReason);
    return;
  }

  if (state.flipAnimation) {
    state.flipAnimation.pause();
  }

  // Flip halfway to hide current content
  const timeline = window.anime.timeline({
    targets: flipCardInner,
    easing: "easeInOutCubic",
    duration: 600,
  });
  state.flipAnimation = timeline;

  // Direction 1 (Next): Flip Left (180 -> 90 -> 180)
  // Direction -1 (Prev): Flip Right (180 -> 270 -> 180)
  const midAngle = direction === 1 ? "90deg" : "270deg";

  timeline
    .add({ 
      rotateY: midAngle, 
      duration: 250,
      complete: () => {
        // Swap content while hidden
        updateDialogContent(record, lockReason);
      }
    })
    .add({ 
      rotateY: "180deg", 
      duration: 350, 
      easing: "easeOutCubic" 
    });
    
  timeline.finished.then(() => {
    if (state.flipAnimation === timeline) {
      state.flipAnimation = null;
      finalizeFlipReveal();
    }
  });
}

function updateDialogContent(record, lockReason) {
  dialogTitle.textContent = "神蹟留言";
  noteInput.value = record.note ?? "";
  resetNoteInputScrollPosition();
  formError.textContent = "";
  setTimestampDisplay(record);
  
  if (lockReason === "approved") {
    formError.textContent = "";
  } else {
    formError.textContent = "";
  }
  
  setNoteLocked(Boolean(lockReason), { reason: lockReason });
  updateDeleteButton();
}

function handleEagleClick(event) {
  if (state.isTransitioning) return;
  const stickerNode = event.target.closest(".sticker-node");
  if (stickerNode) {
    const stickerId = stickerNode.dataset.id;
    if (!state.pending && stickerId) {
      setPlacementMode("idle");
      StickerManager.handleStickerActivation(stickerId);
    }
    return;
  }
  if (state.pending) {
    return;
  }
  if (state.placementMode !== "click") {
    const now = Date.now();
    // Don't show warning if search is active
    if (document.body.classList.contains("search-active")) {
      return;
    }
    // Don't show warning if playback is active
    if (document.body.classList.contains("playback-mode")) {
      return;
    }
    if (now - state.lastClickWarning > 600) {
      // Animate the palette sticker to draw attention instead of showing a toast
      if (paletteSticker) {
        paletteSticker.classList.remove("shake-attention");
        // Force reflow to restart animation
        void paletteSticker.offsetWidth;
        paletteSticker.classList.add("shake-attention");
      }
      state.lastClickWarning = now;
    }
    return;
  }
  const svgPoint = clientToSvg(event.clientX, event.clientY);
  if (!svgPoint) return;

  // Check if click is directly valid
  if (isValidSpot(svgPoint.x, svgPoint.y)) {
    setPlacementMode("idle");
    beginPlacement(svgPoint.x, svgPoint.y);
    return;
  }

  // If not valid, try to find nearest valid spot towards center
  const center = { x: viewBox.x + viewBox.width / 2, y: viewBox.y + viewBox.height / 2 };
  const nearest = findNearestValidSpot(svgPoint, center);
  
  if (nearest) {
    setPlacementMode("idle");
    beginPlacement(nearest.x, nearest.y);
    showToast("已自動貼在最近的可放置位置", "success");
    return;
  }

  showToast("此處無法放置，請點擊老鷹範圍內", "danger");
}

function findNearestValidSpot(start, end) {
  const steps = 20;
  const dx = (end.x - start.x) / steps;
  const dy = (end.y - start.y) / steps;
  
  for (let i = 1; i <= steps; i++) {
    const testX = start.x + dx * i;
    const testY = start.y + dy * i;
    if (isValidSpot(testX, testY)) {
      return { x: testX, y: testY };
    }
  }
  return null;
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
  
  drag.lastMoveEvent = event;
  if (state.dragRafId) {
    return;
  }

  state.dragRafId = requestAnimationFrame(() => {
    state.dragRafId = null;
    const e = drag.lastMoveEvent;
    if (!e || !state.drag) return;

    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    if (!drag.active) {
      const distance = Math.hypot(dx, dy);
      if (distance < DRAG_ACTIVATION_DISTANCE) {
        return;
      }
      if (!activatePaletteDrag(e)) {
        return;
      }
    }
    updateDragPosition(e);
  });
}

function handlePalettePointerUp(event) {
  if (state.dragRafId) {
    cancelAnimationFrame(state.dragRafId);
    state.dragRafId = null;
  }
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
  if (state.dragRafId) {
    cancelAnimationFrame(state.dragRafId);
    state.dragRafId = null;
  }
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
  const svgPoint = resolveDragSvgPoint(event);
  if (!svgPoint) {
    return false;
  }
  const ghost = StickerManager.createStickerNode("drag-ghost", svgPoint.x, svgPoint.y, true);
  ghost.classList.add("drag-ghost");
  StickerManager.attachDragHighlight(ghost);
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
  const svgPoint = resolveDragSvgPoint(event);
  if (!svgPoint) {
    return;
  }
  StickerManager.positionStickerNode(drag.node, svgPoint.x, svgPoint.y);
  const valid = isValidSpot(svgPoint.x, svgPoint.y);
  drag.node.classList.toggle("valid", valid);
  drag.node.classList.toggle("invalid", !valid);
  drag.x = svgPoint.x;
  drag.y = svgPoint.y;
  drag.valid = valid;
}

function resolveDragSvgPoint(event) {
  const basePoint = clientToSvg(event.clientX, event.clientY);
  if (!basePoint) {
    return null;
  }
  if (event.pointerType !== "touch") {
    return basePoint;
  }
  return offsetTouchDragPoint(basePoint);
}

function offsetTouchDragPoint(point) {
  // Keep the dragged sticker above the user's finger on touch devices.
  if (!wallSvg) {
    return point;
  }
  const rect = wallSvg.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return point;
  }
  const offsetSvgX = (TOUCH_DRAG_OFFSET_X / rect.width) * viewBox.width;
  const offsetSvgY = (TOUCH_DRAG_OFFSET_Y / rect.height) * viewBox.height;
  const adjustedX = clampToViewBox(point.x + offsetSvgX);
  const adjustedY = clampToViewBox(point.y - offsetSvgY, true);
  return { x: adjustedX, y: adjustedY };
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

function handleWallKeydown(event) {
  const stickerNode = event.target.closest(".sticker-node");
  if (!stickerNode) {
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    const stickerId = stickerNode.dataset.id;
    if (!state.pending && stickerId) {
      setPlacementMode("idle");
      StickerManager.handleStickerActivation(stickerId);
    }
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
  EffectsManager.scheduleAmbientGlowRefresh();
  ZoomController.updateZoomStageMetrics();
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
      return Utils.createUuid();
    }
    let deviceId = storage.getItem(DEVICE_STORAGE_KEY);
    if (!deviceId) {
      deviceId = Utils.createUuid();
      storage.setItem(DEVICE_STORAGE_KEY, deviceId);
    }
    state.deviceId = deviceId;
    return deviceId;
  } catch (error) {
    console.warn("Unable to access localStorage for device binding", error);
    const fallbackId = Utils.createUuid();
    state.deviceId = fallbackId;
    return fallbackId;
  }
}

function beginPlacement(x, y) {
  setPlacementMode("idle");
  const tempId = `temp-${Utils.createUuid()}`;
  const node = StickerManager.createStickerNode(tempId, x, y, true);
  stickersLayer.appendChild(node);
  EffectsManager.playPlacementPreviewEffect(x, y);
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
  focusDialog(node);
}

function focusDialog(originNode, options = {}) {
  resetFlipCard();
  const { usePaletteSource = false } = options;
  const paletteRect = usePaletteSource ? StickerManager.getPaletteTargetRect() : null;
  const canAnimate = Boolean((paletteRect || originNode) && window.anime && typeof window.anime.timeline === "function");
  
  const openModal = (visible = true) => {
    if (document.body) {
      document.body.classList.add("dialog-open");
    }
    try {
      // Ensure opacity is reset if making visible
      if (visible) {
        noteDialog.style.opacity = "";
        noteDialog.style.pointerEvents = "";
        noteDialog.classList.remove("measuring");
        noteDialog.classList.add("backdrop-active");
      } else {
        noteDialog.style.opacity = "0";
        noteDialog.style.pointerEvents = "none";
        noteDialog.classList.add("measuring");
        noteDialog.classList.remove("backdrop-active");
      }

      if (typeof noteDialog.showModal === "function") {
        if (!noteDialog.open) {
          noteDialog.showModal();
        }
      } else {
        noteDialog.setAttribute("open", "true");
      }
    } catch (error) {
      document.body?.classList.remove("dialog-open");
      throw error;
    }
    
    // Only play flip reveal if visible, otherwise wait
    if (visible) {
      requestAnimationFrame(() => playFlipReveal());
    }
  };

  if (canAnimate && originNode && originNode.isConnected) {
    state.isTransitioning = true;
    ZoomController.setInteractionLocked(true);
    StickerManager.setStickerInFlight(originNode, true);

    // 1. Open invisibly to measure layout
    try {
      openModal(false);
    } catch (e) {
      console.warn("Failed to open modal for measurement", e);
    }

    // 2. Measure the actual card position
    let targetRect = null;
    const card = document.querySelector(".flip-card");
    if (card) {
      const rect = card.getBoundingClientRect();
      if (rect.width && rect.height) {
        targetRect = {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        };
      }
    }

    // Fallback if measurement failed (e.g. display:none or layout not ready)
    if (!targetRect || targetRect.width === 0) {
      const size = StickerManager.computeZoomTargetSize();
      const left = (window.innerWidth - size) / 2;
      const top = (window.innerHeight - size) / 2;
      targetRect = { left, top, width: size, height: size };
    }

    StickerManager.animateStickerZoom(originNode, { 
      sourceRect: paletteRect ?? undefined,
      targetRect: targetRect 
    })
      .then(() => {
        state.isTransitioning = false;
        ZoomController.setInteractionLocked(false);
        
        // 3. Make visible and play flip
        noteDialog.style.opacity = "1";
        noteDialog.style.pointerEvents = "auto";
        noteDialog.classList.remove("measuring");
        noteDialog.classList.add("backdrop-active"); // Trigger backdrop fade-in
        requestAnimationFrame(() => playFlipReveal());
      })
      .catch((error) => {
        state.isTransitioning = false;
        ZoomController.setInteractionLocked(false);
        console.error("Sticker zoom animation failed", error);
        StickerManager.setStickerInFlight(originNode, false);
        StickerManager.cleanupZoomOverlay();
        try {
          // Ensure it's visible if animation failed
          noteDialog.style.opacity = "";
          noteDialog.style.pointerEvents = "";
          noteDialog.classList.remove("measuring");
          noteDialog.classList.add("backdrop-active"); // Trigger backdrop fade-in
          if (!noteDialog.open) openModal(true);
          else {
             // If already open but hidden
             noteDialog.style.opacity = "1";
             noteDialog.style.pointerEvents = "auto";
             noteDialog.classList.remove("measuring");
             noteDialog.classList.add("backdrop-active"); // Trigger backdrop fade-in
             requestAnimationFrame(() => playFlipReveal());
          }
        } catch (openError) {
          console.error("Failed to open note dialog", openError);
        }
      });
  } else {
    if (originNode) {
      StickerManager.setStickerInFlight(originNode, true);
    }
    openModal(true);
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
  
  // Only animate if we have a snapshot AND we are not already animating (via closeDialogWithResult)
  if (pendingSnapshot && pendingSnapshot.node && !state.isAnimatingReturn) {
    try {
      await StickerManager.animateStickerReturn(pendingSnapshot, result);
    } catch (error) {
      console.error("Sticker return animation failed", error);
      StickerManager.finalizeReturnWithoutAnimation(pendingSnapshot.node, Boolean(pendingSnapshot.isNew && result !== "saved"));
    }
  }
  resetFlipCard();
  
  // Only cleanup overlay if NOT animating
  if (!state.isAnimatingReturn) {
    StickerManager.cleanupZoomOverlay();
  }
  SearchController.onDialogClosed();
}

async function handleFormSubmit(event) {
  event.preventDefault();
  if (state.isSubmitting) return;

  const message = noteInput.value.trim();
  if (!message) {
    formError.textContent = "請輸入留言內容";
    return;
  }
  const pending = state.pending;
  if (pending?.locked) {
    if (pending.lockReason === "approved") {
      formError.textContent = "";
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

  state.isSubmitting = true;
  const originalBtnText = saveButton ? saveButton.textContent : "";
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = "儲存中...";
  }

  try {
    if (pending.isNew) {
      await saveNewSticker(pending, message);
    } else {
      await updateStickerMessage(pending, message);
    }
  } finally {
    state.isSubmitting = false;
    if (saveButton) {
      saveButton.disabled = false;
      if (originalBtnText) saveButton.textContent = originalBtnText;
    }
  }
}

async function handleDeleteSticker() {
  const pending = state.pending;
  
  let isTimeLocked = false;
  if (pending && !pending.isNew) {
    const record = state.stickers.get(pending.id);
    if (record) {
      isTimeLocked = Utils.isStickerLocked(record, state.deviceId);
    }
  }

  if (!pending || pending.isNew || isTimeLocked || (pending.locked && pending.lockReason !== "approved")) {
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
  
  const result = await StickerManager.deleteSticker(pending);
  
  if (result.error) {
    const msg = result.error.message || result.error.code || "未知錯誤";
    formError.textContent = `刪除失敗: ${msg}`;
    console.error(result.error);
    deleteStickerBtn.disabled = false;
    deleteStickerBtn.textContent = originalLabel;
    return;
  }

  await closeDialogWithResult("deleted");
  showToast("留言已刪除", "success");
  
  // Reset button state (though dialog is closed)
  if (deleteStickerBtn) {
    deleteStickerBtn.disabled = false;
    deleteStickerBtn.textContent = originalLabel;
  }
}

function handleCancelAction() {
  if (state.isTransitioning || state.flipAnimation) return;
  void closeDialogWithResult("cancelled");
}

function handleDialogCancel(event) {
  event.preventDefault();
  if (state.isTransitioning || state.flipAnimation) return;
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
    StickerManager.positionStickerNode(pending.node, fallback.x, fallback.y);
    pending.x = fallback.x;
    pending.y = fallback.y;
    formError.textContent = "這個位置剛被其他人貼上，已為你換到附近的新位置，請再儲存一次。";
    showToast("這個位置剛被其他人貼上，已為你換到附近的位置", "info");
    EffectsManager.playPlacementPreviewEffect(fallback.x, fallback.y);
  } else {
    formError.textContent = "這個位置剛被其他人貼上，請關閉視窗後換個位置再試一次。";
    showToast("這個位置剛被其他人貼上，請換個位置", "danger");
  }
}

async function closeDialogWithResult(result) {
  if (state.closing || state.isTransitioning) {
    return;
  }
  state.closing = true;
  state.isTransitioning = true;
  ZoomController.setInteractionLocked(true);
  noteDialog.classList.add("closing");
  noteDialog.classList.remove("backdrop-active"); // Ensure fade-in class is removed so fade-out takes over

  // Hide navigation buttons immediately before animation
  const prevBtn = document.getElementById("dialogPrevBtn");
  const nextBtn = document.getElementById("dialogNextBtn");
  if (prevBtn) prevBtn.hidden = true;
  if (nextBtn) nextBtn.hidden = true;
  const counter = document.getElementById("dialogSearchCounter");
  if (counter) counter.hidden = true;

  try {
    // 1. Flip Back
    await playFlipReturn().catch((error) => {
      console.error("Flip return animation failed", error);
    });

    // 2. Start Return Animation (Create Overlay) BEFORE closing dialog
    const pendingSnapshot = state.pending;
    let returnAnimPromise = null;
    
    if (pendingSnapshot && pendingSnapshot.node) {
        // Recalculate current card position to ensure accuracy after keyboard/scroll shifts
        const card = document.querySelector(".flip-card");
        let currentCardRect = null;
        if (card) {
          const rect = card.getBoundingClientRect();
          if (rect.width && rect.height) {
            currentCardRect = {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height
            };
          }
        }

        // Create overlay immediately to cover the gap
        returnAnimPromise = StickerManager.animateStickerReturn(pendingSnapshot, result, currentCardRect);
        state.isAnimatingReturn = true; // Flag to protect animation from handleDialogClose cleanup
    }

    // 3. Close Dialog (Hide original card)
    if (noteDialog.open) {
      try {
        // Clear pending so handleDialogClose doesn't try to animate again
        state.pending = null;
        noteDialog.close(result);
      } catch (error) {
        console.error("Failed to close note dialog", error);
      }
    }

    // 4. Wait for animation to finish
    if (returnAnimPromise) {
        await returnAnimPromise;
    }

  } finally {
    noteDialog.classList.remove("closing");
    state.closing = false;
    state.isAnimatingReturn = false;
    state.isTransitioning = false;
    ZoomController.setInteractionLocked(false);
    
    // Final cleanup just in case
    StickerManager.cleanupZoomOverlay();
  }
}

async function saveNewSticker(pending, message) {
  const result = await StickerManager.saveSticker(pending, message);
  if (result.error) {
    if (isPositionConflictError(result.error)) {
      handlePlacementConflict(pending);
    } else {
      const msg = result.error.message || result.error.code || "未知錯誤";
      formError.textContent = `儲存失敗: ${msg}`;
      console.error("Save failed:", result.error);
      showToast(`儲存失敗: ${msg}`, "danger");
    }
    return;
  }
  await closeDialogWithResult("saved");
  showToast("留言已保存", "success");
}

async function updateStickerMessage(pending, message) {
  if (pending.deviceId && state.deviceId && pending.deviceId !== state.deviceId) {
    formError.textContent = "";
    return;
  }
  const result = await StickerManager.updateSticker(pending, message);
  if (result.error) {
    const msg = result.error.message || result.error.code || "未知錯誤";
    formError.textContent = `更新失敗: ${msg}`;
    console.error(result.error);
    return;
  }
  const record = state.stickers.get(pending.id);
  if (record) {
    EffectsManager.runPulseAnimation(record.node);
  }
  await closeDialogWithResult("saved");
  showToast("留言已更新", "success");
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
  const lockReason = Utils.resolveLockReason(record, state.deviceId);
  state.pending.lockReason = lockReason;
  state.pending.locked = Boolean(lockReason);
  if (lockReason === "approved") {
    formError.textContent = "";
  } else {
    formError.textContent = "";
  }
  setNoteLocked(Boolean(lockReason), { reason: lockReason });
  updateDeleteButton();
  focusDialog(record.node);
  SearchController.onStickerOpened(id);
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

function clientToSvg(clientX, clientY) {
  if (!wallSvg) {
    return null;
  }
  const rect = wallSvg.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }
  const normalizedX = (clientX - rect.left) / rect.width;
  const normalizedY = (clientY - rect.top) / rect.height;
  const svgX = viewBox.x + normalizedX * viewBox.width;
  const svgY = viewBox.y + normalizedY * viewBox.height;
  return { x: svgX, y: svgY };
}

const STATUS_TOAST_TIMEOUT = 2600;
const STATUS_PLACEMENT_TIMEOUT = 4200;

function showToast(message, tone = "info") {
  setStatusMessage(message, tone, { context: "toast" });
}

function setStatusMessage(message, tone = "info", options = {}) {
  if (!statusToast) {
    return;
  }
  const { persist = false, context = null, durationMs = STATUS_TOAST_TIMEOUT } = options;
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
    const timeoutDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : STATUS_TOAST_TIMEOUT;
    state.toastTimer = setTimeout(() => {
      state.toastTimer = null;
      hideStatusMessage(true);
      updatePlacementHint();
    }, timeoutDuration);
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
    setStatusMessage(PLACEMENT_MESSAGES.click, "info", { context: "placement", durationMs: STATUS_PLACEMENT_TIMEOUT });
  } else if (mode === "drag") {
    setStatusMessage(PLACEMENT_MESSAGES.drag, "info", { context: "placement", durationMs: STATUS_PLACEMENT_TIMEOUT });
  } else if (state.toastContext === "placement") {
    hideStatusMessage(true);
  }
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
    .add({ rotateY: "90deg", duration: 220 })
    .add({ rotateY: "180deg", duration: 240, easing: "easeOutCubic" });
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
      .add({ rotateY: "90deg", duration: 150 })
      .add({ rotateY: "0deg", duration: 190, easing: "easeOutCubic" });

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
  const createdText = Utils.formatDateTime(record.created_at, timestampFormatter);
  if (!createdText) {
    noteTimestamp.textContent = "";
    noteTimestamp.hidden = true;
    return;
  }
  noteTimestamp.textContent = `留言時間：${createdText}`;
  noteTimestamp.hidden = false;
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
  
  let isTimeLocked = false;
  if (pending && !pending.isNew) {
    const record = state.stickers.get(pending.id);
    if (record) {
      isTimeLocked = Utils.isStickerLocked(record, state.deviceId);
    }
  }

  const canDelete = Boolean(
    pending
      && !pending.isNew
      && ownDevice
      && !isTimeLocked
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
      dialogSubtitle.textContent = "";
      dialogSubtitle.hidden = true;
    } else {
      dialogSubtitle.textContent = "";
      dialogSubtitle.hidden = true;
    }
    return;
  }
  dialogSubtitle.textContent = SUBTITLE_TEXT;
  dialogSubtitle.hidden = !SUBTITLE_TEXT;
}

function initDialogSwipe() {
  let touchStartX = 0;
  let touchStartY = 0;

  if (!noteDialog) return;

  noteDialog.addEventListener("touchstart", (e) => {
    if (e.touches.length > 0) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: false });

  // Prevent native gestures (like swipe back) if user is swiping horizontally
  noteDialog.addEventListener("touchmove", (e) => {
    if (e.touches.length > 0) {
      const touchCurrentX = e.touches[0].clientX;
      const touchCurrentY = e.touches[0].clientY;
      const diffX = touchCurrentX - touchStartX;
      const diffY = touchCurrentY - touchStartY;

      // If horizontal swipe is dominant, prevent default to stop browser navigation
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    }
  }, { passive: false });

  noteDialog.addEventListener("touchend", (e) => {
    if (e.changedTouches.length > 0) {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      handleDialogSwipe(touchStartX, touchStartY, touchEndX, touchEndY);
    }
  }, { passive: false });
}

function handleDialogSwipe(startX, startY, endX, endY) {
  const diffX = endX - startX;
  const diffY = endY - startY;
  const minSwipeDistance = 50;
  // Allow a bit more vertical variance, but ensure horizontal is dominant
  const maxVerticalRatio = 0.8; 

  if (Math.abs(diffX) > minSwipeDistance && Math.abs(diffY) < Math.abs(diffX) * maxVerticalRatio) {
    if (diffX > 0) {
      // Swipe Right -> Previous
      SearchController.navigateDialog(-1);
    } else {
      // Swipe Left -> Next
      SearchController.navigateDialog(1);
    }
  }
}











