
import * as Utils from "./Utils.js";

const PLAYBACK_SPEED_MS = 100; // Time between stickers (adjustable)
const MIN_PLAYBACK_DURATION_MS = 5000; // Minimum total duration
const MAX_PLAYBACK_DURATION_MS = 20000; // Maximum total duration

const state = {
  isPlaying: false,
  animationFrame: null,
  sortedStickers: [],
  currentIndex: 0,
  lastFrameTime: 0,
  accumulatedTime: 0,
  intervalPerSticker: 50,
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
  setTimeout(() => {
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
  if (state.animationFrame) {
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }

  // Restore UI
  document.body.classList.remove("playback-mode");
  if (state.elements.playButton) {
    state.elements.playButton.classList.remove("is-playing");
    state.elements.playButton.textContent = "▶"; // Play symbol
    state.elements.playButton.setAttribute("aria-label", "播放回顧");
  }

  if (state.elements.dateContainer) {
    state.elements.dateContainer.classList.remove("visible");
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
    for (let i = 0; i < itemsToReveal; i++) {
      if (state.currentIndex >= state.sortedStickers.length) {
        // Finished
        setTimeout(stopPlayback, 2000);
        return; 
      }

      const sticker = state.sortedStickers[state.currentIndex];
      revealSticker(sticker);
      updateDateDisplay(sticker.created_at);
      state.currentIndex++;
      updateCounterDisplay(state.currentIndex, state.sortedStickers.length);
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
  
  // Trigger lightweight impact effect
  if (state.callbacks.onStickerReveal) {
    state.callbacks.onStickerReveal(sticker);
  }

  // Enhanced animation: Large Pop + Elastic Bounce
  if (window.anime) {
    // Reset styles first
    sticker.node.style.opacity = "0";
    sticker.node.style.transform = "scale(3.5)"; // Start much larger
    sticker.node.style.filter = "brightness(2.5)"; // Brighter flash
    
    window.anime.timeline({
      targets: sticker.node,
    })
    .add({
      opacity: [0, 1],
      scale: [3.5, 1],
      duration: 850,
      easing: "easeOutElastic(1, .5)" // Bouncy elastic effect
    })
    .add({
      filter: ["brightness(2.5)", "brightness(1)"],
      duration: 400,
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
    state.elements.counterDisplay.textContent = `${current} / ${total}`;
  }
}
