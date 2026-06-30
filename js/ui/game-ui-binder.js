// 將原本散落在引擎中的 UI 更新邏輯統一集中，綁定到 Event Bus
(function() {
    const eventBus = window.bcEvents;

    // 監聽分數變更
    if (eventBus) {
        eventBus.on('state:score', (data) => {
            const { old, new: newScore } = data;
            
            const centerScoreEl = document.getElementById('centerScore');
            if (centerScoreEl) {
                centerScoreEl.textContent = newScore;
                // 未來把 pulseCenterScore 也移進來
            }
        });
    }

    // 監聽提示剩餘次數變更
    if (eventBus) {
        eventBus.on('state:hintsRemaining', (data) => {
            const hintBtn = document.getElementById('hintBtn');
            const hintCount = document.getElementById('hintCount');
            const hintBtnProxy = document.getElementById('adaptiveHintBtn');
            const hintCountProxy = document.getElementById('adaptiveHintCount');

            const remaining = window.gameState.hintsRemaining;

            if (hintCount) {
                hintCount.textContent = `提示 ${remaining}`;
                if (hintCountProxy) hintCountProxy.textContent = `提示 ${remaining}`;

                if (remaining <= 0) {
                    hintCount.className = 'text-sm font-bold text-gray-400 ml-3';
                } else if (remaining <= 1) {
                    hintCount.className = 'text-sm font-bold text-red-600 ml-3';
                } else if (remaining <= 2) {
                    hintCount.className = 'text-sm font-bold text-orange-600 ml-3';
                } else {
                    hintCount.className = 'text-sm font-bold text-blue-600 ml-3';
                }
            }

            const disable = remaining <= 0;
            if (hintBtn) { 
                hintBtn.classList.toggle('opacity-50', disable); 
                hintBtn.classList.toggle('cursor-not-allowed', disable); 
                hintBtn.disabled = disable; 
            }
            if (hintBtnProxy) { 
                hintBtnProxy.classList.toggle('opacity-50', disable); 
                hintBtnProxy.classList.toggle('cursor-not-allowed', disable); 
                hintBtnProxy.disabled = disable; 
            }
        });
    }

    // ====== 小關卡點點進度條初始化 ======
    function renderMiniLevelPlaceholders() {
        const wrap = document.getElementById('levelProgressMini');
        if (!wrap) return;
        const levelCount = window.getLevelCount ? window.getLevelCount() : 10;
        const survival = window.isSurvival ? window.isSurvival() : false;
        
        const cache = renderMiniLevelPlaceholders.__cache || (renderMiniLevelPlaceholders.__cache = { sig: '' });
        const sig = `c:${levelCount}|s:${survival}`;
        if (cache.sig === sig) return;

        // Survival: hide mini progress entirely
        if (!levelCount || survival) {
            wrap.classList.add('hidden');
            if (wrap.childElementCount) wrap.innerHTML = '';
            cache.sig = sig;
            return;
        }

        wrap.classList.remove('hidden');
        if (window.setMiniProgressGridColumns) window.setMiniProgressGridColumns(levelCount);
        
        while (wrap.children.length < levelCount) {
            const dot = document.createElement('div');
            wrap.appendChild(dot);
        }
        while (wrap.children.length > levelCount) {
            wrap.removeChild(wrap.lastElementChild);
        }
        for (let i = 0; i < levelCount; i++) {
            const dot = wrap.children[i];
            dot.className = 'mini-dot bg-gray-200 border-gray-300';
        }
        cache.sig = sig;
    }

    // ====== 連擊進度條初始化 ======
    function ensureComboSegmentsReady() {
        const wrap = document.getElementById('comboSegments');
        if (!wrap) return;
        const targetCount = 8;
        if (wrap.children.length !== targetCount) {
            wrap.innerHTML = '';
            for (let i = 0; i < targetCount; i++) {
                const seg = document.createElement('div');
                seg.className = 'combo-seg';
                wrap.appendChild(seg);
            }
        }
    }

    // 訂聽遊戲狀態來初始化這些 DOM
    if (eventBus) {
        eventBus.on('state:playMode', renderMiniLevelPlaceholders);
        eventBus.on('state:currentLevel', renderMiniLevelPlaceholders);
        eventBus.on('state:combo', ensureComboSegmentsReady);
    }

    window.renderMiniLevelPlaceholders = renderMiniLevelPlaceholders;
    window.ensureComboSegmentsReady = ensureComboSegmentsReady;
})();

// ==================== EXTRACTED UI FUNCTIONS ====================

    // 中央分數的數字跳動動畫（支援中斷/重新開始）
    // Animate center score counting from A to B
    function animateScoreWithCounting(fromScore, toScore) {
            const scoreElement = document.getElementById('centerScore');
            const difference = toScore - fromScore;
            
            if (difference === 0) return;
            // 先取消先前尚未結束的計數動畫，避免重疊
            try {
                if (scoreElement && scoreElement.__countingRafId) {
                    cancelAnimationFrame(scoreElement.__countingRafId);
                    scoreElement.__countingRafId = null;
                }
            } catch (e) {}

            // 若使用者偏好減少動態，直接跳到目標值並做極短促的視覺提示
            if (getReducedMotion()) {
                scoreElement.textContent = toScore;
                scoreElement.classList.add('counting-animation');
                setTimeout(() => scoreElement.classList.remove('counting-animation'), 40);
                return;
            }

            const totalDurationMs = 900;
            let rafId = 0;
            let lastRendered = Number.NaN;
            let lastPulseTs = 0;
            const startTs = performance.now();

            const tick = (now) => {
                const elapsed = Math.max(0, now - startTs);
                const progress = Math.min(1, elapsed / totalDurationMs);
                const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
                const nextValue = Math.round(fromScore + difference * eased);

                if (nextValue !== lastRendered) {
                    scoreElement.textContent = nextValue;
                    lastRendered = nextValue;
                }

                if (now - lastPulseTs >= 70) {
                    scoreElement.classList.add('counting-animation');
                    setTimeout(() => scoreElement.classList.remove('counting-animation'), 40);
                    lastPulseTs = now;
                }

                if (progress < 1) {
                    rafId = requestAnimationFrame(tick);
                    try { scoreElement.__countingRafId = rafId; } catch (_) {}
                    return;
                }

                scoreElement.textContent = toScore;
                scoreElement.classList.add('counting-animation');
                setTimeout(() => scoreElement.classList.remove('counting-animation'), 60);
                try { scoreElement.__countingRafId = null; } catch (_) {}
            };

            rafId = requestAnimationFrame(tick);
            try { scoreElement.__countingRafId = rafId; } catch (_) {}
        }

        // spawn lightweight particles near the center score; intensity scales with magnitude
    // 分數微粒特效：依分數幅度與選項決定數量、顏色、距離（尊重減少動態偏好）
    // Score particles: spawn lightweight glyphs near a center or origin; honors reduced motion.
    // 分數粒子特效：由某個元素或視窗中心綻放
    // Spawn particle effects near origin or viewport center
    // spawnScoreParticles 已移至 score.js, 請使用 window.spawnScoreParticles


        // Unique start button effect: concentric aurora rings + themed particles
    // 開始按鈕特效：同心環光暈 + 粉紫粒子；在減少動態時改為短暫高光
    // Start button burst: aurora rings + violet/pink particles; reduced-motion -> brief glow only.
    // 開始按鈕點擊時的微小特效
    // Subtle burst when Start is clicked
function triggerStartButtonBurst(originRect, modeTone = 'default') {
            try {
                const reduced = getReducedMotion && getReducedMotion();
                const rect = originRect || (function(){ const el = document.getElementById('startGameBtn'); try { return el.getBoundingClientRect(); } catch(e){ return null; } })();
                const isValidRect = rect && (rect.width > 0 || rect.height > 0 || rect.left !== 0 || rect.top !== 0);
                const cx = isValidRect ? Math.round(rect.left + rect.width / 2) : Math.round(window.innerWidth / 2);
                const cy = isValidRect ? Math.round(rect.top + rect.height / 2) : Math.round(window.innerHeight / 2);

                let ringColors = ['#A78BFA', '#C084FC', '#EC4899', '#F472B6']; // default violet/pink family
                let particleColors = ['#FFFFFF','#F5D0FE','#E879F9','#C084FC','#A78BFA','#F472B6','#EC4899'];
                let glowColorInner = 'rgba(168,85,247,0.5)';
                let glowColorOuter = 'rgba(236,72,153,0.6)';
                let glowBorderColor = 'rgba(236,72,153,0.9)';

                switch (modeTone) {
                    case 'classic': // Pink/Rose
                        ringColors = ['#fb7185', '#f43f5e', '#e11d48', '#fda4af'];
                        particleColors = ['#ffffff', '#ffe4e6', '#fecdd3', '#fda4af', '#fb7185', '#f43f5e', '#e11d48'];
                        glowColorInner = 'rgba(244,63,94,0.5)';
                        glowColorOuter = 'rgba(225,29,72,0.6)';
                        glowBorderColor = 'rgba(225,29,72,0.9)';
                        break;
                    case 'survival': // Emerald/Teal
                        ringColors = ['#34d399', '#10b981', '#059669', '#6ee7b7'];
                        particleColors = ['#ffffff', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669'];
                        glowColorInner = 'rgba(16,185,129,0.5)';
                        glowColorOuter = 'rgba(5,150,105,0.6)';
                        glowBorderColor = 'rgba(5,150,105,0.9)';
                        break;
                    case 'equip': // Indigo/Violet
                        ringColors = ['#818cf8', '#6366f1', '#4f46e5', '#a5b4fc'];
                        particleColors = ['#ffffff', '#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5'];
                        glowColorInner = 'rgba(99,102,241,0.5)';
                        glowColorOuter = 'rgba(79,70,229,0.6)';
                        glowBorderColor = 'rgba(79,70,229,0.9)';
                        break;
                    case 'custom': // Sky/Cyan
                        ringColors = ['#38bdf8', '#0ea5e9', '#0284c7', '#7dd3fc'];
                        particleColors = ['#ffffff', '#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7'];
                        glowColorInner = 'rgba(14,165,233,0.5)';
                        glowColorOuter = 'rgba(2,132,199,0.6)';
                        glowBorderColor = 'rgba(2,132,199,0.9)';
                        break;
                }

                // Reduced motion: brief accessible glow on the button only
                if (reduced) {
                    const btn = document.getElementById('startGameBtn');
                    if (btn) {
                        const prev = { boxShadow: btn.style.boxShadow, border: btn.style.border };
                        btn.style.boxShadow = `0 0 0 4px ${glowColorInner}, 0 0 16px ${glowColorOuter}`;
                        btn.style.border = `3px solid ${glowBorderColor}`;
                        setTimeout(() => { try { btn.style.boxShadow = prev.boxShadow || ''; btn.style.border = prev.border || ''; } catch(_) {} }, 260);
                    }
                    return;
                }

                const ringCount = 3;
                const baseSize = 24; // px
                const stagger = 70;   // ms

                for (let i = 0; i < ringCount; i++) {
                    const ring = document.createElement('div');
                    const size = baseSize + i * 8;
                    ring.style.position = 'fixed';
                    ring.style.left = (cx - size / 2) + 'px';
                    ring.style.top = (cy - size / 2) + 'px';
                    ring.style.width = size + 'px';
                    ring.style.height = size + 'px';
                    ring.style.borderRadius = '50%';
                    const col = ringColors[i % ringColors.length];
                    ring.style.border = '3px solid ' + col;
                    ring.style.boxShadow = `0 0 24px ${col}80, inset 0 0 12px ${col}40`;
                    ring.style.opacity = '0.95';
                    ring.style.transform = 'scale(0.25)';
                    ring.style.transition = 'transform 720ms cubic-bezier(.2,.9,.2,1), opacity 720ms linear';
                    ring.style.zIndex = '60'; // render above countdown overlay (which is z-50)
                    document.body.appendChild(ring);
                    // animate out
                    setTimeout(() => {
                        try { ring.style.transform = 'scale(2.8)'; ring.style.opacity = '0'; } catch(_) {}
                    }, 16 + i * stagger);
                    setTimeout(() => { try { if (ring.parentElement) ring.parentElement.removeChild(ring); } catch(_) {} }, 820 + i * stagger);
                }

                // matching particle flare using computed mode colors, above overlay
                try { spawnScoreParticles(120, rect, { colors: particleColors, zIndex: 60 }); } catch(_) {}
            } catch (_) { /* ignore visual errors */ }
        }

        // 裝備課程：正確答案專屬藍色擴散環特效（與開始按鈕風格一致，但改用藍色系）
        // Equip mode correct answer burst: concentric blue rings + light blue particles
        function triggerEquipCorrectBurst(originRect) {
            try {
                const reduced = getReducedMotion && getReducedMotion();
                const rect = originRect;
                if (!rect || (rect.width === 0 && rect.height === 0 && rect.left === 0 && rect.top === 0)) return;
                const cx = Math.round(rect.left + rect.width / 2);
                const cy = Math.round(rect.top + rect.height / 2);
                if (reduced) {
                    // Reduced motion: subtle glow highlight only
                    const glow = document.createElement('div');
                    glow.style.position = 'fixed';
                    glow.style.left = (cx - 28) + 'px';
                    glow.style.top = (cy - 28) + 'px';
                    glow.style.width = '56px';
                    glow.style.height = '56px';
                    glow.style.borderRadius = '50%';
                    glow.style.background = 'radial-gradient(circle at center, rgba(191,219,254,0.9), rgba(147,197,253,0.45) 55%, rgba(147,197,253,0) 75%)';
                    glow.style.pointerEvents = 'none';
                    glow.style.zIndex = '38';
                    glow.style.opacity = '0';
                    glow.style.transition = 'opacity 240ms ease';
                    document.body.appendChild(glow);
                    requestAnimationFrame(()=>{ try { glow.style.opacity = '1'; } catch(_) {} });
                    setTimeout(()=>{ try { glow.style.opacity = '0'; } catch(_) {} }, 240);
                    setTimeout(()=>{ try { glow.remove(); } catch(_) {} }, 520);
                    return;
                }
                const ringColors = ['#DBEAFE','#BFDBFE','#93C5FD','#60A5FA','#3B82F6'];
                const ringCount = 3;
                const baseSize = 20;
                const stagger = 60;
                for (let i = 0; i < ringCount; i++) {
                    const ring = document.createElement('div');
                    const size = baseSize + i * 10;
                    ring.style.position = 'fixed';
                    ring.style.left = (cx - size / 2) + 'px';
                    ring.style.top = (cy - size / 2) + 'px';
                    ring.style.width = size + 'px';
                    ring.style.height = size + 'px';
                    ring.style.borderRadius = '50%';
                    const col = ringColors[i % ringColors.length];
                    ring.style.border = '3px solid ' + col;
                    ring.style.boxShadow = `0 0 20px ${col}90, inset 0 0 10px ${col}40`;
                    ring.style.opacity = '0.95';
                    ring.style.transform = 'scale(0.3)';
                    ring.style.transition = 'transform 680ms cubic-bezier(.25,.85,.25,1), opacity 680ms linear';
                    ring.style.zIndex = '38';
                    document.body.appendChild(ring);
                    setTimeout(()=>{ try { ring.style.transform = 'scale(3)'; ring.style.opacity = '0'; } catch(_) {} }, 18 + i * stagger);
                    setTimeout(()=>{ try { ring.remove(); } catch(_) {} }, 760 + i * stagger);
                }
                // Blue particle flare (slightly fewer than start button)
                try { spawnScoreParticles(70, rect, { colors:['#FFFFFF','#DBEAFE','#BFDBFE','#93C5FD','#60A5FA','#3B82F6'], count:12, distanceMin:36, distanceMax:110, durationMs:1350, zIndex:38 }); } catch(_) {}
            } catch(_) { /* ignore */ }
        }

        // Animate a numeric span inline from a start to end value with optional sign prefix
    // 行內數字跳動動畫：將文字中的數值從起點平滑數到終點，支援 +/- 前綴
    // Animate a numeric span inline from start to end with easing and optional sign prefix.
    // 行內小數字計數器（用於明細動畫、加分浮標）
    // Inline number animator for breakdown and popups
    function animateInlineNumber(spanEl, fromVal, toVal, durationMs, signPrefix = '') {
            try {
                if (!spanEl) return () => {};
                // Cancel any previous inline-number animation on this element
                try { if (spanEl.__ainCancel && typeof spanEl.__ainCancel === 'function') spanEl.__ainCancel(); } catch(_) {}
                if (getReducedMotion && getReducedMotion()) {
                    spanEl.textContent = `${signPrefix}${toVal}`;
                    try { spanEl.__ainCancel = null; } catch(_) {}
                    return () => {};
                }
                const start = performance.now();
                let rafId = 0;
                let stopped = false;
                const run = (now) => {
            const t = Math.max(0, Math.min(1, (now - start) / Math.max(1, durationMs)));
                    const eased = 1 - Math.pow(1 - t, 3);
                    const cur = Math.round(fromVal + (toVal - fromVal) * eased);
                    if (!stopped) spanEl.textContent = `${signPrefix}${cur}`;
                    if (!stopped && t < 1) {
                        rafId = requestAnimationFrame(run);
                    } else {
                        try { spanEl.__ainCancel = null; } catch(_) {}
                    }
                };
                rafId = requestAnimationFrame(run);
                const cancel = () => { try { stopped = true; if (rafId) cancelAnimationFrame(rafId); } catch(_) {} try { spanEl.__ainCancel = null; } catch(_) {} };
                try { spanEl.__ainCancel = cancel; } catch(_) {}
                return cancel;
            } catch (_) {
                return () => {};
            }
        }

        // Wrap numeric portion of floating text and apply inline counting
    // 將浮動分數文字中的數值切出並套用行內跳動（行動裝置可強制啟用以提升感受）
    // Apply inline counting to the numeric part of a floating score text; can force on mobile.
    // 對加分浮標套用行內數字動畫（避免重算中心分數）
    // Apply inline counting to floating score popups
    function applyInlineCountToFloating(containerEl, displayText) {
            try {
                if (!containerEl || typeof displayText !== 'string') return;
                const m = displayText.match(/^(.*?)([+\-]?\d+)(.*)$/);
                if (!m) return;
                const before = m[1] || '';
                const numStr = m[2] || '';
                const after = m[3] || '';
        const sign = numStr.startsWith('-') ? '-' : (numStr.startsWith('+') ? '+' : '');
        const target = Math.abs(parseInt(numStr.replace(/[+\-]/g, ''), 10) || 0);

                containerEl.innerHTML = '';
                if (before) containerEl.appendChild(document.createTextNode(before));
                const numSpan = document.createElement('span');
                numSpan.className = 'inline-count-num';
                numSpan.style.display = 'inline-block';
                numSpan.textContent = `${sign}0`;
                containerEl.appendChild(numSpan);
                if (after) containerEl.appendChild(document.createTextNode(after));

                // negative should count downwards visually: -0 -> -target
                const fromVal = 0;
                const toVal = target;
                // Allow a forced inline counting (used by mobile special popups)
                const force = containerEl && containerEl.dataset && containerEl.dataset.forceInlineCount === 'true';
                if (force && typeof window.getReducedMotion === 'function') {
                    const original = window.getReducedMotion;
                    try { window.getReducedMotion = () => false; } catch(_) {}
                    const cancel = animateInlineNumber(numSpan, fromVal, toVal, 720, sign);
                    containerEl.__cancelInline = () => { try { cancel(); } catch(_) {}; try { window.getReducedMotion = original; } catch(_) {} };
                } else {
                    const cancel = animateInlineNumber(numSpan, fromVal, toVal, 720, sign); // 加倍
                    containerEl.__cancelInline = cancel;
                }
            } catch (_) { /* ignore */ }
        }

        // pulse the large center score element; scale intensity based on delta
    // 中央金色分數脈衝：依分數幅度改變放大倍率與陰影，短暫顯示後還原
    // Pulse the big center score; scale intensity by delta and then reset.
    // 讓中央分數微微脈衝發光（不改變分數）
    // Pulse-glow the center score element
    // pulseCenterScore, spawnConfettiRain, spawnGoldGlitter 已移至 score.js


        // Continuous star rain controller (desktop only)
    // 桌面專用：持續星星雨控制器（避免在行動裝置過度渲染）
    // Desktop-only continuous star rain controller; throttles by active nodes.
    // 在背景啟動「星星雨」裝飾效果
    // Start decorative star rain in the background
    function startStarRain() {
            try {
                if (typeof window.startStarRain === 'function') {
                    return window.startStarRain();
                }
            } catch (_) { /* ignore */ }
        }

    // 停止星星雨：可選擇立即清除現有的金色流光元素
    // Stop star rain; optionally clear existing glitter nodes.
    // 停止星星雨並清理節點
    // Stop star rain and clean up nodes
    function stopStarRain(forceClear = true) {
            try {
                if (typeof window.stopStarRain === 'function') {
                    return window.stopStarRain(forceClear);
                }
            } catch (_) { /* ignore */ }
        }

    // 單幀排程進度 UI 更新，避免同幀重複渲染
    // Coalesce progress UI updates into a single animation frame
    const __progressUIFrame = { rafId: 0, level: false, question: false, adaptive: false };
    function scheduleProgressUIUpdate(options = {}) {
            try {
                const force = !!options.force;
                __progressUIFrame.level = __progressUIFrame.level || !!options.level;
                __progressUIFrame.question = __progressUIFrame.question || !!options.question;
                __progressUIFrame.adaptive = __progressUIFrame.adaptive || !!options.adaptive;

                if (force) {
                    if (__progressUIFrame.rafId) {
                        try { cancelAnimationFrame(__progressUIFrame.rafId); } catch(_) {}
                        __progressUIFrame.rafId = 0;
                    }
                } else if (__progressUIFrame.rafId) {
                    return;
                }

                const flush = () => {
                    const runLevel = __progressUIFrame.level;
                    const runQuestion = __progressUIFrame.question;
                    const runAdaptive = __progressUIFrame.adaptive;
                    __progressUIFrame.rafId = 0;
                    __progressUIFrame.level = false;
                    __progressUIFrame.question = false;
                    __progressUIFrame.adaptive = false;
                    if (runLevel) { try { updateLevelOvals(); } catch (_) {} }
                    if (runQuestion) { try { updateQuestionOvals(); } catch (_) {} }
                    if (runAdaptive) { try { updateAdaptiveStatus(); } catch (_) {} }
                };

                if (force) {
                    flush();
                } else {
                    __progressUIFrame.rafId = requestAnimationFrame(flush);
                }
            } catch(_) {
                try {
                    if (options.level) updateLevelOvals();
                    if (options.question) updateQuestionOvals();
                    if (options.adaptive) updateAdaptiveStatus();
                } catch(__) {}
            }
        }
        try { window.scheduleProgressUIUpdate = scheduleProgressUIUpdate; } catch(_) {}



    // Refresh hint button and remaining count color
    function updateHintButton() {
        const hintBtn = document.getElementById('hintBtn');
        const hintCount = document.getElementById('hintCount');
        const hintBtnProxy = document.getElementById('adaptiveHintBtn');
        const hintCountProxy = document.getElementById('adaptiveHintCount');
        
        const remaining = (window.gameState && window.gameState.hintsRemaining) || 0;

        // 更新提示次數顯示
        if (hintCount) {
            hintCount.textContent = `⭐×${remaining}`;
            if (hintCountProxy) hintCountProxy.textContent = `⭐×${remaining}`;

            // 根據剩餘次數改變顏色
            if (remaining <= 0) {
                hintCount.className = 'text-sm font-bold text-gray-400 ml-3';
            } else if (remaining <= 1) {
                hintCount.className = 'text-sm font-bold text-red-600 ml-3';
            } else if (remaining <= 2) {
                hintCount.className = 'text-sm font-bold text-orange-600 ml-3';
            } else {
                hintCount.className = 'text-sm font-bold text-blue-600 ml-3';
            }
        }

        // 更新按鈕狀態
        const disable = remaining <= 0;
        if (hintBtn) { hintBtn.classList.toggle('opacity-50', disable); hintBtn.classList.toggle('cursor-not-allowed', disable); hintBtn.disabled = disable; }
        if (hintBtnProxy) { hintBtnProxy.classList.toggle('opacity-50', disable); hintBtnProxy.classList.toggle('cursor-not-allowed', disable); hintBtnProxy.disabled = disable; }
    }

    // 依目前狀態更新主要 UI（標題、提示、按鈕等）
    // Update main game UI from current state
    function updateGameUI() {
            // 將高頻進度更新收斂到同一幀
            try { scheduleProgressUIUpdate({ level: true, question: true, adaptive: true }); } catch (e) { /* ignore */ }

            // 生存模式：切換顯示計時卡 vs 關卡卡
            try {
                const levelCard = document.getElementById('levelProgressCard');
                const survivalCard = document.getElementById('survivalTimerCard');
                const miniTimer = document.getElementById('survivalTimerMini');
                if (isSurvival()) {
                    if (levelCard) levelCard.classList.add('hidden');
                    if (survivalCard) {
                        survivalCard.classList.remove('hidden');
                        updateSurvivalTimerDisplay();
                    }
                    if (miniTimer) miniTimer.classList.add('active');
                } else {
                    if (survivalCard) survivalCard.classList.add('hidden');
                    if (levelCard) levelCard.classList.remove('hidden');
                    if (miniTimer) miniTimer.classList.remove('active');
                }
            } catch(_) {}

            // 更新分數顯示（使用計數動畫）
            const scoreElement = document.getElementById('centerScore');
            const currentScore = parseInt(scoreElement.textContent) || 0;
            const newScore = gameState.score;
            
            if (newScore !== currentScore) {
                animateScoreWithCounting(currentScore, newScore);
                // 向輔助工具播報分數變化
                try { const live = document.getElementById('scoreAriaLive'); if (live) live.textContent = `分數 ${newScore} 分`; } catch(e){}
            } else {
                scoreElement.textContent = gameState.score;
            }
            
            // 更新提示按鈕狀態和圖案顯示
            updateHintButton();
        }

    // 更新關卡進度橢圓（包含失敗紅色狀態）
    // Update level progress ovals including failed state
    function updateLevelOvals() {
            const container = document.getElementById('levelOvals');
            const levelCount = getLevelCount();
            const survival = isSurvival();
            const cache = updateLevelOvals.__cache || (updateLevelOvals.__cache = { sig: '', miniSig: '' });
            // Survival: hide level progress (no fixed cap)
            if (!levelCount || survival) {
                try {
                    const card = document.getElementById('levelProgressCard');
                    if (card) card.style.display = 'none';
                } catch(_) {}
            } else {
                try {
                    const card = document.getElementById('levelProgressCard');
                    if (card) card.style.display = '';
                } catch(_) {}
            }

            let levelSig = `c:${levelCount || 0}|s:${survival ? 1 : 0}|cur:${gameState.currentLevel || 0}`;
            for (let i = 1; i <= (levelCount || 0); i++) {
                levelSig += `|${i}:${(gameState.levelResults && gameState.levelResults[i]) || ''}`;
            }

            if (container) {
                if (!levelCount || survival) {
                    if (container.childElementCount) container.innerHTML = '';
                } else if (cache.sig !== levelSig) {
                    while (container.children.length < levelCount) {
                        const oval = document.createElement('div');
                        const label = document.createElement('span');
                        label.className = 'px-2';
                        oval.appendChild(label);
                        container.appendChild(oval);
                    }
                    while (container.children.length > levelCount) {
                        container.removeChild(container.lastElementChild);
                    }

                    for (let i = 1; i <= levelCount; i++) {
                        const oval = container.children[i - 1];
                        const label = oval.firstElementChild || oval;
                        const baseClass = 'h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200';
                        const levelResult = gameState.levelResults && gameState.levelResults[i];

                        if (i < gameState.currentLevel || (i === gameState.currentLevel && levelResult)) {
                            if (levelResult === 'perfect') {
                                oval.className = `${baseClass} bg-gradient-to-br from-white via-yellow-100 to-yellow-300 text-yellow-900 border-2 border-yellow-400 shadow-md`;
                                label.textContent = '完美';
                            } else if (levelResult === 'complete') {
                                oval.className = `${baseClass} bg-emerald-500 text-white border-2 border-yellow-400 shadow-sm`;
                                label.textContent = '全對';
                            } else if (levelResult === 'failed') {
                                oval.className = `${baseClass} bg-rose-500 text-white border-2 border-rose-700 shadow-sm`;
                                label.textContent = '失敗';
                            } else {
                                oval.className = `${baseClass} bg-green-400 text-green-900 border-2`;
                                label.textContent = '完成';
                            }
                        } else if (i === gameState.currentLevel) {
                            oval.className = `${baseClass} bg-purple-200 text-purple-800 animate-pulse`;
                            label.textContent = `🎮${i}`;
                        } else {
                            oval.className = `${baseClass} bg-gray-200 text-gray-500 border-2`;
                            label.textContent = `⏳${i}`;
                        }
                    }
                }
            }

            // 同步更新手機版迷你關卡進度（備援顯示）
            try {
                const mini = document.getElementById('levelProgressMini');
                if (mini) {
                    const count = levelCount || 0;
                    let miniSig = `c:${count}|s:${survival ? 1 : 0}|cur:${gameState.currentLevel || 0}`;
                    for (let i = 1; i <= count; i++) {
                        miniSig += `|${i}:${(gameState.levelResults && gameState.levelResults[i]) || ''}`;
                    }
                    if (!count || survival) {
                        mini.classList.add('hidden');
                        if (mini.childElementCount) mini.innerHTML = '';
                    } else {
                        mini.classList.remove('hidden');
                        setMiniProgressGridColumns(count);
                        if (cache.miniSig !== miniSig) {
                            while (mini.children.length < count) {
                                const d = document.createElement('div');
                                mini.appendChild(d);
                            }
                            while (mini.children.length > count) {
                                mini.removeChild(mini.lastElementChild);
                            }
                            for (let i = 1; i <= count; i++) {
                                const d = mini.children[i - 1];
                                let cls = 'mini-dot';
                                const levelResult = gameState.levelResults && gameState.levelResults[i];
                                if (i < gameState.currentLevel || (i === gameState.currentLevel && levelResult)) {
                                    if (levelResult === 'perfect') {
                                        cls += ' bg-gradient-to-br from-white via-yellow-100 to-yellow-300 border-yellow-400';
                                    } else if (levelResult === 'complete') {
                                        cls += ' bg-emerald-500 border-yellow-400';
                                    } else if (levelResult === 'failed') {
                                        cls += ' bg-rose-500 border-rose-700';
                                    } else {
                                        cls += ' bg-green-400 border-green-500';
                                    }
                                } else if (i === gameState.currentLevel) {
                                    cls += ' bg-purple-200 border-purple-300';
                                } else {
                                    cls += ' bg-gray-200 border-gray-300';
                                }
                                d.className = cls;
                            }
                            cache.miniSig = miniSig;
                        }
                    }
                }
            } catch (_) {}
            cache.sig = levelSig;
        }

    // 更新本關每題的進度橢圓（對/錯/未答）
    // Update question ovals for current level
    function updateQuestionOvals() {
            const container = document.getElementById('questionOvals');
            if (!container) return;
            const cache = updateQuestionOvals.__cache || (updateQuestionOvals.__cache = { sig: '' });

            let totalAnswered = 0;

            // 確保有題目數據才進行更新
            if (!gameState.questionData || gameState.questionData.length === 0) {
                if (container.childElementCount) container.innerHTML = '';
                document.getElementById('currentQuestion').textContent = '0/0';
                return;
            }

            const questionCount = gameState.questionData.length;
            const verseStates = new Array(questionCount).fill('pending');
            const maxAttempts = { easy: 3, normal: 2, hard: 1 };
            const originalAttempts = maxAttempts[gameState.difficulty] || 1;
            const cards = document.querySelectorAll('#gameVerses [data-index]');
            for (const card of cards) {
                const idx = Number(card.dataset && card.dataset.index);
                if (!Number.isFinite(idx) || idx < 0 || idx >= questionCount) continue;
                if (card.classList.contains('bg-green-100')) verseStates[idx] = 'correct';
                else if (card.classList.contains('bg-red-100')) verseStates[idx] = 'wrong';
                else if (card.classList.contains('bg-yellow-100') || card.classList.contains('bg-orange-100')) verseStates[idx] = 'partial';
            }

            let sig = `q:${questionCount}|d:${gameState.difficulty || ''}|l:${gameState.currentLevel || 0}`;
            const nextClasses = new Array(questionCount);
            const nextTexts = new Array(questionCount);

            for (let i = 0; i < questionCount; i++) {
                const state = verseStates[i];
                const currentAttempts = gameState.questionAttempts[i] || originalAttempts;
                let ovalClass = 'flex-1 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold transition-all duration-200';
                let ovalText = '?';

                if (state === 'correct') {
                    // 答對了，檢查是否無失誤且未使用提示
                    if (currentAttempts === originalAttempts) {
                        const levelHintKey = `${gameState.currentLevel}|${i}`;
                        const hintUsedThisLevel = (gameState.usedHints && (gameState.usedHints.has(levelHintKey) || gameState.usedHints.has(i)));
                        if (!hintUsedThisLevel) {
                            ovalClass += ' bg-emerald-500 text-white border-2 border-yellow-400 shadow-sm';
                            ovalText = '✓';
                        } else {
                            // used hint this level: treat as answered-with-hint
                            ovalClass += ' bg-green-400 text-green-900 border-2';
                            ovalText = '✓';
                        }
                    } else {
                        // 有失誤 - 普通綠色
                        ovalClass += ' bg-green-400 text-green-900 border-2';
                        ovalText = '✓';
                    }
                    totalAnswered++;
                } else if (state === 'wrong') {
                    // 答錯
                    ovalClass += ' bg-red-400 text-red-900 border-2';
                    ovalText = '✗';
                    totalAnswered++;
                } else if (state === 'partial') {
                    // 已經嘗試過但還未完成 - 黃色
                    ovalClass += ' bg-yellow-400 text-yellow-900 border-2';
                    ovalText = '!';
                } else {
                    // 未開始
                    ovalClass += ' bg-gray-200 text-gray-500 border-2';
                }

                sig += `|${i}:${state}:${currentAttempts}:${ovalText}`;
                nextClasses[i] = ovalClass;
                nextTexts[i] = ovalText;
            }

            if (cache.sig === sig) {
                const cq = document.getElementById('currentQuestion');
                if (cq) cq.textContent = `${totalAnswered}/${questionCount}`;
                return;
            }

            while (container.children.length < questionCount) {
                container.appendChild(document.createElement('div'));
            }
            while (container.children.length > questionCount) {
                container.removeChild(container.lastElementChild);
            }
            for (let i = 0; i < questionCount; i++) {
                const oval = container.children[i];
                oval.className = nextClasses[i];
                oval.textContent = nextTexts[i];
            }

            // 更新數字顯示
            const cq = document.getElementById('currentQuestion');
            if (cq) cq.textContent = `${totalAnswered}/${questionCount}`;
            cache.sig = sig;
        }

    // 動態難度或裝備課程題目進度
        function updateAdaptiveStatus() {
            const el = document.getElementById('adaptiveStatusText');
            if (!el) return;
            const cache = updateAdaptiveStatus.__cache || (updateAdaptiveStatus.__cache = { html: '', diff: '', title: '', equip: false });
            const esc = (v) => {
                const s = v == null ? '' : String(v);
                return s
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            };
            const diff = String(gameState.difficulty || 'easy');
            const combo = Number(gameState.combo || 0);
            const diffLabel = diff === 'hard' ? '困難' : diff === 'normal' ? '普通' : '簡單';
            // 三軸：配對模式(連擊) / 題型階段(時間) / 罕見度(速度)
            // 配對模式：視 diff
            const pairText = diff === 'easy' ? '經文/書卷' : (diff === 'normal' ? '經文/章節' : '章節/經文');
            // 題型階段：時間切片
            let patternStageLabel = '';
            try {
                const tier = (typeof getPatternTimeTier === 'function') ? getPatternTimeTier() : 0;
                patternStageLabel = tier === 0 ? '初始' : tier === 1 ? '加深' : '高階';
            } catch(_) { patternStageLabel = '初始'; }
            // 新罕見度：直接以 adaptiveVerseRarity 顯示（常見/一般/冷門）
            let raritySpeedLabel = '';
            try {
                const map = { common:'常見', normal:'一般', rare:'冷門' };
                if (!gameState.adaptiveVerseRarity) gameState.adaptiveVerseRarity = 'common';
                raritySpeedLabel = map[gameState.adaptiveVerseRarity] || '常見';
            } catch(_) { raritySpeedLabel = '常見'; }

            let nextHtml = '';
            let nextTitle = '';
            let forceEquipCard = false;

            if (gameState.equipRunning) {
                // 裝備課程：顯示三階段逐步題目進度
                nextTitle = '題目進度';
                forceEquipCard = true;
                const entry = gameState.currentEquipEntry || {};
                const rawBook = esc(entry.book || '');
                const book = (Number(gameState.equipPhase || 0) === 1 && !gameState.equipBookRevealed) ? '???' : rawBook;
                const rawChapter = esc(entry.chapter || '');
                const chapter = (Number(gameState.equipPhase || 0) === 2 && !gameState.equipChapterRevealed) ? '???' : rawChapter;
                const verses = Array.isArray(entry.verses) ? entry.verses : [];
                const picked = Math.min(verses.length, Number(gameState.equipExpectedIndex || 0));
                const total = verses.length || 0;
                const phase = Number(gameState.equipPhase || 0);
                const phaseHint = phase === 1 ? '正在抽選本關書卷…' : phase === 2 ? '請選出正確章節' : phase === 3 ? '依序選出正確片段' : '裝備課程進行中…';
                const ratio = total > 0 ? Math.max(0, Math.min(100, Math.round((picked / total) * 100))) : 0;
                const assembledParts = picked > 0 ? verses.slice(0, picked).map(v => esc(v)) : [];
                const chipsHtml = assembledParts.length
                    ? assembledParts.map(p => `<span class="equip-frag-chip">${p}</span>`).join('')
                    : `<span class="equip-frag-empty">尚未開始排序</span>`;
                if (gameState.equipPhase === 1) {
                    nextHtml = `
                        <div class="equip-status-card">
                            <div class="equip-kv-grid">
                                <div class="equip-kv"><span>書卷</span><strong>${book}</strong></div>
                            </div>
                            <div class="equip-inline-note">${phaseHint}</div>
                        </div>`;
                } else if (gameState.equipPhase === 2) {
                    nextHtml = `
                        <div class="equip-status-card">
                            <div class="equip-kv-grid">
                                <div class="equip-kv"><span>書卷</span><strong>${book}</strong></div>
                                <div class="equip-kv"><span>章節</span><strong>${chapter}</strong></div>
                            </div>
                            <div class="equip-inline-note">${phaseHint}</div>
                        </div>`;
                } else if (gameState.equipPhase === 3) {
                    nextHtml = `
                        <div class="equip-status-card">
                            <div class="equip-kv-grid">
                                <div class="equip-kv"><span>書卷</span><strong>${book}</strong></div>
                                <div class="equip-kv"><span>章節</span><strong>${chapter}</strong></div>
                            </div>
                            <div class="equip-order-head"><span>排序進度</span><span>${picked}/${total}</span></div>
                            <div class="equip-order-track"><div class="equip-order-fill equip-order-fill-live" style="width:${ratio}%"></div></div>
                            <div class="equip-order-text">${chipsHtml}${picked<total && picked>0 ? `<span class="equip-frag-more">…尚有 ${Math.max(0, total - picked)} 段</span>` : ''}</div>
                        </div>`;
                } else {
                    nextHtml = `
                        <div class="equip-status-card">
                            <div class="equip-inline-note">${phaseHint}</div>
                        </div>`;
                }
            } else {
                // 闖關/練習/生存：動態難度現況（顯示三軸）
                nextTitle = '遊戲資訊';
                const replayPill = (gameState && (gameState._replaySequence || gameState.replaySourceRecord)) ? `<div class="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-yellow-200 text-yellow-900 border border-yellow-300">🔁 同題重播 (難度凍結)</div>` : '';
                const dur = Number(gameState.lastLevelDurationSec||0);
                const ps = (typeof gameState.lastLevelPerformanceScore === 'number') ? gameState.lastLevelPerformanceScore : null;
                const metaLine = (dur>0 || ps!==null) ? `<div class="text-[11px] opacity-80 flex flex-wrap gap-x-4 gap-y-0.5">${dur>0?`<span>上關 ${dur.toFixed(1)}s</span>`:''}${ps!==null?`<span>PS ${ps.toFixed(2)}</span>`:''}</div>` : '';
                nextHtml = `
                    <div class="space-y-1">
                        ${replayPill}
                        <div class="flex flex-wrap gap-x-6 gap-y-1"><span class="whitespace-nowrap">配對模式：${diffLabel}</span><span class="whitespace-nowrap">型態：${pairText}</span></div>
                        <div class="flex flex-wrap gap-x-4 gap-y-1 items-center">
                            <span class="whitespace-nowrap">題型階段：${patternStageLabel}</span>
                            <span class="whitespace-nowrap">罕見度：${raritySpeedLabel}</span>
                        </div>
                        ${metaLine}
                    </div>`;
            }

            try {
                const t = document.getElementById('gameInfoTitle');
                if (t && cache.title !== nextTitle) {
                    t.textContent = nextTitle;
                    cache.title = nextTitle;
                }
            } catch(_) {}

            if (cache.html !== nextHtml) {
                el.innerHTML = nextHtml;
                cache.html = nextHtml;
            }

            try {
                const card = document.getElementById('questionProgressCard');
                if (card) card.classList.toggle('equip-force-show', !!forceEquipCard);
            } catch(_) {}

            // Apply difficulty-based theme on the game-info card (desktop) and global tint
            try {
                const card = document.getElementById('questionProgressCard');
                const title = document.getElementById('gameInfoTitle');
                if (card && title) {
                    const diffChanged = cache.diff !== diff;
                    const equipChanged = cache.equip !== !!gameState.equipRunning;
                    if (!diffChanged && !equipChanged) return;
                    const cls = card.classList;
                    const tcls = title.classList;
                    // Reset previous color classes
                    cls.remove('from-blue-50','to-cyan-50','border-blue-200');
                    cls.remove('from-green-50','to-emerald-50','border-green-200');
                    cls.remove('from-amber-50','to-yellow-50','border-amber-200');
                    cls.remove('from-rose-50','to-red-50','border-rose-200');
                    tcls.remove('text-blue-700','text-green-700','text-amber-700','text-rose-700','text-red-700');
                    el.classList.remove('text-blue-800','text-green-800','text-amber-800','text-rose-800','text-red-800');

                    if (diff === 'easy') {
                        cls.add('from-green-50','to-emerald-50','border-green-200');
                        tcls.add('text-green-700');
                        el.classList.add('text-green-800');
                    } else if (diff === 'normal') {
                        cls.add('from-amber-50','to-yellow-50','border-amber-200');
                        tcls.add('text-amber-700');
                        el.classList.add('text-amber-800');
                    } else { // hard
                        cls.add('from-rose-50','to-red-50','border-rose-200');
                        tcls.add('text-rose-700');
                        el.classList.add('text-rose-800');
                    }

                    // Pulse the card to emphasize change
                    if (diffChanged) {
                        try {
                            card.classList.remove('difficulty-pulse');
                            // force reflow to restart animation
                            void card.offsetWidth;
                            card.classList.add('difficulty-pulse');
                        } catch(_) {}
                    }

                    // Show a temporary tint overlay during difficulty change
                    if (diffChanged) {
                        try {
                            const overlay = document.getElementById('difficultyTintOverlay');
                            if (overlay) {
                                overlay.classList.remove('easy','normal','hard','show');
                                // force reflow to reset transition
                                void overlay.offsetWidth;
                                overlay.classList.add(diff === 'hard' ? 'hard' : (diff === 'normal' ? 'normal' : 'easy'));
                                overlay.classList.add('show');
                                // auto fade-out after 700ms
                                setTimeout(() => { try { overlay.classList.remove('show'); } catch(_) {} }, 700);
                            }
                        } catch(_) {}
                    }

                    // Also pulse the mobile mini timer if present
                    if (diffChanged) {
                        try {
                            const mini = document.getElementById('survivalTimerMini');
                            if (mini) {
                                mini.classList.remove('difficulty-pulse');
                                void mini.offsetWidth;
                                mini.classList.add('difficulty-pulse');
                            }
                        } catch(_) {}
                    }
                    cache.diff = diff;
                    cache.equip = !!gameState.equipRunning;
                }
            } catch(_) { /* non-fatal */ }
        }
        // #endregion



// ---------------------------------------------------- 
// Global UI bindings (Extracted from engine.js) 
// ---------------------------------------------------- 
function initGlobalUI() {
            // Global click/touch ripple
            document.addEventListener('pointerdown', (e) => {
               try {
                 if (typeof window.createTouchRipple === 'function') {
                    window.createTouchRipple(e.pageX, e.pageY);
                 }
               } catch(_) {}
            }, { passive: true });
}

window.updateQuestionOvals = updateQuestionOvals;
window.scheduleProgressUIUpdate = scheduleProgressUIUpdate;
window.updateGameUI = updateGameUI;
window.updateHintButton = updateHintButton;
window.updateLevelOvals = updateLevelOvals;
window.triggerStartButtonBurst = triggerStartButtonBurst;
window.triggerEquipCorrectBurst = triggerEquipCorrectBurst;
window.animateScoreWithCounting = animateScoreWithCounting;
window.updateAdaptiveStatus = updateAdaptiveStatus;
window.animateInlineNumber = animateInlineNumber;
window.applyInlineCountToFloating = applyInlineCountToFloating;

if (typeof startStarRain !== 'undefined') window.startStarRainBINDER = startStarRain; // in case we need the local one
if (typeof stopStarRain !== 'undefined') window.stopStarRainBINDER = stopStarRain;

window.initGlobalUI = initGlobalUI;
