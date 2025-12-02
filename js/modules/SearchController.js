
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
  if (state.elements.searchBar) {
    state.elements.searchBar.classList.add("visible");
    state.elements.searchBar.hidden = false;
  }
  if (state.elements.input) {
    state.elements.input.focus();
  }
  // Initial filter (empty or previous value)
  handleInput();
}

export function closeSearch() {
  state.isActive = false;
  document.body.classList.remove("search-active");
  if (state.elements.searchBar) {
    state.elements.searchBar.classList.remove("visible");
    // Wait for transition to hide
    setTimeout(() => {
      if (!state.isActive) state.elements.searchBar.hidden = true;
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
  state.matchedStickers = Array.from(stickersMap.values())
    .filter(s => s.note && s.note.toLowerCase().includes(query))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); // Oldest first

  state.currentIndex = -1; // Reset index
  
  // Update Visuals
  stickersMap.forEach(s => {
    if (!s.node) return;
    
    const isMatch = state.matchedStickers.includes(s);
    if (isMatch) {
      s.node.classList.add("search-highlight");
      s.node.classList.remove("search-dimmed");
    } else {
      s.node.classList.add("search-dimmed");
      s.node.classList.remove("search-highlight");
    }
  });

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

