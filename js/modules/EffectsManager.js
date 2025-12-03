
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
  initFireEffect();
  initBottomFire();
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

export function initAmbientGlow() {
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
  const sparkCount = isCompactViewport ? 12 : 22;
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
  paused: false
};

export function setShimmerPaused(paused) {
  shimmerState.paused = paused;
}

export function initShimmerSystem(stickersMap, state) {
  const runLoop = () => {
    if (shimmerState.paused) {
      setTimeout(runLoop, 1000);
      return;
    }

    const stickers = Array.from(stickersMap.values());
    if (stickers.length > 0) {
      // Max 3 concurrent shimmers
      const currentShimmers = document.querySelectorAll('.sticker-node.shimmering').length;
      
      if (currentShimmers < 3) {
        // Filter stickers from the last 24 hours
        const now = Date.now();
        const twentyFourHoursMs = 24 * 60 * 60 * 1000;
        
        const recentStickers = stickers.filter(s => {
          if (!s.created_at) return false;
          const created = new Date(s.created_at).getTime();
          return !Number.isNaN(created) && (now - created) < twentyFourHoursMs;
        });

        // Use recent stickers if available, otherwise fallback to all stickers
        const pool = recentStickers.length > 0 ? recentStickers : stickers;
        const randomRecord = pool[Math.floor(Math.random() * pool.length)];
        
        if (randomRecord && randomRecord.node && 
            state.pending?.id !== randomRecord.id &&
            state.drag?.node !== randomRecord.node &&
            !randomRecord.node.classList.contains("pending") &&
            !randomRecord.node.classList.contains("shimmering")) {
          triggerShimmer(randomRecord.node);
        }
      }
    }
    // Schedule next run between 1s and 5s
    setTimeout(runLoop, 1000 + Math.random() * 4000);
  };
  runLoop();
}

function triggerShimmer(node) {
  if (!node) return;
  
  // 1. Animate the sticker itself (brightness/scale)
  node.classList.add("shimmering");

  // 2. Create the cross shine in the effects layer (to avoid clipping by eagle edge)
  const cx = parseFloat(node.dataset.cx);
  const cy = parseFloat(node.dataset.cy);

  if (Number.isFinite(cx) && Number.isFinite(cy) && elements.effectsLayer) {
    const group = document.createElementNS(svgNS, "g");
    group.setAttribute("transform", `translate(${cx}, ${cy})`);
    group.style.pointerEvents = "none";

    const sparkle = document.createElementNS(svgNS, "path");
    sparkle.classList.add("shimmer-sparkle");
    // Long, thin cross shape (Radius 85px, very thin center)
    // This ensures the center doesn't obscure the sticker too much, while spikes are long
    sparkle.setAttribute("d", "M0,-85 C1,-15 15,-1 85,0 C15,1 1,15 0,85 C-1,15 -15,1 -85,0 C-15,-1 -1,-15 0,-85");
    
    group.appendChild(sparkle);
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
    safetyTimer = setTimeout(cleanup, 2400);
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
    
    // Performance throttling for mobile:
    // Reduce frequency (higher delay), but we will increase particle size to compensate
    let delayBase = isMobile ? 180 : 120;
    let delayMin = isMobile ? 60 : 30;
    
    // Spawn delay: decreases as intensity increases
    const delay = delayBase - (intensity * (delayBase - delayMin));
    
    // Batch size: fewer particles on mobile
    let maxBatch = isMobile ? 2 : 5;
    const batchSize = 1 + Math.floor(intensity * (maxBatch - 1));

    for (let i = 0; i < batchSize; i++) {
      createFireParticle(spawnPoints, fireGroup, intensity, isMobile);
    }

    setTimeout(spawnFireParticle, delay);
  };

  spawnFireParticle();
}

function createFireParticle(spawnPoints, container, intensity, isMobile) {
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

    // 3. Motion: "Raging" = Faster, higher, more turbulent
    const duration = 600 + Math.random() * 800; // Faster life (0.6s - 1.4s)
    const travelY = -80 - (intensity * 180) - (Math.random() * 60); // Higher reach
    const travelX = (Math.random() - 0.5) * (50 + intensity * 50); // Wider spread

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
  // 0 to 520 stickers maps to 0.2 to 1 intensity
  const maxStickers = 520;
  const minIntensity = 0.2;
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
    zIndex: "0",
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

function startBottomFireLoop() {
  const { width, height, firePixels, ctx } = bottomFireState;
  let lastTime = 0;
  const fps = 12; // Reduced FPS for slow burning effect
  const interval = 1000 / fps;
  
  const update = (time) => {
    bottomFireState.animationId = requestAnimationFrame(update);
    
    const delta = time - lastTime;
    if (delta < interval) return;
    
    lastTime = time - (delta % interval);

    // 1. Update Fire Source (Bottom Row) based on intensity
    const intensity = bottomFireState.intensity || 0.2;
    // User wants constant "max" color/source, so we use a fixed high value for source generation
    const sourceIntensity = 0.85; 
    
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

