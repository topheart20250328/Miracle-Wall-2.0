// ---------------------------------------------------- 
// Game Startup & Countdown flow (Extracted from engine.js) 
// ---------------------------------------------------- 

function startGame() {
                if (window.__startFlowActive) return;
                window.__startFlowActive = true;
                const abortStartFlow = () => {
                    try { window.__startFlowActive = false; } catch(_) {}
                };

                // 等待裝備模式題庫載入完成（如果存在 Promise）
                if (window.__equipPunctMapPromise) {
                    window.__equipPunctMapPromise.then(() => startGameInner(abortStartFlow)).catch(() => startGameInner(abortStartFlow));
                } else {
                    startGameInner(abortStartFlow);
                }
            }

            function startGameInner(abortStartFlow) {
                // Initialize Metrics for the new run
                if (window.resetGameMetrics) window.resetGameMetrics(gameState.playMode);

                // 題庫未就緒時不可進入倒數：主動急載入並給出即時提示
                try {
                    const hasData = !!(
                        (Array.isArray(window.__normalizedDB) && window.__normalizedDB.length > 0) ||
                        (Array.isArray(window.verseDatabase) && window.verseDatabase.length > 0)
                    );
                    if (!hasData) {
                        try { if (typeof requestUrgentVerseLoad === 'function') requestUrgentVerseLoad(false, { interactive: true }); } catch(_) {}
                        const hint = document.getElementById('gameStartHint');
                        if (hint) {
                            hint.textContent = '題庫載入中，請稍候再試…';
                            hint.style.opacity = '1';
                        }
                        try { updateStartButtonState(); } catch(_) {}
                        abortStartFlow();
                        return;
                    }
                } catch(_) {}

                // 允許啟動途徑：排行（罕見度）、練習（範圍）、或核心模式（闖關/生存）
                const isCoreMode = (gameState.playMode === 'classic' || gameState.playMode === 'survival');
                if (!isCoreMode && !gameState.rarity && !gameState.range && !gameState.__pendingEquipTier) {
                    abortStartFlow();
                    return;
                }
            try { hideCuteHint(true); } catch(_) {}
            // 新一局開始時先重置上一關統計（避免殘留結算 meta）
            try { resetLastLevelMeta(); } catch(_) {}
                try { performance.mark('bc-game-start'); } catch(_) {}
            
        // 練習模式：檢查自訂範圍是否有足夠的書卷
        if (gameState.range === 'custom') {
        if (gameState.customBooks.length < 1) {
                    const warn = document.getElementById('rangeWarning');
                    if (warn) {
            warn.textContent = '⚠️ 自訂範圍至少選 1 本書卷';
                        warn.classList.remove('hidden');
                    }
                    abortStartFlow();
                    return;
                }
                
                // 檢查選擇的書卷是否有對應的經文
                const availableVersesCount = getAvailableVersesQuickCount();
                if (availableVersesCount < 5) {
            document.getElementById('rangeWarning').innerHTML = '⚠️ 可用經文不足（至少需要 5 篇），請擴大範圍或更換主題/範圍！';
                    document.getElementById('rangeWarning').classList.remove('hidden');
                    abortStartFlow();
                    return;
                }
            }
            
            // 開始倒數
            try { startCountdown(); } catch(_) { abortStartFlow(); }
        }
        
    function startCountdown() {
            try {
                if (window.__startCountdownInterval) {
                    clearInterval(window.__startCountdownInterval);
                    window.__startCountdownInterval = null;
                }
                if (window.__startFlowWatchdog) {
                    clearTimeout(window.__startFlowWatchdog);
                    window.__startFlowWatchdog = null;
                }
            } catch(_) {}
            // 顯示開始遊戲提示視窗
            showGameStartModal();
            
            // 鎖定所有主畫面按鈕
            lockMainScreenButtons(true);
            
            const startBtn = document.getElementById('startGameBtn');
        // 移除原本點擊後的橘色邊框與發光效果（需求）
        startBtn.style.border = '';
        startBtn.style.boxShadow = '';

            // Unique start button effect (aurora rings + particles)
            try { 
                const modeTone = startBtn.dataset.uiSig || 'default';
                triggerStartButtonBurst(startBtn.getBoundingClientRect(), modeTone); 
            } catch(_) {}
            
            let countdown = 3;
            let hasSwitched = false; // 已在全黑時切換畫面的旗標
            const originalText = startBtn.innerHTML;
            // 倒數文字立即顯示（快速呈現）
            try { updateGameStartModal(countdown); } catch(_) {}
            // 保留「一開始的瞬間黑屏」效果：先讓初始微暗化完成，再進入長時間漸暗
            try {
                const veil = document.getElementById('gameStartVeil');
                if (veil) {
                    const totalMs = Math.max(300, countdown * 1000 - 100);
                    const prefersReduce = (typeof isReducedMotionPreferred === 'function') ? isReducedMotionPreferred() : (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
                    const startRamp = () => {
                        veil.style.transition = `opacity ${prefersReduce ? 200 : totalMs}ms linear`;
                        requestAnimationFrame(() => { veil.style.opacity = '1'; });
                    };
                    const current = parseFloat(getComputedStyle(veil).opacity) || 0;
                    if (current >= 0.35) {
                        // 初始微暗化已完成或接近完成，稍後啟動長時間漸暗
                        setTimeout(startRamp, 30);
                    } else {
                        // 等待首次 opacity 變化完成後再開始長時間漸暗（保留原本瞬間黑屏的感覺）
                        let started = false;
                        const onInitialEnd = (e) => {
                            if (e.propertyName !== 'opacity' || started) return;
                            started = true;
                            veil.removeEventListener('transitionend', onInitialEnd);
                            startRamp();
                        };
                        veil.addEventListener('transitionend', onInitialEnd);
                        // 後備：若 transitionend 未觸發，320ms 後啟動
                        setTimeout(() => {
                            if (!started) {
                                veil.removeEventListener('transitionend', onInitialEnd);
                                startRamp();
                            }
                        }, 320);
                    }
                }
            } catch(_) {}
            
            try {
                window.__startFlowWatchdog = setTimeout(() => {
                    try {
                        if (!window.__startFlowActive) return;
                        const modal = document.getElementById('gameStartModal');
                        if (modal) {
                            hideGameStartModal();
                            try { lockMainScreenButtons(false); } catch(_) {}
                            try { updateStartButtonState(); } catch(_) {}
                        }
                    } catch(_) {}
                }, 9000);
            } catch(_) {}

            const countdownInterval = setInterval(() => {
                if (countdown > 0) {
                    // 只更新提示視窗的倒數，不改變按鈕文字
                    updateGameStartModal(countdown);
                } else {
                    // 倒數結束，顯示「開始」，並準備進行全黑切換
                    updateGameStartModal(0);
                    if (!hasSwitched) {
                        hasSwitched = true;
                        // 進入闖關/生存遊戲畫面時，在手機上隱藏前/後段標題（加上 body 樣式）
                        try {
                            if (gameState.playMode === 'classic' || gameState.playMode === 'survival') {
                                document.body.classList.add('core-mode-playing');
                            }
                        } catch(_) {}
                        try {
                            const veil = document.getElementById('gameStartVeil');
                            if (veil) {
                                const proceed = () => {
                                    try { actuallyStartGame(); } catch(_) {}
                                    // 全黑後 1 秒內淡出，避免延誤計時
                                    try {
                                        const prefersReduce = (typeof isReducedMotionPreferred === 'function') ? isReducedMotionPreferred() : (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
                                        const outMs = prefersReduce ? 200 : 800;
                                        // 同步淡出「準備開始遊戲」與倒數/開始字樣
                                        const content = document.getElementById('gameStartContent');
                                        if (content) {
                                            content.style.transition = `opacity ${outMs}ms ease-out`;
                                            content.style.opacity = '0';
                                            content.style.pointerEvents = 'none';
                                        }
                                        // 黑幕淡出
                                        veil.style.transition = `opacity ${outMs}ms ease-out`;
                                        requestAnimationFrame(() => { veil.style.opacity = '0'; });
                                        const onReveal = () => { veil.removeEventListener('transitionend', onReveal); hideGameStartModal(); };
                                        veil.addEventListener('transitionend', onReveal);
                                    } catch(_) { hideGameStartModal(); }
                                };
                                // 若已幾乎全黑，直接切換；否則等達到全黑
                                const current = parseFloat(getComputedStyle(veil).opacity) || 0;
                                if (current >= 0.98) {
                                    proceed();
                                } else {
                                    const onFullBlack = (e) => {
                                        if (e.propertyName !== 'opacity') return;
                                        if ((parseFloat(getComputedStyle(veil).opacity) || 0) >= 0.98) {
                                            veil.removeEventListener('transitionend', onFullBlack);
                                            proceed();
                                        }
                                    };
                                    veil.addEventListener('transitionend', onFullBlack);
                                    // 保險：目標設為全黑（若尚未設過）
                                    requestAnimationFrame(() => { veil.style.opacity = '1'; });
                                }
                            } else {
                                // 後備路徑：直接切換
                                actuallyStartGame();
                                hideGameStartModal();
                            }
                        } catch(_) {
                            // 防禦：任何異常都直接切換
                            try { actuallyStartGame(); } catch(_) {}
                            try { hideGameStartModal(); } catch(_) {}
                        }
                    }
                }
                countdown--;
                // 一旦觸發切換即可清除定時器，避免重複觸發
                if (hasSwitched) {
                    clearInterval(countdownInterval);
                    try { window.__startCountdownInterval = null; } catch(_) {}
                } else if (countdown < -1) {
                    // 防守性：若未能觸發切換則直接開始
                    clearInterval(countdownInterval);
                    try { window.__startCountdownInterval = null; } catch(_) {}
                    try { actuallyStartGame(); } catch(_) {}
                    try { hideGameStartModal(); } catch(_) {}
                }
            }, 1000);
            try { window.__startCountdownInterval = countdownInterval; } catch(_) {}
        }
        
        function showGameStartModal() {
            // 創建提示視窗
            const modal = document.createElement('div');
            modal.id = 'gameStartModal';
            modal.className = 'fixed inset-0 flex items-center justify-center z-50';
            
            modal.innerHTML = `
                <div id="gameStartVeil" aria-hidden="true" style="position:absolute; inset:0; background:#000; opacity:0; transition: opacity 280ms ease-out;"></div>
                <div id="gameStartContent" class="text-center relative" style="z-index:1;">
                    <div class="mb-8">
                        <h2 class="text-5xl font-black bg-gradient-to-r from-white via-yellow-300 to-white bg-clip-text text-transparent mb-8 drop-shadow-2xl animate-pulse" style="text-shadow: 0 0 30px rgba(255, 255, 255, 0.8);">
                            準備開始遊戲
                        </h2>
                        <div id="countdownDisplay" class="text-[8rem] font-black bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 bg-clip-text text-transparent drop-shadow-2xl mb-6 transition-all duration-300 min-h-[180px] flex items-center justify-center" style="text-shadow: 0 0 50px rgba(255, 215, 0, 1), 0 0 100px rgba(255, 215, 0, 0.8);">
                        </div>
                        <div id="countdownText" class="text-3xl bg-gradient-to-r from-white via-yellow-300 to-white bg-clip-text text-transparent font-bold min-h-[40px] flex items-center justify-center" style="text-shadow: 0 0 30px rgba(255, 255, 255, 0.8); display: none;">
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            // 預先暗化背景（淡入），恢復原本的初始黑度與瞬間感
            try {
                const veil = document.getElementById('gameStartVeil');
                if (veil) requestAnimationFrame(() => { veil.style.opacity = '0.4'; });
            } catch(_) {}
        }
        
        function updateGameStartModal(countdown) {
            const countdownDisplay = document.getElementById('countdownDisplay');
            const countdownText = document.getElementById('countdownText');
            
            if (countdownDisplay && countdownText) {
                if (countdown > 0) {
                    countdownDisplay.textContent = countdown;
                    countdownDisplay.className = 'text-[8rem] font-black bg-gradient-to-r from-white via-yellow-300 to-white bg-clip-text text-transparent drop-shadow-2xl mb-6 transition-all duration-300 min-h-[180px] flex items-center justify-center countdown-float';
                    countdownDisplay.style.textShadow = '0 0 30px rgba(255, 255, 255, 0.8)';
                    // 隱藏輔助文字，不顯示「秒後開始」
                    countdownText.style.display = 'none';
                } else {
                    countdownDisplay.textContent = '開始';
                    countdownDisplay.className = 'text-[8rem] font-black bg-gradient-to-r from-white via-yellow-300 to-white bg-clip-text text-transparent drop-shadow-2xl mb-6 transition-all duration-300 min-h-[180px] flex items-center justify-center';
                    countdownDisplay.style.textShadow = '0 0 30px rgba(255, 255, 255, 0.8)';
                    // 隱藏輔助文字
                    countdownText.style.display = 'none';
                }
            }
        }
        
        function hideGameStartModal() {
            const modal = document.getElementById('gameStartModal');
            if (modal) {
                modal.remove();
            }
            try {
                if (window.__startCountdownInterval) {
                    clearInterval(window.__startCountdownInterval);
                    window.__startCountdownInterval = null;
                }
                if (window.__startFlowWatchdog) {
                    clearTimeout(window.__startFlowWatchdog);
                    window.__startFlowWatchdog = null;
                }
            } catch(_) {}
            try { window.__startFlowActive = false; } catch(_) {}
        }

        function lockMainScreenButtons(lock) {
            // 鎖定/解鎖所有難度選擇按鈕
            document.querySelectorAll('.difficulty-option').forEach(btn => {
                btn.style.pointerEvents = lock ? 'none' : 'auto';
            });
            
            // 鎖定/解鎖所有範圍選擇按鈕
            document.querySelectorAll('.range-option').forEach(btn => {
                btn.style.pointerEvents = lock ? 'none' : 'auto';
            });
            
            // 鎖定/解鎖時間獎勵開關（已移除切換，容錯處理）
            try {
                const toggle = document.getElementById('countdownToggle');
                const toggleContainer = toggle?.parentElement?.parentElement;
                if (toggleContainer) {
                    toggleContainer.style.pointerEvents = lock ? 'none' : 'auto';
                }
            } catch (_) { /* ignore */ }
            
            // 鎖定/解鎖排行榜區域
            const leaderboardSection = document.getElementById('leaderboardSection');
            if (leaderboardSection) {
                leaderboardSection.style.pointerEvents = lock ? 'none' : 'auto';
            }
            
            // 鎖定/解鎖自訂書卷區域
            const customBooksExpandCard = document.getElementById('customBooksExpandCard');
            if (customBooksExpandCard) {
                customBooksExpandCard.style.pointerEvents = lock ? 'none' : 'auto';
            }
            
            // 鎖定/解鎖開始遊戲按鈕
            const startBtn = document.getElementById('startGameBtn');
            startBtn.disabled = lock;
            startBtn.classList.toggle('start-button-pulse', !lock);
            startBtn.style.cursor = lock ? 'not-allowed' : 'pointer';
            startBtn.style.pointerEvents = lock ? 'none' : 'auto';
        }
        
        function actuallyStartGame() {
            try {
                if (window.__startCountdownInterval) {
                    clearInterval(window.__startCountdownInterval);
                    window.__startCountdownInterval = null;
                }
                if (window.__startFlowWatchdog) {
                    clearTimeout(window.__startFlowWatchdog);
                    window.__startFlowWatchdog = null;
                }
            } catch(_) {}
            try { window.__startFlowActive = false; } catch(_) {}
            // 若選擇了裝備課程班級，改走裝備課程流程（仍沿用倒數）
            if (gameState.__pendingEquipTier) {
                const tier = gameState.__pendingEquipTier;
                delete gameState.__pendingEquipTier;
                // 初始化裝備課程（函式內會設定 playMode 標籤與非排行屬性）
                startEquipCourse(tier);
                return;
            }
            // 非裝備：確保裝備專用 UI 關閉、配對面板恢復
            try { showEquipUI(false); } catch(_) {}
            try { setUnifiedHeaderLayout(true); } catch(_) {}
            try { document.body.classList.remove('equip-running'); } catch(_) {}
            // 重置遊戲狀態
            gameState.currentLevel = 1;
            gameState.currentQuestion = 1;
            gameState.score = 0;
            gameState.hintsUsed = 0;
            gameState.levelPerfect = true;
            gameState.questionAttempts = {};
            gameState.usedHints = new Set();
            gameState.gameStartTime = Date.now(); // 記錄遊戲開始時間
            gameState.gameCompleted = false;
            gameState.isFirstQuestionOfLevel = true;
            gameState.consecutiveMistakes = 0;
            gameState.hintReminderShown = false;
            gameState.levelHintReminderShown = false;
            gameState.firstNoScoreMissToastShown = false;
            gameState.levelFailedCount = 0;
            gameState.totalCorrectAnswers = 0; // 重置答對數
            gameState.totalQuestions = 0; // 重置總題數
            gameState.totalMistakes = 0; // 重置失誤次數
            gameState.levelResults = {}; // 重置關卡結果
            gameState.levelEndHandled = false; // 確保新遊戲時可正常切換關卡
            // Reset combo
            gameState.combo = 0;
            gameState.comboProgress = 0;
            gameState.comboTotalBonus = 0;
            gameState.comboPeak = 0;
            try { if (gameState.comboDecayTimer) { clearTimeout(gameState.comboDecayTimer); gameState.comboDecayTimer = null; } } catch(_) {}
            // 移除舊的基於最近答題速度與觀察期的罕見度調整機制；改採逐關時間自適應 (adaptiveVerseRarity)
            try { delete gameState.recentAnswerTimes; } catch(_) { gameState.recentAnswerTimes = undefined; }
            try { delete gameState._observationUntilLevel; } catch(_) {}
            gameState.adaptiveVerseRarity = 'common'; // 顯式初始化逐關罕見度段位
            gameState._rarityPosBuf = 0; // 方案C：升級緩衝
            gameState._rarityNegBuf = 0; // 方案C：降級緩衝
            gameState.rarityPoints = 0; // 若後續需要擴展為積分混合可直接使用
            // 設定初始內部難度（自適應起點：所有模式一律為 easy）
            try {
                gameState.difficulty = 'easy';
            } catch(_) { gameState.difficulty = 'easy'; }
            // 記錄目前難度以供自適應切換時比對
            gameState._lastAdaptiveDifficulty = gameState.difficulty;

            // track used verses across the entire game to avoid duplicates between levels
            try { gameState.usedVerses = new Set(); } catch (e) { gameState.usedVerses = new Set(); }

            // Ensure any replay-related flags are cleared for a fresh game started from the home screen
            gameState.skipLeaderboardOnComplete = false;
            gameState.replaySourceRecord = null;
            gameState._replaySequence = null;
            gameState._replaySeqIndex = null;
            gameState._adaptiveDisabled = false;
            gameState._forcedChapterOrder = null;
            gameState._sessionQuestions = [];
            // 改為於遊戲資訊卡顯示重播狀態，移除舊有角標切換
            console.log('[GAME] actuallyStartGame: cleared replay flags', { skipLeaderboardOnComplete: gameState.skipLeaderboardOnComplete, replaySourceRecord: gameState.replaySourceRecord });
            // If the player-name modal was left in viewing mode, reset it so normal save flow works
            try {
                const modal = document.getElementById('playerNameModal');
                if (modal) {
                    modal.dataset.viewingRecord = '';
                    modal.dataset.viewingMode = '';
                }
            } catch (e) {}

            // 強制分數顯示歸零
            const scoreElement = document.getElementById('centerScore');
            if (scoreElement) scoreElement.textContent = '0';

            // 設置提示次數
            const hintCounts = { easy: 3, normal: 3, hard: 3 };
            gameState.hintsRemaining = hintCounts[gameState.difficulty] ?? 3;

            hideAllScreens();
            document.getElementById('gameScreen').classList.remove('hidden');
            // 每次正式開始遊戲時（闖關/生存/練習）重置滑動面板位置
            try {
                const carousel = document.getElementById('versesCarousel');
                if (carousel) carousel.scrollTo({ left:0, behavior:'auto' });
            } catch(_) {}
            // 隱藏主選單品牌角標
            try { const m = document.getElementById('menuBrandCorner'); if (m) m.style.display = 'none'; } catch(_) {}
            // 先同步一次資訊卡（顯示觀察中與預設難度配色），避免舊狀態殘留
            try {
                if (typeof scheduleProgressUIUpdate === 'function') scheduleProgressUIUpdate({ adaptive: true });
                else updateAdaptiveStatus();
            } catch(_) {}
            // 初始化本局成就統計（闖關/生存）；練習/裝備不納入
            try {
                const mode = (gameState.playMode === 'survival' && !gameState.range) ? 'survival' : 'classic';
                resetMetrics(mode);
                console.log('[ACHV] resetMetrics at game start', { mode });
            } catch (e) { console.warn('resetMetrics failed', e); }

            generateLevel();
            updateGameUI();
            const runPostStartUiHydration = () => {
                // 應用時間獎勵顯示設定
                updateTimeRewardVisibility();

                // 初始化連擊槽 segment 方塊
                try {
                    ensureComboSegmentsReady();
                    updateComboUI(true);
                } catch(_) {}

                // 準備手機版迷你關卡進度條位置與內容（依模式/關卡數動態生成）
                renderMiniLevelPlaceholders();

                // 更新模式顯示並啟動/關閉生存倒數
                try {
                    const modeEl = document.getElementById('gameModeDisplay');
                    if (modeEl) modeEl.textContent = gameState.range ? '練習模式' : (isSurvival() ? '生存計時' : '闖關挑戰');
                    const card = document.getElementById('survivalTimerCard');
                    if (isSurvival()) {
                        if (card) card.classList.remove('hidden');
                        startSurvivalTimer(90);
                    } else {
                        if (card) card.classList.add('hidden');
                        stopSurvivalTimer();
                    }
                    // Desktop: show inline controls; Mobile keeps pinned bar
                    const controls = document.getElementById('adaptiveControls');
                    if (controls) controls.classList.toggle('hidden', window.innerWidth < 768);
                    const pinned = document.getElementById('gameControlsPinned');
                    if (pinned) pinned.classList.toggle('hidden', window.innerWidth >= 768);
                    // Wire proxy controls（僅在必要時重綁）
                    ensureAdaptiveProxyBindings();
                } catch (_) { /* ignore */ }
            };
            try {
                if (window.requestAnimationFrame) {
                    window.requestAnimationFrame(() => { setTimeout(runPostStartUiHydration, 0); });
                } else {
                    setTimeout(runPostStartUiHydration, 0);
                }
            } catch(_) { try { runPostStartUiHydration(); } catch(_) {} }
        }

    // 生成一個關卡（抽題、重置狀態、更新 UI）
