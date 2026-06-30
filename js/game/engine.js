// Extracted from bible-challenge.html
// Force Save from VS Code
// Game Engine Core

// Moved to equip.js



        function ensureAdaptiveProxyBindings() {
            try {
                const proxyHint = document.getElementById('adaptiveHintBtn');
                const realHint = document.getElementById('hintBtn');
                if (proxyHint && realHint) {
                    const target = realHint.id || 'hintBtn';
                    if (proxyHint.dataset.proxyTarget !== target) {
                        proxyHint.onclick = () => realHint.click();
                        proxyHint.dataset.proxyTarget = target;
                    }
                }

                const proxyBack = document.getElementById('adaptiveBackBtn');
                const realBack = document.getElementById('backToMenuFromGame');
                if (proxyBack && realBack) {
                    const target = realBack.id || 'backToMenuFromGame';
                    if (proxyBack.dataset.proxyTarget !== target) {
                        proxyBack.onclick = () => realBack.click();
                        proxyBack.dataset.proxyTarget = target;
                    }
                }
            } catch(_) { /* ignore */ }
        }
        try { window.ensureAdaptiveProxyBindings = ensureAdaptiveProxyBindings; } catch(_) {}

// Moved to survival.js

        // Mobile viewport stability helpers
        (function mobileViewportFix(){
            try {
                let lastVH = 0;
                const setVH = () => {
                    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
                    if (Math.abs(lastVH - vh) > 1) { // Debounce 1px changes to prevent loop
                        lastVH = vh;
                        document.documentElement.style.setProperty('--vh', `${vh * 0.01}px`);
                    }
                };
                setVH();
                window.addEventListener('resize', setVH, { passive: true });
                if (window.visualViewport) {
                    window.visualViewport.addEventListener('resize', setVH, { passive: true });
                    window.visualViewport.addEventListener('scroll', setVH, { passive: true });
                }

                let lastPinnedH = 0;
                // Keep --pinned-controls-height in sync with actual bar size
                const updatePinned = () => {
                    const el = document.getElementById('gameControlsPinned');
                    if (!el) return;
                    const h = Math.max(56, el.offsetHeight || 0);
                    if (Math.abs(lastPinnedH - h) > 1) { // Debounce
                        lastPinnedH = h;
                        document.documentElement.style.setProperty('--pinned-controls-height', `${h}px`);
                    }
                };
                updatePinned();
                window.addEventListener('resize', updatePinned, { passive: true });
                const ro = window.ResizeObserver ? new ResizeObserver(updatePinned) : null;
                if (ro) ro.observe(document.body);
                if (ro) ro.observe(document.getElementById('gameControlsPinned'));
            } catch(_) { /* ignore */ }
        })();

// Extracted Main Game Logic
function initializeGame() {
            // 預設：不選罕見度與範圍（讓玩家可直接選擇遊戲模式，特別是生存計時）
            gameState.range = null;
            gameState.rarity = null;
            gameState.mode = null;
            // 初始更新計分規則顯示（時間與基礎分數）
            updateScoreRulesDisplay();
            // 顯式同步時間獎勵說明可視狀態
            const timeRewardNote = document.getElementById('timeRewardNote');
            if (timeRewardNote) timeRewardNote.style.display = gameState.showTimeReward ? 'block' : 'none';
            updateBaseScoreRuleDisplay();
            // ...existing code...
            if (typeof initStartScreenUI === 'function') initStartScreenUI();

            if (typeof initSettlementUI === 'function') initSettlementUI();

            if (typeof initBookSelectionUI === 'function') initBookSelectionUI();

            if (typeof initLeaderboardUI === 'function') initLeaderboardUI();
            if (typeof initGlobalUI === 'function') initGlobalUI();
            // Ensure FX styles are loaded
            try { ensureLevelFxStyles(); } catch(_) {}
            
            // mobile score badge setup: clones encouragement text into front/back titles on narrow viewports
            try { if (typeof setupMobileScoreBadges === 'function') setupMobileScoreBadges(); } catch (e) { console.warn('setupMobileScoreBadges failed', e); }

            // === Add back the startup overlay removal logic ! ===
            try {
                const overlay = document.getElementById('startupOverlay');
                if (overlay) {
                    // 恢復片頭 Logo 動畫播放 (利用 CSS .assets-ready 觸發)
                    overlay.classList.add('assets-ready');
                    
                    // 等待片頭動畫播放完畢（約需2.2秒），再進行淡出
                    setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('startup-intro-fadeout'));
                        overlay.style.transition = 'opacity 0.6s ease';
                        overlay.style.opacity = '0';
                        setTimeout(() => {
                            overlay.remove();
                            window.dispatchEvent(new CustomEvent('startup-intro-finished'));
                        }, 650);
                    }, 2200);
                } else {
                    // Fallback just in case
                    window.dispatchEvent(new CustomEvent('startup-intro-fadeout'));
                    setTimeout(() => window.dispatchEvent(new CustomEvent('startup-intro-finished')), 50);
                }
            } catch(e) {
                console.error(e);
            }
        }

        // Mobile badge behavior caused duplicate encouragement text on some devices.
        // To preserve the original single `#encouragementText` behavior we clean up
        // any previously-created mobile badges and disconnect observers.
        
        // <!-- Extracted: start-screen.js -->


    // Cute hint bar helpers and message pools
    
        // <!-- Extracted: cute-hints.js -->

        // <!-- Extracted: book-selection.js -->
    // Generate a new level: pick questions, reset per-level state, update UI
    // Shared helpers for combo thresholds and difficulty mapping
    function getComboTierGlobal(c) {
            const v = Number(c || 0);
            if (v >= 16) return 2; // hard tier (16+)
            if (v >= 8) return 1;  // normal tier (8..15)
            return 0;              // easy tier (<8)
        }
        function getDifficultyFromCombo(c) {
            const v = Number(c || 0);
            const cur = String((gameState && gameState.difficulty) || 'easy');
            // 當自訂範圍僅一本書卷時，跳過普通難度，改用遲滯門檻避免 8 附近來回跳
            // 升級：>=8 進 hard；降級：<6 回 easy
            try {
                if (typeof gameState === 'object' && gameState && gameState.range === 'custom') {
                    const books = Array.isArray(gameState.customBooks) ? gameState.customBooks : [];
                    if (books.length === 1) {
                        if (cur === 'hard') return (v < 6) ? 'easy' : 'hard';
                        return (v >= 8) ? 'hard' : 'easy';
                    }
                }
            } catch(_) { /* ignore, fallback to default */ }

            // 三階遲滯：
            // easy -> normal: >=8；normal -> easy: <6
            // normal -> hard: >=16；hard -> normal: <14
            if (cur === 'hard') return (v < 14) ? 'normal' : 'hard';
            if (cur === 'normal') {
                if (v >= 16) return 'hard';
                if (v < 6) return 'easy';
                return 'normal';
            }
            return (v >= 8) ? 'normal' : 'easy';
        }

        // ===== 題型變化：改為依單局時間(0~420s)分階段，而非連擊 =====
        // tier 0: 0~159s  （最寬鬆）
        // tier 1: 160~319s（中等）
        // tier 2: 320s+   （最集中 / 最分散 視模式）
        function getPatternTimeTier(){
            try {
                const start = gameState.gameStartTime || Date.now();
                const elapsed = (Date.now() - start) / 1000; // 秒
                
                // --------------------------------------------------------
                // 改善方案 3：波浪理論 (Dynamic Waves)
                // --------------------------------------------------------
                // 一旦進入長時間的高壓期（>320秒），避免永遠卡在最高壓。
                // 當前若為偶數關卡的倍數，強制給予一次「波谷 (Tier 0)」以喘息
                if (elapsed >= 320) {
                    const currentLvl = Number((typeof gameState === 'object' && gameState) ? gameState.currentLevel : 0);
                    // 經過 320 秒後，每 3 關會觸發一次休息（如果到了高壓期，玩家的感受會像坐雲霄飛車）
                    if (currentLvl > 0 && currentLvl % 3 === 0) {
                        try { window._justEnteredReliefRound = true; } catch(_) {}
                        return 0; // 強制喘息局
                    }
                    return 2;
                }
                if (elapsed >= 160) return 1;
                return 0;
            } catch(_) { return 0; }
        }

    function generateLevel() {
            const isDebugGame = !!window.DEBUG_GAME;
            // 所有難度都是5題/關
            let questionCount = 5;
            // 取得可用經文（已自動補足）
            let availableVerses = getAvailableVerses();
            // 若為自訂僅一本書卷，保護性地跳過普通難度（即使外部狀態意外設為 normal）
            try {
                if (gameState && gameState.range === 'custom' && Array.isArray(gameState.customBooks) && gameState.customBooks.length === 1 && gameState.difficulty === 'normal') {
                    if (isDebugGame) console.log('[DEBUG] Single-book custom range detected. Forcing difficulty from normal to hard to avoid trivial patterns.');
                    gameState.difficulty = 'hard';
                    // 停用設定顯示更新
                    try {
                        if (typeof scheduleProgressUIUpdate === 'function') scheduleProgressUIUpdate({ adaptive: true });
                        else updateAdaptiveStatus();
                    } catch(_) {}
                }
            } catch(_) { /* non-fatal */ }
            
            // 動態罕見度配比：改為使用逐關耗時所驅動的 adaptiveVerseRarity（common -> normal -> rare 單步漸進）
            // 這裡不再根據近期答題速度滑動，而是固定對應各難度的三段權重表；
            // adaptiveVerseRarity 僅決定目前所使用的「段位」：
            //   common 段 (保守) / normal 段 (中階) / rare 段 (強化冷門)
            function getRarityWeightsFor(diff) {
                const stage = gameState.adaptiveVerseRarity || 'common';
                // 三段靜態權重：不同難度基礎下稍作偏移，避免過度集中於 rare
                const table = {
                    easy: {
                        common: { common: 0.84, uncommon: 0.14, rare: 0.02 },
                        normal: { common: 0.74, uncommon: 0.22, rare: 0.04 },
                        rare:   { common: 0.62, uncommon: 0.30, rare: 0.08 }
                    },
                    normal: {
                        common: { common: 0.60, uncommon: 0.32, rare: 0.08 },
                        normal: { common: 0.48, uncommon: 0.40, rare: 0.12 },
                        rare:   { common: 0.36, uncommon: 0.48, rare: 0.16 }
                    },
                    hard: {
                        common: { common: 0.44, uncommon: 0.42, rare: 0.14 },
                        normal: { common: 0.32, uncommon: 0.50, rare: 0.18 },
                        rare:   { common: 0.22, uncommon: 0.56, rare: 0.22 }
                    }
                };
                const pack = (table[diff] || table.normal)[stage] || table.normal.common;
                const sum = pack.common + pack.uncommon + pack.rare;
                return { common: pack.common/sum, uncommon: pack.uncommon/sum, rare: pack.rare/sum };
            }
            // 依權重從 pool 中挑一筆索引（優先滿足目標罕見度；缺少時退回任意）
            function pickWeightedIndexByRarity(pool, weights) {
                if (!Array.isArray(pool) || pool.length === 0) return -1;
                try {
                    // 先抽目標罕見度類別
                    const r = Math.random();
                    const steps = [
                        { key: 'rare', w: weights.rare||0 },
                        { key: 'uncommon', w: weights.uncommon||0 },
                        { key: 'common', w: weights.common||0 },
                    ];
                    // 以 rare→uncommon→common 的順序試抽，讓細小比例的 rare 有機會被精確命中
                    let acc = 0, target = 'common';
                    for (const s of steps) { acc += s.w; if (r < acc) { target = s.key; break; } }
                    const candidates = pool
                        .map((v, i) => ({ i, v }))
                        .filter(x => (String(x.v.rarity||'common') === target));
                    if (candidates.length > 0) {
                        const p = candidates[Math.floor(Math.random()*candidates.length)];
                        return p.i;
                    }
                } catch (_) {}
                // 後備：均勻隨機
                return Math.floor(Math.random()*pool.length);
            }
            // Debug: log available and used verses
            try {
                const usedKey = (v) => `${v.book}|${v.chapter}|${v.verse}`;
                const usedVersesSet = gameState.usedVerses || new Set();
                const usedCount = usedVersesSet.size;
                const availableCount = availableVerses.length;
                const unusedCount = availableVerses.filter(v => !usedVersesSet.has(usedKey(v))).length;
                if (isDebugGame) console.log(`[DEBUG] generateLevel: available=${availableCount}, used=${usedCount}, unused=${unusedCount}, currentLevel=${gameState.currentLevel}`);
            } catch (e) { console.warn('[DEBUG] generateLevel: logging failed', e); }
            // 依難度決定題型分布
            let selectedVerses = [];
            if (gameState.difficulty === 'hard') {
                // 只用最多三個書卷，題型分布機率 50/35/10/5
                const allBooks = [...new Set(availableVerses.map(v => v.book))];
                let bookCombos = [];
                if (allBooks.length <= 3) {
                    bookCombos = [allBooks];
                } else {
                    for (let i = 0; i < allBooks.length; i++)
                      for (let j = i+1; j < allBooks.length; j++)
                        for (let k = j+1; k < allBooks.length; k++)
                          bookCombos.push([allBooks[i], allBooks[j], allBooks[k]]);
                }
                // 改為依時間分段調整分布（題型變化已轉為時間驅動）
                const tier = getPatternTimeTier();
                const patterns = tier === 0 ? [
                    { dist: [2,2,1], prob: 0.50 },
                    { dist: [3,2,0], prob: 0.35 },
                    { dist: [4,1,0], prob: 0.10 },
                    { dist: [5,0,0], prob: 0.05 }
                ] : tier === 1 ? [
                    { dist: [2,2,1], prob: 0.45 },
                    { dist: [3,2,0], prob: 0.25 },
                    { dist: [4,1,0], prob: 0.20 },
                    { dist: [5,0,0], prob: 0.10 }
                ] : [
                    { dist: [2,2,1], prob: 0.30 },
                    { dist: [3,2,0], prob: 0.25 },
                    { dist: [4,1,0], prob: 0.25 },
                    { dist: [5,0,0], prob: 0.20 }
                ];
                const books = bookCombos[Math.floor(Math.random()*bookCombos.length)];
                const r = Math.random();
                let acc = 0, chosenPattern = patterns[0];
                for (const p of patterns) { acc += p.prob; if (r < acc) { chosenPattern = p; break; } }
                // 隨機化三書卷的順序，避免固定順序帶來偏差
                const booksOrdered = books.slice().sort(() => Math.random() - 0.5);
                let poolByBook = booksOrdered.map(b => availableVerses.filter(v => v.book === b));
                const rarityW = getRarityWeightsFor('hard'); // 依 adaptiveVerseRarity 決定當前段位權重
                for (let i = 0; i < 3; ++i) {
                    for (let j = 0; j < chosenPattern.dist[i]; ++j) {
                        if (poolByBook[i] && poolByBook[i].length > 0) {
                            const idx = pickWeightedIndexByRarity(poolByBook[i], rarityW);
                            selectedVerses.push(poolByBook[i][idx]);
                            poolByBook[i].splice(idx,1);
                        }
                    }
                }
                if (selectedVerses.length < questionCount) {
                    const used = new Set(selectedVerses.map(v => `${v.book}|${v.chapter}|${v.verse}`));
                    const rest = availableVerses.filter(v => !used.has(`${v.book}|${v.chapter}|${v.verse}`));
                    while (selectedVerses.length < questionCount && rest.length > 0) {
                        const idx = Math.floor(Math.random()*rest.length);
                        selectedVerses.push(rest[idx]);
                        rest.splice(idx,1);
                    }
                }
            } else if (gameState.difficulty === 'normal') {
                // 至少三個書卷，題型分布 40/35/25
                const allBooks = [...new Set(availableVerses.map(v => v.book))];
                // 依 combo tier 增加 5 書卷分佈的機率（覆蓋更廣的書卷，提高辨識難度）
                const tier = getPatternTimeTier(); // 時間分段控制題型分布
                const patterns = tier === 0 ? [
                    { dist: [2,2,1], prob: 0.40 },
                    { dist: [2,1,1,1], prob: 0.35 },
                    { dist: [1,1,1,1,1], prob: 0.25 }
                ] : tier === 1 ? [
                    { dist: [2,2,1], prob: 0.32 },
                    { dist: [2,1,1,1], prob: 0.33 },
                    { dist: [1,1,1,1,1], prob: 0.35 }
                ] : [
                    { dist: [2,2,1], prob: 0.25 },
                    { dist: [2,1,1,1], prob: 0.30 },
                    { dist: [1,1,1,1,1], prob: 0.45 }
                ];
                const r = Math.random();
                let acc = 0, chosenPattern = patterns[0];
                for (const p of patterns) { acc += p.prob; if (r < acc) { chosenPattern = p; break; } }
                // 依分布長度動態抽書卷數（3/4/5），不足時降級為可用的書卷數
                const needBooks = chosenPattern.dist.length;
                const shuffledBooks = allBooks.slice().sort(() => Math.random() - 0.5);
                const pickedBooks = shuffledBooks.slice(0, Math.min(needBooks, shuffledBooks.length));
                let poolByBook = pickedBooks.map(b => availableVerses.filter(v => v.book === b));
                const rarityW = getRarityWeightsFor('normal'); // 依 adaptiveVerseRarity 決定當前段位權重
                for (let i = 0; i < Math.min(chosenPattern.dist.length, pickedBooks.length); ++i) {
                    for (let j = 0; j < chosenPattern.dist[i]; ++j) {
                        if (poolByBook[i] && poolByBook[i].length > 0) {
                            const idx = pickWeightedIndexByRarity(poolByBook[i], rarityW);
                            selectedVerses.push(poolByBook[i][idx]);
                            poolByBook[i].splice(idx,1);
                        }
                    }
                }
                if (selectedVerses.length < questionCount) {
                    const used = new Set(selectedVerses.map(v => `${v.book}|${v.chapter}|${v.verse}`));
                    const rest = availableVerses.filter(v => !used.has(`${v.book}|${v.chapter}|${v.verse}`));
                    while (selectedVerses.length < questionCount && rest.length > 0) {
                        const idx = Math.floor(Math.random()*rest.length);
                        selectedVerses.push(rest[idx]);
                        rest.splice(idx,1);
                    }
                }
            }
            // 其他難度維持原本邏輯
            // 簡單模式預先過濾出「可拆分」的題庫，盡可能擴大可用池
            if (gameState.difficulty === 'easy') {
                const before = availableVerses.length;
                // 僅接受「在標點切分」的可拆分題目（避免中間硬切造成語意不順）
                availableVerses = availableVerses.filter(v => trySplitVerseText(v.verse, true));
                const after = availableVerses.length;
                if (after < before) {
                    if (isDebugGame) console.log(`簡單模式：可拆分題庫 ${after}/${before}`);
                }

                // 若可拆分的題庫仍不足 5 題，嘗試合併相鄰經文（同章的相鄰節）生成較長文本
                if (availableVerses.length < questionCount) {
                    const extended = synthesizeCombinedVerses(getAvailableVerses());
                    if (extended.length) {
                        // 僅保留可拆分的合併結果
                        const addable = extended.filter(v => trySplitVerseText(v.verse, true));
                        // 合併去重（避免與原本可拆分的重複）
                        const key = v => `${v.book}|${v.chapter}|${v.verse}`;
                        const seen = new Set(availableVerses.map(key));
                        for (const it of addable) {
                            const k = key(it);
                            if (!seen.has(k)) {
                                availableVerses.push(it);
                                seen.add(k);
                            }
                            if (availableVerses.length >= questionCount * 2) break; // 適度擴充，避免過大
                        }
                        if (isDebugGame) console.log(`簡單模式：合併相鄰經文後，可拆分題庫 = ${availableVerses.length}`);
                    }
                }
            }
            
            // 檢查可用經文數量
            if (isDebugGame) {
                console.log(`可用經文數量: ${availableVerses.length}`);
                console.log(`選擇的書卷:`, gameState.customBooks);
            }
            
            // 確保有足夠的經文（至少 5 題）
            if (availableVerses.length < questionCount) {
                console.warn('[DEBUG] generateLevel: insufficient availableVerses', { available: availableVerses.length, required: questionCount, range: gameState.range, rarity: gameState.rarity, customBooks: gameState.customBooks });
                // 防止因早期 return 導致互動長時間被鎖住
                try { setLevelInteractionLock(false); } catch(_) {}
                alert('此難度可用經文不足（至少需要 5 篇），請擴大範圍或改選其他難度！');
                return;
            }
            
        if (gameState.difficulty === 'easy') {
            // ...existing code for easy模式...
            gameState.questionData = [];
            let attempts = 0;
            const maxAttempts = Math.max(availableVerses.length * 3, 30);
            const usedKey = (v) => `${v.book}|${v.chapter}|${v.verse}`;
            const usedVersesSet = gameState.usedVerses || new Set();
            let versesToChooseFrom = availableVerses.filter(v => !usedVersesSet.has(usedKey(v)));
            if (versesToChooseFrom.length < questionCount) {
                versesToChooseFrom = [...availableVerses];
            }
            const rarityW = getRarityWeightsFor('easy'); // 依 adaptiveVerseRarity 決定當前段位權重
            while (gameState.questionData.length < questionCount && attempts < maxAttempts) {
                attempts++;
                if (versesToChooseFrom.length === 0) break;
                const randomIndex = pickWeightedIndexByRarity(versesToChooseFrom, rarityW);
                let selectedVerse = versesToChooseFrom[randomIndex];
                const alreadyInThisLevel = gameState.questionData.some(q => q.book === selectedVerse.book && q.chapter === selectedVerse.chapter && q.verse === selectedVerse.verse);
                const alreadyUsedInGame = usedVersesSet.has(usedKey(selectedVerse));
                if (alreadyInThisLevel || alreadyUsedInGame) {
                    versesToChooseFrom.splice(randomIndex, 1);
                    continue;
                }
                const verseClean = sanitizeVerseText(selectedVerse.verse);
                const split = trySplitVerseText(verseClean, true);
                if (split) {
                    const cleanFront = stripOuterCornerQuotes(split.front);
                    const cleanBack = stripOuterCornerQuotes(split.back);
                    gameState.questionData.push({
                        pairId: `${selectedVerse.book}_${selectedVerse.chapter}_${selectedVerse.verse.slice(0,8).replace(/\s+/g,'')}`,
                        book: selectedVerse.book,
                        chapter: selectedVerse.chapter,
                        front: cleanFront,
                        back: cleanBack,
                        original: selectedVerse
                    });
                } else {
                    versesToChooseFrom.splice(randomIndex, 1);
                    continue;
                }
                try { usedVersesSet.add(usedKey(selectedVerse)); } catch (e) {}
                versesToChooseFrom.splice(randomIndex, 1);
            }
        } else if (selectedVerses.length > 0) {
            gameState.questionData = selectedVerses;
            const usedKey = (v) => `${v.book}|${v.chapter}|${v.verse}`;
            const usedVersesSet = gameState.usedVerses || new Set();
            for (const v of selectedVerses) try { usedVersesSet.add(usedKey(v)); } catch(e) {}
            gameState.usedVerses = usedVersesSet;
        }
        
        // --------------------------------------------------------
        // 改善方案 4：情感反饋 - 波段事件 (Wave Event) 提示
        // --------------------------------------------------------
        try {
            if (window._justEnteredReliefRound) {
                window._justEnteredReliefRound = false;
                setTimeout(() => {
                    if (typeof showCuteHint === 'function') {
                        showCuteHint('🎉 天降甘霖！本局題型干擾暫時解除！', 'green', 3500, '🌊');
                    }
                }, 800); // 延遲一下避免和過關提示重疊
            }
        } catch(_) {}

        if (isDebugGame) console.log(`最終生成 ${gameState.questionData.length} 道題目`);
        gameState.currentQuestion = 1;
        gameState.levelPerfect = true;
        gameState.questionAttempts = {};
        gameState.totalQuestions += gameState.questionData.length;
        gameState.isFirstQuestionOfLevel = true;
        gameState.questionData.forEach((_, index) => {
            const maxAttempts = { easy: 3, normal: 3, hard: 3 };
            gameState.questionAttempts[index] = maxAttempts[gameState.difficulty];
        });
        displayQuestions();
        const levelTimerDelayMs = (gameState.currentLevel === 1) ? 30 : 100;
        setTimeout(() => {
            // levelStartTime 可能會在每題答對後被重置以支援倒數與節奏提示；另一份 _rarityLevelStartTime 專供整關耗時統計
            const nowTs = Date.now();
            gameState.levelStartTime = nowTs;
            gameState._rarityLevelStartTime = nowTs; // 整關起點
            // 方案C：建立本關基線（失誤 / 提示）
            gameState._levelMistakesStart = Number(gameState.totalMistakes||0);
            gameState._levelHintsStart = Number(gameState.hintsUsed||0);
            gameState.__comboDroppedForTimeout = false;
            startLevelTimer();
        }, levelTimerDelayMs);
        // Record this level's question set & ordering for multi-level snapshot (v3)
        try {
            if (!Array.isArray(gameState._sessionQuestions)) gameState._sessionQuestions = [];
            gameState._sessionQuestions.push({
                level: gameState.currentLevel || gameState._sessionQuestions.length + 1,
                difficulty: gameState.difficulty,
                questionData: JSON.parse(JSON.stringify(gameState.questionData || [])),
                chapterOrder: Array.isArray(gameState._lastChapterShuffleOrder) ? [...gameState._lastChapterShuffleOrder] : null
            });
        } catch(_) {}
        }

    // 依目前的範圍/罕見度/自訂書卷過濾可用經文
    // Filter available verses based on range/rarity/custom books
    // Fisher-Yates shuffle（原地）
    function __shuffleInPlace(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function getAvailableVerses(options) {
        const opts = options || {};
        const shuffle = opts.shuffle !== false; // 預設洗牌，維持既有隨機行為
        let availableBooks = [];
        switch (gameState.range) {
            case 'all':
                availableBooks = [...bibleBooks.old, ...bibleBooks.new];
                break;
            case 'testament':
                availableBooks = bibleBooks[gameState.testament];
                break;
            case 'custom':
                availableBooks = gameState.customBooks;
                break;
            case 'theme':
                // 主題：先不限定書卷，後續以主題關鍵字過濾
                availableBooks = [...bibleBooks.old, ...bibleBooks.new];
                break;
        }
        if (availableBooks.length === 0) availableBooks = [...bibleBooks.old, ...bibleBooks.new];
        // 使用正規化資料（若有索引可日後優化為依書卷拼接）
        let pool = getActiveVerseDB().filter(v => availableBooks.includes(v.book));
        if (gameState.range === 'theme' && gameState.theme) {
            const THEME_MAP = {
                love: ['愛','相愛','慈愛','憐憫'],
                faith: ['信心','相信','信靠','忠心'],
                hope: ['盼望','指望','盼','前途','將來'],
                parables: ['比喻','用比喻'],
                wisdom: ['智慧','箴言','敬畏耶和華','知識','聰明'],
                gospels: ['耶穌','門徒','神的國','天國','福音']
            };
            const kws = THEME_MAP[gameState.theme] || [];
            if (kws.length) {
                pool = pool.filter(v => {
                    const t = (v.verse || '') + ' ' + (v.title || '') + ' ' + (v.ref || '') + ' ' + (v.book || '');
                    return kws.some(k => t.includes(k));
                });
            }
        }
        const need = 5;
        const inPractice = !!gameState.range;
        let isRarityMode = !inPractice && gameState.rarity && (gameState.rarity === 'rare' || gameState.rarity === 'common');
        if (isRarityMode) {
            let filtered = pool;
            if (gameState.rarity === 'rare') {
                filtered = pool.filter(v => v.rarity === 'rare' || v.rarity === 'uncommon');
            } else if (gameState.rarity === 'common') {
                filtered = pool.filter(v => v.rarity === 'common');
            }
            if (filtered.length < need) {
                let result = [...filtered];
                let allPool = getActiveVerseDB();
                const seen = new Set(result.map(v => `${v.book}|${v.chapter}|${v.verse}`));
                for (const v of allPool) {
                    const k = `${v.book}|${v.chapter}|${v.verse}`;
                    if (!seen.has(k)) {
                        result.push(v);
                        seen.add(k);
                        if (result.length >= need) break;
                    }
                }
                pool = result;
            } else {
                pool = filtered;
            }
        }
        // 預設洗牌，但允許關閉以提升頻繁檢查的效能
        if (!shuffle) return pool;
        return __shuffleInPlace(pool);
        }

    // 快速估算可用經文數量（不掃描整庫則回退為常規計算）
    function getAvailableVersesQuickCount() {
        try {
            const idx = window.__verseIndex;
            const byBook = idx && idx.byBook;
            const counts = idx && idx.counts;
            if (!byBook || !counts) throw new Error('no index');

            let availableBooks = [];
            switch (gameState.range) {
                case 'all':
                    availableBooks = [...bibleBooks.old, ...bibleBooks.new];
                    break;
                case 'testament':
                    availableBooks = bibleBooks[gameState.testament];
                    break;
                case 'custom':
                    availableBooks = gameState.customBooks;
                    break;
                case 'theme':
                    availableBooks = [...bibleBooks.old, ...bibleBooks.new];
                    break;
                default:
                    availableBooks = [...bibleBooks.old, ...bibleBooks.new];
            }
            if (availableBooks.length === 0) availableBooks = [...bibleBooks.old, ...bibleBooks.new];

            const inPractice = !!gameState.range;
            const isRarityMode = !inPractice && gameState.rarity && (gameState.rarity === 'rare' || gameState.rarity === 'common');

            // 主題模式需要內容過濾，採用精確計算
            if (gameState.range === 'theme' && gameState.theme) {
                try { return getAvailableVerses({ shuffle: false }).length; } catch(__) { /* fallthrough */ }
            }

            let total = 0;
            if (isRarityMode) {
                for (const b of availableBooks) {
                    const c = counts.get(b);
                    if (!c) continue;
                    if (gameState.rarity === 'common') total += c.common;
                    else if (gameState.rarity === 'rare') total += (c.rare + c.uncommon);
                }
            } else {
                // 練習模式不分罕見度
                for (const b of availableBooks) {
                    const c = counts.get(b);
                    if (!c) continue;
                    total += c.total;
                }
            }
            // 若沒有索引資料（例如尚未正規化完成），回退計算
            if (!Number.isFinite(total) || total === 0) throw new Error('fallback');
            return total;
        } catch (_) {
            try { return getAvailableVerses({ shuffle: false }).length; } catch(__) { return 0; }
        }
    }

    // 合併相鄰（同書卷同章、連續節數）產生較長文本（供簡單模式切前/後段）
    // Merge adjacent verses (same book+chapter, consecutive verse numbers) to form longer text
    // for easy mode split. Only expands easy pool; preserves original book/chapter in UI.
        // 由相鄰/連續節號嘗試合併成更完整的題目
        // Combine adjacent verses to form richer prompts when appropriate
        function synthesizeCombinedVerses(candidates) {
            try {
                const arr = Array.isArray(candidates) ? [...candidates] : [];
                if (arr.length === 0) return [];
                // 將章節字串分離章:節; 僅處理單節（不含 '-' 範圍）的情形
                function parseChap(ch) {
                    const s = String(ch || '').trim();
                    const m = s.match(/^(\d+):(\d+)$/);
                    if (!m) return null;
                    return { c: parseInt(m[1], 10), v: parseInt(m[2], 10), raw: s };
                }
                // 先排序，才能在同書卷同章中尋找「節數相鄰」的配對
                // Sort by book, chapter, and verse to find adjacent pairs.
                arr.sort((a,b) => {
                    if (a.book !== b.book) return a.book.localeCompare(b.book);
                    const pa = parseChap(a.chapter) || { c: 0, v: 0 };
                    const pb = parseChap(b.chapter) || { c: 0, v: 0 };
                    if (pa.c !== pb.c) return pa.c - pb.c;
                    return pa.v - pb.v;
                });
                const out = [];
                for (let i = 0; i < arr.length - 1; i++) {
                    const cur = arr[i];
                    const nxt = arr[i+1];
                    const p1 = parseChap(cur.chapter);
                    const p2 = parseChap(nxt.chapter);
                    if (!p1 || !p2) continue;
                    // 同書卷、同章、且下一節的節數 = 當前節 + 1
                    // Same book+chapter and verse number is consecutive => merge a pair.
                    if (cur.book === nxt.book && p1.c === p2.c && p2.v === p1.v + 1) {
                        // 合併文本時，若前文末尾無結尾句號，適度加入空格
                        const sep = /[。！？….!?；;:]$/.test(cur.verse) ? '' : ' ';
                        const mergedText = `${cur.verse}${sep}${nxt.verse}`.trim();
                        // UI 仍使用第一節的 chapter 文本；完整原文對保存在 originalCombined 以供除錯/回放
                        // Keep first verse's chapter string for display; store originals in originalCombined.
                        const rarity = cur.rarity || nxt.rarity || 'common';
                        out.push({
                            book: cur.book,
                            chapter: cur.chapter, // 顯示以首節為主
                            verse: mergedText,
                            version: cur.version || nxt.version,
                            rarity,
                            originalCombined: [cur, nxt]
                        });
                    }
                }
                return out;
            } catch (e) {
                return [];
            }
        }

    // 嘗試將經文在合理位置拆成前後兩段（優先在標點或空白處切分）
    // Try to split a verse into front/back segments at natural punctuation/whitespace.
    // 嘗試把過長的經文按斷句拆分（保留語意）
    // Try splitting a long verse into sentence-like parts
    function trySplitVerseText(text, strictPunctuation = false) {
            // 盡可能擴充可用題庫：放寬最短字數門檻，但仍確保兩段都有可讀長度
            if (!text) return null;
            const raw = String(text).trim();
            if (raw.length < 16) return null; // 太短的不拆分

            // 強/弱標點分級：先找強標點（句號/問號/驚嘆號/分號/冒號/省略號），再退回弱標點（逗號/頓號/空白）
            const STRONG = new Set(['。','！','？','；','：','…','.','!','?',';',':']);
            const WEAK = new Set(['，','、',',',' ']);
            const isPunct = (ch) => STRONG.has(ch) || WEAK.has(ch);
            const mid = Math.floor(raw.length / 2);
            const searchRange = 16;

            // 幫助：建立切分 pair，並將後半段的前導標點適度移到前半段尾端，避免以標點開頭
            const buildPair = (cutIdxInclusive) => {
                let front = raw.slice(0, cutIdxInclusive + 1).trim();
                let back = raw.slice(cutIdxInclusive + 1).trim();
                const leading = back.match(/^[\s，。、！？…!？，.;；:："'“”『』（）()【】\[\]\-—–、，。！？…]+/);
                if (leading) {
                    const lead = leading[0];
                    const nf = (front + lead).trim();
                    const nb = back.slice(lead.length).trim();
                    if (nf.length >= 6 && nb.length >= 6) { front = nf; back = nb; }
                }
                // 進一步避免兩段頭尾落在引號或逗號等不佳位置（需同時滿足最小長度）
                const badEnd = /[“”"'『』，、,]$/;
                const badStart = /^[“”"'『』，、,]/;
                if (front.length >= 6 && back.length >= 6 && !badEnd.test(front) && !badStart.test(back)) return { front, back };
                return null;
            };

            // 1) 強標點優先，從中間向外擴散尋找
            for (let d = 0; d <= searchRange; d++) {
                const L = mid - d, R = mid + d;
                if (L > 2) {
                    const ch = raw[L];
                    if (STRONG.has(ch)) {
                        const pair = buildPair(L);
                        if (pair) return pair;
                    }
                }
                if (R < raw.length - 2) {
                    const ch = raw[R];
                    if (STRONG.has(ch)) {
                        const pair = buildPair(R);
                        if (pair) return pair;
                    }
                }
            }

            // 2) 退而求其次：弱標點（逗號/頓號/空白）
            for (let d = 0; d <= searchRange; d++) {
                const L = mid - d, R = mid + d;
                if (L > 2) {
                    const ch = raw[L];
                    if (WEAK.has(ch)) {
                        const pair = buildPair(L);
                        if (pair) return pair;
                    }
                }
                if (R < raw.length - 2) {
                    const ch = raw[R];
                    if (WEAK.has(ch)) {
                        const pair = buildPair(R);
                        if (pair) return pair;
                    }
                }
            }

            // 3) 最後手段：若允許，直接在中位數切分並修正後段前導標點（strict 模式下跳過）
            if (strictPunctuation) return null;
            const cut = mid;
            let front = raw.slice(0, cut).trim();
            let back = raw.slice(cut).trim();
            const leading = back.match(/^[\s，。、！？…!？，.;；:："'“”『』（）()【】\[\]\-—–、，。！？…]+/);
            if (leading) {
                const lead = leading[0];
                const nf = (front + lead).trim();
                const nb = back.slice(lead.length).trim();
                if (nf.length >= 6 && nb.length >= 6) { front = nf; back = nb; }
            }
            if (front.length >= 6 && back.length >= 6) return { front, back };
            return null;
        }

    // 小工具：移除字串頭尾的中文引號（「」/『』）與英引號；僅用於簡單難度前/後段的視覺清潔
    // Helper: strip leading/trailing Chinese/English quotes for easy-mode segment display only.
    // 去除外層中文引號（「…」/『…』）包裹
    // Strip outer Chinese corner quotes if present
    function stripOuterCornerQuotes(s) {
            if (s == null) return s;
            const str = String(s);
            // 只清除頭尾連續的引號符號，不影響中間內容
            return str
                .replace(/^[「」『』“”"']+/, '')
                .replace(/[「」『』“”"']+$/, '')
                .trim();
        }

// 進入某一題（選定經文卡）；鎖定前面面板
    // Select a verse index and show its matching options
    

        // 手機環境下，將焦點與視窗回到前段經文面板並嘗試聚焦第一張經文卡
    // 手機：將 carousel 視角滑回前段面板，並盡量把焦點放回第一張經文卡（確保可達性）
    // Mobile: scroll carousel back to the front panel and focus first verse for accessibility.
    // 將前面板滾動到視口中（行動裝置優化）
    // Scroll the front panel into view for mobile
    

    // 啟動關卡計時器（供時間獎勵與顯示）
    // Start per-level timer for time reward and display
    function startLevelTimer() {
        GameTimer.startLevel(updateCurrentScore, 100);
    }

    function clearPendingLevelFlowTimers() {
            try {
                if (gameState.__levelCompleteTimer) {
                    clearTimeout(gameState.__levelCompleteTimer);
                    gameState.__levelCompleteTimer = null;
                }
            } catch(_) {}
            try {
                if (gameState.__handoffTimer) {
                    clearTimeout(gameState.__handoffTimer);
                    gameState.__handoffTimer = null;
                }
            } catch(_) {}
            try {
                if (gameState.__handoffGuard) {
                    clearTimeout(gameState.__handoffGuard);
                    gameState.__handoffGuard = null;
                }
            } catch(_) {}
        }

    // recordInvalidSpeedSegment has been moved to metrics.js


    // 更新頂部分數顯示（含動畫）
    // Update the center score display with counting animation
    // updateCurrentScore 已移至 score.js, 使用 window.updateCurrentScore


        // getComboMultiplier 已移至 score.js, 使用 window.getComboMultiplier


        // addComboOnCorrect, dropCombo, updateComboUI 已移至 score.js


        // 共用：清除元素上可能阻礙「答對變綠」的錯誤/動畫/紅色類別
    // 清除卡片錯誤樣式
    // Clear error styles from a card element
    



    // 依答題狀態改變經文卡顏色（對/錯/未答）
    // Update verse card color based on answer state
    

    // 輕節流：合併短時間內重複的關卡完成檢查
    // Lightweight dedupe for repeated level-complete checks
    function scheduleLevelCompleteCheck(delayMs = 140) {
            try {
                const delay = Math.max(80, Number(delayMs) || 140);
                clearPendingLevelFlowTimers();
                gameState.__levelCompleteTimer = setTimeout(() => {
                    gameState.__levelCompleteTimer = null;
                    checkLevelComplete();
                }, delay);
            } catch(_) {
                try { checkLevelComplete(); } catch(__) {}
            }
        }
        try { window.scheduleLevelCompleteCheck = scheduleLevelCompleteCheck; } catch(_) {}

    // 檢查本關是否完成，結算 perfect/complete/partial/failed 狀態
    // Check if level is finished and set result state
    function checkLevelComplete() {
            const isDebugGame = !!window.DEBUG_GAME;
            clearPendingLevelFlowTimers();
            // 確保有題目數據
            if (!gameState.questionData || gameState.questionData.length === 0) {
                if (isDebugGame) console.log('沒有題目數據，無法檢查關卡完成狀態');
                return;
            }
            // 若本關結束流程已處理過，直接跳出避免重入
            // If end-of-level has been handled already, return early to prevent re-entry
            if (gameState.levelEndHandled) {
                return;
            }

            const totalQuestions = gameState.questionData.length;
            const byIndex = new Map();
            try {
                document.querySelectorAll('#gameVerses [data-index]').forEach((card) => {
                    const idx = Number(card.dataset && card.dataset.index);
                    if (Number.isFinite(idx)) byIndex.set(idx, card);
                });
            } catch(_) {}

            let completedQuestions = 0;
            let correctQuestions = 0;
            for (let index = 0; index < totalQuestions; index++) {
                const verseCard = byIndex.get(index);
                if (!verseCard) continue;
                const isCorrect = verseCard.classList.contains('bg-green-100');
                const isWrong = verseCard.classList.contains('bg-red-100');
                if (isCorrect || isWrong) completedQuestions++;
                if (isCorrect) correctQuestions++;
            }
            if (isDebugGame) console.log(`已完成題目: ${completedQuestions}/${totalQuestions}`);
            
            if (completedQuestions === totalQuestions) {
                // 標記：本關結束流程已處理，避免重複觸發
                // Mark: handled to avoid duplicate transitions/scoring
                gameState.levelEndHandled = true;
                // 停止計時器
                GameTimer.stopLevel();

                const allCorrect = correctQuestions === totalQuestions;
                if (isDebugGame) console.log(`答對題目: ${correctQuestions}/${totalQuestions}, 全對: ${allCorrect}`);
                
                // 記錄關卡結果
                // 檢查是否有使用過提示的題目（僅考慮本關的提示記錄）
                const levelUsedHints = Array.from(gameState.usedHints).some(h => {
                    const s = String(h);
                    // new format: "<level>|<questionIndex>"
                    if (s.indexOf('|') !== -1) return s.startsWith(`${gameState.currentLevel}|`);
                    // fallback: numeric entries (legacy) - treat as belonging to this level only if they look like an index
                    const n = Number(s);
                    return !isNaN(n) && n < gameState.questionData.length;
                });
                
                if (gameState.levelPerfect && !levelUsedHints && allCorrect) {
                    // 完美關卡（全對且無提示且無失誤）
                    gameState.levelResults[gameState.currentLevel] = 'perfect';
                    try { recordLevelResult(true); } catch(_) {}
                    gameState.score += 300;
                    showScoreAnimation('完美+300分', true);
                    try { SFX.play('uiConfirm'); } catch(_) {}
                    // 桌面：啟動持續星星雨
                    try { startStarRain(); } catch(_) {}
                    // 震撼特效（金色）
                    try { triggerLevelEffect('perfect'); } catch(_) {}
                    if (isDebugGame) console.log('完美關卡！');
                } else if (allCorrect) {
                    // 全對關卡（全對但可能用了提示或有失誤）
                    gameState.levelResults[gameState.currentLevel] = 'complete';
                    try { recordLevelResult(false); } catch(_) {}
                    gameState.score += 100;
                    showScoreAnimation('全對+100分', true);
                    try { SFX.play('uiConfirm'); } catch(_) {}
                    // 非完美：停止星星雨
                    try { stopStarRain(false); } catch(_) {}
                    // 震撼特效（綠色）
                    try { triggerLevelEffect('complete'); } catch(_) {}
                    if (isDebugGame) console.log('全對關卡！');
                } else {
                    // 部分正確或全錯
                    if (correctQuestions === 0) {
                        // 題目全錯：標記為失敗（紅色）
                        gameState.levelResults[gameState.currentLevel] = 'failed';
                        try { SFX.play('wrong'); } catch(_) {}
                        // 震撼特效（紅色）
                        try { triggerLevelEffect('failed'); } catch(_) {}
                        if (isDebugGame) console.log('全錯關卡');
                    } else {
                        gameState.levelResults[gameState.currentLevel] = 'partial';
                        try { recordLevelResult(false); } catch(_) {}
                        if (isDebugGame) console.log('部分正確關卡');
                    }
                    // 非完美：停止星星雨
                    try { stopStarRain(false); } catch(_) {}
                }
                
                // 立即更新關卡進度顯示
                if (typeof scheduleProgressUIUpdate === 'function') scheduleProgressUIUpdate({ level: true });
                else updateLevelOvals();
                                // 關卡結束後嘗試即時成就評估（例如連續完美/層數）
                try { evaluateRealtimeAchievements(); } catch(_) {}
                
                // 【單局保底高水位線記錄】將即時獲得的成就ID存入 guaranted 陣列
                if (typeof gameState === 'object' && gameState) {
                    if (!gameState._guaranteedAchievements) gameState._guaranteedAchievements = new Set();
                    if (gameState._rtAchUnlocked) {
                        gameState._rtAchUnlocked.forEach(id => gameState._guaranteedAchievements.add(id));
                    }
                }
                // 裝備課程時，不進入闖關模式的切關流程（由 equip 流程自行管控）
                if (gameState.equipRunning) {
                    return; // avoid classic slide-out handoff calling nextLevel/completeGame
                }
                // 小螢幕：將視角移到最上方的分數卡，讓玩家看見得分與動畫
                try { scrollScoreIntoView(); } catch (e) { /* ignore */ }
                
                // 進/出場動畫：先讓紅色錯題卡片進行零散掉落；
                // 之後再讓其他卡片（綠色或未作答）不規則向左滑出。
                try {
                    const verses = Array.from(document.querySelectorAll('#gameVerses .verse-card'));
                    const chapters = Array.from(document.querySelectorAll('#gameChapters .chapter-card'));
                    const prefersReduce = (typeof isReducedMotionPreferred === 'function') ? isReducedMotionPreferred() : (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
                    let slideWait = 0; // 綠卡/未作答滑出總時長
                    let fallWait = 0;  // 紅卡掉落總時長（不影響切關時間）
                    // Wrong cards: fall scattered first
                    const wrongGroup = [
                        ...verses.filter(el => el.classList.contains('bg-red-100')),
                        ...chapters.filter(el => el.classList.contains('bg-red-100'))
                    ];
                    const wrongStartOffset = 0; // 紅卡優先立即掉落
                    wrongGroup.forEach((el, i) => {
                        const jitter = (min, max) => Math.random() * (max - min) + min;
                        const fx = Math.round(jitter(-40, 80));
                        const fy = Math.round(jitter(180, 320));
                        const fr = `${jitter(-24, 36).toFixed(2)}deg`;
                        const fd = Math.round(jitter(700, 1000));
                        // 更明顯的掉落時間差：加大每張卡的基礎間距與隨機抖動
                        const fdly = Math.round(wrongStartOffset + i * 90 + jitter(0, 260));
                        el.style.setProperty('--fallDelay', `${fdly}ms`);
                        el.style.setProperty('--fx', `${fx}px`);
                        el.style.setProperty('--fy', `${fy}px`);
                        el.style.setProperty('--fr', fr);
                        el.style.setProperty('--fallDur', `${fd}ms`);
                        // 移除可能存在的進/出場 class 以避免衝突
                        el.classList.remove('card-enter', 'card-exit');
                        el.classList.add('card-fall-scatter');
                        fallWait = Math.max(fallWait, fdly + fd);
                    });

                    // Correct or untouched cards: slide out left with stagger (1s duration)
                    const slideGroup = [];
                    verses.forEach((el) => {
                        const isWrong = el.classList.contains('bg-red-100');
                        if (!isWrong) slideGroup.push(el);
                    });
                    chapters.forEach((el) => {
                        const isWrong = el.classList.contains('bg-red-100');
                        if (!isWrong) slideGroup.push(el);
                    });
                    const slideStartOffset = prefersReduce ? 200 : 240; // 讓紅卡先明顯開始
                    slideGroup.forEach((el, i) => {
                        const jitter = (min, max) => Math.random() * (max - min) + min;
                        const delay = Math.round(slideStartOffset + i * 40 + jitter(0, 160));
                        const ex = Math.round(jitter(0, 80));
                        const ey = Math.round(jitter(-12, 12));
                        // 綠色與未作答卡片不傾斜：退出時不旋轉
                        const er = '0deg';
                        const dur = 1000; // 指定 1 秒
                        el.style.setProperty('--exitDelay', `${delay}ms`);
                        el.style.setProperty('--exitX', `${ex}px`);
                        el.style.setProperty('--exitY', `${ey}px`);
                        el.style.setProperty('--exitR', er);
                        el.style.setProperty('--exitDur', `${dur}ms`);
                        // 移除進場效果避免干擾
                        el.classList.remove('card-enter', 'card-fall-scatter', 'correct-pop');
                        el.classList.add('card-exit');
                        slideWait = Math.max(slideWait, delay + dur);
                    });

                    // 全紅情境：若無任何可滑出的卡片（全部為紅色），則等待紅卡掉落全程再切關；
                    // 其他情境：只等待綠卡/未作答滑出完成，保留極短緩衝即可銜接下一關
                    let pause = 0;
                    if (prefersReduce) {
                        pause = 0;
                    } else if (slideGroup.length === 0) {
                        // 等待紅卡掉落完成，並加上小緩衝
                        pause = Math.max(0, fallWait + 30);
                    } else {
                        pause = Math.max(0, slideWait + 5);
                    }
                    gameState.__levelAnimDelay = pause;
                    // 切關等待期間鎖定互動
                    setLevelInteractionLock(true);
                } catch (_) { gameState.__levelAnimDelay = 800; }

                // 使用更短的延遲並確保執行（加入動畫暫停時間）
                // 加入 watchdog，避免偶發例外或動畫干擾導致無法切關
                clearPendingLevelFlowTimers();
                const handoffLevel = gameState.currentLevel;
                gameState.__handoffDone = false;
                const runHandoff = () => {
                    const isDebugGame = !!window.DEBUG_GAME;
                    try {
                        if (gameState.__handoffTimer) {
                            clearTimeout(gameState.__handoffTimer);
                            gameState.__handoffTimer = null;
                        }
                        if (gameState.__handoffGuard) {
                            clearTimeout(gameState.__handoffGuard);
                            gameState.__handoffGuard = null;
                        }
                    } catch(_) {}
                    // 避免重複執行
                    if (gameState.__handoffDone) return;
                    if (isDebugGame) console.log(`當前關卡: ${gameState.currentLevel}`);
                    const safeCall = (fn) => {
                        try { fn(); } catch (e) { console.error('關卡切換發生例外，嘗試保護性解鎖', e); }
                        finally {
                            gameState.__handoffDone = true;
                            // 保護性解鎖（nextLevel/completeGame 正常會自行解鎖）
                            try { setLevelInteractionLock(false); } catch(_) {}
                        }
                    };
                    const maxLevels = getLevelCount();
                    if (!maxLevels) {
                        // 無關卡上限（如：生存模式），持續進行直到特殊條件結束
                        if (isDebugGame) console.log('無關卡上限：持續下一關');
                        try { showLevelEncouragementCute(); } catch (e) {}
                        setTimeout(() => { if (isDebugGame) console.log('執行下一關'); safeCall(() => nextLevel()); }, 30);
                        return;
                    }
                    if (gameState.currentLevel >= maxLevels) {
                        if (isDebugGame) console.log('遊戲完成！');
                        try { showLevelEncouragementCute(); } catch (e) {}
                        setTimeout(() => { if (isDebugGame) console.log('執行完成遊戲'); safeCall(() => completeGame()); }, 30);
                    } else {
                        if (isDebugGame) console.log('進入下一關');
                        try { showLevelEncouragementCute(); } catch (e) {}
                        setTimeout(() => { if (isDebugGame) console.log('執行下一關'); safeCall(() => nextLevel()); }, 30);
                    }
                };

                gameState.__handoffTimer = setTimeout(() => {
                    gameState.__handoffTimer = null;
                    runHandoff();
                }, (gameState.__levelAnimDelay || 0));
                // Watchdog：若主流程在合理時間內未完成，強制執行（pause + 2500ms）
                const guardDelay = (gameState.__levelAnimDelay || 0) + 2500;
                gameState.__handoffGuard = setTimeout(() => {
                    gameState.__handoffGuard = null;
                    if (!gameState.__handoffDone && handoffLevel === gameState.currentLevel) {
                        console.warn('[Watchdog] 關卡切換逾時，啟動保護性切換');
                        runHandoff();
                    }
                }, guardDelay);
            }
        }

        // 小螢幕：平滑捲到頁面頂端，確保上方關卡進度也可見
    // 小畫面時把分數區域捲入視口
    // Scroll score area into view on small screens
    function scrollScoreIntoView() {
            // 僅在小螢幕上進行自動捲動（避免桌面用戶被干擾）
            if (window.innerWidth > 640) return;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

    // 關卡切換等待期間鎖定互動，避免動畫中點擊/焦點/捲動異常
    // Lock interactions on main containers during level handoff wait
    function setLevelInteractionLock(lock) {
            try {
                const ids = ['gameVerses', 'gameChapters', 'versesCarousel'];
                ids.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.pointerEvents = lock ? 'none' : '';
                });
                // 同步處理提示按鈕，避免期間被觸發
                const hintBtn = document.getElementById('hintBtn');
                if (hintBtn) {
                    if (lock) {
                        if (!hintBtn.dataset.locked) hintBtn.dataset.locked = '1';
                        hintBtn.disabled = true;
                        hintBtn.classList.add('opacity-50', 'cursor-not-allowed');
                    } else {
                        if (hintBtn.dataset.locked === '1') {
                            delete hintBtn.dataset.locked;
                            if (gameState.hintsRemaining > 0) {
                                hintBtn.disabled = false;
                                hintBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                            }
                        }
                    }
                }
            } catch(_) { /* non-fatal */ }
        }

    // ===== 全畫面關卡特效（完美/全對/全錯） =====
    // 插入一次性樣式
    function ensureLevelFxStyles() {
            if (document.getElementById('levelFxStyles')) return;
            const style = document.createElement('style');
            style.id = 'levelFxStyles';
            style.textContent = `
            .level-fx-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 10020; overflow: hidden; }
            .level-fx-flash { position:absolute; inset:0; opacity:0; }
            .level-fx-radial { position:absolute; inset:-10%; opacity:0.18; filter: blur(2px); }
            .level-fx-particle { position:absolute; left:50%; top:50%; width:10px; height:10px; opacity:0; border-radius: 2px; will-change: transform, opacity; }
            .level-fx-star { width:12px; height:12px; background: currentColor; clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%); }
            .level-fx-circle { border-radius: 9999px; }
            .level-fx-square { }
            .level-fx-overlay.level-fx-shake { animation: megaShake 900ms cubic-bezier(.36,.07,.19,.97) both; }
            @keyframes levelFlash { 0%{opacity:0} 10%{opacity:.95} 100%{opacity:0} }
            @keyframes particleExplode { 0% { opacity:1; transform: translate(-50%,-50%) scale(0.4) rotate(0deg); } 100% { opacity:0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1) rotate(var(--rot)); } }
            @keyframes megaShake {
                0% { transform: translate(0, 0) }
                10% { transform: translate(-14px, -10px) }
                20% { transform: translate(16px, 12px) }
                30% { transform: translate(-12px, 10px) }
                40% { transform: translate(12px, -14px) }
                50% { transform: translate(-8px, 8px) }
                60% { transform: translate(10px, -6px) }
                70% { transform: translate(-6px, 10px) }
                80% { transform: translate(6px, -8px) }
                90% { transform: translate(-4px, 6px) }
                100% { transform: translate(0, 0) }
            }
            /* Global Touch Ripple */
            .touch-ripple {
                position: absolute;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.5);
                transform: translate(-50%, -50%) scale(0);
                animation: ripplePop 0.5s ease-out forwards;
                pointer-events: none;
                z-index: 99999;
                width: 4px;
                height: 4px;
                box-shadow: 0 0 10px rgba(255,255,255,0.4);
            }
            @keyframes ripplePop {
                0% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; width: 4px; height: 4px; }
                100% { transform: translate(-50%, -50%) scale(25); opacity: 0; width: 4px; height: 4px; }
            }
            `;
            document.head.appendChild(style);
        }

    // 觸發關卡特效：type = 'perfect' | 'complete' | 'failed'
    function triggerLevelEffect(type) {
            try {
                const reduce = (typeof isReducedMotionPreferred === 'function') ? isReducedMotionPreferred() : (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
                ensureLevelFxStyles();
                const overlay = document.createElement('div');
                overlay.className = 'level-fx-overlay';
                // 色盤
                let colors = [];
                let flashBg = '';
                // 調整動畫時長：全對（complete）略短且較柔和
                const flashDur = reduce ? 300 : (type === 'complete' ? 700 : 900);
                const particleDur = reduce ? 500 : (type === 'complete' ? 900 : 1200);
                if (type === 'perfect') {
                    colors = ['#FBBF24','#F59E0B','#FFD54F','#FFF3B0','#FFFFFF'];
                    flashBg = 'radial-gradient(ellipse at center, rgba(255,223,128,0.92), rgba(255,190,60,0.66) 40%, rgba(255,184,28,0.0) 70%)';
                } else if (type === 'complete') {
                    // 使用較柔和的綠色，降低閃光透明度
                    colors = ['#86EFAC','#A7F3D0','#6EE7B7','#34D399','#BBF7D0'];
                    flashBg = 'radial-gradient(ellipse at center, rgba(52,211,153,0.55), rgba(16,185,129,0.30) 40%, rgba(16,185,129,0.0) 70%)';
                } else { // failed
                    colors = ['#EF4444','#DC2626','#F87171','#FB7185','#991B1B'];
                    flashBg = 'radial-gradient(ellipse at center, rgba(239,68,68,0.85), rgba(220,38,38,0.55) 40%, rgba(220,38,38,0.0) 70%)';
                    overlay.classList.add('level-fx-shake');
                }

                // 閃光層
                const flash = document.createElement('div');
                flash.className = 'level-fx-flash';
                flash.style.background = flashBg;
                flash.style.animation = `levelFlash ${flashDur}ms ease-out forwards`;
                overlay.appendChild(flash);

                // 放射淡層
                const radial = document.createElement('div');
                radial.className = 'level-fx-radial';
        radial.style.background = type === 'perfect'
                    ? 'radial-gradient(circle at center, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.05) 35%, rgba(255,255,255,0) 70%)'
                    : type === 'complete'
            ? 'radial-gradient(circle at center, rgba(34,197,94,0.15) 0%, rgba(34,197,94,0.04) 35%, rgba(34,197,94,0) 70%)'
                        : 'radial-gradient(circle at center, rgba(239,68,68,0.25) 0%, rgba(239,68,68,0.06) 35%, rgba(239,68,68,0) 70%)';
                overlay.appendChild(radial);

                // 粒子爆裂
        const count = reduce ? 20 : (type === 'perfect' ? 90 : type === 'complete' ? 40 : 64);
                const shapes = ['level-fx-star','level-fx-circle','level-fx-square'];
                for (let i = 0; i < count; i++) {
                    const p = document.createElement('div');
                    p.className = `level-fx-particle ${shapes[i % shapes.length]}`;
                    p.style.color = colors[Math.floor(Math.random()*colors.length)];
                    const ang = Math.random() * Math.PI * 2;
                    const dist = (type === 'failed' ? 320 : 380) * (0.45 + Math.random()*0.75);
                    const dx = Math.cos(ang) * dist;
                    const dy = Math.sin(ang) * dist;
                    const rot = `${Math.round((Math.random()*720-360))}deg`;
                    p.style.setProperty('--dx', `${dx}px`);
                    p.style.setProperty('--dy', `${dy}px`);
                    p.style.setProperty('--rot', rot);
                    const size = (type === 'perfect' ? 8 : 7) + Math.round(Math.random()*10);
                    p.style.width = `${size}px`;
                    p.style.height = `${size}px`;
                    p.style.animation = `particleExplode ${particleDur}ms cubic-bezier(.17,.67,.37,1) ${Math.round(Math.random()*120)}ms forwards`;
                    overlay.appendChild(p);
                }

                document.body.appendChild(overlay);
                // 清理
                setTimeout(() => { try { if (overlay.parentElement) overlay.parentElement.removeChild(overlay); } catch(_) {} }, reduce ? 600 : (type === 'complete' ? 1100 : 1300));
            } catch(_) { /* non-fatal */ }
        }

    // 使用提示一次（每關最多提醒一次未使用提示）
    // Use a hint and maybe show per-level reminder
    function useHint() {
        try { SFX.play('hint'); } catch(_) {}
            if (gameState.hintsRemaining <= 0) return;
            const hintBtn = document.getElementById('hintBtn');
            if (hintBtn.disabled) return;

            // 禁用提示按鈕，避免連續誤點
            hintBtn.disabled = true;
            hintBtn.classList.add('opacity-50', 'cursor-not-allowed');

            // 找到所有未完成且未答錯的題目
            const availableQuestions = [];
            gameState.questionData.forEach((question, index) => {
                const verseCard = document.querySelector(`#gameVerses [data-index="${index}"]`);
                if (verseCard &&
                    !verseCard.classList.contains('bg-green-100') &&
                    !verseCard.classList.contains('bg-red-100') &&
                    gameState.questionAttempts[index] > 0) {
                    availableQuestions.push(index);
                }
            });
            if (availableQuestions.length === 0) {
                // 沒有可提示題目，立即恢復按鈕
                setTimeout(() => {
                    if (gameState.hintsRemaining > 0) {
                        hintBtn.disabled = false;
                        hintBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                    }
                }, 500);
                return;
            }

            // 扣除提示次數
            gameState.hintsRemaining--;
            // 成就指標：使用提示一次
            try { recordHint(); } catch(_) {}
            updateGameUI();

            // Prefer the currently selected question if the player has one selected and it's still answerable;
            // otherwise pick a random available question.
            let selectedQuestionIndex = null;
            if (gameState.selectedVerseIndex != null) {
                const sel = gameState.selectedVerseIndex;
                const selCard = document.querySelector(`#gameVerses [data-index="${sel}"]`);
                const selAttempts = typeof gameState.questionAttempts[sel] === 'number' ? gameState.questionAttempts[sel] : 0;
                const selNotAnswered = selCard && !selCard.classList.contains('bg-green-100') && !selCard.classList.contains('bg-red-100') && selAttempts > 0;
                if (selNotAnswered) selectedQuestionIndex = sel;
            }

            if (selectedQuestionIndex == null) {
                const randomIndex = Math.floor(Math.random() * availableQuestions.length);
                selectedQuestionIndex = availableQuestions[randomIndex];
            }
            const selectedQuestion = gameState.questionData[selectedQuestionIndex];
            try {
                const levelKey = `${gameState.currentLevel}|${selectedQuestionIndex}`;
                gameState.usedHints.add(levelKey);
            } catch (e) {
                // fallback for environments where usedHints may not be a Set
                try { gameState.usedHints.add(selectedQuestionIndex); } catch (ee) { /* ignore */ }
            }

            // 清除所有現有的提示效果
            document.querySelectorAll('.hint-flash').forEach(element => {
                element.classList.remove('hint-flash');
            });

            // 找到正確的章節卡片（easy 使用 pairId）
            const verseCard = document.querySelector(`#gameVerses [data-index="${selectedQuestionIndex}"]`);
            let correctChapter = null;
            if (gameState.difficulty === 'easy' && selectedQuestion.pairId) {
                correctChapter = document.querySelector(`[data-pair-id="${selectedQuestion.pairId}"]`);
            } else {
                correctChapter = document.querySelector(`[data-book="${selectedQuestion.book}"][data-chapter="${selectedQuestion.chapter}"]`);
            }
            if (correctChapter && verseCard) {
                correctChapter.classList.add('hint-flash');
                verseCard.classList.add('hint-flash');
                // 4秒後移除效果並恢復按鈕
                setTimeout(() => {
                    correctChapter.classList.remove('hint-flash');
                    verseCard.classList.remove('hint-flash');
                    if (gameState.hintsRemaining > 0) {
                        hintBtn.disabled = false;
                        hintBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                    }
                }, 4000);
            } else {
                // 若找不到卡片，1秒後恢復按鈕
                setTimeout(() => {
                    if (gameState.hintsRemaining > 0) {
                        hintBtn.disabled = false;
                        hintBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                    }
                }, 1000);
            }
        }
        


    // parseDeltaFromDisplayText, processCenterQueue, enqueueCenterScoreDelta moved to score.js

    // showScoreAnimation moved to score.js
        
    // 完美關卡特效已移至 score.js

        
    // 全對特效已移至 score.js


        

    // 顯示遊戲提示（可愛吐司）；回傳隱藏函數
    // Show a cute in-game toast; returns a hide function
    function showGameInstruction(text, autoFadeMs = 2000) {
            // 使用可愛吐司提示取代覆蓋層
            // 若傳入 0 表示不要自動隱藏；若未提供則採用預設 2000ms
            const dur = (typeof autoFadeMs === 'number') ? autoFadeMs : 2000;
            showCuteHint(text, 'purple', dur, '✨');
            // 回傳淡出函數供外部手動調用
            return () => hideCuteHint(true);
        }
        try { window.showGameInstruction = showGameInstruction; } catch(_) {}
        
    // 顯示一次性的提示提醒（每關一回）
    // Show a one-time per-level hint reminder
    function showHintReminder() {
            // 用可愛吐司提示提醒有提示功能
            showCuteHint(pick(HINTS.hintReminder), 'amber', 2400, '💡');
        }

    // 依 combo 門檻自適應調整難度（於切關時套用到下一關）
    function applyAdaptiveDifficulty() {
                // Disable adaptive adjustments during a same-question replay sequence
                if (gameState._adaptiveDisabled) return;
            try {
                const c = Number(gameState.combo || 0);
                const nextDiff = getDifficultyFromCombo(c);
                gameState._adaptiveDiffChangedThisTransition = false;
                // 僅在變更時套用並提示
                if (nextDiff !== gameState.difficulty) {
                    gameState.difficulty = nextDiff;
                    gameState._lastAdaptiveDifficulty = nextDiff;
                    gameState._adaptiveDiffChangedThisTransition = true;
                    // --------------------------------------------------------
                    // 改善方案 4：情感反饋 - 難度升降的「結界視覺效果」與「專屬儀式台詞」
                    // --------------------------------------------------------
                    let msg = '';
                    let theme = 'gray';
                    let icon = '💡';
                    let flashColor = '';

                    if (nextDiff === 'easy') {
                        msg = '風暴暫歇... 系統為您調降了辨識壓力，重整旗鼓吧！';
                        theme = 'green';
                        icon = '🍃';
                        flashColor = 'rgba(16, 185, 129, 0.4)'; // Emerald
                    } else if (nextDiff === 'normal') {
                        msg = '突破舒適圈！選項遮蔽已部分開啟。';
                        theme = 'amber';
                        icon = '✨';
                        flashColor = 'rgba(245, 158, 11, 0.4)'; // Amber
                    } else if (nextDiff === 'hard') {
                        msg = '深淵試煉啟動！完全遮蔽，發揮您的直覺吧！';
                        theme = 'purple';
                        icon = '🔥';
                        flashColor = 'rgba(139, 92, 246, 0.4)'; // Purple
                    }

                    showCuteHint(msg, theme, 2500, icon);

                    // 觸發全畫面微邊框閃爍 (Border Flash)
                    if (flashColor) {
                        try {
                            const overlay = document.createElement('div');
                            overlay.style.position = 'fixed';
                            overlay.style.top = '0'; overlay.style.left = '0';
                            overlay.style.width = '100vw'; overlay.style.height = '100vh';
                            overlay.style.pointerEvents = 'none';
                            overlay.style.zIndex = '9999';
                            overlay.style.boxShadow = `inset 0 0 100px ${flashColor}`;
                            overlay.style.transition = 'opacity 1s ease-out';
                            document.body.appendChild(overlay);
                            
                            // 硬體加速重繪
                            void overlay.offsetWidth;
                            
                            setTimeout(() => { overlay.style.opacity = '0'; }, 100);
                            setTimeout(() => { overlay.remove(); }, 1200);
                        } catch(_) {}
                    }

                    try {
                        if (typeof scheduleProgressUIUpdate === 'function') scheduleProgressUIUpdate({ adaptive: true });
                        else updateAdaptiveStatus();
                    } catch(_) {}
                }

                    // ====== 新：逐關經文罕見度（common → normal → rare 漸進 / 反向漸退）======
                    // 狀態欄位：gameState.adaptiveVerseRarity ('common' | 'normal' | 'rare')
                    // 第一關固定 common；依上一關完成耗時（秒）嚴苛判斷：
                    // 升級條件（單步）：
                    //  - common → normal : prev <= 25s
                    //  - normal → rare   : prev <= 20s
                    // 降級條件（單步）：
                    //  - rare → normal   : prev > 40s
                    //  - normal → common : prev > 45s
                    // 不跨兩階；未達條件維持。
                    // 方案 C：性能評分（Performance Score）
                    // PS = timeScore - mistakePenalty - hintPenalty + perfectBonus
                    // 決策：
                    //   PS >= +0.40 立即升一級 (若未達 rare)
                    //   PS <= -0.40 立即降一級 (若未達 common)
                    //   0.15 ≤ PS < 0.40 連續 2 次升
                    //  -0.40 < PS ≤ -0.15 連續 2 次降
                    //   -0.15 < PS < +0.15 穩定區（緩衝歸零）
                    // 參數可後續抽離設定
                    function updateAdaptiveVerseRarity(prevLevelDurationSec){
                        try {
                            // 若本次轉場會改變配對難度，則本關罕見度延後一關再評估（同關最多變一軸）
                            try {
                                const comboNow = Number(gameState.combo || 0);
                                const predictedDiff = getDifficultyFromCombo(comboNow);
                                const curDiff = String(gameState.difficulty || 'easy');
                                if (predictedDiff !== curDiff) {
                                    gameState._rarityPosBuf = 0;
                                    gameState._rarityNegBuf = 0;
                                    gameState.lastLevelDurationSec = Number(prevLevelDurationSec || 0);
                                    gameState.lastLevelPerformanceScore = null;
                                    console.log('[RARITY][PS] skipped due to pending difficulty switch', {
                                        level: Number(gameState.currentLevel||0),
                                        curDiff,
                                        predictedDiff
                                    });
                                    return;
                                }
                            } catch(_) {}

                            const labelMap = { common:'常見', normal:'一般', rare:'冷門' };
                            const lvl = Number(gameState.currentLevel||0);
                            const duration = Number(prevLevelDurationSec||0);
                            gameState.lastLevelDurationSec = duration;
                            const startMist = Number(gameState._levelMistakesStart||0);
                            const endMist = Number(gameState.totalMistakes||0);
                            const startHints = Number(gameState._levelHintsStart||0);
                            const endHints = Number(gameState.hintsUsed||0);
                            const mistakes = Math.max(0, endMist - startMist);
                            const hintsUsed = Math.max(0, endHints - startHints);
                            
                            // --------------------------------------------------------
                            // 改善方案 2：長度感知時間 (Length-Aware Target Time)
                            // --------------------------------------------------------
                            let totalCharCount = 0;
                            try {
                                if (Array.isArray(gameState.questionData)) {
                                    totalCharCount = gameState.questionData.reduce((sum, q) => sum + (q.text ? String(q.text).trim().length : 0), 0);
                                }
                            } catch(_) {}
                            
                            // 預設最低基礎時間 15 秒（考慮反應與按鈕），然後每個字串給予約 0.08 秒的閱讀緩衝
                            const TARGET_FAST = totalCharCount > 0 ? (15 + totalCharCount * 0.08) : 25; // s
                            
                            // 允許落後/領先的緩衝，跟著總時間彈性放大（保證不會稍微超時就直接重扣）
                            const RANGE = Math.max(30, TARGET_FAST * 1.2); 
                            
                            let timeScore = (TARGET_FAST - duration) / RANGE; // 以動態目標秒數=0，越快正、越慢負
                            if (timeScore > 1) timeScore = 1; else if (timeScore < -1) timeScore = -1;
                            const mistakePenalty = mistakes * 0.15;
                            const hintPenalty = hintsUsed * 0.10;
                            const perfectBonus = (mistakes === 0 && hintsUsed === 0) ? 0.25 : 0;
                            const PS = +(timeScore - mistakePenalty - hintPenalty + perfectBonus).toFixed(4);
                            gameState.lastLevelPerformanceScore = PS;
                            try { // 若有計算用 meta 可一併傳遞（假設該上下文有 metaPerformance 物件）
                                if (typeof window.__psCollector==='object' && typeof metaPerformance==='object') {
                                    window.__psCollector.collect(metaPerformance, PS);
                                }
                            } catch(_) {}
                            gameState.lastLevelMistakes = mistakes;
                            gameState.lastLevelHintsUsed = hintsUsed;
                            let cur = gameState.adaptiveVerseRarity || 'common';
                            if (!cur) { cur = 'common'; gameState.adaptiveVerseRarity = 'common'; }
                            if (lvl <= 1 && cur !== 'common') { gameState.adaptiveVerseRarity = 'common'; cur='common'; }
                            // 緩衝計數器
                            if (typeof gameState._rarityPosBuf !== 'number') gameState._rarityPosBuf = 0;
                            if (typeof gameState._rarityNegBuf !== 'number') gameState._rarityNegBuf = 0;
                            let promote = false, demote = false;
                            if (PS >= 0.55) { promote = (cur !== 'rare'); gameState._rarityPosBuf = 0; gameState._rarityNegBuf = 0; }
                            else if (PS <= -0.55) { demote = (cur !== 'common'); gameState._rarityPosBuf = 0; gameState._rarityNegBuf = 0; }
                            else if (PS >= 0.20) { gameState._rarityPosBuf++; gameState._rarityNegBuf = 0; if (gameState._rarityPosBuf >= 3 && cur !== 'rare') { promote = true; gameState._rarityPosBuf = 0; } }
                            else if (PS <= -0.20) { gameState._rarityNegBuf++; gameState._rarityPosBuf = 0; if (gameState._rarityNegBuf >= 3 && cur !== 'common') { demote = true; gameState._rarityNegBuf = 0; } }
                            else { // 穩定區
                                gameState._rarityPosBuf = 0; gameState._rarityNegBuf = 0;
                            }
                            let next = cur;
                            if (promote) next = (cur === 'common') ? 'normal' : 'rare';
                            else if (demote) next = (cur === 'rare') ? 'normal' : 'common';
                            const decision = { level:lvl, cur, next, duration, mistakes, hintsUsed, timeScore, mistakePenalty, hintPenalty, perfectBonus, PS, posBuf: gameState._rarityPosBuf, negBuf: gameState._rarityNegBuf, promote, demote };
                            console.log('[RARITY][PS]', decision);
                            if (next !== cur) {
                                gameState.adaptiveVerseRarity = next;
                                
                                // --------------------------------------------------------
                                // 改善方案 4：情感反饋 - 稀有度切換的考古探險感
                                // --------------------------------------------------------
                                let msg = '';
                                let theme = 'blue';
                                let icon = '📚';
                                
                                if (next === 'rare') {
                                    msg = '📜 古卷殘篇出土！系統正在挑戰您的冷門記憶限制！';
                                    theme = 'purple';
                                } else if (next === 'common') {
                                    msg = '📖 經典重現：為您放送核心常見經文。';
                                    theme = 'gray';
                                } else {
                                    // normal
                                    msg = (promote) ? '🔍 發掘進階經文，罕見度適度提升！' : '⚖️ 難度收攝，回歸一般經文領域。';
                                    theme = (promote) ? 'amber' : 'green';
                                }
                                
                                showCuteHint(msg, theme, 3000, icon);
                            } else {
                                // 可選：在高/低極端但已封頂顯示提示
                                if (promote && cur === 'rare') {
                                    showCuteHint(`🏆 解鎖極致領域！您正在挑戰最罕見的古老經文！`, 'purple', 2000, '📜');
                                } else if (demote && cur === 'common') {
                                    // 降級到底不用一直吵玩家，維持原樣即可
                                }
                            }
                        } catch(e) { console.warn('[RARITY][PS] error', e); }
                    }
                    try { window.updateAdaptiveVerseRarity = updateAdaptiveVerseRarity; } catch(_) {}
            } catch(_) { /* non-fatal */ }
        }

    // 進入下一關：檢查題庫剩餘數、重置單關狀態
    // Advance to next level; reset per-level flags
    function nextLevel() {
            const isDebugGame = !!window.DEBUG_GAME;
            clearPendingLevelFlowTimers();
            // If equip is running, do not use classic nextLevel; equip controls its own progression
            if (gameState.equipRunning) { console.warn('[EQUIP] Ignoring classic nextLevel during equip run'); try { setLevelInteractionLock(false); } catch(_) {} return; }
            if (isDebugGame) console.log('[DEBUG] nextLevel invoked, currentLevel=', gameState.currentLevel);
            // 保守：在嘗試進入下一關前先鎖住互動，並在最終 finally 中一定會解除
            try { setLevelInteractionLock(true); } catch(_) {}

            try {
                // 派發下一關事件，讓模式模組處理進階視覺回饋
                if (window.bcEvents) {
                    try { window.bcEvents.emit('game:nextLevelStart'); } catch(_) {}
                }
                // 在進入下一關前，先檢查剩餘未使用的可用經文數是否足夠（至少 5 篇）
                try {
                    const pool = getAvailableVerses();
                    const usedKey = (v) => `${v.book}|${v.chapter}|${v.verse}`;
                    const usedVersesSet = gameState.usedVerses || new Set();
                    const uniqueRemaining = Array.isArray(pool) ? pool.filter(v => !usedVersesSet.has(usedKey(v))).length : 0;
                    if (isDebugGame) console.log(`[DEBUG] nextLevel: uniqueRemaining=${uniqueRemaining}, used=${usedVersesSet.size}, pool=${Array.isArray(pool)?pool.length:0}, currentLevel=${gameState.currentLevel}`);
                    if (uniqueRemaining < 5) {
                        console.warn('[DEBUG] nextLevel: insufficient uniqueRemaining -> completeGame()');
                        alert('⚠️ 剩餘未使用的可用經文不足 5 篇，請擴大範圍或改選罕見度。本局將結束。');
                        // 結束本局並顯示結算
                        completeGame();
                        return;
                    }
                } catch (e) {
                    // 若檢查過程發生例外，紀錄但嘗試繼續（以避免誤判為無法切關）
                    console.warn('[DEBUG] nextLevel: exception during available verses check', e);
                }

                // 進入下一關：更新狀態
                gameState.currentLevel++;
                // 計算上一關耗時並更新經文罕見度（重播或裝備課程不啟用）
                try {
                    if (!gameState._replaySequence && !gameState.equipRunning) {
                        const endTs = Date.now();
                        // 使用整關開始時間 _rarityLevelStartTime（不隨單題答對重置）
                        const baseStart = gameState._rarityLevelStartTime || gameState.levelStartTime || endTs;
                        const prevDur = (endTs - baseStart) / 1000;
                        // 呼叫方案C評分（將計算並更新 lastLevelPerformanceScore 等）
                        if (typeof updateAdaptiveVerseRarity === 'function') updateAdaptiveVerseRarity(prevDur);
                    }
                } catch(_) {}
                gameState.isFirstQuestionOfLevel = true;
                gameState.levelHintReminderShown = false; // 重置每關提示提醒狀態
                gameState.levelFailedCount = 0; // 重置每關完全失敗題數
                gameState.levelEndHandled = false; // 重置關卡結束防重入旗標

                // 嘗試產生下一關並更新 UI；若失敗則回退並安全結束，避免卡住
                try {
                    if (Array.isArray(gameState._replaySequence) && typeof gameState._replaySeqIndex === 'number') {
                        // IDENTICAL REPLAY PATH
                        gameState._replaySeqIndex++;
                        if (gameState._replaySeqIndex >= gameState._replaySequence.length) {
                            // No more levels in sequence → end game
                            completeGame();
                            return;
                        }
                        const seq = gameState._replaySequence[gameState._replaySeqIndex];
                        gameState.difficulty = seq.difficulty || gameState.difficulty;
                        gameState.questionData = JSON.parse(JSON.stringify(seq.questionData || []));
                        gameState._forcedChapterOrder = Array.isArray(seq.chapterOrder) ? [...seq.chapterOrder] : null;
                        // Reset per-level state
                        gameState.currentQuestion = 1;
                        gameState.levelPerfect = true;
                        gameState.questionAttempts = {};
                        gameState.isFirstQuestionOfLevel = true;
                        gameState.questionData.forEach((_, idx) => {
                            const maxAttempts = { easy: 3, normal: 3, hard: 3 };
                            gameState.questionAttempts[idx] = maxAttempts[gameState.difficulty];
                        });
                        updateGameUI();
                        displayQuestions();
                        // 派發關卡 UI 就緒事件
                        if (window.bcEvents) try { window.bcEvents.emit('game:levelReady'); } catch(_) {}
                        // Level timer
                        try { const nowTs = Date.now(); gameState.levelStartTime = nowTs; gameState._rarityLevelStartTime = nowTs; gameState._levelMistakesStart = Number(gameState.totalMistakes||0); gameState._levelHintsStart = Number(gameState.hintsUsed||0); if (gameMetrics) gameMetrics.speedEventStartTs = nowTs; startLevelTimer(); } catch(_) {}
                    } else {
                        // NORMAL PATH
                        applyAdaptiveDifficulty();
                        generateLevel();
                        updateGameUI();
                        // 派發關卡 UI 就緒事件
                        if (window.bcEvents) try { window.bcEvents.emit('game:levelReady'); } catch(_) {}
                        // 關卡開始：初始化整關耗時起點（僅此處 & replay 同步）
                        try { const nowTs2 = Date.now(); gameState._rarityLevelStartTime = nowTs2; gameState._levelMistakesStart = Number(gameState.totalMistakes||0); gameState._levelHintsStart = Number(gameState.hintsUsed||0); if (gameMetrics) gameMetrics.speedEventStartTs = nowTs2; } catch(_) {}
                    }
                } catch (e) {
                    console.error('[DEBUG] nextLevel: exception during generateLevel/updateGameUI', e);
                    gameState.currentLevel = Math.max(1, gameState.currentLevel - 1);
                    try { alert('發生錯誤，無法載入下一關，遊戲將結束（請查看 console）。'); } catch(_) {}
                    completeGame();
                    return;
                }
            } finally {
                // 確保在任一情況下都會解除互動鎖（保護性）
                try { setLevelInteractionLock(false); } catch (e) { console.warn('[DEBUG] nextLevel: failed to release interaction lock', e); }
            }
        }

    // 完成本局：停止計時、計算時間獎勵、儲存紀錄、顯示結算
    // Complete the run: stop timer, compute time reward, save record, show modal
    function completeGame() {
            clearPendingLevelFlowTimers();
            // If equip is running, classic completeGame should not run (equip has finishEquipRun)
            if (gameState.equipRunning) { console.warn('[EQUIP] Ignoring classic completeGame during equip run'); try { setLevelInteractionLock(false); } catch(_) {} return; }
            // 停止計時器
            GameTimer.stopLevel();
            // 停止生存模式倒數並隱藏卡片
            try { GameTimer.stopSurvival(); } catch(_) {}
            try { const card = document.getElementById('survivalTimerCard'); if (card) card.classList.add('hidden'); } catch(_) {}
            try { const mini = document.getElementById('survivalTimerMini'); if (mini) mini.classList.remove('active'); } catch(_) {}
            // 解除互動鎖，避免結算視窗無法操作
            try { setLevelInteractionLock(false); } catch(_) {}
            
            // 標記遊戲完成並記錄完成時間
            gameState.gameCompleted = true;
            gameState.gameEndTime = Date.now(); // 記錄遊戲結束時間
            
            // 先計算 accuracy 並更新/選定結語經文，讓之後的儲存會包含相同的 closing verse
            const accuracy = gameState.totalQuestions > 0 ? Math.round((gameState.totalCorrectAnswers / gameState.totalQuestions) * 100) : 0;
            try { updateClosingVerse(accuracy); } catch (e) {}

            // 結算：計算本局「時間獎勵」總分，方便在詳細計分與排行榜紀錄中顯示
            try {
                if (gameState.showTimeReward) {
                    const correctAnswers = gameState.totalCorrectAnswers || 0;
                    // 基礎分固定 100 分/題（移除罕見度影響）
                    const perQ = 100;
                    const baseScore = correctAnswers * perQ;
                    const totalMistakes = gameState.totalMistakes || 0;
                    const bonusScore = (function () {
                        let b = 0;
                        // 關卡獎勵
                        Object.values(gameState.levelResults || {}).forEach(r => {
                            if (r === 'perfect') b += 300; else if (r === 'complete') b += 100;
                        });
                        // 提示獎勵
                        const hintCounts = { easy: 3, normal: 3, hard: 3 };
                        const totalHints = hintCounts[gameState.difficulty];
                        const hintsRemaining = (totalHints != null ? totalHints : 0) - (gameState.usedHints ? gameState.usedHints.size : 0);
                        if (hintsRemaining > 0) b += hintsRemaining * 100;
                        return b;
                    })();
                    // 回加 50 × 失誤數，扣除所有額外獎勵，剩下即為時間獎勵總分（不倒扣，最小 0）
                    const timeScore = (gameState.score || 0) - baseScore + (totalMistakes * 50) - bonusScore;
                    gameState.timeReward = Math.max(0, Math.round(timeScore));
                } else {
                    gameState.timeReward = null;
                }
            } catch(_) { /* non-fatal */ }

            // 保存分數到排行榜（此時 gameState.closingVerse 已存在）
            // Visual feedback on game completion
            try { pulseCenterScore(gameState.score ? Math.min(300, gameState.score) : 100); } catch(e) {}
            try { spawnScoreParticles(gameState.score ? Math.min(300, gameState.score) : 100); } catch(e) {}

            const gameRecord = saveScore(gameState.score);
            
            // 直接在遊戲畫面顯示結算視窗
            checkAndShowGameComplete(gameRecord);
        }
        // #endregion

// Moved to settlement-ui.js
        
// Moved to leaderboard-ui.js




    // #region 資料持久化與排行榜IO
    // 封裝並回傳本局遊戲紀錄（不直接寫入；由呼叫端決定後續流程）
    // Build and return a gameRecord snapshot for this run; caller persists/displays it.
    function saveScore(score) {
            // 計算遊戲耗時（從開始到完成最後一關，不包括結算視窗時間）
            const endTime = gameState.gameEndTime || Date.now();
            const gameTime = gameState.gameStartTime ? Math.floor((endTime - gameState.gameStartTime) / 1000) : 0;
            const minutes = Math.floor(gameTime / 60);
            const seconds = gameTime % 60;
            const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            const isEquipRun = !!(gameState && (gameState.equipTier || gameState.equipRunning || gameState.playMode === 'equip'));
            const comboPeak = (function(){
                if (gameState && typeof gameState.comboPeak === 'number') return gameState.comboPeak;
                if (gameState && gameState.finalMetrics && typeof gameState.finalMetrics.maxComboReached === 'number') return gameState.finalMetrics.maxComboReached;
                if (gameMetrics && typeof gameMetrics.maxComboReached === 'number') return gameMetrics.maxComboReached;
                if (gameState && typeof gameState.combo === 'number') return Math.max(0, Math.min(gameState.maxCombo||25, gameState.combo));
                return 0;
            })();
            
            // 創建遊戲記錄
            const gameRecord = {
                id: Date.now(), // 唯一ID
                score: score,
                difficulty: gameState.difficulty,
                date: new Date().toLocaleDateString('zh-TW'),
                time: timeString,
                completed: gameState.gameCompleted,
                correctAnswers: gameState.totalCorrectAnswers,
                totalQuestions: gameState.totalQuestions,
                totalMistakes: gameState.totalMistakes,
                levelResults: { ...gameState.levelResults },
                range: isEquipRun ? null : gameState.range,
                testament: isEquipRun ? null : gameState.testament,
                customBooks: isEquipRun ? [] : (Array.isArray(gameState.customBooks) ? [...gameState.customBooks] : []),
                playMode: isEquipRun ? 'equip' : gameState.playMode,
                // include closing verse chosen at game end so record view shows identical verse
                closingVerse: gameState.closingVerse || null,
                closingVerseRef: gameState.closingVerseRef || null,
                // persist transient fields to allow exact replay of breakdown
                hintsRemaining: gameState.hintsRemaining != null ? gameState.hintsRemaining : null,
                totalHints: (function(){ const hintCounts = { easy: 3, normal: 3, hard: 3 }; return hintCounts[gameState.difficulty] || null; })(),
                showTimeReward: gameState.showTimeReward === true,
                timeReward: (typeof gameState.timeReward === 'number') ? gameState.timeReward : null,
                usedHintsCount: (gameState.usedHints ? gameState.usedHints.size : 0),
                // persist combo summary for record view (peak + accumulated bonus)
                comboTotalBonus: (typeof gameState.comboTotalBonus === 'number') ? gameState.comboTotalBonus : 0,
                maxComboReached: comboPeak
            };
            // 預留平均用時與成就欄位（稍後 finalizeMetrics 評估後回填）
            try {
                if (gameState.finalMetrics && typeof gameState.finalMetrics.avgAnswerMs==='number') {
                    gameRecord.avgAnswerMs = gameState.finalMetrics.avgAnswerMs;
                    gameRecord.avgPerfectAnswerMs = gameState.finalMetrics.avgPerfectAnswerMs;
                    if (typeof gameState.finalMetrics.firstTryCorrectCount === 'number') {
                        gameRecord.perfectAnswerCount = gameState.finalMetrics.firstTryCorrectCount;
                    } else if (typeof gameState.finalMetrics.noHintCorrectCount === 'number') {
                        gameRecord.perfectAnswerCount = gameState.finalMetrics.noHintCorrectCount;
                    }
                    if (typeof gameState.finalMetrics.maxComboReached === 'number') gameRecord.maxComboReached = gameState.finalMetrics.maxComboReached;
                    // keep a shallow copy for record view helpers that look under finalMetrics on record
                    gameRecord.finalMetrics = {
                        maxComboReached: gameState.finalMetrics.maxComboReached,
                        avgAnswerMs: gameState.finalMetrics.avgAnswerMs,
                        avgPerfectAnswerMs: gameState.finalMetrics.avgPerfectAnswerMs,
                        firstTryCorrectCount: gameState.finalMetrics.firstTryCorrectCount,
                        noHintCorrectCount: gameState.finalMetrics.noHintCorrectCount
                    };
                }
            } catch(_) {}
            if (!Array.isArray(gameRecord.achievements)) gameRecord.achievements = (gameState.unlockedAchievements||[]).map(a=>({...a}));
            // attach signature for local anti-cheat
            try { const sig = __makeSignature(gameRecord); gameRecord.sig_ts = sig.ts; gameRecord.sig_hash = sig.hash; } catch(_) {}
            // 儲存題組快照（最小必要資訊以便重播）
            try {
                gameRecord.questionSnapshot = {
                    questionData: JSON.parse(JSON.stringify(gameState.questionData || [])),
                    levelResults: { ...gameState.levelResults },
                    totalQuestions: gameState.totalQuestions
                };
            } catch (e) {
                gameRecord.questionSnapshot = null;
            }
            
            return gameRecord;
        }

    // 載入排行榜（線上優先；否則本機 localStorage）
    // Load leaderboard from online adapter or localStorage


// --- 系統穩定性優化：防止意外重整失效與背景暫停 (Visibility API) ---
(function() {
    function hasActiveGameSession() {
        try {
            if (typeof gameState === 'undefined' || !gameState) return false;
            if (gameState.gameCompleted) return false;
            const gameScreen = document.getElementById('gameScreen');
            if (!gameScreen || gameScreen.classList.contains('hidden')) return false;
            return !!(gameState.gameStartTime || gameState.equipRunning || gameState.playMode === 'classic' || gameState.playMode === 'survival');
        } catch(_) {
            return false;
        }
    }

    // 1. 防誤觸重整 / 離開網頁 (當遊戲正在進行中)
    window.addEventListener('beforeunload', (e) => {
        if (hasActiveGameSession()) {
            // Cancel the event and show generic browser prompt
            e.preventDefault();
            e.returnValue = ''; // 必須設定此屬性才能觸發對話框
        }
    });

    // 2. 分頁切換暫停時間流逝 (Visibility API)
    document.addEventListener('visibilitychange', () => {
        if (!hasActiveGameSession()) {
            return;
        }

        if (document.hidden) {
            // 退到背景：記錄暫停當下的 timestamp
            gameState._sysPauseTime = Date.now();
            // 嘗試停止畫面刷新與發送背景計時
            if (window.GameTimer && typeof window.GameTimer.pauseAll === 'function') {
                window.GameTimer.pauseAll();
            }
        } else {
            // 回到前景：恢復
            if (gameState._sysPauseTime) {
                const pausedFor = Math.max(0, Date.now() - gameState._sysPauseTime);
                
                // 平移所有遊戲內的關鍵時間起點，彷彿背景期間時間沒流動
                if (gameState.levelStartTime) gameState.levelStartTime += pausedFor;
                if (gameState.survivalStartTime) gameState.survivalStartTime += pausedFor;
                if (gameState.survivalLastTickAt) gameState.survivalLastTickAt += pausedFor;
                if (gameState.playStartTime) gameState.playStartTime += pausedFor;
                if (gameState.speedEventStartTs) gameState.speedEventStartTs += pausedFor;
                if (window.gameMetrics && window.gameMetrics.speedEventStartTs) {
                    window.gameMetrics.speedEventStartTs += pausedFor;
                }

                delete gameState._sysPauseTime;
                
                // 生存模式的剩餘時間是靠 interval 1000ms 觸發遞減的，
                // 因為我們暫停了 Timer interval，所以恢復即可，時間不會意外流失。
                if (window.GameTimer && typeof window.GameTimer.resumeAll === 'function') {
                    window.GameTimer.resumeAll();
                }
            }
        }
    });
})();

// Trigger game initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGame);
} else {
    initializeGame();
}
