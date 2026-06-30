/**
 * @file DialogActions.js
 * @description Handles Note Dialog interactions and Read Mode overlay.
 */
import * as Utils from '../modules/Utils.js';
import * as EffectsManager from '../modules/EffectsManager.js';
import * as ZoomController from '../modules/ZoomController.js';

let _elements = {};
let _state = {};
let _context = {};
const POSITION_CONFLICT_CODE = "POSITION_CONFLICT";

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

    const { noteForm } = _elements;
    if (noteForm) {
        noteForm.removeEventListener("submit", handleFormSubmit);
        noteForm.addEventListener("submit", handleFormSubmit);
    }

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

/**
 * Handles the note submission (create or update).
 */
export async function handleFormSubmit(e) {
  e.preventDefault();
  const { noteInput, formError, saveButton } = _elements;
  const { isSupabaseConfigured } = _context;
  const { pending, deviceId, stickers } = _state;

  if (!noteInput || !pending) return;

  const content = noteInput.value.trim();
  if (!content) {
    if (formError) formError.textContent = "請輸入留言內容";
    noteInput.focus();
    return;
  }
  if (content.length > 1000) {
     if (formError) formError.textContent = "留言太長了，請縮短到 1000 字以內";
     noteInput.focus();
     return;
  }
  
  if (pending.isNew) {
    // For new stickers
  } else {
    // For editing existing stickers, check ownership
    if (pending.deviceId && deviceId && pending.deviceId !== deviceId) {
      if (formError) formError.textContent = "此留言僅能由原建立裝置編輯";
      return;
    }
    // Check if configured (unless it's a local draft which we don't really support as persisted without backend often)
    if (isSupabaseConfigured && !isSupabaseConfigured()) {
        if (formError) formError.textContent = "尚未設定 Supabase，無法儲存";
        return;
    }
    const record = stickers.get(pending.id);
    if (record && Utils.isStickerLocked(record, deviceId)) {
        // Double check lock
        if (formError) formError.textContent = "此留言已超過編輯時間";
        return;
    }
  }

  // --- Proceed ---
  const originalLabel = saveButton.textContent;
  saveButton.disabled = true;
  saveButton.textContent = pending.isNew ? "發送中…" : "更新中…";
  if (formError) formError.textContent = "";

  try {
    if (pending.isNew) {
      await createNewSticker(pending, content);
    } else {
      await updateStickerMessage(pending, content);
    }
  } catch (err) {
    // Errors handled inside create/update usually, or rethrown
    console.warn("Submit failed/cancelled", err);
  } finally {
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = originalLabel;
      }
  }
}

async function createNewSticker(pending, message) {
  const { StickerManager, eaglePaths, viewBox, showToast, closeDialogWithResult } = _context;
  const { formError } = _elements;

  const result = await StickerManager.saveSticker(pending, message);
  if (result.error) {
     if (isPositionConflictError(result.error)) {
        // Handle Auto-Retry for Auto-Placement mode
        if (pending.isAutoMode && !pending._retryCount) {
             pending._retryCount = 0;
        }
        
        if (pending.isAutoMode && pending._retryCount < 5) {
             pending._retryCount++;
             const newSpot = Utils.findSafeSpot(eaglePaths, _state.stickers, viewBox);
             if (newSpot) {
                 pending.x = newSpot.x;
                 pending.y = newSpot.y;
                 return createNewSticker(pending, message); // Recursive retry
             }
        }
        handlePlacementConflict(pending);
     } else {
        const msg = result.error.message || result.error.code || "未知錯誤";
        if (formError) formError.textContent = `儲存失敗: ${msg}`;
        console.error(result.error);
     }
     throw result.error;
  }
  
  // Success!
  const stickerId = result.data; 
  const record = _state.stickers.get(stickerId);
  
  // Note: closeDialogWithResult might trigger animateStickerReturn.
  // We want the zoom to persist, and return animation to fly towards the *new* zoomed location.
  // Performance Optimization: Wait for flight to finish to avoid parallel heavy animations (Flight + Impact)
  await closeDialogWithResult("saved", { skipZoomRestore: true });

  if (record) {
    // 1. Play Effects (After card lands)
    if (pending.isAutoMode) {
        EffectsManager.playStickerReveal(record.x, record.y, null, { skipMeteor: true });
    } else {
        EffectsManager.playPlacementImpactEffect(record.x, record.y);
    }

    // 2. Zoom to the new sticker (AFTER placement/card return)
    const isMobile = window.innerWidth <= 640;
    const targetZoom = isMobile ? 6 : 4; 
    
    ZoomController.panToPoint(record.x, record.y, viewBox, targetZoom, null, { 
        duration: 800, 
        easing: 'easeOutQuart' 
    });
  }
  showToast("留言已發送", "success");
}

async function updateStickerMessage(pending, message) {
  const { StickerManager, showToast, closeDialogWithResult } = _context;
  const { formError } = _elements;
  const { deviceId } = _state;

  if (pending.deviceId && deviceId && pending.deviceId !== deviceId) {
    if (formError) formError.textContent = "";
    return;
  }
  
  const result = await StickerManager.updateSticker(pending, message);
  if (result.error) {
    const msg = result.error.message || result.error.code || "未知錯誤";
    if (formError) formError.textContent = `更新失敗: ${msg}`;
    console.error(result.error);
    return;
  }
  const record = _state.stickers.get(pending.id);
  
  await closeDialogWithResult("saved");
  
  if (record) {
    EffectsManager.runPulseAnimation(record.node);
  }
  showToast("留言已更新", "success");
}


/**
 * Handles sticker deletion.
 */
export async function handleDeleteSticker() {
  const { formError, deleteStickerBtn } = _elements;
  const { pending, deviceId, stickers } = _state;
  const { isSupabaseConfigured, StickerManager, closeDialogWithResult, showToast } = _context;
  
  let isTimeLocked = false;
  if (pending && !pending.isNew) {
    const record = stickers.get(pending.id);
    if (record) {
      isTimeLocked = Utils.isStickerLocked(record, deviceId);
    }
  }

  if (!pending || pending.isNew || isTimeLocked || pending.locked) {
    return;
  }
  if (pending.deviceId && deviceId && pending.deviceId !== deviceId) {
    if (formError) formError.textContent = "此留言僅能由原建立裝置於 24 小時內刪除";
    return;
  }
  if (isSupabaseConfigured && !isSupabaseConfigured()) {
    if (formError) formError.textContent = "尚未設定 Supabase，無法刪除";
    return;
  }
  if (!deleteStickerBtn) {
    return;
  }
  
  const originalLabel = deleteStickerBtn.textContent;
  deleteStickerBtn.disabled = true;
  deleteStickerBtn.textContent = "刪除中…";
  if (formError) formError.textContent = "";
  
  const result = await StickerManager.deleteSticker(pending);
  
  if (result.error) {
    const msg = result.error.message || result.error.code || "未知錯誤";
    if (formError) formError.textContent = `刪除失敗: ${msg}`;
    console.error(result.error);
    deleteStickerBtn.disabled = false;
    deleteStickerBtn.textContent = originalLabel;
    return;
  }

  await closeDialogWithResult("deleted");
  showToast("留言已刪除", "success");
  
  // Reset button state (though dialog is closed)
  if (deleteStickerBtn) {
    deleteStickerBtn.disabled = false;
    deleteStickerBtn.textContent = originalLabel;
  }
}

function isPositionConflictError(error) {
  if (!error) {
    return false;
  }
  const code = typeof error.code === "string" ? error.code.toUpperCase() : "";
  const message = typeof error.message === "string" ? error.message.toUpperCase() : "";
  const details = typeof error.details === "string" ? error.details.toUpperCase() : "";
  return (
    code.includes(POSITION_CONFLICT_CODE)
    || message.includes(POSITION_CONFLICT_CODE)
    || details.includes(POSITION_CONFLICT_CODE)
  );
}

function handlePlacementConflict(pending) {
  const { findAvailableSpot, StickerManager, showToast } = _context;
  const { formError } = _elements;

  if (!pending?.node) {
    if (formError) formError.textContent = "這個位置剛被其他人貼上，請重新選擇位置。";
    showToast("這個位置剛被其他人貼上，請重新選擇位置", "danger");
    return;
  }
  pending.node.classList.add("pending");
  const fallback = findAvailableSpot({ x: pending.x, y: pending.y });
  if (fallback) {
    StickerManager.positionStickerNode(pending.node, fallback.x, fallback.y);
    pending.x = fallback.x;
    pending.y = fallback.y;
    if (formError) formError.textContent = "這個位置剛被其他人貼上，已為你換到附近的新位置，請再儲存一次。";
    showToast("這個位置剛被其他人貼上，已為你換到附近的位置", "info");
    EffectsManager.playPlacementPreviewEffect(fallback.x, fallback.y);
  } else {
    if (formError) formError.textContent = "這個位置剛被其他人貼上，請關閉視窗後換個位置再試一次。";
    showToast("這個位置剛被其他人貼上，請換個位置", "danger");
  }
}
