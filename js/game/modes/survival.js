        // #region 生存模式模組
        // Survival mode controls
        function updateSurvivalTimerDisplay() {
            try {
                const el = document.getElementById('survivalTimerDisplay');
                if (!el) return;
                const t = Math.max(0, Math.floor(gameState.survivalTimeRemaining || 0));
                const m = Math.floor(t / 60);
                const s = t % 60;
                el.textContent = `${m}:${String(s).padStart(2, '0')}`;
                // update fill width
                const fill = document.getElementById('survivalTimerFill');
                const total = Math.max(1, Number(gameState.survivalTotalTime || 0));
                if (fill) {
                    const pct = Math.max(0, Math.min(100, (t / total) * 100));
                    fill.style.width = pct + '%';
                }
                // update levels passed
                const levelsPassedEl = document.getElementById('levelsPassedCount');
                if (levelsPassedEl) {
                    const passed = Math.max(0, (Number(gameState.currentLevel||1) - 1));
                    levelsPassedEl.textContent = String(passed);
                }

                // Mirror to mobile mini survival timer (above score)
                const mini = document.getElementById('survivalTimerMini');
                if (mini) {
                    // lazily build inner structure once
                    if (!mini.dataset.bound) {
                        mini.innerHTML = `
                            <div class="timer-row">
                                <div class="timer-clock" aria-live="off"></div>
                                <div class="timer-label"><span class="timer-passed"></span></div>
                            </div>
                            <div class="bar"><div class="fill" style="width:100%"></div></div>
                        `;
                        mini.dataset.bound = '1';
                    }
                    const miniClock = mini.querySelector('.timer-clock');
                    const miniPassed = mini.querySelector('.timer-passed');
                    const miniFill = mini.querySelector('.fill');
                    // Text row hidden on mobile; skip updating label/clock
                    // if (miniClock) miniClock.textContent = `${m}:${String(s).padStart(2, '0')}`;
                    // if (miniPassed) miniPassed.textContent = `已過關 ${Math.max(0, (Number(gameState.currentLevel||1) - 1))}`;
                    if (miniFill) {
                        const pct = Math.max(0, Math.min(100, (t / total) * 100));
                        miniFill.style.width = pct + '%';
                    }
                }
            } catch (_) { /* ignore */ }
        }

        function stopSurvivalTimer() {
            try { gameState.survivalLastTickAt = 0; } catch (_) {}
            try { GameTimer.stopSurvival(); } catch (_) {}
        }

    function startSurvivalTimer(initialSeconds = 90) {
            try {
        const cap = 90; // 固定上限
        const init = Math.max(0, Math.min(cap, initialSeconds|0));
        gameState.survivalTimeRemaining = init;
        gameState.survivalTotalTime = cap;
        // 初始化成就用的起始與虛擬時間（不受 UI 上限影響）
        try {
            if (gameMetrics && gameMetrics.mode === 'survival') {
                gameMetrics.survivalStartSeconds = init;
                gameMetrics.maxTime = init; // 絕對峰值（顯示值）
                gameMetrics.virtualTime = init; // 虛擬時間從起始值開始
                gameMetrics.maxTimeVirtual = init;
                gameMetrics.maxTimeOverStart = 0;
                gameMetrics.lastRecordedTime = init;
            }
        } catch(_) {}
    gameState.survivalLastAnswerTs = Date.now();
    gameState.survivalLastTickAt = Date.now();
    gameState.survivalRescueReady = true; // reset rescue each new run
    gameState.survivalCorrectCount = 0; // reset phase counter
    try { gameState.survivalPenaltiesByQuestion = {}; } catch(_) {}
                updateSurvivalTimerDisplay();
                stopSurvivalTimer();
                const card = document.getElementById('survivalTimerCard');
                if (card) card.classList.remove('hidden');
                GameTimer.startSurvival(() => {
                    try {
                        const nowTs = Date.now();
                        const lastTickAt = Number(gameState.survivalLastTickAt || nowTs);
                        const elapsedSeconds = Math.max(1, Math.floor((nowTs - lastTickAt) / 1000));
                        gameState.survivalLastTickAt = lastTickAt + (elapsedSeconds * 1000);
                        gameState.survivalTimeRemaining = Math.max(0, (gameState.survivalTimeRemaining|0) - elapsedSeconds);
                        // 同步虛擬時間遞減，並更新超過起始值的峰值
                        try {
                            if (gameMetrics && gameMetrics.mode === 'survival') {
                                gameMetrics.virtualTime = Math.max(0, (gameMetrics.virtualTime|0) - elapsedSeconds);
                                if ((gameMetrics.virtualTime|0) > (gameMetrics.maxTimeVirtual|0)) gameMetrics.maxTimeVirtual = (gameMetrics.virtualTime|0);
                                const over = Math.max(0, (gameMetrics.virtualTime|0) - (gameMetrics.survivalStartSeconds|0));
                                if (over > (gameMetrics.maxTimeOverStart|0)) gameMetrics.maxTimeOverStart = over;
                            }
                        } catch(_) {}
                        // 每秒取樣一次存入 metrics，並嘗試即時成就評估
                        try { recordSurvivalTick(gameState.survivalTimeRemaining|0); } catch(_) {}
                                        try { evaluateRealtimeAchievements(); } catch(_) {}
                
                // 【單局保底高水位線記錄】將即時獲得的成就ID存入 guaranted 陣列
                if (typeof gameState === 'object' && gameState) {
                    if (!gameState._guaranteedAchievements) gameState._guaranteedAchievements = new Set();
                    if (gameState._rtAchUnlocked) {
                        gameState._rtAchUnlocked.forEach(id => gameState._guaranteedAchievements.add(id));
                    }
                }
                        updateSurvivalTimerDisplay();
                        if (gameState.survivalTimeRemaining <= 0) {
                            stopSurvivalTimer();
                            // End game when time runs out
                            try { completeGame(); } catch (_) {}
                        }
                    } catch (_) { /* ignore tick errors */ }
                }, 1000);
            } catch (_) { /* ignore */ }
        }

        function adjustSurvivalTime(deltaSeconds) {
            if (!isSurvival()) return;
            try {
                const cap = 90;
                const current = (gameState.survivalTimeRemaining|0);
                const proposed = current + (deltaSeconds|0);
                const clamped = Math.max(0, Math.min(cap, proposed));
                const actualDelta = clamped - current;
                gameState.survivalTimeRemaining = clamped;
                // 虛擬時間使用未夾限的 delta，計入超過上限的增減
                try {
                    if (gameMetrics && gameMetrics.mode === 'survival') {
                        gameMetrics.virtualTime = Math.max(0, (gameMetrics.virtualTime|0) + (deltaSeconds|0));
                        if ((gameMetrics.virtualTime|0) > (gameMetrics.maxTimeVirtual|0)) gameMetrics.maxTimeVirtual = (gameMetrics.virtualTime|0);
                        const over = Math.max(0, (gameMetrics.virtualTime|0) - (gameMetrics.survivalStartSeconds|0));
                        if (over > (gameMetrics.maxTimeOverStart|0)) gameMetrics.maxTimeOverStart = over;
                    }
                } catch(_) {}
                // 當時間被調整時也進行一次取樣，捕捉峰值/變化，並觸發即時評估
                try { recordSurvivalTick(gameState.survivalTimeRemaining|0); } catch(_) {}
                                try { evaluateRealtimeAchievements(); } catch(_) {}
                
                // 【單局保底高水位線記錄】將即時獲得的成就ID存入 guaranted 陣列
                if (typeof gameState === 'object' && gameState) {
                    if (!gameState._guaranteedAchievements) gameState._guaranteedAchievements = new Set();
                    if (gameState._rtAchUnlocked) {
                        gameState._rtAchUnlocked.forEach(id => gameState._guaranteedAchievements.add(id));
                    }
                }
                updateSurvivalTimerDisplay();
                if (actualDelta !== 0) { try { showSurvivalTimeDelta(actualDelta); } catch(_) {} }
                if (gameState.survivalTimeRemaining <= 0) {
                    stopSurvivalTimer();
                    try { completeGame(); } catch (_) {}
                }
            } catch (_) { /* ignore */ }
        }

        // 生存模式：計算「非最終失誤」的即時扣秒（隨剩餘時間縮放）
        function computeSurvivalPenaltyStep() {
            // 基礎 4 秒，低庫存更重：<=15s -> +2；<=30s -> +1；高庫存更輕：>70 -> -1；>80 -> -2（下限 1）
            const remain = (gameState.survivalTimeRemaining|0);
            let pen = 4;
            if (remain <= 15) pen += 2; else if (remain <= 30) pen += 1;
            if (remain > 80) pen -= 2; else if (remain > 70) pen -= 1;
            if (pen < 1) pen = 1;
            return pen|0;
        }

        // 生存模式：最終答錯時的總扣秒目標（含過程中已扣）
        function computeSurvivalPenaltyFinalTarget() {
            // 目標總額依庫存微調：基準 20；<=15 -> 22；<=30 -> 21；>70 -> 18；>80 -> 16
            const remain = (gameState.survivalTimeRemaining|0);
            let target = 20;
            if (remain <= 15) target = 22; else if (remain <= 30) target = 21;
            if (remain > 80) target = 16; else if (remain > 70) target = 18;
            return target|0;
        }

        // Pragmatic recommended scheme: variable gain based on speed & remaining time with rescue & diminishing at high bar
        function computeSurvivalGain(answerElapsedSec) {
            // Base from speed: 2 + extra (0~3) where extra = floor(max(0, (6 - t) * 0.6))
            const t = Math.max(0, answerElapsedSec || 0);
            const speedExtra = Math.max(0, Math.floor((6 - t) * 0.6)); // t<=1 -> 2~3 extra; t>=6 -> 0
            let gain = 2 + speedExtra; // 2~5

            // Phase-based diminishing by total correct answers (milestones):
            // 0-39: 100%; 40-79: *0.9; 80-119: *0.75; 120+: *0.6
            try {
                const c = gameState.survivalCorrectCount|0;
                if (c >= 120) gain = Math.floor(gain * 0.6);
                else if (c >= 80) gain = Math.floor(gain * 0.75);
                else if (c >= 40) gain = Math.floor(gain * 0.9);
            } catch(_) {}

            // High time diminishing: >70 reduce 40%, >80 reduce 60% (applied sequentially)
            const remain = gameState.survivalTimeRemaining|0;
            if (remain > 80) {
                gain = Math.floor(gain * 0.4);
            } else if (remain > 70) {
                gain = Math.floor(gain * 0.6);
            }

            // Rescue zone: once when <=15 & rescue ready -> ensure at least 4 then mark used
            if (remain <= 15 && gameState.survivalRescueReady) {
                gain = Math.max(gain, 4);
                gameState.survivalRescueReady = false; // consume
                // 標記使用過救援（供成就）
                try { recordRescue(); } catch(_) {}
                try { SFX.play('survivalRescue'); } catch(_) {}
            }

            // Guarantee minimum 1 on any correct answer
            if (gain < 1) gain = 1;
            return gain;
        }

        // Show floating +/- seconds on Survival timer
        function showSurvivalTimeDelta(deltaSeconds) {
            const d = Math.trunc(deltaSeconds || 0);
            if (!d) return;
            const text = (d > 0 ? `+${d}` : `${d}`) + '秒';
            const cls = d > 0 ? 'up float-up large' : 'down float-down large';

            // Helper to spawn a delta inside a container above its bar/fill
            function spawn(container, yOffset = 0, small = false) {
                if (!container) return;
                // Create or reuse an overlay layer to avoid clipping by overflow
                let layer = container.querySelector(':scope > .survival-delta-layer');
                if (!layer) {
                    layer = document.createElement('div');
                    layer.className = 'survival-delta-layer';
                    layer.style.position = 'relative';
                    layer.style.width = '100%';
                    layer.style.height = '0';
                    layer.style.overflow = 'visible';
                    container.insertBefore(layer, container.firstChild);
                }
                const el = document.createElement('div');
                el.className = `survival-delta ${cls} ${small ? 'small' : ''}`;
                el.textContent = text;
                el.style.top = `${yOffset}px`;
                layer.appendChild(el);
                // auto remove
                setTimeout(() => { try { el.remove(); } catch(_) {} }, 1400);
            }

            try {
                const card = document.getElementById('survivalTimerCard');
                if (card && !card.classList.contains('hidden')) {
                    // Position just above the progress bar area
                    spawn(card, -4, false);
                }
            } catch(_) {}
            try {
                const mini = document.getElementById('survivalTimerMini');
                if (mini && mini.classList.contains('active')) {
                    spawn(mini, -2, true);
                }
            } catch(_) {}
        }
        // #endregion



        (function initSurvivalEvents() {
            if (typeof window === 'undefined' || !window.bcEvents) return;

            window.bcEvents.on('game:answerCorrect', (data) => {
                if (gameState.playMode !== 'survival' || gameState.range) return;
                const verseIndex = data.verseIndex;
                const now = data.now || Date.now();
                const elapsed = (now - (gameState.survivalLastAnswerTs || now)) / 1000;
                const gain = computeSurvivalGain(elapsed);
                adjustSurvivalTime(gain);
                gameState.survivalLastAnswerTs = now;
                gameState.survivalCorrectCount = (gameState.survivalCorrectCount|0) + 1;
                try { if (gameState && gameState.survivalPenaltiesByQuestion) delete gameState.survivalPenaltiesByQuestion[verseIndex]; } catch(_) {}
            });

            window.bcEvents.on('game:answerWrong', (data) => {
                if (gameState.playMode !== 'survival' || gameState.range) return;
                const verseIndex = data.verseIndex;
                const step = computeSurvivalPenaltyStep();
                adjustSurvivalTime(-step);
                const q = verseIndex|0;
                if (!gameState.survivalPenaltiesByQuestion) gameState.survivalPenaltiesByQuestion = {};
                gameState.survivalPenaltiesByQuestion[q] = (gameState.survivalPenaltiesByQuestion[q]|0) + step;
            });

            window.bcEvents.on('game:answerFinalWrong', (data) => {
                if (gameState.playMode !== 'survival' || gameState.range) return;
                const verseIndex = data.verseIndex;
                const q = verseIndex|0;
                const already = (gameState.survivalPenaltiesByQuestion && gameState.survivalPenaltiesByQuestion[q])|0;
                const target = computeSurvivalPenaltyFinalTarget();
                const need = Math.max(0, target - already);
                if (need > 0) adjustSurvivalTime(-need);
                try { if (gameState && gameState.survivalPenaltiesByQuestion) delete gameState.survivalPenaltiesByQuestion[q]; } catch(_) {}
            });

            window.bcEvents.on('game:nextLevelStart', () => {
                if (window.gameState && window.gameState.playMode === 'survival' && !window.gameState.range) {
                    try { if (typeof updateSurvivalTimerDisplay === 'function') updateSurvivalTimerDisplay(); } catch(e){}
                }
            });

            window.bcEvents.on('game:levelReady', () => {
                if (window.gameState && window.gameState.playMode === 'survival' && !window.gameState.range) {
                    try { if (typeof updateSurvivalTimerDisplay === 'function') updateSurvivalTimerDisplay(); } catch(e){}
                }
            });

        })();
