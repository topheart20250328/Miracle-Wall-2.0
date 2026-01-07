
/**
 * @module ZoomController
 * @description 負責神蹟牆的無限畫布互動邏輯，包含平移 (Pan) 與縮放 (Zoom)。
 * @core-logic
 * - 處理 Pointer Events (滑鼠/觸控) 實現拖曳與雙指縮放 (Pinch-to-zoom)。
 * - 維護 Viewport 狀態 (offset, scale)。
 * - 提供座標轉換 (螢幕座標 <-> SVG/Canvas 座標)。
 */
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
let savedState = null;

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
  interactionTarget: null,
};
let requiresStickerForceRedraw = false;
let resetAnimation = null;
let currentAnimationTimer = null; // Track safety timer for restoreState
let pendingResolve = null; // Track pending promise resolve for restoreState
let interactionElement = null;
let interactionLocked = false;

export function stopAnimation() {
  if (currentAnimationTimer) {
    clearTimeout(currentAnimationTimer);
    currentAnimationTimer = null;
  }
  
  if (resetAnimation) {
    resetAnimation.pause();
    resetAnimation = null;
  }
  
  // Ensure we unlock if we forced a stop
  if (interactionLocked) {
    setInteractionLocked(false);
  }

  // Resolve any pending promise so await-ers don't hang
  if (pendingResolve) {
    pendingResolve();
    pendingResolve = null;
  }
}

export function isLocked() {
  return interactionLocked;
}

export function setInteractionLocked(locked) {
  interactionLocked = Boolean(locked);
  if (interactionLocked) {
    // Cancel any active interaction
    panState.pointerId = null;
    panState.moved = false;
    panState.pointers.clear();
    panState.pinchStartDistance = 0;
  }
}

export function getZoomState() {
  return {
    scale: zoomState.scale,
    offsetX: viewportState.offsetX,
    offsetY: viewportState.offsetY
  };
}

export function saveState() {
  if (!savedState) {
    savedState = {
      scale: zoomState.scale,
      offsetX: viewportState.offsetX,
      offsetY: viewportState.offsetY
    };
  }
}

export function clearSavedState() {
  savedState = null;
}

export function restoreState(duration = 600) {
  if (!savedState) return Promise.resolve();
  
  const targetState = { ...savedState };
  savedState = null;

  // Resolve previous promise if exists
  if (pendingResolve) {
    pendingResolve();
    pendingResolve = null;
  }

  // Stop any existing animation/timer
  if (currentAnimationTimer) clearTimeout(currentAnimationTimer);
  if (resetAnimation) resetAnimation.pause();

  return new Promise((resolve) => {
    pendingResolve = resolve;

    // Safety timeout to ensure promise resolves even if animation hangs
    currentAnimationTimer = setTimeout(() => {
      if (interactionLocked) {
        setInteractionLocked(false);
      }
      if (pendingResolve) {
        pendingResolve();
        pendingResolve = null;
      }
      currentAnimationTimer = null;
    }, duration + 200);

    if (window.anime) {
        setInteractionLocked(true);

        const targets = { 
            offsetX: viewportState.offsetX, 
            offsetY: viewportState.offsetY,
            scale: zoomState.scale
        };

        resetAnimation = window.anime({
            targets: targets,
            offsetX: targetState.offsetX,
            offsetY: targetState.offsetY,
            scale: targetState.scale,
            duration: duration,
            easing: 'easeOutExpo',
            update: () => {
                viewportState.offsetX = targets.offsetX;
                viewportState.offsetY = targets.offsetY;
                zoomState.scale = targets.scale;
                applyZoomTransform(true);
                updateZoomIndicator();
            },
            complete: () => {
                if (currentAnimationTimer) {
                    clearTimeout(currentAnimationTimer);
                    currentAnimationTimer = null;
                }
                resetAnimation = null;
                setInteractionLocked(false);
                viewportState.offsetX = targetState.offsetX;
                viewportState.offsetY = targetState.offsetY;
                zoomState.scale = targetState.scale;
                applyZoomTransform(true);
                updateZoomIndicator();
                
                if (pendingResolve) {
                    pendingResolve();
                    pendingResolve = null;
                }
            }
        });
    } else {
        if (currentAnimationTimer) {
             clearTimeout(currentAnimationTimer);
             currentAnimationTimer = null;
        }
        viewportState.offsetX = targetState.offsetX;
        viewportState.offsetY = targetState.offsetY;
        zoomState.scale = targetState.scale;
        applyZoomTransform();
        updateZoomIndicator();
        
        if (pendingResolve) {
            pendingResolve();
            pendingResolve = null;
        }
    }
  });
}

export function initZoomController(domElements, forceRedraw) {
  elements = { ...elements, ...domElements };
  requiresStickerForceRedraw = forceRedraw;
  
  interactionElement = elements.interactionTarget || elements.wallStage;

  if (!elements.wallStage || !elements.wallWrapper || !interactionElement) {
    return;
  }
  applyZoomTransform();
  updateZoomIndicator();
  interactionElement.addEventListener("wheel", handleStageWheel, { passive: false });
  interactionElement.addEventListener("pointerdown", handleStagePointerDown);
  interactionElement.addEventListener("pointermove", handleStagePointerMove);
  interactionElement.addEventListener("pointerup", handleStagePointerUp);
  interactionElement.addEventListener("pointercancel", handleStagePointerUp);
  if (elements.zoomSlider) {
    const sliderMin = zoomState.minScale * 100;
    const sliderMax = zoomState.maxScale * 100;
    elements.zoomSlider.min = String(sliderMin);
    elements.zoomSlider.max = String(sliderMax);
    elements.zoomSlider.value = String(zoomState.scale * 100);
    elements.zoomSlider.step = "1";
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

export function panToPoint(svgX, svgY, viewBox, minScale = null, onComplete = null, options = {}) {
  if (!elements.wallSvg || !viewBox) return;
  
  // Allow panning if we are merely interrupting our own existing auto-pan (resetAnimation)
  // Otherwise, respect external interaction locks (like manual drag)
  if (interactionLocked && !resetAnimation) return;
  
  // Calculate center of viewBox
  const centerX = viewBox.x + viewBox.width / 2;
  const centerY = viewBox.y + viewBox.height / 2;
  
  // Calculate delta in SVG units
  const deltaX = svgX - centerX;
  const deltaY = svgY - centerY;
  
  // Calculate scale factor (pixels per SVG unit)
  const rect = elements.wallSvg.getBoundingClientRect();
  const currentScale = zoomState.scale;

  // Determine target scale
  let targetScale = currentScale;
  if (minScale !== null && targetScale < minScale) {
    targetScale = minScale;
  }
  
  // The rendered width/height at scale 1 (approximate)
  const baseWidth = rect.width / currentScale;
  const baseHeight = rect.height / currentScale;
  
  // Determine the actual rendering scale (handling preserveAspectRatio mismatch)
  // If the element aspect ratio doesn't match viewBox, the content is letterboxed.
  // We need the scale factor of the content, not the container.
  const elementRatio = baseWidth / baseHeight;
  const viewBoxRatio = viewBox.width / viewBox.height;
  
  let pixelsPerUnit;
  // Allow a small epsilon for floating point comparison
  if (elementRatio > viewBoxRatio + 0.001) {
      // Element is wider than content (constrained by height)
      pixelsPerUnit = baseHeight / viewBox.height;
  } else {
      // Element is taller or equal (constrained by width)
      pixelsPerUnit = baseWidth / viewBox.width;
  }
  
  // Calculate required offset to center the point
  // We move the element by -delta * scale * zoomScale
  const targetOffsetX = -deltaX * pixelsPerUnit * targetScale;
  const targetOffsetY = -deltaY * pixelsPerUnit * targetScale;
  
  // Animate to it
  if (window.anime) {
      if (resetAnimation) resetAnimation.pause();
      
      setInteractionLocked(true);

      const targets = { 
          offsetX: viewportState.offsetX, 
          offsetY: viewportState.offsetY,
          scale: zoomState.scale
      };

      resetAnimation = window.anime({
          targets: targets,
          offsetX: targetOffsetX,
          offsetY: targetOffsetY,
          scale: targetScale,
          duration: options.duration || 500,
          easing: options.easing || 'easeOutQuart',
          update: () => {
              viewportState.offsetX = targets.offsetX;
              viewportState.offsetY = targets.offsetY;
              zoomState.scale = targets.scale;
              applyZoomTransform(true);
              updateZoomIndicator();
          },
          complete: () => {
              resetAnimation = null;
              setInteractionLocked(false);
              viewportState.offsetX = targetOffsetX;
              viewportState.offsetY = targetOffsetY;
              zoomState.scale = targetScale;
              applyZoomTransform(true);
              updateZoomIndicator();
              if (onComplete) onComplete();
          }
      });
  } else {
      viewportState.offsetX = targetOffsetX;
      viewportState.offsetY = targetOffsetY;
      zoomState.scale = targetScale;
      applyZoomTransform();
      updateZoomIndicator();
      if (onComplete) onComplete();
  }
}

function handleStageWheel(event) {
  if (!elements.wallStage || interactionLocked) {
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
  if (!isZoomTarget(event) || interactionLocked) {
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
  if (interactionLocked) return;
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
    if (panState.moved && typeof interactionElement?.setPointerCapture === "function") {
      try {
        interactionElement.setPointerCapture(event.pointerId);
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
  if (typeof interactionElement?.releasePointerCapture === "function") {
    try {
      interactionElement.releasePointerCapture(pointerId);
    } catch {
      // ignore
    }
  }
}

function resetZoomView() {
  if (interactionLocked) return;

  panState.pointerId = null;
  panState.moved = false;
  panState.pointers.clear();
  panState.pinchStartDistance = 0;

  if (window.anime) {
    if (resetAnimation) resetAnimation.pause();
    
    setInteractionLocked(true);

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
        setInteractionLocked(false);
        zoomState.scale = 1;
        viewportState.offsetX = 0;
        viewportState.offsetY = 0;
        applyZoomTransform(false);
        updateZoomIndicator();
        // Trigger refresh if callback provided
        if (typeof elements.onZoomReset === 'function') {
            elements.onZoomReset();
        }
      }
    });
  } else {
    zoomState.scale = 1;
    viewportState.offsetX = 0;
    viewportState.offsetY = 0;
    applyZoomTransform();
    updateZoomIndicator();
    if (typeof elements.onZoomReset === 'function') {
        elements.onZoomReset();
    }
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
  const transform = `translate(${viewportState.offsetX}px, ${viewportState.offsetY}px) scale(${zoomState.scale})`;
  elements.wallSvg.style.transformOrigin = "center";
  elements.wallSvg.style.transform = transform;

  if (elements.effectsSvg) {
    elements.effectsSvg.style.transformOrigin = "center";
    elements.effectsSvg.style.transform = transform;
  }

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
    // Show as multiplier (e.g. 1.0x) instead of percentage to save space
    const multiplier = zoomState.scale.toFixed(1);
    elements.zoomIndicator.textContent = `${multiplier}x`;
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
