
import { clampNumber } from "./Utils.js";

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

let elements = {
  wallStage: null,
  wallWrapper: null,
  wallSvg: null,
  stickersLayer: null,
  zoomSlider: null,
  zoomResetBtn: null,
  zoomIndicator: null,
};
let requiresStickerForceRedraw = false;
let resetAnimation = null;

export function initZoomController(domElements, forceRedraw) {
  elements = { ...elements, ...domElements };
  requiresStickerForceRedraw = forceRedraw;

  if (!elements.wallStage || !elements.wallWrapper) {
    return;
  }
  applyZoomTransform();
  updateZoomIndicator();
  elements.wallStage.addEventListener("wheel", handleStageWheel, { passive: false });
  elements.wallStage.addEventListener("pointerdown", handleStagePointerDown);
  elements.wallStage.addEventListener("pointermove", handleStagePointerMove);
  elements.wallStage.addEventListener("pointerup", handleStagePointerUp);
  elements.wallStage.addEventListener("pointercancel", handleStagePointerUp);
  if (elements.zoomSlider) {
    const sliderMin = zoomState.minScale * 100;
    const sliderMax = zoomState.maxScale * 100;
    elements.zoomSlider.min = String(sliderMin);
    elements.zoomSlider.max = String(sliderMax);
    elements.zoomSlider.value = String(zoomState.scale * 100);
    elements.zoomSlider.step = "5";
    elements.zoomSlider.addEventListener("input", handleZoomSliderInput);
  }
  elements.zoomResetBtn?.addEventListener("click", resetZoomView);
  updateZoomStageMetrics();
}

export function updateZoomStageMetrics() {
  applyZoomTransform();
  updateZoomIndicator();
}

export function clientToSvg(clientX, clientY, viewBox) {
  if (!elements.wallSvg) {
    return null;
  }
  const rect = elements.wallSvg.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }
  const normalizedX = (clientX - rect.left) / rect.width;
  const normalizedY = (clientY - rect.top) / rect.height;
  const svgX = viewBox.x + normalizedX * viewBox.width;
  const svgY = viewBox.y + normalizedY * viewBox.height;
  return { x: svgX, y: svgY };
}

function handleStageWheel(event) {
  if (!elements.wallStage) {
    return;
  }
  if (resetAnimation) {
    resetAnimation.pause();
    resetAnimation = null;
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
  if (resetAnimation) {
    resetAnimation.pause();
    resetAnimation = null;
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
    if (panState.moved && typeof elements.wallStage?.setPointerCapture === "function") {
      try {
        elements.wallStage.setPointerCapture(event.pointerId);
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
  if (typeof elements.wallStage?.releasePointerCapture === "function") {
    try {
      elements.wallStage.releasePointerCapture(pointerId);
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

  if (window.anime) {
    if (resetAnimation) resetAnimation.pause();
    
    const targets = { 
      scale: zoomState.scale, 
      offsetX: viewportState.offsetX, 
      offsetY: viewportState.offsetY 
    };

    resetAnimation = window.anime({
      targets: targets,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      duration: 800,
      easing: 'easeOutExpo',
      update: () => {
        zoomState.scale = targets.scale;
        viewportState.offsetX = targets.offsetX;
        viewportState.offsetY = targets.offsetY;
        applyZoomTransform(true);
        updateZoomIndicator();
      },
      complete: () => {
        resetAnimation = null;
        zoomState.scale = 1;
        viewportState.offsetX = 0;
        viewportState.offsetY = 0;
        applyZoomTransform(false);
        updateZoomIndicator();
      }
    });
  } else {
    zoomState.scale = 1;
    viewportState.offsetX = 0;
    viewportState.offsetY = 0;
    applyZoomTransform();
    updateZoomIndicator();
  }
}

function setZoomScale(nextScale, anchorEvent) {
  const clamped = clampNumber(nextScale, zoomState.minScale, zoomState.maxScale);
  if (clamped === zoomState.scale || !elements.wallStage) {
    updateZoomIndicator();
    return;
  }
  const anchorPoint = anchorEvent ?? getStageCenterPoint();
  let offsetX = viewportState.offsetX;
  let offsetY = viewportState.offsetY;
  if (anchorPoint) {
    const stageRect = elements.wallStage.getBoundingClientRect();
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

function applyZoomTransform(skipInvalidation = false) {
  if (!elements.wallSvg) {
    return;
  }
  elements.wallSvg.style.transformOrigin = "center";
  elements.wallSvg.style.transform = `translate(${viewportState.offsetX}px, ${viewportState.offsetY}px) scale(${zoomState.scale})`;
  if (!skipInvalidation) {
    invalidateStickerRendering();
  }
}

function applyPanDelta(deltaX, deltaY) {
  viewportState.offsetX = panState.startOffsetX + deltaX;
  viewportState.offsetY = panState.startOffsetY + deltaY;
  applyZoomTransform();
}

function invalidateStickerRendering() {
  if (!elements.stickersLayer || typeof window === "undefined") {
    return;
  }
  if (!requiresStickerForceRedraw) {
    return;
  }
  const parent = elements.stickersLayer.parentNode;
  if (!parent) {
    return;
  }
  const nextSibling = elements.stickersLayer.nextSibling;
  parent.removeChild(elements.stickersLayer);
  window.requestAnimationFrame(() => {
    if (nextSibling && nextSibling.parentNode === parent) {
      parent.insertBefore(elements.stickersLayer, nextSibling);
    } else {
      parent.appendChild(elements.stickersLayer);
    }
  });
}

function updateZoomIndicator() {
  if (elements.zoomIndicator) {
    const percentage = Math.round(zoomState.scale * 100);
    elements.zoomIndicator.textContent = `${percentage}%`;
  }
  syncZoomSlider();
  updateZoomResetState();
}

function handleZoomSliderInput(event) {
  if (resetAnimation) {
    resetAnimation.pause();
    resetAnimation = null;
  }
  const value = Number(event.target.value);
  if (Number.isNaN(value)) {
    return;
  }
  const sliderScale = value / 100;
  const centerEvent = getStageCenterPoint();
  setZoomScale(sliderScale, centerEvent);
}

function getStageCenterPoint() {
  if (!elements.wallStage) {
    return null;
  }
  const rect = elements.wallStage.getBoundingClientRect();
  return {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
}

function syncZoomSlider() {
  if (!elements.zoomSlider) {
    return;
  }
  const percent = clampNumber(Math.round(zoomState.scale * 100), Number(elements.zoomSlider.min) || 100, Number(elements.zoomSlider.max) || 1000);
  if (Number(elements.zoomSlider.value) !== percent) {
    elements.zoomSlider.value = String(percent);
  }
  elements.zoomSlider.setAttribute("aria-valuetext", `${percent}%`);
}

function updateZoomResetState() {
  if (!elements.zoomResetBtn) {
    return;
  }
  const nearScale = Math.abs(zoomState.scale - 1) < 0.01;
  const nearOffsetX = Math.abs(viewportState.offsetX) < 1;
  const nearOffsetY = Math.abs(viewportState.offsetY) < 1;
  const atDefault = nearScale && nearOffsetX && nearOffsetY;
  elements.zoomResetBtn.disabled = false;
  elements.zoomResetBtn.setAttribute("aria-disabled", "false");
  elements.zoomResetBtn.classList.toggle("is-inactive", atDefault);
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
  if (!elements.wallStage) {
    return false;
  }
  const blocked = event.target.closest(".palette-sticker, .zoom-controls, #noteDialog, .note-dialog, .dialog-actions");
  return !blocked;
}
