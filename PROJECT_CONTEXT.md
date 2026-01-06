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
   - **Visual/Render:**
     - `js/modules/StickerManagerPixi.js` (Active Renderer)
     - `js/modules/StickerManager.js` (Legacy SVG Renderer)
     - `js/modules/GhostCanvas.js` (Background visuals)
     - `js/modules/EffectsManager.js` (Visual effects)
   - **Interaction/UI:**
     - `js/modules/ZoomController.js` (Infinite canvas logic)
     - `js/modules/MarqueeController.js` (Flying text headers)
     - `js/modules/SearchController.js` (Filtering stickers)
   - **Logic/Data:**
     - `js/modules/RealtimeController.js` (Supabase subscriptions)
     - `js/modules/AudioManager.js` (Background music/SFX)
     - `js/modules/Utils.js` (Helpers)
3. **Data Flow:**
   - **User Action:** Click Wall -> `ZoomController` gets coords -> Open Note Dialog.
   - **Save:** `app.js` Form Submit -> `supabase.from('wall_stickers').insert`.
   - **Display:** `RealtimeController` hears INSERT -> `StickerManagerPixi` adds Sprite.

## 4. Current File Structure Highlights

- `/index.html`: Main user view.
- `/admin.html`: Moderator view.
- `/js/modules/`:
  - `StickerManagerPixi.js`: Current active renderer logic.
  - `ZoomController.js`: Handles the complex pan/zoom logic for the infinite wall.
  - `MarqueeController.js`: Handles the flying text at the top.
- `/css/`: Split by feature (`read-mode`, `admin`, `styles`).

## 5. Current Status & Active Tasks

*(Last Updated: 2026-01-06)*

- **Status:** Maintenance & Optimization.
- **Recent Actions:**
  - Analyzed project structure for AI context continuity.
  - Added JSDoc documentation to key modules (`app.js`, `ZoomController`, `StickerManagerPixi`, `MarqueeController`) to assist AI understanding.
  - Established `PROJECT_CONTEXT.md` as the single source of truth.
- **Active Tasks:**
  - [x] Standardize code documentation for AI readability.
  - [ ] Verify Mobile Safari performance (Pinch-to-zoom smoothness).
  - [ ] Monitor Admin Panel functionality.

## 6. Database Schema Summary

- **Table `wall_stickers`:**
  - `id` (UUID), `x_norm` (0-1), `y_norm` (0-1), `note` (text), `is_approved` (bool), `device_id` (text).
- **Table `wall_review_settings`:**
  - Controls global approval switches (Turn moderation on/off).

---

**Instruction for AI:**
When starting a new session, read this file first to understand the architectural constraints and current state of the project.
