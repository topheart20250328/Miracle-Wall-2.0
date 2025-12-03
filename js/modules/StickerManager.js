
import { supabase, isSupabaseConfigured } from "../supabase-config.js";

const svgNS = "http://www.w3.org/2000/svg";
import * as Utils from "./Utils.js";
import * as SearchController from "./SearchController.js";

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

export function initStickerManager(domElements, state, viewBox, reviewSettings, managerCallbacks) {
  elements = { ...elements, ...domElements };
  globalState = state;
  globalViewBox = viewBox;
  globalReviewSettings = reviewSettings;
  callbacks = { ...callbacks, ...managerCallbacks };
  setupStickerDelegation();
}

function setupStickerDelegation() {
  if (!elements.stickersLayer) return;

  elements.stickersLayer.addEventListener("mouseover", (e) => {
    const group = e.target.closest(".sticker-node");
    if (group) {
      if (group.contains(e.relatedTarget)) return;
      if (!group.classList.contains("pending") && !globalState.drag && !globalState.pending) {
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
        if (window.anime) {
          window.anime.remove(group);
          window.anime({
            targets: group,
            scale: 1,
            rotate: 0,
            duration: 300,
            easing: "easeOutQuad",
          });
        }
      }
    }
  });
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
    elements.stickersLayer.appendChild(node);
    
    // Calculate canViewNote client-side since we are querying the raw table
    const isOwner = !record.device_id || !globalState.deviceId || record.device_id === globalState.deviceId;
    const requireApproval = globalReviewSettings.requireStickerApproval;
    const canViewNote = !requireApproval || record.is_approved || isOwner;

    globalState.stickers.set(record.id, {
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
    });
    callbacks.runPopAnimation(node);
    updateStickerReviewState(globalState.stickers.get(record.id));
  });
  callbacks.updateFireIntensity(globalState.stickers);
  callbacks.updateMarqueePool(globalState.stickers, globalReviewSettings);
}

export function createStickerNode(id, x, y, isPending = false) {
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
  const highlight = node.querySelector(".drag-ghost-highlight");
  if (highlight) {
    highlight.setAttribute("cx", x.toFixed(2));
    highlight.setAttribute("cy", y.toFixed(2));
    highlight.setAttribute("r", (STICKER_RADIUS + 8).toFixed(2));
  }
}

export function attachDragHighlight(node) {
  if (!node || node.querySelector(".drag-ghost-highlight")) {
    return;
  }
  const halo = document.createElementNS(svgNS, "circle");
  halo.classList.add("drag-ghost-highlight");
  halo.setAttribute("cx", "0");
  halo.setAttribute("cy", "0");
  halo.setAttribute("r", String(STICKER_RADIUS + 8));
  node.insertBefore(halo, node.firstChild ?? null);
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
  const targetLeft = (window.innerWidth - targetSize) / 2;
  const targetTop = (window.innerHeight - targetSize) / 2;
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
        width: targetSize,
        height: targetSize,
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

export function animateStickerReturn(pendingSnapshot, result) {
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
      callbacks.playPlacementImpactEffect(node);
    }
    return Promise.resolve();
  }

  const centerRect = computeCenterRect();
  const isMobile = window.innerWidth <= 640;
  const targetRaw = returnToPalette ? getPaletteTargetRect() : node.getBoundingClientRect();
  if (!centerRect || !targetRaw || !targetRaw.width || !targetRaw.height) {
    finalizeReturnWithoutAnimation(node, returnToPalette);
    if (shouldPlayImpact) {
      callbacks.playPlacementImpactEffect(node);
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
      callbacks.playPlacementImpactEffect(node);
    }
    return Promise.resolve();
  }

  const targetRect = normalizeTargetRect(targetRaw, returnToPalette);
  if (!targetRect) {
    overlay.remove();
    finalizeReturnWithoutAnimation(node, returnToPalette);
    if (shouldPlayImpact) {
      callbacks.playPlacementImpactEffect(node);
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
      if (globalState.zoomAnimation === timelineRef && timelineRef && typeof timelineRef.pause === "function") {
        timelineRef.pause();
      }
      if (globalState.zoomAnimation === timelineRef) {
        globalState.zoomAnimation = null;
      }
      if (globalState.zoomOverlay === overlay) {
        globalState.zoomOverlay = null;
      }
      overlay.remove();
      finalizeReturnWithoutAnimation(node, returnToPalette);
      if (shouldPlayImpact) {
        callbacks.playPlacementImpactEffect(node);
      }
      if (globalState.zoomResolve === finalizeAndResolve) {
        globalState.zoomResolve = null;
      }
      resolve();
    };

    const finalizeAndResolve = () => finalize();

    globalState.zoomResolve = finalizeAndResolve;
    timelineRef = window.anime.timeline({
      targets: overlay,
      easing: "easeInOutCubic",
    });
    globalState.zoomAnimation = timelineRef;

    timelineRef
      .add({
        left: targetRect.left,
        top: targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
        duration: 420,
        round: 2,
        complete: () => {
          // Show the original sticker BEFORE fading out the overlay
          // This prevents the "flash" of empty space
          if (!returnToPalette && node) {
            setStickerInFlight(node, false);
          }
        }
      })
      .add({
        opacity: 0,
        duration: 200, // Slightly longer fade out for smoothness
        easing: "easeOutQuad",
        // No delay needed if we show the sticker at the start of this phase
        complete: finalizeAndResolve,
      });

    if (timelineRef.finished && typeof timelineRef.finished.then === "function") {
      timelineRef.finished.catch(finalize);
    } else {
      setTimeout(finalize, 640);
    }
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
    if (window.anime) {
      window.anime.remove(node);
      window.anime({
        targets: node,
        scale: 1,
        rotate: 0,
        duration: 300,
        easing: "easeOutQuad",
      });
    } else {
      // Fallback if anime is not available
      node.style.transform = "";
    }
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

export function cleanupReviewSettingsSubscription() {
    if (reviewSettingsChannel && typeof supabase?.removeChannel === "function") {
      supabase.removeChannel(reviewSettingsChannel);
      reviewSettingsChannel = null;
    }
}

