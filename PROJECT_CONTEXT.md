# AI Project Context: Miracle Wall 2.0

## 1. Project Identity
- **Name:** topheart Miracle Wall 2.0 (神蹟牆/見證牆)
- **Purpose:** Interactive digital wall for church members to post testimonies/miracles.
- **Organization:** TOP CHURCH

## 2. Tech Stack (Strict adherence required)
- **Frontend:** Vanilla JavaScript (ES6+ Modules), HTML5, CSS3.
- **Build System:** None/Native (No Webpack/Vite config found, rely on native ES modules).
- **Render Engine:**
  - **PixiJS** (Primary/Default) - Handles high-performance sticker rendering.
  - **SVG** (Legacy/Fallback) - Can be forced via URL param `?engine=svg`.
- **Backend:** **Supabase** (PostgreSQL).
- **Libraries:**
  - `pixi.min.js` (in `js/libs/`)
  - Supabase JS Client (CDN loaded in `supabase-config.js` or `index.html`)

## 3. Key Architecture Rules
1. **Mobile First / Compatibility (CRITICAL):**
   - MUST work on **LINE In-App Browser**, **Mobile Safari**, and **WeChat**.
   - Touch events (Pinch/Drag) must be robust (handled in `ZoomController.js`).
   - Prevent native "pull-to-refresh" interfering with wall navigation.
2. **Modular Design (Flat Structure but Logical Groups):**
   - **Orchestrator:** `js/app.js` (Entry point, initializes all modules).
     - *Note: `app.js` is currently large and scheduled for refactoring (splitting event handlers).*
   - **Visual/Render:**
     - `js/modules/StickerManagerPixi.js` (Active Renderer - Handles Data & Pixi Sprites)
     - `js/modules/EffectsManager.js` (Visual effects: Mist, Ripple, Fire)
     - `js/modules/GhostCanvas.js` (Background visuals)
   - **Interaction/UI:**
     - `js/modules/ZoomController.js` (Infinite canvas logic)
     - `js/modules/SearchController.js` (Filtering stickers)
   - **Logic/Data:**
     - `js/modules/RealtimeController.js` (Supabase subscriptions)
     - `js/modules/AudioManager.js` (Background music/SFX)
3. **Data Flow:**
   - **User Action:** Click Wall -> `ZoomController` gets coords -> Open Note Dialog.
   - **Save:** `app.js` Form Submit -> `supabase.from('wall_stickers').insert`.
   - **Display:** `StickerManagerPixi` handles fetching strategies (Chunked Loading).

## 4. Current File Structure Highlights
- `/index.html`: Main user view (Now includes `.loader-progress-bar`).
- `/js/app.js`: Main controller. **Needs Refactoring**.
- `/js/modules/`:
  - `StickerManagerPixi.js`: Now supports chunked loading callbacks.
  - `EffectsManager.js`: Added `playPixiLiftEffect`.

## 5. Current Status & Active Tasks

*(Last Updated: 2026-01-09)*

- **Status:** Visual Polish & Refactoring Phase.
- **Recent Actions (Session: Visuals & Stability):**
  - **Visual Effects (Takeoff vs Landing):**
    - Implemented distinct effects for sticker flight.
    - **Landing:** Retained `playPixiMistExplosion` (Heavy Smoke).
    - **Takeoff:** Created new `playPixiLiftEffect` (Light Ripple/Glow) in `EffectsManager.js`.
  - **Loading Experience:**
    - Implemented **Real Progress Bar** in `index.html`.
    - Modified `StickerManagerPixi.js` to process stickers in chunks (50 per batch) and report progress back to `app.js`.
    - Fixed UI freeze during initial load by yielding to main thread between chunks.
  - **UX/Navigation:**
    - **Zoom Indicator Fix:** Converted `#zoomIndicator` to a `<button>` with `touch-action: manipulation` to fix accidental double-tap zooming issues on Mobile/LINE browser.
    - **Keyboard Navigation:** Added `ArrowLeft`/`ArrowRight` support in `noteDialog` to switch between stickers.
    - **Camera Timing:** Reverted logic: Camera now waits for sticker to land before zooming back to overview (Sequential flow).
  - **Code Health:**
    - Extracted `handleNoteDialogKeyDown` from `app.js` listener to improve safety.
    - Identified need to split `app.js` to prevent syntax errors during AI edits.
    - **Identified Monolithic Files for Future Splitting:**
      - `js/modules/EffectsManager.js` (~3.3k lines): Mixes Pixi/SVG/Particle logic. Needs splitting by effect type (e.g., `FireEffect.js`, `MistEffect.js`).
      - `js/admin.js` (~1.2k lines): Mixes Auth, UI, and Data logic.
      - `js/modules/StickerManagerPixi.js` (~1.2k lines): Growing large with loading strategies and texture management.

- **Active Tasks (Next Session):**
  - [ ] **Refactor `app.js` (Priority 1):** Split large logic blocks (Event Listeners, Dialog Handlers) into separate modules (e.g., `js/actions/DialogActions.js`).
  - [ ] **Refactor `EffectsManager.js` (Priority 2):** Break down this massive file into smaller, effect-specific classes.
  - [ ] **Method 2 Protocol:** Implement strict "componentize first" rule before editing complex logic to avoid syntax errors.
  - [ ] Monitor performance of the new Chunked Loading on low-end devices.

## 6. Database Schema Summary
- **Table `wall_stickers`:**
  - `id` (UUID), `x_norm` (0-1), `y_norm` (0-1), `note` (text), `is_approved` (bool), `device_id` (text).

---
**Instruction for AI:**
When resuming work, check "Active Tasks" first. The priority is to refactor `app.js` to safer, smaller modules before adding new features.
