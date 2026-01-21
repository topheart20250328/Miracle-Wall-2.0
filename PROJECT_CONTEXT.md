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

*(Last Updated: 2026-01-21 Auto-Zoom & Interactive Feedback)*

- **Status:** Optimization & Polish.
- **Recent Actions (Session: Camera Focus & Effects):**
  - **Feature: Auto-Zoom on Creation (Solved)**
    - Fixed the issue where camera position reset after dialog close.
    - **Logic Update:** New stickers now trigger effects -> Dialog closes (Flight animation) -> Camera pans to new sticker (in that specific order).
    - **Code:** Updated `closeDialogWithResult` to accept `{ skipZoomRestore: true }`.
  - **Bug Fix: Effects Manager**
    - **Issue:** `playPlacementImpactEffect` crashed when receiving coordinates instead of DOM nodes.
    - **Fix:** Refactored function to support both `(x, y)` arguments and DOM Node `dataset`.
  - **Visual Polish: Sticker Button Interactions**
    - **Manual Drag:** Added "Extraction/Pop" effect (Scale 0.8 -> Bounce) to simulate pulling a sticker out.
    - **Auto Click:** Added "Pulse/Launch" effect (Scale 1.15 + Brightness) to indicate activation.
    - **Correction:** Removed unintended "Bounce" animation on drag that was displacing the button.
  - **Feature Tweak: Sticker Reveal Effects**
    - Separated "New Sticker" vs "Playback" effects.
    - **New Sticker:** Instant Ripple + Flash (No Meteor, for faster feedback).
    - **Playback:** Full Meteor Strike animation retained.

- **Active Tasks (Next Session):**
  - [ ] **Monitor UI Glitches:** User reported "unclear boxes" earlier. Keep monitoring.
  - [ ] **Refactor `app.js`:** Segregate `handleFormSubmit` and Dialog logic into `DialogActions.js`.
  - [ ] **Admin Feature (Backup/Restore):** Implement PostgreSQL RPC method.
  - [ ] **Performance Tuning:** Check if multiple animations (Button + Effects + Camera) cause frame drops on low-end mobile.

## 6. Database Schema Summary
- **Table `wall_stickers`:**
  - `id` (UUID), `x_norm` (0-1), `y_norm` (0-1), `note` (text), `is_approved` (bool), `device_id` (text).

---
**Instruction for AI:**
When resuming work, check "Active Tasks" first. Before tackling the "Meteor" animation, do a quick visual check on the new Toast UI to see if the "unclear boxes" issue can be reproduced/fixed.
