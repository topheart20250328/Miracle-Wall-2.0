
import { supabase, isSupabaseConfigured } from "../supabase-config.js";
import * as Utils from "./Utils.js";
import * as SearchController from "./SearchController.js";

const svgNS = "http://www.w3.org/2000/svg";

const STICKER_DIAMETER = 36;
const STICKER_RADIUS = STICKER_DIAMETER / 2;

let elements = {
  stickersLayer: null,
  loadingSpinner: null,
  paletteSticker: null,
};
let callbacks = {
  showToast: () => {},
  updateFireIntensity: () => {},
  updateMarqueePool: () => {},
  runPopAnimation: () => {},
  triggerPendingReviewFeedback: () => {},
  openStickerModal: () => {},
  playPlacementImpactEffect: () => {},
};
let globalState = {};
let globalViewBox = {};
let globalReviewSettings = {};

// Queue System for Performance
let insertQueue = [];
let isProcessingQueue = false;

export function initStickerManager(domElements, state, viewBox, reviewSettings, managerCallbacks) {
  elements = { ...elements, ...domElements };
  globalState = state;
  globalViewBox = viewBox;
  globalReviewSettings = reviewSettings;
  callbacks = { ...callbacks, ...managerCallbacks };
  setupStickerDelegation();
}

export function resetStickerScale(node) {
  if (!node || !window.anime) return;
  
  window.anime.remove(node);
  window.anime({
    targets: node,
    scale: 1,
    rotate: 0,
    duration: 300,
    easing: "easeOutQuad",
  });
}

function setupStickerDelegation() {
  if (!elements.stickersLayer) return;

  // Optimization: Mouse hover effects disabled for mobile-first approach
  /*
  elements.stickersLayer.addEventListener("mouseover", (e) => {
    const group = e.target.closest(".sticker-node");
    if (group) {
      if (group.contains(e.relatedTarget)) return;
      
      // Check for interactive states: not pending, not dragging, not in-flight, not dimmed
      if (
        !group.classList.contains("pending") && 
        !globalState.drag && 
        !globalState.pending &&
        !group.classList.contains("in-flight") &&
        !group.classList.contains("search-dimmed")
      ) {
        if (window.anime) {
          window.anime.remove(group);
          window.anime({
            targets: group,
            scale: 1.15,
            rotate: window.anime.random(-8, 8),
            duration: 400,
            easing: "easeOutElastic(1, .6)",
          });
        }
      }
    }
  });

  elements.stickersLayer.addEventListener("mouseout", (e) => {
    const group = e.target.closest(".sticker-node");
    if (group) {
      if (group.contains(e.relatedTarget)) return;
      if (!group.classList.contains("pending") && !globalState.drag && !globalState.pending) {
        resetStickerScale(group);
      }
    }
  });
  */
}

export async function loadExistingStickers() {
  if (!isSupabaseConfigured()) {
    return;
  }
  if (elements.loadingSpinner) {
    elements.loadingSpinner.classList.add("visible");
  }
  
  // Fallback to querying the table directly if the view doesn't exist or fails
  const { data, error } = await supabase
    .from("wall_stickers")
    .select(
      "id, x_norm, y_norm, note, created_at, updated_at, device_id, is_approved"
    )
    .order("created_at", { ascending: true });
  
  if (elements.loadingSpinner) {
    elements.loadingSpinner.classList.remove("visible");
  }

  if (error) {
    callbacks.showToast("讀取貼紙失敗，請稍後再試", "danger");
    console.error(error);
    return;
  }
  
  data.forEach((record) => {
    // Check if sticker already exists to prevent duplication
    if (globalState.stickers.has(record.id)) {
      const existing = globalState.stickers.get(record.id);
      // Update mutable properties
      existing.note = record.note ?? "";
      existing.isApproved = Boolean(record.is_approved);
      existing.updated_at = record.updated_at;
      
      // Re-calculate permissions
      const isOwner = !record.device_id || !globalState.deviceId || record.device_id === globalState.deviceId;
      const requireApproval = globalReviewSettings.requireStickerApproval;
      existing.canViewNote = !requireApproval || record.is_approved || isOwner;
      
      updateStickerReviewState(existing);
      return;
    }

    
    const x = record.x_norm * globalViewBox.width;
    const y = record.y_norm * globalViewBox.height;
    const node = createStickerNode(record.id, x, y, false);
    
    // Calculate canViewNote client-side since we are querying the raw table
    const isOwner = !record.device_id || !globalState.deviceId || record.device_id === globalState.deviceId;
    const requireApproval = globalReviewSettings.requireStickerApproval;
    const canViewNote = !requireApproval || record.is_approved || isOwner;

    const stickerRecord = {
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
      canViewNote: canViewNote,
    };

    globalState.stickers.set(record.id, stickerRecord);
    
    // Queue insertion instead of direct append
    insertQueue.push({ node, record: stickerRecord });
  });

  // Start processing queue
  if (!isProcessingQueue) {
    processInsertQueue();
  }

  callbacks.updateFireIntensity(globalState.stickers);
  callbacks.updateMarqueePool(globalState.stickers, globalReviewSettings);
}

function processInsertQueue() {
  if (insertQueue.length === 0) {
    isProcessingQueue = false;
    return;
  }

  isProcessingQueue = true;
  // Process a batch
  const batchSize = 50;
  const batch = insertQueue.splice(0, batchSize);

  const fragment = document.createDocumentFragment();
  
  batch.forEach(({ node, record }) => {
    fragment.appendChild(node);
    callbacks.runPopAnimation(node);
    updateStickerReviewState(record);
  });

  elements.stickersLayer.appendChild(fragment);

  requestAnimationFrame(processInsertQueue);
}

export function createStickerNode(id, x, y, isPending = false) {
  const group = document.createElementNS(svgNS, "g");
  group.classList.add("sticker-node");
  if (isPending) {
    group.classList.add("pending");
  }
  group.dataset.id = id;
  group.setAttribute("tabindex", "0");
  
  // Add title for tooltip
  const title = document.createElementNS(svgNS, "title");
  title.textContent = "點擊查看留言";
  group.appendChild(title);

  const use = document.createElementNS(svgNS, "use");
  use.setAttribute("href", "#heartSticker");
  use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#heartSticker");
  group.appendChild(use);
  positionStickerNode(group, x, y);

  return group;
}

export function updateStickerReviewState(record) {
  if (!record || !record.node) {
    return;
  }
  const node = record.node;
  const requireApproval = globalReviewSettings.requireStickerApproval;
  const approved = Boolean(record.isApproved);
  const visibleAsApproved = approved || !requireApproval;
  node.classList.toggle("review-pending", requireApproval && !approved);
  node.setAttribute("aria-label", visibleAsApproved ? "留言" : "審核中留言");
  node.dataset.approved = approved ? "true" : "false";
}

export function positionStickerNode(node, x, y) {
  const centerX = x - STICKER_RADIUS;
  const centerY = y - STICKER_RADIUS;
  const useEl = node.querySelector("use") ?? node.firstElementChild;
  if (useEl) {
    useEl.setAttribute("x", centerX.toFixed(2));
    useEl.setAttribute("y", centerY.toFixed(2));
    useEl.setAttribute("width", STICKER_DIAMETER);
    useEl.setAttribute("height", STICKER_DIAMETER);
  }
  node.dataset.cx = x.toFixed(2);
  node.dataset.cy = y.toFixed(2);
  
  // Update external highlight if exists
  const highlightId = `highlight-${node.dataset.id || 'temp'}`;
  const highlight = document.getElementById(highlightId);
  if (highlight) {
    if (highlight.tagName.toLowerCase() === 'g') {
      highlight.setAttribute("transform", `translate(${x.toFixed(2)}, ${y.toFixed(2)})`);
    } else {
      highlight.setAttribute("cx", x.toFixed(2));
      highlight.setAttribute("cy", y.toFixed(2));
    }
  }
}

export function attachDragHighlight(node, type = 'marquee') {
  if (!node) return;
  
  const highlightsLayer = document.getElementById("highlightsLayer");
  if (!highlightsLayer) return;

  const id = node.dataset.id || 'temp';
  const highlightId = `highlight-${id}`;
  
  // Always recreate to ensure correct structure (Group vs Circle)
  const existing = document.getElementById(highlightId);
  if (existing) existing.remove();

  const group = document.createElementNS(svgNS, "g");
  group.id = highlightId;
  highlightsLayer.appendChild(group);

  // Create Core Glow Circle
  const core = document.createElementNS(svgNS, "circle");
  core.setAttribute("r", String(STICKER_RADIUS + 24));
  core.setAttribute("cx", "0");
  core.setAttribute("cy", "0");
  core.classList.add("highlight-glow");
  group.appendChild(core);
  
  // Set type-specific attributes
  if (type === 'valid') {
    core.classList.add("valid-glow");
    core.style.fill = "url(#validHighlightGradient)";
  } else if (type === 'invalid') {
    core.classList.add("invalid-glow");
    core.style.fill = "url(#invalidHighlightGradient)";
  }

  // Sync position
  const cx = parseFloat(node.dataset.cx);
  const cy = parseFloat(node.dataset.cy);
  if (!isNaN(cx) && !isNaN(cy)) {
    group.setAttribute("transform", `translate(${cx.toFixed(2)}, ${cy.toFixed(2)})`);
  }
}

export function removeDragHighlight(node) {
  if (!node) return;
  const id = node.dataset.id || 'temp';
  const highlight = document.getElementById(`highlight-${id}`);
  if (highlight) {
    highlight.remove();
  }
}

export function handleStickerActivation(stickerId) {
  const record = globalState.stickers.get(stickerId);
  if (!record) {
    return;
  }
  if (!record.isApproved && !record.canViewNote) {
    callbacks.triggerPendingReviewFeedback(record);
    return;
  }
  callbacks.openStickerModal(stickerId);
}

export function animateStickerZoom(originNode, options = {}) {
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
    opacity: 1,
  });
  if (!overlay) {
    return Promise.reject(new Error("Failed to create zoom overlay"));
  }

  const targetSize = computeZoomTargetSize();
  
  let targetLeft, targetTop, targetWidth, targetHeight;
  
  if (options.targetRect) {
    targetLeft = options.targetRect.left;
    targetTop = options.targetRect.top;
    targetWidth = options.targetRect.width;
    targetHeight = options.targetRect.height;
  } else {
    targetLeft = (window.innerWidth - targetSize) / 2;
    targetTop = (window.innerHeight - targetSize) / 2;
    targetWidth = targetSize;
    targetHeight = targetSize;
  }

  const isMobile = window.innerWidth <= 640;

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
    globalState.zoomAnimation = timeline;

    const finalize = () => {
      if (globalState.zoomAnimation === timeline && typeof timeline.pause === "function") {
        timeline.pause();
      }
      if (globalState.zoomAnimation === timeline) {
        globalState.zoomAnimation = null;
      }
      if (globalState.zoomOverlay === overlay) {
        globalState.zoomOverlay = null;
      }
      overlay.remove();
      if (globalState.zoomResolve === finalizeAndResolve) {
        globalState.zoomResolve = null;
      }
    };

    const finalizeAndResolve = () => {
      finalize();
      finishResolve();
    };

    globalState.zoomResolve = finalizeAndResolve;

    timeline
      .add({
        left: targetLeft,
        top: targetTop,
        width: targetWidth,
        height: targetHeight,
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

export function animateStickerReturn(pending, result, startRectOverride = null) {
  const node = pending.node;
  if (!node) {
    return Promise.resolve();
  }
  
  // If we have a startRectOverride (from closeDialogWithResult), use it
  // Otherwise try to measure the card again
  let startRect = startRectOverride;
  if (!startRect) {
    const card = document.querySelector(".flip-card");
    if (card) {
      const rect = card.getBoundingClientRect();
      if (rect.width && rect.height) {
        startRect = {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        };
      }
    }
  }

  // If still no rect, fallback to computed center
  if (!startRect) {
    startRect = computeCenterRect();
  } else {
    // Ensure the start rect is square to prevent oval shadows when returning from read-mode
    // We use the computed standard size to ensure consistency
    const standardSize = computeZoomTargetSize();
    const centerX = startRect.left + startRect.width / 2;
    const centerY = startRect.top + startRect.height / 2;
    
    startRect = {
      left: centerX - standardSize / 2,
      top: centerY - standardSize / 2,
      width: standardSize,
      height: standardSize
    };
  }

  const returnToPalette = pending.isNew && result !== "saved";
  let targetRect;
  if (returnToPalette) {
    targetRect = getPaletteTargetRect();
  } else {
    const rect = node.getBoundingClientRect();
    targetRect = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }
  if (!targetRect) {
    finalizeReturnWithoutAnimation(node, returnToPalette);
    return Promise.resolve();
  }
  
  // Create overlay at the EXACT position where the dialog card currently is
  const overlay = createStickerOverlay({
    left: startRect.left,
    top: startRect.top,
    width: startRect.width,
    height: startRect.height,
    opacity: 1,
  });

  if (!overlay) {
    finalizeReturnWithoutAnimation(node, returnToPalette);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.anime({
      targets: overlay,
      left: targetRect.left,
      top: targetRect.top,
      width: targetRect.width,
      height: targetRect.height,
      easing: "cubicBezier(0.2, 0, 0.2, 1)",
      duration: 500,
      complete: () => {
        // Restore original sticker visibility first to prevent flicker
        finalizeReturnWithoutAnimation(node, returnToPalette);
        
        // Remove overlay after a brief delay to ensure the original is rendered
        requestAnimationFrame(() => {
          overlay.remove();
          resolve();
        });
      }
    });
  });
}

export function finalizeReturnWithoutAnimation(node, returnToPalette) {
  if (!node) {
    return;
  }
  if (returnToPalette) {
    if (node.isConnected) {
      node.remove();
    }
  } else {
    setStickerInFlight(node, false);
    
    // Reset any lingering hover/zoom effects
    resetStickerScale(node);
    
    if (!window.anime) {
      // Fallback if anime is not available
      node.style.transform = "";
    }
  }
}

export function computeZoomTargetSize() {
  const width = window.innerWidth || 0;
  const height = window.innerHeight || 0;
  const viewportMin = Math.min(width, height);

  // Match CSS media query (max-width: 640px)
  if (width <= 640) {
    // 1. Calculate Card Preferred Width from CSS: width: clamp(340px, 84vw, 440px);
    const cardIdeal = width * 0.84;
    const cardWidth = Math.max(340, Math.min(cardIdeal, 440));

    // 2. Calculate Dialog Constraint from CSS: 
    // .note-dialog { width: min(520px, 92vw); padding: clamp(1.8rem, 3vw, 2.6rem); }
    // On mobile (<640px), 3vw is usually smaller than 1.8rem (28.8px), so padding is fixed at 1.8rem.
    // 1.8rem * 16px/rem * 2 sides = 57.6px
    const paddingPx = 57.6; 
    const dialogWidth = Math.min(520, width * 0.92);
    const maxAvailableWidth = dialogWidth - paddingPx;

    // The actual rendered size will be the smaller of the two (Card CSS vs Dialog Constraint)
    return Math.min(cardWidth, maxAvailableWidth);
  }

  // Default CSS: width: clamp(320px, 52vmin, 440px);
  if (!viewportMin) {
    return 360;
  }
  const ideal = viewportMin * 0.52;
  const minSize = 320;
  const maxSize = 440;
  return Math.max(minSize, Math.min(ideal, maxSize));
}

export function cleanupZoomOverlay() {
  if (globalState.zoomResolve) {
    const resolver = globalState.zoomResolve;
    globalState.zoomResolve = null;
    resolver();
    return;
  }
  if (globalState.zoomAnimation && typeof globalState.zoomAnimation.pause === "function") {
    globalState.zoomAnimation.pause();
  }
  globalState.zoomAnimation = null;
  if (globalState.zoomOverlay) {
    globalState.zoomOverlay.remove();
    globalState.zoomOverlay = null;
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
  globalState.zoomOverlay = overlay;
  return overlay;
}

function computeCenterRect() {
  const size = computeZoomTargetSize();
  const left = (window.innerWidth - size) / 2;
  const top = (window.innerHeight - size) / 2;
  return { left, top, width: size, height: size };
}

export function getPaletteTargetRect() {
  if (!elements.paletteSticker) {
    return null;
  }
  const svg = elements.paletteSticker.querySelector("svg");
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
  const rect = elements.paletteSticker.getBoundingClientRect();
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

export function setStickerInFlight(node, inFlight) {
  if (!node) {
    return;
  }
  node.classList.toggle("in-flight", Boolean(inFlight));
  
  // If entering in-flight mode, ensure scale is reset so it doesn't reappear scaled up
  if (inFlight) {
    resetStickerScale(node);
  }
}

export async function saveSticker(pending, message) {
  if (!pending || !pending.node) return { error: "Invalid pending sticker" };
  
  pending.node.classList.add("pending");
  const payload = {
    p_x_norm: pending.x / globalViewBox.width,
    p_y_norm: pending.y / globalViewBox.height,
    p_note: message,
    p_device_id: globalState.deviceId ?? null,
  };
  
  const { data, error } = await supabase.rpc("create_wall_sticker", payload);
  pending.node.classList.remove("pending");
  
  if (error) {
    return { error };
  }
  
  const inserted = Array.isArray(data) ? data[0] : data;
  if (!inserted?.id) {
      return { error: { message: "Server returned no ID" } };
  }

  const newId = inserted.id;
  pending.id = newId;
  pending.isNew = false;
  pending.note = message;
  pending.node.dataset.id = newId;
  pending.created_at = inserted.created_at;
  pending.updated_at = inserted.updated_at;
  pending.deviceId = inserted.device_id ?? globalState.deviceId;
  pending.isApproved = Boolean(inserted.is_approved);
  pending.canViewNote = true;

  globalState.stickers.set(newId, pending);
  updateStickerReviewState(pending);
  callbacks.updateFireIntensity(globalState.stickers);
  callbacks.updateMarqueePool(globalState.stickers, globalReviewSettings);
  
  return { data: newId };
}

export async function updateSticker(pending, message) {
    const { error } = await supabase
    .from("wall_stickers")
    .update({
      note: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pending.id)
    .eq("device_id", globalState.deviceId);

  if (error) {
    return { error };
  }
  
  pending.note = message;
  pending.updated_at = new Date().toISOString();
  
  // Re-calculate permissions client-side
  const isOwner = !pending.deviceId || !globalState.deviceId || pending.deviceId === globalState.deviceId;
  const requireApproval = globalReviewSettings.requireStickerApproval;
  
  // We don't have the fresh is_approved status unless we query again, but update usually doesn't change approval unless triggered by trigger
  // But let's assume it stays same or we can query.
  // Let's query to be safe and get fresh state
  const { data: recordData } = await supabase
    .from("wall_stickers")
    .select("is_approved")
    .eq("id", pending.id)
    .single();
    
  if (recordData) {
      pending.isApproved = Boolean(recordData.is_approved);
  }
  
  pending.canViewNote = !requireApproval || pending.isApproved || isOwner;
  
  updateStickerReviewState(pending);
  callbacks.updateMarqueePool(globalState.stickers, globalReviewSettings);
  return { success: true };
}

export async function deleteSticker(pending) {
    const { error } = await supabase
    .from("wall_stickers")
    .delete()
    .eq("id", pending.id)
    .eq("device_id", globalState.deviceId);

  if (error) {
    return { error };
  }
  
  if (pending.node) {
    pending.node.remove();
  }
  globalState.stickers.delete(pending.id);
  pending.deleted = true;
  pending.node = null;
  
  callbacks.updateFireIntensity(globalState.stickers);
  callbacks.updateMarqueePool(globalState.stickers, globalReviewSettings);
  
  return { success: true };
}


let reviewSettingsChannel = null;
let stickersChannel = null;
const effectQueue = [];
let effectProcessing = false;

function processEffectQueue() {
  if (effectQueue.length === 0) {
    effectProcessing = false;
    return;
  }
  effectProcessing = true;
  
  // Process one effect
  const task = effectQueue.shift();
  if (task) task();

  // Schedule next, but if queue is huge, speed up or skip
  let delay = 150;
  if (effectQueue.length > 5) delay = 50;
  if (effectQueue.length > 20) delay = 10; // Rush mode

  setTimeout(processEffectQueue, delay);
}

function queueImpactEffect(node) {
  // If too many pending, skip effect to save performance
  if (effectQueue.length > 50) return;

  effectQueue.push(() => {
    if (document.body.contains(node)) {
      callbacks.playPlacementImpactEffect(node);
    }
  });

  if (!effectProcessing) {
    processEffectQueue();
  }
}

export async function loadReviewSettings() {
  if (!isSupabaseConfigured()) {
    globalReviewSettings.ready = true;
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
    console.warn("Ū���f�ֳ]�w����", error);
  } finally {
    globalReviewSettings.ready = true;
    applyReviewSettingsToUi();
  }
}

function applyReviewSettings(data) {
  if (!data) return;
  globalReviewSettings.requireMarqueeApproval = Boolean(data.require_marquee_approval);
  globalReviewSettings.requireStickerApproval = globalReviewSettings.requireMarqueeApproval && Boolean(data.require_sticker_approval);
  applyReviewSettingsToUi();
}

function applyReviewSettingsToUi() {
  refreshAllStickerReviewStates();
  callbacks.updateMarqueePool(globalState.stickers, globalReviewSettings);
}

export function refreshAllStickerReviewStates() {
  globalState.stickers.forEach((record) => {
    // Recalculate permissions based on new settings
    const isOwner = !record.deviceId || !globalState.deviceId || record.deviceId === globalState.deviceId;
    const requireApproval = globalReviewSettings.requireStickerApproval;
    record.canViewNote = !requireApproval || record.isApproved || isOwner;

    updateStickerReviewState(record);
  });
}

export function subscribeToReviewSettings() {
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

export function subscribeToStickers() {
  if (!isSupabaseConfigured() || typeof supabase.channel !== "function") {
    return;
  }
  if (stickersChannel) {
    return;
  }
  stickersChannel = supabase
    .channel("public:wall_stickers")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "wall_stickers" },
      (payload) => {
        const record = payload.new;
        if (!record || globalState.stickers.has(record.id)) return;

        // Add new sticker
        const x = record.x_norm * globalViewBox.width;
        const y = record.y_norm * globalViewBox.height;
        const node = createStickerNode(record.id, x, y, false);
        elements.stickersLayer.appendChild(node);

        const isOwner = !record.device_id || !globalState.deviceId || record.device_id === globalState.deviceId;
        const requireApproval = globalReviewSettings.requireStickerApproval;
        const canViewNote = !requireApproval || record.is_approved || isOwner;

        const stickerData = {
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
          canViewNote: canViewNote,
        };

        globalState.stickers.set(record.id, stickerData);
        callbacks.runPopAnimation(node);
        updateStickerReviewState(stickerData);
        
        // Only play impact effect if NOT the owner (owner sees it immediately upon save)
        if (!isOwner) {
          queueImpactEffect(node);
        }

        callbacks.updateFireIntensity(globalState.stickers);
        callbacks.updateMarqueePool(globalState.stickers, globalReviewSettings);
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "wall_stickers" },
      (payload) => {
        const record = payload.new;
        const existing = globalState.stickers.get(record.id);
        if (!existing) return;

        existing.note = record.note ?? "";
        existing.isApproved = Boolean(record.is_approved);
        existing.updated_at = record.updated_at;
        
        const isOwner = !record.device_id || !globalState.deviceId || record.device_id === globalState.deviceId;
        const requireApproval = globalReviewSettings.requireStickerApproval;
        existing.canViewNote = !requireApproval || record.is_approved || isOwner;
        
        updateStickerReviewState(existing);
        callbacks.updateMarqueePool(globalState.stickers, globalReviewSettings);
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "wall_stickers" },
      (payload) => {
        const id = payload.old.id;
        const existing = globalState.stickers.get(id);
        if (existing) {
          if (existing.node) existing.node.remove();
          globalState.stickers.delete(id);
          callbacks.updateFireIntensity(globalState.stickers);
          callbacks.updateMarqueePool(globalState.stickers, globalReviewSettings);
        }
      }
    )
    .subscribe();
}

export function cleanupReviewSettingsSubscription() {
    if (reviewSettingsChannel && typeof supabase?.removeChannel === "function") {
      supabase.removeChannel(reviewSettingsChannel);
      reviewSettingsChannel = null;
    }
    if (stickersChannel && typeof supabase?.removeChannel === "function") {
      supabase.removeChannel(stickersChannel);
      stickersChannel = null;
    }
}

export function getStickerRect(node) {
  if (node && node.getBoundingClientRect) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
    }
  }
  return null;
}

