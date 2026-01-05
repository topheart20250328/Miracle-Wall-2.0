
const svgNS = "http://www.w3.org/2000/svg";
const STICKER_DIAMETER = 36;
const STICKER_RADIUS = STICKER_DIAMETER / 2;

const ambientState = {
  nodes: [],
  animation: null,
  currentCount: 0,
  resizeTimer: null,
};
const fireState = {
  nodes: [],
  animation: null,
  intensity: 0, // 0 to 1
  active: false,
};

const bottomFireState = {
  canvas: null,
  ctx: null,
  firePixels: [],
  width: 0,
  height: 0,
  intensity: 0,
  animationId: null,
  palette: [],
};

let elements = {
  effectsLayer: null,
  ambientLayer: null,
  stickersLayer: null,
};
let mediaPrefersReducedMotion = null;

// Pixi Context
let pixiApp = null;
let pixiBgLayer = null;
let pixiEffectsLayer = null;

export function setPixiContext(app, bgLayer, effectsLayer) {
  pixiApp = app;
  pixiBgLayer = bgLayer;
  pixiEffectsLayer = effectsLayer;
  console.log("🚀 [EffectsManager] Pixi Context Set");
  
  // Re-init ambient/fire if they were waiting
  if (pixiBgLayer) {
      initAmbientGlow();
      initFireEffect();
  }
}

export function initEffectsManager(domElements, reducedMotion) {
  elements = { ...elements, ...domElements };
  mediaPrefersReducedMotion = reducedMotion;

  if (mediaPrefersReducedMotion) {
    const handleMotionPreferenceChange = (event) => {
      if (event.matches) {
        destroyAmbientGlow();
      } else {
        refreshAmbientGlow(true);
      }
    };
    if (typeof mediaPrefersReducedMotion.addEventListener === "function") {
      mediaPrefersReducedMotion.addEventListener("change", handleMotionPreferenceChange);
    } else if (typeof mediaPrefersReducedMotion.addListener === "function") {
      mediaPrefersReducedMotion.addListener(handleMotionPreferenceChange);
    }
  }

  initAmbientGlow();
  
  // Ensure main creates a stacking context for z-index layers
  const main = document.querySelector("main");
  if (main) main.style.isolation = "isolate";

  initFireEffect();
  initBottomFire();
  initCelebrationMist(); // New effect
  initHolyFire();
  initResonanceCanvas();
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
  if (pixiEffectsLayer) {
    playPixiProjectile(screenX, screenY, targetX, targetY, onComplete);
    return;
  }
  if (!elements.effectsLayer) {
    if (onComplete) onComplete();
    return;
  }
  
  const svg = elements.effectsLayer.ownerSVGElement;
  if (!svg) {
    if (onComplete) onComplete();
    return;
  }

  // 1. Determine Start Position (Top-Left SUPER FAR off-screen)
  // Concentrated in the far top-left with slight jitter
  const startScreenX = -window.innerWidth * 0.4 + (Math.random() * 100); 
  const startScreenY = -window.innerHeight * 0.4 + (Math.random() * 100);

  // Convert Start Screen coords to SVG coords
  let pt = svg.createSVGPoint();
  pt.x = startScreenX;
  pt.y = startScreenY;
  const ctm = svg.getScreenCTM();
  if (ctm) {
    pt = pt.matrixTransform(ctm.inverse());
  }
  const startX = pt.x;
  const startY = pt.y;

  // Calculate angle
  const angle = Math.atan2(targetY - startY, targetX - startX) * 180 / Math.PI;
  
  // Ensure gradient exists
  ensureProjectileBeamGradient(elements.effectsLayer.ownerSVGElement);

  // Create Wrapper Group (for position)
  const wrapper = document.createElementNS(svgNS, "g");
  wrapper.style.pointerEvents = "none";
  wrapper.style.mixBlendMode = "screen";
  elements.effectsLayer.appendChild(wrapper);

  // Create Inner Group (for rotation)
  const inner = document.createElementNS(svgNS, "g");
  inner.setAttribute("transform", `rotate(${angle})`);
  wrapper.appendChild(inner);

  // Beam - Outer Glow (Gradient Tail)
  const glowBeam = document.createElementNS(svgNS, "line");
  glowBeam.setAttribute("x1", "-120"); // Long tail
  glowBeam.setAttribute("y1", "0");
  glowBeam.setAttribute("x2", "0");
  glowBeam.setAttribute("y2", "0");
  glowBeam.setAttribute("stroke", "url(#projectileBeamGradient)");
  glowBeam.setAttribute("stroke-width", "12");
  glowBeam.setAttribute("stroke-linecap", "round");

  // Beam - Core (Solid Bright)
  const coreBeam = document.createElementNS(svgNS, "line");
  coreBeam.setAttribute("x1", "-40"); 
  coreBeam.setAttribute("y1", "0");
  coreBeam.setAttribute("x2", "0");
  coreBeam.setAttribute("y2", "0");
  coreBeam.setAttribute("stroke", "#ffffff");
  coreBeam.setAttribute("stroke-width", "3");
  coreBeam.setAttribute("stroke-opacity", "0.9");
  coreBeam.setAttribute("stroke-linecap", "round");
  
  // Tip (Small glowing point)
  const tip = document.createElementNS(svgNS, "circle");
  tip.setAttribute("cx", "0");
  tip.setAttribute("cy", "0");
  tip.setAttribute("r", "4");
  tip.setAttribute("fill", "#ffffff");
  tip.setAttribute("stroke", "none"); // Ensure no black stroke
  tip.setAttribute("opacity", "1"); 

  inner.appendChild(glowBeam);
  inner.appendChild(coreBeam);
  inner.appendChild(tip);

  if (window.anime) {
    registerAnime(window.anime({
      targets: wrapper,
      translateX: [startX, targetX],
      translateY: [startY, targetY],
      easing: 'easeInQuad', // Accelerate into target
      duration: 750, 
      complete: () => {
        if (wrapper.isConnected) wrapper.remove();
        if (onComplete) onComplete();
      }
    }));
  } else {
    if (wrapper.isConnected) wrapper.remove();
    if (onComplete) onComplete();
  }
}

function ensureProjectileBeamGradient(svg) {
  let defs = svg.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS(svgNS, "defs");
    svg.insertBefore(defs, svg.firstChild);
  }
  // New ID to avoid conflicts with old cached gradients
  const id = "projectileBeamGradient";
  if (document.getElementById(id)) return;
  
  const grad = document.createElementNS(svgNS, "linearGradient");
  grad.id = id;
  grad.setAttribute("x1", "0%");
  grad.setAttribute("y1", "0%");
  grad.setAttribute("x2", "100%");
  grad.setAttribute("y2", "0%"); 
  
  const stop1 = document.createElementNS(svgNS, "stop");
  stop1.setAttribute("offset", "0%");
  stop1.setAttribute("stop-color", "#ffffff");
  stop1.setAttribute("stop-opacity", "0");
  
  const stop2 = document.createElementNS(svgNS, "stop");
  stop2.setAttribute("offset", "100%");
  stop2.setAttribute("stop-color", "#ffffff");
  stop2.setAttribute("stop-opacity", "1");
  
  grad.appendChild(stop1);
  grad.appendChild(stop2);
  defs.appendChild(grad);
}

// Deprecated but kept to avoid breaking if called elsewhere (though internal)
function ensureProjectileGradient(svg) {
  ensureProjectileBeamGradient(svg);
}

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
  if (pixiBgLayer) {
    initPixiAmbientGlow();
    return;
  }
  if (!elements.ambientLayer) {
    return;
  }
  if (mediaPrefersReducedMotion?.matches) {
    destroyAmbientGlow();
    return;
  }
  if (!window.anime || typeof window.anime.timeline !== "function") {
    return;
  }
  destroyAmbientGlow();

  const pathNodes = Array.from(document.querySelectorAll("#eagleBody, #eagleTail"));
  const pathEntries = pathNodes
    .map((path) => {
      try {
        const length = path.getTotalLength();
        if (!Number.isFinite(length) || length <= 0) {
          return null;
        }
        return { path, length };
      } catch (error) {
        console.warn("Ambient glow path sampling failed", error);
        return null;
      }
    })
    .filter(Boolean);

  if (!pathEntries.length) {
    return;
  }

  const combinedLength = pathEntries.reduce((sum, entry) => sum + entry.length, 0);
  if (!Number.isFinite(combinedLength) || combinedLength <= 0) {
    return;
  }

  const isCompactViewport = typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 768px)").matches;
  // Optimized for Desktop: Reduced sparkCount from 22 to 16
  const sparkCount = isCompactViewport ? 12 : 16;
  const averageSpacing = combinedLength / sparkCount;
  const jitterWindow = Math.min(averageSpacing * 0.6, 220);

  for (let i = 0; i < sparkCount; i += 1) {
    const offset = averageSpacing * i + (Math.random() - 0.5) * jitterWindow;
    const normalizedCombined = ((offset % combinedLength) + combinedLength) % combinedLength;

    let remaining = normalizedCombined;
    let targetEntry = pathEntries[0];
    for (const entry of pathEntries) {
      if (remaining <= entry.length) {
        targetEntry = entry;
        break;
      }
      remaining -= entry.length;
    }

    let point;
    try {
      point = targetEntry.path.getPointAtLength(Math.max(0, remaining));
    } catch (error) {
      continue;
    }
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      continue;
    }

    const jitterX = window.anime.random(-28, 28);
    const jitterY = window.anime.random(-26, 26);
    const maxRadius = window.anime.random(18, 36);
    const maxOpacity = window.anime.random(55, 88) / 100;
    const strokeWidth = window.anime.random(12, 26) / 10;

    const spark = document.createElementNS(svgNS, "circle");
    spark.classList.add("ambient-spark");
    spark.setAttribute("cx", (point.x + jitterX).toFixed(2));
    spark.setAttribute("cy", (point.y + jitterY).toFixed(2));
    spark.setAttribute("r", "0");
    spark.setAttribute("opacity", "0");
    spark.setAttribute("fill", "url(#eagleGlowGradient)");
    spark.setAttribute("stroke", "rgba(255, 228, 188, 0.6)");
    spark.setAttribute("stroke-width", strokeWidth.toFixed(2));
    spark.dataset.maxRadius = maxRadius.toFixed(2);
    spark.dataset.maxOpacity = maxOpacity.toFixed(2);
    elements.ambientLayer.appendChild(spark);
    ambientState.nodes.push(spark);
  }

  ambientState.currentCount = ambientState.nodes.length;
  if (!ambientState.currentCount) {
    return;
  }

  const startDelay = window.anime.random(0, 360);
  const timeline = window.anime.timeline({ loop: true, autoplay: true });
  timeline
    .add({
      targets: ambientState.nodes,
      r: (el) => Number(el.dataset.maxRadius ?? 24),
      opacity: (el) => Number(el.dataset.maxOpacity ?? 0.7),
      translateY: -40,
      duration: 2200,
      easing: "easeOutSine",
      delay: window.anime.stagger(220, { start: startDelay }),
    })
    .add({
      targets: ambientState.nodes,
      r: 0,
      opacity: 0,
      translateY: -80,
      duration: 2200,
      easing: "easeInSine",
      delay: window.anime.stagger(220, { direction: "reverse" }),
    });

  ambientState.animation = timeline;
}

function destroyAmbientGlow() {
  if (ambientState.animation && typeof ambientState.animation.pause === "function") {
    ambientState.animation.pause();
  }
  ambientState.animation = null;
  ambientState.nodes.forEach((node) => {
    if (node?.isConnected) {
      node.remove();
    }
  });
  ambientState.nodes.length = 0;
  ambientState.currentCount = 0;
  if (ambientState.resizeTimer) {
    clearTimeout(ambientState.resizeTimer);
    ambientState.resizeTimer = null;
  }
}

export function refreshAmbientGlow(force = false) {
  if (!elements.ambientLayer) {
    destroyAmbientGlow();
    return;
  }
  if (mediaPrefersReducedMotion?.matches) {
    destroyAmbientGlow();
    return;
  }
  if (!force) {
    const isCompactViewport = typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(max-width: 768px)").matches;
    const desiredCount = isCompactViewport ? 12 : 22;
    if (ambientState.currentCount === desiredCount) {
      return;
    }
  }
  initAmbientGlow();
}

export function scheduleAmbientGlowRefresh() {
  if (!elements.ambientLayer) {
    return;
  }
  if (ambientState.resizeTimer) {
    clearTimeout(ambientState.resizeTimer);
  }
  ambientState.resizeTimer = window.setTimeout(() => {
    ambientState.resizeTimer = null;
    refreshAmbientGlow();
  }, 260);
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

    // Schedule next run. Faster frequency for "obvious" effect.
    setTimeout(runLoop, 1200 + Math.random() * 800);
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
  if (pixiBgLayer) {
    initPixiFireEffect();
    return;
  }
  if (!elements.ambientLayer) return;
  if (mediaPrefersReducedMotion?.matches) return;
  if (!window.anime || typeof window.anime.timeline !== "function") return;

  // Reuse eagle paths for fire emission
  const pathNodes = Array.from(document.querySelectorAll("#eagleBody, #eagleTail"));
  const pathEntries = pathNodes
    .map((path) => {
      try {
        const length = path.getTotalLength();
        if (!Number.isFinite(length) || length <= 0) return null;
        return { path, length };
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);

  if (!pathEntries.length) return;

  const combinedLength = pathEntries.reduce((sum, entry) => sum + entry.length, 0);
  
  // Pre-calculate spawn points to avoid getPointAtLength in loop
  const spawnPoints = [];
  const sampleResolution = 3; // Sample every 3px
  
  pathEntries.forEach(entry => {
    const steps = Math.floor(entry.length / sampleResolution);
    for (let i = 0; i <= steps; i++) {
      try {
        const point = entry.path.getPointAtLength(i * sampleResolution);
        spawnPoints.push({ x: point.x, y: point.y });
      } catch (e) { /* ignore */ }
    }
  });

  if (spawnPoints.length === 0) return;

  // Calculate center of mass for outward dispersion
  let totalX = 0, totalY = 0;
  spawnPoints.forEach(p => { totalX += p.x; totalY += p.y; });
  const center = { x: totalX / spawnPoints.length, y: totalY / spawnPoints.length };

  // Create a dedicated group for fire if not exists
  let fireGroup = document.getElementById("fireGroup");
  if (!fireGroup) {
    fireGroup = document.createElementNS(svgNS, "g");
    fireGroup.id = "fireGroup";
    // Insert before stickersLayer to be behind stickers
    if (elements.stickersLayer && elements.stickersLayer.parentNode) {
      elements.stickersLayer.parentNode.insertBefore(fireGroup, elements.stickersLayer);
    } else {
      elements.ambientLayer.appendChild(fireGroup);
    }
  }

  fireState.active = true;
  
  // Check for mobile device to optimize performance
  const isMobile = window.innerWidth < 768;

  // Start the fire loop
  const spawnFireParticle = () => {
    if (!fireState.active) return;
    
    // Calculate spawn rate based on intensity
    const intensity = fireState.intensity;

    // If intensity is effectively zero, don't spawn particles, just check again later
    if (intensity <= 0.01) {
      setTimeout(spawnFireParticle, 500);
      return;
    }
    
    // Performance throttling for mobile:
    // To support longer particle life without killing performance, we MUST reduce spawn rate.
    // We increase delays and reduce batch sizes to keep total concurrent nodes stable.
    // Optimized for Desktop: Increased delayBase from 200 to 300 to reduce DOM load
    let delayBase = isMobile ? 350 : 300; // Slower spawn loop
    let delayMin = isMobile ? 150 : 100;
    
    // Spawn delay: decreases as intensity increases
    const delay = delayBase - (intensity * (delayBase - delayMin));
    
    // Batch size: Reduced to compensate for longer life
    // Optimized for Desktop: Reduced maxBatch from 3 to 2
    let maxBatch = isMobile ? 2 : 2; 
    const batchSize = 1 + Math.floor(intensity * (maxBatch - 1));

    for (let i = 0; i < batchSize; i++) {
      createFireParticle(spawnPoints, center, fireGroup, intensity, isMobile);
    }

    setTimeout(spawnFireParticle, delay);
  };

  spawnFireParticle();
}

function createFireParticle(spawnPoints, center, container, intensity, isMobile) {
  try {
    // Pick a random pre-calculated point
    const point = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
    if (!point) return;

    const particle = document.createElementNS(svgNS, "circle");
    particle.classList.add("fire-particle");
    particle.style.mixBlendMode = "screen";
    
    // Randomize position slightly
    const jitter = 15 + (intensity * 25);
    const startX = point.x + (Math.random() - 0.5) * jitter;
    const startY = point.y + (Math.random() - 0.5) * jitter;

    particle.setAttribute("cx", startX.toFixed(2));
    particle.setAttribute("cy", startY.toFixed(2));
    
    // Visual Refinement:
    // 1. Size: Further reduced as requested (2px - 6px range)
    // Mobile still gets a slight boost to compensate for lower particle count
    const mobileScale = isMobile ? 1.5 : 1;
    const baseSize = (2 + (intensity * 4)) * mobileScale; // 2px to 6px base
    const size = baseSize * (0.8 + Math.random() * 0.4); 
    particle.setAttribute("r", size.toFixed(2));

    // 2. Color: Hotter, more vibrant colors
    // Mix of Yellow/White (hot core) and Orange/Red (flames)
    const startHue = 40 + Math.random() * 15; // Yellow/Gold
    
    particle.style.fill = `hsl(${startHue}, 100%, 80%)`;
    // Start invisible, fade in handled by anime.js
    particle.style.opacity = 0;

    container.appendChild(particle);

    // 3. Motion: Outward dispersion with Upward Bias
    // Extended duration as requested (2.5s - 4.5s)
    // We can afford this because we reduced the spawn rate in the loop
    const duration = 2500 + Math.random() * 2000; 
    
    // Calculate vector from center
    const dx = startX - center.x;
    const dy = startY - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    let dirX = dx / dist;
    let dirY = dy / dist;

    // Add strong upward bias to simulate heat rising
    // This ensures top particles float UP instead of just OUT
    dirY -= 0.8; 

    // Re-normalize to maintain consistent slow speed
    const newDist = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    dirX /= newDist;
    dirY /= newDist;

    // Speed magnitude (Reduced slightly to match longer duration)
    const speed = 15 + (intensity * 25) + (Math.random() * 10);
    
    const travelX = dirX * speed;
    const travelY = dirY * speed;

    // 4. Animation: "Puff" effect (Grow then Shrink)
    window.anime({
      targets: particle,
      opacity: [
        { value: 0, duration: 0 },
        { value: 0.9, duration: duration * 0.15 }, // Fade in fast
        { value: 0, duration: duration * 0.85, easing: 'easeInQuad' } // Fade out
      ],
      translateY: travelY,
      translateX: travelX,
      scale: [
        { value: 0.3, duration: 0 },
        { value: 1.4, duration: duration * 0.4, easing: 'easeOutQuad' }, // Puff up
        { value: 0, duration: duration * 0.6, easing: 'easeInQuad' } // Shrink away
      ],
      easing: 'easeOutQuad',
      duration: duration,
      complete: () => {
        if (particle.isConnected) particle.remove();
      }
    });
  } catch (err) {
    console.warn("Error creating fire particle", err);
  }
}

export function updateFireIntensity(stickersMap) {
  const count = stickersMap.size;
  setFireIntensity(count);
}

export function setFireIntensity(count) {
  // 0 to 700 stickers maps to 0 to 1 intensity
  const maxStickers = 700;
  const minIntensity = 0.0; // Changed to 0 so 0 stickers = no fire
  const progress = Math.min(count / maxStickers, 1);
  
  fireState.intensity = minIntensity + (progress * (1 - minIntensity));
  bottomFireState.intensity = fireState.intensity;
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
  return resonanceState.heat;
}

export function playResonanceEffect(remoteHeat = null) {
  // Sync: If remote heat is higher, catch up immediately
  if (remoteHeat !== null && typeof remoteHeat === "number") {
    if (remoteHeat > resonanceState.heat) {
      resonanceState.heat = remoteHeat;
    }
  }

  // Add heat on click
  resonanceState.heat = Math.min(HEAT_CONFIG.maxHeat, resonanceState.heat + HEAT_CONFIG.gain);
  
  // Performance Protection:
  // If too many particles, reduce emission or skip
  const currentParticles = resonanceState.particles.length;
  if (currentParticles > 500) return; // Hard cap
  
  // Add particles
  // Always spawn 1 particle per click to avoid clutter
  let count = 1;
  
  // Throttle count if heavy load
  if (currentParticles > 300) count = Math.max(1, Math.floor(count / 2));

  for (let i = 0; i < count; i++) {
    // Size increases slightly with heat
    const baseSize = 10 + (resonanceState.heat / 20); 
    const size = baseSize + Math.random() * 10;
    
    const x = (5 + Math.random() * 90) * resonanceState.width / 100;
    const y = resonanceState.height + 40;
    
    // Gradual Color Transition with Jitter
    // Uses LOCAL heat state, so high-heat users see high-heat colors even from low-heat users
    const color = getHeatColor(resonanceState.heat);

    resonanceState.particles.push({
      x,
      y,
      size,
      color,
      vx: (Math.random() - 0.5) * 1.0,
      vy: -(2 + Math.random() * 2 + (resonanceState.heat / 25)), 
      life: 1,
      decay: 0.005 + Math.random() * 0.01
    });
  }
}

// New Resonance State (Canvas & Heat)
const resonanceState = {
  canvas: null,
  ctx: null,
  particles: [],
  heat: 0,
  width: 0,
  height: 0,
  lastTime: 0,
  onlineCount: 1
};

const HEAT_CONFIG = {
  baseDecay: 5,        // 基礎衰減：每秒降 5% (確保單人難以維持滿熱度)
  decayPerPerson: 0.3, // 人數加成：每人每秒多降 0.3% (人多時需要更多互動)
  gain: 0.5,           // 點擊增益：每下增加 0.5% (正常難度)
  maxHeat: 100
};

function getHeatColor(heat) {
  // Interpolate between Red (#ff5d5d) and Soft Warm Yellow (#ffeeb4)
  // Red: 255, 93, 93
  // Soft Yellow: 255, 238, 180
  
  // Clamp heat to 0-100
  const h = Math.max(0, Math.min(100, heat));
  const t = h / 100; // 0.0 to 1.0
  
  // Non-linear interpolation
  const easeT = t * t; 
  
  const baseR = 255;
  const baseG = 93 + (238 - 93) * easeT;
  const baseB = 93 + (180 - 93) * easeT;
  
  // Add random variation to avoid uniformity
  // Reduced jitter range for cleaner colors
  const jitter = (Math.random() - 0.5) * 40; 
  const r = Math.min(255, Math.max(180, baseR + jitter)); 
  const g = Math.min(255, Math.max(0, baseG + jitter));
  const b = Math.min(255, Math.max(0, baseB + jitter));

  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

export function updateOnlineCount(count) {
  resonanceState.onlineCount = Math.max(1, count);
}

function initResonanceCanvas() {
  if (mediaPrefersReducedMotion?.matches) return;
  
  const canvas = document.createElement("canvas");
  canvas.id = "resonanceCanvas";
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "850"; // Below playback overlay (900) but above wall
  
  // Fix: Append to wall-section to share stacking context with playbackOverlay
  // This ensures z-index 850 (hearts) < z-index 900 (playback overlay) works correctly
  const container = document.querySelector(".wall-section") || document.body;
  container.appendChild(canvas);
  
  resonanceState.canvas = canvas;
  resonanceState.ctx = canvas.getContext("2d");
  
  const resize = () => {
    resonanceState.width = window.innerWidth;
    resonanceState.height = window.innerHeight;
    canvas.width = resonanceState.width;
    canvas.height = resonanceState.height;
  };
  
  window.addEventListener("resize", resize);
  resize();
  
  startResonanceLoop();
}

function startResonanceLoop() {
  const loop = (time) => {
    requestAnimationFrame(loop);
    
    // Skip if tab is hidden to save battery
    if (document.hidden) return;

    const dt = (time - resonanceState.lastTime) / 1000;
    resonanceState.lastTime = time;
    
    if (dt > 0.1) return; // Skip large jumps
    
    // 1. Decay Heat
    // Dynamic Difficulty:
    // Base decay ensures single user cannot reach 100% (Need ~16 CPS to beat base decay of 8)
    // Scaling decay ensures large crowds still need to be active (~2.4 CPS per person)
    const currentDecay = Math.max(
      HEAT_CONFIG.baseDecay, 
      resonanceState.onlineCount * HEAT_CONFIG.decayPerPerson
    );

    // Default minimum heat: 1.2% (Very weak fire always present)
    const minHeat = 1.2;

    if (resonanceState.heat > minHeat) {
      resonanceState.heat = Math.max(minHeat, resonanceState.heat - (currentDecay * dt));
    } else if (resonanceState.heat < minHeat) {
      // Slowly recover to minHeat if below (e.g. on init)
      resonanceState.heat = Math.min(minHeat, resonanceState.heat + (dt * 2));
    }
    
    // Sync Holy Fire intensity
    if (holyFireState.ctx) {
        holyFireState.intensity = resonanceState.heat / 100;
    }

    // 2. Render Particles
    const ctx = resonanceState.ctx;
    ctx.clearRect(0, 0, resonanceState.width, resonanceState.height);
    
    // Random Sparkles at High Heat (>80%)
    // Replaces the previous full-screen flash
    if (resonanceState.heat > 80) {
      // Chance to spawn a sparkle based on heat
      // Reduced spawn chance for a more gentle effect
      // Heat 80 -> 2% chance, Heat 100 -> 10% chance
      const spawnChance = (resonanceState.heat - 80) / 200; 
      if (Math.random() < spawnChance) {
         const x = Math.random() * resonanceState.width;
         const y = Math.random() * resonanceState.height * 0.8; // Mostly top 80%
         const size = 2 + Math.random() * 4;
         
         resonanceState.particles.push({
            type: 'sparkle',
            x, y, size,
            life: 0, // Start at 0 for fade in
            maxLife: 1,
            state: 'in', // in, out
            decay: 0.01 + Math.random() * 0.01, // Slower decay/fade
            color: `rgba(255, 255, ${200 + Math.random() * 55}, 1)` // White/Yellowish
         });
      }
    }

    for (let i = resonanceState.particles.length - 1; i >= 0; i--) {
      const p = resonanceState.particles[i];
      
      if (p.type === 'sparkle') {
         // Handle Sparkle Lifecycle (Fade In -> Fade Out)
         if (p.state === 'in') {
             p.life += p.decay;
             if (p.life >= p.maxLife) {
                 p.life = p.maxLife;
                 p.state = 'out';
             }
         } else {
             p.life -= p.decay;
             if (p.life <= 0) {
                 resonanceState.particles.splice(i, 1);
                 continue;
             }
         }

         // Draw Sparkle (Cross/Star shape)
         ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
         ctx.fillStyle = p.color;
         ctx.save();
         ctx.translate(p.x, p.y);
         // Rotate slowly
         ctx.rotate(Date.now() * 0.001); 
         
         ctx.beginPath();
         // Draw 4-point star
         const s = p.size * (0.5 + p.life * 0.5); // Pulse size
         ctx.moveTo(0, -s * 2);
         ctx.quadraticCurveTo(s * 0.2, -s * 0.2, s * 2, 0);
         ctx.quadraticCurveTo(s * 0.2, s * 0.2, 0, s * 2);
         ctx.quadraticCurveTo(-s * 0.2, s * 0.2, -s * 2, 0);
         ctx.quadraticCurveTo(-s * 0.2, -s * 0.2, 0, -s * 2);
         ctx.fill();
         ctx.restore();
         continue;
      }

      // Generic decay for other particles (Hearts)
      p.life -= p.decay;
      if (p.life <= 0) {
        resonanceState.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx;
      p.y += p.vy;
      
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      
      const size = p.size * p.life; 
      ctx.save();
      ctx.translate(p.x, p.y);
      
      // Draw Heart
      ctx.beginPath();
      const topCurveHeight = size * 0.3;
      ctx.moveTo(0, topCurveHeight);
      ctx.bezierCurveTo(0, 0, -size / 2, 0, -size / 2, topCurveHeight);
      ctx.bezierCurveTo(-size / 2, size / 2, 0, size * 0.8, 0, size);
      ctx.bezierCurveTo(0, size * 0.8, size / 2, size / 2, size / 2, topCurveHeight);
      ctx.bezierCurveTo(size / 2, 0, 0, 0, 0, topCurveHeight);
      ctx.fill();
      
      // Add Glow if hot
      if (resonanceState.heat > 50) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = "rgba(255, 200, 100, 0.5)";
        ctx.fill();
      }
      
      ctx.restore();
    }
  };
  requestAnimationFrame(loop);
}

function initBottomFire() {
  if (mediaPrefersReducedMotion?.matches) return;
  
  // Create canvas for the doom fire effect
  const canvas = document.createElement("canvas");
  canvas.id = "bottomFireCanvas";
  // Low resolution for performance and "blur" effect
  const w = 160;
  const h = 100;
  canvas.width = w;
  canvas.height = h;
  
  // Style to stretch it across the bottom
  Object.assign(canvas.style, {
    position: "fixed",
    bottom: "0",
    left: "0",
    width: "100%",
    height: "40vh", // Increased height for smoother fade
    pointerEvents: "none",
    zIndex: "-1", // Behind everything (Mist is 0, Wall is 1)
    opacity: "0.5", // Reduced opacity for better blending
    mixBlendMode: "screen",
    filter: "blur(12px)", // Increased blur
    maskImage: "linear-gradient(to top, rgba(0,0,0,1) 20%, rgba(0,0,0,0.8) 60%, rgba(0,0,0,0) 100%)", // Multi-stop gradient
    webkitMaskImage: "linear-gradient(to top, rgba(0,0,0,1) 20%, rgba(0,0,0,0.8) 60%, rgba(0,0,0,0) 100%)"
  });

  // Append to main to layer correctly between background and content
  const main = document.querySelector("main");
  if (main) {
    main.appendChild(canvas);
  } else {
    document.body.appendChild(canvas);
  }
  
  bottomFireState.canvas = canvas;
  bottomFireState.ctx = canvas.getContext("2d");
  bottomFireState.width = w;
  bottomFireState.height = h;
  bottomFireState.firePixels = new Array(w * h).fill(0);
  
  startBottomFireLoop();
}

const holyFireState = {
  canvas: null,
  ctx: null,
  firePixels: [],
  width: 0,
  height: 0,
  intensity: 0,
  displayIntensity: 0, // Lagging intensity for smooth rise
  paletteRGB: null
};

function initHolyFire() {
  if (mediaPrefersReducedMotion?.matches) return;
  
  const canvas = document.createElement("canvas");
  canvas.id = "holyFireCanvas";
  const w = 160;
  const h = 100;
  canvas.width = w;
  canvas.height = h;
  
  Object.assign(canvas.style, {
    position: "fixed",
    bottom: "0",
    left: "0",
    width: "100%",
    height: "90vh", // Increased height to reach above eagle
    pointerEvents: "none",
    zIndex: "10", // Behind wall-stage (20)
    opacity: "0.8", 
    mixBlendMode: "screen", // Additive blending
    filter: "blur(10px)",
    // Mask out the bottom 15% to keep UI clear
    maskImage: "linear-gradient(to top, rgba(0,0,0,1) 10%, rgba(0,0,0,0) 100%)",
    webkitMaskImage: "linear-gradient(to top, rgba(0,0,0,1) 10%, rgba(0,0,0,0) 100%)"
  });
  
  // Append to wall-section to be in the correct stacking context
  const container = document.querySelector(".wall-section") || document.body;
  container.appendChild(canvas);
  
  holyFireState.canvas = canvas;
  holyFireState.ctx = canvas.getContext("2d");
  holyFireState.width = w;
  holyFireState.height = h;
  holyFireState.firePixels = new Array(w * h).fill(0);
  
  startHolyFireLoop();
}

function startHolyFireLoop() {
  const { width, height, firePixels, ctx } = holyFireState;
  let lastTime = 0;
  // Performance: Reduce FPS on mobile or if tab is hidden
  const isMobile = window.innerWidth < 768;
  const fps = isMobile ? 10 : 15; 
  const interval = 1000 / fps;
  
  const update = (time) => {
    requestAnimationFrame(update);
    
    // Skip if tab is hidden to save battery
    if (document.hidden) return;

    const delta = time - lastTime;
    if (delta < interval) return;
    lastTime = time - (delta % interval);

    // Smoothly interpolate display intensity towards target intensity
    // This prevents the fire from "jumping" up instantly
    const targetIntensity = holyFireState.intensity;
    const diff = targetIntensity - holyFireState.displayIntensity;
    if (Math.abs(diff) > 0.001) {
        holyFireState.displayIntensity += diff * 0.005; // Very slow ease-in for gradual rise
    } else {
        holyFireState.displayIntensity = targetIntensity;
    }

    // 1. Update Source based on intensity
    // Intensity 0 = No fire, Intensity 1 = Raging fire
    const intensity = holyFireState.displayIntensity;
    
    // Only generate source if intensity > 0
    if (intensity > 0.01) {
      for (let x = 0; x < width; x++) {
        const index = (height - 1) * width + x;
        // Source probability increases with intensity
        // Cap visual density at ~40% (0.4 multiplier) to keep it looking like flames not a block
        if (Math.random() < (intensity * 0.4)) {
           // Scale max heat by intensity so low intensity = short fire
           // Was fixed at 36, now 18 to 36 based on intensity
           const maxHeat = 18 + (intensity * 18);
           firePixels[index] = Math.floor(maxHeat); 
        } else {
           firePixels[index] = Math.max(0, firePixels[index] - 2);
        }
      }
    } else {
      // Extinguish source
      for (let x = 0; x < width; x++) {
        const index = (height - 1) * width + x;
        firePixels[index] = Math.max(0, firePixels[index] - 4);
      }
    }

    // 2. Propagate
    for (let x = 0; x < width; x++) {
      for (let y = 1; y < height; y++) {
        const srcIndex = y * width + x;
        const pixelHeat = firePixels[srcIndex];
        
        if (pixelHeat === 0) {
          firePixels[srcIndex - width] = 0;
        } else {
          // Decay logic
          // Higher intensity = Less decay = Taller fire
          // To reach top (height 100), we need very low decay at max intensity
          // At intensity 1.0: decayChance = 0.55 - 0.53 = 0.02 (2% chance to decay)
          const decayChance = 0.55 - (intensity * 0.53); 
          const decay = Math.random() < decayChance ? 1 : 0;
          const dstIndex = srcIndex - width + (Math.random() > 0.5 ? 1 : -1); // More turbulent wind
          
          if (dstIndex >= 0 && dstIndex < width * height) {
             firePixels[dstIndex] = Math.max(0, pixelHeat - decay);
          }
        }
      }
    }

    // 3. Render
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;
    
    if (!holyFireState.paletteRGB) {
       // Golden/Holy Fire Palette
       // Transparent -> GoldenRod -> Gold -> LightYellow -> White
       holyFireState.paletteRGB = [
        [0,0,0,0],
        [184,134,11,0], [184,134,11,10], [218,165,32,30], // Dark GoldenRod
        [218,165,32,60], [255,215,0,90], [255,215,0,120], // Gold
        [255,223,0,150], [255,223,0,180], [255,255,0,200], // Yellow
        [255,255,100,220], [255,255,150,230], [255,255,200,240], // Light Yellow
        [255,255,220,250], [255,255,240,255], [255,255,255,255], // White
        // Fill rest with white
        ...Array(21).fill([255,255,255,255])
      ];
    }
    
    const paletteRGB = holyFireState.paletteRGB;
    
    for (let i = 0; i < firePixels.length; i++) {
      const heat = firePixels[i];
      // Map heat 0-36 to palette
      const color = paletteRGB[Math.min(36, heat)] || paletteRGB[0];
      const baseIdx = i * 4;
      data[baseIdx] = color[0];
      data[baseIdx + 1] = color[1];
      data[baseIdx + 2] = color[2];
      data[baseIdx + 3] = color[3];
    }
    
    ctx.putImageData(imgData, 0, 0);
  };
  
  update(0);
}

function startBottomFireLoop() {
  const { width, height, firePixels, ctx } = bottomFireState;
  let lastTime = 0;
  // Performance: Reduce FPS on mobile or if tab is hidden
  const isMobile = window.innerWidth < 768;
  const fps = isMobile ? 8 : 12; 
  const interval = 1000 / fps;
  
  const update = (time) => {
    bottomFireState.animationId = requestAnimationFrame(update);
    
    // Skip if tab is hidden to save battery
    if (document.hidden) return;

    const delta = time - lastTime;
    if (delta < interval) return;
    
    lastTime = time - (delta % interval);

    // 1. Update Fire Source (Bottom Row) based on intensity
    const intensity = bottomFireState.intensity; 
    // User wants constant "max" color/source, so we use a fixed high value for source generation
    // But if intensity is 0, we turn off the source
    const sourceIntensity = intensity > 0.01 ? 0.85 : 0; 
    
    for (let x = 0; x < width; x++) {
      const index = (height - 1) * width + x;
      // Randomize heat source
      if (Math.random() < sourceIntensity) {
         firePixels[index] = 36; // Max heat
      } else {
         firePixels[index] = Math.max(0, firePixels[index] - 1);
      }
    }

    // 2. Propagate Fire
    for (let x = 0; x < width; x++) {
      for (let y = 1; y < height; y++) {
        const srcIndex = y * width + x;
        const pixelHeat = firePixels[srcIndex];
        
        if (pixelHeat === 0) {
          firePixels[srcIndex - width] = 0;
        } else {
          // Dynamic decay based on intensity: Higher intensity = Lower decay chance = Taller fire
          // Intensity 0.2 -> ~65% decay chance (Short fire)
          // Intensity 1.0 -> ~5% decay chance (Tall fire)
          const decayChance = 0.8 - (intensity * 0.75);
          const decay = Math.random() < decayChance ? 1 : 0;
          
          const dstIndex = srcIndex - width + (Math.random() > 0.5 ? 1 : 0); // Slight wind
          
          if (dstIndex >= 0 && dstIndex < width * height) {
             firePixels[dstIndex] = Math.max(0, pixelHeat - decay);
          }
        }
      }
    }

    // 3. Render
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;
    
    if (!bottomFireState.paletteRGB) {
       // Modified palette: Low heat colors are now transparent/semi-transparent to avoid "black smoke" look
       bottomFireState.paletteRGB = [
        [0,0,0,0],
        [31,7,7,0],[47,15,7,0],[71,15,7,0], // 1-3: Fully transparent (was dark red/black)
        [87,23,7,20],[103,31,7,50],[119,31,7,80],[143,39,7,110], // 4-7: Fading in
        [159,47,7,150],[175,63,7,190],[191,71,7,220],[199,71,7,255], // 8-11: Becoming opaque
        [223,79,7,255],[223,87,7,255],[223,87,7,255],[215,95,7,255],
        [215,95,7,255],[215,103,15,255],[207,111,15,255],[207,119,15,255],[207,127,15,255],[207,135,23,255],[199,135,23,255],[199,143,23,255],
        [199,151,31,255],[191,159,31,255],[191,159,31,255],[191,167,39,255],[191,167,39,255],[191,175,47,255],[183,175,47,255],[183,183,47,255],
        [183,183,55,255],[207,207,111,255],[223,223,159,255],[239,239,199,255],[255,255,255,255],[255,255,255,255]
      ];
    }
    
    const paletteRGB = bottomFireState.paletteRGB;
    
    for (let i = 0; i < firePixels.length; i++) {
      const heat = firePixels[i];
      const color = paletteRGB[Math.min(36, heat)] || paletteRGB[0];
      const baseIdx = i * 4;
      data[baseIdx] = color[0];     // R
      data[baseIdx + 1] = color[1]; // G
      data[baseIdx + 2] = color[2]; // B
      data[baseIdx + 3] = color[3]; // A
    }
    
    ctx.putImageData(imgData, 0, 0);
  };
  
  update(0);
}

const celebrationState = {
  canvas: null,
  ctx: null,
  particles: [],
  width: 0,
  height: 0,
  lastTime: 0
};

function initCelebrationMist() {
  if (mediaPrefersReducedMotion?.matches) return;

  const canvas = document.createElement("canvas");
  canvas.id = "celebrationMistCanvas";
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "0"; // Above Fire (-1), Below Wall (1)
  canvas.style.mixBlendMode = "screen";
  canvas.style.opacity = "0.8";
  
  // Append to main to layer correctly
  const main = document.querySelector("main");
  if (main) {
    main.appendChild(canvas);
  } else {
    document.body.appendChild(canvas);
  }

  celebrationState.canvas = canvas;
  celebrationState.ctx = canvas.getContext("2d");

  const resize = () => {
    celebrationState.width = window.innerWidth;
    celebrationState.height = window.innerHeight;
    canvas.width = celebrationState.width;
    canvas.height = celebrationState.height;
  };
  
  window.addEventListener("resize", resize);
  resize();
  
  startCelebrationLoop();
}

function startCelebrationLoop() {
  const loop = (time) => {
    requestAnimationFrame(loop);
    if (document.hidden) return;

    const dt = (time - celebrationState.lastTime) / 1000;
    celebrationState.lastTime = time;
    if (dt > 0.1) return;

    const ctx = celebrationState.ctx;
    const { width, height, particles } = celebrationState;
    
    // Clear with fade effect for trails? No, just clear for mist
    ctx.clearRect(0, 0, width, height);

    // 1. Spawn Particles based on intensity
    // Only active if intensity is high (> 0.5)
    const intensity = fireState.intensity;
    
    // Initialize timer if needed
    if (celebrationState.spawnTimer === undefined) celebrationState.spawnTimer = 0;
    celebrationState.spawnTimer += dt;

    if (intensity > 0.5) {
      // Continuous flow: Use timer instead of random chance to avoid gaps
      // Target: ~1 particle/sec at max intensity (Interval 1.0s) - Very slow and calm
      const baseInterval = 1.0; 
      const spawnRate = (intensity - 0.5) * 2; // 0 to 1
      const currentInterval = baseInterval / Math.max(0.1, spawnRate);
      
      if (celebrationState.spawnTimer > currentInterval) {
        celebrationState.spawnTimer = 0; // Reset timer
        // Spawn a "Mist Burst"
        // Position: Random in top 70% of screen (Wider area)
        const x = Math.random() * width;
        const y = Math.random() * (height * 0.7); 
        
        // Varied Colors: More Gold/White focus for brightness
        const hue = 30 + Math.random() * 25; // 30-55
        const sat = 80 + Math.random() * 20; // Vibrant
        const light = 70 + Math.random() * 30; // Bright
        
        const mainColor = `hsla(${hue}, ${sat}%, ${light}%,`;
        const coreColor = `hsla(${hue}, ${sat}%, 95%,`; // Almost white core
        
        particles.push({
          x, y,
          size: 0, // Start small
          maxSize: 100 + Math.random() * 150, // Much Larger & Grand (100px - 250px)
          life: 0,
          maxLife: 6 + Math.random() * 4, // Very slow turnover (6-10s)
          mainColor,
          coreColor,
          vx: (Math.random() - 0.5) * 6, // Very slow drift
          vy: -5 - Math.random() * 10 // Very slow upward float
        });
      }
    }

    // 2. Update & Render
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      
      if (p.life >= p.maxLife) {
        particles.splice(i, 1);
        continue;
      }

      // Move
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      
      // Grow
      const progress = p.life / p.maxLife;
      // Ease out size: Fast grow, slow finish
      const sizeProgress = 1 - Math.pow(1 - progress, 3);
      const currentSize = p.maxSize * sizeProgress;
      
      // Fade: Smoother fade in to avoid "pop"
      let alpha = 0;
      const fadeInDuration = 0.25; // Longer fade in (25% of life)
      
      if (progress < fadeInDuration) {
        // Ease in alpha: starts very transparent
        const t = progress / fadeInDuration;
        alpha = t * t; 
      } else {
        alpha = 1 - ((progress - fadeInDuration) / (1 - fadeInDuration));
      }
      // Balanced opacity: Visible but not harsh
      alpha *= 0.75; 

      // Draw Soft Orb with Richer Gradient
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, currentSize);
      // Core (Bright)
      gradient.addColorStop(0, p.coreColor + alpha + ")");
      // Body (Soft orb structure)
      gradient.addColorStop(0.25, p.mainColor + (alpha * 0.8) + ")");
      // Glow (Atmospheric falloff)
      gradient.addColorStop(0.6, p.mainColor + (alpha * 0.2) + ")");
      // Edge (Transparent)
      gradient.addColorStop(1, p.mainColor + "0)"); 
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  requestAnimationFrame(loop);
}

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
const pixiFireSystem = {
  particles: [],
  spawnTimer: 0,
  active: false,
  texture: null,
  spawnPoints: [],
  center: { x: 0, y: 0 },
  container: null
};

function initPixiFireEffect() {
  // Reuse eagle paths for fire emission
  const pathNodes = Array.from(document.querySelectorAll("#eagleBody, #eagleTail"));
  const pathEntries = pathNodes
    .map((path) => {
      try {
        const length = path.getTotalLength();
        if (!Number.isFinite(length) || length <= 0) return null;
        return { path, length };
      } catch (error) { return null; }
    })
    .filter(Boolean);

  if (!pathEntries.length) return;

  // Pre-calculate spawn points
  pixiFireSystem.spawnPoints = [];
  const sampleResolution = 3; 
  pathEntries.forEach(entry => {
    const steps = Math.floor(entry.length / sampleResolution);
    for (let i = 0; i <= steps; i++) {
      try {
        const point = entry.path.getPointAtLength(i * sampleResolution);
        pixiFireSystem.spawnPoints.push({ x: point.x, y: point.y });
      } catch (e) {}
    }
  });

  if (pixiFireSystem.spawnPoints.length === 0) return;

  // Center of mass
  let totalX = 0, totalY = 0;
  pixiFireSystem.spawnPoints.forEach(p => { totalX += p.x; totalY += p.y; });
  pixiFireSystem.center = { x: totalX / pixiFireSystem.spawnPoints.length, y: totalY / pixiFireSystem.spawnPoints.length };

  fireState.active = true;
  pixiFireSystem.active = true;
  pixiFireSystem.texture = getCircleTexture();
  pixiFireSystem.container = pixiBgLayer;

  // Start the update loop
  if (!pixiFireSystem.loopRunning) {
      pixiFireSystem.loopRunning = true;
      pixiApp.ticker.add(updatePixiFire);
  }
}

function updatePixiFire(delta) {
    if (!fireState.active || !pixiFireSystem.active) return;
    
    const intensity = fireState.intensity;
    const isMobile = window.innerWidth < 768;
    
    // 1. Spawn Logic
    if (intensity > 0.01) {
        let delayBase = isMobile ? 20 : 15; // Frames between spawns (approx)
        // Higher intensity = lower delay
        const spawnDelay = Math.max(2, delayBase - (intensity * (delayBase - 5)));
        
        pixiFireSystem.spawnTimer += delta;
        
        if (pixiFireSystem.spawnTimer >= spawnDelay) {
            pixiFireSystem.spawnTimer = 0;
            
            let maxBatch = isMobile ? 1 : 2; 
            const batchSize = 1 + Math.floor(intensity * (maxBatch - 1));
            
            for (let i = 0; i < batchSize; i++) {
                spawnPixiFireParticle(intensity, isMobile);
            }
        }
    }

    // 2. Update Particles
    for (let i = pixiFireSystem.particles.length - 1; i >= 0; i--) {
        const p = pixiFireSystem.particles[i];
        p.life += delta;
        
        // Normalized life (0 to 1)
        const progress = p.life / p.maxLife;
        
        if (progress >= 1) {
            // Kill
            p.sprite.destroy();
            pixiFireSystem.particles.splice(i, 1);
            continue;
        }
        
        // Movement
        p.sprite.x += p.vx * delta;
        p.sprite.y += p.vy * delta;
        
        // Alpha: Fade in fast (15%), Fade out slow (85%)
        if (progress < 0.15) {
            p.sprite.alpha = (progress / 0.15) * 0.9;
        } else {
            p.sprite.alpha = (1 - ((progress - 0.15) / 0.85)) * 0.9;
        }
        
        // Scale: Puff up then shrink
        // Start: 0.3, Peak: 1.4 at 40%, End: 0
        let scale = 0;
        if (progress < 0.4) {
            // 0.3 -> 1.4
            const t = progress / 0.4;
            // Ease out quad
            const ease = 1 - (1 - t) * (1 - t);
            scale = p.baseSize * (0.3 + (ease * 1.1));
        } else {
            // 1.4 -> 0
            const t = (progress - 0.4) / 0.6;
            // Ease in quad
            const ease = t * t;
            scale = p.baseSize * (1.4 * (1 - ease));
        }
        
        p.sprite.width = scale;
        p.sprite.height = scale;
    }
}

function spawnPixiFireParticle(intensity, isMobile) {
    const point = pixiFireSystem.spawnPoints[Math.floor(Math.random() * pixiFireSystem.spawnPoints.length)];
    if (!point) return;

    const sprite = new PIXI.Sprite(pixiFireSystem.texture);
    sprite.anchor.set(0.5);
    
    const jitter = 15 + (intensity * 25);
    const startX = point.x + (Math.random() - 0.5) * jitter;
    const startY = point.y + (Math.random() - 0.5) * jitter;
    
    sprite.x = startX;
    sprite.y = startY;
    
    const mobileScale = isMobile ? 1.5 : 1;
    const baseSize = (2 + (intensity * 4)) * mobileScale; 
    const size = baseSize * (0.8 + Math.random() * 0.4); 
    
    sprite.width = size * 0.3; // Start small
    sprite.height = size * 0.3;
    
    // Color
    const colors = [0xFFD700, 0xFFA500, 0xFF8C00, 0xFF4500];
    sprite.tint = colors[Math.floor(Math.random() * colors.length)];
    sprite.alpha = 0;
    sprite.blendMode = PIXI.BLEND_MODES.SCREEN;

    pixiFireSystem.container.addChild(sprite);

    // Calculate Velocity
    // Duration in frames (assuming 60fps)
    // 2.5s - 4.5s -> 150 - 270 frames
    const maxLife = 150 + Math.random() * 120;
    
    const dx = startX - pixiFireSystem.center.x;
    const dy = startY - pixiFireSystem.center.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    let dirX = dx / dist;
    let dirY = dy / dist;
    dirY -= 0.8; // Upward bias
    const newDist = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    dirX /= newDist;
    dirY /= newDist;

    // Speed per frame
    // Original speed was ~15-40 pixels over duration? No, speed was per second in anime?
    // Anime.js translateX is total distance.
    // Original: speed = 15 + (intensity * 25) + random(10)
    // This was the TOTAL travel distance? No, that seems small for 2.5s.
    // Wait, in createPixiFireParticle:
    // const travelX = dirX * speed;
    // x: startX + travelX
    // So 'speed' was actually 'distance'.
    // 15-50 pixels travel over 2.5s is very slow.
    // Let's match that.
    const totalDist = 15 + (intensity * 25) + (Math.random() * 10);
    const vx = (dirX * totalDist) / maxLife;
    const vy = (dirY * totalDist) / maxLife;

    pixiFireSystem.particles.push({
        sprite,
        vx, vy,
        life: 0,
        maxLife,
        baseSize: size
    });
}

// --- Optimized Pixi Ambient Glow ---
const pixiAmbientSystem = {
    particles: [],
    active: false
};

function initPixiAmbientGlow() {
  // Clear existing
  pixiBgLayer.removeChildren();
  pixiAmbientSystem.particles = [];
  
  const pathNodes = Array.from(document.querySelectorAll("#eagleBody, #eagleTail"));
  const pathEntries = pathNodes
    .map((path) => {
      try {
        const length = path.getTotalLength();
        if (!Number.isFinite(length) || length <= 0) return null;
        return { path, length };
      } catch (error) { return null; }
    })
    .filter(Boolean);

  if (!pathEntries.length) return;

  const combinedLength = pathEntries.reduce((sum, entry) => sum + entry.length, 0);
  const isCompactViewport = window.innerWidth < 768;
  const sparkCount = isCompactViewport ? 15 : 25; 
  const averageSpacing = combinedLength / sparkCount;
  const jitterWindow = Math.min(averageSpacing * 0.8, 250);

  const texture = getCircleTexture();

  for (let i = 0; i < sparkCount; i += 1) {
    const offset = averageSpacing * i + (Math.random() - 0.5) * jitterWindow;
    const normalizedCombined = ((offset % combinedLength) + combinedLength) % combinedLength;

    let remaining = normalizedCombined;
    let targetEntry = pathEntries[0];
    for (const entry of pathEntries) {
      if (remaining <= entry.length) {
        targetEntry = entry;
        break;
      }
      remaining -= entry.length;
    }

    let point;
    try {
      point = targetEntry.path.getPointAtLength(Math.max(0, remaining));
    } catch (error) { continue; }
    
    if (!point) continue;

    const jitterX = window.anime.random(-30, 30);
    const jitterY = window.anime.random(-30, 30);
    
    const maxRadius = window.anime.random(10, 25); 
    const maxOpacity = window.anime.random(30, 60) / 100; 
    
    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.x = point.x + jitterX;
    sprite.y = point.y + jitterY;
    sprite.width = 0; 
    sprite.height = 0;
    sprite.alpha = 0;
    sprite.tint = 0xFFE4BC; 
    
    pixiBgLayer.addChild(sprite);
    
    // Init particle state
    pixiAmbientSystem.particles.push({
        sprite,
        startX: sprite.x,
        startY: sprite.y,
        maxSize: maxRadius * 2,
        maxOpacity,
        drift: (Math.random() - 0.5) * 40,
        // Random start phase
        timer: Math.random() * 300, // frames
        duration: 180 + Math.random() * 120, // 3-5 seconds (at 60fps)
        state: 'in' // in, out, wait
    });
  }

  if (!pixiAmbientSystem.loopRunning) {
      pixiAmbientSystem.loopRunning = true;
      pixiApp.ticker.add(updatePixiAmbient);
  }
}

function updatePixiAmbient(delta) {
    for (const p of pixiAmbientSystem.particles) {
        p.timer += delta;
        
        // Cycle: Wait -> In -> Out -> Wait
        // Wait: 0 to delay
        // In: delay to delay+halfDuration
        // Out: delay+halfDuration to delay+duration
        
        // Simplified state machine
        const halfDur = p.duration * 0.5;
        
        if (p.timer > p.duration) {
            // Reset
            p.timer = 0;
            p.duration = 180 + Math.random() * 120;
            // Randomize position slightly again? No, keep anchor.
        }
        
        const progress = p.timer / p.duration;
        
        if (progress < 0.5) {
            // Fade In & Rise
            // 0 -> 1
            const t = progress * 2; 
            // Ease out sine
            const ease = Math.sin(t * Math.PI / 2);
            
            p.sprite.width = p.maxSize * ease;
            p.sprite.height = p.maxSize * ease;
            p.sprite.alpha = p.maxOpacity * ease;
            p.sprite.x = p.startX + (p.drift * 0.5 * ease);
            p.sprite.y = p.startY - (30 * ease);
        } else {
            // Fade Out & Rise Further
            // 1 -> 0
            const t = (progress - 0.5) * 2;
            // Ease in sine
            const ease = 1 - Math.cos(t * Math.PI / 2); // 0 to 1
            const invEase = 1 - ease; // 1 to 0
            
            p.sprite.width = p.maxSize * invEase;
            p.sprite.height = p.maxSize * invEase;
            p.sprite.alpha = p.maxOpacity * invEase;
            
            // Continue moving up
            // From -30 to -60
            const yOffset = 30 + (30 * ease);
            p.sprite.y = p.startY - yOffset;
            
            // Continue drift
            // From 0.5 to 1.0
            const driftOffset = 0.5 + (0.5 * ease);
            p.sprite.x = p.startX + (p.drift * driftOffset);
        }
    }
}

function playPixiProjectile(screenX, screenY, targetX, targetY, onComplete) {
  // 1. Determine Start Position (Top-Left SUPER FAR off-screen)
  // Concentrated in the far top-left with slight jitter
  const startScreenX = -window.innerWidth * 0.4 + (Math.random() * 100); 
  const startScreenY = -window.innerHeight * 0.4 + (Math.random() * 100);

  // Convert Screen coords to World coords (Pixi Stage)
  // Assuming pixiEffectsLayer is in the world space (scaled/panned)
  // We need to inverse transform the screen point to world point
  // But wait, screenX/Y passed in are usually SVG coordinates or Screen coordinates?
  // playProjectile receives screenX/Y but then converts them using getScreenCTM().inverse().
  // Here we assume targetX/targetY are already in World Space (because they come from sticker.x/y).
  // We need to calculate startX/startY in World Space.
  
  // Since we don't have easy access to the viewport transform here (it's in ZoomController),
  // we can try to approximate or just use a very far point relative to target.
  // Or better, if we can access the stage transform.
  // pixiEffectsLayer.parent is likely the stage or a container with the transform.
  
  let startX = startScreenX;
  let startY = startScreenY;
  
  if (pixiEffectsLayer.parent) {
      const worldStart = pixiEffectsLayer.parent.toLocal({x: startScreenX, y: startScreenY});
      startX = worldStart.x;
      startY = worldStart.y;
  }

  const container = new PIXI.Container();
  container.x = startX;
  container.y = startY;
  container.rotation = Math.atan2(targetY - startY, targetX - startX);
  
  // Beam - Outer Glow (Gradient Tail)
  // Simulated with a long sprite or graphics with gradient texture
  const beamLength = 60; // Reduced from 120
  const beam = new PIXI.Graphics();
  // Gradient simulation: multiple rects or texture
  // Simple white line with alpha fade
  beam.beginFill(0xFFFFFF);
  beam.drawRect(-beamLength, -3, beamLength, 6); // Thinner: height 6 instead of 12
  beam.endFill();
  beam.alpha = 0.4; // Slightly lower alpha for subtler look
  
  // Beam - Core
  const core = new PIXI.Graphics();
  core.beginFill(0xFFFFFF);
  core.drawRect(-25, -1, 25, 2); // Shorter and thinner core
  core.endFill();
  core.alpha = 0.9;
  
  // Tip
  const tip = new PIXI.Graphics();
  tip.beginFill(0xFFFFFF);
  tip.drawCircle(0, 0, 2.5); // Smaller tip
  tip.endFill();
  
  container.addChild(beam, core, tip);
  // Add blend mode
  container.filters = [new PIXI.filters.AlphaFilter()]; // Just to ensure alpha works well? No.
  // Use blend mode on children
  beam.blendMode = PIXI.BLEND_MODES.SCREEN;
  core.blendMode = PIXI.BLEND_MODES.SCREEN;
  
  pixiEffectsLayer.addChild(container);
  
  const timeline = registerAnime(window.anime.timeline({
      easing: 'easeInQuad',
      complete: () => {
          container.destroy({ children: true });
          if (onComplete) onComplete();
      }
  }));
  
  timeline.add({
      targets: container,
      x: targetX,
      y: targetY,
      duration: 750
  });
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

