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

*(Last Updated: 2026-01-20 Auto-Placement & UI Polish)*

- **Status:** Feature Complete (Auto-Placement) & UI Refinement.
- **Recent Actions (Session: Auto-Placement & UI):**
  - **New Feature: Auto-Placement**
    - Implemented "Click Palette -> Input -> Auto-Find Spot" workflow.
    - **Logic:** `Utils.findSafeSpot` uses Monte Carlo sampling to find a non-overlapping spot within the Eagle shape.
    - **Improvement:** Algorithm refined to check 5 points (center + 4 edges) to ensure stickers don't bleed over the border.
    - **Retry:** `app.js` now handles recursion if the initially found spot is taken before save completes.
  - **UI/UX Overhaul: Notification System (Toasts)**
    - **Design:** Replaced generic notifications with a premium **Glassmorphism** style (Dark semi-transparent background, subtle borders).
    - **Visuals:** Added tone-specific icons (Success/Danger/Info) and glow effects.
    - **Animation:** Added "Shake" animation for errors (Danger tone).
    - **Interaction:** Removed persistent "Manual/Auto" hints to declutter the UI.
  - **Bug Fixes:**
    - Fixed a critical syntax error (duplicated code blocks) in `app.js` `handleFormSubmit` that caused site freeze.

- **Active Tasks (Next Session):**
  - [ ] **Monitor UI Glitches:** User reported "unclear boxes" in the new UI. Need to investigate potential layout collisions or rendering artifacts on specific devices.
  - [ ] **Playback Animation Expansion (Meteor/Impact):**
      - Upgrade "Soft White Wave" sticker reveal to a high-energy "Meteor Strike" via Pixi particles.
  - [ ] **Refactor `app.js`:** Segregate `handleFormSubmit` and Dialog logic into `DialogActions.js`.
  - [ ] **Admin Feature (Backup/Restore):** Implement PostgreSQL RPC method.

## 6. Database Schema Summary
- **Table `wall_stickers`:**
  - `id` (UUID), `x_norm` (0-1), `y_norm` (0-1), `note` (text), `is_approved` (bool), `device_id` (text).

---
**Instruction for AI:**
When resuming work, check "Active Tasks" first. Before tackling the "Meteor" animation, do a quick visual check on the new Toast UI to see if the "unclear boxes" issue can be reproduced/fixed.
