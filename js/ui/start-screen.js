// Extracted from bible-challenge.html
// start-screen.js

function setupMobileScoreBadges() {
            try {
                // remove any existing mobile badge elements created previously
                document.querySelectorAll('.mobile-center-badge, .mobile-score-badge').forEach(el => {
                    try {
                        if (el.__hideTimer) {
                            clearTimeout(el.__hideTimer);
                            el.__hideTimer = null;
                        }
                    } catch (e) {}
                    try { if (el.parentElement) el.parentElement.removeChild(el); } catch(e) {}
                });

                // disconnect any mutation observers attached to the encouragement element
                const encEl = document.getElementById('encouragementText');
                if (encEl && encEl.__mobileBadgeObserver) {
                    try { encEl.__mobileBadgeObserver.disconnect(); } catch(e) {}
                    try { delete encEl.__mobileBadgeObserver; } catch(e) {}
                }

                // ensure the original encouragement text is visible and left to its original logic
                try { if (encEl) encEl.style.visibility = ''; } catch(e) {}
            } catch (e) {
                console.warn('setupMobileScoreBadges cleanup failed', e);
            }
            // intentionally do not create badges here — original element will control display
            return;
        }

        function showStartScreen() {
            if (gameState.playMode === 'equip') gameState.playMode = null; // 返回主選單時不強制選擇 classic
            // 裝備課程殘留狀態全面清理，防止回主選單後誤判已完成或再進其他模式直接跳結算
            try {
                delete gameState.__pendingEquipTier;
                delete gameState.__equipEnding;
                delete gameState.__equipHandoffLocked;
                delete gameState.__equipFinished;
                gameState.equipRunning = false;
                gameState.equipTier = null;
                gameState.currentEquipEntry = null;
                gameState.equipRemaining = [];
                gameState.levelResults = {};
                gameState.currentLevel = 1;
                // 若不是正式結束，撤銷 gameCompleted 旗標，避免結算流程誤觸
                if (!document.getElementById('playerNameModal')?.classList.contains('hidden')) {
                    // 若結算視窗當下顯示則不動 gameCompleted
                } else {
                    gameState.gameCompleted = false;
                }
            } catch(_) {}
            try {
                if (typeof window.highlightSelectedEquipTier === 'function') {
                    window.highlightSelectedEquipTier(null);
                }
            } catch(_) {}
            // 安全停止所有計時器（避免生存模式殘留）
            try { if (gameState.timerInterval) { clearInterval(gameState.timerInterval); gameState.timerInterval = null; } } catch(_) {}
            try { if (gameState.survivalTimerInterval) { clearInterval(gameState.survivalTimerInterval); gameState.survivalTimerInterval = null; } } catch(_) {}
            // 停止任何殘留的星星雨特效並清除節點
            try { if (typeof stopStarRain === 'function') stopStarRain(true); } catch(_) {}
            document.getElementById('startScreen').classList.remove('hidden');
            document.getElementById('gameScreen').classList.add('hidden');
            document.getElementById('verseMarquee').style.display = 'block';
            // 顯示主選單固定品牌角標
            try { const m = document.getElementById('menuBrandCorner'); if (m) m.style.display = ''; } catch(_) {}
            // 依據片頭主題同步主選單品牌圖 light/dark
            try {
                const m = document.getElementById('menuBrandCorner');
                const isDark = !!window.__startupIsDark;
                if (m) m.src = isDark ? 'logo/logo0-light.webp' : 'logo/logo0-dark.webp';
            } catch(_) {}
            // Ensure body scroll is restored when showing the start screen
            try { unlockBodyScroll(); } catch (e) {}
            // Hide any lingering cute hint when returning to start screen
            try { hideCuteHint(); } catch (e) {}
            // ...existing code...
            // 解鎖所有主畫面按鈕
            lockMainScreenButtons(false);
            
            // 重置開始按鈕狀態
            const startBtn = document.getElementById('startGameBtn');
            startBtn.style.border = '';
            startBtn.style.boxShadow = '';
            startBtn.disabled = false;
            startBtn.style.opacity = '';
            startBtn.style.cursor = '';
            startBtn.style.pointerEvents = '';
            // 防止黃框樣式殘留（倒數中斷情境）
            startBtn.classList.remove('start-button-pulse');
            
            // 更新按鈕狀態
            updateStartButtonState();
            
            try { setActiveLeaderboardTabByMode('classic'); } catch(_) {}
            // 快速顯示緩存排行榜，並在背景刷新
            updateLeaderboardDisplay('classic', { preferStale: true });
            try { showEquipUI(false); } catch(_) {}
            try { highlightSelectedModeCard(gameState.playMode || null); } catch(_) {}
            
            // Sync menu mode UI through centralized updater
            try { if (window.__applyModeUI) window.__applyModeUI(); } catch(_) {}

            try { setUnifiedHeaderLayout(false); } catch(_) {}
            try { document.body.classList.remove('equip-running'); } catch(_) {}
            try { document.body.classList.remove('core-mode-playing'); } catch(_) {}
        }

        function highlightSelectedModeCard(mode){
            // Use the centralized UI updater from engine to ensure consistency (borders/shadows)
            // instead of applying conflicting utility classes here.
            try {
                if (window.__applyModeUI) {
                    window.__applyModeUI();
                }
            } catch(_) {}

            // Grid dimming state is handled by __applyModeUI
        }
        
    // 副標題功能已移除

        function hideAllScreens() {
            document.getElementById('startScreen').classList.add('hidden');
            document.getElementById('gameScreen').classList.add('hidden');
            document.getElementById('verseMarquee').style.display = 'none';
            // 隱藏主選單品牌角標
            try { const m = document.getElementById('menuBrandCorner'); if (m) m.style.display = 'none'; } catch(_) {}
        }

// ---------------------------------------------------- 
// Start Screen UI Bindings (Extracted from engine.js) 
// ---------------------------------------------------- 
function initStartScreenUI() {
            // 開始畫面按鈕事件
            document.getElementById('startGameBtn').addEventListener('click', startGame);
            // Unlock audio on first gesture
            try { document.getElementById('startGameBtn')?.addEventListener('click', () => SFX.resume()); } catch(_) {}
            const scheduleStartButtonStateUpdate = () => {
                try {
                    if (window.__startBtnStateRafPending) return;
                    window.__startBtnStateRafPending = true;
                    const run = () => {
                        window.__startBtnStateRafPending = false;
                        try { updateStartButtonState(); } catch(_) {}
                    };
                    if (window.requestAnimationFrame) {
                        window.requestAnimationFrame(run);
                    } else {
                        setTimeout(run, 0);
                    }
                } catch(_) {}
            };
            // 外部題庫載入完成/失敗時，即時同步開始按鈕與提示文案
            try {
                if (!window.__externalVerseLoadedStartSyncWired) {
                    window.__externalVerseLoadedStartSyncWired = true;
                    window.addEventListener('externalVersesLoaded', () => {
                        scheduleStartButtonStateUpdate();
                    }, { passive: true });
                }
            } catch(_) {}
            try {
                if (!window.__externalVerseLoadingStartSyncWired) {
                    window.__externalVerseLoadingStartSyncWired = true;
                    window.addEventListener('externalVersesLoading', () => {
                        scheduleStartButtonStateUpdate();
                    }, { passive: true });
                }
            } catch(_) {}

            // Restore and apply prefs for volume and time-bar visibility (default: volume 0.2, showBar true)
            (function restoreAudioAndTimeBarPrefs(){
                try {
                    const saved = (window.loadSettings ? window.loadSettings() : {});
                    let changed = false;
                    if (typeof saved.volume !== 'number') { saved.volume = 0.2; changed = true; }
                    SFX.setVolume(saved.volume);
                    if (typeof saved.showTimeBar === 'undefined') { saved.showTimeBar = true; changed = true; }
                    if (changed && window.saveSettings) window.saveSettings(saved);
                    try { updateTimeRewardVisibility(); } catch(_) {}
                } catch(_) {}
            })();

            // 遊戲模式（闖關/生存）事件
            try {
                const modeClassicBtn = document.getElementById('modeClassicBtn');
                const modeSurvivalBtn = document.getElementById('modeSurvivalBtn');
                const customAreaCard = document.getElementById('customAreaCard');
                const equipCourseCard = document.getElementById('equipCourseCard');

                // Helper: apply the selected accent color while leaving thickness to CSS state rules
                function highlightCard(el, palette) {
                    if (!el) return;
                    const { border = '#64748b', glow = 'rgba(59,130,246,0.25)' } = palette || {};
                    el.style.borderWidth = '';
                    el.style.borderColor = border;
                    el.style.boxShadow = '';
                    el.style.opacity = '1';
                    el.style.filter = 'none';
                    el.style.transform = 'translateY(-2px)';
                    el.style.zIndex = '2';
                    el.style.setProperty('--mode-card-glow', glow);
                }
                function resetCard(el, isAnySelected) {
                    if (!el) return;
                    el.style.borderWidth = '';
                    el.style.borderColor = '';
                    el.style.boxShadow = '';
                    el.style.removeProperty('--mode-card-glow');
                    el.style.transition = 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
                    if (isAnySelected) {
                        el.style.opacity = '0.55';
                        el.style.filter = 'grayscale(30%)';
                        el.style.transform = 'scale(0.98)';
                        el.style.zIndex = '1';
                    } else {
                        el.style.opacity = '1';
                        el.style.filter = 'none';
                        el.style.transform = 'scale(1)';
                        el.style.zIndex = '1';
                    }
                }

                // Helper: 更新手機版收合面板狀態
                function updateModeDrawerState(kind) {
                    const modeCardHeader = document.getElementById('modeCardHeader');
                    const modeCardTitle = document.getElementById('modeCardTitle');
                    const modeCardBody = document.getElementById('modeCardBody');
                    const modeCardToggleIcon = document.getElementById('modeCardToggleIcon');
                    const modeCardToggleIconUp = document.getElementById('modeCardToggleIconUp');

                    if (!modeCardHeader || !modeCardTitle || !modeCardBody) return;

                    // 對應標題文字與顏色 (不論行動或桌面版都更新)
                    let titleText = '選擇模式';
                    let titleColor = '#374151'; // gray-700
                    if (kind === 'classic') { titleText = '� 已選：闖關挑戰'; titleColor = '#e11d48'; titleText = '🏁 已選：闖關挑戰'; }
                    if (kind === 'survival') { titleText = '⏱️ 已選：生存計時'; titleColor = '#059669'; }
                    if (kind === 'custom') { titleText = '🧩 已選：自訂專區'; titleColor = '#0284c7'; }
                    if (kind === 'equip') { titleText = '📚 已選：裝備課程'; titleColor = '#6d28d9'; }
                    
                    modeCardTitle.textContent = titleText;
                    modeCardTitle.style.color = titleColor;

                    const vw = Math.min(window.innerWidth || 0, document.documentElement.clientWidth || 0);
                    if (vw > 920) return; // 只有手機版生效後續的收合邏輯

                    // 闖關與生存在手機上選擇後，經過簡短動畫後自動滑動收合
                    // 若是裝備課程／自訂專區，剛點選進入卡片內部選擇時不收合，
                    // 但若該模式已經有「具體下層選擇」，或裝備課程已經選了班級，則可以收合
                    const hasEquipTierSelected = (kind === 'equip' && window.gameState && window.gameState.__pendingEquipTier);
                    // 自訂專區中，只要有勾選任何一卷書，就視作選擇完成，可以收合幫助玩家往下滑
                    if (kind === 'classic' || kind === 'survival' || hasEquipTierSelected) {
                        setTimeout(() => {
                            // 檢查玩家是否又點開了或者切換了（裝備或自訂模式下這步檢查略過，直接收合）
                            if ((kind === 'classic' || kind === 'survival') && modeCardTitle.textContent !== titleText) return; 
                            modeCardBody.style.maxHeight = '0px';
                            modeCardBody.style.opacity = '0';
                            modeCardHeader.classList.remove('rounded-t-xl');
                            modeCardHeader.classList.add('rounded-xl');
                            if (modeCardToggleIcon) modeCardToggleIcon.style.display = 'inline-block';
                            if (modeCardToggleIconUp) modeCardToggleIconUp.style.display = 'none';
                        }, 400); 
                    } else {
                        // 自訂/裝備不自動收合（因為還要選進一步選項），但標題會改
                        modeCardBody.style.maxHeight = '2000px';
                        modeCardBody.style.opacity = '1';
                        modeCardHeader.classList.add('rounded-t-xl');
                        modeCardHeader.classList.remove('rounded-xl');
                        if (modeCardToggleIcon) modeCardToggleIcon.style.display = 'none';
                        if (modeCardToggleIconUp) modeCardToggleIconUp.style.display = 'inline-block';
                    }
                }

                // 綁定手動點擊標題展開/收合事件
                try {
                    const header = document.getElementById('modeCardHeader');
                    if (header) {
                        header.addEventListener('click', () => {
                            const body = document.getElementById('modeCardBody');
                            const iconDown = document.getElementById('modeCardToggleIcon');
                            const iconUp = document.getElementById('modeCardToggleIconUp');
                            if (!body) return;
                            const isCollapsed = body.style.maxHeight === '0px';
                            
                            if (isCollapsed) {
                                // 展開
                                body.style.maxHeight = '2000px';
                                body.style.opacity = '1';
                                header.classList.add('rounded-t-xl');
                                header.classList.remove('rounded-xl');
                                if (iconDown) iconDown.style.display = 'none';
                                if (iconUp) iconUp.style.display = 'inline-block';
                            } else {
                                // 手動收起
                                body.style.maxHeight = '0px';
                                body.style.opacity = '0';
                                header.classList.remove('rounded-t-xl');
                                header.classList.add('rounded-xl');
                                if (iconDown) iconDown.style.display = 'inline-block';
                                if (iconUp) iconUp.style.display = 'none';
                            }
                        });
                    }
                } catch(_) {}

                // Unified exclusive selector for the four home modes:
                // classic, survival, equip, custom
                function selectHomeMode(kind) {
                    const isAnySelected = !!kind;
                    // Clear UI highlights for all
                    resetCard(modeClassicBtn, isAnySelected);
                    resetCard(modeSurvivalBtn, isAnySelected);
                    resetCard(customAreaCard, isAnySelected);
                    resetCard(equipCourseCard, isAnySelected);

                    // 轉換模式前，若先前有選裝備班級，清除待選與高亮（與其他模式互斥）
                    try {
                        if (kind !== 'equip') {
                            gameState.__pendingEquipTier = null;
                            highlightSelectedEquipTier(null);
                            if (equipCourseCard) {
                                equipCourseCard.style.borderWidth=''; equipCourseCard.style.borderColor=''; equipCourseCard.style.boxShadow='';
                                equipCourseCard.setAttribute('aria-pressed','false');
                            }
                        }
                    } catch(_) {}

                    // ARIA pressed states
                    modeClassicBtn?.setAttribute('aria-pressed', kind === 'classic' ? 'true' : 'false');
                    modeSurvivalBtn?.setAttribute('aria-pressed', kind === 'survival' ? 'true' : 'false');
                    customAreaCard?.setAttribute('aria-pressed', kind === 'custom' ? 'true' : 'false');
                    equipCourseCard?.setAttribute('aria-pressed', kind === 'equip' ? 'true' : 'false');

                    // Visual highlight
                    if (kind === 'classic') {
                        highlightCard(modeClassicBtn, { border: '#f43f5e', glow: 'rgba(244,63,94,0.25)' });
                        // Exit custom practice: clear any selected custom books and range
                        if (gameState.range === 'custom' && gameState.customBooks.length) {
                            gameState.customBooks = [];
                            try { initializeCustomBooksInExpandCard(); } catch(_) {}
                            try { refreshQuickSelectCategoryStates(); } catch(_) {}
                        }
                        // hide expand card if visible
                        try { document.getElementById('customBooksExpandCard')?.classList.add('hidden'); } catch(_) {}
                        gameState.range = null; // leave practice completely
                        gameState.theme = null;
                        gameState.rarity = null; // stick to core mode
                        setPlayMode('classic');
                    } else if (kind === 'survival') {
                        highlightCard(modeSurvivalBtn, { border: '#10b981', glow: 'rgba(16,185,129,0.25)' });
                        if (gameState.range === 'custom' && gameState.customBooks.length) {
                            gameState.customBooks = [];
                            try { initializeCustomBooksInExpandCard(); } catch(_) {}
                            try { refreshQuickSelectCategoryStates(); } catch(_) {}
                        }
                        try { document.getElementById('customBooksExpandCard')?.classList.add('hidden'); } catch(_) {}
                        gameState.range = null;
                        gameState.theme = null;
                        gameState.rarity = null;
                        setPlayMode('survival');
                    } else if (kind === 'custom') {
                        highlightCard(customAreaCard, { border: '#3b82f6', glow: 'rgba(59,130,246,0.25)' });
                        // Enter practice: set range custom and show inline picker
                        gameState.range = 'custom';
                        gameState.rarity = null;
                        gameState.theme = null;
                        // Disable core mode buttons via applyModeUI later
                        showCustomBooksExpandCard();
                    } else if (kind === 'equip') {
                        highlightCard(equipCourseCard, { border: '#7c3aed', glow: 'rgba(124,58,237,0.25)' });
                        // Future: open equip courses; for now, just exclusive highlight
                        if (gameState.range === 'custom' && gameState.customBooks.length) {
                            gameState.customBooks = [];
                            try { initializeCustomBooksInExpandCard(); } catch(_) {}
                            try { refreshQuickSelectCategoryStates(); } catch(_) {}
                        }
                        try { document.getElementById('customBooksExpandCard')?.classList.add('hidden'); } catch(_) {}
                        gameState.range = null;
                        gameState.theme = null;
                        gameState.rarity = null;
                        // 清除 core 模式，防止殘留 classic/survival 造成可以開始
                        gameState.playMode = null;
                        try { highlightSelectedModeCard(null); } catch(_) {}
                        // keep current playMode; just cancel practice selections
                    }

                    // updateSettingsDisplay();
                    updateStartButtonState();
                    try {
                        if (typeof requestUrgentVerseLoad === 'function') {
                            // 先拿可用分片，完整題庫由背景補齊
                            requestUrgentVerseLoad(false, { interactive: true });
                        }
                    } catch(_) {}
                    try { window.__applyModeUI && window.__applyModeUI(); } catch (_) {}
                    
                    // 觸發抽屜邏輯與滾動
                    try {
                        updateModeDrawerState(kind);
                    } catch(_) {}
                }
                // Expose for other handlers (e.g., quick-select buttons)
                window.__selectHomeMode = selectHomeMode;
                // Helper: 手機自動滾到「開始遊戲」按鈕（避免使用者還要手動向下找按鈕）
                function scrollToStartButtonForMobile(){
                    try {
                        const vw = Math.min(window.innerWidth || 0, document.documentElement.clientWidth || 0);
                        if (vw > 920) return; // 僅手機/窄螢幕
                        const btn = document.getElementById('startGameBtn');
                        const rangeCard = document.getElementById('rangeCard'); // 以包含按鈕的最外層卡片為定位基準
                        const targetEl = rangeCard || btn;
                        if (!targetEl) return;
                        
                        const rect = targetEl.getBoundingClientRect();
                        const vh = window.innerHeight || document.documentElement.clientHeight;
                        
                        // 計算理想的滾動位置：讓下方的卡片出現在畫面正中央偏上，約螢幕高度的 35% 處
                        const targetOffset = window.pageYOffset + rect.top - (vh * 0.35);
                        
                        // 暫時取消自動滾動（依使用者需求）
                    } catch(_) {}
                }
                window.scrollToStartButtonForMobile = scrollToStartButtonForMobile;
        const applyModeUI = () => {
                    if (!modeClassicBtn || !modeSurvivalBtn) return;
                    const c = gameState.playMode === 'classic';
                    const inPractice = !!gameState.range; // 任一練習範圍（含主題/自訂）
                    const hasEquipPending = !!gameState.__pendingEquipTier || (equipCourseCard && equipCourseCard.getAttribute('aria-pressed') === 'true');
                    const customSelected = gameState.range === 'custom';
                    const baseClass = 'mode-card-interactive w-full text-left py-1.5 px-3 md:py-2 md:px-4 rounded-xl border-2 transition flex items-center justify-between shadow-sm hover:shadow-md ';
                    
                    if (inPractice) {
                        // 練習模式：兩個模式按鈕保持一般外觀且可再次點擊切換離開練習
                        modeClassicBtn.className = baseClass + 'border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50';
                        modeClassicBtn.setAttribute('aria-pressed', 'false');
                        modeClassicBtn.removeAttribute('aria-disabled');
                        modeSurvivalBtn.className = baseClass + 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50';
                        modeSurvivalBtn.setAttribute('aria-pressed', 'false');
                        modeSurvivalBtn.removeAttribute('aria-disabled');
                    } else {
                        // 一般：依選擇顯示闖關/生存
                        const classicSelected = c && !hasEquipPending;
                        modeClassicBtn.className = baseClass + (classicSelected ? 'border-rose-500 bg-gradient-to-br from-rose-50 to-pink-50 font-bold shadow' : 'border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50');
                        modeClassicBtn.setAttribute('aria-pressed', c ? 'true' : 'false');
                        modeClassicBtn.removeAttribute('aria-disabled');

                        const survivalSelected = (!c && !inPractice && !hasEquipPending) && gameState.playMode === 'survival';
                        let survivalClass = baseClass + (survivalSelected ? 'border-emerald-500 bg-gradient-to-br from-emerald-50 to-teal-50 font-bold shadow' : 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50');
                        modeSurvivalBtn.className = survivalClass;
                        modeSurvivalBtn.setAttribute('aria-pressed', survivalSelected ? 'true' : 'false');
                        modeSurvivalBtn.removeAttribute('aria-disabled');
                    }

                    // 若有裝備課程班級待選（將進入裝備模式），將闖關/生存外觀重置為未選以避免色框殘留
                    if (hasEquipPending) {
                        modeClassicBtn.className = baseClass + 'border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50';
                        modeClassicBtn.setAttribute('aria-pressed', 'false');
                        modeSurvivalBtn.className = baseClass + 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50';
                        modeSurvivalBtn.setAttribute('aria-pressed', 'false');
                    }

                    try {
                        customAreaCard?.setAttribute('aria-pressed', customSelected ? 'true' : 'false');
                        equipCourseCard?.setAttribute('aria-pressed', hasEquipPending ? 'true' : 'false');
                        const grid = document.getElementById('mainMenuGrid');
                        const hasActive = (gameState.playMode === 'classic') || (gameState.playMode === 'survival') || customSelected || hasEquipPending;
                        if (grid) grid.classList.toggle('mode-selection-active', hasActive);
                    } catch(_) {}
                };
                // 讓其他地方可呼叫 UI 更新
                window.__applyModeUI = applyModeUI;
                const setPlayMode = (mode) => {
                    // 練習模式啟用時，禁止切換闖關/生存（獨立模式）
                    if (gameState.range) {
                        try { showCuteHint('目前為練習狀態，請先取消鎖定範圍，即可挑戰闖關或生存模式。', 'blue', undefined, '🧩'); } catch(_) {}
                        applyModeUI();
                        return;
                    }
                    if (!mode) { gameState.playMode = null; applyModeUI(); updateStartButtonState(); return; }
                    gameState.playMode = (mode === 'survival') ? 'survival' : 'classic';
                    applyModeUI();
                    // persist preference
                    try {
                        if (window.saveSettings) window.saveSettings({ playMode: gameState.playMode });
                        else {
                            const key = 'bibleGameSettings';
                            const saved = JSON.parse(localStorage.getItem(key) || '{}') || {};
                            saved.playMode = gameState.playMode;
                            localStorage.setItem(key, JSON.stringify(saved));
                        }
                    } catch (_) {}
                };
                // Wire clicks to our exclusive selector
        if (modeClassicBtn) modeClassicBtn.addEventListener('click', () => {
                    if (!gameState.range && gameState.playMode === 'classic') {
                        gameState.playMode = null; // deselect
                        selectHomeMode(null);
                        /* removed deselect hint */
                        return;
                    }
                    selectHomeMode('classic');
                    try { const m=MODE_HINTS.classic; showCuteHint(m.lines, m.theme, undefined, m.icon); } catch(_) {}
                });
        if (modeSurvivalBtn) modeSurvivalBtn.addEventListener('click', () => {
                    if (!gameState.range && gameState.playMode === 'survival') {
                        gameState.playMode = null;
                        selectHomeMode(null);
                        /* removed deselect hint */
                        return;
                    }
                    selectHomeMode('survival');
                    try { const m=MODE_HINTS.survival; showCuteHint(m.lines, m.theme, undefined, m.icon); } catch(_) {}
                });
                // Custom area/equip are also exclusive
                if (customAreaCard) {
                    // Helper: 判斷是否點擊在卡片內部的互動元素上（避免冒泡誤觸卡片切換）
                    const isInteractiveInsideCustom = (t) => {
                        if (!t) return false;
                        // 快速選擇分類、展開卡片內的全選/清空、搜尋框、以及書卷按鈕
                        return !!(
                            t.closest('#qsOld, #qsNew, #qsLaw, #qsHistory, #qsPoetry, #qsProphets, #qsGospels, #qsPaul, #qsGeneral') ||
                            t.closest('#selectAllBooksExpand') ||
                            t.closest('#clearAllBooksExpand') ||
                            t.closest('#bookSearchExpand') ||
                            t.closest('#customBooksExpandCard #customBooksExpand button')
                        );
                    };

                    // Click：點擊卡片可在「選取自訂」與「取消自訂（回到無模式）」間切換
                    customAreaCard.addEventListener('click', (ev) => {
                        const t = ev.target;
                        if (isInteractiveInsideCustom(t)) {
                            // 交由內部元件自己處理（例如 quick-select），卡片不介入
                            return;
                        }
                        if (gameState.range === 'custom') {
                            // 取消自訂模式：恢復到「未選模式」的狀態
                            try { document.getElementById('customBooksExpandCard')?.classList.add('hidden'); } catch(_) {}
                            // 清空自訂書卷並刷新展開卡/快速分類視覺
                            try { gameState.customBooks = []; initializeCustomBooksInExpandCard(); refreshQuickSelectCategoryStates(); } catch(_) {}
                            gameState.range = null;
                            // 一併清除核心模式，回到「未選模式」
                            try { gameState.playMode = null; } catch(_) {}
                            selectHomeMode(null);
                            /* removed deselect hint */
                            return;
                        }
                        // 尚未選取 → 切換到自訂模式
                        selectHomeMode('custom');
                        try { const m=MODE_HINTS.custom; showCuteHint(m.lines, m.theme, undefined, m.icon); } catch(_) {}
                    });

                    // Keyboard：Enter/Space 在卡片自身聚焦時亦支援切換
                    customAreaCard.addEventListener('keydown', (ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault();
                            // 若鍵盤事件來源是卡片內互動元件（例如搜尋輸入框、快捷按鈕），則忽略
                            if (isInteractiveInsideCustom(ev.target)) return;
                            if (gameState.range === 'custom') {
                                try { document.getElementById('customBooksExpandCard')?.classList.add('hidden'); } catch(_) {}
                                // 清空自訂書卷並刷新展開卡/快速分類視覺
                                try { gameState.customBooks = []; initializeCustomBooksInExpandCard(); refreshQuickSelectCategoryStates(); } catch(_) {}
                                gameState.range = null;
                                // 同步清除核心模式選擇
                                try { gameState.playMode = null; } catch(_) {}
                                selectHomeMode(null);
                                /* removed deselect hint */
                            } else {
                                selectHomeMode('custom');
                                try { const m=MODE_HINTS.custom; showCuteHint(m.lines, m.theme, undefined, m.icon); } catch(_) {}
                            }
                        }
                    });
                }
                if (equipCourseCard) {
                    const isInteractiveInsideEquip = (t) => {
                        return !!(t && (t.id === 'equipTierGrowth' || t.id === 'equipTierDisciple' || t.id === 'equipTierLeader' || t.closest('.equip-tiers-content')));
                    };

                    equipCourseCard.addEventListener('click', (ev) => {
                        const t = ev.target;
                        if (isInteractiveInsideEquip(t)) return;
                        if (equipCourseCard.getAttribute('aria-pressed') === 'true' && !gameState.__pendingEquipTier) {
                            selectHomeMode(null);
                        } else {
                            selectHomeMode('equip');
                            try { const m=MODE_HINTS.equip; showCuteHint(m.lines, m.theme, undefined, m.icon); } catch(_) {}
                        }
                    });

                    equipCourseCard.addEventListener('keydown', (ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault();
                            if (isInteractiveInsideEquip(ev.target)) return;
                            if (equipCourseCard.getAttribute('aria-pressed') === 'true' && !gameState.__pendingEquipTier) {
                                selectHomeMode(null);
                            } else {
                                selectHomeMode('equip');
                                try { const m=MODE_HINTS.equip; showCuteHint(m.lines, m.theme, undefined, m.icon); } catch(_) {}
                            }
                        }
                    });
                }
                // 不再自動恢復保存的 playMode，保持主選單進入時無預設模式
                applyModeUI();
            } catch (_) { /* ignore */ }
            
            // 倒數顯示開關已移除（固定啟用）

            // 恢復使用者偏好設定（難度/罕見度/範圍/時間獎勵）
            // Suppress cute hints while applying saved selections to avoid popping on initial menu
            const __prevSuppress = window.__suppressCuteHints;
            window.__suppressCuteHints = true;
            try {
                const saved = JSON.parse(localStorage.getItem('bibleChallenge.prefs') || '{}');
                if (saved && typeof saved === 'object') {
                    // migrate deprecated rarity 'medium' -> 'common'
                    if (saved.rarity === 'medium') saved.rarity = 'common';
                    if (saved.difficulty) {
                        const btn = document.querySelector(`.difficulty-option[data-difficulty="${saved.difficulty}"]`);
                        if (btn && !btn.classList.contains('selected')) btn.click();
                    }
                    if (saved.rarity) {
                        const btn = document.querySelector(`.rarity-option[data-rarity="${saved.rarity}"]`);
                        if (btn && !btn.classList.contains('selected')) btn.click();
                        // 可能未觸發 click: 確保文字更新
                        updateBaseScoreRuleDisplay();
                    }
                    if (saved.range) {
                        let btn = null;
                        if (saved.range === 'theme' && saved.theme) {
                            btn = document.querySelector(`.range-option[data-range="theme"][data-theme="${saved.theme}"]`);
                        } else {
                            btn = document.querySelector(`.range-option[data-range="${saved.range}"]`);
                        }
                        if (btn && !btn.classList.contains('selected')) btn.click();
                    }
                    // showTimeReward 偏好已停用（固定啟用）
                }
            } catch (e) { /* ignore */ }
            finally { window.__suppressCuteHints = __prevSuppress; }
            
            // 自訂書卷視窗事件（改用統一 modal 管理器）
            try { document.getElementById('confirmCustomSelection')?.addEventListener('click', confirmCustomSelection); } catch(_) {}

            // 遊戲事件
            document.getElementById('hintBtn').addEventListener('click', useHint);
            // Settings and back-to-menu wiring
            try { document.getElementById('openSettingsFromMenu')?.addEventListener('click', () => openSettingsModal('menu')); } catch(_) {}
            try { document.getElementById('openSettingsFromGame')?.addEventListener('click', () => openSettingsModal('game')); } catch(_) {}
            try { document.getElementById('adaptiveBackBtn')?.addEventListener('click', () => openSettingsModal('game')); } catch(_) {}
            // Legacy back button may not exist; guard safely
            document.getElementById('backToMenuFromGame')?.addEventListener('click', () => { try { openModal('confirmBackModal'); } catch(_) {} });
            // Settings modal controls
            try { document.getElementById('closeSettingsBtn')?.addEventListener('click', () => { try { SFX.play('uiClose'); } catch(_) {} closeSettingsModal(); }); } catch(_) {}
            try { document.getElementById('saveSettingsBtn')?.addEventListener('click', () => { saveSettingsFromModal(); }); } catch(_) {}
            try { document.getElementById('settingsBackToMenu')?.addEventListener('click', () => {
                try { closeModal('settingsModal'); } catch(_) {}
                try {
                    const inGame = !document.getElementById('gameScreen').classList.contains('hidden');
                    if (inGame) openModal('confirmBackModal');
                } catch(_) {}
            }); } catch(_) {}
            document.getElementById('confirmBackBtn').addEventListener('click', () => {
                try { closeModal('confirmBackModal'); } catch(_) {}
                // 強制移除所有遊戲提示
                document.querySelectorAll('.game-instruction').forEach(inst => {
                    if (inst.parentElement) inst.parentElement.removeChild(inst);
                });
                // 停止星星雨效果
                try { stopStarRain(true); } catch(_) {}
                if (gameState.score > 0) {
                    // 中途退出，遊戲未完成
                    gameState.gameCompleted = false;
                    saveScore(gameState.score);
                }
                // 裝備與模式狀態重置（避免返回主選單後殘留專用 UI 或邏輯）
                try {
                    gameState.equipRunning = false;
                    gameState.equipTier = null;
                    gameState.equipPhase = 0;
                    gameState.currentEquipEntry = null;
                    gameState.equipRemaining = [];
                    gameState.__pendingEquipTier = null;
                    gameState.equipLastBook = null;
                    gameState.equipDistractorPool = [];
                    gameState.equipLevelCount = 10;
                    delete gameState.__equipHandoffLocked;
                    delete gameState.__equipFinished;
                    delete gameState.__equipEnding;
                    try { setEquipInteractionLock(false); } catch(_) {}
                    // 移除裝備卡片高亮與班級標記
                    highlightSelectedEquipTier(null);
                    const equipCard = document.getElementById('equipCourseCard');
                    if (equipCard) {
                        equipCard.style.borderWidth=''; equipCard.style.borderColor=''; equipCard.style.boxShadow='';
                        equipCard.setAttribute('aria-pressed','false');
                    }
                } catch(_) {}
                GameTimer.stopAll();
                try { const card = document.getElementById('survivalTimerCard'); if (card) card.classList.add('hidden'); } catch(_) {}
                showStartScreen();
                // 確保裝備 UI 隱藏、配對 UI 顯示
                try { showEquipUI(false); } catch(_) {}
                try { window.__applyModeUI && window.__applyModeUI(); } catch(_) {}
            });
            // 取消返回按鈕已加上 data-close-modal 屬性，無需額外處理
            document.getElementById('confirmNameBtn').addEventListener('click', confirmPlayerName);
            document.getElementById('clearAllBooks').addEventListener('click', clearAllBooks);
            
            // 排行榜標籤事件
            document.querySelectorAll('.leaderboard-tab').forEach(tab => {
                if (tab.__bcBoundSelectTab) return;
                tab.__bcBoundSelectTab = true;
                tab.addEventListener('click', selectLeaderboardTab);
            });

            // 開發者指令觸發清空排行榜（取代舊的標題左右圖示手勢）
            const openClearModal = () => {
                const modal = document.getElementById('clearLeaderboardModal');
                if (modal) {
                    openModal('clearLeaderboardModal');
                    const input = document.getElementById('clearConfirmInput');
                    const btn = document.getElementById('confirmClearLeaderboard');
                    if (input && btn){
                        input.value='';
                        btn.disabled = true; btn.setAttribute('aria-disabled','true');
                        btn.classList.add('opacity-60','cursor-not-allowed');
                        setTimeout(()=>{ try { input.focus(); } catch(_){} }, 30);
                    }
                    try { announce && announce('已開啟清空排行榜確認視窗'); } catch(_) {}
                }
            };
            // 開發者指令 Modal 行為
            (function initDevCommands(){
                const openBtn = document.getElementById('openDevCommands');
                const modal = document.getElementById('devCommandModal');
                const input = document.getElementById('devCommandInput');
                const confirm = document.getElementById('confirmDevCommand');
                const cancel = document.getElementById('cancelDevCommand');
                const closeX = document.getElementById('closeDevCommandX');
                let diagnosticsLoading = null;
                function ensureDiagnosticsReady(){
                    try {
                        if (window.__devDiagnosticsAdded) return Promise.resolve();
                        if (diagnosticsLoading) return diagnosticsLoading;
                        diagnosticsLoading = new Promise((resolve, reject) => {
                            const script = document.createElement('script');
                            script.src = 'js/modules/diagnostics.js';
                            script.defer = true;
                            script.onload = () => resolve();
                            script.onerror = (e) => reject(e);
                            document.head.appendChild(script);
                        }).finally(() => { diagnosticsLoading = null; });
                        return diagnosticsLoading;
                    } catch (e) {
                        return Promise.reject(e);
                    }
                }
                function openDev(){
                    if (!modal) return; openModal('devCommandModal');
                    try { ensureDiagnosticsReady().catch(()=>{}); } catch(_) {}
                    if (input){ input.value=''; confirm.disabled=true; confirm.setAttribute('aria-disabled','true'); confirm.classList.add('opacity-60','cursor-not-allowed'); setTimeout(()=>{ try { input.focus(); } catch(_){} },30); }
                    try { announce && announce('已開啟開發者指令視窗'); } catch(_) {}
                }
                function closeDev(){ if (!modal) return; closeModal('devCommandModal'); }
                function maybeEnable(){ if (!confirm || !input) return; const v = (input.value||'').trim(); if (v) { confirm.disabled=false; confirm.removeAttribute('aria-disabled'); confirm.classList.remove('opacity-60','cursor-not-allowed'); } else { confirm.disabled=true; confirm.setAttribute('aria-disabled','true'); confirm.classList.add('opacity-60','cursor-not-allowed'); } }
                async function execCommand(){
                    if (!input) return;
                    const code = (input.value || '').trim();
                    if (code === '7777') {
                        closeDev();
                        openClearModal();
                        return;
                    }
                    if (code === '6666' || /^(6666r)$/i.test(code)) {
                        // Online-only seeding: require online adapter; do NOT write to local storage.
                        const onlineEnabled = !!(window.Leaderboard && typeof window.Leaderboard.save === 'function' && typeof window.Leaderboard.load === 'function');
                        if (!onlineEnabled) {
                            try { showCuteHint('未設定線上排行榜，無法補種測試資料（不會寫入本機）', 'purple', 2800, 'ℹ️'); } catch(_) {}
                            return;
                        }
                        const remoteAlso = true; // force online-only
                        try { SFX && SFX.play && SFX.play('uiConfirm'); } catch(_) {}
                        // Determine active leaderboard mode from selected tab; fallback to cached mode or classic
                        let mode = 'classic';
                        try {
                            const active = document.querySelector('.leaderboard-tab[aria-selected="true"]');
                            const m = active && (active.dataset.mode || '').toLowerCase();
                            if (m === 'classic' || m === 'survival') mode = m;
                            else if (window.__lbActiveMode) mode = window.__lbActiveMode;
                        } catch(_) { try { if (window.__lbActiveMode) mode = window.__lbActiveMode; } catch(_) {} }

                        // Load existing leaderboard (prefer online if available) and compute empty slots against LEADERBOARD_LIMIT
                        const LIMIT = (window.__BC_CONSTS && window.__BC_CONSTS.LEADERBOARD_LIMIT) || 20;
                        let effective = null;
                        try {
                            const res = window.Leaderboard.load();
                            if (res && typeof res.then === 'function') {
                                const timeoutMs = (window.__BC_CONSTS && window.__BC_CONSTS.LEADERBOARD_ONLINE_TIMEOUT_MS) || 7000;
                                effective = await Promise.race([
                                    res,
                                    new Promise(resolve => setTimeout(() => resolve({ classic: [], survival: [] }), timeoutMs))
                                ]);
                            } else {
                                effective = res;
                            }
                        } catch(_) { effective = { classic: [], survival: [] }; }
                        const list = (effective && effective[mode]) ? effective[mode] : [];
                        const currentCount = Array.isArray(list) ? list.length : 0;
                        const empty = Math.max(0, LIMIT - currentCount);
                        if (empty <= 0) {
                            closeDev();
                            try { showCuteHint(`目前「${mode==='survival'?'生存計時':'闖關挑戰'}」沒有空白名次可填`, 'purple', 2400, 'ℹ️'); } catch(_) {}
                            return;
                        }

                        // Prepare unique short cute/fun name generator (1~4 chars, avoid duplicates)
                        const existingNames = new Set((list || []).map(r => (r && r.playerName) ? String(r.playerName) : '匿名'));
                        const batchNames = new Set();
                        function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
                        const cuteBase = [
                            '豆豆','球球','咪咪','妞妞','牛牛','可可','樂樂','朵朵','多多','東東','天天','皮皮','巧巧','元元','花花','點點','泡泡','柚柚','果果','喵喵','汪汪','萌萌','熊熊','糖糖','餅乾','小白','小黑','小米','小光','小羽','阿樂','阿福','阿牧','阿喜','阿花','阿星','阿比','阿茉','阿寶','小鯊','小熊','小鹿','小魚','小貓','小汪','小狐','小松','小草','小豆','小皮','白白','黑皮','奈奈','比比','露露','奇奇','妙妙','圓圓','悠悠','可愛','軟綿','甜心','小萌','小可','米米'
                        ];
                        const syllables = ['小','阿','豆','米','果','樂','皮','球','花','糖','白','黑','萌','喵','汪','狐','鹿','熊','星','泡','點','朵','多','光','羽','茉','寶','比','奈','露','奇','妙','圓','悠'];
                        function genName(){
                            // 60% 直接使用可愛名單，40% 自行組合 1~3 個音節
                            if (Math.random() < 0.6) return pick(cuteBase);
                            const len = Math.min(4, Math.max(1, Math.floor(Math.random()*3)+1));
                            let out = '';
                            for (let i=0;i<len;i++) out += pick(syllables);
                            return out.slice(0,4);
                        }
                        function uniqueName(){
                            let tries = 0;
                            while (tries++ < 400) {
                                const name = genName();
                                if (name && name.length >= 1 && name.length <= 4 && !existingNames.has(name) && !batchNames.has(name)) { batchNames.add(name); return name; }
                            }
                            // Fallback: 玩家 + 編號（不超過 4 個字）
                            let idx = 1;
                            let name = '';
                            while (!name || existingNames.has(name) || batchNames.has(name)) { name = `玩${idx}`; idx++; if (idx>9999) break; }
                            batchNames.add(name); return name;
                        }

                        // Random score by mode
                        const scoreMin = mode === 'survival' ? 300 : 500;
                        const scoreMax = mode === 'survival' ? 3000 : 5000;
                        function randInt(min,max){ return Math.floor(Math.random() * (max - min + 1)) + min; }

                        const now = Date.now();
                        const fmtTime = (ms)=>{ const secs = Math.max(0, Math.floor(ms/1000)); const m = Math.floor(secs/60); const s = String(secs%60).padStart(2,'0'); return `${m}:${s}`; };
                        const added = [];
                        for (let i = 0; i < empty; i++) {
                            const playerName = uniqueName();
                            // Target scoreboard分數範圍
                            const targetScore = randInt(scoreMin, scoreMax);
                            // 虛構題數/正確率/關卡結果
                            const totalQuestions = mode === 'survival' ? randInt(8, 18) : randInt(8, 20);
                            const levels = Math.min(10, Math.max(1, Math.ceil(totalQuestions / (mode==='survival'?4:5))));
                            const perfectCount = randInt(0, levels);
                            const levelBonus = perfectCount * 300 + (levels - perfectCount) * 100;
                            const totalHints = 3; const hintsRemaining = randInt(0, totalHints); const hintBonus = hintsRemaining * 100;
                            const maxMistakes = Math.max(0, Math.floor(totalQuestions / 2));
                            let totalMistakes = randInt(0, maxMistakes);
                            // 先估最大可用正確數，避免 base 超出分數
                            const correctMax = Math.max(1, Math.min(totalQuestions, Math.floor((targetScore - levelBonus - hintBonus) / 100)));
                            const correctMin = Math.max(1, Math.floor(correctMax * 0.6));
                            let correctAnswers = Math.max(1, Math.min(correctMax, randInt(correctMin, correctMax)));
                            let base = correctAnswers * 100;
                            // 計算 timeReward 使最後分數接近目標
                            let timeReward = targetScore - base - levelBonus - hintBonus + totalMistakes * 50;
                            if (timeReward < 0) { timeReward = 0; }
                            // 最終分數（保證在範圍內）
                            let score = base + levelBonus + hintBonus - totalMistakes * 50 + timeReward;
                            if (score < scoreMin) { timeReward += (scoreMin - score); score = scoreMin; }
                            if (score > scoreMax) { const over = score - scoreMax; timeReward = Math.max(0, timeReward - over); score = scoreMax; }
                            // 用時
                            const timeMs = (mode==='survival' ? randInt(60, 480) : randInt(120, 720)) * 1000;
                            const timeStr = fmtTime(timeMs);
                            // 關卡結果明細
                            const levelResults = {}; for (let L=1; L<=levels; L++){ levelResults[L] = (L <= perfectCount) ? 'perfect' : 'complete'; }
                            // 構建完整可檢視的排行榜紀錄（供點卡片開啟結算視窗）
                            const rec = {
                                id: `seed-${now}-${mode}-${i}-${Math.floor(Math.random()*1e6)}`,
                                playerName,
                                score,
                                difficulty: 'normal',
                                date: new Date().toLocaleDateString('zh-TW'),
                                // Prefer one duration field to avoid duplicate rendering in UI; also write time for DB row
                                elapsed: timeStr,
                                time: timeStr,
                                timeMs,
                                completed: true,
                                correctAnswers,
                                accuracy: Math.round((correctAnswers / Math.max(1,totalQuestions)) * 100),
                                totalQuestions,
                                totalMistakes,
                                levelResults,
                                range: 'all',
                                rarity: null,
                                mode: 'ranking',
                                playMode: mode,
                                hintsRemaining,
                                totalHints,
                                showTimeReward: true,
                                timeReward,
                                usedHintsCount: (totalHints - hintsRemaining),
                                createdAt: now + i,
                                achievements: [],
                                isSeed: true
                            };
                            // Online-only: do NOT write to local storage
                            if (remoteAlso && window.Leaderboard && typeof window.Leaderboard.save === 'function') {
                                try {
                                    const timeoutMs = (window.__BC_CONSTS && window.__BC_CONSTS.LEADERBOARD_ONLINE_TIMEOUT_MS) || 7000;
                                    await Promise.race([
                                        window.Leaderboard.save(rec),
                                        new Promise((_, reject) => setTimeout(() => reject(new Error('dev-seed-save-timeout')), timeoutMs))
                                    ]);
                                } catch(e){ console.warn('[DEV] remote seed save failed', e); }
                            }
                            added.push(rec);
                        }

                        // Do not push local 'added' seeds into cache to avoid duplicates with DB-inserted rows.
                        // We rely on online save()'s optimistic update and a forced refresh below.
                        // Invalidate any other caches if present
                        try { window.invalidateLeaderboardCache && window.invalidateLeaderboardCache(); } catch(_) {}
                        closeDev();
                        try { await updateLeaderboardDisplay(mode, { force: true }); } catch(_) { try { updateLeaderboardDisplay && updateLeaderboardDisplay(mode); } catch(_) {} }
                        try {
                            const msg = `已為「${mode==='survival'?'生存計時':'闖關挑戰'}」補上 ${empty} 筆測試紀錄（線上）`;
                            showCuteHint(msg, mode==='survival'?'green':'rose', 2800, '🌐');
                        } catch(_) {}
                        return;
                    }
                }
                openBtn && openBtn.addEventListener('click', openDev);
                cancel && cancel.addEventListener('click', closeDev);
                closeX && closeX.addEventListener('click', closeDev);
                input && input.addEventListener('input', maybeEnable);
                confirm && confirm.addEventListener('click', execCommand);
                window.openDevCommandsModal = openDev;
            })();

            // Ensure custom-books cleanup triggers when modal closed via data-close-modal
            try {
                document.addEventListener('modal:closed', (ev) => {
                    const id = ev && ev.detail && ev.detail.id;
                    if (id === 'customBooksModal') {
                        if (gameState.customBooks.length === 0) {
                            gameState.range = null;
                            document.querySelectorAll('.range-option').forEach(opt => {
                                opt.classList.remove('selected', 'border-purple-500', 'border-4', 'shadow-lg');
                                opt.classList.add('border-gray-300', 'border-2');
                            });
                            // try { updateSettingsDisplay(); } catch(_) {}
                            try { updateStartButtonState(); } catch(_) {}
                        }
                    }
                });
            } catch(_) {}

            document.getElementById('cancelClearLeaderboard')?.addEventListener('click', () => closeModal('clearLeaderboardModal'));
            document.getElementById('closeClearLeaderboardX')?.addEventListener('click', () => closeModal('clearLeaderboardModal'));
            document.getElementById('clearConfirmInput')?.addEventListener('input', (e) => {
                const v = (e.target.value || '').trim();
                const btn = document.getElementById('confirmClearLeaderboard');
                if (!btn) return;
                if (v === 'CLEAR') { btn.disabled = false; btn.removeAttribute('aria-disabled'); btn.classList.remove('opacity-60','cursor-not-allowed'); }
                else { btn.disabled = true; btn.setAttribute('aria-disabled','true'); btn.classList.add('opacity-60','cursor-not-allowed'); }
            });

            document.getElementById('confirmClearLeaderboard')?.addEventListener('click', async () => {
                // 清除排行榜：先遠端、後本機；清除後立即失效快取並強制重新載入，避免殘留快取資料
                const showBusy = (msg) => { try { showCuteHint(msg || '清除中…', 'rose', 2400, '🧹'); } catch(_) {} };
                const showDone = (msg) => { try { showCuteHint(msg || '已清除排行榜', 'green', 2200, '✅'); } catch(_) {} };
                showBusy('正在清除排行榜…');
                let remoteOk = true;
                // 若可能有線上排行榜，先確保 Supabase 載入並嘗試安裝 Adapter
                try { if (window.ensureSupabaseReady) await window.ensureSupabaseReady().catch(()=>{}); } catch(_) {}
                try { window.tryInitOnlineLeaderboard && window.tryInitOnlineLeaderboard(); } catch(_) {}
                if (window.Leaderboard && typeof window.Leaderboard.clear === 'function') {
                    try {
                        await window.Leaderboard.clear();
                    } catch (e) {
                        remoteOk = false;
                        console.warn('[LEADERBOARD] remote clear failed, will still clear local', e);
                    }
                }
                // Purge any cached data structures / local storage copies
                try { window.__lbLatestData = { classic: [], survival: [] }; window.__lbLatestTs = 0; } catch(_) {}
                try { const key=(window.__BC_CONSTS&&window.__BC_CONSTS.STORAGE_KEY_LEADERBOARD)||'bibleGameLeaderboard'; if(window.__bcStorage) window.__bcStorage.remove(key); else localStorage.removeItem(key); } catch(_) {}
                // 強制重新載入（繞過快取）
                try { await updateLeaderboardDisplay('classic', { force: true }); } catch(_) {}
                // 若目前選的是 survival tab，再重繪一次 survival
                try {
                    const active = document.querySelector('.leaderboard-tab[aria-selected="true"]');
                    if (active && /survival/.test(active.dataset.mode||'')) {
                        await updateLeaderboardDisplay('survival', { force: true });
                    }
                } catch(_) {}
                // 在可能有延遲的遠端一致性下，再排程一次安全刷新（確保剛清空後的最終狀態）
                setTimeout(()=>{ try { updateLeaderboardDisplay('classic', { force: true }); } catch(_) {} }, 1200);
                setTimeout(()=>{ try { updateLeaderboardDisplay('survival', { force: true }); } catch(_) {} }, 1500);
                try { closeModal('clearLeaderboardModal'); } catch(_) {
                    document.getElementById('clearLeaderboardModal')?.classList.add('hidden');
                    const modal = document.getElementById('clearLeaderboardModal');
                    if (modal) { modal.setAttribute('aria-hidden','true'); try { __deactivateFocusTrap && __deactivateFocusTrap(modal); } catch(_) {} }
                }
                showDone(remoteOk ? '已清除排行榜（線上與本機）' : '已清除本機排行榜（線上可能未成功）');
                lastTitleIconClickedAt = 0;
                lastTitleIcon = null;
            });

}
window.initStartScreenUI = initStartScreenUI;
