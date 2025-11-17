import { supabase, isSupabaseConfigured, deviceId as initialDeviceId } from "./supabase-config.js";

const svgNS = "http://www.w3.org/2000/svg";
const wallSvg = document.getElementById("wallSvg");
const wallWrapper = document.getElementById("wallWrapper");
const stickersLayer = document.getElementById("stickersLayer");
const dragOverlay = document.getElementById("dragOverlay");
const eaglePaths = Array.from(document.querySelectorAll(".eagle-shape"));
const randomButton = document.getElementById("randomPlacementBtn");
const toggleBoardBtn = document.getElementById("toggleBoardBtn");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const boardCounter = document.getElementById("boardCounter");
const paletteSticker = document.getElementById("paletteSticker");
const statusToast = document.getElementById("statusToast");
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
const placementStatus = document.getElementById("placementStatus");
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

const viewBox = wallSvg.viewBox.baseVal;
const STICKER_DIAMETER = 36;
const STICKER_RADIUS = STICKER_DIAMETER / 2;
const MIN_DISTANCE = STICKER_DIAMETER + 8;
const DRAG_ACTIVATION_DISTANCE = 12;
const PLACEMENT_MESSAGES = {
  idle: "點擊貼紙樣本啟用點擊貼上模式，\n或直接拖曳貼紙。",
  click: "點擊老鷹任一位置貼上貼紙，\n按 Esc 或再點樣本可取消。",
  drag: "拖曳貼紙中，鬆開手即可貼上。",
};
const SUBTITLE_TEXT = "（最多 800 字，留言於一日後鎖定）";
const ZOOM_SCALE = 3;

const state = {
  stickers: new Map(),
  pending: null,
  drag: null,
  placementMode: "idle",
  counterVisible: false,
  toastTimer: null,
  flipAnimation: null,
  zoomOverlay: null,
  zoomAnimation: null,
  zoomResolve: null,
  closing: false,
  lastClickWarning: 0,
  zoomMode: "normal",
  deviceId: initialDeviceId ?? null,
};

init().catch((err) => console.error(err));

function init() {
  state.deviceId = initialDeviceId ?? ensureDeviceId();
  randomButton?.addEventListener("click", () => handleRandomPlacement());
  toggleBoardBtn?.addEventListener("click", toggleCounter);
  zoomInBtn?.addEventListener("click", handleZoomIn);
  zoomOutBtn?.addEventListener("click", handleZoomOut);
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
  setPlacementMode("idle", { force: true });
  updateDialogSubtitle(false);
  updateZoomButtons();
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
    .from("wall_stickers")
    .select("id, x_norm, y_norm, note, rotation_angle, created_at, updated_at, device_id")
    .order("created_at", { ascending: true });
  if (error) {
    showToast("讀取貼紙失敗，請稍後再試", "danger");
    console.error(error);
    return;
  }
  data.forEach((record) => {
    const x = record.x_norm * viewBox.width;
    const y = record.y_norm * viewBox.height;
    const rotation = normalizeRotation(record.rotation_angle);
    const node = createStickerNode(record.id, x, y, false, rotation);
    stickersLayer.appendChild(node);
    state.stickers.set(record.id, {
      id: record.id,
      x,
      y,
      xNorm: record.x_norm,
      yNorm: record.y_norm,
      note: record.note,
      rotation,
      node,
      created_at: record.created_at,
      updated_at: record.updated_at,
      deviceId: record.device_id ?? null,
    });
    runPopAnimation(node);
  });
  updateBoardCounter();
}

function handleEagleClick(event) {
  if (event.target.closest(".sticker-node") || state.pending) {
    return;
  }
  if (state.placementMode !== "click") {
    const now = Date.now();
    if (now - state.lastClickWarning > 1400) {
      showToast("請先點貼紙樣本以啟用點擊貼上模式", "info");
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

function handleRandomPlacement() {
  if (state.pending) {
    showToast("請先完成目前的留言", "danger");
    return;
  }
  setPlacementMode("idle");
  const candidate = findAvailableSpot();
  if (!candidate) {
    showToast("貼紙已接近滿版，暫無可用位置", "danger");
    return;
  }
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
  const svgPoint = clientToSvg(event.clientX, event.clientY);
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
  const svgPoint = clientToSvg(event.clientX, event.clientY);
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
  if (state.zoomMode === "zoomed") {
    setZoomMode("normal");
    handled = true;
  }
  if (handled) {
    event.preventDefault();
  }
}

function setPlacementMode(mode, options = {}) {
  const normalized = mode === "click" || mode === "drag" ? mode : "idle";
  if (!options.force && state.placementMode === normalized) {
    if (normalized !== "drag") {
      updatePlacementStatus();
    }
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
  updatePlacementStatus();
}

function updatePlacementStatus() {
  if (!placementStatus) {
    return;
  }
  const message = PLACEMENT_MESSAGES[state.placementMode] ?? PLACEMENT_MESSAGES.idle;
  placementStatus.textContent = message;
  placementStatus.hidden = false;
}

function handleZoomIn() {
  setZoomMode("zoomed");
}

function handleZoomOut() {
  setZoomMode("normal");
}

function setZoomMode(mode) {
  const normalized = mode === "zoomed" ? "zoomed" : "normal";
  if (state.zoomMode === normalized) {
    return;
  }
  state.zoomMode = normalized;
  if (normalized === "zoomed") {
    document.body?.classList.add("zoomed-in");
    wallWrapper?.classList.add("zoomed");
    if (wallSvg) {
      wallSvg.style.width = `${ZOOM_SCALE * 100}%`;
      wallSvg.style.height = "auto";
      wallSvg.style.maxHeight = "none";
    }
    if (wallWrapper) {
      wallWrapper.scrollTop = 0;
      requestAnimationFrame(() => centerZoomViewport());
    }
  } else {
    document.body?.classList.remove("zoomed-in");
    wallWrapper?.classList.remove("zoomed");
    if (wallSvg) {
      wallSvg.style.removeProperty("width");
      wallSvg.style.removeProperty("height");
      wallSvg.style.removeProperty("max-height");
    }
    if (wallWrapper) {
      wallWrapper.scrollLeft = 0;
      wallWrapper.scrollTop = 0;
    }
  }
  updateZoomButtons();
}

function updateZoomButtons() {
  const zoomed = state.zoomMode === "zoomed";
  if (zoomInBtn) {
    zoomInBtn.disabled = zoomed;
  }
  if (zoomOutBtn) {
    zoomOutBtn.disabled = !zoomed;
  }
}

function centerZoomViewport() {
  if (!wallWrapper || state.zoomMode !== "zoomed") {
    return;
  }
  const centerX = (wallWrapper.scrollWidth - wallWrapper.clientWidth) / 2;
  if (Number.isFinite(centerX)) {
    wallWrapper.scrollLeft = Math.max(0, centerX);
  }
}

function handleViewportChange() {
  if (state.zoomMode === "zoomed") {
    requestAnimationFrame(() => centerZoomViewport());
  }
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
  const rotation = randomRotationAngle();
  const node = createStickerNode(tempId, x, y, true, rotation);
  stickersLayer.appendChild(node);
  if (!state.deviceId) {
    state.deviceId = ensureDeviceId();
  }
  state.pending = {
    id: tempId,
    x,
    y,
    node,
    isNew: true,
    rotation,
    locked: false,
    lockReason: null,
    deviceId: state.deviceId ?? null,
  };
  dialogTitle.textContent = "新增神蹟留言";
  noteInput.value = "";
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
    if (pending.lockReason === "device") {
      formError.textContent = "此留言僅能由原建立裝置於 24 小時內修改";
    } else {
      formError.textContent = "留言已鎖定，無法再修改";
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
  if (!pending || pending.isNew || pending.locked) {
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
    updateBoardCounter();
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
  const rotation = normalizeRotation(pending.rotation);
  const payload = {
    x_norm: pending.x / viewBox.width,
    y_norm: pending.y / viewBox.height,
    note: message,
    rotation_angle: rotation,
    device_id: state.deviceId ?? null,
  };
  const { data, error } = await supabase
    .from("wall_stickers")
    .insert(payload)
    .select()
    .single();
  pending.node.classList.remove("pending");
  if (error) {
    formError.textContent = "儲存失敗，請稍後再試";
    console.error(error);
    return;
  }
  const newId = data.id;
  pending.node.dataset.id = newId;
  pending.id = newId;
  pending.isNew = false;
  pending.rotation = rotation;
  pending.deviceId = payload.device_id ?? null;
  pending.lockReason = null;
  state.stickers.set(newId, {
    id: newId,
    x: pending.x,
    y: pending.y,
    xNorm: payload.x_norm,
    yNorm: payload.y_norm,
    note: message,
    rotation,
    node: pending.node,
    created_at: data.created_at,
    updated_at: data.updated_at,
    deviceId: data.device_id ?? payload.device_id ?? null,
  });
  setStickerRotation(pending.node, rotation);
  runPopAnimation(pending.node);
  updateBoardCounter();
  await closeDialogWithResult("saved");
  showToast("留言已保存", "success");
}

async function updateStickerMessage(pending, message) {
  if (pending.deviceId && state.deviceId && pending.deviceId !== state.deviceId) {
    formError.textContent = "此留言僅能由原建立裝置於 24 小時內修改";
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
    runPulseAnimation(record.node);
  }
  await closeDialogWithResult("saved");
  showToast("留言已更新", "success");
}

function createStickerNode(id, x, y, isPending = false, rotation = 0) {
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
  setStickerRotation(group, rotation);
  group.addEventListener("click", (event) => {
    event.stopPropagation();
    const stickerId = group.dataset.id;
    if (!state.pending && stickerId && state.stickers.has(stickerId)) {
      setPlacementMode("idle");
      openStickerModal(stickerId);
    }
  });
  group.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const stickerId = group.dataset.id;
      if (!state.pending && stickerId && state.stickers.has(stickerId)) {
        setPlacementMode("idle");
        openStickerModal(stickerId);
      }
    }
  });
  return group;
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
  applyStickerTransform(node);
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
    rotation: record.rotation ?? 0,
    deviceId: record.deviceId ?? null,
    lockReason: null,
  };
  dialogTitle.textContent = "神蹟留言";
  noteInput.value = record.note ?? "";
  formError.textContent = "";
  setTimestampDisplay(record);
  const lockReason = resolveLockReason(record);
  state.pending.lockReason = lockReason;
  state.pending.locked = Boolean(lockReason);
  if (lockReason === "device") {
    formError.textContent = "此留言僅能由原建立裝置於 24 小時內修改";
  } else if (lockReason === "time") {
    formError.textContent = "留言已鎖定，無法再修改";
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

function clampToViewBox(value, isY = false) {
  if (isY) {
    return Math.min(viewBox.y + viewBox.height - STICKER_RADIUS, Math.max(viewBox.y + STICKER_RADIUS, value));
  }
  return Math.min(viewBox.x + viewBox.width - STICKER_RADIUS, Math.max(viewBox.x + STICKER_RADIUS, value));
}

function clientToSvg(clientX, clientY) {
  const matrix = wallSvg.getScreenCTM();
  if (!matrix) {
    return null;
  }
  const point = wallSvg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const transformed = point.matrixTransform(matrix.inverse());
  return { x: transformed.x, y: transformed.y };
}

function toggleCounter() {
  state.counterVisible = !state.counterVisible;
  boardCounter.hidden = !state.counterVisible;
  if (state.counterVisible) {
    updateBoardCounter();
  }
}

function updateBoardCounter() {
  if (!state.counterVisible) {
    return;
  }
  boardCounter.textContent = `目前貼紙：${state.stickers.size.toLocaleString("zh-Hant")} 張`;
  boardCounter.hidden = false;
}

function showToast(message, tone = "info") {
  statusToast.textContent = message;
  statusToast.dataset.tone = tone;
  statusToast.classList.add("visible");
  if (state.toastTimer) {
    clearTimeout(state.toastTimer);
  }
  state.toastTimer = setTimeout(() => {
    statusToast.classList.remove("visible");
  }, 2600);
}

function runPopAnimation(node) {
  if (!window.anime) {
    return;
  }
  window.anime({
    targets: node,
    scale: [0.35, 1],
    easing: "easeOutBack",
    duration: 520,
  });
}

function runPulseAnimation(node) {
  if (!window.anime) {
    return;
  }
  window.anime({
    targets: node,
    scale: [1, 1.15, 1],
    duration: 620,
    easing: "easeInOutSine",
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
  const hasAnime = Boolean(window.anime && typeof window.anime.timeline === "function");
  if (!hasAnime) {
    finalizeReturnWithoutAnimation(node, returnToPalette);
    return Promise.resolve();
  }

  const centerRect = computeCenterRect();
  const targetRaw = returnToPalette ? getPaletteTargetRect() : node.getBoundingClientRect();
  if (!centerRect || !targetRaw || !targetRaw.width || !targetRaw.height) {
    finalizeReturnWithoutAnimation(node, returnToPalette);
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
    return Promise.resolve();
  }

  const targetRect = normalizeTargetRect(targetRaw, true);
  if (!targetRect) {
    overlay.remove();
    finalizeReturnWithoutAnimation(node, returnToPalette);
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
  const rect = paletteSticker.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }
  return rect;
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

function setStickerRotation(node, rotation) {
  if (!node) {
    return;
  }
  const normalized = normalizeRotation(rotation);
  node.dataset.rotation = String(normalized);
  applyStickerTransform(node);
}

function applyStickerTransform(node) {
  if (!node) {
    return;
  }
  const rotation = Number(node.dataset.rotation ?? 0);
  const cx = Number(node.dataset.cx);
  const cy = Number(node.dataset.cy);
  if (Number.isFinite(rotation) && Number.isFinite(cx) && Number.isFinite(cy)) {
    node.setAttribute(
      "transform",
      `rotate(${Math.round(rotation)} ${cx.toFixed(2)} ${cy.toFixed(2)})`
    );
  } else {
    node.removeAttribute("transform");
  }
}

function normalizeRotation(value) {
  if (!Number.isFinite(Number(value))) {
    return 0;
  }
  let result = Math.round(Number(value)) % 360;
  if (result < 0) {
    result += 360;
  }
  return Number.isFinite(result) ? result : 0;
}

function randomRotationAngle() {
  return Math.floor(Math.random() * 360);
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
  if (isStickerLocked(record)) {
    return "time";
  }
  const recordDeviceId = record.deviceId ?? record.device_id ?? null;
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
  updateDialogSubtitle(isLocked);
}

function updateDeleteButton() {
  if (!deleteStickerBtn) {
    return;
  }
  const pending = state.pending;
  const ownDevice = !pending?.deviceId || !state.deviceId || pending.deviceId === state.deviceId;
  const canDelete = Boolean(pending && !pending.isNew && !pending.locked && ownDevice);
  deleteStickerBtn.hidden = !canDelete;
  deleteStickerBtn.disabled = !canDelete;
  if (canDelete) {
    deleteStickerBtn.removeAttribute("aria-hidden");
  } else {
    deleteStickerBtn.setAttribute("aria-hidden", "true");
  }
}

function updateDialogSubtitle(isLocked) {
  if (!dialogSubtitle) {
    return;
  }
  if (isLocked) {
    dialogSubtitle.textContent = "";
    dialogSubtitle.hidden = true;
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
