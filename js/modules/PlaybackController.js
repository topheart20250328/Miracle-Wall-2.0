/**
 * PlaybackController.js (Rebuild Phase 1)
 * 負責處理「回顧動畫」的核心邏輯
 */
import * as StickerManagerPixi from "./StickerManagerPixi.js";
import * as EffectsManager from "./EffectsManager.js"; 
import * as SearchController from "./SearchController.js";

let isPlaying = false;
let playbackBtn = null;
let playbackOverlay = null;
let playbackCounter = null;
let countEl = null;
let playbackYear = null;
let playbackDate = null;
let getStickersSource = null;
let playlist = [];
let animationInterval = null;
let currentIndex = 0;
let currentCount = 0; // For number ticker animation
let playbackInterval = 300;
let sheenTriggered = false;

/**
 * 初始化回顧功能
 * @param {Function} stickerSourceProvider - Function returning the Map of stickers
 */
export function init(stickerSourceProvider) {
    console.log("🎥 [Playback] Initializing...");
    
    getStickersSource = stickerSourceProvider;

    // 綁定 DOM 元素
    playbackBtn = document.getElementById("playbackBtn");
    playbackOverlay = document.getElementById("playbackOverlay");
    playbackCounter = document.getElementById("playbackCounter");
    if (playbackCounter) {
        countEl = playbackCounter.querySelector(".count");
    }
    playbackYear = document.getElementById("playbackYear");
    playbackDate = document.getElementById("playbackDate");

    if (playbackBtn) {
        playbackBtn.addEventListener("click", togglePlayback);
    }
    
    // Click Overlay to Exit (Movie Mode behavior)
    if (playbackOverlay) {
        playbackOverlay.addEventListener("click", () => {
            if (isPlaying) {
                stopPlayback();
            }
        });
    }
}

/**
 * 切換播放狀態
 */
function togglePlayback() {
    if (isPlaying) {
        stopPlayback();
    } else {
        startPlayback();
    }
}

/**
 * 開始播放
 */
export function startPlayback() {
    // Force close search if open
    SearchController.closeSearch();

    if (isPlaying) return;
    
    // 1. Prepare Data
    preparePlaylist();
    if (playlist.length === 0) return;

    isPlaying = true;
    console.log("🎥 [Playback] Started");
    
    // 2. Playback State UI
    document.body.classList.add("playback-mode");
    if (playbackBtn) {
        playbackBtn.classList.add("is-playing");
        playbackBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>`;
    }

    // 3. Cinematic Entrance
    // a. Flash
    document.body.classList.add("flash-active");
    setTimeout(() => {
        document.body.classList.remove("flash-active");
    }, 150); // Short flash

    // b. Hide all stickers initially
    StickerManagerPixi.setAllStickersVisible(false);

    // c. Reset Counter & Effects
    currentCount = 0;
    updateCounter(0);
    // Reset background fire/glow effects to zero intensity instantly
    EffectsManager.resetFireEffect(); 
    // Also explicitly set logical intensity to 0 to prevent jump
    EffectsManager.setFireIntensity(0);
    // Stop "Newest Sticker" Shimmer effect from interfering
    EffectsManager.setShimmerPaused(true);

    if (countEl) countEl.classList.remove("finished"); // Reset animation

    // d. Initialize Date Indicators
    // If playlist has items, show the date of first item
    if (playlist.length > 0) {
        updateDateIndicators(playlist[0].created_at);
    } else {
        // Default to today if empty
        updateDateIndicators(new Date().toISOString());
    }

    // 4. Start Animation Loop after flash settles
    currentIndex = 0;
    const totalDuration = 20000; // 20 seconds max
    
    // Calculate interval: ensure all stickers show within 20s
    // Min interval 10ms (for high density), Max interval 300ms (for low density)
    let interval = totalDuration / Math.max(1, playlist.length);
    interval = Math.min(300, Math.max(10, interval));
    playbackInterval = interval; // Store for calculation
    
    // Reset Sheen State
    sheenTriggered = false;
    stopSheenEffect();

    console.log(`🎥 [Playback] Interval: ${interval.toFixed(1)}ms for ${playlist.length} items`);

    setTimeout(() => {
        animationInterval = setInterval(playNextFrame, interval);
    }, 800);
}

function playNextFrame() {
    if (!isPlaying) return clearInterval(animationInterval);

    // Check for Sheen Trigger (1 second remaining)
    const timeRemaining = (playlist.length - currentIndex) * playbackInterval;
    if (timeRemaining <= 1000 && !sheenTriggered) {
        startSheenEffect();
    }

    if (currentIndex >= playlist.length) {
        // Animation Complete
        clearInterval(animationInterval);
        console.log("🎥 [Playback] Sequence Complete");
        if (countEl) countEl.classList.add("finished"); // Trigger finish effect
        
        // Show Date Ranges (Effect: 2025-2026, NOV19-JAN14)
        showFinalDateRanges();
        return;
    }

    const sticker = playlist[currentIndex];
    
    // 1. Trigger Meteor Effect -> Reveal Sticker on Impact
    if (sticker.x !== undefined && sticker.y !== undefined) {
        // Ensure sticker is hidden initially (just in case)
        StickerManagerPixi.setStickerVisible(sticker.id, false);
        
        // Play Meteor Impact
        EffectsManager.playStickerReveal(sticker.x, sticker.y, () => {
             // IMPACT! Show Sticker
             StickerManagerPixi.setStickerVisible(sticker.id, true);
        });
    } else {
        // Fallback: Just show it
        StickerManagerPixi.setStickerVisible(sticker.id, true);
    }
    
    // 2. Update Counter
    currentCount++;
    updateCounter(currentCount);

    // 4. Update Background Intensity (Real-time reactivity)
    EffectsManager.setFireIntensity(currentCount);

    // 5. Update Date Indicators
    if (sticker.created_at) {
        updateDateIndicators(sticker.created_at);
    }

    currentIndex++;
}

/**
 * 更新右上角計數器
 */
function updateCounter(val) {
    if (countEl) {
        countEl.textContent = val;
    }
}

/**
 * Update Year and Date display
 * @param {string} isoDateStr 
 */
function updateDateIndicators(isoDateStr) {
    if (!isoDateStr) return;
    try {
        const d = new Date(isoDateStr);
        if (isNaN(d.getTime())) return;

        // Year (Bottom Left)
        if (playbackYear) {
            playbackYear.textContent = d.getFullYear();
        }

        // Date (Bottom Right)
        // Format: "JAN 01"
        if (playbackDate) {
            const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
            const monthText = months[d.getMonth()];
            const dayText = d.getDate().toString().padStart(2, '0');
            playbackDate.textContent = `${monthText} ${dayText}`;
        }
    } catch (e) {
        console.warn("Date parse error", e);
    }
}

function showFinalDateRanges() {
    console.log("🎥 [Playback] Showing Final Date Ranges");
    if (!playlist || playlist.length === 0) {
        console.warn("🎥 [Playback] Empty playlist, skipping date range.");
        return;
    }

    const startSticker = playlist[0];
    const endSticker = playlist[playlist.length - 1];

    if (!startSticker || !currentCount) return;

    // Check for created_at
    if (!startSticker.created_at || !endSticker.created_at) {
        console.warn("🎥 [Playback] Stickers missing created_at field.");
        return;
    }

    console.log(`🎥 [Playback] Range: ${startSticker.created_at} to ${endSticker.created_at}`);

    // 1. Year Range
    if (playbackYear) {
        let startYear = new Date(startSticker.created_at).getFullYear();
        let endYear = new Date(endSticker.created_at).getFullYear();
        
        if (isNaN(startYear)) startYear = new Date().getFullYear();
        if (isNaN(endYear)) endYear = new Date().getFullYear();

        // Only show range if different, per request "2025-2026"
        if (startYear !== endYear) {
            console.log("🎥 [Playback] Updating Year Range");
            // Structure: [New: 2025 -] [Old: 2026]
            playbackYear.innerHTML = `<span class="range-reveal"><span class="range-content">${startYear}<span class="range-separator">-</span></span></span><span>${endYear}</span>`;
        }
    }

    // 2. Date Range
    if (playbackDate) {
        const startStr = formatDateText(startSticker.created_at);
        const endStr = formatDateText(endSticker.created_at);
        
        console.log(`🎥 [Playback] Updating Date Range: ${startStr} - ${endStr}`);
        
        // Structure: [New: NOV 19 -] [Old: JAN 14]
        // Alignment is handled by CSS (right-aligned container). 
        // The New content (Start Date) is prepended, expanding to the LEFT of the Old content (End Date).
        playbackDate.innerHTML = `<span class="range-reveal"><span class="range-content">${startStr}<span class="range-separator">-</span></span></span><span>${endStr}</span>`;
    }
}

function formatDateText(isoStr) {
    try {
        const d = new Date(isoStr);
        const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        const monthText = months[d.getMonth()];
        const dayText = d.getDate().toString().padStart(2, '0');
        return `${monthText} ${dayText}`;
    } catch (e) {
        return "";
    }
}

/**
 * 停止播放
 * 確保清理所有狀態，避免 UI 卡死
 */
export function stopPlayback() {
    if (!isPlaying) return;
    isPlaying = false;
    
    console.log("🎥 [Playback] Stopped");
    
    // Stop Loop
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }

    stopSheenEffect();

    // Restore UI
    document.body.classList.remove("playback-mode");

    if (playbackBtn) {
        playbackBtn.classList.remove("is-playing");
        playbackBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    }

    // Restore all stickers opacity
    StickerManagerPixi.setAllStickersVisible(true);

    // Restore Background Intensity to match full playlist
    if (playlist && playlist.length > 0) {
        EffectsManager.setFireIntensity(playlist.length);
    }
    
    // Resume "Newest Sticker" Shimmer effect
    EffectsManager.setShimmerPaused(false);
}

function preparePlaylist() {
    if (!getStickersSource) {
        console.error("🎥 [Playback] No sticker source provider found!");
        return;
    }

    const stickersMap = getStickersSource();
    if (!stickersMap) {
        playlist = [];
        return;
    }

    // Convert Map to Array and Sort by Date
    playlist = Array.from(stickersMap.values())
        .filter(s => s && s.created_at) // Ensure valid record
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    console.log(`🎥 [Playback] Playlist prepared. Total: ${playlist.length}`);
}



export function getIsPlaying() {
    return isPlaying;
}

/**
 * Trigger the Eagle Scanning Sheen Effect
 */
function startSheenEffect() {
    console.log("🎥 [Playback] Starting Eagle Sheen Effect");
    sheenTriggered = true;
    const sheenGroup = document.getElementById("eagleSheenGroup");
    if (sheenGroup) {
        sheenGroup.classList.add("active");
        // Animation is handled by CSS infinite loop
    }
}

function stopSheenEffect() {
    const sheenGroup = document.getElementById("eagleSheenGroup");
    if (sheenGroup) {
        sheenGroup.classList.remove("active");
    }
}

