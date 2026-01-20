
import { ProjectileEffect } from "./effects/ProjectileEffect.js";
import { FireEffect } from "./effects/FireEffect.js";
import { AmbientGlowEffect } from "./effects/AmbientGlowEffect.js";
import { MistEffect } from "./effects/MistEffect.js";
import { BottomFireEffect } from "./effects/BottomFireEffect.js";
import { HolyFireEffect } from "./effects/HolyFireEffect.js";
import { ResonanceEffect } from "./effects/ResonanceEffect.js";
import { StickerRevealEffect } from "./effects/StickerRevealEffect.js";

const svgNS = "http://www.w3.org/2000/svg";
const STICKER_DIAMETER = 36;
const STICKER_RADIUS = STICKER_DIAMETER / 2;

// ambientState has been moved to AmbientGlowEffect.js

const fireState = {
  nodes: [],
  animation: null,
  intensity: 0, // 0 to 1
  active: false,
  paused: false,
};

// bottomFireState has been moved to BottomFireEffect.js


let elements = {
  effectsLayer: null,
  ambientLayer: null,
  stickersLayer: null,
};
let mediaPrefersReducedMotion = null;

// Pixi Context
let pixiApp = null;
let pixiBgLayer = null;
let pixiStaticLayer = null; // New: For untransformed background effects
let pixiEffectsLayer = null;

let projectileEffectInstance = null;
let fireEffectInstance = null;
let ambientGlowEffectInstance = null;
let mistEffectInstance = null;
let bottomFireEffectInstance = null;
let holyFireEffectInstance = null;
let resonanceEffectInstance = null;
let stickerRevealEffectInstance = null;

function getProjectileEffect() {
    if (!projectileEffectInstance) {
        projectileEffectInstance = new ProjectileEffect({
            svgLayer: elements.effectsLayer,
            pixiLayer: pixiEffectsLayer,
            pixiApp: pixiApp
        });
    } else {
        // Update context dynamically to handle engine switches or late init
        projectileEffectInstance.ctx.svgLayer = elements.effectsLayer;
        projectileEffectInstance.ctx.pixiLayer = pixiEffectsLayer;
        projectileEffectInstance.ctx.pixiApp = pixiApp;
    }
    return projectileEffectInstance;
}

function getFireEffect() {
    if (!fireEffectInstance) {
        fireEffectInstance = new FireEffect({
            elements: elements,
            pixiLayer: pixiBgLayer, // Use BG layer for fire
            pixiApp: pixiApp
        });
    } else {
        fireEffectInstance.ctx.elements = elements;
        fireEffectInstance.ctx.pixiLayer = pixiBgLayer;
        fireEffectInstance.ctx.pixiApp = pixiApp;
    }
    return fireEffectInstance;
}

function getAmbientGlowEffect() {
    if (!ambientGlowEffectInstance) {
        ambientGlowEffectInstance = new AmbientGlowEffect({
            elements: elements,
            pixiLayer: pixiBgLayer,
            pixiApp: pixiApp
        });
    } else {
        ambientGlowEffectInstance.ctx.elements = elements;
        ambientGlowEffectInstance.ctx.pixiLayer = pixiBgLayer;
        ambientGlowEffectInstance.ctx.pixiApp = pixiApp;
    }
    return ambientGlowEffectInstance;
}

function getStickerRevealEffect() {
    if (!stickerRevealEffectInstance) {
        stickerRevealEffectInstance = new StickerRevealEffect({
            pixiLayer: pixiEffectsLayer, // Draw on effects layer (top)
            pixiApp: pixiApp
        });
    } else {
        stickerRevealEffectInstance.ctx.pixiLayer = pixiEffectsLayer;
        stickerRevealEffectInstance.ctx.pixiApp = pixiApp;
    }
    return stickerRevealEffectInstance;
}

export function playStickerReveal(x, y, onImpactCallback) {
    const effect = getStickerRevealEffect();
    if (effect) {
        effect.play(x, y, onImpactCallback);
    }
}

function getMistEffect() {
    if (!mistEffectInstance) {
        mistEffectInstance = new MistEffect({
            fireState: fireState // Pass reference to fireState for intensity checking
        });
    }
    return mistEffectInstance;
}

function getBottomFireEffect() {
    if (!bottomFireEffectInstance) {
        bottomFireEffectInstance = new BottomFireEffect();
    }
    return bottomFireEffectInstance;
}

function getHolyFireEffect() {
    if (!holyFireEffectInstance) {
        holyFireEffectInstance = new HolyFireEffect();
    }
    return holyFireEffectInstance;
}

function getResonanceEffect() {
    if (!resonanceEffectInstance) {
        resonanceEffectInstance = new ResonanceEffect({
            getHolyFireEffect: getHolyFireEffect
        });
    }
    return resonanceEffectInstance;
}

export function setPixiContext(app, bgLayer, staticLayer, effectsLayer) {
  pixiApp = app;
  pixiBgLayer = bgLayer;
  pixiStaticLayer = staticLayer;
  
  // Robustly handle optional staticLayer if only 3 args were passed (legacy support)
  // If staticLayer looks like a container and effectsLayer is undefined, it might be a shift?
  // But strictly, we expect the caller (StickerManagerPixi) to pass 4 args.
  // If caller passes 3 args (app, bg, effects), then staticLayer is effects.
  if (effectsLayer === undefined && staticLayer) {
      pixiEffectsLayer = staticLayer; // Shift
      pixiStaticLayer = null;
  } else {
      pixiEffectsLayer = effectsLayer;
  }

  console.log("🚀 [EffectsManager] Pixi Context Set", { 
      hasApp: !!pixiApp, 
      hasBg: !!pixiBgLayer, 
      hasStatic: !!pixiStaticLayer, 
      hasEffects: !!pixiEffectsLayer 
  });
  
  // Re-init ambient/fire if they were waiting
  if (pixiBgLayer) {
      getAmbientGlowEffect().init();
      initFireEffect();
  }
}

export function initEffectsManager(domElements, reducedMotion) {
  elements = { ...elements, ...domElements };
  mediaPrefersReducedMotion = reducedMotion;

  if (mediaPrefersReducedMotion) {
    const handleMotionPreferenceChange = (event) => {
      if (event.matches) {
        getAmbientGlowEffect().destroy();
      } else {
        getAmbientGlowEffect().refresh(true);
      }
    };
    if (typeof mediaPrefersReducedMotion.addEventListener === "function") {
      mediaPrefersReducedMotion.addEventListener("change", handleMotionPreferenceChange);
    } else if (typeof mediaPrefersReducedMotion.addListener === "function") {
      mediaPrefersReducedMotion.addListener(handleMotionPreferenceChange);
    }
  }

  getAmbientGlowEffect().init();
  
  // Ensure main creates a stacking context for z-index layers
  const main = document.querySelector("main");
  if (main) main.style.isolation = "isolate";

  initFireEffect();
  getBottomFireEffect().init();
  
  getMistEffect().init();
  
  getHolyFireEffect().init();
  getResonanceEffect().init();
}

// Track active anime instances
const activeAnimeInstances = new Set();

// Helper to register anime instance
function registerAnime(instance) {
  if (instance && typeof instance.pause === 'function') {
    activeAnimeInstances.add(instance);
    // Auto-remove when finished (if possible, but anime.js doesn't have a simple 'onFinish' for all types easily accessible from outside without wrapping)
    // So we just rely on manual clearing or periodic cleanup if we were sophisticated.
    // For now, we just add them.
    if (instance.finished) {
        instance.finished.then(() => activeAnimeInstances.delete(instance));
    }
  }
  return instance;
}

export function clearAllEffects() {
  // 1. Stop all tracked anime instances
  activeAnimeInstances.forEach(instance => {
    try {
      instance.pause();
      // If it's a timeline, seek to end or just kill it?
      // pause is safer.
    } catch (e) { console.warn("Failed to pause anime", e); }
  });
  activeAnimeInstances.clear();

  // 2. Clear Pixi Effects
  if (pixiEffectsLayer) {
    // Destroy all children to ensure they are cleaned up from memory
    // We iterate backwards or use removeChildren() which is safer
    while (pixiEffectsLayer.children.length > 0) {
        const child = pixiEffectsLayer.children[0];
        child.destroy({ children: true }); // Deep destroy
    }
  }

  // 3. Clear SVG Effects
  if (elements.effectsLayer) {
    elements.effectsLayer.innerHTML = '';
  }
  
  // 4. Clear Projectile Beams (if any wrapper exists directly on svg)
  // (Projectiles usually append to effectsLayer, but let's be safe)
}

export function playProjectile(screenX, screenY, targetX, targetY, onComplete) {
  const effect = getProjectileEffect();
  effect.play(screenX, screenY, targetX, targetY, onComplete);
}

// ensureProjectileBeamGradient, playPixiProjectile and ensureProjectileGradient have been removed/refactored into ProjectileEffect.js

export function playPlacementPreviewEffect(x, y) {
  if (!elements.effectsLayer) {
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
  elements.effectsLayer.appendChild(group);

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

export function playPlacementImpactEffect(node) {
  if (pixiEffectsLayer && node) {
    const cx = Number(node.dataset.cx);
    const cy = Number(node.dataset.cy);
    if (Number.isFinite(cx) && Number.isFinite(cy)) {
        playPixiPlacementImpact(cx, cy);
        return;
    }
  }
  if (!elements.effectsLayer || !node) {
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

  elements.effectsLayer.appendChild(group);

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

export function playSimpleImpact(x, y) {
  if (!elements.effectsLayer) return;
  
  // Performance check: limit concurrent simple impacts
  // If too many nodes in effects layer, skip to save FPS
  if (elements.effectsLayer.childElementCount > 40) return;

  const circle = document.createElementNS(svgNS, "circle");
  circle.setAttribute("cx", x.toFixed(2));
  circle.setAttribute("cy", y.toFixed(2));
  circle.setAttribute("r", "0");
  circle.setAttribute("fill", "none");
  circle.setAttribute("stroke", "rgba(255, 255, 255, 0.8)");
  circle.setAttribute("stroke-width", "6");
  circle.style.pointerEvents = "none";
  circle.style.mixBlendMode = "screen";

  elements.effectsLayer.appendChild(circle);

  if (window.anime) {
    window.anime({
      targets: circle,
      r: [0, STICKER_DIAMETER * 1.5],
      opacity: [0.8, 0],
      strokeWidth: [6, 0],
      easing: "easeOutExpo",
      duration: 500,
      complete: () => {
        if (circle.isConnected) circle.remove();
      }
    });
  } else {
    // Fallback if anime not available
    setTimeout(() => { if (circle.isConnected) circle.remove(); }, 500);
  }
}

function ensureRevealGradient() {
  if (document.getElementById("revealGlowGradient")) return;
  if (!elements.effectsLayer) return;
  const svg = elements.effectsLayer.ownerSVGElement;
  if (!svg) return;

  let defs = svg.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS(svgNS, "defs");
    svg.insertBefore(defs, svg.firstChild);
  }

  const gradient = document.createElementNS(svgNS, "radialGradient");
  gradient.id = "revealGlowGradient";
  
  const stop1 = document.createElementNS(svgNS, "stop");
  stop1.setAttribute("offset", "0%");
  stop1.setAttribute("stop-color", "#ffffff");
  stop1.setAttribute("stop-opacity", "0.9");

  const stop2 = document.createElementNS(svgNS, "stop");
  stop2.setAttribute("offset", "40%");
  stop2.setAttribute("stop-color", "#ffffff");
  stop2.setAttribute("stop-opacity", "0.4");

  const stop3 = document.createElementNS(svgNS, "stop");
  stop3.setAttribute("offset", "100%");
  stop3.setAttribute("stop-color", "#ffffff");
  stop3.setAttribute("stop-opacity", "0");

  gradient.appendChild(stop1);
  gradient.appendChild(stop2);
  gradient.appendChild(stop3);
  defs.appendChild(gradient);
}

export function playRevealBurst(x, y) {
  if (pixiEffectsLayer) {
    playPixiRevealBurst(x, y);
    return;
  }
  if (!elements.effectsLayer) return;
  
  ensureRevealGradient();

  // Performance check
  if (elements.effectsLayer.childElementCount > 60) return;

  const group = document.createElementNS(svgNS, "g");
  group.style.pointerEvents = "none";
  group.style.mixBlendMode = "screen";
  
  // 1. Core white flash (filled circle)
  const core = document.createElementNS(svgNS, "circle");
  core.setAttribute("cx", x.toFixed(2));
  core.setAttribute("cy", y.toFixed(2));
  core.setAttribute("r", "0");
  core.setAttribute("fill", "#ffffff");
  core.setAttribute("opacity", "1");
  
  // 2. Outer diffuse glow (large circle with gradient)
  const glow = document.createElementNS(svgNS, "circle");
  glow.setAttribute("cx", x.toFixed(2));
  glow.setAttribute("cy", y.toFixed(2));
  glow.setAttribute("r", "0");
  // Use filter instead of gradient to avoid "black circle" issues if gradient fails
  glow.setAttribute("fill", "#ffffff");
  glow.setAttribute("filter", "url(#softGlowFilter)");
  glow.setAttribute("opacity", "0.6");
  
  // 3. Expanding Ring
  const ring = document.createElementNS(svgNS, "circle");
  ring.setAttribute("cx", x.toFixed(2));
  ring.setAttribute("cy", y.toFixed(2));
  ring.setAttribute("r", "0");
  ring.setAttribute("fill", "none");
  ring.setAttribute("stroke", "#ffffff");
  ring.setAttribute("stroke-width", "4");
  ring.setAttribute("opacity", "0.8");

  group.appendChild(glow);
  group.appendChild(core);
  group.appendChild(ring);
  elements.effectsLayer.appendChild(group);

  if (window.anime) {
    const timeline = window.anime.timeline({
      easing: "easeOutExpo",
      complete: () => {
        if (group.isConnected) group.remove();
      }
    });
    
    timeline
      .add({
        targets: core,
        r: [0, STICKER_DIAMETER * 1.5], // Expand to 1.5x sticker size
        opacity: [1, 0],
        duration: 500
      }, 0)
      .add({
        targets: glow,
        r: [0, STICKER_DIAMETER * 6], // Expand to 6x sticker size (Larger range)
        opacity: [1, 0],
        duration: 900 // Slower fade for larger area
      }, 0)
      .add({
        targets: ring,
        r: [0, STICKER_DIAMETER * 2.5],
        strokeWidth: [4, 0],
        opacity: [0.8, 0],
        duration: 600
      }, 0);
      
  } else {
    setTimeout(() => { if (group.isConnected) group.remove(); }, 900);
  }
}

export function playStarBurst(x, y) {
  if (pixiEffectsLayer) {
    playPixiStarBurst(x, y);
    return;
  }
  if (!elements.effectsLayer) return;
  
  // Performance check
  if (elements.effectsLayer.childElementCount > 60) return;

  const group = document.createElementNS(svgNS, "g");
  group.style.pointerEvents = "none";
  group.style.mixBlendMode = "screen"; // Make it glowy
  
  // 1. Central Core (Bright White)
  const core = document.createElementNS(svgNS, "circle");
  core.setAttribute("cx", x.toFixed(2));
  core.setAttribute("cy", y.toFixed(2));
  core.setAttribute("r", "0");
  core.setAttribute("fill", "#ffffff");
  
  // 2. Star Rays (Cross shape or 4-point star)
  const star = document.createElementNS(svgNS, "path");
  // A 4-point star path centered at 0,0 (will translate)
  const size = STICKER_DIAMETER * 4; 
  const pathData = `M 0 -${size} Q 0 0 ${size} 0 Q 0 0 0 ${size} Q 0 0 -${size} 0 Q 0 0 0 -${size} Z`;
  
  star.setAttribute("d", pathData);
  star.setAttribute("fill", "#fffbe6"); // Warm white
  star.setAttribute("transform", `translate(${x}, ${y}) scale(0)`);
  star.setAttribute("opacity", "0.9");

  // 3. Secondary Star (Rotated 45 degrees for 8-point effect)
  const star2 = document.createElementNS(svgNS, "path");
  const size2 = STICKER_DIAMETER * 2.5;
  const pathData2 = `M 0 -${size2} Q 0 0 ${size2} 0 Q 0 0 0 ${size2} Q 0 0 -${size2} 0 Q 0 0 0 -${size2} Z`;
  
  star2.setAttribute("d", pathData2);
  star2.setAttribute("fill", "#ffe4b5"); // Goldish
  star2.setAttribute("transform", `translate(${x}, ${y}) rotate(45) scale(0)`);
  star2.setAttribute("opacity", "0.7");

  // 4. Outer Glow Ring
  const ring = document.createElementNS(svgNS, "circle");
  ring.setAttribute("cx", x.toFixed(2));
  ring.setAttribute("cy", y.toFixed(2));
  ring.setAttribute("r", "0");
  ring.setAttribute("fill", "none");
  ring.setAttribute("stroke", "#ffd700"); // Gold stroke
  ring.setAttribute("stroke-width", "2");
  ring.setAttribute("opacity", "0.6");

  group.appendChild(star2);
  group.appendChild(star);
  group.appendChild(ring);
  group.appendChild(core);
  
  elements.effectsLayer.appendChild(group);

  if (window.anime) {
    const timeline = window.anime.timeline({
      easing: "easeOutExpo",
      complete: () => {
        if (group.isConnected) group.remove();
      }
    });
    
    timeline
      .add({
        targets: core,
        r: [0, STICKER_DIAMETER], 
        opacity: [1, 0],
        duration: 600
      }, 0)
      .add({
        targets: [star, star2],
        transform: (el, i) => {
            const scale = i === 0 ? 1 : 1; // Scale to full size defined in path
            const rotate = i === 0 ? 0 : 45;
            return `translate(${x}, ${y}) rotate(${rotate}) scale(${scale})`;
        },
        opacity: [1, 0],
        duration: 800,
        easing: "easeOutQuart"
      }, 0)
      .add({
        targets: ring,
        r: [0, STICKER_DIAMETER * 3],
        strokeWidth: [3, 0],
        opacity: [0.8, 0],
        duration: 1000
      }, 0);
      
  } else {
    setTimeout(() => { if (group.isConnected) group.remove(); }, 1000);
  }
}

export function stopFocusHalo() {
  if (pixiEffectsLayer) {
    // Find and remove Pixi halo containers
    // We can identify them if we stored them, or just clear children if we know they are the only ones.
    // But pixiEffectsLayer might have other things (shimmer?).
    // Let's assume we can tag them or just iterate.
    // Since playPixiFocusHalo creates a container, let's tag it.
    for (let i = pixiEffectsLayer.children.length - 1; i >= 0; i--) {
      const child = pixiEffectsLayer.children[i];
      if (child.name === 'focusHalo') {
        child.destroy({ children: true });
      }
    }
  }
  if (!elements.effectsLayer) return;
  const existing = elements.effectsLayer.querySelectorAll(".effect-focus-halo");
  existing.forEach(el => el.remove());
}

export function playFocusHalo(x, y) {
  // Clear previous focus halos to prevent stacking
  stopFocusHalo();

  if (pixiEffectsLayer) {
    playPixiFocusHalo(x, y);
    return;
  }
  if (!elements.effectsLayer) return;

  ensureRevealGradient();

  // Performance check
  if (elements.effectsLayer.childElementCount > 60) return;

  const group = document.createElementNS(svgNS, "g");
  group.classList.add("effect-focus-halo");
  group.style.pointerEvents = "none";
  group.style.mixBlendMode = "screen";
  
  // 1. Strong white core glow (using reveal gradient for soft edges)
  const glow = document.createElementNS(svgNS, "circle");
  glow.setAttribute("cx", x.toFixed(2));
  glow.setAttribute("cy", y.toFixed(2));
  glow.setAttribute("r", "0");
  glow.setAttribute("fill", "url(#revealGlowGradient)");
  glow.setAttribute("opacity", "0.9");
  
  // 2. Sharp white ring
  const ring = document.createElementNS(svgNS, "circle");
  ring.setAttribute("cx", x.toFixed(2));
  ring.setAttribute("cy", y.toFixed(2));
  ring.setAttribute("r", (STICKER_DIAMETER * 0.8).toFixed(2));
  ring.setAttribute("fill", "none");
  ring.setAttribute("stroke", "#ffffff");
  ring.setAttribute("stroke-width", "4");
  ring.setAttribute("opacity", "0");

  // 3. Secondary outer ripple
  const ripple = document.createElementNS(svgNS, "circle");
  ripple.setAttribute("cx", x.toFixed(2));
  ripple.setAttribute("cy", y.toFixed(2));
  ripple.setAttribute("r", (STICKER_DIAMETER * 1.2).toFixed(2));
  ripple.setAttribute("fill", "none");
  ripple.setAttribute("stroke", "#ffffff");
  ripple.setAttribute("stroke-width", "2");
  ripple.setAttribute("opacity", "0");

  group.appendChild(glow);
  group.appendChild(ring);
  group.appendChild(ripple);
  elements.effectsLayer.appendChild(group);

  if (window.anime) {
    const timeline = window.anime.timeline({
      easing: "easeOutExpo",
      loop: 4,
      complete: () => {
        if (group.isConnected) group.remove();
      }
    });
    
    timeline
      .add({
        targets: glow,
        r: [0, STICKER_DIAMETER * 3], // Expand large
        opacity: [0.9, 0],
        duration: 1400
      }, 0)
      .add({
        targets: ring,
        r: [STICKER_DIAMETER * 0.8, STICKER_DIAMETER * 2.2],
        strokeWidth: [4, 0],
        opacity: [1, 0],
        duration: 1000,
        easing: "easeOutQuad"
      }, 0)
      .add({
        targets: ripple,
        r: [STICKER_DIAMETER * 1.2, STICKER_DIAMETER * 3.5],
        strokeWidth: [2, 0],
        opacity: [0.6, 0],
        duration: 1200,
        delay: 100,
        easing: "easeOutQuad"
      }, 0)
      .add({
        duration: 800 // Add pause between loops
      });
      
  } else {
    setTimeout(() => { if (group.isConnected) group.remove(); }, 1400 * 4);
  }
}

function playPixiFocusHalo(x, y) {
  if (!pixiEffectsLayer) return;

  // Create a container for the halo effect
  const container = new PIXI.Container();
  container.name = 'focusHalo'; // Tag for cleanup
  container.x = x;
  container.y = y;
  pixiEffectsLayer.addChild(container);

  // 1. Core Glow (White Circle with blur)
  const glow = new PIXI.Graphics();
  glow.beginFill(0xFFFFFF, 0.9);
  glow.drawCircle(0, 0, STICKER_DIAMETER * 0.5); // Initial size
  glow.endFill();
  // Add blur filter for soft edges
  const blurFilter = new PIXI.BlurFilter();
  blurFilter.blur = 10;
  glow.filters = [blurFilter];
  container.addChild(glow);

  // 2. Sharp Ring
  const ring = new PIXI.Graphics();
  ring.lineStyle(4, 0xFFFFFF, 1);
  ring.drawCircle(0, 0, STICKER_DIAMETER * 0.8);
  ring.alpha = 0;
  container.addChild(ring);

  // 3. Outer Ripple
  const ripple = new PIXI.Graphics();
  ripple.lineStyle(2, 0xFFFFFF, 1);
  ripple.drawCircle(0, 0, STICKER_DIAMETER * 1.2);
  ripple.alpha = 0;
  container.addChild(ripple);

  if (window.anime) {
    const timeline = window.anime.timeline({
      easing: "easeOutExpo",
      loop: 4,
      complete: () => {
        container.destroy({ children: true });
      }
    });

    // Glow Animation
    timeline.add({
      targets: glow.scale,
      x: [0, 6], // Scale up
      y: [0, 6],
      duration: 1400,
      easing: "easeOutExpo"
    }, 0);
    timeline.add({
      targets: glow,
      alpha: [0.9, 0],
      duration: 1400,
      easing: "easeOutExpo"
    }, 0);

    // Ring Animation
    timeline.add({
      targets: ring.scale,
      x: [1, 2.75], // Scale relative to initial draw
      y: [1, 2.75],
      duration: 1000,
      easing: "easeOutQuad"
    }, 0);
    timeline.add({
      targets: ring,
      alpha: [1, 0],
      duration: 1000,
      easing: "easeOutQuad"
    }, 0);
    // Note: strokeWidth animation is tricky in Pixi Graphics without redrawing. 
    // We simulate thinning by fading out faster or just accepting constant width.
    // Or we could redraw in an update loop, but that's heavy. 
    // Fading alpha is usually enough visually.

    // Ripple Animation
    timeline.add({
      targets: ripple.scale,
      x: [1, 2.9],
      y: [1, 2.9],
      duration: 1200,
      delay: 100,
      easing: "easeOutQuad"
    }, 0);
    timeline.add({
      targets: ripple,
      alpha: [0.6, 0],
      duration: 1200,
      delay: 100,
      easing: "easeOutQuad"
    }, 0);

    timeline.add({
      duration: 800
    });

  } else {
    // Fallback cleanup
    setTimeout(() => {
      if (!container.destroyed) container.destroy({ children: true });
    }, 1400 * 4);
  }
}

export function playEagleSweepEffect(onComplete) {
  if (!elements.effectsLayer) {
    if (onComplete) onComplete();
    return;
  }
  
  const eaglePaths = document.querySelectorAll("#eagleBody, #eagleTail");
  if (!eaglePaths.length) {
    if (onComplete) onComplete();
    return;
  }

  // Create a group for the sweep
  const sweepGroup = document.createElementNS(svgNS, "g");
  sweepGroup.style.pointerEvents = "none";
  // Use normal blend mode with opacity for better mobile compatibility
  sweepGroup.style.mixBlendMode = "normal"; 
  sweepGroup.style.opacity = "0.8";

  
  // Define the gradient
  const gradientId = `eagleSweepGradient-${Date.now()}`;
  const defs = document.createElementNS(svgNS, "defs");
  const gradient = document.createElementNS(svgNS, "linearGradient");
  gradient.id = gradientId;
  gradient.setAttribute("gradientUnits", "userSpaceOnUse");
  
  // Calculate bounds
  let minX = Infinity, maxX = -Infinity;
  eaglePaths.forEach(p => {
    try {
      const bbox = p.getBBox();
      minX = Math.min(minX, bbox.x);
      maxX = Math.max(maxX, bbox.x + bbox.width);
    } catch (e) {}
  });
  
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    minX = 0;
    maxX = 1000;
  }
  
  const totalWidth = maxX - minX;
  // Wider band again for softer look (0.5)
  const bandWidth = totalWidth * 0.5; 
  
  const startX1 = minX - bandWidth;
  const startX2 = minX;
  const endX1 = maxX;
  const endX2 = maxX + bandWidth;

  gradient.setAttribute("x1", startX1);
  gradient.setAttribute("y1", "0");
  gradient.setAttribute("x2", startX2);
  gradient.setAttribute("y2", "0");
  
  // Softer gradient stops
  const stops = [
    { offset: "0%", color: "#ffffff", opacity: "0" },
    { offset: "20%", color: "#ffffff", opacity: "0.1" },
    { offset: "50%", color: "#ffffff", opacity: "0.8" }, // Not full 1.0
    { offset: "80%", color: "#ffffff", opacity: "0.1" },
    { offset: "100%", color: "#ffffff", opacity: "0" }
  ];
  
  stops.forEach(s => {
    const stop = document.createElementNS(svgNS, "stop");
    stop.setAttribute("offset", s.offset);
    stop.setAttribute("stop-color", s.color);
    stop.setAttribute("stop-opacity", s.opacity);
    gradient.appendChild(stop);
  });
  
  defs.appendChild(gradient);
  sweepGroup.appendChild(defs);
  
  eaglePaths.forEach(path => {
    const clone = path.cloneNode(true);
    clone.removeAttribute("id");
    clone.removeAttribute("class");
    clone.setAttribute("fill", `url(#${gradientId})`);
    clone.setAttribute("stroke", "none");
    clone.style.opacity = "1";
    sweepGroup.appendChild(clone);
  });
  
  elements.effectsLayer.appendChild(sweepGroup);
  
  if (window.anime) {
    window.anime({
      targets: gradient,
      x1: [startX1, endX1],
      x2: [startX2, endX2],
      easing: "easeInOutSine",
      duration: 2500, // Back to 2.5s
      complete: () => {
        if (sweepGroup.isConnected) sweepGroup.remove();
        if (onComplete) onComplete();
      }
    });
  } else {
     setTimeout(() => { 
       if (sweepGroup.isConnected) sweepGroup.remove(); 
       if (onComplete) onComplete();
     }, 2500);
  }
}

export function initAmbientGlow() {
  getAmbientGlowEffect().init();
}

function destroyAmbientGlow() {
  getAmbientGlowEffect().destroy();
}

export function refreshAmbientGlow(force = false) {
  getAmbientGlowEffect().refresh(force);
}

export function scheduleAmbientGlowRefresh() {
  getAmbientGlowEffect().scheduleRefresh();
}

const shimmerState = {
  paused: false,
  recentStickers: [],
  currentIndex: 0,
  lastUpdate: 0
};

export function setShimmerPaused(paused) {
  shimmerState.paused = paused;
  if (paused) {
    // Clear any active shimmers immediately
    const activeNodes = document.querySelectorAll('.sticker-node.shimmering');
    activeNodes.forEach(node => node.classList.remove('shimmering'));
    
    if (elements.effectsLayer) {
      const sparkles = elements.effectsLayer.querySelectorAll('.shimmer-sparkle');
      sparkles.forEach(sparkle => {
        const group = sparkle.closest('g');
        if (group) group.remove();
      });
    }
  }
}

export function initShimmerSystem(stickersMap, state) {
  const runLoop = () => {
    if (shimmerState.paused) {
      setTimeout(runLoop, 1000);
      return;
    }

    const now = Date.now();
    
    // Update recent list every 10 seconds or if empty
    if (now - shimmerState.lastUpdate > 10000 || shimmerState.recentStickers.length === 0) {
        const stickers = Array.from(stickersMap.values());
        const twentyFourHoursMs = 24 * 60 * 60 * 1000;
        shimmerState.recentStickers = stickers.filter(s => {
            if (!s.created_at) return false;
            const created = new Date(s.created_at).getTime();
            return !Number.isNaN(created) && (now - created) < twentyFourHoursMs;
        }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // Newest first
        shimmerState.lastUpdate = now;
        // Reset index if out of bounds
        if (shimmerState.currentIndex >= shimmerState.recentStickers.length) {
            shimmerState.currentIndex = 0;
        }
    }

    if (shimmerState.recentStickers.length > 0) {
        // Pick next sticker (Round Robin)
        const record = shimmerState.recentStickers[shimmerState.currentIndex];
        shimmerState.currentIndex = (shimmerState.currentIndex + 1) % shimmerState.recentStickers.length;

        if (record) {
             // Check validity
             const isPending = state.pending?.id === record.id;
             // Note: drag.node might be null in Pixi, but we check if it matches
             const isDragging = state.drag?.node && state.drag.node === record.node; 
             
             if (!isPending && !isDragging) {
                 // Trigger
                 triggerShimmer(record.node || { dataset: { cx: record.x, cy: record.y, id: record.id } });
             }
        }
    }

    // Schedule next run. Slower frequency for subtle effect.
    setTimeout(runLoop, 3500 + Math.random() * 1500);
  };
  runLoop();
}

function triggerShimmer(node) {
  if (!node) return;
  
  // 1. Animate the sticker itself (brightness/scale)
  if (node.classList) node.classList.add("shimmering");

  // 2. Create the cross shine in the effects layer (to avoid clipping by eagle edge)
  let cx, cy;
  if (node.dataset) {
      cx = parseFloat(node.dataset.cx);
      cy = parseFloat(node.dataset.cy);
  } else {
      // Fallback if node is a plain object
      cx = node.dataset?.cx;
      cy = node.dataset?.cy;
  }

  if (pixiEffectsLayer && Number.isFinite(cx) && Number.isFinite(cy)) {
      playPixiShimmer(cx, cy, node);
      return;
  }

  if (Number.isFinite(cx) && Number.isFinite(cy) && elements.effectsLayer) {
    const group = document.createElementNS(svgNS, "g");
    group.setAttribute("transform", `translate(${cx}, ${cy})`);
    group.style.pointerEvents = "none";

    // 1. The Core Glow (Soft, diffuse circle)
    const core = document.createElementNS(svgNS, "circle");
    core.classList.add("shimmer-core");
    core.setAttribute("r", "12");
    core.setAttribute("fill", "white");
    
    // 2. The Rays (Sharp, long cross)
    const rays = document.createElementNS(svgNS, "path");
    rays.classList.add("shimmer-rays");
    // Very thin, long cross shape
    rays.setAttribute("d", "M0,-90 C2,-20 20,-2 90,0 C20,2 2,20 0,90 C-2,20 -20,2 -90,0 C-20,-2 -2,-20 0,-90 Z");
    rays.setAttribute("fill", "white");

    group.appendChild(core);
    group.appendChild(rays);
    elements.effectsLayer.appendChild(group);

    // Cleanup function
    let safetyTimer = null;
    const cleanup = () => {
      if (safetyTimer) clearTimeout(safetyTimer);
      node.classList.remove("shimmering");
      if (group.isConnected) group.remove();
      node.removeEventListener("animationend", cleanup);
    };

    // Listen to the sticker's animation end
    node.addEventListener("animationend", cleanup);
    // Safety timeout to prevent endless loops if animation is interrupted (e.g. by drag/redraw)
    safetyTimer = setTimeout(cleanup, 3000);
  } else {
    // Fallback if coordinates missing
    let safetyTimer = null;
    const cleanup = () => {
      if (safetyTimer) clearTimeout(safetyTimer);
      node.classList.remove("shimmering");
      node.removeEventListener("animationend", cleanup);
    };
    node.addEventListener("animationend", cleanup);
    safetyTimer = setTimeout(cleanup, 2400);
  }
}

export function initFireEffect() {
  getFireEffect().init();
}

// Deprecated / Moved functions for Fire Effect
function createFireParticle() {} 

export function updateFireIntensity(stickersMap) {
  const count = stickersMap.size;
  setFireIntensity(count);
}

// Deprecated / Moved functions for Mist Effect
function initCelebrationMist() {
  getMistEffect().init();
}


export function handleVisibilityChange(isVisible) {
  // 1. Shimmer Effect
  setShimmerPaused(!isVisible);

  // 2. Fire Effect (pause spawning)
  getFireEffect().setPaused(!isVisible);
  
  // 3. Ambient/Glow Animations
  getAmbientGlowEffect().setPaused(!isVisible);

  // 4. Mist Effect
  getMistEffect().setPaused(!isVisible);

  // 5. Pixi
  // Pixi usually handles Ticker automatically if configured, but we can be explicit
  if (pixiApp && pixiApp.ticker) {
      if (isVisible) {
          pixiApp.ticker.start();
      } else {
          pixiApp.ticker.stop();
      }
  }
}

export function resetFireEffect() {
  getFireEffect().reset();
  getBottomFireEffect().reset();
  getMistEffect().reset();

  // 5. Clear Holy Fire
  getHolyFireEffect().reset();
}

export function setFireIntensity(count) {
  // 0 to 700 stickers maps to 0 to 1 intensity
  const maxStickers = 700;
  const minIntensity = 0.0; 
  const progress = Math.min(count / maxStickers, 1);
  
  const val = minIntensity + (progress * (1 - minIntensity));
  
  // Critical: Update shared state for MistEffect
  fireState.intensity = val;

  getFireEffect().setIntensity(val);
  getBottomFireEffect().setIntensity(val);
}

export function runPopAnimation(node) {
  if (!window.anime || !node) {
    return;
  }
  node.style.transformOrigin = "50% 50%";
  window.anime({
    targets: node,
    scale: [0, 1],
    opacity: [0, 1],
    translateY: [20, 0],
    easing: "easeOutElastic(1, .5)",
    duration: 1000,
    delay: window.anime.random(0, 150),
    complete: () => {
      if (node?.style) {
        node.style.removeProperty("transform");
        node.style.removeProperty("opacity");
      }
    },
  });
}

export function runPulseAnimation(node) {
  if (!window.anime || !node) {
    return;
  }
  node.style.transformOrigin = "50% 50%";
  window.anime({
    targets: node,
    scale: [1, 1.15],
    direction: "alternate",
    loop: 2,
    duration: 400,
    easing: "easeInOutSine",
    complete: () => {
      if (node?.style) {
        node.style.removeProperty("transform");
      }
    },
  });
}

export function getResonanceHeat() {
  return getResonanceEffect().getHeat();
}

export function playResonanceEffect(remoteHeat = null) {
  getResonanceEffect().trigger(remoteHeat);
}

export function updateOnlineCount(count) {
  getResonanceEffect().updateOnlineCount(count);
}

// Resonance has been moved to ResonanceEffect.js

// HolyFire has been moved to HolyFireEffect.js

// Moved to MistEffect.js
// const celebrationState = { ... };
// function initCelebrationMist() { ... }
// function startCelebrationLoop() { ... }

// --- PixiJS Implementations ---

let _circleTexture = null;
function getCircleTexture() {
  if (_circleTexture) return _circleTexture;
  if (!pixiApp) return null;
  
  // Create a soft gradient circle using Canvas
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  
  _circleTexture = PIXI.Texture.from(canvas);
  return _circleTexture;
}

function playPixiStarBurst(x, y) {
  const container = new PIXI.Container();
  container.x = x;
  container.y = y;
  
  // 1. Core
  const core = new PIXI.Graphics();
  core.beginFill(0xFFFFFF);
  core.drawCircle(0, 0, STICKER_RADIUS);
  core.endFill();
  core.alpha = 1;
  
  // 2. Star 1 (Cross)
  const star1 = new PIXI.Graphics();
  star1.beginFill(0xFFFBE6);
  // Draw Star manually: M 0 -size Q 0 0 size 0 ...
  const size = STICKER_DIAMETER * 4;
  const inner = STICKER_DIAMETER * 0.2;
  star1.drawPolygon([
      0, -size, inner, -inner, size, 0, inner, inner,
      0, size, -inner, inner, -size, 0, -inner, -inner
  ]);
  star1.endFill();
  star1.scale.set(0);
  star1.alpha = 0.9;
  
  // 3. Star 2 (Diagonal)
  const star2 = new PIXI.Graphics();
  star2.beginFill(0xFFE4B5);
  const size2 = STICKER_DIAMETER * 2.5;
  star2.drawPolygon([
      0, -size2, inner, -inner, size2, 0, inner, inner,
      0, size2, -inner, inner, -size2, 0, -inner, -inner
  ]);
  star2.endFill();
  star2.rotation = Math.PI / 4;
  star2.scale.set(0);
  star2.alpha = 0.7;
  
  // 4. Ring
  const ring = new PIXI.Graphics();
  ring.lineStyle(2, 0xFFD700);
  ring.drawCircle(0, 0, STICKER_DIAMETER);
  ring.alpha = 0.6;
  ring.scale.set(0);

  container.addChild(star2, star1, ring, core);
  pixiEffectsLayer.addChild(container);
  
  const timeline = registerAnime(window.anime.timeline({
      easing: "easeOutExpo",
      complete: () => {
          container.destroy({ children: true });
      }
  }));
  
  timeline
  .add({
      targets: core,
      alpha: [1, 0],
      duration: 600
  }, 0)
  .add({
      targets: [star1.scale, star2.scale],
      x: [0, 1],
      y: [0, 1],
      duration: 800,
      easing: "easeOutQuart"
  }, 0)
  .add({
      targets: [star1, star2],
      alpha: 0,
      duration: 800,
      easing: "easeInQuad"
  }, 200)
  .add({
      targets: ring.scale,
      x: 3,
      y: 3,
      duration: 1000
  }, 0)
  .add({
      targets: ring,
      alpha: 0,
      duration: 1000
  }, 0);
}

function playPixiRevealBurst(x, y) {
  const container = new PIXI.Container();
  container.x = x;
  container.y = y;
  
  // 1. Core
  const core = new PIXI.Graphics();
  core.beginFill(0xFFFFFF);
  core.drawCircle(0, 0, STICKER_RADIUS);
  core.endFill();
  core.alpha = 1;
  
  // 2. Glow (Simulated with large circle)
  const glow = new PIXI.Graphics();
  glow.beginFill(0xFFFFFF);
  glow.drawCircle(0, 0, STICKER_DIAMETER * 3);
  glow.endFill();
  glow.alpha = 0.4;
  glow.scale.set(0);
  
  // 3. Ring
  const ring = new PIXI.Graphics();
  ring.lineStyle(4, 0xFFFFFF);
  ring.drawCircle(0, 0, STICKER_RADIUS);
  ring.alpha = 0.8;
  ring.scale.set(0);

  container.addChild(glow, core, ring);
  pixiEffectsLayer.addChild(container);
  
  const timeline = registerAnime(window.anime.timeline({
      easing: "easeOutExpo",
      complete: () => {
          container.destroy({ children: true });
      }
  }));
  
  timeline
  .add({
      targets: core,
      alpha: [1, 0],
      duration: 500
  }, 0)
  .add({
      targets: glow.scale,
      x: 2, y: 2,
      duration: 900
  }, 0)
  .add({
      targets: glow,
      alpha: 0,
      duration: 900
  }, 0)
  .add({
      targets: ring.scale,
      x: 2.5, y: 2.5,
      duration: 600
  }, 0)
  .add({
      targets: ring,
      alpha: 0,
      duration: 600
  }, 0);
}

// --- Optimized Pixi Fire System ---








// --- Optimized Pixi Ambient Glow ---
// Refactored to AmbientGlowEffect.js

function playPixiProjectile(screenX, screenY, targetX, targetY, onComplete) {
 // Moved to ProjectileEffect.js
 if (onComplete) onComplete(); 
}

function playPixiPlacementImpact(cx, cy) {
  const container = new PIXI.Container();
  container.x = cx;
  container.y = cy;
  
  // 1. Glow
  const glow = new PIXI.Graphics();
  glow.beginFill(0xFFFFFF);
  glow.drawCircle(0, 0, STICKER_DIAMETER * 4.2);
  glow.endFill();
  glow.alpha = 0.75;
  glow.scale.set(0);
  
  // 2. Halo
  const halo = new PIXI.Graphics();
  halo.lineStyle(10, 0xFFFFFF);
  halo.drawCircle(0, 0, STICKER_DIAMETER * 2.4);
  halo.alpha = 0.9;
  halo.scale.set(STICKER_RADIUS * 0.6 / (STICKER_DIAMETER * 2.4)); // Start small
  
  // 3. Wave
  const wave = new PIXI.Graphics();
  wave.lineStyle(8, 0xFFFFFF);
  wave.drawCircle(0, 0, STICKER_DIAMETER * 3.4);
  wave.alpha = 0.9;
  wave.scale.set(STICKER_RADIUS * 0.75 / (STICKER_DIAMETER * 3.4));
  
  // 4. Ring
  const ring = new PIXI.Graphics();
  ring.lineStyle(3, 0xFFFFFF);
  ring.drawCircle(0, 0, STICKER_DIAMETER * 2.9);
  ring.alpha = 0.95;
  ring.scale.set(STICKER_RADIUS * 0.5 / (STICKER_DIAMETER * 2.9));
  
  // 5. Core
  const core = new PIXI.Graphics();
  core.beginFill(0xFFFFFF);
  core.drawCircle(0, 0, STICKER_RADIUS * 0.55);
  core.endFill();
  core.alpha = 1;
  core.scale.set(0);
  
  container.addChild(glow, halo, wave, ring, core);
  
  // Sparks
  const sparks = [];
  const sparkCount = 8;
  const sparkLength = STICKER_DIAMETER * 2.1;
  
  for (let i = 0; i < sparkCount; i++) {
      const angle = (Math.PI * 2 * i) / sparkCount;
      const spark = new PIXI.Graphics();
      spark.lineStyle(3, 0xFFFFFF);
      spark.moveTo(0, 0);
      spark.lineTo(sparkLength, 0);
      spark.rotation = angle;
      spark.alpha = 0;
      container.addChild(spark);
      sparks.push(spark);
  }
  
  pixiEffectsLayer.addChild(container);
  
  const timeline = registerAnime(window.anime.timeline({
      easing: "easeOutCubic",
      complete: () => {
          container.destroy({ children: true });
      }
  }));
  
  timeline
  .add({
      targets: glow,
      alpha: [0.75, 0],
      scale: 1, // Target scale 1 (which is diameter * 4.2)
      duration: 880
  }, 0)
  .add({
      targets: halo,
      alpha: [0.9, 0],
      scale: 1,
      duration: 560,
      easing: "easeOutQuad"
  }, 0)
  .add({
      targets: wave,
      alpha: [0.9, 0],
      scale: 1,
      duration: 700
  }, 80)
  .add({
      targets: ring,
      alpha: [0.95, 0],
      scale: 1,
      duration: 620,
      easing: "easeOutQuad"
  }, 120)
  .add({
      targets: core,
      alpha: [1, 0],
      scale: 1,
      duration: 340,
      easing: "easeOutQuad"
  }, 0)
  .add({
      targets: sparks,
      alpha: [0, 1],
      duration: 280,
      easing: "easeOutExpo",
      delay: window.anime.stagger(18)
  }, 0)
  .add({
      targets: sparks,
      alpha: 0,
      duration: 260,
      easing: "easeInQuad",
      delay: window.anime.stagger(22)
  }, 320);
}



function playPixiShimmer(cx, cy, node) {
  if (!pixiEffectsLayer) return;

  const container = new PIXI.Container();
  container.x = cx;
  container.y = cy;
  container.zIndex = 50; // Ensure it's on top of stickers
  pixiEffectsLayer.addChild(container);
  
  // 1. Star Shape (Bright White)
  const star = new PIXI.Graphics();
  star.beginFill(0xFFFFFF);
  // Draw a 4-point star
  star.drawPolygon([
      0, -20, 
      5, -5, 
      20, 0, 
      5, 5, 
      0, 20, 
      -5, 5, 
      -20, 0, 
      -5, -5
  ]);
  star.endFill();
  star.scale.set(0);
  star.rotation = Math.random() * Math.PI;
  
  // 2. Glow Circle (Soft)
  const glow = new PIXI.Graphics();
  glow.beginFill(0xFFFFFF, 0.6);
  glow.drawCircle(0, 0, 15);
  glow.endFill();
  const blur = new PIXI.BlurFilter();
  blur.blur = 8;
  glow.filters = [blur];
  glow.scale.set(0);

  container.addChild(glow, star);

  if (window.anime) {
      const timeline = window.anime.timeline({
          complete: () => {
              if (node.classList) node.classList.remove("shimmering");
              container.destroy({ children: true });
          }
      });

      // Pop in
      timeline
      .add({
          targets: [star.scale, glow.scale],
          x: 1.5,
          y: 1.5,
          duration: 400,
          easing: 'easeOutBack'
      }, 0)
      .add({
          targets: star,
          rotation: star.rotation + Math.PI / 2,
          duration: 1200,
          easing: 'linear'
      }, 0)
      // Fade out
      .add({
          targets: container,
          alpha: 0,
          duration: 500,
          delay: 700, // Hold for a bit
          easing: 'easeInQuad'
      }, 0);
  } else {
      // Fallback
      star.scale.set(1);
      glow.scale.set(1);
      setTimeout(() => {
          if (node.classList) node.classList.remove("shimmering");
          container.destroy({ children: true });
      }, 1000);
  }
}

export function playPixiLiftEffect(cx, cy) {
  if (!pixiEffectsLayer) return;

  const container = new PIXI.Container();
  container.x = cx;
  container.y = cy;
  container.zIndex = 40; // Same layer
  pixiEffectsLayer.addChild(container);

  // 1. Light Ripple (Thin ring)
  const ripple = new PIXI.Graphics();
  ripple.lineStyle(2, 0xFFFFFF, 0.5);
  ripple.drawCircle(0, 0, STICKER_RADIUS);
  container.addChild(ripple);

  // 2. Soft "Pop" Glow
  const glow = new PIXI.Graphics();
  glow.beginFill(0xFFFFFF, 0.3);
  glow.drawCircle(0, 0, STICKER_RADIUS);
  glow.endFill();
  const glowBlur = new PIXI.BlurFilter();
  glowBlur.blur = 5;
  glow.filters = [glowBlur];
  glow.scale.set(0.5);
  container.addChild(glow);

  if (window.anime) {
    const timeline = window.anime.timeline({
      complete: () => {
        container.destroy({ children: true });
      }
    });

    // Ripple expands and fades quickly
    timeline.add({
      targets: ripple,
      alpha: 0,
      width: STICKER_DIAMETER * 2.0,
      height: STICKER_DIAMETER * 2.0,
      duration: 500,
      easing: 'easeOutQuad'
    }, 0);

    // Glow expands slightly and fades
    timeline.add({
      targets: glow.scale,
      x: 1.2,
      y: 1.2,
      duration: 300,
      easing: 'easeOutQuad'
    }, 0)
    .add({
      targets: glow,
      alpha: 0,
      duration: 300,
      easing: 'linear'
    }, 100);

  } else {
    // Fallback
    setTimeout(() => {
        container.destroy({ children: true });
    }, 500);
  }
}

export function playPixiMistExplosion(cx, cy) {
  if (!pixiEffectsLayer) return;

  const container = new PIXI.Container();
  container.x = cx;
  container.y = cy;
  container.zIndex = 40; 
  pixiEffectsLayer.addChild(container);

  // Configuration for "Stronger & Realistic" effect
  // Removed sharp ring1 as requested

  // 1. Soft Shockwave (Mist ring)
  const ring2 = new PIXI.Graphics();
  ring2.lineStyle(8, 0xFFFFFF, 0.3);
  ring2.drawCircle(0, 0, 5);
  const ring2Blur = new PIXI.BlurFilter();
  ring2Blur.blur = 4;
  ring2.filters = [ring2Blur];

  container.addChild(ring2);

  // 2. Smoke/Mist Particles (Cloud-like)
  const particles = [];
  const particleCount = 12; // More puffs
  
  for (let i = 0; i < particleCount; i++) {
      const p = new PIXI.Graphics();
      // Draw a soft "puff" using a circle with blur
      const size = 10 + Math.random() * 15;
      p.beginFill(0xFFFFFF, 0.4 + Math.random() * 0.3); // Varying opacity
      p.drawCircle(0, 0, size);
      p.endFill();
      
      const pBlur = new PIXI.BlurFilter();
      pBlur.blur = 5 + Math.random() * 5; // Heavy blur for smoke look
      p.filters = [pBlur];
      
      const angle = (Math.random() * Math.PI * 2);
      // Particles start near center
      p.x = Math.cos(angle) * (Math.random() * 10);
      p.y = Math.sin(angle) * (Math.random() * 10);
      p.rotation = Math.random() * Math.PI;
      p.scale.set(0.5); // Start small
      
      // Store individual trajectories
      p._angle = angle;
      p._speed = 30 + Math.random() * 40; // Travel distance
      
      container.addChild(p);
      particles.push(p);
  }

  // 4. Tiny Debris/Sparks (Crisp dots)
  const sparks = [];
  const sparkCount = 8;
  for (let i = 0; i < sparkCount; i++) {
     const s = new PIXI.Graphics();
     s.beginFill(0xFFE4BC); // Slightly warm white
     s.drawCircle(0,0, 2);
     s.endFill();
     
     const angle = (Math.random() * Math.PI * 2);
     s._angle = angle;
     s._dist = 40 + Math.random() * 30;
     
     container.addChild(s);
     sparks.push(s);
  }

  if (window.anime) {
      const timeline = window.anime.timeline({
          complete: () => {
              container.destroy({ children: true });
          }
      });

      // Ring 2 (Soft Shockwave)
      timeline.add({
          targets: ring2.scale,
          x: 4, y: 4,
          duration: 600,
          easing: 'easeOutQuad'
      }, 0)
      .add({
          targets: ring2,
          alpha: 0,
          duration: 600,
          easing: 'easeOutQuad'
      }, 0);

      // Smoke Puff Expansion
      particles.forEach((p) => {
          timeline.add({
              targets: p.scale,
              x: 1.5 + Math.random(), // Puff up
              y: 1.5 + Math.random(),
              duration: 800,
              easing: 'easeOutCubic'
          }, 0);

          timeline.add({
              targets: p,
              x: p.x + Math.cos(p._angle) * p._speed,
              y: p.y + Math.sin(p._angle) * p._speed,
              alpha: 0,
              duration: 800 + Math.random() * 200,
              easing: 'easeOutQuad'
          }, 0);
      });
      
      // Sparks
      sparks.forEach((s) => {
          timeline.add({
              targets: s,
              x: Math.cos(s._angle) * s._dist,
              y: Math.sin(s._angle) * s._dist,
              alpha: [1, 0],
              scale: [1, 0],
              duration: 500,
              easing: 'easeOutExpo'
          }, 0);
      });

  } else {
      setTimeout(() => {
          container.destroy({ children: true });
      }, 1000);
  }
}


