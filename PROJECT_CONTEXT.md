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
     - *Note: Core dialog logic (Form, Delete) is delegated to `js/actions/DialogActions.js`.*
   - **Visual/Render:**
     - `js/modules/StickerManagerPixi.js` (Active Renderer - Handles Data & Pixi Sprites)
     - `js/modules/EffectsManager.js` (Visual effects: Mist, Ripple, Fire)
     - `js/modules/GhostCanvas.js` (Background visuals)
   - **Interaction/UI:**
     - `js/modules/ZoomController.js` (Infinite canvas logic)
     - `js/modules/SearchController.js` (Filtering stickers)
     - `js/modules/Utils.js` (Helper algorithms, including `findSafeSpot`)
   - **Logic/Data:**
     - `js/modules/RealtimeController.js` (Supabase subscriptions)
     - `js/modules/AudioManager.js` (Background music/SFX)
3. **Data Flow:**
   - **User Action:** Click Wall -> `ZoomController` gets coords -> Open Note Dialog.
   - **Save:** `app.js` Form Submit -> `supabase.from('wall_stickers').insert`.
   - **Display:** `StickerManagerPixi` handles fetching strategies (Chunked Loading).

## 4. Current File Structure Highlights
- `/index.html`: Main user view (Now includes `.loader-progress-bar`).
- `/js/app.js`: Main controller. **Critical Logic for Placement & Errors**.
- `/js/modules/Utils.js`: Contains `findSafeSpot` (Auto-placement algorithm).
- `/css/styles.css`: Contains updated Glassmorphism Toast styles.

## 5. Current Status & Active Tasks

*(Last Updated: 2026-01-21 Refactoring and Optimization)*

- **Status:** Stable / Maintenance.
- **Recent Actions (Session: Refactoring & Performance):**
  - **Refactoring (Major):**
    - Extracted all form submission and sticker management logic (`handleFormSubmit`, `createNewSticker`, `updateStickerMessage`, `handleDeleteSticker`) from `js/app.js` to `js/actions/DialogActions.js`.
    - Implemented **Dependency Injection** in `DialogActions.init()` to ensure modular access to global state and managers (`StickerManager`, `EffectsManager`).
    - Reduced `app.js` complexity by ~180 lines, focusing it purely on orchestration.
  - **Performance Optimization (Mobile):**
    - **Issue:** Simultaneous execution of "Flight Animation", "Sticker Impact Effect", and "Camera Zoom" caused lag on low-end devices.
    - **Fix:** Serialized the animation sequence:
      1. **Close Dialog & Fly:** UI feedback first.
      2. **Wait for Landing:** Ensure GPU is free.
      3. **Play Effects & Zoom:** Trigger visual reward and camera movement only after the heavy UI transition is complete.
  - **Visual Polish:**
    - Updated `EffectsManager` to properly skip meteor animations for simple sticker creation (`skipMeteor: true`).
    - Fixed timing issues where "Send Failed" toast appeared incorrectly due to context binding errors.

- **Active Tasks (Next Session):**
  - [ ] **Monitor Refactoring Stability:** Watch for regression in "Read Mode" or "Edit Mode" which share the same dialog controller.
  - [ ] **Admin Feature (Backup/Restore):** Implement PostgreSQL RPC method.
  - [ ] **Pre-Launch Effect Check:** Verify the new "Serialized Animation" flow feels snappy enough on high-end devices (ensure no awkward pauses).

## 6. Database Schema Summary
- **Table `wall_stickers`:**
  - `id` (UUID), `x_norm` (0-1), `y_norm` (0-1), `note` (text), `is_approved` (bool), `device_id` (text).

---
**Instruction for AI:**
When resuming work, check "Active Tasks" first. Before tackling the "Meteor" animation, do a quick visual check on the new Toast UI to see if the "unclear boxes" issue can be reproduced/fixed.
