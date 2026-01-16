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

*(Last Updated: 2026-01-16 Playback Polish & Visual Effects)*

- **Status:** Visual Polish & Playback Feature Enhancement.
- **Recent Actions (Session: Playback Polish):**
  - **Fixed Critical Bugs:**
    - Resolved a crash in `PlaybackController.js` caused by duplicated code blocks.
    - Fixed a visual glitch where the "Year Indicator (2026)" would jump suddenly at the start of animation. (Used CSS Grid `minmax(0, ...)` trick).
  - **New Features (Visuals):**
    - **Eagle Sheen Effect:** Implemented a "Prestige Sweep" light effect that slowly scans across the Eagle background at the end of playback (CSS-based, JS-triggered).
    - **Sticker Reveal Effect (Base):** Added `StickerRevealEffect.js`. Currently renders a **Soft White Gradient Wave** (Hollow center) when stickers appear.
  - **File Recovery:**
    - Repaired `css/playback-spotlight.css` which had become corrupted/truncated.

- **Active Tasks (Next Session):**
  - [ ] **Playback Animation Expansion (Plan A: Impact/Meteor):**
      - **Goal:** Upgrade the current "Soft White Wave" into a high-energy "Meteor Strike".
      - **Phase 1 (Incoming):** A glowing light beam or meteor stream shoots from off-screen (or high altitude) towards the target sticker position.
      - **Phase 2 (Impact):** Upon contact with the wall, generate a strong "Light Burst" with particle explosion. *(Current Soft Wave is the foundation for this)*.
      - **Phase 3 (Reveal):** The sticker fades in from the white-hot center of the impact.
      - **Tech:** Optimize using Pixi particles or sprite animation to maintain 60fps.
  - [ ] **Admin Feature (Backup/Restore):** Implement "Method 2: PostgreSQL RPC" for safe database restoration.
    - Create SQL function `restore_schema.sql` (Transaction, Truncate, Insert).
    - Update `admin.html` UI for file upload.
    - Update `admin.js` to handle file reading and RPC call.
  - [ ] **Refactor `app.js` (Pending):** Split large logic blocks (Event Listeners, Dialog Handlers) into separate modules (e.g., `js/actions/DialogActions.js`).
  - [ ] **Refactor `admin.js`:** Segregate Auth, UI, and Data logic.
  - [ ] **Refactor `StickerManagerPixi.js`:** Review for potential splitting (Texture management vs Layout logic).

## 6. Database Schema Summary
- **Table `wall_stickers`:**
  - `id` (UUID), `x_norm` (0-1), `y_norm` (0-1), `note` (text), `is_approved` (bool), `device_id` (text).

---
**Instruction for AI:**
When resuming work, check "Active Tasks" first. The priority is to refactor `app.js` to safer, smaller modules before adding new features.
