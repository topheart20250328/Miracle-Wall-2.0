
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

  // Add click listener to close search when clicking outside
  setTimeout(() => {
    document.addEventListener("click", handleOutsideClick);
  }, 100);
}

export function closeSearch() {
  state.isActive = false;

  // Remove click listener
  document.removeEventListener("click", handleOutsideClick);

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
    if (s.node) {
      s.node.classList.remove("search-dimmed", "search-highlight");
      // Force opacity reset just in case transition gets stuck
      s.node.style.removeProperty("opacity");
      s.node.style.removeProperty("filter");
      s.node.style.removeProperty("z-index");
    }
  });
  
  // Reset active filter buttons
  if (state.elements.searchQuickFilters) {
    const btns = state.elements.searchQuickFilters.querySelectorAll(".quick-filter-btn");
    btns.forEach(b => b.classList.remove("active"));
  }

  hideDialogNav();
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
        .slice(0, 5);
      break;
    case "mine":
      const myDeviceId = state.callbacks.getDeviceId ? state.callbacks.getDeviceId() : null;
      if (myDeviceId) {
        matched = allStickers.filter(s => s.deviceId === myDeviceId);
      }
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
        }
      });
      
      // 3. Auto-open first
      if (matched.length > 0 && state.callbacks.onFocusSticker) {
        state.callbacks.onFocusSticker(matched[0]);
      }
      return; // Exit before calling highlightStickers
  }

  highlightStickers(matched);
}

function highlightStickers(matched) {
  state.matchedStickers = matched;
  state.currentIndex = -1; // Reset index
  
  const stickersMap = state.callbacks.getStickers ? state.callbacks.getStickers() : new Map();

  // Update Visuals
  stickersMap.forEach(s => {
    if (!s.node) return;
    
    // If no matches (and input is empty/cleared), show all normally (remove classes)
    // But if matched is empty array passed explicitly (e.g. no results found), we should dim all?
    // Actually handleInput passes [] when query is empty.
    // If query is empty, we want to remove all effects.
    
    // Check if we are in "reset" mode (empty query, no filter)
    // We can infer this if matched is empty AND input is empty AND no filter active?
    // Simpler: if matched is empty, check if we should show "0 results" or "reset".
    // For now, if matched is empty, we assume reset if called from handleInput with empty query.
    // But handleQuickFilter might return empty (e.g. no my messages).
    
    // Let's rely on the caller. handleInput calls highlightStickers([]) when empty.
    // But handleQuickFilter might call it with [] if no results.
    // We need a way to distinguish "clear" vs "no results".
    // Let's assume if matched is empty, we dim everything (no results), UNLESS it's a clear action.
    // Actually, handleInput logic was: if query.length === 0 -> remove classes.
    // So let's handle that inside handleInput/handleQuickFilter logic or pass a flag.
    
    // Revised approach:
    // If matched is empty, we need to know if it's "no results found" or "show all".
    // Let's check if search is active.
  });

  // Wait, the previous logic in handleInput for empty query was:
  /*
  if (query.length === 0) {
    state.matchedStickers = [];
    state.currentIndex = -1;
    updateCountDisplay();
    hideDialogNav();
    stickersMap.forEach(s => ... remove classes ...);
    return;
  }
  */
  
  // So highlightStickers should assume "filtering is active, here are the matches".
  // If matches is empty, it means 0 results found -> dim all.
  // The "reset" case should be handled separately or by passing null?
  
  // Let's handle the "reset" case in handleInput before calling highlightStickers.
  // So if highlightStickers is called, it implies we want to highlight these specific stickers.
  
  const hasMatches = matched.length > 0;
  
  stickersMap.forEach(s => {
    if (!s.node) return;
    
    if (hasMatches) {
      const isMatch = matched.includes(s);
      if (isMatch) {
        s.node.classList.add("search-highlight");
        s.node.classList.remove("search-dimmed");
      } else {
        s.node.classList.add("search-dimmed");
        s.node.classList.remove("search-highlight");
      }
    } else {
      // No matches found -> Dim everything
      s.node.classList.add("search-dimmed");
      s.node.classList.remove("search-highlight");
    }
  });

  updateCountDisplay();
  
  // If we have matches, maybe auto-focus the first one?
  // Or just let user navigate.
  // Previous logic didn't auto-focus.
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
}

function navigateDialog(direction) {
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
  
  if (target && state.callbacks.onNavigateSticker) {
    state.callbacks.onNavigateSticker(target);
  } else if (target && state.callbacks.onFocusSticker) {
    state.callbacks.onFocusSticker(target);
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

function handleOutsideClick(event) {
  if (!state.isActive) return;

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
  const isBackground = 
    target === document.body ||
    target === document.documentElement ||
    target.tagName === 'MAIN' ||
    target.classList.contains('wall-section') ||
    target.id === 'wallStage' ||
    target.id === 'wallWrapper' ||
    target.id === 'wallSvg' ||
    target.id === 'stickersLayer' ||
    target.id === 'effectsLayer' ||
    target.id === 'ambientLayer' ||
    target.id === 'dragOverlay' ||
    target.id === 'marqueeLayer' ||
    target.id === 'playbackOverlay';

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

