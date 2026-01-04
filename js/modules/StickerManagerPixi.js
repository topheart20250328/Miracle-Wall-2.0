
import { supabase, isSupabaseConfigured } from "../supabase-config.js";
import * as EffectsManager from "./EffectsManager.js";
import * as AudioManager from "./AudioManager.js";

console.log("🚀 [Pixi] Module Loaded");

let app = null;
let mainContainer = null;
let backgroundContainer = null;
let effectsContainer = null;
let globalState = {};
let globalViewBox = {};
let stickersChannel = null;
let reviewSettingsChannel = null;
const spriteMap = new Map(); // Map ID -> Sprite

// Mock other exports to satisfy app.js imports
export function resetStickerScale() {}

export function attachDragHighlight(node, type) {
  if (node && node._pixiSprite) {
    if (type === 'valid') {
      node._pixiSprite.tint = 0xFFFFFF; // Normal
      node._pixiSprite.alpha = 1;
    } else if (type === 'invalid') {
      node._pixiSprite.tint = 0xFF0000; // Red warning
      node._pixiSprite.alpha = 0.5;
    }
  }
}

export function removeDragHighlight(node) {
  if (node && node._pixiSprite) {
    node._pixiSprite.tint = 0xFFFFFF;
    node._pixiSprite.alpha = 1;
  }
}

export function setStickerSearchState(id, state) {
  const sprite = spriteMap.get(id);
  if (!sprite) return;

  switch (state) {
    case 'highlight':
      sprite.alpha = 1;
      sprite.tint = 0xFFFFFF;
      sprite.zIndex = 100; // Bring to front (requires sortableChildren = true on container)
      break;
    case 'dimmed':
      sprite.alpha = 0.1;
      sprite.tint = 0x888888;
      sprite.zIndex = 0;
      break;
    case 'normal':
    default:
      sprite.alpha = 1;
      sprite.tint = 0xFFFFFF;
      sprite.zIndex = 0;
      break;
  }
}

export function handleStickerActivation(id) {
  // This is called by keyboard events in app.js and MarqueeController
  const record = globalState.stickers.get(id);
  if (!record) return;

  // Check permissions (consistency with SVG version)
  if (!record.isApproved && !record.canViewNote) {
    if (managerCallbacks.triggerPendingReviewFeedback) {
      managerCallbacks.triggerPendingReviewFeedback(record);
    }
    return;
  }

  if (managerCallbacks.openStickerModal) {
    managerCallbacks.openStickerModal(id);
  }
}

export function createStickerNode(id, x, y, isPending = false) {
  // 1. Create a Dummy SVG Node (to satisfy app.js logic)
  const svgNS = "http://www.w3.org/2000/svg";
  const group = document.createElementNS(svgNS, "g");
  group.classList.add("sticker-node");
  if (isPending) group.classList.add("pending");
  group.dataset.id = id;
  
  // Add a dummy use element so app.js selectors work
  const use = document.createElementNS(svgNS, "use");
  group.appendChild(use);

  // 2. Create the Pixi Sprite
  const texture = createHeartTexture();
  const sprite = new PIXI.Sprite(texture);
  sprite.anchor.set(0.5);
  sprite.width = 36;
  sprite.height = 36;
  sprite.x = x;
  sprite.y = y;
  
  if (isPending) {
    sprite.alpha = 0; // Hide initially (ghost mode) so it doesn't appear on wall until saved
  }

  mainContainer.addChild(sprite);

  // 3. Link them: Monkey-patch .remove() to clean up Pixi sprite
  const originalRemove = group.remove.bind(group);
  group.remove = () => {
    if (sprite.parent) {
      sprite.parent.removeChild(sprite);
    }
    if (!sprite.destroyed) {
      sprite.destroy();
    }
    originalRemove();
  };

  // Store reference for position updates
  group._pixiSprite = sprite;
  sprite._stickerId = id; // Attach ID to sprite for hit testing
  spriteMap.set(id, sprite); // Store in map

  return group;
} 

export function positionStickerNode(node, x, y) {
  // 1. Update Pixi Sprite
  if (node && node._pixiSprite) {
    node._pixiSprite.x = x;
    node._pixiSprite.y = y;
  }

  // 2. Update Dummy DOM Node (Crucial for getBoundingClientRect used in animations)
  // We need to update the <use> element inside the group
  if (node) {
    const useEl = node.querySelector("use") ?? node.firstElementChild;
    if (useEl) {
      // SVG positioning is usually top-left of the element, but our x,y is center
      // In StickerManager.js: const centerX = x - STICKER_RADIUS;
      const STICKER_RADIUS = 18; // 36/2
      const centerX = x - STICKER_RADIUS;
      const centerY = y - STICKER_RADIUS;
      
      useEl.setAttribute("x", centerX);
      useEl.setAttribute("y", centerY);
      useEl.setAttribute("width", "36");
      useEl.setAttribute("height", "36");
    }
  }
}

export function updateStickerReviewState() {}

export async function loadReviewSettings() {
  const { data, error } = await supabase
    .from("wall_review_settings")
    .select("*")
    .single();
    
  if (data) {
      Object.assign(globalReviewSettings, data);
      return data;
  }
  return {};
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
          Object.assign(globalReviewSettings, payload.new);
          if (managerCallbacks.updateMarqueePool) {
            managerCallbacks.updateMarqueePool(globalState.stickers, globalReviewSettings);
          }
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
  console.log("🚀 [Pixi] Subscribing to Stickers...");
  stickersChannel = supabase
    .channel("public:wall_stickers")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "wall_stickers" },
      (payload) => {
        const record = payload.new;
        if (!record || globalState.stickers.has(record.id)) {
             // console.log("🚀 [Pixi] Skipping duplicate/local insert:", record?.id);
             return;
        }

        console.log("🚀 [Pixi] Realtime Insert:", record.id);

        // Add new sticker
        const x = record.x_norm * globalViewBox.width;
        const y = record.y_norm * globalViewBox.height;
        
        // Create Node & Sprite
        const node = createStickerNode(record.id, x, y, false);

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
        
        // Visuals: Pop Animation
        const sprite = spriteMap.get(record.id);
        if (sprite) {
            const targetScale = sprite.scale.x; // Capture correct scale (approx 0.28)
            sprite.scale.set(0);
            if (window.anime) {
                window.anime({
                    targets: sprite.scale,
                    x: targetScale,
                    y: targetScale,
                    duration: 800,
                    easing: 'easeOutElastic(1, .5)'
                });
            } else {
                sprite.scale.set(targetScale);
            }
        }

        // Only play impact effect if NOT the owner (owner sees it immediately upon save)
        if (!isOwner) {
          EffectsManager.playStarBurst(x, y);
          AudioManager.playStickerImpact();
        }

        if (managerCallbacks.updateFireIntensity) {
            managerCallbacks.updateFireIntensity(globalState.stickers);
        }
        if (managerCallbacks.updateMarqueePool) {
            managerCallbacks.updateMarqueePool(globalState.stickers, globalReviewSettings);
        }
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
        
        if (managerCallbacks.updateMarqueePool) {
            managerCallbacks.updateMarqueePool(globalState.stickers, globalReviewSettings);
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "wall_stickers" },
      (payload) => {
        const id = payload.old.id;
        const existing = globalState.stickers.get(id);
        if (existing) {
          if (existing.node) existing.node.remove(); // This removes sprite too via monkey-patch
          globalState.stickers.delete(id);
          
          if (managerCallbacks.updateFireIntensity) {
            managerCallbacks.updateFireIntensity(globalState.stickers);
          }
          if (managerCallbacks.updateMarqueePool) {
            managerCallbacks.updateMarqueePool(globalState.stickers, globalReviewSettings);
          }
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

let managerCallbacks = {}; // Store callbacks globally in module
let globalReviewSettings = {}; // Store review settings

export function initStickerManager(domElements, state, viewBox, reviewSettings, callbacks) {
  console.log("🚀 [Pixi] initStickerManager called");
  
  globalState = state;
  globalViewBox = viewBox;
  globalReviewSettings = reviewSettings;
  managerCallbacks = callbacks; // Save callbacks

  // 1. Hide SVG Layer (Use opacity instead of display:none to keep DOM active for calculations)
  if (domElements.stickersLayer) {
    console.log("🚀 [Pixi] Hiding SVG Stickers Layer");
    // domElements.stickersLayer.style.display = "none"; // Removed to allow getBoundingClientRect
    domElements.stickersLayer.style.opacity = "0"; 
    domElements.stickersLayer.style.pointerEvents = "none";
    // domElements.stickersLayer.style.visibility = "hidden"; // Removed
  } else {
    console.error("❌ [Pixi] stickersLayer not found in domElements");
  }

  // 2. Create Pixi Application
  // We use the same dimensions as the wall
  app = new PIXI.Application({
    resizeTo: window, // Automatically handles resizing
    backgroundAlpha: 0,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    antialias: true,
  });

  // 3. Append Canvas
  const wallStage = document.getElementById("wallStage");
  if (wallStage) {
    app.view.id = "pixiCanvas";
    app.view.style.position = "fixed"; 
    app.view.style.top = "0";
    app.view.style.left = "0";
    app.view.style.width = "100vw";
    app.view.style.height = "100vh";
    app.view.style.pointerEvents = "none"; 
    app.view.style.zIndex = "50"; // Above wallWrapper (20), below UI (1400+)
    wallStage.appendChild(app.view);
  }

  // Create Layers
  backgroundContainer = new PIXI.Container(); // For Ambient Glow / Fire
  app.stage.addChild(backgroundContainer);

  mainContainer = new PIXI.Container(); // For Stickers
  mainContainer.sortableChildren = true; // Enable z-index sorting
  app.stage.addChild(mainContainer);

  effectsContainer = new PIXI.Container(); // For Bursts / Halos
  app.stage.addChild(effectsContainer);

  // Pass Pixi Context to EffectsManager
  EffectsManager.setPixiContext(app, backgroundContainer, effectsContainer);

  // 4. Sync Loop (Robust Coordinate System using getScreenCTM)
  app.ticker.add(() => {
    const wallSvg = document.getElementById("wallSvg");
    if (wallSvg) {
      // getScreenCTM maps SVG User Units (0..3500) to Screen Pixels
      const ctm = wallSvg.getScreenCTM();
      
      if (ctm) {
        const matrix = new PIXI.Matrix(ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f);
        mainContainer.transform.setFromMatrix(matrix);
        backgroundContainer.transform.setFromMatrix(matrix);
        effectsContainer.transform.setFromMatrix(matrix);

        // --- Culling Optimization ---
        // Only render stickers that are within the viewport
        // Transform screen bounds to world bounds
        // We use a buffer to prevent popping
        const buffer = 100;
        const screenLeft = -buffer;
        const screenTop = -buffer;
        const screenRight = window.innerWidth + buffer;
        const screenBottom = window.innerHeight + buffer;

        // Invert matrix to map screen -> world
        // Simple inversion for scale/translate (rotation is 0)
        // WorldX = (ScreenX - tx) / scale
        const scale = ctm.a; // Assuming uniform scale and no rotation
        const tx = ctm.e;
        const ty = ctm.f;

        const worldLeft = (screenLeft - tx) / scale;
        const worldTop = (screenTop - ty) / scale;
        const worldRight = (screenRight - tx) / scale;
        const worldBottom = (screenBottom - ty) / scale;

        // Iterate stickers
        const children = mainContainer.children;
        for (let i = 0; i < children.length; i++) {
            const sprite = children[i];
            // Simple AABB check
            // Sprite x,y is center. Radius ~18.
            const r = 20;
            const visible = (
                sprite.x + r > worldLeft &&
                sprite.x - r < worldRight &&
                sprite.y + r > worldTop &&
                sprite.y - r < worldBottom
            );
            
            // Only toggle if changed to avoid thrashing (though Pixi handles this well)
            // Note: We use renderable instead of visible so logic that relies on 'visible' for other states (like hidden/flight) isn't messed up?
            // Actually, earlier code uses 'visible' for flight.
            // Let's use 'renderable'. Pixi skips rendering but keeps update logic.
            // But for max perf, we want to skip update logic too if possible.
            // However, our custom hit test checks 'visible'.
            // If we use renderable, hit test still works? No, hit test iterates children.
            // Let's use a custom flag or just renderable.
            sprite.renderable = visible;
        }
      }
    }
  });

  // 5. Custom Hit Testing (Bridge for Click Events)
  // Since app.view has pointer-events: none (to allow background clicks),
  // we must intercept clicks on the container and check if they hit a sprite.
  const wrapper = domElements.wallWrapper || document.getElementById("wallWrapper");
  if (wrapper) {
    wrapper.addEventListener("click", (e) => {
      // Only intercept if we are not in placement mode (unless we want to allow opening stickers while placing?)
      // Usually, if placing, we might want to drop. But let's prioritize existing stickers if clicked directly.
      
      // 1. Convert Screen to World
      const screenPoint = new PIXI.Point(e.clientX, e.clientY);
      const worldPoint = mainContainer.toLocal(screenPoint);
      
      // 2. Check Collision
      let hitId = null;
      
      // Iterate children in reverse order (top-most first)
      // This ensures we click the sticker that is visually on top
      const children = mainContainer.children;
      for (let i = children.length - 1; i >= 0; i--) {
        const sprite = children[i];
        if (!sprite.visible || sprite.alpha < 0.1) continue;
        
        // Check bounds (assuming circular stickers radius ~18)
        // Sprite anchor is 0.5, so x,y is center
        const dx = worldPoint.x - sprite.x;
        const dy = worldPoint.y - sprite.y;
        const radius = 20; // Slightly larger hit area
        
        if (dx * dx + dy * dy <= radius * radius) {
          // Found hit!
          if (sprite._stickerId) {
            hitId = sprite._stickerId;
            break; 
          }
        }
      }
      
      if (hitId) {
        console.log("🚀 [Pixi] Custom Hit Test: Clicked", hitId);
        e.stopPropagation(); // Stop app.js from handling this as a background click
        e.preventDefault();
        
        if (managerCallbacks.openStickerModal) {
          managerCallbacks.openStickerModal(hitId);
        }
      }
    }, { capture: true }); // Capture phase to run BEFORE app.js listeners
  }

  // 6. Start Subscriptions
  subscribeToReviewSettings();
  subscribeToStickers();
}

// Helper to create overlay for animation
function createStickerOverlay(rect) {
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  overlay.style.zIndex = "2000"; // Above everything
  overlay.style.pointerEvents = "none";
  overlay.style.transformOrigin = "center center";
  
  // Create SVG content
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  // Revert to standard viewBox to prevent scaling issues if symbol is defined differently
  // Assuming #heartSticker symbol is defined in a 0 0 128 128 space, this is correct.
  // But if the overlay div is huge, the SVG fills it.
  // The issue is likely that the overlay div itself is huge.
  svg.setAttribute("viewBox", "0 0 128 128");
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.display = "block";
  // Ensure aspect ratio is preserved to prevent stretching
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  
  const use = document.createElementNS(svgNS, "use");
  use.setAttribute("href", "#heartSticker");
  use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#heartSticker");
  
  svg.appendChild(use);
  overlay.appendChild(svg);
  document.body.appendChild(overlay);
  
  return overlay;
}

export function computeZoomTargetSize() {
  const width = window.innerWidth || 0;
  const height = window.innerHeight || 0;
  const viewportMin = Math.min(width, height);

  if (width <= 640) {
    const cardIdeal = width * 0.84;
    const cardWidth = Math.max(340, Math.min(cardIdeal, 440));
    const paddingPx = 57.6; 
    const dialogWidth = Math.min(520, width * 0.92);
    const maxAvailableWidth = dialogWidth - paddingPx;
    return Math.min(cardWidth, maxAvailableWidth);
  }

  if (!viewportMin) return 360;
  const ideal = viewportMin * 0.52;
  const minSize = 320;
  const maxSize = 440;
  return Math.max(minSize, Math.min(ideal, maxSize));
}

export function getPaletteTargetRect() {
  const palette = document.getElementById("paletteSticker");
  if (palette) {
    // Return the rect of the SVG inside the button, so the flying sticker matches the icon size
    const svg = palette.querySelector("svg");
    if (svg) {
      return svg.getBoundingClientRect();
    }
    return palette.getBoundingClientRect();
  }
  return null;
}

export function cleanupZoomOverlay() {
  if (globalState.zoomOverlay) {
    globalState.zoomOverlay.remove();
    globalState.zoomOverlay = null;
  }
}

export function setStickerInFlight(node, isInFlight, id = null) {
  // 1. Handle DOM Node (Dummy or Real)
  if (node && node.style) {
    node.style.opacity = isInFlight ? "0" : "";
    // Do NOT return here; we must also update the Pixi sprite
  }
  
  // 2. Handle Pixi Sprite
  let sprite = null;

  // Priority A: Direct attachment (New stickers / Dummy nodes)
  if (node && node._pixiSprite) {
    sprite = node._pixiSprite;
  } 
  // Priority B: Lookup by ID (Existing stickers)
  else {
    const targetId = id || (globalState.pending && globalState.pending.id);
    if (targetId) {
      sprite = spriteMap.get(targetId);
    }
  }

  if (sprite) {
    sprite.visible = !isInFlight;
    if (!isInFlight) {
      sprite.alpha = 1; // Ensure full opacity when landing
    }
  }
}

// Map to store sprites by ID for quick access
// const spriteMap = new Map(); // Moved to top level scope

export function animateStickerZoom(originNode, options) {
  return new Promise((resolve, reject) => {
    let startRect = options.sourceRect;
    
    // 1. Determine Start Rect
    if (!startRect) {
      if (originNode) {
        // Priority 1: Check for attached Pixi Sprite (most accurate for placement)
        if (originNode._pixiSprite) {
           const bounds = originNode._pixiSprite.getBounds();
           startRect = {
             left: bounds.x,
             top: bounds.y,
             width: bounds.width,
             height: bounds.height
           };
        } 
        // Priority 2: Check for <use> element (if DOM node)
        else if (originNode.querySelector) {
           const useEl = originNode.querySelector("use");
           if (useEl) {
             startRect = useEl.getBoundingClientRect();
           } else if (originNode.getBoundingClientRect) {
             startRect = originNode.getBoundingClientRect();
           }
        }
        // Priority 3: Standard DOM node
        else if (originNode.getBoundingClientRect) {
          startRect = originNode.getBoundingClientRect();
        }
      } 
      
      if (!startRect && globalState.pending && globalState.pending.id) {
        // Pixi Sprite lookup by ID
        const sprite = spriteMap.get(globalState.pending.id);
        if (sprite) {
          // Ensure visible for measurement (Pixi getBounds might return 0 if invisible)
          const wasVisible = sprite.visible;
          sprite.visible = true;
          
          const bounds = sprite.getBounds();
          startRect = {
            left: bounds.x,
            top: bounds.y,
            width: bounds.width,
            height: bounds.height
          };
          
          sprite.visible = wasVisible;
        }
      }
    }

    if (!startRect) {
      // Fallback to center if nothing found
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      startRect = { left: cx, top: cy, width: 0, height: 0 };
    }

    const targetRect = options.targetRect;
    
    // 2. Create Overlay
    const overlay = createStickerOverlay(startRect);
    globalState.zoomOverlay = overlay;

    // 3. Animate
    if (window.anime) {
      window.anime({
        targets: overlay,
        left: targetRect.left,
        top: targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
        duration: 500,
        easing: 'easeOutExpo',
        complete: () => {
          // Remove overlay immediately to prevent double-sticker artifact
          // The dialog (with flip card) will take over rendering
          overlay.remove();
          globalState.zoomOverlay = null;
          resolve();
        }
      });
    } else {
      // Fallback
      Object.assign(overlay.style, {
        left: `${targetRect.left}px`,
        top: `${targetRect.top}px`,
        width: `${targetRect.width}px`,
        height: `${targetRect.height}px`
      });
      overlay.remove();
      globalState.zoomOverlay = null;
      resolve();
    }
  });
}

export function animateStickerReturn(pending, result) {
  return new Promise((resolve) => {
    // 1. Determine Target Rect (Where to go back to)
    let targetRect = null;
    
    if (pending.isNew && result !== "saved") {
      targetRect = getPaletteTargetRect();
    } else {
      // Existing sticker or saved new sticker
      
      // Priority 1: Pixi Sprite (Source of Truth)
      let sprite = spriteMap.get(pending.id);
      if (!sprite && pending.node && pending.node._pixiSprite) {
        sprite = pending.node._pixiSprite;
      }

      if (sprite) {
        // Ensure visible for measurement (Pixi getBounds might return 0 if invisible)
        const wasVisible = sprite.visible;
        sprite.visible = true;
        
        const bounds = sprite.getBounds();
        targetRect = {
          left: bounds.x,
          top: bounds.y,
          width: bounds.width,
          height: bounds.height
        };
        
        sprite.visible = wasVisible;
      }

      // Priority 2: DOM Node (Fallback)
      if (!targetRect && pending.node && pending.node.getBoundingClientRect) {
         targetRect = pending.node.getBoundingClientRect();
      }
    }

    if (!targetRect) {
      finalizeReturnWithoutAnimation(pending.node, false);
      resolve();
      return;
    }

    // 2. Get Current Position (from Dialog)
    // We assume the overlay is already cleaned up, so we might need to recreate it
    // or use the dialog's position.
    // Actually, app.js logic implies we animate FROM the dialog TO the wall.
    
    // Let's compute where the dialog card is
    let startRect = null;
    const card = document.querySelector(".flip-card");
    if (card) {
      startRect = card.getBoundingClientRect();
    }
    
    if (!startRect) {
       finalizeReturnWithoutAnimation(pending.node, false);
       resolve();
       return;
    }

    // 3. Create Overlay
    // Ensure startRect is valid and not zero-sized
    if (startRect.width === 0 || startRect.height === 0) {
        startRect = { ...startRect, width: 300, height: 300 }; // Fallback size
    }
    const overlay = createStickerOverlay(startRect);
    
    // 4. Animate
    if (window.anime) {
      window.anime({
        targets: overlay,
        left: targetRect.left,
        top: targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
        duration: 500,
        easing: 'easeOutExpo',
        complete: () => {
          // 1. Show the sprite first
          finalizeReturnWithoutAnimation(pending.node, pending.isNew && result !== "saved", pending.id);
          
          // 2. Trigger Effect if saved
          // Check _wasNew because saveSticker sets isNew to false before we get here
          if ((pending.isNew || pending._wasNew) && result === "saved") {
             console.log("🚀 [Pixi] Triggering Star Burst at", pending.x, pending.y);
             if (Number.isFinite(pending.x) && Number.isFinite(pending.y)) {
                 EffectsManager.playStarBurst(pending.x, pending.y);
             }
             delete pending._wasNew;
          }

          // 3. Remove overlay in next frame to prevent flicker
          requestAnimationFrame(() => {
              overlay.remove();
              resolve();
          });
        }
      });
    } else {
      finalizeReturnWithoutAnimation(pending.node, pending.isNew && result !== "saved", pending.id);
      overlay.remove();
      resolve();
    }
  });
}

export function finalizeReturnWithoutAnimation(node, returnToPalette, id = null) {
  // Show the sprite/node again
  setStickerInFlight(node, false, id);
  
  if (returnToPalette && node && node.remove) {
    node.remove();
  }
}

// Helper to create texture from SVG path
let _cachedHeartTexture = null;
function createHeartTexture() {
  if (_cachedHeartTexture) return _cachedHeartTexture;

  const symbol = document.getElementById("heartSticker");
  if (!symbol) {
    console.warn("⚠️ [Pixi] #heartSticker symbol not found, using fallback.");
    return PIXI.Texture.WHITE;
  }

  const viewBox = symbol.getAttribute("viewBox") || "0 0 2000 2000";
  // Use innerHTML to get the paths
  const content = symbol.innerHTML;
  
  // Construct a valid SVG string
  // We set width/height to 128 to ensure high-quality rasterization (retina ready for 36px display)
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="128" height="128">${content}</svg>`;
  
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  
  _cachedHeartTexture = PIXI.Texture.from(url);
  return _cachedHeartTexture;
}

export async function loadExistingStickers() {
  console.log("🚀 [Pixi] Loading Stickers...");
  console.log("🚀 [Pixi] Global ViewBox:", globalViewBox);
  
  if (!isSupabaseConfigured()) {
    console.warn("⚠️ [Pixi] Supabase not configured");
    return;
  }

  const { data, error } = await supabase
    .from("wall_stickers")
    .select("id, x_norm, y_norm, note, is_approved, created_at, updated_at, device_id")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("❌ [Pixi] Supabase Error:", error);
    return;
  }

  console.log(`🚀 [Pixi] Fetched ${data.length} stickers from DB`);

  const texture = createHeartTexture();
  const requireApproval = globalReviewSettings.requireStickerApproval;
  const deviceId = globalState.deviceId; // Ensure app.js sets this in state

  // Create Sprites & Populate Global State
  data.forEach((record, index) => {
    const x = record.x_norm * globalViewBox.width;
    const y = record.y_norm * globalViewBox.height;

    // --- 1. Populate Global State (Crucial for Search/Marquee/Click) ---
    const isOwner = record.device_id && deviceId && record.device_id === deviceId;
    const canViewNote = !requireApproval || record.is_approved || isOwner;

    const stickerRecord = {
      id: record.id,
      x,
      y,
      xNorm: record.x_norm,
      yNorm: record.y_norm,
      note: record.note ?? "",
      // node: null, // We don't have a real DOM node for existing stickers in Pixi mode, or we could create dummy ones?
      // app.js expects 'node' for some operations. If we leave it null, some things might break.
      // But creating thousands of dummy nodes defeats the purpose of Pixi.
      // Let's see if we can get away with null or a proxy.
      created_at: record.created_at,
      updated_at: record.updated_at,
      deviceId: record.device_id ?? null,
      isApproved: Boolean(record.is_approved),
      canViewNote: canViewNote,
    };
    
    globalState.stickers.set(record.id, stickerRecord);
    // -------------------------------------------------------------------

    if (index < 5) {
       console.log(`🚀 [Pixi] Sticker ${index}: x=${x}, y=${y} (norm: ${record.x_norm}, ${record.y_norm})`);
    }

    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.width = 36;
    sprite.height = 36;
    sprite.x = x;
    sprite.y = y;
    sprite._stickerId = record.id; // Attach ID for hit testing
    
    // Interaction
    sprite.eventMode = 'static';
    sprite.cursor = 'pointer';
    sprite.on('pointertap', () => {
      console.log("🚀 [Pixi] Sticker Clicked:", record.id);
      if (managerCallbacks.openStickerModal) {
        // app.js expects the ID string, not the record object
        managerCallbacks.openStickerModal(record.id);
      }
    });

    mainContainer.addChild(sprite);
    spriteMap.set(record.id, sprite); // Store in map
  });
  
  // Update App Logic
  if (managerCallbacks.updateMarqueePool) {
      managerCallbacks.updateMarqueePool(globalState.stickers, globalReviewSettings);
  }
  if (managerCallbacks.updateFireIntensity) {
      managerCallbacks.updateFireIntensity(globalState.stickers);
  }

  console.log(`🚀 [Pixi] Rendered ${data.length} stickers.`);
}

export async function saveSticker(pending, message) {
  console.log("🚀 [Pixi] saveSticker called", pending.id);
  
  const payload = {
    p_x_norm: pending.x / globalViewBox.width,
    p_y_norm: pending.y / globalViewBox.height,
    p_note: message,
    p_device_id: globalState.deviceId ?? null,
  };
  
  const { data, error } = await supabase.rpc("create_wall_sticker", payload);
  
  if (error) {
    console.error("❌ [Pixi] Save Error:", error);
    return { error };
  }
  
  const inserted = Array.isArray(data) ? data[0] : data;
  if (!inserted?.id) {
      return { error: { message: "Server returned no ID" } };
  }

  const oldId = pending.id;
  const newId = inserted.id;
  
  // 1. Update Pending Object
  pending.id = newId;
  if (pending.isNew) {
    pending._wasNew = true; // Mark as originally new for animation logic
  }
  pending.isNew = false;
  pending.note = message;
  pending.created_at = inserted.created_at;
  pending.updated_at = inserted.updated_at;
  pending.deviceId = inserted.device_id ?? globalState.deviceId;
  pending.isApproved = Boolean(inserted.is_approved);
  pending.canViewNote = true;

  // 2. Update Dummy DOM Node
  if (pending.node) {
    pending.node.dataset.id = newId;
    pending.node.classList.remove("pending");
  }

  // 3. Update Pixi Sprite
  const sprite = spriteMap.get(oldId);
  if (sprite) {
    spriteMap.delete(oldId);
    spriteMap.set(newId, sprite);
    
    // Don't make visible yet! Let animateStickerReturn -> setStickerInFlight handle it.
    // sprite.alpha = 1; 
    // sprite.visible = true;
    
    // Update interaction handler to use new ID
    sprite._stickerId = newId; // Update ID on sprite
    sprite.removeAllListeners();
    sprite.eventMode = 'static';
    sprite.cursor = 'pointer';
    sprite.on('pointertap', () => {
      console.log("🚀 [Pixi] Sticker Clicked:", newId);
      if (managerCallbacks.openStickerModal) {
        managerCallbacks.openStickerModal(newId);
      }
    });
  }

  // 4. Update Global State
  globalState.stickers.set(newId, pending);
  
  // 5. Trigger Callbacks
  if (managerCallbacks.updateFireIntensity) {
    managerCallbacks.updateFireIntensity(globalState.stickers);
  }
  if (managerCallbacks.updateMarqueePool) {
    managerCallbacks.updateMarqueePool(globalState.stickers, globalReviewSettings);
  }
  
  return { data: newId };
}

export async function updateSticker(pending, message) {
  console.log("🚀 [Pixi] updateSticker called", pending.id);
  
  const { error } = await supabase
    .from("wall_stickers")
    .update({
      note: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pending.id)
    .eq("device_id", globalState.deviceId);

  if (error) {
    console.error("❌ [Pixi] Update Error:", error);
    return { error };
  }
  
  pending.note = message;
  pending.updated_at = new Date().toISOString();
  
  // Re-calculate permissions
  const isOwner = !pending.deviceId || !globalState.deviceId || pending.deviceId === globalState.deviceId;
  const requireApproval = globalReviewSettings.requireStickerApproval;
  
  // Optimistic update for approval (assuming it doesn't change on edit unless logic dictates)
  // Ideally we should fetch fresh state, but for now let's keep it simple
  pending.canViewNote = !requireApproval || pending.isApproved || isOwner;
  
  if (managerCallbacks.updateMarqueePool) {
    managerCallbacks.updateMarqueePool(globalState.stickers, globalReviewSettings);
  }
  
  return { success: true };
}

export async function deleteSticker(pending) {
  console.log("🚀 [Pixi] deleteSticker called", pending.id);
  
  const { error } = await supabase
    .from("wall_stickers")
    .delete()
    .eq("id", pending.id)
    .eq("device_id", globalState.deviceId);

  if (error) {
    console.error("❌ [Pixi] Delete Error:", error);
    return { error };
  }
  
  // 1. Remove Dummy Node
  if (pending.node) {
    pending.node.remove(); // This triggers our monkey-patched remove which kills the sprite too
  } else {
    // If no node (existing sticker loaded from DB), manually remove sprite
    const sprite = spriteMap.get(pending.id);
    if (sprite) {
      sprite.parent.removeChild(sprite);
      sprite.destroy();
      spriteMap.delete(pending.id);
    }
  }
  
  // 2. Remove from Global State
  globalState.stickers.delete(pending.id);
  
  if (managerCallbacks.updateFireIntensity) {
    managerCallbacks.updateFireIntensity(globalState.stickers);
  }
  if (managerCallbacks.updateMarqueePool) {
    managerCallbacks.updateMarqueePool(globalState.stickers, globalReviewSettings);
  }
  
  return { success: true };
}

// --- Playback / Review Animation Helpers ---

export function setAllStickersVisibility(visible) {
  spriteMap.forEach(sprite => {
    sprite.visible = visible;
    sprite.alpha = visible ? 1 : 0;
  });
}

export function setStickerVisible(id, visible) {
  const sprite = spriteMap.get(id);
  if (sprite) {
    sprite.visible = visible;
    sprite.alpha = visible ? 1 : 0;
  }
}

export function animateStickerReveal(id) {
  const sprite = spriteMap.get(id);
  if (!sprite) return;

  sprite.visible = true;
  sprite.alpha = 1;
  
  // Capture the correct resting scale (calculated from width=36 / textureWidth)
  // If we just set scale to 1, it becomes huge (texture size 128x128)
  const targetScale = sprite.scale.x; 

  // Pop Animation
  const isMobile = window.innerWidth < 640;
  const popScale = targetScale * (isMobile ? 2.0 : 3.5);
  
  // Start large
  sprite.scale.set(popScale);
  
  if (window.anime) {
    window.anime({
      targets: sprite.scale,
      x: [popScale, targetScale],
      y: [popScale, targetScale],
      duration: 850,
      easing: "easeOutElastic(1, .5)"
    });
    
    window.anime({
        targets: sprite,
        alpha: [0, 1],
        duration: 200,
        easing: "easeOutQuad"
    });
  } else {
      sprite.scale.set(targetScale);
  }
}

