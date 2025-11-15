import { supabase, isSupabaseConfigured } from "./supabase-config.js";

const svgNS = "http://www.w3.org/2000/svg";
const wallSvg = document.getElementById("wallSvg");
const stickersLayer = document.getElementById("stickersLayer");
const eaglePaths = Array.from(document.querySelectorAll(".eagle-shape"));
const randomButton = document.getElementById("randomPlacementBtn");
const toggleBoardBtn = document.getElementById("toggleBoardBtn");
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
const flipCardInner = document.getElementById("flipCardInner");
const flipFront = document.getElementById("flipFront");
const flipBack = document.getElementById("flipBack");
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
const STICKER_DIAMETER = 72;
const STICKER_RADIUS = STICKER_DIAMETER / 2;
const MIN_DISTANCE = STICKER_DIAMETER + 8;

const state = {
  stickers: new Map(),
  pending: null,
  drag: null,
  counterVisible: false,
  toastTimer: null,
  flipAnimation: null,
  zoomOverlay: null,
  zoomAnimation: null,
  zoomResolve: null,
};

init().catch((err) => console.error(err));

function init() {
  randomButton?.addEventListener("click", () => handleRandomPlacement());
  toggleBoardBtn?.addEventListener("click", toggleCounter);
  wallSvg.addEventListener("click", handleEagleClick);
  paletteSticker?.addEventListener("pointerdown", startPaletteDrag);
  noteForm.addEventListener("submit", handleFormSubmit);
  cancelModalBtn.addEventListener("click", () => noteDialog.close("cancelled"));
  noteDialog.addEventListener("cancel", () => noteDialog.close("cancelled"));
  noteDialog.addEventListener("close", handleDialogClose);
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
    .select("id, x_norm, y_norm, note, created_at, updated_at")
    .order("created_at", { ascending: true });
  if (error) {
    showToast("讀取貼紙失敗，請稍後再試", "danger");
    console.error(error);
    return;
  }
  data.forEach((record) => {
    const x = record.x_norm * viewBox.width;
    const y = record.y_norm * viewBox.height;
    const node = createStickerNode(record.id, x, y);
    stickersLayer.appendChild(node);
    state.stickers.set(record.id, {
      id: record.id,
      x,
      y,
      xNorm: record.x_norm,
      yNorm: record.y_norm,
      note: record.note,
      node,
      created_at: record.created_at,
      updated_at: record.updated_at,
    });
    runPopAnimation(node);
  });
  updateBoardCounter();
}

function handleEagleClick(event) {
  if (event.target.closest(".sticker-node") || state.pending) {
    return;
  }
  const svgPoint = clientToSvg(event.clientX, event.clientY);
  const candidate = findAvailableSpot(svgPoint ?? undefined);
  if (!candidate) {
    showToast("暫時找不到可用位置，試試拖曳方式", "danger");
    return;
  }
  beginPlacement(candidate.x, candidate.y);
}

function handleRandomPlacement() {
  if (state.pending) {
    showToast("請先完成目前的留言", "danger");
    return;
  }
  const candidate = findAvailableSpot();
  if (!candidate) {
    showToast("貼紙已接近滿版，暫無可用位置", "danger");
    return;
  }
  beginPlacement(candidate.x, candidate.y);
}

function startPaletteDrag(event) {
  if (state.pending) {
    showToast("請先完成目前的留言", "danger");
    return;
  }
  event.preventDefault();
  paletteSticker.setPointerCapture(event.pointerId);
  const ghost = createStickerNode("drag-ghost", viewBox.x, viewBox.y, true);
  ghost.classList.add("drag-ghost");
  stickersLayer.appendChild(ghost);
  state.drag = {
    pointerId: event.pointerId,
    node: ghost,
    x: viewBox.x,
    y: viewBox.y,
    valid: false,
  };
  updateDragPosition(event);
  paletteSticker.addEventListener("pointermove", updateDragPosition);
  paletteSticker.addEventListener("pointerup", endPaletteDrag, { once: true });
  paletteSticker.addEventListener("pointercancel", cancelPaletteDrag, { once: true });
}

function updateDragPosition(event) {
  if (!state.drag) {
    return;
  }
  const svgPoint = clientToSvg(event.clientX, event.clientY);
  if (!svgPoint) {
    return;
  }
  positionStickerNode(state.drag.node, svgPoint.x, svgPoint.y);
  const valid = isValidSpot(svgPoint.x, svgPoint.y);
  state.drag.node.classList.toggle("valid", valid);
  state.drag.node.classList.toggle("invalid", !valid);
  state.drag.x = svgPoint.x;
  state.drag.y = svgPoint.y;
  state.drag.valid = valid;
}

function endPaletteDrag(event) {
  paletteSticker.releasePointerCapture(event.pointerId);
  paletteSticker.removeEventListener("pointermove", updateDragPosition);
  state.drag?.node.remove();
  const drag = state.drag;
  state.drag = null;
  if (!drag) {
    return;
  }
  if (!drag.valid) {
    showToast("貼紙不可超出老鷹範圍或與其他貼紙重疊", "danger");
    return;
  }
  beginPlacement(drag.x, drag.y);
}

function cancelPaletteDrag(event) {
  paletteSticker.releasePointerCapture(event.pointerId);
  paletteSticker.removeEventListener("pointermove", updateDragPosition);
  state.drag?.node.remove();
  state.drag = null;
}

function beginPlacement(x, y) {
  const tempId = `temp-${createUuid()}`;
  const node = createStickerNode(tempId, x, y, true);
  stickersLayer.appendChild(node);
  state.pending = {
    id: tempId,
    x,
    y,
    node,
    isNew: true,
  };
  dialogTitle.textContent = "新增貼紙留言";
  noteInput.value = "";
  formError.textContent = "";
  setTimestampDisplay(null);
  focusDialog(node);
}

function focusDialog(originNode) {
  resetFlipCard();
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
  if (originNode) {
    animateStickerZoom(originNode)
      .then(openModal)
      .catch((error) => {
        console.error("Sticker zoom animation failed", error);
        try {
          openModal();
        } catch (openError) {
          console.error("Failed to open note dialog", openError);
        }
      });
  } else {
    openModal();
  }
}

function handleDialogClose() {
  const pending = state.pending;
  if (pending && pending.isNew && noteDialog.returnValue !== "saved") {
    pending.node.remove();
  }
  state.pending = null;
  formError.textContent = "";
  setTimestampDisplay(null);
  document.body?.classList.remove("dialog-open");
  resetFlipCard();
  cleanupZoomOverlay();
}

function handleFormSubmit(event) {
  event.preventDefault();
  const message = noteInput.value.trim();
  if (!message) {
    formError.textContent = "請輸入留言內容";
    return;
  }
  const pending = state.pending;
  if (!pending) {
    noteDialog.close("saved");
    return;
  }
  if (!isSupabaseConfigured()) {
    formError.textContent = "尚未設定 Supabase，請先完成設定";
    return;
  }
  if (pending.isNew) {
    saveNewSticker(pending, message);
  } else {
    updateStickerMessage(pending, message);
  }
}

async function saveNewSticker(pending, message) {
  pending.node.classList.add("pending");
  const payload = {
    x_norm: pending.x / viewBox.width,
    y_norm: pending.y / viewBox.height,
    note: message,
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
  state.stickers.set(newId, {
    id: newId,
    x: pending.x,
    y: pending.y,
    xNorm: payload.x_norm,
    yNorm: payload.y_norm,
    note: message,
    node: pending.node,
    created_at: data.created_at,
    updated_at: data.updated_at,
  });
  runPopAnimation(pending.node);
  updateBoardCounter();
  noteDialog.close("saved");
  showToast("留言已保存", "success");
}

async function updateStickerMessage(pending, message) {
  const { error, data } = await supabase
    .from("wall_stickers")
    .update({ note: message })
    .eq("id", pending.id)
    .select()
    .single();
  if (error) {
    formError.textContent = "更新失敗，請稍後再試";
    console.error(error);
    return;
  }
  const record = state.stickers.get(pending.id);
  if (record) {
    record.note = message;
    record.updated_at = data?.updated_at ?? null;
    runPulseAnimation(record.node);
  }
  noteDialog.close("saved");
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
    if (!state.pending && stickerId && state.stickers.has(stickerId)) {
      openStickerModal(stickerId);
    }
  });
  group.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const stickerId = group.dataset.id;
      if (!state.pending && stickerId && state.stickers.has(stickerId)) {
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
  };
  dialogTitle.textContent = "貼紙留言";
  noteInput.value = record.note ?? "";
  formError.textContent = "";
  setTimestampDisplay(record);
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
    duration: 720,
  });
  timeline
    .add({ rotateY: 105, scale: 1.05, duration: 320 })
    .add({ rotateY: 180, scale: 1, duration: 360, easing: "easeOutCubic" });
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
    }, 720);
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

function setTimestampDisplay(record) {
  if (!noteTimestamp) {
    return;
  }
  if (!record || (!record.created_at && !record.updated_at)) {
    noteTimestamp.textContent = "";
    noteTimestamp.hidden = true;
    return;
  }
  const createdRaw = record.created_at ?? null;
  const updatedRaw = record.updated_at ?? null;
  const createdText = createdRaw ? formatDateTime(createdRaw) : null;
  const updatedText = updatedRaw ? formatDateTime(updatedRaw) : null;
  const hasUpdated = Boolean(updatedRaw && (!createdRaw || updatedRaw !== createdRaw));
  if (!createdText && !updatedText) {
    noteTimestamp.textContent = "";
    noteTimestamp.hidden = true;
    return;
  }

  let message = "";
  if (createdText) {
    message = `留言時間：${createdText}`;
  }
  if (hasUpdated && updatedText) {
    message += message ? `｜最後更新：${updatedText}` : `最後更新：${updatedText}`;
  }
  noteTimestamp.textContent = message;
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

function animateStickerZoom(originNode) {
  if (!window.anime || typeof window.anime.timeline !== "function" || !originNode) {
    return Promise.resolve();
  }
  const rect = originNode.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return Promise.resolve();
  }
  cleanupZoomOverlay();
  const overlay = document.createElement("div");
  overlay.className = "zoom-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  overlay.style.opacity = "0";
  const image = document.createElement("img");
  image.src = "svg/Top Heart Mark.svg";
  image.alt = "";
  image.draggable = false;
  image.setAttribute("aria-hidden", "true");
  overlay.appendChild(image);
  document.body.appendChild(overlay);
  state.zoomOverlay = overlay;

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

function createUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}
