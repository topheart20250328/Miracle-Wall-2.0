/**
 * @file DialogActions.js
 * @description Handles Note Dialog interactions and Read Mode overlay.
 */

let _elements = {};
let _state = {};
let _context = {};

/**
 * Initialize Dialog Actions and bindings
 * @param {Object} elements - Map of DOM elements
 * @param {Object} state - Reference to app state
 * @param {Object} context - Map of dependencies (SearchController, callbacks, etc.)
 */
export function init(elements, state, context = {}) {
    _elements = elements;
    _state = state;
    _context = context; // SearchController, closeDialogWithResult, etc.

    initReadMode();
}

/**
 * Initializes the Read Mode Overlay logic
 */
function initReadMode() {
    const {
        readModeOverlay,
        readModeInput,
        readModeContent,
        closeReadModeBtn,
        noteInput,
        expandBtn,
        readModeContainer
    } = _elements;

    if (!readModeOverlay || !readModeInput) return;

    // Open logic
    const openReadMode = (isViewMode) => {
        readModeOverlay.showModal();
        document.body.style.overflow = 'hidden';

        if (isViewMode) {
            // View Mode: Show div, hide textarea
            if (readModeContent) {
                readModeContent.hidden = false;
                readModeContent.innerHTML = '';
                const textWrapper = document.createElement('div');
                textWrapper.className = 'read-mode-text-wrapper';
                textWrapper.textContent = noteInput.value;
                readModeContent.appendChild(textWrapper);
                
                readModeInput.hidden = true;
            }
            const header = readModeOverlay.querySelector('.read-mode-header');
            if (header) header.style.display = 'none';
            
            readModeOverlay.dataset.mode = 'view';
        } else {
            // Edit Mode
            if (readModeContent) {
                readModeContent.hidden = true;
                readModeInput.hidden = false;
            }
            const header = readModeOverlay.querySelector('.read-mode-header');
            if (header) header.style.display = '';

            readModeInput.value = noteInput.value;
            readModeOverlay.dataset.mode = 'edit';
            
            readModeInput.focus();
            setTimeout(() => {
                readModeInput.setSelectionRange(readModeInput.value.length, readModeInput.value.length);
            }, 0);
        }
    };

    // Close logic
    const closeReadMode = () => {
        if (!readModeOverlay) return;
        
        // Sync back value if in edit mode
        if (readModeOverlay.dataset.mode === 'edit' && noteInput) {
            noteInput.value = readModeInput.value;
        }

        readModeOverlay.close();
        document.body.style.overflow = '';
        delete readModeOverlay.dataset.mode;
    };

    // Bindings
    if (noteInput) {
        noteInput.addEventListener("click", () => {
            if (noteInput.classList.contains("locked")) {
                openReadMode(true);
            }
        });
    }

    if (expandBtn) {
        expandBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isViewMode = noteInput && noteInput.classList.contains("locked");
            openReadMode(isViewMode);
        });
    }

    if (closeReadModeBtn) {
        closeReadModeBtn.addEventListener('click', closeReadMode);
    }

    // Overlay Click Handling
    readModeOverlay.addEventListener('click', (e) => {
        const isViewMode = readModeOverlay.dataset.mode === 'view';
        if (isViewMode) {
            closeReadMode();
        }
    });

    if (readModeContainer) {
        readModeContainer.addEventListener('click', (e) => {
            const isViewMode = readModeOverlay.dataset.mode === 'view';
            if (!isViewMode) {
                e.stopPropagation();
            }
        });
    }
}

/**
 * Handles KeyDown events on the Note Dialog
 * @param {KeyboardEvent} e 
 */
export function handleNoteDialogKeyDown(e) {
    // 1. Block Escape during transitions
    if (e.key === "Escape") {
        if (_state.isTransitioning || (_state.flipAnimation && !_state.flipAnimation.completed)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            console.log("Escape blocked during transition");
        }
    } 
    // 2. Navigation Shortcuts (Arrow Keys)
    else if (e.key === "ArrowLeft") {
        if (_context.SearchController) {
            _context.SearchController.navigateDialog(-1);
        }
    }
    else if (e.key === "ArrowRight") {
        if (_context.SearchController) {
            _context.SearchController.navigateDialog(1);
        }
    }
}

/**
 * Handles Cancel button click
 */
export function handleCancelAction() {
    if (_state.isTransitioning || _state.flipAnimation) return;
    if (_context.closeDialogWithResult) {
        // Use void to ignore promise
        void _context.closeDialogWithResult("cancelled");
    }
}

/**
 * Handles Dialog cancel event (e.g. Esc key or backdrop if supported)
 * @param {Event} event 
 */
export function handleDialogCancel(event) {
    event.preventDefault();
    if (_state.isTransitioning || _state.flipAnimation) return;
    if (_context.closeDialogWithResult) {
        void _context.closeDialogWithResult("cancelled");
    }
}
