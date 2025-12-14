
import * as Utils from "./Utils.js";
import * as EffectsManager from "./EffectsManager.js";

const PLAYBACK_SPEED_MS = 100; // Time between stickers (adjustable)
const MIN_PLAYBACK_DURATION_MS = 5000; // Minimum total duration
const MAX_PLAYBACK_DURATION_MS = 20000; // Maximum total duration

let dragStartX = 0;
let dragStartY = 0;
let isDragInteraction = false;

const state = {
  isPlaying: false,
  isFinished: false,
  animationFrame: null,
  sortedStickers: [],
  currentIndex: 0,
  lastFrameTime: 0,
  accumulatedTime: 0,
  intervalPerSticker: 50,
  startTimeout: null,
  sweepTriggered: false,
  elements: {
    dateContainer: null,
    yearDisplay: null,
    dateDisplay: null,
    counterDisplay: null,
    playButton: null,
    wallSvg: null,
    flashOverlay: null,
  },
  callbacks: {
    onStop: null,
    getStickers: null,
    onUpdateIntensity: null,
    onPlaybackStateChange: null,
    onPlaybackNearEnd: null,
    onPlaybackComplete: null,
  }
};

export function initPlaybackController(elements, callbacks) {
  state.elements = { ...state.elements, ...elements };
  state.callbacks = { ...state.callbacks, ...callbacks };
  
  // Find flash overlay if not provided
  if (!state.elements.flashOverlay) {
    state.elements.flashOverlay = document.getElementById("playbackFlash");
  }
  
  if (state.elements.playButton) {
    state.elements.playButton.addEventListener("click", togglePlayback);
  }
}

function attachGlobalListeners() {
  document.addEventListener("click", handleGlobalClick);
  document.addEventListener("pointerdown", handlePointerDown);
  document.addEventListener("pointerup", handlePointerUp);
}

function removeGlobalListeners() {
  document.removeEventListener("click", handleGlobalClick);
  document.removeEventListener("pointerdown", handlePointerDown);
  document.removeEventListener("pointerup", handlePointerUp);
}

function handlePointerDown(e) {
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  isDragInteraction = false;
}

function handlePointerUp(e) {
  const dist = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
  if (dist > 10) {
    isDragInteraction = true;
  }
}

function handleGlobalClick(e) {
  if (!state.isPlaying || !state.isFinished) return;

  // If this was a drag interaction, do not stop playback
  if (isDragInteraction) return;

  // Ignore clicks on controls
  if (e.target.closest(".zoom-controls")) return;

  // Stop playback if clicked outside
  stopPlayback();
}

function togglePlayback() {
  if (state.isPlaying) {
    stopPlayback();
  } else {
    if (state.callbacks.getStickers) {
      const stickers = state.callbacks.getStickers();
      startPlayback(stickers);
    }
  }
}

export function startPlayback(stickersMap) {
  if (state.isPlaying || !stickersMap || stickersMap.size === 0) return;

  state.isPlaying = true;
  state.isFinished = false;
  state.sweepTriggered = false;
  state.currentIndex = 0;
  state.lastFrameTime = performance.now();
  state.accumulatedTime = 0;

  // 1. Sort stickers by date
  state.sortedStickers = Array.from(stickersMap.values())
    .filter(s => s.created_at) // Ensure date exists
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (state.sortedStickers.length === 0) {
    stopPlayback();
    return;
  }

  // Calculate dynamic speed
  const totalStickers = state.sortedStickers.length;
  // Target duration between 5s and 20s depending on count
  const targetDuration = Utils.clampNumber(totalStickers * 100, MIN_PLAYBACK_DURATION_MS, MAX_PLAYBACK_DURATION_MS);
  state.intervalPerSticker = targetDuration / totalStickers;

  // 2. Prepare UI
  document.body.classList.add("playback-mode");
  document.body.classList.remove("playback-finished");
  
  // Ensure loading spinner is hidden
  const spinner = document.getElementById("loadingSpinner");
  if (spinner) spinner.classList.remove("visible");

  attachGlobalListeners();
  createSpotlight();

  if (state.elements.playButton) {
    state.elements.playButton.classList.add("is-playing");
    state.elements.playButton.textContent = "■"; // Stop symbol
    state.elements.playButton.setAttribute("aria-label", "停止播放");
  }
  
  // Trigger Start Flash
  if (state.elements.flashOverlay) {
    state.elements.flashOverlay.classList.remove("trigger-end");
    state.elements.flashOverlay.classList.add("trigger-start");
    setTimeout(() => {
      if (state.elements.flashOverlay) {
        state.elements.flashOverlay.classList.remove("trigger-start");
      }
    }, 1200);
  }

  // 3. Hide all stickers initially (with fade out)
  state.sortedStickers.forEach(s => {
    if (s.node) {
      // Fix: Clear any residual animations or inline styles that might block CSS transitions
      if (window.anime) window.anime.remove(s.node);
      s.node.classList.remove("pending", "review-pending", "review-blocked", "in-flight");
      s.node.style.removeProperty("transform");
      s.node.style.removeProperty("opacity");
      s.node.style.removeProperty("filter");
      
      s.node.classList.add("playback-preparing");
    }
  });

  // 4. Show Date Display
  if (state.elements.dateContainer) {
    state.elements.dateContainer.classList.add("visible");
    updateDateDisplay(state.sortedStickers[0].created_at);
    updateCounterDisplay(0, state.sortedStickers.length);
  }
  
  // Reset fire intensity to 0
  if (state.callbacks.onUpdateIntensity) {
    state.callbacks.onUpdateIntensity(0);
  }
  
  // Pause shimmer
  if (state.callbacks.onPlaybackStateChange) {
    state.callbacks.onPlaybackStateChange(true);
  }

  // 5. Start Loop after fade out delay
  if (state.startTimeout) clearTimeout(state.startTimeout);
  state.startTimeout = setTimeout(() => {
    if (!state.isPlaying) return; // Check if stopped during delay
    
    // Now actually hide them for the animation logic
    state.sortedStickers.forEach(s => {
      if (s.node) {
        s.node.classList.remove("playback-preparing");
        s.node.classList.add("playback-hidden");
        s.node.style.opacity = "0";
        s.node.style.transform = "scale(0)";
      }
    });
    
    state.lastFrameTime = performance.now();
    state.animationFrame = requestAnimationFrame(playbackLoop);
  }, 600);
}

export function stopPlayback() {
  if (!state.isPlaying) return;

  state.isPlaying = false;
  if (state.startTimeout) {
    clearTimeout(state.startTimeout);
    state.startTimeout = null;
  }
  if (state.animationFrame) {
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }

  // Restore UI
  document.body.classList.remove("playback-mode");
  document.body.classList.remove("playback-finished");
  removeGlobalListeners();

  if (state.elements.playButton) {
    state.elements.playButton.classList.remove("is-playing");
    state.elements.playButton.textContent = "▶"; // Play symbol
    state.elements.playButton.setAttribute("aria-label", "播放回顧");
  }

  if (state.elements.dateContainer) {
    state.elements.dateContainer.classList.remove("visible");
  }

  if (state.elements.spotlight) {
    state.elements.spotlight.classList.remove("active");
  }
  
  // Trigger End Flash
  if (state.elements.flashOverlay) {
    state.elements.flashOverlay.classList.remove("trigger-start");
    state.elements.flashOverlay.classList.add("trigger-end");
    setTimeout(() => {
      if (state.elements.flashOverlay) {
        state.elements.flashOverlay.classList.remove("trigger-end");
      }
    }, 1500);
  }

  // Show all stickers
  state.sortedStickers.forEach(s => {
    if (s.node) {
      s.node.classList.remove("playback-preparing");
      s.node.classList.remove("playback-hidden");
      s.node.style.removeProperty("opacity");
      s.node.style.removeProperty("transform");
      s.node.style.removeProperty("filter");
    }
  });
  
  // Restore fire intensity to full count
  if (state.callbacks.onUpdateIntensity) {
    state.callbacks.onUpdateIntensity(state.sortedStickers.length);
  }
  
  // Resume shimmer
  if (state.callbacks.onPlaybackStateChange) {
    state.callbacks.onPlaybackStateChange(false);
  }

  state.sortedStickers = [];
}

function playbackLoop(timestamp) {
  if (!state.isPlaying) return;

  const deltaTime = timestamp - state.lastFrameTime;
  state.lastFrameTime = timestamp;
  state.accumulatedTime += deltaTime;

  let itemsToReveal = 0;
  while (state.accumulatedTime >= state.intervalPerSticker) {
    itemsToReveal++;
    state.accumulatedTime -= state.intervalPerSticker;
  }

  if (itemsToReveal > 0) {
    // Check for near-end trigger (Sweep Effect)
    // Trigger when remaining time is close to sweep duration (2.5s)
    // We use 2600ms to ensure it starts slightly before the very end
    if (!state.sweepTriggered) {
      const remainingItems = state.sortedStickers.length - state.currentIndex;
      const timeRemaining = remainingItems * state.intervalPerSticker;
      
      if (timeRemaining <= 1500) {
        state.sweepTriggered = true;
        if (state.callbacks.onPlaybackNearEnd) {
          state.callbacks.onPlaybackNearEnd();
        }
      }
    }

    for (let i = 0; i < itemsToReveal; i++) {
      if (state.currentIndex >= state.sortedStickers.length) {
        // Finished
        state.isFinished = true;
        state.animationFrame = null;
        return; 
      }

      const sticker = state.sortedStickers[state.currentIndex];
      const isLast = state.currentIndex === state.sortedStickers.length - 1;
      
      // Calculate start position for projectile (Date Display)
      let startX = 0;
      let startY = window.innerHeight;
      if (state.elements.dateContainer) {
        const rect = state.elements.dateContainer.getBoundingClientRect();
        startX = rect.left + rect.width / 2;
        startY = rect.top + rect.height / 2;
      }

      // Fire projectile
      if (sticker.node && sticker.node.dataset.cx && sticker.node.dataset.cy) {
         const targetX = parseFloat(sticker.node.dataset.cx);
         const targetY = parseFloat(sticker.node.dataset.cy);
         
         // Capture the count for this sticker to show AFTER it lands
         const countToShow = state.currentIndex + 1;

         EffectsManager.playProjectile(startX, startY, targetX, targetY, () => {
            revealSticker(sticker);
            updateDateDisplay(sticker.created_at);
            updateCounterDisplay(countToShow, state.sortedStickers.length);

            if (isLast) {
              if (state.callbacks.onPlaybackComplete) {
                state.callbacks.onPlaybackComplete();
              } else {
                finalizePlaybackUI();
              }
            }
         });
      } else {
         revealSticker(sticker);
         updateDateDisplay(sticker.created_at);
         updateCounterDisplay(state.currentIndex + 1, state.sortedStickers.length);

         if (isLast) {
            if (state.callbacks.onPlaybackComplete) {
              state.callbacks.onPlaybackComplete();
            } else {
              finalizePlaybackUI();
            }
         }
      }

      state.currentIndex++;
    }
    
    // Update fire intensity based on current progress
    if (state.callbacks.onUpdateIntensity) {
      state.callbacks.onUpdateIntensity(state.currentIndex);
    }
  }

  state.animationFrame = requestAnimationFrame(playbackLoop);
}

function revealSticker(sticker) {
  if (!sticker || !sticker.node) return;
  
  sticker.node.classList.remove("playback-hidden");

  // Update Spotlight Position
  if (state.elements.spotlight) {
    state.elements.spotlight.classList.add("active");
    if (Number.isFinite(sticker.x) && Number.isFinite(sticker.y)) {
       state.elements.spotlight.setAttribute("transform", `translate(${sticker.x}, ${sticker.y})`);
    }
  }
  
  // Trigger lightweight impact effect
  if (state.callbacks.onStickerReveal) {
    state.callbacks.onStickerReveal(sticker);
  }

  // Enhanced animation: Large Pop + Elastic Bounce
  if (window.anime) {
    // Reset styles first
    const isMobile = window.innerWidth < 640;
    const startScale = isMobile ? 2.0 : 3.5; // Reduce scale on mobile to prevent layout issues

    sticker.node.style.opacity = "0";
    sticker.node.style.transform = `scale(${startScale})`; 
    sticker.node.style.filter = "brightness(2.5) drop-shadow(0 0 40px rgba(255,255,255,1))"; // Brighter flash with glow
    
    window.anime.timeline({
      targets: sticker.node,
    })
    .add({
      opacity: [0, 1],
      scale: [startScale, 1],
      duration: 850,
      easing: "easeOutElastic(1, .5)" // Bouncy elastic effect
    })
    .add({
      filter: [
        "brightness(2.5) drop-shadow(0 0 40px rgba(255,255,255,1))", 
        "brightness(1) drop-shadow(0 0 0px rgba(255,255,255,0))"
      ],
      duration: 600,
      easing: "easeOutQuad"
    }, 0); // Run in parallel with scale
    
  } else {
    sticker.node.style.opacity = "1";
    sticker.node.style.transform = "scale(1)";
  }
}

function updateDateDisplay(dateString) {
  if (!dateString) return;
  
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return;

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  
  if (state.elements.yearDisplay) {
    state.elements.yearDisplay.textContent = `${yyyy}`;
  }
  if (state.elements.dateDisplay) {
    state.elements.dateDisplay.textContent = `${mm}.${dd}`;
  }
}

function updateCounterDisplay(current, total) {
  if (state.elements.counterDisplay) {
    // Only show current count, hide total to keep suspense
    state.elements.counterDisplay.textContent = `${current}`;
    
    // Note: Highlight logic moved to finalizePlaybackUI to sync with sweep effect
    state.elements.counterDisplay.classList.remove("counter-highlight");
  }
}

export function finalizePlaybackUI() {
  document.body.classList.add("playback-finished");
  
  // Hide spotlight when finished
  if (state.elements.spotlight) {
    state.elements.spotlight.classList.remove("active");
  }

  showFinishedDateRange();
  
  if (state.elements.counterDisplay) {
    state.elements.counterDisplay.classList.add("counter-highlight");
  }
}

function showFinishedDateRange() {
  if (state.sortedStickers.length === 0) return;
  
  const first = state.sortedStickers[0];
  const last = state.sortedStickers[state.sortedStickers.length - 1];
  
  const d1 = new Date(first.created_at);
  const d2 = new Date(last.created_at);
  
  // Format Year
  const y1 = d1.getFullYear();
  const y2 = d2.getFullYear();
  const yearText = y1 === y2 ? `${y1}` : `${y1} - ${y2}`;
  
  // Format Date
  const m1 = String(d1.getMonth() + 1).padStart(2, "0");
  const dd1 = String(d1.getDate()).padStart(2, "0");
  const m2 = String(d2.getMonth() + 1).padStart(2, "0");
  const dd2 = String(d2.getDate()).padStart(2, "0");
  
  // Helper function for fade transition
  const updateWithFade = (element, newText) => {
    if (!element) return;
    // If text is same, do nothing
    if (element.textContent === newText) return;

    // Apply transition
    element.style.transition = "opacity 2s ease";
    element.style.opacity = "0";
    
    setTimeout(() => {
      element.textContent = newText;
      element.style.opacity = "1";
      
      // Clean up inline styles after transition
      setTimeout(() => {
        element.style.removeProperty("transition");
        element.style.removeProperty("opacity");
      }, 2000);
    }, 100); // Short delay before changing text
  };

  // Special handling for year display: Fade in oldest year, keep newest visible
  if (state.elements.yearDisplay) {
    const newestYearText = `${y2}`;
    const oldestYearText = `${y1}`;
    
    if (oldestYearText !== newestYearText) {
      // Construct HTML to fade in the oldest part
      state.elements.yearDisplay.innerHTML = `<span class="year-wrapper"><span class="oldest-part" style="opacity: 0; transition: opacity 2s ease">${oldestYearText} - </span>${newestYearText}</span>`;
      
      // Trigger reflow to ensure transition works
      requestAnimationFrame(() => {
        const span = state.elements.yearDisplay.querySelector(".oldest-part");
        if (span) {
          span.style.opacity = "1";
        }
      });
    } else {
      // If years are same, just ensure text is correct (no fade needed if already showing)
      if (state.elements.yearDisplay.textContent !== newestYearText) {
        state.elements.yearDisplay.textContent = newestYearText;
      }
    }
  }
  
  // Special handling for date display: Fade in oldest date, keep newest visible
  if (state.elements.dateDisplay) {
    const newestDateText = `${m2}.${dd2}`;
    const oldestDateText = `${m1}.${dd1}`;
    
    if (oldestDateText !== newestDateText) {
      // Construct HTML to fade in the oldest part
      // Wrap in a span to ensure they stay on the same line within the flex container (which is column)
      state.elements.dateDisplay.innerHTML = `<span class="date-wrapper"><span class="oldest-part" style="opacity: 0; transition: opacity 2s ease">${oldestDateText} - </span>${newestDateText}</span>`;
      
      // Trigger reflow to ensure transition works
      requestAnimationFrame(() => {
        const span = state.elements.dateDisplay.querySelector(".oldest-part");
        if (span) {
          span.style.opacity = "1";
        }
      });
    } else {
      // If dates are same, just ensure text is correct (no fade needed if already showing)
      if (state.elements.dateDisplay.textContent !== newestDateText) {
        state.elements.dateDisplay.textContent = newestDateText;
      }
    }
  }
}

function createSpotlight() {
  if (state.elements.spotlight) return;
  if (!state.elements.wallSvg) return;

  const svgNS = "http://www.w3.org/2000/svg";
  const group = document.createElementNS(svgNS, "g");
  group.classList.add("playback-spotlight");
  
  // Core Glow
  const core = document.createElementNS(svgNS, "circle");
  core.classList.add("playback-spotlight-core");
  core.setAttribute("r", "40");
  group.appendChild(core);

  // Rotating Ring
  const ring = document.createElementNS(svgNS, "circle");
  ring.classList.add("playback-spotlight-ring");
  ring.setAttribute("r", "28");
  group.appendChild(ring);

  // Append to wall
  state.elements.wallSvg.appendChild(group);
  state.elements.spotlight = group;
}

