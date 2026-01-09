/**
 * @file app.js
 * @description 應用程式入口點 (Entry Point) 與主控制器。
 * @role Orchestrator
 * @responsibilities
 * - 初始化各功能模組 (Audio, Pixi, Realtime...)。
 * - 處理全域 UI 事件 (Zoom Slider, Settings Dialog)。
 * - 根據 URL 參數 `?engine=svg` 決定渲染引擎。
 * - 協調模組間的通訊 (例如: 縮放時通知 Pixi 重繪)。
 * 
 * CRITICAL: CROSS-PLATFORM COMPATIBILITY
 * 
 * All features must be compatible with:
 * - LINE In-App Browser
 * - Mobile Safari (iOS) & Chrome (Android)
 * - WeChat In-App Browser (Secondary)
 * 
 * Ensure robust handling of:
 * - Touch events (pointerdown/move/up/cancel)
 * - Viewport resizing (virtual keyboard, address bar)
 * - Performance on mobile devices
 */
import { supabase, isSupabaseConfigured, deviceId as initialDeviceId } from "./supabase-config.js";
import * as Utils from "./modules/Utils.js";
import * as AudioManager from "./modules/AudioManager.js";
import * as MarqueeController from "./modules/MarqueeController.js";
import * as ZoomController from "./modules/ZoomController.js";
import * as EffectsManager from "./modules/EffectsManager.js";
import * as StickerManagerSVG from "./modules/StickerManager.js";
import * as StickerManagerPixi from "./modules/StickerManagerPixi.js";

// Feature Flag: Switch Engine based on URL param ?engine=pixi
// Modified: Default to Pixi for testing, unless engine=svg is provided
const urlParams = new URLSearchParams(window.location.search);
const forceSvg = urlParams.get("engine") === "svg";
const usePixi = !forceSvg; // Default to Pixi (PixiJS)

const StickerManager = usePixi ? StickerManagerPixi : StickerManagerSVG;

if (usePixi) {
  console.log("%c [Engine] Switched to PixiJS Renderer ", "background: #222; color: #bada55");
} else {
  console.log("%c [Engine] Using Standard SVG Renderer ", "background: #222; color: #ffffff");
}

import * as PlaybackController from "./modules/PlaybackController.js";
import * as SearchController from "./modules/SearchController.js";
import * as RealtimeController from "./modules/RealtimeController.js";
import * as GhostCanvas from "./modules/GhostCanvas.js";

const svgNS = "http://www.w3.org/2000/svg";
const wallStage = document.getElementById("wallStage");
const wallWrapper = document.getElementById("wallWrapper");
const wallSvg = document.getElementById("wallSvg");
const effectsSvg = document.getElementById("effectsSvg");
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
const saveButton = noteForm ? noteForm.querySelector('button[type="submit"]') : null;
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

const liveViewBox = wallSvg ? wallSvg.viewBox.baseVal : { x: 0, y: 0, width: 3500, height: 1779.31 };
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

// Removed DOM-based ghost stickers in favor of Canvas
// const ghostStickers = new Map(); 

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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    init().catch((err) => console.error("Init failed:", err));
  });
} else {
  init().catch((err) => console.error("Init failed:", err));
}
initSettingsDialog();

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    StickerManager.cleanupReviewSettingsSubscription();
  });
  
  // Handle Visibility Change (Tab Sleeping)
  document.addEventListener("visibilitychange", () => {
    const isVisible = document.visibilityState === "visible";
    EffectsManager.handleVisibilityChange(isVisible);
    MarqueeController.handleVisibilityChange(isVisible);
  });
}

function init() {
  state.deviceId = initialDeviceId ?? ensureDeviceId();
  wallSvg.addEventListener("click", handleEagleClick);
  wallSvg.addEventListener("keydown", handleWallKeydown);
  paletteSticker?.addEventListener("pointerdown", handlePalettePointerDown);
  paletteSticker?.addEventListener("keydown", handlePaletteKeydown);
  noteForm.addEventListener("submit", handleFormSubmit);
  
  // Read Mode Overlay Logic
  const readModeOverlay = document.getElementById('readModeOverlay');
  const readModeInput = document.getElementById('readModeInput');
  const readModeContent = document.getElementById('readModeContent');
  const closeReadModeBtn = document.getElementById('closeReadModeBtn');
  const readModeContainer = readModeOverlay?.querySelector('.read-mode-container');

  const openReadMode = (isViewMode) => {
    if (!readModeOverlay || !readModeInput) return;

    readModeOverlay.showModal();
    document.body.style.overflow = 'hidden';

    if (isViewMode) {
      // View Mode: Show div, hide textarea
      if (readModeContent) {
        readModeContent.hidden = false;
        // Wrap text in a container for proper centering with scroll
        readModeContent.innerHTML = '';
        const textWrapper = document.createElement('div');
        textWrapper.className = 'read-mode-text-wrapper';
        textWrapper.textContent = noteInput.value;
        readModeContent.appendChild(textWrapper);
        
        readModeInput.hidden = true;
      }
      // Hide header in view mode to maximize space
      const header = readModeOverlay.querySelector('.read-mode-header');
      if (header) header.style.display = 'none';
      
      readModeOverlay.dataset.mode = 'view';
    } else {
      // Edit Mode: Show textarea, hide div
      if (readModeContent) {
        readModeContent.hidden = true;
        readModeInput.hidden = false;
      }
      // Show header in edit mode
      const header = readModeOverlay.querySelector('.read-mode-header');
      if (header) header.style.display = '';

      readModeInput.value = noteInput.value;
      readModeOverlay.dataset.mode = 'edit';
      // Focus end of text
      readModeInput.focus();
      readModeInput.setSelectionRange(readModeInput.value.length, readModeInput.value.length);
    }
  };

  const closeReadMode = () => {
    if (!readModeOverlay) return;
    
    // Sync back value if in edit mode
    if (readModeOverlay.dataset.mode === 'edit' && readModeInput) {
      noteInput.value = readModeInput.value;
    }

    readModeOverlay.close();
    document.body.style.overflow = '';
    delete readModeOverlay.dataset.mode;
  };

  // Toggle read mode on input click ONLY if locked (viewing mode)
  noteInput.addEventListener("click", () => {
    if (noteInput.classList.contains("locked")) {
      openReadMode(true);
    }
  });

  // Toggle read mode via expand button
  const expandBtn = document.getElementById("expandBtn");
  if (expandBtn) {
    expandBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Check if we are in view mode (locked) or edit mode
      const isViewMode = noteInput.classList.contains("locked");
      openReadMode(isViewMode);
    });
  }

  if (closeReadModeBtn) {
    closeReadModeBtn.addEventListener('click', closeReadMode);
  }

  // Overlay Click Handling
  if (readModeOverlay) {
    readModeOverlay.addEventListener('click', (e) => {
      const isViewMode = readModeOverlay.dataset.mode === 'view';
      
      if (isViewMode) {
        // In View Mode: Click anywhere (overlay or container) closes it
        // We don't need to check target because the event bubbles up
        closeReadMode();
      } else {
        // In Edit Mode: Click on backdrop does NOT close (prevent accidental close)
        // Only close button works (handled above)
        // So we do nothing here
      }
    });

    // Prevent clicks inside container from closing in Edit Mode
    // But in View Mode, we WANT clicks inside container to close
    if (readModeContainer) {
      readModeContainer.addEventListener('click', (e) => {
        const isViewMode = readModeOverlay.dataset.mode === 'view';
        if (!isViewMode) {
          e.stopPropagation(); // Stop bubbling to overlay in Edit Mode
        }
      });
    }
  }

  cancelModalBtn.addEventListener("click", handleCancelAction);
  noteDialog.addEventListener("cancel", handleDialogCancel);
  noteDialog.addEventListener("close", handleDialogClose);
  // Add aggressive protection against Escape key during transitions
  noteDialog.addEventListener("keydown", handleNoteDialogKeyDown);

  noteDialog.addEventListener("click", (event) => {
    // Allow closing when clicking on dialog backdrop OR the form container (padding area)
    // Also allow closing if clicking the "corners" of the flip card (which fall through to container)
    if (
      event.target === noteDialog || 
      event.target === noteForm ||
      event.target.classList.contains('flip-card') ||
      event.target.classList.contains('flip-card-inner')
    ) {
      // Prevent closing if editing/creating (to avoid accidental data loss)
      // Only allow closing on backdrop click if in "view only" mode
      const isEditable = state.pending && (state.pending.isNew || !state.pending.locked);
      if (isEditable) {
        return;
      }
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
    wallStage, wallWrapper, wallSvg, effectsSvg, stickersLayer, zoomSlider, zoomResetBtn, zoomIndicator,
    interactionTarget: document.body, // Allow zooming/panning from anywhere on the screen
    // onZoomReset removed as we have realtime updates now, so reset button only resets view
  }, requiresStickerForceRedraw);
  EffectsManager.initEffectsManager({
    effectsLayer, ambientLayer, stickersLayer
  }, mediaPrefersReducedMotion);
  MarqueeController.initMarqueeController(marqueeLayer, marqueeLines, (stickerId) => {
    if (state.isTransitioning) return;
    if (stickerId) {
      const sticker = state.stickers.get(stickerId);
      if (sticker && Number.isFinite(sticker.x) && Number.isFinite(sticker.y)) {
        // Parallel Pan & Activation
        // Reduced Zoom to 4 (mobile) / 2.5 (desktop) for better context
        const isMobile = window.innerWidth <= 640;
        const targetZoom = isMobile ? 4 : 2.5; 
        
        ZoomController.saveState();
        
        // Critical: Set flag to prevent focusDialog (called by handleStickerActivation) 
        // from stopping this pan animation immediately.
        state.keepZoomAnimation = true;

        ZoomController.panToPoint(sticker.x, sticker.y, viewBox, targetZoom, null, { duration: 600, easing: 'easeOutQuart' });
        
        // Immediate Activation (Don't wait for pan)
        StickerManager.handleStickerActivation(stickerId);
      } else {
        StickerManager.handleStickerActivation(stickerId);
      }
    }
  }, () => {
    // On interaction start (drag/click marquee)
    if (state.placementMode !== "idle") {
      setPlacementMode("idle");
    }
  });
  // Protection: Block button clicks during animation to prevent SearchController index desync
  // 增加保護: 當動畫進行時攔截按鈕點擊，避免 SearchController 索引脫節
  [document.getElementById("dialogPrevBtn"), document.getElementById("dialogNextBtn")].forEach(btn => {
    if (btn) {
      btn.addEventListener("click", (e) => {
         // Only block if strictly transitioning (Flight/Open/Close), allow Flip
         if (state.isTransitioning) {
           e.stopImmediatePropagation(); // Block other listeners
           e.preventDefault();
         }
      }, { capture: true }); // Capture phase ensures this runs first
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
      // Prevent navigation only if transitioning (Flight)
      // 僅在飛行轉場時鎖定，允許翻頁動畫中切換
      if (state.isTransitioning) return;

      // Only navigate content if dialog is open
      if (noteDialog && noteDialog.open) {
        handleStickerNavigation(sticker, direction);
      }
    },
    onPanToSticker: (sticker, onComplete, playEffect = true) => {
      if (sticker && Number.isFinite(sticker.x) && Number.isFinite(sticker.y)) {
        // Stop any existing halo before panning to new one
        EffectsManager.stopFocusHalo();
        
        // Increased Zoom for better mobile accessibility (Request: 2026-01-08)
        const isMobile = window.innerWidth <= 640;
        const targetZoom = isMobile ? 10 : 3;
        
        ZoomController.saveState();

        // If 'playEffect' is false (Random Mode), set a flag to prevent focusDialog
        // from stopping the zoom animation. This allows immediate opening + smooth panning.
        // 如果 'playEffect' 為 false (隨機模式)，設定旗標以防止 focusDialog 中斷縮放動畫。
        // 這允許「立即開啟對話框」同時保持「平滑鏡頭移動」。
        if (!playEffect) {
          state.keepZoomAnimation = true;
        }

        ZoomController.panToPoint(sticker.x, sticker.y, viewBox, targetZoom, onComplete, { duration: 600, easing: 'easeOutQuart' });

        if (playEffect) {
          EffectsManager.playFocusHalo(sticker.x, sticker.y);
        } else {
           // Execute onComplete immediately for instant feedback
           if (onComplete) onComplete();
        }
      } else if (onComplete) {
        onComplete();
      }
    },
    stopFocusHalo: () => {
      EffectsManager.stopFocusHalo();
    },
    onSearchOpen: () => {
      EffectsManager.setShimmerPaused(true);
    },
    onSearchClose: () => {
      // Stop any active focus halo
      EffectsManager.stopFocusHalo();
      
      // Restore zoom state if saved
      ZoomController.restoreState();

      // Only resume shimmer if we are NOT entering playback mode
      // (PlaybackController closes search when starting, which would otherwise resume shimmer)
      if (!document.body.classList.contains("playback-mode")) {
        EffectsManager.setShimmerPaused(false);
      }
    },
    resetStickerScale: (node) => {
      StickerManager.resetStickerScale(node);
    },
    updateStickerVisuals: (id, visualState) => {
      if (StickerManager.setStickerSearchState) {
        StickerManager.setStickerSearchState(id, visualState);
      }
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
    onPresenceChange: (newState) => {
      GhostCanvas.syncGhosts(newState, state.deviceId);
    },
    onGhostUpdate: (payload) => {
      if (payload.deviceId === state.deviceId) return;
      GhostCanvas.updateGhostDirectly(payload.deviceId, payload.x, payload.y, payload.timestamp);
    },
    getHeat: () => EffectsManager.getResonanceHeat(),
  });

  // Initialize Ghost Canvas
  const ghostCanvasEl = document.getElementById("ghostCanvas");
  if (ghostCanvasEl) {
    GhostCanvas.initGhostCanvas(ghostCanvasEl, wallSvg);
  }

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
    StickerManager: StickerManager, // Pass the active StickerManager (Pixi or SVG)
    getStickers: () => state.stickers,
    onUpdateIntensity: (count) => EffectsManager.setFireIntensity(count),
    onResetFire: () => EffectsManager.resetFireEffect(),
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
  
  console.log("🚀 [App] Calling StickerManager.initStickerManager...");
  StickerManager.initStickerManager({
    stickersLayer, loadingSpinner, paletteSticker
  }, state, viewBox, reviewSettings, {
    showToast,
    updateFireIntensity: (map) => EffectsManager.updateFireIntensity(map),
    updateMarqueePool: (map, settings) => MarqueeController.updateMarqueePool(map, settings),
    runPopAnimation: EffectsManager.runPopAnimation,
    triggerPendingReviewFeedback,
    openStickerModal: (id) => {
        // Prevent opening stickers during playback
        if (PlaybackController.isPlaying && PlaybackController.isPlaying()) return;
        openStickerModal(id);
    },
    playPlacementImpactEffect: EffectsManager.playPlacementImpactEffect
  });

  setPlacementMode("idle", { force: true });
  updatePlacementHint();
  hideStatusMessage(true);
  updateDialogSubtitle(false);
  
  EffectsManager.initShimmerSystem(state.stickers, state);

// Loader Helper
  const updateLoader = (percent, text) => {
    const bar = document.getElementById("loaderProgressBar");
    const status = document.getElementById("loaderStatus");
    if (bar) bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    if (status && text) status.textContent = text;
  };

  updateLoader(5, "Initializing...");

  if (isSupabaseConfigured()) {
    StickerManager.loadReviewSettings().catch((error) => console.warn("Failed to load review settings", error));
    StickerManager.subscribeToReviewSettings();
    StickerManager.subscribeToStickers();
  } else {
    reviewSettings.ready = true;
  }
  if (!isSupabaseConfigured()) {
    showToast("請先在 supabase-config.js 填入專案設定", "danger");
  }
  return StickerManager.loadExistingStickers(updateLoader).then(() => {
    updateLoader(100, "Ready!");
    MarqueeController.initMarqueeTicker();
    
    // Hide Initial Loader
    const initialLoader = document.getElementById("initialLoader");
    if (initialLoader) {
      initialLoader.classList.add("hidden");
      setTimeout(() => {
        initialLoader.remove();
      }, 600);
    }
    
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
  if (state.pending && (state.pending.node || state.pending.id) && state.pending.id !== record.id) {
    StickerManager.setStickerInFlight(state.pending.node, false, state.pending.id);
  }

  // Hide new sticker (it's now "in" the dialog)
  if (record.node || record.id) {
    StickerManager.setStickerInFlight(record.node, true, record.id);
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
    duration: 350,
  });
  state.flipAnimation = timeline;

  // Direction 1 (Next): Flip Left (180 -> 90 -> 180)
  // Direction -1 (Prev): Flip Right (180 -> 270 -> 180)
  const midAngle = direction === 1 ? "90deg" : "270deg";

  timeline
    .add({ 
      rotateY: midAngle, 
      duration: 150,
      complete: () => {
        // Swap content while hidden
        updateDialogContent(record, lockReason);
      }
    })
    .add({ 
      rotateY: "180deg", 
      duration: 160, 
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
      // Double check transition state before activating
      if (!state.isTransitioning) {
          StickerManager.handleStickerActivation(stickerId);
      }
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
  
  // Cleanup existing drag if present (e.g. multi-touch interruption)
  if (state.drag) {
    if (state.drag.node) {
      StickerManager.removeDragHighlight(state.drag.node);
      state.drag.node.remove();
    }
    if (state.dragRafId) {
      cancelAnimationFrame(state.dragRafId);
      state.dragRafId = null;
    }
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
    // Cleanup highlight
    StickerManager.removeDragHighlight(drag.node);
    
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
    // Cleanup highlight
    StickerManager.removeDragHighlight(state.drag.node);
    
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
  
  // Initial highlight attachment
  const initialType = isValidSpot(svgPoint.x, svgPoint.y) ? 'valid' : 'invalid';
  StickerManager.attachDragHighlight(ghost, initialType);
  
  const hostLayer = dragOverlay ?? stickersLayer;
  hostLayer.appendChild(ghost);
  drag.node = ghost;
  drag.layer = hostLayer;
  drag.x = svgPoint.x;
  drag.y = svgPoint.y;
  drag.valid = isValidSpot(svgPoint.x, svgPoint.y);
  drag.active = true;
  // ghost.classList.toggle("valid", drag.valid); // Removed: handled by external highlight
  // ghost.classList.toggle("invalid", !drag.valid); // Removed: handled by external highlight
  setPlacementMode("drag");

  // [Visual Effect] Simulate "Pulling" sticker out of the button
  if (paletteSticker && window.anime) {
    // 1. Force remove CSS animation class to allow JS override
    const paletteContainer = document.querySelector(".drag-palette");
    if (paletteContainer) paletteContainer.classList.remove("palette-highlight");
    
    // 2. JS Animation
    window.anime.remove(paletteSticker);
    window.anime({
      targets: paletteSticker,
      translateY: [0, -35, 0], // Jump up and fall back
      scale: [1, 1.15, 1],
      duration: 450,
      easing: 'easeOutElastic(1, .5)'
    });
  }

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
  
  // Update highlight type
  const type = valid ? 'valid' : 'invalid';
  StickerManager.attachDragHighlight(drag.node, type);

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

function handleNoteDialogKeyDown(e) {
  // 1. Block Escape during transitions
  if (e.key === "Escape") {
    if (state.isTransitioning || (state.flipAnimation && !state.flipAnimation.completed)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      console.log("Escape blocked during transition");
    }
  } 
  // 2. Navigation Shortcuts (Arrow Keys)
  else if (e.key === "ArrowLeft") {
      SearchController.navigateDialog(-1);
  }
  else if (e.key === "ArrowRight") {
      SearchController.navigateDialog(1);
  }
}

function handleGlobalKeyDown(event) {
  if (event.key !== "Escape") {
    return;
  }
  // Ignore global escape if transitioning
  if (state.isTransitioning) {
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

    // [Visual Effect] Mode Switch Feedback
    if (window.anime) {
       // Force remove CSS animation class to allow JS override
       const paletteContainer = document.querySelector(".drag-palette");
       if (paletteContainer) paletteContainer.classList.remove("palette-highlight");

       if (normalized === "click") {
          // ENTER Click Mode: Strong shake and scale up
          window.anime.remove(paletteSticker);
          window.anime({
             targets: paletteSticker,
             scale: [1, 1.25], // Stay large
             rotate: [0, -15, 15, -10, 10, 0], // Shake
             filter: ['brightness(1)', 'brightness(1.3)'], // Flash
             duration: 600,
             easing: 'easeOutElastic(1, .5)',
             complete: () => {
                paletteSticker.style.transform = "scale(1.2)"; // Maintain 'Active' size
                paletteSticker.style.filter = "brightness(1.1)"; // Maintain slight glow
             }
          });
       } else if (normalized === "idle" && mode !== "drag") {
          // EXIT Click Mode: Return to normal (But ignore if entering drag)
          // Use 'mode' param to differentiate explicitly entering drag vs returning to idle
          window.anime.remove(paletteSticker);
          window.anime({
             targets: paletteSticker,
             scale: 1,
             rotate: 0,
             translateY: 0,
             filter: 'brightness(1)',
             duration: 300,
             easing: 'easeOutQuad'
          });
       }
    }
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
  
  // Broadcast typing location to others (Hybrid: Broadcast + Presence)
  const now = Date.now();
  RealtimeController.updatePresence({ typingLocation: { x, y, timestamp: now } });
  RealtimeController.broadcastGhostPosition(x, y, now);

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
  // Allow animation if we have a palette rect, an origin node, OR a pending sticker ID (for Pixi)
  const canAnimate = Boolean((paletteRect || originNode || state.pending?.id) && window.anime && typeof window.anime.timeline === "function");
  
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

  // Allow animation if originNode is connected OR if we are in Pixi mode (originNode is null but we have an ID)
  if (canAnimate && ((originNode && originNode.isConnected) || (!originNode && state.pending?.id) || paletteRect)) {
    // FORCE STOP any active Zoom/Pan animation (e.g. RestoreState from Search Close)
    // UNLESS we explicitly requested to keep it (e.g. Random Mode pan)
    if (ZoomController.stopAnimation) {
      if (state.keepZoomAnimation) {
         // Don't stop animation, just reset flag
         state.keepZoomAnimation = false;
      } else {
         ZoomController.stopAnimation();
      }
    }
    
    state.isTransitioning = true;
    ZoomController.setInteractionLocked(true);

    // 1. Open invisibly to measure layout
    try {
      openModal(false);
    } catch (e) {
      console.warn("Failed to open modal for measurement", e);
    }

    // Use double RAF to ensure layout is stable before measuring
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // 2. Measure the actual card position (Target)
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

        // Fallback if measurement failed
        if (!targetRect || targetRect.width === 0) {
          const size = StickerManager.computeZoomTargetSize();
          const left = (window.innerWidth - size) / 2;
          const top = (window.innerHeight - size) / 2;
          targetRect = { left, top, width: size, height: size };
        }

        // 3. Get Start Rect & Texture
        let startRect = paletteRect;
        if (!startRect && StickerManager.getStickerRect) {
            // Pass potential ID for Pixi lookup
            const sid = originNode?.dataset?.id || state.pending?.id;
            startRect = StickerManager.getStickerRect(originNode, sid);
        }

        let textureUrl = null;
        const stickerId = originNode?.dataset?.id || state.pending?.id;
        if (stickerId && StickerManager.getStickerTextureUrl) {
            textureUrl = StickerManager.getStickerTextureUrl(stickerId);
        } else if (usePaletteSource) {
             // If coming from palette, use palette image? 
             // Currently palette sticker is static.
        }

        // 4. Setup DOM Flight
        if (card && startRect) {
             // Hide original sticker
             StickerManager.setStickerInFlight(originNode, true);

             // Set Image (if available)
             if (textureUrl) {
                 const frontImg = card.querySelector(".flip-sticker");
                 if (frontImg) frontImg.src = textureUrl;
             }
             
             // Make visible immediately
             noteDialog.style.opacity = "1";
             noteDialog.style.pointerEvents = "auto";
             noteDialog.classList.remove("measuring");
             noteDialog.classList.add("backdrop-active"); // Trigger backdrop fade-in

             // Play Animation (Flight + Reveal)
             playFlipReveal({ 
                 isFlight: true, 
                 startRect, 
                 targetRect 
             }).then(() => {
                 state.isTransitioning = false;
                 ZoomController.setInteractionLocked(false);
             }).catch((error) => {
                 console.error("Flight animation failed", error);
                 // Recover from failure
                 openModal(true);
                 if (originNode) StickerManager.setStickerInFlight(originNode, true); // Keep hidden or show? Usually show.
                 // Actually if flight failed, we should probably just show the dialog standard.
                 // openModal(true) resets opacity/events.
                 state.isTransitioning = false;
                 ZoomController.setInteractionLocked(false);
                 StickerManager.setStickerInFlight(originNode, false);
                 // Ensure reset
                 const card = document.querySelector(".flip-card");
                 if(card) {
                     card.style.position = '';
                     card.style.zIndex = '';
                     card.style.margin = '';
                     card.style.left = '';
                     card.style.top = '';
                     card.style.width = '';
                     card.style.height = '';
                     card.style.transform = '';
                 }
                 if (flipCardInner) flipCardInner.style.transform = '';
             });
        } else {
          // Fallback if flight setup failed (e.g. invalid rect)
          console.warn("Flight setup failed, falling back to standard open");
          state.isTransitioning = false;
          ZoomController.setInteractionLocked(false);
          openModal(true);
          
          if (originNode) {
             // Ensure it's not hidden
             StickerManager.setStickerInFlight(originNode, false);
          }
        }
      });
    });
  } else {
    if (originNode) {
      StickerManager.setStickerInFlight(originNode, true);
    }
    openModal(true);
  }
}

async function handleDialogClose() {
  // Clear typing location when dialog closes (submit, cancel, or close)
  const now = Date.now();
  RealtimeController.updatePresence({ typingLocation: null });
  RealtimeController.broadcastGhostPosition(null, null, now);

  const pendingSnapshot = state.pending;
  state.pending = null;
  formError.textContent = "";
  setTimestampDisplay(null);
  document.body?.classList.remove("dialog-open");
  setNoteLocked(false);
  updateDeleteButton();
  const result = noteDialog.returnValue || "";
  
  // Force reset scroll and layout on close
  window.scrollTo(0, 0);
  void document.body.offsetHeight;
  
  // Only animate if we have a snapshot AND we are not already animating (via closeDialogWithResult)
  if (pendingSnapshot && (pendingSnapshot.node || pendingSnapshot.id) && !state.isAnimatingReturn) {
    try {
      state.isAnimatingReturn = true;
      
      // Determine Target Rect
      let targetRect = null;
      if (pendingSnapshot.isNew && result !== "saved") {
         targetRect = StickerManager.getPaletteTargetRect();
      } else {
         // Existing sticker or saved: Go back to wall position
         const snId = pendingSnapshot.id || pendingSnapshot.node?.dataset?.id;
         targetRect = StickerManager.getStickerRect(pendingSnapshot.node, snId); 
         // If getStickerRect failed or returned default center, try Pixi lookup directly via logic
         if (!targetRect || (targetRect.width === 0 && targetRect.left === window.innerWidth/2)) {
             // Try to use preserved x/y from snapshot
             // This is tricky because we need screen coords, but snapshot only has SVG/World coords?
             // Actually app.js assumes StickerManager can find it.
         }
      }

      if (targetRect) {
          // Use DOM Flight Return
          await playFlipReturn({ 
              isFlight: true, 
              targetRect, 
              result,
              pendingSnapshot
          });
      } else {
          // Fallback
          await playFlipReturn(); 
      }
      
      StickerManager.finalizeReturnWithoutAnimation(pendingSnapshot.node, Boolean(pendingSnapshot.isNew && result !== "saved"), pendingSnapshot.id);

    } catch (error) {
      console.error("Sticker return animation failed", error);
      StickerManager.finalizeReturnWithoutAnimation(pendingSnapshot.node, Boolean(pendingSnapshot.isNew && result !== "saved"), pendingSnapshot.id);
    } finally {
        state.isAnimatingReturn = false;
    }
  } else {
      resetFlipCard();
  }
  
  // Only cleanup overlay if NOT animating
  // (We handled animation above, so cleanup now)
  StickerManager.cleanupZoomOverlay();
  
  // Only trigger SearchController cleanup if we are NOT in active search mode.
  // If search is active, we want to stay in search context (don't reset camera).
  // However, SearchController.onDialogClosed() currently just hides nav and resets index if !isActive.
  // We need to ensure it doesn't trigger anything that would reset the camera.
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

  if (!pending || pending.isNew || isTimeLocked || pending.locked) {
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
  state.isAnimatingReturn = true; // Flag to protect animation from handleDialogClose usage

  ZoomController.setInteractionLocked(true);
  noteDialog.classList.add("closing");
  // We do NOT remove backdrop-active yet, as we want the background to stay while the card flies
  // noteDialog.classList.remove("backdrop-active"); 

  // Hide navigation buttons immediately before animation
  const prevBtn = document.getElementById("dialogPrevBtn");
  const nextBtn = document.getElementById("dialogNextBtn");
  if (prevBtn) prevBtn.hidden = true;
  if (nextBtn) nextBtn.hidden = true;
  const counter = document.getElementById("dialogSearchCounter");
  if (counter) counter.hidden = true;

  const pendingSnapshot = state.pending;

  try {
    // 1. Determine Target Rect for Return Flight
    let targetRect = null;
    if (pendingSnapshot && (pendingSnapshot.node || pendingSnapshot.id)) {
        if (pendingSnapshot.isNew && result !== "saved") {
             // If new and not saved, fly back to palette
             targetRect = StickerManager.getPaletteTargetRect();
        } else {
             // Go back to wall position
             // StickerManager will use Pixi logic if active, or SVG logic via fallback
             const snId = pendingSnapshot.id || pendingSnapshot.node?.dataset?.id;
             targetRect = StickerManager.getStickerRect(pendingSnapshot.node, snId);
        }
    }

// 2. Execute Flight Return
      // Note: We wait for flight to finish/land BEFORE triggering zoom restore
      await playFlipReturn({
          isFlight: true, // Force flight mode if targetRect is found
          targetRect,
          result,
          pendingSnapshot
      });

      // 3. Restore Zoom State (After flight lands)
      let restorePromise = Promise.resolve();
      if (!SearchController.isSearchActive()) {
          restorePromise = ZoomController.restoreState();
      }
    
    // Ensure zoom restore finishes (usually it's longer or similar to flight)
    // Actually, we don't necessarily strictly wait for it to finish before closing dialog logic, 
    // but practically it helps to keep flow consistent.
    // However, user wants "Immediate", so letting it run in background is fine.
    // We await it here just to be safe before unlocking interactions fully if needed?
    // Let's NOT await it strictly blocking the UI cleanup, but maybe for the 'transitioning' flag.
    
    // 4. Ensure Original Sticker is Visible (Explicitly via ID) or Removed (if cancelled new)
    if (pendingSnapshot) {
        // If it was a new sticker AND we are NOT saving, remove it.
        const isCancelledNew = pendingSnapshot.isNew && result !== "saved";
        if (isCancelledNew) {
            // Remove the temporary node/sprite
            if (pendingSnapshot.node && pendingSnapshot.node.remove) {
                pendingSnapshot.node.remove();
            }
            // Ensure Pixi cleanup if needed (StickerManagerPixi handles this inside node.remove() patch)
        } else {
            // Restore visibility for existing or saved stickers
            StickerManager.setStickerInFlight(pendingSnapshot.node, false, pendingSnapshot.id);
        }
    }

    // 4. Close Dialog (Hide original card wrapper)
    if (noteDialog.open) {
      try {
        state.pending = null; // Clear now
        noteDialog.close(result);
      } catch (error) {
        console.error("Failed to close note dialog", error);
      }
    }

    // 5. Restore Zoom State (if saved)
    // Only restore if we are NOT in active search mode (Request: 2026-01-08)
    // Zoom Logic Update: We already started restorePromise in step 2 if allowed.
    // If search is active, we intentionally SKIP restoring zoom, keeping user at the sticker/search view.
    
    // 6. Cleanup
    await restorePromise;
    ZoomController.setInteractionLocked(false);
  } catch (err) {
      console.error("Close Animation Failed", err);
      // Fallback close
      if (noteDialog.open) noteDialog.close(result);
  } finally {
    noteDialog.classList.remove("closing");
    state.closing = false;
    state.isAnimatingReturn = false;
    state.isTransitioning = false;
    // Only unlock if we are sure no other animation is running.
    // Since restoreState handles its own locking/unlocking, we might not need to force unlock here,
    // but as a safety net for other errors, we keep it.
    // However, since we awaited restoreState, it should be safe now.
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
  // 1. Check against existing stickers
  for (const record of state.stickers.values()) {
    const distance = Math.hypot(record.x - x, record.y - y);
    if (distance < MIN_DISTANCE) {
      return true;
    }
  }
  
  // 2. Check against pending sticker (if editing)
  if (state.pending && !state.pending.isNew) {
    const distance = Math.hypot(state.pending.x - x, state.pending.y - y);
    if (distance < MIN_DISTANCE) {
      return true;
    }
  }

  // 3. Check against ghost stickers (other users typing)
  // Use GhostCanvas data source
  const ghosts = GhostCanvas.getGhosts();
  for (const ghost of ghosts.values()) {
    const distance = Math.hypot(ghost.x - x, ghost.y - y);
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
  
  // 1. Reset Inner State
  flipCardInner.dataset.state = "front";
  flipCardInner.style.transform = "rotateY(0deg)";
  flipFront?.setAttribute("aria-hidden", "false");
  flipBack?.setAttribute("aria-hidden", "true");
  
  // 2. Reset Outer Card Styles (Flight Mode Cleanup)
  const card = document.querySelector(".flip-card");
  if (card) {
    card.style.position = '';
    card.style.zIndex = '';
    card.style.margin = '';
    card.style.left = '';
    card.style.top = '';
    card.style.width = '';
    card.style.height = '';
    card.style.transform = '';
    card.style.transition = '';
  }
  
  // 3. Remove Spacer (if any)
  // Spacer is inserted before card
  if (card && card.previousElementSibling) {
    const prev = card.previousElementSibling;
    // Simple heuristic: if it's a div, hidden, and has inline width/height matching what we set
    if (prev.tagName === 'DIV' && prev.style.visibility === 'hidden' && prev.style.flex === '0 0 auto') {
        prev.remove();
    }
  }

  // 4. Ensure UI elements are visible (in case they were faded out)
  const uiElements = [
      document.querySelector(".dialog-header"),
      document.querySelector(".dialog-actions"),
      document.querySelector(".note-timestamp"),
      document.querySelector(".dialog-search-counter")
  ].filter(el => el);
  uiElements.forEach(el => el.style.opacity = "");

  // 5. Unlock Zoom Interaction (Safety Valve)
  ZoomController.setInteractionLocked(false);
  state.isTransitioning = false;
  state.isAnimatingReturn = false;
}

function playFlipReveal(options = {}) {
  // Support legacy boolean argument
  if (typeof options === "boolean") {
      options = { fromContinuation: options };
  }
  const { isFlight = false, startRect, targetRect, fromContinuation = false } = options;

  if (!flipCardInner) {
    noteInput.focus({ preventScroll: true });
    return Promise.resolve();
  }
  flipCardInner.dataset.state = "transition";
  flipFront?.setAttribute("aria-hidden", "false");
  flipBack?.setAttribute("aria-hidden", "true");

  if (!window.anime || typeof window.anime.timeline !== "function") {
    resetFlipCard();
    return Promise.resolve();
  }
  if (state.flipAnimation) {
    state.flipAnimation.pause();
  }

  // === Mode 1: Full Flight Sync (Start -> Center + Flip) ===
  if (isFlight && startRect && targetRect) {
      const card = document.querySelector(".flip-card");
      if (!card) return Promise.resolve();

      return new Promise((resolve) => {
          // Mode 1: Full Flight Sync with TRANSFORM SCALE (No Layout Thrashing)
          
          // 1. Calculate Transforms
          // We set the card to the FINAL size immediately to ensure internal layout (text box) is correct.
          // Then we scale it down to match the start size.
          const scaleX = startRect.width / targetRect.width;
          const scaleY = startRect.height / targetRect.height;
          // Use the smaller scale to ensure it fits (assume uniform scaling for circle->circle)
          const startScale = Math.min(scaleX, scaleY);
          
          const startCenterX = startRect.left + startRect.width / 2;
          const startCenterY = startRect.top + startRect.height / 2;
          const targetCenterX = targetRect.left + targetRect.width / 2;
          const targetCenterY = targetRect.top + targetRect.height / 2;
          
          const translateX = startCenterX - targetCenterX;
          const translateY = startCenterY - targetCenterY;

          // 2. Apply Initial State (Fixed at Target, but transformed to Start)
          
          // [Fix Layout Jumps]: Insert a spacer to hold the layout structure
          // so header/footer don't collapse when card goes fixed.
          const spacer = document.createElement("div");
          spacer.style.width = `${targetRect.width}px`;
          spacer.style.height = `${targetRect.height}px`;
          spacer.style.flex = "0 0 auto"; // Keep exact size in flex column
          spacer.style.visibility = "hidden";
          card.parentNode.insertBefore(spacer, card);

          // [Fix Early Text]: Fade in other UI elements (header, footer, timestamp)
          // instead of having them sit there.
          const uiElements = [
              document.querySelector(".dialog-header"),
              document.querySelector(".dialog-actions"),
              document.querySelector(".note-timestamp"),
              document.querySelector(".dialog-search-counter")
          ].filter(el => el);
          
          uiElements.forEach(el => {
              el.style.opacity = "0";
              // We'll animate them in near the end
          });

          card.style.position = 'fixed';
          card.style.zIndex = '500'; // High enough to cover dialog content, but below nav buttons (z-10001)
          card.style.margin = '0';
          // Set dimensions to TARGET size immediately
          card.style.left = `${targetRect.left}px`;
          card.style.top = `${targetRect.top}px`;
          card.style.width = `${targetRect.width}px`;
          card.style.height = `${targetRect.height}px`;
          
          // Disable CSS transitions
          card.style.transition = 'none'; 
          flipCardInner.style.transition = 'none';
          const faces = card.querySelectorAll(".flip-face");
          faces.forEach(f => f.style.transition = 'none');
          
          // Isolate transform origin to ensure scaling works from center
          card.style.transformOrigin = "center center";

          // Initial Transforms: Use anime.set to ensure internal state matches
          // We do NOT use card.style.transform = `translate(...)` string manually
          // to avoid conflicts with how Anime.js appends transforms.
          if (window.anime.set) {
              window.anime.set(card, {
                  translateX: translateX,
                  translateY: translateY,
                  scale: startScale
              });
              window.anime.set(flipCardInner, {
                  rotateY: 0
              });
          } else {
             // Fallback if .set is missing (older versions), though unlikely
             card.style.transform = `translateX(${translateX}px) translateY(${translateY}px) scale(${startScale})`;
             flipCardInner.style.transform = "rotateY(0deg)";
          }

          const timeline = window.anime.timeline({
            easing: "easeOutQuart", // Smooth landing
            duration: 600,
          });
          state.flipAnimation = timeline;

          // [Visual Effect] Trigger Lift/Ripple Effect at start position (Takeoff)
          const startCX = startRect.left + startRect.width / 2;
          const startCY = startRect.top + startRect.height / 2;
          const worldPos = ZoomController.clientToSvg(startCX, startCY, viewBox);
          if (worldPos) {
            EffectsManager.playPixiLiftEffect(worldPos.x, worldPos.y);
          }

          // Animate Card (Move & Scale & Rotate) - "Flying"
          // We animate FROM current values (set above) TO the target values
          timeline.add({
            targets: card,
            translateX: 0, // Animate to 0 (Target position)
            translateY: 0,
            scale: 1,      // Grow to full size
            duration: 600
          }, 0);

          // Animate Inner (Rotate) - "Flipping"
          timeline.add({
            targets: flipCardInner,
            rotateY: [0, 180],
            easing: "easeOutCubic", // Less aggressive than Expo, distributed over flight
            duration: 600
          }, 0);
          
          // Fade in UI elements at the end (last 200ms)
          timeline.add({
              targets: uiElements,
              opacity: [0, 1],
              easing: "linear",
              duration: 200
          }, "-=200"); // Start 200ms before end

          const finalize = () => {
              if (state.flipAnimation === timeline) {
                  state.flipAnimation = null;
              }
              // Remove Spacer
              if (spacer.parentNode) {
                  spacer.parentNode.removeChild(spacer);
              }
              
              // Ensure UI elements are visible
              uiElements.forEach(el => el.style.opacity = "");

              // Reset Card Styles to Flow layout (Dialog Center)
              if (state.flipAnimation === timeline) {
                  state.flipAnimation = null;
              }
              // Reset Card Styles to Flow layout (Dialog Center)
              card.style.position = '';
              card.style.zIndex = '';
              card.style.margin = '';
              card.style.left = '';
              card.style.top = '';
              card.style.width = '';
              card.style.height = '';
              card.style.transform = ''; // Removes scale/translate
              card.style.transition = ''; 
              
              faces.forEach(f => f.style.transition = '');
              
              // Keep rotation at 180 (Back visible)
              flipCardInner.style.transform = "rotateY(180deg)";
              flipCardInner.style.transition = '';
              
              // CRITICAL: Update state to enable pointer-events (see CSS)
              flipCardInner.dataset.state = "back";
              
              flipFront?.setAttribute("aria-hidden", "true");
              flipBack?.setAttribute("aria-hidden", "false");
              
              // Focus input after animation for accessibility and UX
              if(noteInput) {
                  requestAnimationFrame(() => noteInput.focus({ preventScroll: true }));
              }

              resolve();
          };

          if (timeline.finished && typeof timeline.finished.then === "function") {
             timeline.finished.then(finalize);
          } else {
             setTimeout(finalize, 600);
          }
      });
  }
  
  // === Mode 2: Legacy / Relay (Pivot Flip) ===

  // If continuing from Zoom fly animation (which ends at 90deg), start from 90deg
  const startAngle = fromContinuation ? "90deg" : "0deg";
  if (fromContinuation) {
      flipCardInner.style.transform = startAngle;
  }

  const timeline = window.anime.timeline({
    targets: flipCardInner,
    easing: "easeOutCubic", // Quicker easing
    duration: 350,
  });
  
  if (fromContinuation) {
    // Only do the second half: 90 -> 180
    timeline.add({ rotateY: "180deg", duration: 250 });
  } else {
    // Standard full flip: 0 -> 90 -> 180 (Legacy fallback)
    timeline
      .add({ rotateY: "90deg", duration: 150 })
      .add({ rotateY: "180deg", duration: 160 });
  }

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

function playFlipReturn(options = {}) {
  const { isFlight = false, targetRect, result, pendingSnapshot } = options;

  if (!flipCardInner) {
    return Promise.resolve();
  }
  if (state.flipAnimation) {
    state.flipAnimation.pause();
    state.flipAnimation = null;
  }

  // === Mode 1: Flight Return (Center -> Wall/Palette) ===
  if (isFlight && targetRect) {
      return new Promise((resolve) => {
          const card = document.querySelector(".flip-card");
          if (!card) return resolve();

          // 1. Capture Start State (Current Dialog Layout)
          const startRect = card.getBoundingClientRect();
          
          // 2. Setup Spacer to hold dialog layout
          const spacer = document.createElement("div");
          spacer.style.width = `${startRect.width}px`;
          spacer.style.height = `${startRect.height}px`;
          spacer.style.flex = "0 0 auto";
          spacer.style.visibility = "hidden";
          card.parentNode.insertBefore(spacer, card);

          // 3. Fade Out UI Elements immediately
          const uiElements = [
              document.querySelector(".dialog-header"),
              document.querySelector(".dialog-actions"),
              document.querySelector(".note-timestamp"),
              document.querySelector(".dialog-search-counter")
          ].filter(el => el);
          uiElements.forEach(el => el.style.opacity = "0");

          // 4. Set Card to Fixed and Prepare Animation
          card.style.position = 'fixed';
          card.style.zIndex = '9999';
          card.style.margin = '0';
          card.style.left = `${startRect.left}px`;
          card.style.top = `${startRect.top}px`;
          card.style.width = `${startRect.width}px`;
          card.style.height = `${startRect.height}px`;
          
          // Ensure transforms operate from center
          card.style.transformOrigin = "center center";

          // CRITICAL: Set state to transition so both faces are visible/ready
          flipCardInner.dataset.state = "transition"; 
          
          // Disable transitions
          card.style.transition = 'none';
          flipCardInner.style.transition = 'none';
          const faces = card.querySelectorAll(".flip-face");
          faces.forEach(f => f.style.transition = 'none');

          // Ensure starting state is clean (no scale)
          if (window.anime.set) {
              window.anime.set(card, { translateX: 0, translateY: 0, scale: 1 });
              window.anime.set(flipCardInner, { rotateY: 180 }); // Start from back
          } else {
             card.style.transform = `scale(1)`;
          }

          // Calculate Deltas matching the logic in Reveal
          // We want to scale DOWN to the target size
          // The targetRect is usually a sticker (small)
          
          // startRect (Big Dialog) -> targetRect (Small Sticker)
          // We calculate the scale factor relative to the Big Dialog
          const scaleX = targetRect.width / startRect.width;
          const scaleY = targetRect.height / startRect.height;
          const endScale = Math.min(scaleX, scaleY);
          
          const startCenterX = startRect.left + startRect.width / 2;
          const startCenterY = startRect.top + startRect.height / 2;
          const targetCenterX = targetRect.left + targetRect.width / 2;
          const targetCenterY = targetRect.top + targetRect.height / 2;
          
          const translateX = targetCenterX - startCenterX;
          const translateY = targetCenterY - startCenterY;

          const timeline = window.anime.timeline({
            easing: "easeInQuart", // Accelerate out
            duration: 500,
          });
          state.flipAnimation = timeline;

          // Animate Card (Move & Scale Down)
          timeline.add({
            targets: card,
            translateX: translateX,
            translateY: translateY,
            scale: endScale,
            duration: 500
          }, 0);

          // Animate Flip (Back -> Front)
          // It should finish flipping just before landing or exactly at landing
          timeline.add({
            targets: flipCardInner,
            rotateY: [180, 0], // Flip back to front (0deg)
            easing: "easeInCubic", // Accelerate spin
            duration: 500
          }, 0);

          const finalize = () => {
              // [Visual Effect] Trigger Mist Explosion at landing position
              // Modified: Skip mist effect if returning to palette (cancelled new sticker)
              const isReturningToPalette = pendingSnapshot && pendingSnapshot.isNew && result !== "saved";
              
              if (!isReturningToPalette) {
                const landCX = targetRect.left + targetRect.width / 2;
                const landCY = targetRect.top + targetRect.height / 2;
                const worldPos = ZoomController.clientToSvg(landCX, landCY, viewBox);
                if (worldPos) {
                   EffectsManager.playPixiMistExplosion(worldPos.x, worldPos.y);
                }
              }
              
              if (state.flipAnimation === timeline) {
                  state.flipAnimation = null;
              }
              // Cleanup Spacer
              if (spacer.parentNode) spacer.parentNode.removeChild(spacer);
              
              // Reset UI Opacity? No, because we are closing the dialog anyway.
              // But just in case, we reset if we were to reopen.
              // Actually, handleDialogClose will remove .dialog-open class and hide everything.

              // Reset Card Styles
              card.style.position = '';
              card.style.zIndex = '';
              card.style.margin = '';
              card.style.left = '';
              card.style.top = '';
              card.style.width = '';
              card.style.height = '';
              card.style.transform = '';
              card.style.transition = '';
              faces.forEach(f => f.style.transition = '');
              
              flipCardInner.style.transform = "rotateY(0deg)"; // Reset to front
              flipCardInner.style.transition = '';
              
              flipFront?.setAttribute("aria-hidden", "false");
              flipBack?.setAttribute("aria-hidden", "true");
              
              // Trigger Starburst if saved
              if (pendingSnapshot && (pendingSnapshot.isNew || pendingSnapshot._wasNew) && result === "saved") {
                 if (Number.isFinite(pendingSnapshot.x) && Number.isFinite(pendingSnapshot.y)) {
                     EffectsManager.playStarBurst(pendingSnapshot.x, pendingSnapshot.y);
                 }
              }

              resolve();
          };

          if (timeline.finished && typeof timeline.finished.then === "function") {
             timeline.finished.then(finalize);
          } else {
             setTimeout(finalize, 500);
          }
      });
  }

  // === Mode 2: Legacy In-Place Flip ===
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
  if (isLocked) {
    noteInput.title = "點擊放大閱讀";
  } else {
    noteInput.removeAttribute("title");
  }

  const expandBtn = document.getElementById("expandBtn");
  if (expandBtn) {
    expandBtn.hidden = isLocked;
    expandBtn.style.display = isLocked ? "none" : "";
  }

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
      && !pending.locked
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
  let touchStartX = null;
  let touchStartY = null;

  if (!noteDialog) return;

  noteDialog.addEventListener("touchstart", (e) => {
    // Prevent interaction if transitioning (opening/closing)
    // 檢查 state.isTransitioning (如果有的話)
    if (state.isTransitioning) {
      touchStartX = null;
      touchStartY = null;
      return;
    }

    if (e.touches.length > 0) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: false });

  // Prevent native gestures (like swipe back) if user is swiping horizontally
  noteDialog.addEventListener("touchmove", (e) => {
    if (touchStartX === null || touchStartY === null) return;

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
    // If start was blocked, ignore end
    if (touchStartX === null || touchStartY === null) return;

    if (e.changedTouches.length > 0) {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      handleDialogSwipe(touchStartX, touchStartY, touchEndX, touchEndY);

      // Reset
      touchStartX = null;
      touchStartY = null;
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











