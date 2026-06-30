// Extracted from bible-challenge.html
// cute-hints.js

let cuteHintTimer = null;
    let cuteHintIdCounter = 0; // increments on each show to guard against stale hides
    // Global flag to suppress cute hints during programmatic initialization
    window.__suppressCuteHints = window.__suppressCuteHints || false;
        window.pick = window.pick || ((arr) => arr[Math.floor(Math.random() * arr.length)]);
        const randBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
        const formatTemplate = (tpl, data) => tpl.replace(/\{(\w+)\}/g, (_, k) => (data && k in data) ? data[k] : _);

        const HINTS = {
            hintReminder: [
                '若遇瓶頸，點擊提示尋求解惑。',
                '需要幫助時，提示功能隨時為您敞開。'
            ],
            customConfirm: [
                '自訂完成：已精選 {count} 卷書。',
                '完美契合：為您鎖定 {count} 卷專屬範圍。'
            ],
            play: {
                introEasy: [
                    '請選擇一段經文，開啟今天的學習。',
                    '靜心感受，挑選您的第一段經文。'
                ],
                introOther: [
                    '準備就緒，請選出第一段經文。',
                    '挑戰即將開始，請鎖定您的經文。'
                ],
                pairEasy: [
                    '尋找對應的章節，將它們完整連結。',
                    '用心判斷，找出經文的出處。'
                ],
                pairOther: [
                    '精準鎖定出處，完成完美的配對。',
                    '回想脈絡，配對正確的章節。'
                ]
            }
        };

        // Mode selection cute hint pools (color tone aligned to card styles)
        const MODE_HINTS = {
            classic: {
                theme: 'rose', icon: '🏁', lines: [
                    '闖關模式就緒：穩紮穩打，迎向十關試煉。',
                    '經典闖關選定：掌握節奏，逐步登峰。'
                ]
            },
            survival: {
                theme: 'emerald', icon: '⏱️', lines: [
                    '生存模式開啟：與時間賽跑，考驗您的專注力。',
                    '極限生存選定：不容懈怠，突破自我紀錄。'
                ]
            },
            custom: {
                theme: 'blue', icon: '🧩', lines: [
                    '練習模式開啟：自由設定，反覆熟稔經文。',
                    '自訂挑選完成：針對性強化，穩步成長。'
                ]
            },
            equip: {
                theme: 'purple', icon: '🎓', lines: [
                    '裝備課程：抽卷、選章、排序，循序漸進。',
                    '全副武裝：透過系統化重點訓練，深化根基。'
                ]
            },
            deselect: {
                theme: 'purple', icon: '🌀', lines: [
                    '已取消模式，請從容挑選您的下一個挑戰。',
                    '模式已重置，期待您的嶄新旅程。'
                ]
            },
            equipTier: {
                growth: { theme:'purple', icon:'🌱', lines:[ '成長班：穩固信仰根基，從基礎開始。', '成長班就緒：打好根基，預備成長。' ] },
                disciple:{ theme:'purple', icon:'🛤️', lines:[ '門徒班：進階操練，拓展經文視野。', '門徒班就緒：更深認識，迎接試煉。' ] },
                leader:  { theme:'purple', icon:'🚀', lines:[ '領袖班：深度裝備，迎擊全方位挑戰。', '領袖班就緒：精銳盡出，突破框架。' ] }
            }
        };

        let cuteHintQueue = [];
        let currentlyShowingHint = null;

        function processCuteHintQueue() {
            const bar = document.getElementById('cuteHintBar');
            if (!bar) return;
            if (currentlyShowingHint || cuteHintQueue.length === 0) return;

            const req = cuteHintQueue.shift();
            currentlyShowingHint = req;

            const message = Array.isArray(req.messageOrArray) ? pick(req.messageOrArray) : req.messageOrArray;
            const showMs = typeof req.duration === 'number' ? (req.duration <= 0 ? null : req.duration) : randBetween(2600, 3000);

            // Apply content and theme
            bar.className = `cute-hint ${req.theme}`;
            bar.querySelector('.cute-hint-icon').textContent = req.icon;
            bar.querySelector('.cute-hint-text').textContent = message;

            // Show with slide-up + fade-in
            if (cuteHintTimer) { clearTimeout(cuteHintTimer); cuteHintTimer = null; }
            const thisId = String(++cuteHintIdCounter);
            try { bar.dataset.hintId = thisId; } catch (_) {}
            bar.style.display = 'flex';
            // force reflow then add .show
            void bar.offsetWidth;
            bar.classList.add('show');

            // Auto hide with fade-out then display:none (skip when duration<=0)
            if (showMs !== null) {
                cuteHintTimer = setTimeout(() => {
                    // Only hide if this is still the active hint
                    if (bar.dataset && bar.dataset.hintId === thisId) {
                        bar.classList.remove('show');
                        const hideDelay = 220; // match CSS transition
                        setTimeout(() => {
                            // Ensure we are still hiding the same hint
                            if (bar.dataset && bar.dataset.hintId === thisId) { 
                                bar.style.display = 'none';
                                currentlyShowingHint = null;
                                processCuteHintQueue();
                            }
                        }, hideDelay);
                    } else {
                        currentlyShowingHint = null;
                        processCuteHintQueue();
                    }
                }, showMs);
            }
        }

        function showCuteHint(messageOrArray, theme = 'purple', duration, icon = '✨') {
            // Skip toasts when suppressed (e.g., on initial default selections)
            if (window.__suppressCuteHints) return;
            
            // 限制排隊機制：保留最新的一筆訊息，清除舊有排隊，避免過長延遲
            cuteHintQueue = [];
            cuteHintQueue.push({ messageOrArray, theme, duration, icon });
            
            // 若當前有訊息正在顯示，提早中斷它以顯示新訊息
            if (currentlyShowingHint) {
                const bar = document.getElementById('cuteHintBar');
                if (bar && bar.classList.contains('show')) {
                    if (cuteHintTimer) { clearTimeout(cuteHintTimer); cuteHintTimer = null; }
                    bar.classList.remove('show');
                    setTimeout(() => {
                        bar.style.display = 'none';
                        currentlyShowingHint = null;
                        processCuteHintQueue();
                    }, 220); // 對應 CSS 轉場時間
                    return;
                }
            }

            processCuteHintQueue();
        }

        // Hide the cute hint immediately (used when user已經進入下一步或作答)
        function hideCuteHint(clearQueue = false) {
            if (clearQueue) cuteHintQueue = [];
            
            const bar = document.getElementById('cuteHintBar');
            if (!bar) return;
            if (cuteHintTimer) { try { clearTimeout(cuteHintTimer); } catch (_) {} cuteHintTimer = null; }
            const prevId = (bar.dataset && bar.dataset.hintId) ? bar.dataset.hintId : '';
            try { bar.classList.remove('show'); } catch (_) {}
            // After transition, hide only if the same hint is still current
            setTimeout(() => {
                try {
                    if (!bar.dataset || bar.dataset.hintId === prevId) {
                        bar.style.display = 'none';
                        currentlyShowingHint = null;
                        if (!clearQueue) processCuteHintQueue();
                    }
                } catch (_) { /* ignore */ }
            }, 200);
        }

        // New: level encouragement via cute toast (replaces overlay encouragement)
        function showLevelEncouragementCute() {
            try {
                const result = gameState.levelResults && gameState.levelResults[gameState.currentLevel];
                let msgs;
                let theme = 'green';
                let icon = '🎉';
                // Detect if this is the last level (game about to complete or just completed)
                // Heuristic: if gameState.gameCompleted is true, or if there are no more levels after this one
                // We'll use: if (gameState.gameCompleted || (typeof gameState.totalQuestions === 'number' && gameState.totalQuestions > 0 && gameState.currentLevel * 5 >= gameState.totalQuestions))
                // But since totalQuestions is incremented as questions are generated, and each level is 5 questions, we can estimate
                // Simpler: if gameState.gameCompleted is true, or if nextLevel would not be called
                // For encouragement, show special message if game is completed or this is the last level
                let isFinalLevel = false;
                if (gameState.gameCompleted) {
                    isFinalLevel = true;
                } else {
                    // Try to estimate if this is the last level: if there are not enough available verses for another level
                    // or if the nextLevel would trigger completeGame
                    // But for now, only use gameCompleted, as it's reliable after last level
                }
                if (isFinalLevel) {
                    // Final level: show a different encouragement
                    if (result === 'perfect') {
                        msgs = ['完美通關！神乎其技，無懈可擊！', '全場完美！令人驚嘆的卓越表現！'];
                        theme = 'amber'; icon = '🏆';
                    } else if (result === 'complete') {
                        msgs = ['全對通關！漂亮地完成挑戰！', '精準無誤！恭喜順利通關！'];
                        theme = 'green'; icon = '✅';
                    } else {
                        msgs = ['挑戰成功！順利完成所有關卡！', '恭喜通關！精彩的表現！'];
                        theme = 'blue'; icon = '🎉';
                    }
                } else {
                    if (result === 'perfect') {
                        msgs = ['完美無瑕！繼續保持這份專注！', '零失誤的超凡表現！無懈可擊！'];
                        theme = 'amber'; icon = '🏆';
                    } else if (result === 'complete') {
                        msgs = ['全對！漂亮的判斷！', '精準命中！步伐相當穩健！'];
                        theme = 'green'; icon = '✅';
                    } else {
                        msgs = ['順利過關！迎向下一階段的試煉吧！', '表現穩健！穩步邁向下一關！'];
                        theme = 'blue'; icon = '💪';
                    }
                }
                showCuteHint(pick(msgs), theme, 2600, icon);
            } catch (_) { /* ignore */ }
        }
    

    // 設定排行榜標籤（以「模式」為單位）的啟用狀態與 ARIA 屬性
    // Activate leaderboard tab UI and ARIA attributes (mode-based)
    function setActiveLeaderboardTabByMode(mode) {
            const palette = {
                classic:  { g1: '#FEF2F2', g2: '#FEE2E2', text: '#B91C1C', border: '#F87171' }, // red tones
                survival: { g1: '#ECFDF5', g2: '#D1FAE5', text: '#047857', border: '#34D399' }  // green tones
            };
            document.querySelectorAll('.leaderboard-tab').forEach(tab => {
                if (tab.id === 'viewAllLeaderboard') return; // skip view-all button
                const isActive = tab.dataset.mode === mode;
                tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
                tab.style.backgroundColor = '';
                tab.style.backgroundImage = '';
                tab.style.color = '';
                tab.style.border = '';
                tab.style.boxShadow = '';
                if (isActive) {
                    const p = palette[mode] || palette.classic;
                    tab.style.backgroundImage = `linear-gradient(135deg, ${p.g1}, ${p.g2})`;
                    tab.style.color = p.text;
                    tab.style.border = `2px solid ${p.border}`;
                    tab.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
                } else {
                    tab.style.backgroundImage = 'linear-gradient(135deg,#F8FAFC,#F1F5F9)';
                    tab.style.color = '#64748B';
                    tab.style.border = '1px solid #E2E8F0';
                }
            });
        }

    // 點擊排行榜標籤以切換模式頁籤
    // Handle leaderboard tab click to switch mode view
    window.selectLeaderboardTab = function selectLeaderboardTab(e) {
            // 取消動畫、避免連續觸發；僅在目標不同時切換
            // No animation; block while animating; only switch when target differs
            if (window.__lbTransitioning) return; // block while animating
            const selectedMode = e.currentTarget.dataset.mode;
            if (selectedMode === 'all') { // open full view instead of switching
                try { document.getElementById('viewAllLeaderboard').click(); } catch(_) {}
                return;
            }
            const order = ['classic','survival'];
            const prev = window.__lbCurrentMode || 'classic';
            if (selectedMode === prev) return; // no-op if same tab
            const dir = order.indexOf(selectedMode) > order.indexOf(prev) ? 'left' : 'right';
            setActiveLeaderboardTabByMode(selectedMode);
            // No animation: switch instantly
            updateLeaderboardDisplay(selectedMode);
        }

    // 啟用滑動切換排行榜模式（無動畫，並加上過程防呆）
    // Enable swipe gesture to switch leaderboard mode (no animation, guarded)
    // 排行榜左右滑動切換（行動裝置）
    // Enable swipe navigation between leaderboard mode panes
    function setupLeaderboardSwipe() {
            const container = document.getElementById('leaderboardList');
            if (!container) return;
            let startX = 0, startY = 0, dx = 0, dy = 0, tracking = false;
        const order = ['classic','survival'];
            const threshold = 48; // px
            const onStart = (x, y) => { startX = x; startY = y; dx = 0; dy = 0; tracking = true; };
            const onMove = (x, y) => { if (!tracking) return; dx = x - startX; dy = y - startY; };
            const onEnd = () => {
        if (window.__lbTransitioning) { tracking = false; return; }
                if (!tracking) return;
                tracking = false;
                // horizontal swipe dominant and exceed threshold
                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
            const cur = window.__lbCurrentMode || 'classic';
                    const idx = order.indexOf(cur);
                    if (dx < 0 && idx < order.length - 1) {
                        const next = order[idx + 1];
            if (window.__lbTransitioning) return;
                        setActiveLeaderboardTabByMode(next);
                        // No animation
                        updateLeaderboardDisplay(next);
                    } else if (dx > 0 && idx > 0) {
                        const prev = order[idx - 1];
            if (window.__lbTransitioning) return;
                        setActiveLeaderboardTabByMode(prev);
                        // No animation
                        updateLeaderboardDisplay(prev);
                    }
                }
            };

            // Touch events
            container.addEventListener('touchstart', (e) => {
                if (!e.touches || !e.touches.length) return;
                const t = e.touches[0];
                onStart(t.clientX, t.clientY);
            }, { passive: true });
            container.addEventListener('touchmove', (e) => {
                if (!e.touches || !e.touches.length) return;
                const t = e.touches[0];
                onMove(t.clientX, t.clientY);
            }, { passive: true });
            container.addEventListener('touchend', onEnd, { passive: true });

            // Mouse events (desktop)
            container.addEventListener('mousedown', (e) => { onStart(e.clientX, e.clientY); });
            container.addEventListener('mousemove', (e) => { onMove(e.clientX, e.clientY); });
            container.addEventListener('mouseleave', () => { tracking = false; });
            container.addEventListener('mouseup', onEnd);
        }

        



    // 切換「時間獎勵」顯示與狀態（UI + 偏好儲存）
    // Toggle time-reward visibility/state (UI + persist preference)
    // 切換「時間獎勵」顯示與規則文字
    // Toggle time-reward option and update rule text
    // 已移除 toggleCountdownDisplay（時間獎勵固定啟用）

    // 將使用者偏好（難度/範圍/罕見度/時間獎勵）存入 localStorage
    // Persist user preferences to localStorage
    function persistPrefs(partial) {
            try {
                const key = (window.__BC_CONSTS && window.__BC_CONSTS.STORAGE_KEY_SETTINGS) || 'bibleGameSettings';
                const saved = JSON.parse(localStorage.getItem(key) || '{}') || {};
                const next = { ...saved, ...partial };
                localStorage.setItem(key, JSON.stringify(next));
            } catch (e) { /* ignore */ }
        }

    // 主題切換 (light/dark)。若未指定 target 則在 'light' 和 'dark' 間切換。
    window.toggleTheme = function(target){
        try {
            const root = document.documentElement;
            const current = root.getAttribute('data-theme') || 'light';
            const next = target ? target : (current==='dark' ? 'light' : 'dark');
            root.setAttribute('data-theme', next);
            persistPrefs({ uiTheme: next });
            // 可選：調整 meta theme-color
            try { const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', next==='dark' ? '#0f172a' : '#6366f1'); } catch(_) {}
            if (window.__debugPerf) console.log('[theme] switched', { from: current, to: next });
        } catch(e){ console.warn('[toggleTheme] failed', e); }
    };
    // 初始載入：讀取 uiTheme 偏好
    (function applyStoredTheme(){
        try {
            const key = (window.__BC_CONSTS && window.__BC_CONSTS.STORAGE_KEY_SETTINGS) || 'bibleGameSettings';
            const saved = JSON.parse(localStorage.getItem(key)||'{}') || {};
            if (saved.uiTheme) document.documentElement.setAttribute('data-theme', saved.uiTheme);
        } catch(_) {}
    })();

    // 依 time-reward 狀態顯示/隱藏進度與提示文字
    // Show/hide time-reward widgets based on state
    // 依勾選狀態顯示/隱藏時間獎勵說明
    // Show/hide time reward note based on toggle
    function updateTimeRewardVisibility() {
            const container = document.getElementById('timeRewardProgressContainer');
            const note = document.getElementById('timeRewardNote');
            if (!container) return;
            // Read new preference: hideTimeBar (default false)
            let hideBar = false;
            try {
                const prefs = window.loadSettings? window.loadSettings():{};
                if (typeof prefs.hideTimeBar === 'boolean') hideBar = prefs.hideTimeBar;
                else if (typeof prefs.showTimeBar === 'boolean') hideBar = !prefs.showTimeBar; // legacy invert
            } catch(_){ }
            const showBar = !hideBar;
            container.style.display = showBar ? 'block' : 'none';
            if (note) note.style.display = showBar ? 'block' : 'none';

            // Rebuild UI if not present (bar on top, label under bar)
            if (!document.getElementById('scoreProgressBar')) {
                container.innerHTML = '';
                const wrap = document.createElement('div');
                wrap.className = 'space-y-1';

                // Bar row (top)
                const bar = document.createElement('div');
                bar.id = 'scoreProgressBar';
                bar.className = 'w-full h-3 rounded-full border border-blue-200 bg-gradient-to-r from-green-500 via-yellow-400 to-orange-400 overflow-hidden';
                const fill = document.createElement('div');
                fill.id = 'scoreProgressFill';
                fill.className = 'h-full bg-yellow-400 rounded-full transition-all duration-100';
                fill.style.width = '0%';
                bar.appendChild(fill);
                wrap.appendChild(bar);

                // Footer row: label + live score (below bar)
                const footer = document.createElement('div');
                footer.className = 'flex items-center justify-end gap-1';
                footer.innerHTML = `
                    <div class="text-xs font-bold text-blue-100">時間獎勵</div>
                    <div class="text-xs font-extrabold"><span class="text-white/80">+ </span><span id="currentQuestionScore" class="text-yellow-300">50</span><span class="text-white/70"> 分</span></div>
                `;
                wrap.appendChild(footer);

                container.appendChild(wrap);
            }
        }

    // 更新規則說明區塊（含時間獎勵說明）
    // Update rules section (including time-reward info)
    // 更新「時間獎勵」說明行（依目前設定）
    // Update time reward rule line text
    window.updateScoreRulesDisplay = function updateScoreRulesDisplay() {
            const timeRewardRule = document.getElementById('timeRewardRule');
            const timeRewardNote = document.getElementById('timeRewardNote');
            // Respect new hide preference
            let hideBar = false;
            try {
                const prefs = window.loadSettings? window.loadSettings():{};
                if (typeof prefs.hideTimeBar === 'boolean') hideBar = prefs.hideTimeBar;
                else if (typeof prefs.showTimeBar === 'boolean') hideBar = !prefs.showTimeBar;
            } catch(_) {}
            const showBar = !hideBar;
            if (timeRewardRule) timeRewardRule.style.display = showBar ? 'flex' : 'none';
            if (timeRewardNote) timeRewardNote.style.display = showBar ? 'block' : 'none';
        }

        // 更新「基礎分數」說明字樣，會隨罕見度按鈕切換
    // 更新「基礎分數」說明行（依罕見度）
    // Update base score rule line based on rarity
    window.updateBaseScoreRuleDisplay = function updateBaseScoreRuleDisplay() {
            const el = document.getElementById('baseScoreRuleValue');
            if (!el) return;
            el.textContent = '+100分/題';
        }



    // 展開「自訂書卷」快速選擇卡片（行內展開）
    // Show inline expand-card for quick custom book selection.
    // 展開卡：在首頁顯示簡版自訂書卷選擇
    // Expand-card view for quick custom books selection
    function showCustomBooksExpandCard() {
            const expandCard = document.getElementById('customBooksExpandCard');
            expandCard.classList.remove('hidden');
            // 初始化書卷選項
            initializeCustomBooksInExpandCard();
        }

    // 開啟自訂書卷的完整清單（彈窗模式）
    // Open the full custom books list in a modal.
    // 開啟完整自訂書卷對話框
    // Open the full custom-books modal
    function openCustomModal() {
            try { openModal('customBooksModal'); } catch(_) {
                const m = document.getElementById('customBooksModal'); if (m) m.classList.remove('hidden');
            }
            // 重新初始化書卷選項
            try { initializeCustomBooksInModal(); } catch(_) {}
        }

    // 關閉自訂書卷彈窗；若無選擇任何書卷，撤銷自訂範圍
    // Close modal; if no selection remains, cancel custom range.
    // 關閉自訂書卷對話框
    // Close the custom-books modal
    function closeCustomModal() {
            try { closeModal('customBooksModal'); } catch(_) {
                const m = document.getElementById('customBooksModal'); if (m) m.classList.add('hidden');
            }
            // 如果沒有選擇任何書卷，取消自訂範圍選擇
            if (gameState.customBooks.length === 0) {
                gameState.range = null;
                
                try { updateStartButtonState(); } catch(_) {}
            }
        }

    // 確認自訂範圍選擇（最低 1 本；不再依難度）
    // Confirm custom selection; minimum 1 book (difficulty removed).
    // 確認自訂選擇並回寫到遊戲狀態
    // Confirm selection and write into gameState
    window.confirmCustomSelection = function confirmCustomSelection() {
            // 最少需選 1 本書卷
            if (gameState.customBooks.length < 1) {
                showCuteHint('自訂範圍至少選 1 本書卷', 'rose', undefined, '⚠️');
                return;
            }
            // 確認選擇，關閉視窗
            showCuteHint(formatTemplate(pick(HINTS.customConfirm), { count: gameState.customBooks.length }), 'amber', undefined, '✅');
            closeCustomModal();
            
            updateStartButtonState();
        }

    // 初始化自訂書卷 UI 與事件
    // Initialize custom-books UI and events
    window.HINTS = window.HINTS || HINTS;
    window.showCuteHint = window.showCuteHint || showCuteHint;
    window.hideCuteHint = window.hideCuteHint || hideCuteHint;
    window.updateTimeRewardVisibility = window.updateTimeRewardVisibility || updateTimeRewardVisibility;
    