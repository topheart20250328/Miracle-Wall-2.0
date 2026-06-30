// #region 裝備課程模組
        // ==== 裝備課程：資料載入與流程控制 ====
        async function loadEquipBank() {
            try {
                if (gameState.equipBank) return gameState.equipBank;
                const res = await fetch('equip-course-growth.json', { cache: 'no-store' });
                if (!res.ok) throw new Error('failed to fetch equip-course-growth.json');
                const json = await res.json();
                gameState.equipBank = json || {};
                return gameState.equipBank;
            } catch (e) {
                console.warn('[EQUIP] load failed', e);
                gameState.equipBank = { growth: [], disciple: [], leader: [] };
                return gameState.equipBank;
            }
        }

        function highlightSelectedEquipTier(tier) {
            try {
                ['equipTierGrowth','equipTierDisciple','equipTierLeader'].forEach(id => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    el.classList.remove('bg-purple-600','text-white','border-purple-600');
                    el.classList.add('border-purple-300','bg-white','text-purple-700');
                });
                if (!tier) return; // clear only
                const map = { growth: 'equipTierGrowth', disciple: 'equipTierDisciple', leader: 'equipTierLeader' };
                const target = document.getElementById(map[tier]);
                if (target) {
                    target.classList.remove('bg-white','text-purple-700','border-purple-300');
                    target.classList.add('bg-purple-600','text-white','border-purple-600');
                }
            } catch(_) {}
        }

        async function showEquipTierBankModal(tier){
            const stamp = Date.now();
            try {
                if (!tier){ console.warn('[EQUIP][BANK] 缺少 tier 參數', tier); return; }
                console.log('[EQUIP][BANK] open request', { tier, stamp });
                const bank = await loadEquipBank();
                const list = (bank && bank[tier]) || [];
                const modal = document.getElementById('equipTierBankModal');
                if (!modal){ console.warn('[EQUIP][BANK] 找不到 modal 節點'); return; }
                // 若被包在非 body 內，嘗試搬移至 body 以避免祖先 overflow/transform 影響
                try {
                    if (modal.parentElement !== document.body){
                        document.body.appendChild(modal);
                        console.log('[EQUIP][BANK] modal relocated to <body>');
                    }
                } catch(relErr){ console.warn('[EQUIP][BANK] relocate fail', relErr); }
                const title = modal.querySelector('#equipTierBankTitle');
                const meta = modal.querySelector('#equipTierBankMeta');
                const listEl = modal.querySelector('#equipTierBankList');
                const loadingEl = modal.querySelector('#equipTierBankLoading');
                if (loadingEl) loadingEl.textContent = '載入中…';
                if (title){
                    const mapLabel = { growth:'成長班題庫', disciple:'門徒班題庫', leader:'領袖班題庫' };
                    title.innerHTML = `<span class="align-middle">${mapLabel[tier]||'題庫'}</span>`;
                }
                if (meta){ meta.textContent = `共 ${list.length} 組經文`; }
                if (listEl){
                    listEl.innerHTML = '';
                    if (!list.length){
                        listEl.innerHTML = '<div class="text-center text-gray-400 text-sm py-6">無資料</div>';
                    } else {
                        const frag = document.createDocumentFragment();
                        list.forEach((item, idx) => {
                            const wrap = document.createElement('div');
                            wrap.className = 'p-3 md:p-4 rounded-xl bg-white/80 border border-purple-200 shadow-sm mb-3 hover:shadow-md transition';
                            const book = escapeEquipHtml(item.book || '');
                            const chap = escapeEquipHtml(item.chapter || '');
                            const full = escapeEquipHtml(item.full || '');
                            wrap.innerHTML = `<div class="flex items-start justify-between gap-2 mb-2">
                                <div class="font-bold text-purple-700 text-sm md:text-base">${idx+1}. ${book} <span class="text-purple-500 font-semibold">${chap}</span></div>
                            </div>
                            <div class="text-gray-700 text-sm leading-relaxed whitespace-pre-line">${full}</div>`;
                            frag.appendChild(wrap);
                        });
                        listEl.appendChild(frag);
                    }
                }
                // 先移除所有祖先上的 hidden 類（最多往上 5 層）
                try {
                    let a = modal; let hops=0;
                    while (a && hops < 5){
                        if (a.classList && a.classList.contains('hidden')){ a.classList.remove('hidden'); console.log('[EQUIP][BANK] removed hidden on ancestor', a.id || a.tagName); }
                        a = a.parentElement; hops++;
                    }
                } catch(_){ }
                // 使用現有 openModal 系統
                let opened = false;
                try {
                    if (window.openModal) {
                        opened = !!window.openModal('equipTierBankModal');
                        console.log('[EQUIP][BANK] openModal result', opened);
                    } else {
                        console.warn('[EQUIP][BANK] openModal 未定義');
                    }
                } catch(errOM) { console.warn('[EQUIP][BANK] openModal exception', errOM); opened = false; }
                if (!opened) {
                    // 保底：強制顯示 (inline style + 強制類)
                    modal.classList.remove('hidden');
                    modal.classList.add('force-show');
                    modal.style.display = 'flex';
                    modal.style.opacity = '1';
                    modal.style.pointerEvents = 'auto';
                    modal.style.zIndex = '260';
                    modal.setAttribute('aria-hidden','false');
                    console.log('[EQUIP][BANK] force-show fallback');
                    try { document.documentElement.style.overflow='hidden'; document.body.style.overflow='hidden'; } catch(_){ }
                }
                window.showEquipTierBankModal = showEquipTierBankModal; // debug / 後續可用
            } catch(e){ console.warn('[EQUIP] bank modal failed', e); }
        }
        // 全域後備委派：確保即使初始化早期錯誤，仍可開啟題庫視窗
        document.addEventListener('click', (e)=>{
            const btn = e.target && (e.target.closest ? e.target.closest('[data-equip-info]') : null);
            if (!btn) return;
            e.preventDefault(); e.stopPropagation();
            try { showEquipTierBankModal(btn.getAttribute('data-equip-info')); } catch(_) {}
        }, true);

        function showEquipUI(show) {
            try {
                const flow = document.getElementById('equipFlow');
                const carousel = document.getElementById('versesCarousel');
                if (flow) flow.classList.toggle('hidden', !show);
                if (carousel) carousel.classList.toggle('hidden', !!show);
                // Header layout adapt: fix question card width & prevent growth from long text
                try {
                    const header = document.getElementById('gameHeaderLayout');
                    const levelWrap = document.getElementById('levelProgressWrapper');
                    const scoreWrap = document.getElementById('scoreCardWrapper');
                    const qpWrap = document.getElementById('questionProgressWrapper');
                    const qpCard = document.getElementById('questionProgressCard');
                    if (header && levelWrap && scoreWrap && qpWrap && qpCard) {
                        if (show) {
                            header.classList.remove('flex','items-start','justify-between','gap-6');
                            header.classList.add('equip-header-equal');
                            [levelWrap, scoreWrap].forEach(w => { w.classList.add('equip-equal-card'); w.style.width='100%'; w.style.maxWidth='none'; });
                            qpWrap.classList.add('equip-equal-card');
                            qpWrap.classList.remove('hidden'); // Force show in equip mode (overriding md:flex requirement if on narrow screens)
                            // Remove md:flex md:justify-end logic temporarily for equal columns
                            qpWrap.classList.remove('md:flex','md:justify-end');

                            qpWrap.style.width='360px'; // Set fixed width but allow resizing by grid
                            qpWrap.style.maxWidth='360px';
                            qpCard.classList.add('equip-mode-wrap');
                            qpCard.style.width='100%';
                            qpCard.style.maxWidth='100%';
                            qpCard.style.wordBreak='break-word';
                            qpCard.style.overflowWrap='break-word';
                            qpCard.style.whiteSpace='normal';
                        } else {
                            header.classList.add('flex','items-start','justify-between','gap-6');
                            header.classList.remove('equip-header-equal');
                            [levelWrap, scoreWrap, qpWrap].forEach(w => { w.classList.remove('equip-equal-card'); w.style.width=''; w.style.maxWidth=''; });
                            
                            // Restore visibility classes for standard mode
                            qpWrap.classList.add('hidden','md:flex','md:justify-end'); 
                            
                            qpCard.classList.remove('equip-mode-wrap');
                            qpCard.style.width=''; qpCard.style.maxWidth='';
                        }
                    }
                } catch(_) {}
                // 同時隱藏/顯示配對面板內的標題與按鈕群，避免殘留空白
                try {
                    const front = document.querySelector('#versesCarousel .panel-front');
                    const back = document.querySelector('#versesCarousel .panel-back');
                    if (front) front.classList.toggle('hidden', !!show);
                    if (back) back.classList.toggle('hidden', !!show);
                } catch(_) {}
                // 額外：當裝備顯示時，移除任何由面板造成的額外 margin/padding 影響
                try {
                    const container = document.querySelector('#versesCarousel');
                    if (container) {
                        if (show) {
                            container.style.margin = '0';
                            container.style.padding = '0';
                            container.style.minHeight = '0';
                        } else {
                            container.style.margin = '';
                            container.style.padding = '';
                            container.style.minHeight = '';
                        }
                    }
                } catch(_) {}
            } catch(_) {}
        }

        try { window.showEquipUI = showEquipUI; } catch(_) {}

    // 闖關 / 生存 模式套用與裝備課程相同的等寬卡片版型
        function setUnifiedHeaderLayout(apply) {
            try {
                const header = document.getElementById('gameHeaderLayout');
                const levelWrap = document.getElementById('levelProgressWrapper');
                const scoreWrap = document.getElementById('scoreCardWrapper');
                const qpWrap = document.getElementById('questionProgressWrapper');
                if (!header || !levelWrap || !scoreWrap || !qpWrap) return;
                if (apply) {
                    header.classList.add('equip-header-equal');
                    header.classList.remove('flex','items-start','justify-between','gap-6');
                    [levelWrap, scoreWrap, qpWrap].forEach(w=>{ if (!w) return; w.classList.add('equip-equal-card'); w.style.width='100%'; w.style.maxWidth='none'; });
                    const c = document.getElementById('centerScore'); if (c) c.classList.add('text-center');
                    // Explicitly unhide qpWrap for equip mode unified layout
                    if (qpWrap) {
                        qpWrap.classList.remove('hidden','md:flex','md:justify-end'); 
                    }
                } else {
                    header.classList.remove('equip-header-equal');
                    header.classList.add('flex','items-start','justify-between','gap-6');
                    [levelWrap, scoreWrap, qpWrap].forEach(w=>{ if (!w) return; w.classList.remove('equip-equal-card'); w.style.width=''; w.style.maxWidth=''; });
                    // Restore qpWrap standard visibility
                    if (qpWrap) {
                        qpWrap.classList.add('hidden','md:flex','md:justify-end');
                    }
                }
            } catch(_) {}
        }

        function updateEquipStageBadge(text) {
            const badge = document.getElementById('equipStageBadge');
            if (badge) badge.textContent = text || '';
        }
        function updateEquipPhaseStepper(step) {
            try {
                const root = document.getElementById('equipStepProgress');
                if (!root) return;
                const activeStep = Math.max(0, Math.min(3, Number(step) || 0));
                const dots = Array.from(root.querySelectorAll('.equip-step-dot[data-step]'));
                const lines = Array.from(root.querySelectorAll('.equip-step-line'));
                dots.forEach((dot, i) => {
                    const n = i + 1;
                    dot.classList.remove('is-active', 'is-done');
                    if (n < activeStep) dot.classList.add('is-done');
                    else if (n === activeStep) dot.classList.add('is-active');
                });
                lines.forEach((line, i) => {
                    line.classList.toggle('is-done', (i + 1) < activeStep);
                });
            } catch(_) {}
        }
        function updateEquipSubtitle(text) {
            const el = document.getElementById('equipSubtitle');
            if (el) el.textContent = text || '';
        }
        function getEquipEffectRect(targetEl) {
            try {
                if (!targetEl || typeof targetEl.getBoundingClientRect !== 'function') return null;
                const rect = targetEl.getBoundingClientRect();
                if (!rect) return null;
                const w = Number(rect.width || 0);
                const h = Number(rect.height || 0);
                const l = Number(rect.left || 0);
                const t = Number(rect.top || 0);
                if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(t)) return null;
                if (w < 6 || h < 6) return null;
                // 避免偶發 0,0 / 脫離 viewport 的假座標導致特效跑到左上角
                if (l <= -w || t <= -h || l >= window.innerWidth || t >= window.innerHeight) return null;
                return rect;
            } catch(_) { return null; }
        }
        function updateEquipStageHeader() {
            try {
                const phase = Number(gameState.equipPhase || 0);
                const entry = gameState.currentEquipEntry || {};
                const total = Array.isArray(entry.verses) ? entry.verses.length : 0;
                const picked = Math.max(0, Math.min(total, Number(gameState.equipExpectedIndex || 0)));
                let text = '📘 裝備課程';
                if (phase === 1) text = '🎲 階段 1 · 抽卷';
                else if (phase === 2) text = '🧭 階段 2 · 選章';
                else if (phase === 3) text = `✨ 階段 3 · 排序 ${picked}/${total || '—'}`;
                updateEquipStageBadge(text);
            } catch(_) {}
        }
        function escapeEquipHtml(value) {
            const s = value == null ? '' : String(value);
            return s
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
        function setEquipContent(html) {
            const wrap = document.getElementById('equipContent');
            if (wrap) { wrap.innerHTML = html || ''; }
        }

        // Lock/unlock interactions within Equip content area and hint button
        function setEquipInteractionLock(lock) {
            try {
                const wrap = document.getElementById('equipContent');
                if (wrap) wrap.style.pointerEvents = lock ? 'none' : '';
                const hintBtn = document.getElementById('hintBtn');
                if (hintBtn) {
                    if (lock) {
                        if (!hintBtn.dataset.equipLocked) hintBtn.dataset.equipLocked = '1';
                        hintBtn.disabled = true;
                        hintBtn.classList.add('opacity-50', 'cursor-not-allowed');
                    } else {
                        if (hintBtn.dataset.equipLocked === '1') {
                            delete hintBtn.dataset.equipLocked;
                            if (gameState.hintsRemaining > 0) {
                                hintBtn.disabled = false;
                                hintBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                            }
                        }
                    }
                }
            } catch(_) { /* non-fatal */ }
        }

        function equipUpdateProgressUI() {
            try {
                // Reuse existing ovals, driven by gameState.currentLevel and getLevelCount()
                updateLevelOvals();
            } catch(_) {}
        }

                // Ensure small CSS for equip UI (overlay + clamp progress card on desktop)
                function ensureEquipUIStyles() {
                        if (document.getElementById('equipUIStyles')) return;
                        const style = document.createElement('style');
                        style.id = 'equipUIStyles';
                        style.textContent = `
@media (min-width: 641px) {
    #questionProgressCard { overflow: visible; max-height:none; }
    #questionProgressCard #adaptiveStatusText { white-space: normal; overflow: visible; display:block; }
    .equip-flash-green { color:#15803d !important; transition: color .6s ease; }
    .equip-flash-red { color:#b91c1c !important; transition: color .6s ease; }
}
    .equip-verse-overlay { position: fixed; inset: 0; display: flex; align-items: flex-end; justify-content: center; z-index: 10050; pointer-events: none; padding-bottom: max(16px, env(safe-area-inset-bottom, 0px)); }
    .equip-verse-bubble { max-width: min(1000px, 94vw); margin: 0 12px 10px; background: rgba(255,255,255,0.98); border: 3px solid #D8B4FE; box-shadow: 0 24px 70px rgba(124,58,237,0.28); border-radius: 20px; padding: 18px 16px; color: #4C1D95; font-weight: 800; font-size: clamp(16px, 2.8vw, 24px); line-height: 1.45; text-align: center; transform: translateY(8px) scale(0.98); opacity: 0; transition: opacity .32s ease, transform .32s ease; }
    .equip-verse-overlay.show .equip-verse-bubble { opacity: 1; transform: translateY(0) scale(1); }
.equip-verse-bubble small { display:block; margin-top: 8px; font-size: 0.7em; color: #6B21A8; font-weight: 700; }
`;
                        document.head.appendChild(style);
                }

        // Start an equip course for the given tier
        async function startEquipCourse(tier) {
            // Set non-ranking flag immediately
            gameState.nonRankingRun = true;
            gameState.equipRunning = true;
            gameState.equipTier = tier;
            // 若原本切換進裝備課程後返回，維持不選模式狀態
            gameState.playMode = null; // 不自動回復 classic
            try { document.body.classList.add('equip-running'); } catch(_) {}
            // Clear any prior replay/equip end flags to ensure a fresh session
            gameState.skipLeaderboardOnComplete = false;
            gameState.replaySourceRecord = null;
            delete gameState.__equipFinished;
            delete gameState.__equipHandoffLocked;
            delete gameState.__equipEnding;
            try { setLevelInteractionLock(false); } catch(_) {}
            try { setEquipInteractionLock(false); } catch(_) {}
            ensureEquipUIStyles();
            // Reset shared game state and show game screen
            hideAllScreens();
            document.getElementById('gameScreen').classList.remove('hidden');
            // 每次進入裝備課程時重置滑動面板位置到前段（左側）
            try {
                const carousel = document.getElementById('versesCarousel');
                if (carousel) {
                    carousel.scrollTo({ left: 0, behavior: 'auto' });
                }
            } catch(_) {}
            try { const m = document.getElementById('menuBrandCorner'); if (m) m.style.display = 'none'; } catch(_) {}
            // Reset core state similar to actuallyStartGame but tailored
            gameState.currentLevel = 1;
            gameState.currentQuestion = 1;
            gameState.score = 0;
            gameState.hintsUsed = 0;
            gameState.levelPerfect = true;
            gameState.usedHints = new Set();
            // Clear pairing-mode question data to avoid hint handler targeting old elements
            gameState.questionData = [];
            gameState.questionAttempts = [];
            gameState.gameStartTime = Date.now();
            gameState.gameCompleted = false;
            gameState.totalCorrectAnswers = 0;
            gameState.totalQuestions = 0;
            gameState.totalMistakes = 0;
            gameState.levelResults = {};
            gameState.levelEndHandled = false;
            gameState.combo = 0; gameState.comboProgress = 0; gameState.comboTotalBonus = 0; gameState.comboPeak = 0;
            try { if (gameState.comboDecayTimer) { clearTimeout(gameState.comboDecayTimer); gameState.comboDecayTimer = null; } } catch(_) {}
            if (!gameState.difficulty) gameState.difficulty = 'easy';
            // Time reward visible as usual
            gameState.showTimeReward = true;
            updateTimeRewardVisibility && updateTimeRewardVisibility();
            // Render mobile mini ovals
            // Mode label
            try { const modeEl = document.getElementById('gameModeDisplay'); if (modeEl) modeEl.textContent = '裝備課程'; } catch(_) {}
            try { updateEquipPhaseStepper(0); } catch(_) {}
            // Disable survival UI
            try { const card = document.getElementById('survivalTimerCard'); if (card) card.classList.add('hidden'); stopSurvivalTimer(); } catch(_) {}
            // Ensure hint/back proxies are wired
            try {
                const proxyHint = document.getElementById('adaptiveHintBtn');
                const realHint = document.getElementById('hintBtn');
                if (proxyHint && realHint) proxyHint.onclick = () => realHint.click();
                const proxyBack = document.getElementById('adaptiveBackBtn');
                const realBack = document.getElementById('backToMenuFromGame');
                if (proxyBack && realBack) proxyBack.onclick = () => realBack.click();
                // Override hint behavior in equip using capture phase to intercept the default useHint
                if (realHint && !realHint.__equipBound) {
                    realHint.addEventListener('click', (ev) => {
                        if (gameState.equipRunning) {
                            ev.stopPropagation(); ev.preventDefault();
                            equipUseHint();
                        }
                    }, true);
                    realHint.__equipBound = true;
                }
            } catch(_) {}

            // Load equip bank and initialise tier-specific arrays
            const bank = await loadEquipBank();
            const tierList = (bank && bank[tier]) ? [...bank[tier]] : [];
            // Enforce unique-by-book sampling: group by book, then pick up to 10 distinct books randomly
            const byBook = new Map();
            tierList.forEach(e => {
                if (!e || !e.book) return;
                if (!byBook.has(e.book)) byBook.set(e.book, []);
                byBook.get(e.book).push(e);
            });
            const uniqueBooks = Array.from(byBook.keys());
            // shuffle books
            for (let i = uniqueBooks.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [uniqueBooks[i], uniqueBooks[j]] = [uniqueBooks[j], uniqueBooks[i]];
            }
            const pickCount = Math.min(10, uniqueBooks.length);
            const sampled = [];
            // 第一輪：每本書先挑一題（覆蓋盡量多書卷）
            for (let i = 0; i < pickCount; i++) {
                const b = uniqueBooks[i];
                const entries = byBook.get(b) || [];
                const idx = Math.floor(Math.random() * entries.length);
                const chosen = entries[idx];
                if (chosen) sampled.push(chosen);
            }
            // 若書卷數不足 10（例如領袖班目前只有 9 個獨特書卷），以剩餘題庫補滿到 10 題
            if (sampled.length < 10) {
                try {
                    const already = new Set(sampled.map(e => `${e.book}|${e.chapter}`));
                    const allEntries = Array.from(byBook.values()).flat();
                    // 剩餘候選（允許同書卷不同章節）
                    const remain = allEntries.filter(e => !already.has(`${e.book}|${e.chapter}`));
                    // 打散
                    for (let i = remain.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [remain[i], remain[j]] = [remain[j], remain[i]];
                    }
                    for (const r of remain) {
                        if (sampled.length >= 10) break;
                        sampled.push(r);
                    }
                } catch(_) {}
            }
            // 最終再洗牌一次，避免補題集中在後段產生分組感
            for (let i = sampled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [sampled[i], sampled[j]] = [sampled[j], sampled[i]];
            }
            // 預先生成 fullRef（若缺失），以便使用標點對照表
            sampled.forEach(e => {
                try {
                    if (!e || e.fullRef || !e.book || !e.chapter || !Array.isArray(e.verses) || !e.verses.length) return;
                    const raws = e.verses.map(v => String(v).trim()).filter(Boolean);
                    if (!raws.length) return;
                    const parts = raws.map(r => { const mm = r.match(/^(\d+)([a-z])?$/i); return { raw:r, n:mm?parseInt(mm[1]):NaN, part:mm&&mm[2]?mm[2].toLowerCase():'' }; }).filter(o=>!isNaN(o.n));
                    if (!parts.length) return;
                    parts.sort((a,b)=>a.n-b.n);
                    const first = parts[0], last = parts[parts.length-1];
                    let ref = '';
                    if (parts.length === 1) ref = `${e.book} ${e.chapter}:${first.n}${first.part}`;
                    else ref = `${e.book} ${e.chapter}:${first.n}${first.part}-${last.n}${last.part}`;
                    e.fullRef = ref.toUpperCase();
                } catch(_) {}
            });
            gameState.equipRemaining = sampled;
            gameState.equipLevelCount = sampled.length > 0 ? sampled.length : 10; // fallback to 10 if empty (will be handled below)
            // Build distractor pool from the sampled set only
            gameState.equipDistractorPool = sampled.flatMap(e => (Array.isArray(e.verses) ? e.verses : []));

            // Show equip UI container; hide pairing carousel
            showEquipUI(true);
            // Progress UI
            equipUpdateProgressUI();
            // 若本班級題庫為空，顯示友善提示並中止流程（避免畫面空白）
            if (!Array.isArray(gameState.equipRemaining) || gameState.equipRemaining.length === 0) {
                try {
                    updateEquipStageBadge('題庫未就緒');
                    updateEquipSubtitle('尚未載入裝備課程題庫或題庫為空');
                    setEquipContent('<div class="bg-amber-50 border-2 border-amber-200 text-amber-800 p-4 rounded-xl">⚠️ 無可用題庫：請確認 equip-course-*.json 已放置於專案根目錄，或稍後再試。</div>');
                } catch(_) {}
                return;
            }
            // Begin phase 1
            startEquipLevel();
        }

        try { window.startEquipCourse = startEquipCourse; } catch(_) {}

        // Equip-mode hint: briefly highlight the correct option for current phase
        function equipUseHint() {
            try {
                const hintBtn = document.getElementById('hintBtn');
                if (!hintBtn) return;
                if (gameState.hintsRemaining <= 0) return;
                // consume one
                gameState.hintsRemaining = Math.max(0, (gameState.hintsRemaining|0) - 1);
                try { updateGameUI && updateGameUI(); } catch(_) {}
                hintBtn.disabled = true; hintBtn.classList.add('opacity-50','cursor-not-allowed');
                // mark used-hint for this level
                try { if (gameState.usedHints && typeof gameState.usedHints.add === 'function') gameState.usedHints.add(`equip|${gameState.currentLevel}`); } catch(_) {}

                let target = null;
                if (gameState.equipPhase === 2) {
                    target = document.querySelector('#equipContent .chapter-option[data-correct="1"]');
                } else if (gameState.equipPhase === 3) {
                    target = document.querySelector(`#equipContent .sorter-option[data-correct="1"][data-idx="${gameState.equipExpectedIndex}"]`);
                }
                if (target) {
                    target.classList.add('hint-flash');
                    setTimeout(() => {
                        try { target.classList.remove('hint-flash'); } catch(_) {}
                        if (gameState.hintsRemaining > 0) { hintBtn.disabled = false; hintBtn.classList.remove('opacity-50','cursor-not-allowed'); }
                    }, 2000);
                } else {
                    // no target, re-enable quickly if more hints remain
                    setTimeout(() => { if (gameState.hintsRemaining > 0) { hintBtn.disabled = false; hintBtn.classList.remove('opacity-50','cursor-not-allowed'); } }, 400);
                }
            } catch(_) {}
        }
        try { window.setUnifiedHeaderLayout = setUnifiedHeaderLayout; } catch(_) {}

        function startEquipLevel() {
            // Release any prior handoff/input locks for the new level
            try { setEquipInteractionLock(false); } catch(_) {}
            delete gameState.__equipHandoffLocked;
            // Reset per-level timer and state
            gameState.levelStartTime = Date.now();
            gameState.levelPerfect = true;
            gameState.equipLevelMistakes = 0;
            gameState.equipExpectedIndex = 0;
            gameState.equipBookRevealed = false;
            gameState.equipChapterRevealed = false;
            // Ensure hint count reset per level like normal
            const hintCounts = { easy: 3, normal: 3, hard: 3 };
            gameState.hintsRemaining = hintCounts[gameState.difficulty] ?? 3;
            try { updateHintButton(); } catch(_) {}
            // Phase 1: 書卷抽選 slot-machine 動畫
            gameState.equipPhase = 1;
            updateEquipStageHeader();
            updateEquipPhaseStepper(1);
            updateEquipSubtitle('書卷抽選中…');
            try {
                updateAdaptiveStatus();
            } catch(_) {}
            const idx = Math.max(0, (gameState.currentLevel|0) - 1);
            let entry = gameState.currentEquipEntry || gameState.equipRemaining[idx];
            // 若上一關的書卷相同，嘗試換一題（避免連續抽到同卷造成重複）
            try {
                if (entry && gameState.equipLastBook && entry.book === gameState.equipLastBook) {
                    // 找到下一個不同書卷的關卡，並與目前 index 交換，避免後續關卡重複使用
                    const list = Array.isArray(gameState.equipRemaining) ? gameState.equipRemaining : [];
                    const altIndex = list.findIndex((e, i) => i !== idx && e && e.book !== gameState.equipLastBook);
                    if (altIndex >= 0) {
                        const alt = list[altIndex];
                        list[altIndex] = list[idx];
                        list[idx] = alt;
                        entry = alt;
                    }
                }
            } catch(_) {}
            gameState.currentEquipEntry = entry || null;
            const contentWrap = document.getElementById('equipContent');
            if (contentWrap) contentWrap.innerHTML = '';
            const reelWrap = document.createElement('div');
            reelWrap.className = 'equip-slot-wrap w-full overflow-hidden py-6 relative';
            const reel = document.createElement('div');
            reel.className = 'equip-slot-reel flex gap-5 will-change-transform';
            let books = (gameState.booksList && gameState.booksList.length) ? gameState.booksList : Object.keys(gameState.versesByBook || {});
            // 後備：若仍無書卷清單，使用內建舊/新約清單
            if (!Array.isArray(books) || books.length === 0) {
                try { books = [...bibleBooks.old, ...bibleBooks.new]; } catch(_) { books = []; }
            }
            const sequence = [];
            for (let k = 0; k < 6; k++) sequence.push(...books);
            sequence.forEach(b => {
                const item = document.createElement('div');
                item.className = 'equip-slot-item min-w-[112px] select-none text-center px-4 py-2 rounded-2xl border border-indigo-200 bg-white shadow-sm font-semibold text-slate-700 transition-all duration-300 ease-out';
                item.textContent = b;
                reel.appendChild(item);
            });
            reelWrap.appendChild(reel);
            if (contentWrap) contentWrap.appendChild(reelWrap);
            if (typeof startLevelTimer === 'function') startLevelTimer();
            const target = entry ? entry.book : '';
            const itemWidth = 112 + 20;
            const wrapWidth = () => reelWrap.clientWidth || 320;
            let startIdx = Math.floor(Math.random() * books.length);
            let pos = startIdx * itemWidth;
            reel.style.transform = `translateX(-${pos}px)`;
            let t = 0;
            const fast = setInterval(() => {
                t += 1; pos += itemWidth * 0.9; reel.style.transform = `translateX(-${pos}px)`;
                if (t > 14) {
                    clearInterval(fast);
                    let idx = sequence.indexOf(target, books.length * 2);
                    if (idx < 0) idx = Math.max(0, Math.floor(sequence.length / 2));
                    const targetEl = reel.children[idx];
                    // Fallback: if target element missing, abort animation gracefully
                    if (!targetEl) {
                        gameState.equipBookRevealed = true;
                        renderEquipPhase2();
                        return;
                    }
                    // Compute precise offset so target's center = wrap center
                    const calcOffset = () => {
                        const w = wrapWidth();
                        const off = targetEl.offsetLeft + (targetEl.offsetWidth / 2) - (w / 2);
                        return Math.max(0, off);
                    };
                    let centerOffset = calcOffset();
                    // Ease-out longer for more anticipation
                    reel.style.transition = 'transform 1100ms cubic-bezier(.16,.84,.3,1)';
                    requestAnimationFrame(() => { reel.style.transform = `translateX(-${centerOffset}px)`; });
                    setTimeout(() => {
                        for (let i = 0; i < reel.children.length; i++) reel.children[i].classList.remove('slot-picked');
                        targetEl.classList.add('slot-picked');
                        targetEl.style.transition = 'transform 480ms cubic-bezier(.2,.9,.2,1), background-color 480ms ease, box-shadow 480ms ease, color 480ms ease';
                        targetEl.style.boxShadow = '0 10px 28px rgba(245,158,11,0.35), 0 0 0 4px rgba(245,158,11,0.25)';
                        // After scale applied, recalc to fine-center (especially on mobile where scale changes width)
                        setTimeout(() => {
                            try {
                                reel.style.transition = 'transform 420ms cubic-bezier(.2,.9,.2,1)';
                                centerOffset = calcOffset();
                                reel.style.transform = `translateX(-${centerOffset}px)`;
                            } catch(_) {}
                        }, 80);
                        // 顯示停留時間，讓玩家更容易看到抽中的書卷名稱
                        try {
                            gameState.equipBookRevealed = true;
                            updateEquipSubtitle(`抽中：${target}`);
                updateAdaptiveStatus();
                        } catch(_) {}
                        // 記錄本關書卷，避免下一關重複
                        try { gameState.equipLastBook = target || null; } catch(_) {}
                        const pauseMs = 1100; // 稍微延長停留
                        setTimeout(() => {
                            renderEquipPhase2();
                        }, pauseMs);
                    }, 750);
                }
            }, 40);
        }

        // Phase 2: 章節五選一（1 正確 + 4 同班級干擾）
        function renderEquipPhase2() {
            gameState.equipPhase = 2;
            updateEquipStageHeader();
            updateEquipPhaseStepper(2);
            updateEquipSubtitle('選擇章節');
            try {
                updateAdaptiveStatus();
            } catch(_) {}
            const entry = gameState.currentEquipEntry;
            if (!entry) { return completeEquipOrNext(); }
            // Build candidates: correct + 4 others from same tier but different (book,chapter)
            const all = gameState.equipRemaining;
            const others = all.filter(x => x !== entry);
            const shuffled = [...others].sort(() => Math.random() - 0.5).slice(0, 4);
            const options = [...shuffled, entry].sort(() => Math.random() - 0.5);
            gameState.equipPhase2Attempts = 3; // cap attempts for chapter selection
            const html = options.map((opt, idx) => {
                const label = escapeEquipHtml(`${opt.chapter}`); // 只顯示章節，不顯示書卷
                // 增加 data-enter-* 以套用進場動畫（沿用 card-enter 樣式）
                const dx = Math.round((Math.random()*120)+60);
                const dy = Math.round((Math.random()*16)-8);
                const delay = Math.round(idx * 40 + Math.random()*60);
                const dur = Math.round(420 + Math.random()*260);
                return `<button class="cute-button w-full bg-white border-2 border-purple-200 text-purple-800 py-3 rounded-xl chapter-option card-enter" style="--enterX:${dx}px; --enterY:${dy}px; --enterDelay:${delay}ms; --enterDur:${dur}ms; --enterR:0deg" data-correct="${opt===entry?'1':'0'}" data-idx="${idx}">${label}</button>`;
            }).join('');
            setEquipContent(`<div class="grid grid-cols-1 md:grid-cols-2 gap-3">${html}</div>`);
            // Bind handlers
            document.querySelectorAll('.chapter-option').forEach(btn => {
                btn.addEventListener('click', () => handleEquipChapterChoice(btn));
                btn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); handleEquipChapterChoice(btn); } });
            });
        }

        function handleEquipChapterChoice(btn) {
            if (gameState.__equipHandoffLocked || gameState.__equipFinished) return;
            const correct = btn.getAttribute('data-correct') === '1';
            if (correct) {
                try { SFX.play('correct'); } catch(_) {}
                // 粒子特效（正向）
                try {
                    const r = getEquipEffectRect(btn);
                    if (r) triggerEquipCorrectBurst(r);
                    spawnScoreParticles(80, r, { colors:['#EDE9FE','#DDD6FE','#C4B5FD','#A78BFA','#FBCFE8','#F5D0FE'], count:10, distanceMin:40, distanceMax:120, durationMs:1400 });
                } catch(_) {}
                // Base scoring + time reward using same rules as handleChapterClick
                const mistakeCount = gameState.equipLevelMistakes | 0;
                const inPractice = !!gameState.range;
                const rarityBaseMap = { common: 100, rare: 125, all: 150 };
                const basePerQuestion = inPractice ? 100 : (rarityBaseMap[gameState.rarity] || 100);
                const baseCore = basePerQuestion - (mistakeCount * 50);
                const mult = getComboMultiplier(gameState.combo);
                const baseClamped = Math.max(0, baseCore);
                const baseWithCombo = Math.round(baseClamped * mult);
                let timeRewardScore = 0;
                if (gameState.showTimeReward) timeRewardScore = updateCurrentScore();
                const totalScore = baseWithCombo + timeRewardScore;
                const comboBonus = Math.max(0, baseWithCombo - baseClamped);
                gameState.comboTotalBonus += comboBonus;
                gameState.score += totalScore;
                gameState.totalCorrectAnswers++;
                gameState.totalQuestions = (gameState.totalQuestions|0) + 1;
                addComboOnCorrect();
                btn.classList.add('bg-green-100','border-green-300','equip-correct-hold');
                // 延長保持：移除彈跳改為持續高亮
                try { setTimeout(()=>{ btn.classList.remove('equip-correct-hold'); }, 1400); } catch(_) {}
                // 鎖定其他按鈕並淡出灰階
                try {
                    document.querySelectorAll('.chapter-option').forEach(b=>{
                        if (b!==btn) {
                            b.disabled = true; b.classList.add('equip-fade-disabled');
                            b.style.transition = 'opacity 360ms ease, filter 360ms ease';
                        } else { b.disabled = true; }
                    });
                } catch(_) {}
                showScoreAnimation(`+${totalScore}分`, false, btn);
                // reset timer for next phase
                try { gameState.levelStartTime = Date.now(); gameState.__comboDroppedForTimeout = false; } catch(_) {}
                try { equipProgressPulse(true); } catch(_) {}
                try { gameState.equipChapterRevealed = true; } catch(_) {}
                // proceed to phase 3
                gameState.__equipHandoffLocked = true;
                try { setEquipInteractionLock(true); } catch(_) {}
                setTimeout(() => { try { setEquipInteractionLock(false); } catch(_) {} delete gameState.__equipHandoffLocked; renderEquipPhase3(); }, 300);
            } else {
                try { SFX.play('wrong'); } catch(_) {}
                // 粒子特效（負向小爆）
                try {
                    const r = getEquipEffectRect(btn);
                    spawnScoreParticles(-30, r, { colors:['#FECACA','#FCA5A5','#F87171','#EF4444'], count:6, distanceMin:24, distanceMax:90, durationMs:900 });
                } catch(_) {}
                gameState.equipLevelMistakes++;
                gameState.levelPerfect = false;
                gameState.totalMistakes++;
                showScoreAnimation('-50', false, btn);
                dropCombo(3);
                // 錯誤：震動 + 小型掉落散開（不移除按鈕，只做視覺暗示）
                btn.classList.remove('shake-error'); void btn.offsetWidth; btn.classList.add('equip-wrong-pulse'); setTimeout(()=>btn.classList.remove('equip-wrong-pulse'), 700);
                // 更明顯錯誤：背景暫時轉淡紅
                try { btn.classList.add('bg-red-50','border-red-300'); setTimeout(()=>{ btn.classList.remove('bg-red-50'); }, 900); } catch(_) {}
                try { equipProgressPulse(false); } catch(_) {}
                // 限制此階段 3 次嘗試，失敗則此關失敗並重啟 Phase 1（重新抽卷）
                gameState.equipPhase2Attempts = Math.max(0, (gameState.equipPhase2Attempts|0) - 1);
                if (gameState.equipPhase2Attempts <= 0) {
                    // 失敗：所有按鈕灰階鎖定
                    try { document.querySelectorAll('.chapter-option').forEach(b=>{ b.disabled=true; b.classList.add('equip-fade-disabled'); }); } catch(_) {}
                    // 用盡失誤機會且最後一次也選錯：判定該關失敗，立即消耗本關並前往下一關
                    const entry = gameState.currentEquipEntry;
                    gameState.levelResults[gameState.currentLevel] = 'failed';
                    try { if (entry && entry.book) gameState.equipLastBook = entry.book; } catch(_) {}
                    gameState.currentEquipEntry = null;
                    try { triggerLevelEffect('failed'); } catch(_) {}
                    // 在階段 2 失敗時顯示紅色完整經文 Toast
                    try { if (entry) showEquipAssembledVerse(entry, false); } catch(_) {}
                    // 更新進度並切到下一關（由 equip 流程控管）
                    gameState.__equipHandoffLocked = true;
                    try { setEquipInteractionLock(true); } catch(_) {}
                    setTimeout(() => { completeEquipOrNext(); }, 600);
                }
            }
        }

        // Phase 3: 排序經文（單一五按鈕區；每步最多展示 5 個片段，其中 1..5 個是正確序列的下一段或往後的段落，其餘同階級干擾）
        function renderEquipPhase3() {
            gameState.equipPhase = 3;
            updateEquipStageHeader();
            updateEquipPhaseStepper(3);
            updateEquipSubtitle('排序經文');
            try {
                updateAdaptiveStatus();
            } catch(_) {}
            // Reset per-step attempts
            gameState.equipStepAttempts = 3;
            // Build initial five buttons
            drawEquipSorterButtons();
        }

        function drawEquipSorterButtons() {
            const entry = gameState.currentEquipEntry;
            if (!entry || !Array.isArray(entry.verses)) { return completeEquipOrNext(); }
            const nextIdx = gameState.equipExpectedIndex | 0;
            // visible options max 5
            const maxButtons = 5;
            // Always include the next correct fragment
            const options = [];
            const corrects = [];
            for (let i = nextIdx; i < Math.min(entry.verses.length, nextIdx + maxButtons); i++) {
                corrects.push({ text: entry.verses[i], idx: i });
            }
            // Pick up to (maxButtons - corrects.length) distractors from pool excluding this entry's fragments
            const excludeSet = new Set(entry.verses);
            const distractorPool = (gameState.equipDistractorPool || []).filter(t => !excludeSet.has(t));
            const needDistractors = Math.max(0, maxButtons - corrects.length);
            const shuffledD = [...distractorPool].sort(() => Math.random() - 0.5).slice(0, needDistractors);
            const candidates = [...corrects.map(c => ({ t: c.text, correct: true, idx: c.idx })), ...shuffledD.map(t => ({ t, correct: false }))];
            const finalOptions = candidates.sort(() => Math.random() - 0.5).slice(0, maxButtons);
            const html = finalOptions.map((opt, i) => {
                const dx = Math.round((Math.random()*110)+40);
                const dy = Math.round((Math.random()*14)-7);
                const delay = Math.round(i * 36 + Math.random()*50);
                const dur = Math.round(400 + Math.random()*240);
                return `<button class="cute-button w-full bg-white border-2 border-indigo-200 text-indigo-800 py-3 rounded-xl sorter-option card-enter" style="--enterX:${dx}px; --enterY:${dy}px; --enterDelay:${delay}ms; --enterDur:${dur}ms; --enterR:0deg" data-correct="${opt.correct?'1':'0'}" data-idx="${opt.idx!=null?opt.idx:''}">${escapeEquipHtml(opt.t)}</button>`;
            }).join('');
            setEquipContent(`<div class="space-y-2">${html}</div>`);
            document.querySelectorAll('.sorter-option').forEach(btn => {
                btn.addEventListener('click', () => handleEquipSorterPick(btn));
                btn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); handleEquipSorterPick(btn); } });
            });
        }

    function handleEquipSorterPick(btn) {
            if (gameState.__equipHandoffLocked || gameState.__equipFinished) return;
            // 400ms 防連點鎖
            if (gameState.__equipSorterLockUntil && Date.now() < gameState.__equipSorterLockUntil) return;
            const isCorrect = btn.getAttribute('data-correct') === '1' && String(btn.getAttribute('data-idx')) === String(gameState.equipExpectedIndex);
            const __ansStart = gameState.currentQuestionStartTime || gameState.levelStartTime || Date.now();
            if (isCorrect) {
                try { SFX.play('correct'); } catch(_) {}
                try {
                    const r = getEquipEffectRect(btn);
                    if (r) triggerEquipCorrectBurst(r);
                    spawnScoreParticles(70, r, { colors:['#DBEAFE','#BFDBFE','#93C5FD','#60A5FA','#A5B4FC','#C7D2FE'], count:9, distanceMin:36, distanceMax:120, durationMs:1300 });
                } catch(_) {}
                // Score like a normal question (base 100 minus 50 per mistake this step; combo applies on base only; time reward adds)
                const mistakeCount = (3 - Math.max(0, gameState.equipStepAttempts)) | 0;
                const inPractice = !!gameState.range;
                const rarityBaseMap = { common: 100, rare: 125, all: 150 };
                const basePerQuestion = inPractice ? 100 : (rarityBaseMap[gameState.rarity] || 100);
                const baseCore = basePerQuestion - (mistakeCount * 50);
                const mult = getComboMultiplier(gameState.combo);
                const baseClamped = Math.max(0, baseCore);
                const baseWithCombo = Math.round(baseClamped * mult);
                let timeRewardScore = 0; if (gameState.showTimeReward) timeRewardScore = updateCurrentScore();
                const totalScore = baseWithCombo + timeRewardScore;
                const comboBonus = Math.max(0, baseWithCombo - baseClamped);
                gameState.comboTotalBonus += comboBonus;
                gameState.score += totalScore;
                gameState.totalCorrectAnswers++;
                gameState.totalQuestions = (gameState.totalQuestions|0) + 1;
                addComboOnCorrect();
                showScoreAnimation(`+${totalScore}分`, false, btn);
                // 高亮保留 + 星標 + 明確答對命中效果（與錯誤效果做區隔）
                btn.classList.add('equip-correct-hold','bg-green-100','border-green-300','equip-sorter-correct-hit');
                try { setTimeout(()=>btn.classList.remove('equip-sorter-correct-hit'), 780); } catch(_) {}
                try { setTimeout(()=>btn.classList.remove('equip-correct-hold'), 1500); } catch(_) {}
                // 其他尚未選取的 sorter-option 半透明處理（不禁用，保持互動僅限下一輪重新渲染）
                try { document.querySelectorAll('.sorter-option').forEach(b=>{ if (b!==btn) { b.style.transition='opacity 300ms ease, filter 300ms ease'; b.style.opacity='0.35'; b.style.filter='grayscale(70%)'; } }); } catch(_) {}
                // Advance expected index
                gameState.equipExpectedIndex++;
                updateEquipStageHeader();
                gameState.equipStepAttempts = 3; // reset attempts for next pick
                // reset timer like normal after a correct selection
                try { gameState.levelStartTime = Date.now(); gameState.__comboDroppedForTimeout = false; } catch(_) {}
                try { equipProgressPulse(true); } catch(_) {}
                try {
                updateAdaptiveStatus();
                } catch(_) {}
                // Completed all fragments? finish this level
                const entry = gameState.currentEquipEntry;
                if (entry && gameState.equipExpectedIndex >= entry.verses.length) {
                    // 顯示底部泡泡完整經文（含標點）
                    try { showEquipAssembledVerse(entry, true); } catch(_) {}
                    let overlayDone = null; // 保留變數以免後續流程破壞
                    // mark level result
                    if (gameState.equipLevelMistakes === 0) gameState.levelResults[gameState.currentLevel] = 'perfect';
                    else gameState.levelResults[gameState.currentLevel] = 'complete';
                    // 紀錄完成時的書卷，並清除當前 entry，以便下一關抽新卷
                    try { gameState.equipLastBook = entry.book || gameState.equipLastBook; } catch(_) {}
                    gameState.currentEquipEntry = null;
                    // Next level
                    gameState.__equipHandoffLocked = true;
                    try { setEquipInteractionLock(true); } catch(_) {}
                    const proceed = () => completeEquipOrNext();
                    const completeHoldMs = 900;
                    // If this is the last level, wait for overlayDone before proceeding to ensure display-before-settlement
                    try {
                        const isLast = (gameState.currentLevel >= getLevelCount());
                        if (isLast && overlayDone && typeof overlayDone.then === 'function') {
                            overlayDone.finally(() => setTimeout(proceed, completeHoldMs));
                        } else {
                            setTimeout(proceed, completeHoldMs);
                        }
                    } catch(_) { setTimeout(proceed, completeHoldMs); }
                } else {
                    // 每一步答對先保留命中特效，再進下一輪（避免看不出答對差異）
                    gameState.__equipHandoffLocked = true;
                    try { setEquipInteractionLock(true); } catch(_) {}
                    setTimeout(() => {
                        try { setEquipInteractionLock(false); } catch(_) {}
                        delete gameState.__equipHandoffLocked;
                        drawEquipSorterButtons();
                    }, 320);
                }
            } else {
                try { SFX.play('wrong'); } catch(_) {}
                try {
                    const r = getEquipEffectRect(btn);
                    spawnScoreParticles(-20, r, { colors:['#FECACA','#FCA5A5','#F87171'], count:5, distanceMin:20, distanceMax:70, durationMs:820 });
                } catch(_) {}
                gameState.equipStepAttempts = Math.max(0, (gameState.equipStepAttempts|0) - 1);
                gameState.totalMistakes++;
                gameState.levelPerfect = false;
                gameState.equipLevelMistakes++;
                showScoreAnimation('-50', false, btn);
                dropCombo(3);
                // 錯誤後 400ms 暫時鎖定輸入
                gameState.__equipSorterLockUntil = Date.now() + 400;
                // Out of attempts on this pick → treat as wrong progress (do not advance index), allow retry with fresh draw
                if (gameState.equipStepAttempts <= 0) {
                    // 用盡嘗試：直接判定失敗並進下一關（不再展示完整排序）
                    const entry = gameState.currentEquipEntry;
                    try { gameState.equipLastBook = entry && entry.book ? entry.book : gameState.equipLastBook; } catch(_) {}
                    gameState.currentEquipEntry = null;
                    gameState.levelResults[gameState.currentLevel] = 'failed';
                    gameState.__equipHandoffLocked = true;
                    try { setEquipInteractionLock(true); } catch(_) {}
                    // 在階段 3 失敗（排序失敗）時顯示紅色完整經文 Toast
                    try { if (entry) showEquipAssembledVerse(entry, false); } catch(_) {}
                    setTimeout(() => completeEquipOrNext(), 400);
                    return;
                }
                // shake + scatter fall feedback（不移除）
                btn.classList.remove('shake-error'); void btn.offsetWidth; btn.classList.add('equip-wrong-pulse'); setTimeout(()=>btn.classList.remove('equip-wrong-pulse'), 700);
                try { btn.classList.add('bg-red-50','border-red-300'); setTimeout(()=>btn.classList.remove('bg-red-50'), 1000); } catch(_) {}
                try { equipProgressPulse(false); } catch(_) {}
                try {
                updateAdaptiveStatus();
                } catch(_) {}
                // redraw options for the same expected index
                drawEquipSorterButtons();
            }
        }

        function __equipBuildOriginal(fullRef) {
            if (!fullRef || !window.__versesIndex) return '';
            const p = fullRef.trim().split(/\s+/);
            if (p.length < 2) return '';
            const book = p[0];
            const rest = p.slice(1).join('');
            const m = rest.match(/^(\d+):(\d+[a-z]?)(?:-(\d+[a-z]?))?$/i);
            if (!m) return '';
            const chapter = m[1];
            const svRaw = m[2];
            const evRaw = m[3] || svRaw;
            const parseV = v => { const mm = v.match(/^(\d+)([a-z])?$/i); return { n: mm?parseInt(mm[1]):NaN, part: mm && mm[2] ? mm[2].toLowerCase(): null }; };
            const sv = parseV(svRaw), ev = parseV(evRaw);
            if (isNaN(sv.n) || isNaN(ev.n)) return '';
            const out = [];
            for (let v = sv.n; v <= ev.n; v++) {
                const key = `${book}|${chapter}|${v}`;
                const rec = window.__versesIndex[key];
                if (!rec || !rec.text) continue;
                let t = rec.text.trim();
                if (v === sv.n && sv.part) t = t.replace(/^\(?[aA]\)?\s*/, '');
                if (v === ev.n && ev.part) {
                    const cut = t.split(/\([b-zB-Z]\)/)[0];
                    if (cut) t = cut.trim();
                }
                out.push(t);
            }
            return out.join(' ');
        }
        // showEquipAssembledVerse：改為以底部泡泡 Toast 方式短暫顯示完整（含標點）經文
        // entry: { book, chapter, verses[], full? }
        // ok: 是否顯示正向顏色（true 綠/藍；false 紅）
        (function(){
            // 建立/快取容器
            let toastHost = null;
            function ensureHost(){
                if (toastHost) return toastHost;
                toastHost = document.createElement('div');
                toastHost.id = 'equipVerseToastHost';
                toastHost.setAttribute('aria-live','polite');
                toastHost.style.position = 'fixed';
                toastHost.style.left = '0';
                toastHost.style.right = '0';
                // 增加底部間距避免被底部功能列覆蓋（行動裝置上留出 68px 空間）
                toastHost.style.bottom = '70px';
                toastHost.style.zIndex = '1100';
                toastHost.style.pointerEvents = 'none';
                toastHost.style.display = 'flex';
                toastHost.style.flexDirection = 'column';
                toastHost.style.alignItems = 'center';
                toastHost.style.gap = '0.5rem';
                toastHost.style.padding = '0 0.75rem 0.75rem';
                document.body.appendChild(toastHost);
                return toastHost;
            }
            function buildToast(html, ok, verseKey){
                const el = document.createElement('div');
                el.className = 'equip-verse-toast';
                if (verseKey) el.dataset.key = verseKey;
                el.style.maxWidth = '780px';
                el.style.width = '100%';
                el.style.background = ok ? 'linear-gradient(135deg,#0d5,#0a4)' : 'linear-gradient(135deg,#b21616,#6d0b0b)';
                el.style.color = '#fff';
                el.style.borderRadius = '18px';
                el.style.fontSize = '0.95rem';
                el.style.lineHeight = '1.5';
                el.style.boxShadow = '0 6px 22px -4px rgba(0,0,0,.35),0 2px 6px -1px rgba(0,0,0,.4)';
                el.style.padding = '0.85rem 1.1rem 1rem';
                el.style.position = 'relative';
                el.style.pointerEvents = 'auto';
                el.style.backdropFilter = 'blur(6px)';
                el.style.fontWeight = '500';
                el.style.opacity = '0';
                el.style.transform = 'translateY(20px) scale(.98)';
                el.style.transition = 'opacity .42s cubic-bezier(.4,0,.2,1), transform .52s cubic-bezier(.22,1, .36,1)';
                el.innerHTML = html; // 移除手動關閉按鈕（X）
                // 自動關閉
                const ttl = 3000; // 固定 3 秒自動關閉
                let remaining = ttl;
                let startTime = Date.now();
                let timer = setTimeout(()=>dismiss(el), ttl);
                el.addEventListener('pointerenter',()=>{ clearTimeout(timer); remaining = Math.max(0, ttl - (Date.now()-startTime)); });
                el.addEventListener('pointerleave',()=>{ if(el.__closing || el.__copied) return; startTime = Date.now(); timer = setTimeout(()=>dismiss(el), remaining || 1); });

                // Long-press copy (touch / mouse press >=520ms)
                let pressTimer = null;
                function clearPress(){ if(pressTimer){ clearTimeout(pressTimer); pressTimer=null; } }
                function startPress(ev){
                    if(el.__closing) return;
                    // 不影響雙擊 / 拖曳，僅處理長按
                    clearPress();
                    pressTimer = setTimeout(async ()=>{
                        pressTimer = null;
                        try {
                            const textToCopy = el.textContent.replace(/[\s\u00A0]+$/,'').trim();
                            await navigator.clipboard.writeText(textToCopy);
                            el.__copied = true;
                            // 展示複製提示徽章
                            const badge = document.createElement('div');
                            badge.textContent = '已複製';
                            badge.style.position='absolute';
                            badge.style.bottom='4px';
                            badge.style.right='10px';
                            badge.style.fontSize='.65rem';
                            badge.style.padding='3px 7px';
                            badge.style.background='rgba(255,255,255,.22)';
                            badge.style.color='#fff';
                            badge.style.border='1px solid rgba(255,255,255,.35)';
                            badge.style.borderRadius='12px';
                            badge.style.backdropFilter='blur(4px)';
                            badge.style.letterSpacing='.5px';
                            badge.style.fontWeight='600';
                            badge.style.opacity='0';
                            badge.style.transform='translateY(6px)';
                            badge.style.transition='opacity .35s ease, transform .45s cubic-bezier(.22,1,.36,1)';
                            el.appendChild(badge);
                            requestAnimationFrame(()=>{ badge.style.opacity='1'; badge.style.transform='translateY(0)'; });
                            // 長按成功後不立刻關閉：延長 2 秒讓使用者確認
                            clearTimeout(timer);
                            setTimeout(()=>{ if(!el.__closing) dismiss(el); }, 2000);
                        } catch(_) {}
                    }, 520);
                }
                function cancelPress(){ clearPress(); }
                el.addEventListener('pointerdown', startPress);
                el.addEventListener('pointerup', cancelPress);
                el.addEventListener('pointercancel', cancelPress);
                el.addEventListener('pointermove', (ev)=>{ if(pressTimer){ const rect = el.getBoundingClientRect(); if(ev.clientX < rect.left-5 || ev.clientX > rect.right+5 || ev.clientY < rect.top-5 || ev.clientY > rect.bottom+5){ clearPress(); } } });
                return el;
            }
            function dismiss(el){
                if(!el || el.__closing) return;
                el.__closing = true;
                el.style.opacity = '0';
                el.style.transform = 'translateY(14px) scale(.95)';
                el.style.filter = 'blur(2px)';
                setTimeout(()=>{ el.remove(); }, 500);
            }
            function formatRef(book, chapter){
                return `<span style="font-weight:600;letter-spacing:.5px;">${escapeEquipHtml(book)} ${escapeEquipHtml(chapter)}</span>`;
            }
            window.showEquipAssembledVerse = function(entry, ok = true){
                try {
                    if(!entry) return;
                    const ref = formatRef(entry.book, entry.chapter);
                    // 取用已載入的 punct map (full)；如未載入則 fallback 用 entry.full 或 fragments
                    const key = `${entry.book} ${entry.chapter}`.trim();
                    // 若遊戲狀態已換關（currentEquipEntry 不同 key）且此次是正向完成顯示，允許；若是失敗顯示則仍使用當時 entry
                    // 為避免 race 只在顯示時不重新讀 gameState.currentEquipEntry；使用傳入 entry 為準。
                    let full = (window.__equipPunctMap && window.__equipPunctMap[key]) || (entry.full && entry.full.trim());
                    if(!full){
                        const frags = Array.isArray(entry.verses)? entry.verses.map(s=>s.trim()).filter(Boolean):[];
                        full = frags.join('，');
                        if(full && !/[。！？!]$/.test(full)) full+='。';
                    }
                    const safeFull = escapeEquipHtml(full || '');
                    const html = `<div style="font-size:.78rem;opacity:.9;margin-bottom:4px;">${ref}</div><div>${safeFull}</div>`;
                    const host = ensureHost();
                    const toast = buildToast(html, ok, key);
                    host.appendChild(toast);
                    // 強制 reflow 後啟動動畫
                    void toast.offsetHeight;
                    requestAnimationFrame(()=>{
                        toast.style.opacity='1';
                        toast.style.transform='translateY(0) scale(1)';
                    });
                } catch(err){ console.warn('showEquipAssembledVerse error', err); }
            };
        })();

        // 裝備模式：題目進度卡片暫時色彩閃爍（正確/錯誤短暫）
        function equipProgressPulse(ok = true) {
            try {
                const el = document.getElementById('adaptiveStatusText');
                if (!el) return;
                el.classList.remove('equip-flash-green','equip-flash-red');
                void el.offsetWidth;
                if (ok) {
                    el.classList.add('equip-flash-green');
                    setTimeout(()=>{ el.classList.remove('equip-flash-green'); }, 800);
                } else {
                    el.classList.add('equip-flash-red');
                    el.classList.add('shake-error');
                    setTimeout(()=>{ el.classList.remove('equip-flash-red'); }, 800);
                    setTimeout(()=>{ try { el.classList.remove('shake-error'); } catch(_) {} }, 620);
                }
            } catch(_) {}
        }

        function completeEquipOrNext() {
            // Prevent duplicate completion due to rapid clicks/timeouts
            if (gameState.__equipFinished) return;
            // Progress level counter and UI; if last level, finish run
            const maxLevels = getLevelCount();
            // finalize level result if not set
            try {
                if (!gameState.levelResults) gameState.levelResults = {};
                if (!gameState.levelResults[gameState.currentLevel]) {
                    gameState.levelResults[gameState.currentLevel] = gameState.levelPerfect ? 'perfect' : 'complete';
                }
            } catch(_) {}
            // Update progress visuals
            equipUpdateProgressUI();
            // Next or finish
            if (gameState.currentLevel >= maxLevels) {
                // Finish equip run (ensure UI paints final state before modal)
                if (!gameState.__equipEnding) {
                    gameState.__equipEnding = true;
                    try { setEquipInteractionLock(true); } catch(_) {}
                    // flush one animation frame so last oval updates from ⏳ to 完成/失敗
                    if (typeof requestAnimationFrame === 'function') {
                        requestAnimationFrame(() => {
                            setTimeout(() => { finishEquipRun(); }, 0);
                        });
                    } else {
                        setTimeout(() => { finishEquipRun(); }, 16);
                    }
                }
            } else {
                gameState.currentLevel++;
                // allow next level inputs
                delete gameState.__equipHandoffLocked;
                // Force progress UI update after incrementing level to properly render current oval
                try { equipUpdateProgressUI(); } catch(_) {}
                startEquipLevel();
            }
        }

        function finishEquipRun() {
            // Helper 定義：確保在首次用到前就存在（避免舊版本快取缺失）
            if (typeof setRatio !== 'function') {
                window.setRatio = function(el, correct, total){
                    try {
                        if(!el) return; correct = (correct!=null?correct:0); total=(total!=null?total:0);
                        let strong = el.querySelector('strong');
                        if(!strong){ el.textContent=''; strong=document.createElement('strong'); el.appendChild(strong); }
                        strong.textContent = `(${correct}/${total})`;
                    } catch(_) {}
                };
            }
            if (gameState.__equipFinished) return;
            gameState.__equipFinished = true;
            gameState.equipRunning = false;
            // Stop timers
            try { if (gameState.timerInterval) { clearInterval(gameState.timerInterval); gameState.timerInterval = null; } } catch(_) {}
            try { if (gameState.survivalTimerInterval) { clearInterval(gameState.survivalTimerInterval); gameState.survivalTimerInterval = null; } } catch(_) {}
            gameState.gameCompleted = true;
            gameState.gameEndTime = Date.now();

            // Ensure no high z-index overlays obstruct the end modal
            try { document.querySelectorAll('.equip-verse-overlay').forEach(n => n.remove()); } catch(_) {}
            try { document.querySelectorAll('.level-fx-overlay').forEach(n => n.remove()); } catch(_) {}

            // Choose closing verse and compute timeReward like completeGame()
            // Equip mode accuracy：依完成關卡數 (complete 或 perfect 都算 1) / 總關卡數
            let accuracy = 0;
            if (gameState.equipTier) {
                try {
                    const totalLevels = typeof getLevelCount === 'function' ? getLevelCount() : 10;
                    const results = gameState.levelResults || {};
                    let finished = 0;
                    Object.values(results).forEach(v=>{ if (v === 'perfect' || v === 'complete') finished++; });
                    accuracy = totalLevels > 0 ? Math.round((finished / totalLevels) * 100) : 0;
                    const ratioEl = document.getElementById('finalAccuracyRatio');
                    if (ratioEl) setRatio(ratioEl, finished, totalLevels);
                    // 讓後續通用動畫依然能從 totalQuestions / totalCorrectAnswers 推得一致值
                    gameState.totalQuestions = totalLevels;
                    gameState.totalCorrectAnswers = finished;
                } catch(_) { /* ignore */ }
            } else {
                accuracy = gameState.totalQuestions > 0 ? Math.round((gameState.totalCorrectAnswers / gameState.totalQuestions) * 100) : 0;
            }
            try { updateClosingVerse(accuracy); } catch(_) {}
            try {
                if (gameState.showTimeReward) {
                    const correctAnswers = gameState.totalCorrectAnswers || 0;
                    const rarityBaseMap = { common: 100, rare: 125, all: 150 };
                    const perQ = gameState.rarity ? (rarityBaseMap[gameState.rarity] || 100) : 100;
                    const baseScore = correctAnswers * perQ;
                    const totalMistakes = gameState.totalMistakes || 0;
                    const bonusScore = (function(){
                        let b = 0; Object.values(gameState.levelResults||{}).forEach(r=>{ if (r==='perfect') b+=300; else if (r==='complete') b+=100; });
                        const hintCounts = { easy:3, normal:3, hard:3 };
                        const totalHints = hintCounts[gameState.difficulty];
                        const hintsRemaining = (totalHints!=null?totalHints:0) - (gameState.usedHints?gameState.usedHints.size:0);
                        if (hintsRemaining>0) b += hintsRemaining*100; return b;})();
                    const timeScore = (gameState.score||0) - baseScore + (totalMistakes*50) - bonusScore;
                    gameState.timeReward = Math.max(0, Math.round(timeScore));
                } else { gameState.timeReward = null; }
            } catch(_) {}

            // Pulse finish
            try { pulseCenterScore(gameState.score ? Math.min(300, gameState.score) : 100); } catch(_) {}
            try { spawnScoreParticles(gameState.score ? Math.min(300, gameState.score) : 100); } catch(_) {}

            // Build record for viewing only; skip leaderboard saving entirely
            gameState.finalMetrics = null;
            gameState.unlockedAchievements = [];
            gameState.suppressSettlementAchievements = true;
            const record = saveScore(gameState.score);
            try { record.playMode = 'equip'; } catch(_) {}
            // Mark as non-ranking and show modal without name input
            gameState.skipLeaderboardOnComplete = true;
            gameState.replaySourceRecord = record; // reuse replay end modal view
            checkAndShowGameComplete(record);
            // 確保顯示結算後主畫面基礎互動不被永久鎖住（排行榜 / 跑馬燈）
            try { unlockBodyScroll(); } catch(_) {}
            // 延遲一個 frame 確保 modal 繪製後解鎖主畫面按鈕狀態（不會立刻操作，但避免卡死）
            try { requestAnimationFrame(()=>{ lockMainScreenButtons(false); }); } catch(_) {}
        }
        // #endregion
