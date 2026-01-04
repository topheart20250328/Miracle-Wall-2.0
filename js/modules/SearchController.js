
import * as Utils from "./Utils.js";

const state = {
  isActive: false,
  matchedStickers: [], // Array of sticker objects
  currentIndex: -1,
  elements: {},
  callbacks: {}
};

export function initSearchController(elements, callbacks) {
  state.elements = elements;
  state.callbacks = callbacks;

  if (state.elements.searchBtn) {
    state.elements.searchBtn.addEventListener("click", toggleSearch);
  }
  if (state.elements.closeBtn) {
    state.elements.closeBtn.addEventListener("click", closeSearch);
  }
  if (state.elements.input) {
    state.elements.input.addEventListener("input", debounce(handleInput, 300));
  }
  
  // Dialog navigation buttons
  if (state.elements.dialogPrevBtn) {
    state.elements.dialogPrevBtn.addEventListener("click", () => navigateDialog(-1));
  }
  if (state.elements.dialogNextBtn) {
    state.elements.dialogNextBtn.addEventListener("click", () => navigateDialog(1));
  }
  
  // Ensure nav is hidden initially
  hideDialogNav();

  // Quick Filters
  if (state.elements.searchQuickFilters) {
    state.elements.searchQuickFilters.addEventListener("click", (e) => {
      const btn = e.target.closest(".quick-filter-btn");
      if (btn) {
        handleQuickFilter(btn.dataset.filter, btn);
      }
    });
  }
}

function toggleSearch() {
  // Prevent opening search if playback is active
  if (document.body.classList.contains("playback-mode")) {
    return;
  }

  if (state.isActive) {
    closeSearch();
  } else {
    openSearch();
  }
}

function openSearch() {
  state.isActive = true;
  document.body.classList.add("search-active");
  
  // Force scroll to top to prevent layout jumps
  window.scrollTo(0, 0);

  if (state.elements.searchBar) {
    state.elements.searchBar.classList.add("visible");
    state.elements.searchBar.hidden = false;
  }
  if (state.elements.searchQuickFilters) {
    state.elements.searchQuickFilters.classList.add("visible");
    state.elements.searchQuickFilters.hidden = false;
  }

  if (state.elements.input) {
    // Delay focus slightly to allow layout to stabilize, then force scroll to top again
    setTimeout(() => {
      state.elements.input.focus();
      window.scrollTo(0, 0);
    }, 100);
  }
  // Initial filter (empty or previous value)
  handleInput();

  if (state.callbacks.onSearchOpen) {
    state.callbacks.onSearchOpen();
  }

  // Add click listener to close search when clicking outside
  setTimeout(() => {
    document.addEventListener("click", handleOutsideClick);
    document.addEventListener("pointerdown", handleMouseDown);
  }, 100);
}

export function closeSearch() {
  state.isActive = false;

  if (state.callbacks.onSearchClose) {
    state.callbacks.onSearchClose();
  }

  // Remove click listener
  document.removeEventListener("click", handleOutsideClick);
  document.removeEventListener("pointerdown", handleMouseDown);

  // Fix for mobile keyboard layout issues (especially iOS/LINE)
  if (state.elements.input) {
    state.elements.input.blur();
  }
  
  document.body.classList.remove("search-active");

  // Force reset scroll position to prevent layout displacement
  // Use multiple delays to catch the browser state after keyboard animation finishes
  // This ensures the viewport resets correctly even if the keyboard animation is slow
  [100, 300, 500].forEach(delay => {
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, delay);
  });

  if (state.elements.searchBar) {
    state.elements.searchBar.classList.remove("visible");
    // Wait for transition to hide
    setTimeout(() => {
      if (!state.isActive) state.elements.searchBar.hidden = true;
    }, 300);
  }
  if (state.elements.searchQuickFilters) {
    state.elements.searchQuickFilters.classList.remove("visible");
    setTimeout(() => {
      if (!state.isActive) state.elements.searchQuickFilters.hidden = true;
    }, 300);
  }
  
  // Clear highlights
  const stickers = state.callbacks.getStickers ? state.callbacks.getStickers() : new Map();
  stickers.forEach(s => {
    // Handle DOM nodes (SVG mode)
    if (s.node) {
      s.node.classList.remove("search-dimmed", "search-highlight");
      // Force opacity reset just in case transition gets stuck
      s.node.style.removeProperty("opacity");
      s.node.style.removeProperty("filter");
      s.node.style.removeProperty("z-index");
      
      if (state.callbacks.resetStickerScale) {
        state.callbacks.resetStickerScale(s.node);
      }
    }
    // Handle Pixi (via callback)
    if (state.callbacks.updateStickerVisuals && s.id) {
      state.callbacks.updateStickerVisuals(s.id, 'normal');
    }
  });
  
  // Reset active filter buttons
  if (state.elements.searchQuickFilters) {
    const btns = state.elements.searchQuickFilters.querySelectorAll(".quick-filter-btn");
    btns.forEach(b => b.classList.remove("active"));
  }

  hideDialogNav();
  
  // CRITICAL: Reset navigation state completely
  state.currentIndex = -1;
  state.matchedStickers = [];
}

function clearSearch() {
  if (state.elements.input) {
    state.elements.input.value = "";
    handleInput();
    state.elements.input.focus();
  }
}

function handleInput() {
  const query = state.elements.input ? state.elements.input.value.trim().toLowerCase() : "";
  const stickersMap = state.callbacks.getStickers ? state.callbacks.getStickers() : new Map();
  
  // Reset active filter buttons when typing
  if (state.elements.searchQuickFilters) {
    const btns = state.elements.searchQuickFilters.querySelectorAll(".quick-filter-btn");
    btns.forEach(b => b.classList.remove("active"));
  }

  if (query.length === 0) {
    // Reset all
    state.matchedStickers = [];
    state.currentIndex = -1;
    updateCountDisplay();
    hideDialogNav();
    
    stickersMap.forEach(s => {
      if (s.node) {
        s.node.classList.remove("search-dimmed", "search-highlight");
        if (state.callbacks.resetStickerScale) {
          state.callbacks.resetStickerScale(s.node);
        }
      }
      if (state.callbacks.updateStickerVisuals && s.id) {
        state.callbacks.updateStickerVisuals(s.id, 'normal');
      }
    });
    return;
  }

  // Filter
  const matched = Array.from(stickersMap.values())
    .filter(s => s.note && s.note.toLowerCase().includes(query))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); // Oldest first

  highlightStickers(matched);
}

function handleQuickFilter(type, btn) {
  if (state.elements.input) {
    state.elements.input.value = ""; // Clear text input
  }
  
  // Check if already active (Toggle off)
  if (btn.classList.contains("active")) {
    btn.classList.remove("active");
    // Reset to show all (or empty if that's the default state when no filter)
    // handleInput with empty string resets everything
    handleInput();
    return;
  }

  // Update active state
  if (state.elements.searchQuickFilters) {
    const btns = state.elements.searchQuickFilters.querySelectorAll(".quick-filter-btn");
    btns.forEach(b => b.classList.remove("active"));
  }
  btn.classList.add("active");

  const stickersMap = state.callbacks.getStickers ? state.callbacks.getStickers() : new Map();
  const allStickers = Array.from(stickersMap.values());
  let matched = [];

  switch (type) {
    case "latest":
      matched = allStickers
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) // Newest first
        .slice(0, 3);
      break;
    case "earliest":
      matched = allStickers
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); // Oldest first
      break;
    case "month":
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      matched = allStickers.filter(s => {
        const d = new Date(s.created_at);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });
      break;
    case "random":
      if (allStickers.length > 0) {
        // Shuffle all stickers
        matched = [...allStickers];
        for (let i = matched.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [matched[i], matched[j]] = [matched[j], matched[i]];
        }
      }
      
      // Special handling for random: 
      // 1. Set state
      state.matchedStickers = matched;
      state.currentIndex = -1;
      updateCountDisplay();
      
      // 2. NO HIGHLIGHTS (Reset visuals to normal)
      const stickersMap = state.callbacks.getStickers ? state.callbacks.getStickers() : new Map();
      stickersMap.forEach(s => {
        if (s.node) {
          s.node.classList.remove("search-dimmed", "search-highlight");
          if (state.callbacks.resetStickerScale) {
        if (state.callbacks.updateStickerVisuals && s.id) {
          state.callbacks.updateStickerVisuals(s.id, 'normal');
        }
            state.callbacks.resetStickerScale(s.node);
          }
        }
      });
      
      // 3. Auto-open first
      if (matched.length > 0) {
        const target = matched[0];
        if (state.callbacks.onPanToSticker) {
          // Pan first, then open
          state.callbacks.onPanToSticker(target, () => {
             if (state.callbacks.onFocusSticker) {
               state.callbacks.onFocusSticker(target);
             }
          }, false);
        } else if (state.callbacks.onFocusSticker) {
           state.callbacks.onFocusSticker(target);
        }
      }
      return; // Exit before calling highlightStickers
  }

  highlightStickers(matched);
}

function highlightStickers(matched) {
  state.matchedStickers = matched;
  state.currentIndex = -1; // Reset index
  
  const stickersMap = state.callbacks.getStickers ? state.callbacks.getStickers() : new Map();

  const hasMatches = matched.length > 0;
  
  stickersMap.forEach(s => {
    const isMatch = hasMatches && matched.includes(s);

    // SVG Mode
    if (s.node) {
      if (hasMatches) {
        if (isMatch) {
          s.node.classList.add("search-highlight");
          s.node.classList.remove("search-dimmed");
          // Bring to front to ensure visibility
          if (s.node.parentNode && s.node.parentNode.lastElementChild !== s.node) {
            s.node.parentNode.appendChild(s.node);
          }
        } else {
          s.node.classList.add("search-dimmed");
          s.node.classList.remove("search-highlight");
        }
      } else {
        // No matches found -> Dim everything
        s.node.classList.add("search-dimmed");
        s.node.classList.remove("search-highlight");
      }
    }

    // Pixi Mode
    if (state.callbacks.updateStickerVisuals && s.id) {
      if (hasMatches) {
        state.callbacks.updateStickerVisuals(s.id, isMatch ? 'highlight' : 'dimmed');
      } else {
        state.callbacks.updateStickerVisuals(s.id, 'dimmed');
      }
    }
  });

  // Pan to newest match
  if (hasMatches && state.callbacks.onPanToSticker) {
    // Default: Pan to newest match
    let targetSticker = matched.reduce((prev, curr) => {
      const t1 = new Date(prev.created_at).getTime();
      const t2 = new Date(curr.created_at).getTime();
      return t1 > t2 ? prev : curr;
    });

    // Special case for "latest" filter (top 3): Pan to the OLDEST of the 3 (which is the 3rd newest)
    // We can detect if this is the "latest" filter by checking if matched length is <= 3 and sorted by date desc?
    // Or better, check the active filter button
    if (state.elements.searchQuickFilters) {
      const activeBtn = state.elements.searchQuickFilters.querySelector(".quick-filter-btn.active");
      if (activeBtn) {
        if (activeBtn.dataset.filter === "latest") {
          // For "latest", matched is already sorted Newest -> Oldest (from handleQuickFilter)
          // We want the last one (oldest of the 3)
          targetSticker = matched[matched.length - 1];
        } else if (activeBtn.dataset.filter === "earliest") {
          // For "earliest", matched is sorted Oldest -> Newest.
          // We want the first one (the absolute oldest).
          targetSticker = matched[0];
        }
      }
    }

    state.callbacks.onPanToSticker(targetSticker);
  }

  updateCountDisplay();
}

function updateCountDisplay() {
  if (state.elements.countDisplay) {
    if (state.matchedStickers.length === 0) {
      state.elements.countDisplay.textContent = "";
    } else {
      state.elements.countDisplay.textContent = `共 ${state.matchedStickers.length} 則`;
    }
  }
}

// Called when a sticker is opened (from StickerManager)
export function onStickerOpened(stickerId) {
  if (!state.isActive || state.matchedStickers.length === 0) {
    hideDialogNav();
    return;
  }

  // Find index of opened sticker in matched list
  const index = state.matchedStickers.findIndex(s => s.id === stickerId);
  
  if (index !== -1) {
    state.currentIndex = index;
    // Only show nav if more than 1 result
    if (state.matchedStickers.length > 1) {
      showDialogNav();
    } else {
      hideDialogNav();
    }
    updateDialogCounter();
  } else {
    hideDialogNav();
  }
}

// Called when dialog is closed
export function onDialogClosed() {
  hideDialogNav();
  
  // Check if random filter is active, if so, reset search state
  if (state.elements.searchQuickFilters) {
    const randomBtn = state.elements.searchQuickFilters.querySelector('[data-filter="random"]');
    if (randomBtn && randomBtn.classList.contains("active")) {
      randomBtn.classList.remove("active");
      // Reset search state (assuming input is empty, which it should be for quick filters)
      handleInput(); 
    }
  }

  // CRITICAL: If we are NOT in active search mode (e.g. user closed search but dialog was open),
  // ensure we clean up any lingering state that might allow navigation.
  if (!state.isActive) {
    state.currentIndex = -1;
    state.matchedStickers = [];
  }
}

export function navigateDialog(direction) {
  if (state.matchedStickers.length <= 1) return;

  state.currentIndex += direction;
  
  // Loop
  if (state.currentIndex >= state.matchedStickers.length) {
    state.currentIndex = 0;
  } else if (state.currentIndex < 0) {
    state.currentIndex = state.matchedStickers.length - 1;
  }

  const target = state.matchedStickers[state.currentIndex];
  updateDialogCounter();
  
  if (target) {
    if (state.callbacks.onPanToSticker) {
      state.callbacks.onPanToSticker(target);
    }
    if (state.callbacks.onNavigateSticker) {
      state.callbacks.onNavigateSticker(target, direction);
    } else if (state.callbacks.onFocusSticker) {
      state.callbacks.onFocusSticker(target);
    }
  }
}

function updateDialogCounter() {
  if (state.elements.dialogSearchCounter) {
    if (state.isActive && state.matchedStickers.length > 0 && state.currentIndex !== -1) {
      state.elements.dialogSearchCounter.textContent = `${state.currentIndex + 1} / ${state.matchedStickers.length}`;
      state.elements.dialogSearchCounter.hidden = false;
    } else {
      state.elements.dialogSearchCounter.hidden = true;
    }
  }
}

function showDialogNav() {
  if (state.elements.dialogPrevBtn) state.elements.dialogPrevBtn.hidden = false;
  if (state.elements.dialogNextBtn) state.elements.dialogNextBtn.hidden = false;
}

function hideDialogNav() {
  if (state.elements.dialogPrevBtn) state.elements.dialogPrevBtn.hidden = true;
  if (state.elements.dialogNextBtn) state.elements.dialogNextBtn.hidden = true;
  if (state.elements.dialogSearchCounter) state.elements.dialogSearchCounter.hidden = true;
}

let dragStartPos = { x: 0, y: 0 };

function handleMouseDown(event) {
  dragStartPos = { x: event.clientX, y: event.clientY };
}

function handleOutsideClick(event) {
  if (!state.isActive) return;

  // Check if it was a drag operation (distance > 10px)
  const dx = event.clientX - dragStartPos.x;
  const dy = event.clientY - dragStartPos.y;
  if (Math.hypot(dx, dy) > 10) {
    return;
  }

  const searchBar = state.elements.searchBar;
  const searchBtn = state.elements.searchBtn;
  const searchQuickFilters = state.elements.searchQuickFilters;
  const noteDialog = document.getElementById("noteDialog");
  const target = event.target;
  
  // If click is inside search bar, quick filters, or on search button, do nothing
  if ((searchBar && searchBar.contains(target)) || 
      (searchBtn && searchBtn.contains(target)) ||
      (searchQuickFilters && searchQuickFilters.contains(target))) {
    return;
  }

  // If click is inside the note dialog (e.g. navigation buttons)
  if (noteDialog && noteDialog.contains(target)) {
    return;
  }

  // Define what constitutes "background" (clicking these closes search)
  // Everything else (stickers, eagle, UI controls) keeps search open
  // If click is on a sticker, do nothing (let sticker handler work)
  if (target.closest('.sticker-node')) {
    return;
  }

  // If click is inside wallSvg (the map), it should close search
  // UNLESS it was a sticker (handled above)
  // So if we are here, and it's inside wallSvg, it's background (eagle, empty space)
  if (target.closest('#wallSvg') || target.closest('#wallWrapper') || target.closest('#wallStage')) {
    closeSearch();
    return;
  }

  const isBackground = 
    target === document.body ||
    target === document.documentElement ||
    target.tagName === 'MAIN' ||
    target.classList.contains('wall-section');

  if (isBackground) {
    closeSearch();
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

