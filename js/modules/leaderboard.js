// Extracted from bible-challenge.html
// leaderboard.js
// Leaderboard Logic & Online Adapter

function escapeHtml(value) {
        const str = value == null ? '' : String(value);
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

function withTimeout(promise, timeoutMs, timeoutMessage) {
        const ms = Math.max(1000, Number(timeoutMs) || 7000);
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMessage || `timeout:${ms}`)), ms))
        ]);
    }

function loadLeaderboard() {
        // If online leaderboard is configured, prefer a short-lived in-memory cache
        // to avoid blocking UI on repeated loads (tabs, record view).
        try {
            const ttlMs = (window.__BC_CONSTS && window.__BC_CONSTS.LEADERBOARD_CACHE_TTL_MS) || 300000; // centralized TTL
            if (window.__lbLatestData && window.__lbLatestTs && (Date.now() - window.__lbLatestTs < ttlMs)) {
                return window.__lbLatestData;
            }
        } catch(_) {}

        let dataFromOnline = null;
        if (window.Leaderboard && typeof window.Leaderboard.load === 'function') {
            try {
                const p = window.Leaderboard.load();
                if (p && typeof p.then === 'function') {
                    const timeoutMs = (window.__BC_CONSTS && window.__BC_CONSTS.LEADERBOARD_ONLINE_TIMEOUT_MS) || 7000;
                    return withTimeout(p, timeoutMs, 'leaderboard-load-timeout')
                            .then(d => { try { window.__lbLatestData = d; window.__lbLatestTs = Date.now(); } catch(_) {}; return d; })
                            .catch(err => { console.warn('[LEADERBOARD] online load failed, using local fallback', err); const key=(window.__BC_CONSTS&&window.__BC_CONSTS.STORAGE_KEY_LEADERBOARD)||'bibleGameLeaderboard'; try { return (window.__bcStorage&&window.__bcStorage.get(key,{classic:[],survival:[]})) || JSON.parse(localStorage.getItem(key)||'{}') || {classic:[],survival:[]}; } catch(_) { return { classic:[], survival:[] }; } });
                } else {
                    dataFromOnline = p;
                }
            } catch(e) {
                console.warn('[LEADERBOARD] online load threw', e);
            }
        }

        const storedRaw = (function(){ const key=(window.__BC_CONSTS&&window.__BC_CONSTS.STORAGE_KEY_LEADERBOARD)||'bibleGameLeaderboard'; if (dataFromOnline) return dataFromOnline; try { return (window.__bcStorage&&window.__bcStorage.get(key, {})) || JSON.parse(localStorage.getItem(key)||'{}'); } catch(e) { window.__bcLog && window.__bcLog.warn('loadLeaderboard parse fail', e); return {}; } })();
        let stored = storedRaw || {};
        if (Array.isArray(stored)) {
            const newFormat = { easy: [], normal: [], hard: [] };
            stored.forEach(rec => { if (rec.difficulty && newFormat[rec.difficulty]) newFormat[rec.difficulty].push({ score: rec.score, date: rec.date }); });
            Object.keys(newFormat).forEach(k => { newFormat[k].sort((a,b)=>b.score-a.score); const lim=(window.__BC_CONSTS&&window.__BC_CONSTS.LEADERBOARD_LIMIT)||20; newFormat[k] = newFormat[k].slice(0,lim); });
            try { const key=(window.__BC_CONSTS&&window.__BC_CONSTS.STORAGE_KEY_LEADERBOARD)||'bibleGameLeaderboard'; if(window.__bcStorage) window.__bcStorage.set(key,newFormat); else localStorage.setItem(key, JSON.stringify(newFormat)); } catch(_) {}
            stored = newFormat;
        }

        let modeBased = stored;
        if (!stored.classic && !stored.survival) {
            modeBased = { classic:[], survival:[] };
            const diffs = ['easy','normal','hard'];
            diffs.forEach(d => { (stored[d]||[]).forEach(r => { const m = r.playMode || r.mode || 'classic'; if (!modeBased[m]) modeBased[m]=[]; modeBased[m].push(r); }); });
            try { const key=(window.__BC_CONSTS&&window.__BC_CONSTS.STORAGE_KEY_LEADERBOARD)||'bibleGameLeaderboard'; if(window.__bcStorage) window.__bcStorage.set(key,modeBased); else localStorage.setItem(key, JSON.stringify(modeBased)); } catch(_) {}
        }
        if (!modeBased.classic) modeBased.classic = []; if (!modeBased.survival) modeBased.survival = [];
        // Normalize via utility (ensures sorting + slicing)
        try { if (window.__normalizeLeaderboard) modeBased = window.__normalizeLeaderboard(modeBased); } catch(e){ window.__bcLog && window.__bcLog.warn('normalize in loadLeaderboard failed', e); }

        // 輕量結果立即返回，重工作延後
        const deferHeavy = () => {
            const run = () => {
                try {
                    Object.keys(modeBased).forEach(k => { (modeBased[k]||[]).forEach(r => { try { r.signatureValid = __verifySignature(r); } catch(_) { r.signatureValid = false; } }); });
                } catch(_) {}
                try {
                    Object.keys(modeBased).forEach(k => { (modeBased[k]||[]).forEach(r => {
                        if (r.timeReward != null) return;
                        const correct = r.correctAnswers != null ? r.correctAnswers : (r.totalCorrectAnswers != null ? r.totalCorrectAnswers : null);
                        const totalMistakes = r.totalMistakes != null ? r.totalMistakes : 0;
                        const levelResults = r.levelResults || {};
                        if (correct == null || r.score == null) return;
                        const base = correct * 100;
                        let bonus = 0; Object.values(levelResults).forEach(v=>{ if (v==='perfect') bonus+=300; else if (v==='complete') bonus+=100; });
                        let hintBonus = 0; if (r.hintsRemaining!=null && r.totalHints!=null) hintBonus = (r.hintsRemaining||0)*100; else if (r.totalHints!=null && r.usedHintsCount!=null){ const left = Math.max(0,(r.totalHints||0)-(r.usedHintsCount||0)); hintBonus = left*100; }
                        bonus += hintBonus;
                        r.timeReward = Math.max(0,(r.score||0)-base + (totalMistakes*50) - bonus); r.timeRewardEstimated = true;
                    }); });
                } catch(_) {}
                try {
                    const versePools = { excellent:[{text:"你們要靠主常常喜樂。我再說，你們要喜樂。",ref:"腓立比書 4:4"}], good:[{text:"我靠著那加給我力量的，凡事都能做。",ref:"腓立比書 4:13"}], encouraging:[{text:"不要失望，要堅固禱告。",ref:"帖撒羅尼迦前書 5:17"}], supportive:[{text:"耶和華是我的牧者，我必不致缺乏。",ref:"詩篇 23:1"}]};
                    const simpleHash = (str)=>{let h=0; for(let i=0;i<str.length;i++){ h=((h<<5)-h)+str.charCodeAt(i); h|=0;} return Math.abs(h); };
                    Object.keys(modeBased).forEach(k => { (modeBased[k]||[]).forEach(r => { if (r.closingVerse!=null || r.closingVerseRef!=null) return; const correct = r.correctAnswers!=null? r.correctAnswers:(r.totalCorrectAnswers!=null? r.totalCorrectAnswers:null); const totalQ = r.totalQuestions!=null? r.totalQuestions:null; if (!correct || !totalQ) return; const acc = Math.round((correct/totalQ)*100); let pool = versePools.supportive; if (acc>=90) pool=versePools.excellent; else if (acc>=70) pool=versePools.good; else if (acc>=50) pool=versePools.encouraging; const idx = simpleHash(String(r.id||'')+String(r.score||'')) % pool.length; const it = pool[idx]; r.closingVerse = it.text; r.closingVerseRef = it.ref; r.closingVerseEstimated = true; }); });
                    try { const key=(window.__BC_CONSTS&&window.__BC_CONSTS.STORAGE_KEY_LEADERBOARD)||'bibleGameLeaderboard'; if(window.__bcStorage) window.__bcStorage.set(key,modeBased); else localStorage.setItem(key, JSON.stringify(modeBased)); } catch(_) {}
                } catch(_) {}
            };
            if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 1600 }); else setTimeout(run,0);
        };
        deferHeavy();
        try { window.__lbLatestData = modeBased; window.__lbLatestTs = Date.now(); } catch(_) {}
        try { window.__bcLog && window.__bcLog.debug('Leaderboard loaded', modeBased); } catch(_) {}
        return modeBased;
    }



// 重新渲染排行榜清單：支援非同步來源、無動畫回退、減少動態偏好
// Re-render leaderboard for a mode (classic/survival); supports async adapter and reduced-motion fallback.
// 重繪排行榜卡片清單；支援非同步與減少動態回退
// Redraw leaderboard list; supports async and reduced-motion
async function updateLeaderboardDisplay(selectedMode = 'classic', options = {}) {
        const container = document.getElementById('leaderboardList');
        if (!container) return;
    try { window.__lbActiveMode = selectedMode; } catch(_) {}
        // Ensure tabs reflect current mode theme
        try { setActiveLeaderboardTabByMode && setActiveLeaderboardTabByMode(selectedMode); } catch(_) {}
        // Prevent overlapping transitions from programmatic calls
        if (options.animate && window.__lbTransitioning) return;

        // Respect reduced motion
        let reduced = false;
        try { reduced = !!(getReducedMotion && getReducedMotion()); } catch(_) {}
        const animate = !!options.animate && !reduced;
        const direction = options.direction === 'right' ? 'right' : 'left';
        if (animate && window.__lbTransitioning) return; // prevent overlapping animations

        // Use cached leaderboard data if recently fetched to avoid tab-switch lag
        const cacheFreshMs = 60000; // 60s TTL
        const hasCache = !!(window.__lbLatestData);
        const cacheFresh = hasCache && window.__lbLatestTs && (Date.now() - window.__lbLatestTs < cacheFreshMs);
        let allLeaderboards;
        if (cacheFresh) {
            allLeaderboards = window.__lbLatestData;
        } else {
            const pending = loadLeaderboard();
            const isAsync = pending && typeof pending.then === 'function';
            if (isAsync) container.setAttribute('aria-busy', 'true');
            try {
                allLeaderboards = isAsync ? await pending : pending;
                // cache the latest result for snappier tab switches
                try { window.__lbLatestData = allLeaderboards; window.__lbLatestTs = Date.now(); } catch(_) {}
            } catch (e) {
                console.warn('online leaderboard load failed; using empty fallback', e);
                allLeaderboards = { classic: [], survival: [] };
            } finally {
                container.removeAttribute('aria-busy');
            }

            // 若線上結果為空，採用本機備份做為回退來源；不主動清空本機資料，避免誤刪有效紀錄
            try {
                const isOnlineEmpty = ((allLeaderboards.classic?.length||0)===0 && (allLeaderboards.survival?.length||0)===0);
                if (isOnlineEmpty) {
                    const key = (window.__BC_CONSTS && window.__BC_CONSTS.STORAGE_KEY_LEADERBOARD) || 'bibleGameLeaderboard';
                    let localBackup = null;
                    try { localBackup = window.__bcStorage ? window.__bcStorage.get(key, { classic:[], survival:[] }) : JSON.parse(localStorage.getItem(key)||'{}'); } catch(_) { localBackup = { classic:[], survival:[] }; }
                    const hasLocal = (localBackup && ((localBackup.classic?.length||0)>0 || (localBackup.survival?.length||0)>0));
                    if (hasLocal) {
                        try { allLeaderboards = window.__normalizeLeaderboard ? window.__normalizeLeaderboard(localBackup) : localBackup; } catch(_) {}
                        try { window.__lbLatestData = allLeaderboards; window.__lbLatestTs = Date.now(); } catch(_) {}
                    }
                }
            } catch(_) {}

                    // Full leaderboard view (Top 20) logic
                    (function initFullLeaderboardFeature(){
                        if (window.__fullLbInit) return; window.__fullLbInit = true;
                        const openBtn = document.getElementById('viewAllLeaderboard');
                        const modal = document.getElementById('fullLeaderboardModal');
                        const closeX = null; // X button removed
                        const backBtn = document.getElementById('fullLbBackBtn');
                        const switchClassic = document.getElementById('switchClassicFull');
                        const switchSurvival = document.getElementById('switchSurvivalFull');
                        const boardWrapper = document.getElementById('singleFullBoard');
                        const activeModeHeading = document.getElementById('activeModeHeading');
                        const activeCountLabel = document.getElementById('activeCountLabel');
                        const lastRefreshedLabel = document.getElementById('lastRefreshedFull');
                        if (!openBtn || !modal) return;

                        // Use the unified modal manager for open/close/backdrop/esc.
                        // We only listen for modal:opened to populate contents and set the correct state.
                        const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

                        function buildCards(list, mode) {
                            const frag = document.createDocumentFragment();
                            for (let i=0;i<20;i++) {
                                const record = list[i];
                                const card = document.createElement('div');
                                card.className = 'leaderboard-card rank-default relative';
                                if (record) {
                                    const rankNumber = i+1;
                                    const playerName = record.playerName || '匿名';
                                    const safePlayerName = escapeHtml(playerName);
                                    const rankClass = (function(r){
                                        if (r>=1 && r<=10) return 'rank-'+r; return 'rank-default';
                                    })(rankNumber);
                                    card.classList.add(rankClass);
                                    card.setAttribute('data-record-id', record.id);
                                    card.setAttribute('role','button');
                                    const dateText = record.date || '';
                                    const elapsedText = record.elapsed || record.time || '';
                                    const safeDateText = escapeHtml(dateText);
                                    const safeElapsedText = escapeHtml(elapsedText);
                                    card.innerHTML = `
                                        <div class="fl-rank">${rankNumber}</div>
                                        <div class="fl-body">
                                            <div class="fl-row1">
                                                <div class="fl-score">${record.score}<span class="unit">分</span></div>
                                                <div class="fl-name" title="${safePlayerName}">${safePlayerName}</div>
                                            </div>
                                            <div class="fl-meta">
                                                <span class="fl-date">${safeDateText}</span>
                                                ${safeElapsedText ? `<span class=\"fl-elapsed\">${safeElapsedText}</span>` : ''}
                                            </div>
                                        </div>`;
                                    card.addEventListener('click', () => { openLeaderboardRecordById(record.id, record.playMode || mode || 'classic'); });
                                } else {
                                    card.innerHTML = `
                                        <div class="fl-rank" style="opacity:.35;">-</div>
                                        <div class="fl-body flex items-center justify-center text-center" style="min-height:2.4rem;">
                                            <div class="text-[0.6rem] font-semibold text-gray-400">空位</div>
                                        </div>`;
                                    card.setAttribute('aria-hidden','true');
                                    card.classList.add('empty-slot');
                                    card.style.pointerEvents = 'none';
                                }
                                frag.appendChild(card);
                            }
                            return frag;
                        }

                        function populate(mode) {
                            if (!boardWrapper) return;
                            boardWrapper.innerHTML = '';
                            try {
                                const data = window.__lbLatestData || { classic: [], survival: [] };
                                const lim = (window.__BC_CONSTS&&window.__BC_CONSTS.LEADERBOARD_LIMIT)||20;
                                const list = (data[mode]||[]).slice(0,lim);
                                boardWrapper.appendChild(buildCards(list, mode));
                                if (activeCountLabel) activeCountLabel.textContent = `(${list.length})`;
                                if (activeModeHeading) {
                                    activeModeHeading.firstChild && (activeModeHeading.firstChild.textContent = mode==='survival' ? '生存計時' : '闖關挑戰');
                                    activeModeHeading.classList.remove('text-indigo-600','text-pink-600','text-green-600','text-red-600');
                                    activeModeHeading.classList.add(mode==='survival' ? 'text-green-600' : 'text-red-600');
                                }
                                if (lastRefreshedLabel) lastRefreshedLabel.textContent = new Date().toLocaleTimeString();
                            } catch(_) {}
                            try {
                                const cards = boardWrapper.querySelectorAll('.leaderboard-card');
                                cards.forEach((c,i)=>{ c.classList.add('fl-appear'); c.style.animationDelay = (i*30)+'ms'; });
                                // 綁定點擊爆星（統一 1~10 名色系）
                                // Rank color themes mapped to supplied tier image (Iron→Challenger)
                                // 1: Challenger, 2: Grandmaster, 3: Master, 4: Diamond, 5: Emerald, 6: Platinum, 7: Gold, 8: Silver, 9: Bronze, 10: Iron
                                const rankBurstPalette = (r)=>{
                                    const map={
                                        1:['#29D4FF','#1FA4FF','#1784F8','#FFB347','#FFE49A'], // Challenger (cyan core + warm gold edge)
                                        2:['#FF7A45','#FF6231','#E63B11','#FF9D6E','#FFD1BD'], // Grandmaster (fiery red/orange)
                                        3:['#CE7BFF','#B657F6','#9B35E8','#F1B5FF','#7F2CCB'], // Master (violet/purple)
                                        4:['#7AD6FF','#5CB8FF','#3E9DFF','#2764F5','#A1E6FF'], // Diamond (cool blue gradient)
                                        5:['#28D478','#14B863','#0F9E55','#66E3A3','#B4F8D5'], // Emerald (vivid green)
                                        6:['#64E0F5','#39C9EB','#1CA9D6','#1288B7','#A6F1FC'], // Platinum (aqua / teal-blue)
                                        7:['#FBD24E','#F5B732','#E69914','#FFEA9A','#F59E0B'], // Gold
                                        8:['#E5E7EB','#D1D5DB','#ADB5C3','#F8FAFC','#9CA3AF'], // Silver
                                        9:['#D8905F','#C6793F','#B16329','#E8B790','#734224'], // Bronze
                                        10:['#6B6B6B','#555555','#3F3F3F','#9D9D9D','#262626'] // Iron
                                    }; return map[r]||['#E5E7EB','#D1D5DB','#9CA3AF','#F3F4F6'];
                                };
                                cards.forEach(card=>{
                                    // 僅對有資料 (data-record-id) 的卡片附加點擊特效，避免空位可點擊
                                    if(!card.hasAttribute('data-record-id')) return;
                                    card.addEventListener('click', (ev)=>{
                                        try {
                                            const rect=card.getBoundingClientRect();
                                            let rank=0; const rEl=card.querySelector('.lb-rank-ribbon span,.fl-rank'); if(rEl) rank=parseInt(rEl.textContent,10)||0;
                                            const colors=rankBurstPalette(rank);
                                            const scaleMap={1:{c:26,min:70,max:200,dur:1600},2:{c:22,min:66,max:180,dur:1550},3:{c:20,min:60,max:170,dur:1500},4:{c:18,min:56,max:160,dur:1450},5:{c:16,min:50,max:150,dur:1400},6:{c:14,min:46,max:140,dur:1350},7:{c:13,min:42,max:130,dur:1300},8:{c:12,min:38,max:120,dur:1250},9:{c:11,min:34,max:110,dur:1200},10:{c:10,min:30,max:100,dur:1150}};
                                            const conf=scaleMap[rank]||{c:10,min:28,max:96,dur:1100};
                                            spawnScoreParticles(80, rect, { colors, count:conf.c, distanceMin:conf.min, distanceMax:conf.max, durationMs:conf.dur });
                                        } catch(_) {}
                                    }, { passive:true });
                                });
                            } catch(_) {}
                        }

                        function detectActiveMode(){
                            try {
                                const tab = document.querySelector('.leaderboard-tab[aria-selected="true"]');
                                if (tab) {
                                    const m = (tab.dataset.mode||'').toLowerCase();
                                    if (/survival/.test(m)) return 'survival';
                                    if (/classic/.test(m)) return 'classic';
                                }
                            } catch(_) {}
                            if (window.__lbActiveMode) return window.__lbActiveMode;
                            return 'classic';
                        }

                        function setSwitchState(mode){
                            const activeStyles = (btn, type) => {
                                if (!btn) return;
                                btn.setAttribute('aria-selected','true');
                                btn.setAttribute('aria-pressed','true');
                                btn.style.background = type==='classic' ? 'linear-gradient(90deg,#F87171,#DC2626)' : 'linear-gradient(90deg,#34D399,#059669)';
                                btn.style.color = '#fff';
                                btn.style.boxShadow = '0 4px 12px -3px rgba(0,0,0,.25)';
                            };
                            const inactiveStyles = (btn) => {
                                if (!btn) return;
                                btn.setAttribute('aria-selected','false');
                                btn.setAttribute('aria-pressed','false');
                                btn.style.background = 'transparent';
                                btn.style.color = '#475569';
                                btn.style.boxShadow = 'none';
                            };
                            if (mode==='classic') { activeStyles(switchClassic,'classic'); inactiveStyles(switchSurvival); }
                            else { activeStyles(switchSurvival,'survival'); inactiveStyles(switchClassic); }
                        }

                        // Populate when opened via the unified modal manager (data-open-modal attribute on the button already exists)
                        document.addEventListener('modal:opened', (ev)=>{
                            try {
                                if (!ev || !ev.detail || ev.detail.id !== 'fullLeaderboardModal') return;
                                const activeMode = detectActiveMode();
                                setSwitchState(activeMode);
                                populate(activeMode);
                                // Hint for screen readers
                                try { announce && announce(`已開啟${activeMode==='survival'?'生存計時':'闖關挑戰'}排行榜對話框`); } catch(_) {}
                                const first = modal.querySelector(focusableSelectors);
                                if (first) first.focus();
                            } catch(_) {}
                        });
                        // Back button already has data-close-modal; no extra handler needed.
                        // Backdrop click and ESC are handled by the unified manager.
                        if (switchClassic) switchClassic.addEventListener('click', ()=>{ setSwitchState('classic'); populate('classic'); try { announce && announce('切換至闖關挑戰排行榜'); } catch(_) {} });
                        if (switchSurvival) switchSurvival.addEventListener('click', ()=>{ setSwitchState('survival'); populate('survival'); try { announce && announce('切換至生存計時排行榜'); } catch(_) {} });
                    })();

        }

        const difficultyLeaderboard = (allLeaderboards && allLeaderboards[selectedMode]) || [];

        // Helper to build a pane's grid content
        const buildPaneContent = (paneEl) => {
            paneEl.innerHTML = '';
            for (let i = 0; i < 5; i++) {
                const column = document.createElement('div');
                column.className = 'text-center';
                if (i < difficultyLeaderboard.length) {
                    const record = difficultyLeaderboard[i];
                    const rankNumber = i + 1;
                    const playerName = record.playerName || '匿名';
                    const safePlayerName = escapeHtml(playerName);
                    const rarity = record.rarity || null;
                    const rarityLabelMap = { common: '常見經文', rare: '冷門經文', all: '全部經文' };
                    const rarityLabel = rarity ? (rarityLabelMap[rarity] || '未知') : null;
                    const rankClass = (function(r){ if (r>=1 && r<=10) return 'rank-'+r; return 'rank-default'; })(rankNumber);
                    const aria = escapeHtml(`第${rankNumber}名，${playerName}，${record.score}分`);
                    const safeDateText = escapeHtml(record.date || '');
                    const safeElapsedText = escapeHtml(record.elapsed || record.time || '');
                    const safeRarityLabel = escapeHtml(rarityLabel || '');
                    column.innerHTML = `
                        <div class="leaderboard-card ${rankClass}" data-record-id="${record.id}" title="${safePlayerName}" role="button" aria-label="${aria}">
                            <div class="lb-rank-ribbon"><span>${rankNumber}</span></div>
                            <div class="lb-card-body text-left">
                                <div class="lb-top-row">
                                    <div class="lb-score">${record.score}<span class="unit">分</span></div>
                                    <div class="lb-name flex-1 min-w-0"><span class="truncate" title="${safePlayerName}">${safePlayerName}</span></div>
                                </div>
                                <div class="lb-meta">${safeDateText}${safeElapsedText ? ' · ' + safeElapsedText : ''}</div>
                                ${safeRarityLabel ? `<div class=\"mt-1\">\n                                        <span class=\"lb-pill ${rarity === 'all' ? 'rarity-all' : rarity === 'rare' ? 'rarity-rare' : 'rarity-common'}\">${safeRarityLabel}</span>\n                                    </div>` : ''}
                            </div>
                        </div>
                    `;
                } else {
                    column.innerHTML = `
                        <div class="leaderboard-card rank-default" aria-hidden="true">
                            <div class="lb-rank-ribbon"><span>-</span></div>
                            <div class="lb-card-body text-center" style="min-height: 3.2rem; display: flex; align-items: center; justify-content: center;">
                                <div class="text-sm font-semibold text-gray-400">暫無記錄</div>
                            </div>
                        </div>
                    `;
                }
                paneEl.appendChild(column);
            }
        };

        // Acquire panes
        let currentPane = container.querySelector('[data-lb-pane="current"]');
        let nextPane = document.createElement('div');
        nextPane.className = 'lb-slide grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4';
        nextPane.setAttribute('data-lb-pane', 'next');

        buildPaneContent(nextPane);

        // Helper to attach card click handlers within a pane
        const bindPaneInteractions = (pane) => {
            pane.querySelectorAll('[data-record-id]').forEach(el => {
                el.style.cursor = 'pointer';
                el.addEventListener('click', () => {
                    try {
                        const rect = el.getBoundingClientRect();
                        let rank = 0;
                        try {
                            const ribbon = el.querySelector('.lb-rank-ribbon span');
                            rank = ribbon ? parseInt(ribbon.textContent, 10) || 0 : 0;
                        } catch(_) {}
                        // Main menu burst palette (same mapping as modal)
                        const rankPalettes = (r)=>{
                            const map={
                                1:['#29D4FF','#1FA4FF','#1784F8','#FFB347','#FFE49A'],
                                2:['#FF7A45','#FF6231','#E63B11','#FF9D6E','#FFD1BD'],
                                3:['#CE7BFF','#B657F6','#9B35E8','#F1B5FF','#7F2CCB'],
                                4:['#7AD6FF','#5CB8FF','#3E9DFF','#2764F5','#A1E6FF'],
                                5:['#28D478','#14B863','#0F9E55','#66E3A3','#B4F8D5'],
                                6:['#64E0F5','#39C9EB','#1CA9D6','#1288B7','#A6F1FC'],
                                7:['#FBD24E','#F5B732','#E69914','#FFEA9A','#F59E0B'],
                                8:['#E5E7EB','#D1D5DB','#ADB5C3','#F8FAFC','#9CA3AF'],
                                9:['#D8905F','#C6793F','#B16329','#E8B790','#734224'],
                                10:['#6B6B6B','#555555','#3F3F3F','#9D9D9D','#262626']
                            }; return map[r]||['#E5E7EB','#D1D5DB','#9CA3AF','#F3F4F6'];
                        };
                        const colors = rankPalettes(rank);
                        const scaleMap={1:{c:26,min:70,max:200,dur:1600},2:{c:22,min:66,max:180,dur:1550},3:{c:20,min:60,max:170,dur:1500},4:{c:18,min:56,max:160,dur:1450},5:{c:16,min:50,max:150,dur:1400},6:{c:14,min:46,max:140,dur:1350},7:{c:13,min:42,max:130,dur:1300},8:{c:12,min:38,max:120,dur:1250},9:{c:11,min:34,max:110,dur:1200},10:{c:10,min:30,max:100,dur:1150}};
                        const conf=scaleMap[rank]||{c:10,min:28,max:96,dur:1100};
                        spawnScoreParticles(80, rect, { colors, count:conf.c, distanceMin:conf.min, distanceMax:conf.max, durationMs:conf.dur });
                    } catch(_) {}
                    const id = el.getAttribute('data-record-id');
                    openLeaderboardRecordById(id, selectedMode);
                });
            });
        };

        // Personal rank tile (append to pane)
        const maybeAppendPersonalRank = async (pane) => {
            try {
                const playerName = (typeof getSavedPlayerName === 'function') ? getSavedPlayerName() : ((window.localStorage && (localStorage.getItem('bibleGamePlayerName')||localStorage.getItem('lastPlayerName'))) || '');
                if (playerName && window.Leaderboard && typeof window.Leaderboard.load === 'function') {
                    const cfg = window.SUPABASE_CONFIG;
                    if (cfg && window.supabase && window.supabase.createClient) {
                        const client = (window.getSupabaseClient && window.getSupabaseClient()) || null;
                        const topList = difficultyLeaderboard;
                        const selfTop = topList.find(r => (r.playerName||'') === playerName);
                        if (!selfTop) {
                            let q1 = client
                                .from(cfg.table || 'scores')
                                .select('score, created_at')
                                .eq('play_mode', selectedMode)
                                .eq('player_name', playerName);
                            if (cfg.projectTag) q1 = q1.or(`project_tag.eq.${cfg.projectTag},project_tag.is.null`);
                            const { data: myRows, error: myErr } = await q1
                                .order('score', { ascending: false })
                                .order('created_at', { ascending: true })
                                .limit(1);
                            if (!myErr && myRows && myRows.length) {
                                const my = myRows[0];
                                let q2 = client
                                    .from(cfg.table || 'scores')
                                    .select('id', { count: 'exact', head: true })
                                    .eq('play_mode', selectedMode)
                                    .gt('score', my.score);
                                if (cfg.projectTag) q2 = q2.or(`project_tag.eq.${cfg.projectTag},project_tag.is.null`);
                                const { data: cntRows } = await q2;
                                const betterCount = (cntRows && cntRows.length) ? cntRows.length : (cntRows && cntRows.count) ? cntRows.count : 0;
                                const rank = (betterCount || 0) + 1;
                                if (rank > 5) {
                                    const row = document.createElement('div');
                                    row.className = 'col-span-full mt-2';
                                    const safePlayerName = escapeHtml(playerName);
                                    const safeSelectedMode = escapeHtml(selectedMode);
                                    row.innerHTML = `
                                        <div class="leaderboard-card rank-default" aria-live="polite">
                                            <div class="lb-rank-ribbon"><span>${rank}</span></div>
                                            <div class="lb-card-body text-left">
                                                <div class="lb-top-row">
                                                    <div class="lb-score">個人名次<span class="unit"></span></div>
                                                    <div class="lb-name flex-1 min-w-0"><span class="truncate" title="${safePlayerName}">${safePlayerName}</span></div>
                                                </div>
                                                <div class="lb-meta">目前於「${safeSelectedMode}」模式的估計名次</div>
                                            </div>
                                        </div>
                                    `;
                                    pane.appendChild(row);
                                }
                            }
                        }
                    }
                }
            } catch (e) { /* non-fatal */ }
        };

        // Ensure swipe is initialized once
        try { if (!container.__swipeSetup) { setupLeaderboardSwipe(); container.__swipeSetup = true; } } catch(_) {}

        // If there's no current pane or animation is disabled, just render statically
        if (!animate || !container.querySelector('[data-lb-pane="current"]')) {
            // Clear and mount as static
            container.innerHTML = '';
            nextPane.classList.add('lb-slide-static');
            nextPane.setAttribute('data-lb-pane', 'current');
            container.appendChild(nextPane);
            window.__lbCurrentMode = selectedMode;
            bindPaneInteractions(nextPane);
            // Defer personal-rank query so it won't block initial render
            try { Promise.resolve(maybeAppendPersonalRank(nextPane)).catch(() => {}); } catch(_) {}
            return;
        }

        // Animated transition between panes
        currentPane = container.querySelector('[data-lb-pane="current"]');
        if (!currentPane) {
            // Fallback to static if somehow missing
            container.innerHTML = '';
            nextPane.classList.add('lb-slide-static');
            nextPane.setAttribute('data-lb-pane', 'current');
            container.appendChild(nextPane);
            window.__lbCurrentMode = selectedMode;
            bindPaneInteractions(nextPane);
            await maybeAppendPersonalRank(nextPane);
            return;
        }

        bindPaneInteractions(nextPane);
        // Defer personal-rank query to avoid delaying animation start
        try { Promise.resolve(maybeAppendPersonalRank(nextPane)).catch(() => {}); } catch(_) {}

        // Determine mobile to use crossfade instead of slide to avoid double-stack on small screens
        let isMobile = false;
        try { isMobile = !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches); } catch(_) { isMobile = (window.innerWidth <= 640); }

        // Lock container height during transition to prevent collapse
        const currentH = currentPane.offsetHeight;
        if (currentH && currentH > 0) container.style.height = currentH + 'px';

        currentPane.classList.remove('lb-slide-static');
        container.appendChild(nextPane);

        // Measure next height after insertion
        const nextH = nextPane.offsetHeight;
        const targetH = Math.max(currentH || 0, nextH || 0);
        if (targetH && targetH > 0) container.style.height = targetH + 'px';

        window.__lbTransitioning = true;
        // Disable pointer events on tabs and container while animating
        try {
            document.querySelectorAll('.leaderboard-tab').forEach(t => t.style.pointerEvents = 'none');
            container.style.pointerEvents = 'none';
        } catch(_) {}
        if (isMobile) {
            // Crossfade: keep both panes stacked, fade out current, fade in next
            try {
                // Reset transforms for crossfade
                currentPane.style.transform = 'none';
                nextPane.style.transform = 'none';
                nextPane.style.opacity = '0';
                // Force reflow
                void nextPane.offsetWidth;
            } catch(_) {}
            requestAnimationFrame(() => {
                try {
                    currentPane.style.opacity = '0';
                    nextPane.style.opacity = '1';
                } catch(_) {}
            });
        } else {
            // Slide transition
            nextPane.style.transform = (direction === 'left') ? 'translateX(100%)' : 'translateX(-100%)';
            requestAnimationFrame(() => {
                try {
                    currentPane.style.transform = (direction === 'left') ? 'translateX(-100%)' : 'translateX(100%)';
                    nextPane.style.transform = 'translateX(0)';
                } catch(_) {}
            });
        }

        let done = false;
        const cleanup = () => {
            if (done) return; done = true;
            try { currentPane.remove(); } catch(_) {}
            nextPane.classList.add('lb-slide-static');
            nextPane.setAttribute('data-lb-pane', 'current');
            nextPane.style.transform = '';
            nextPane.style.opacity = '';
            window.__lbCurrentMode = selectedMode;
            window.__lbTransitioning = false;
            container.style.height = '';
            nextPane.removeEventListener('transitionend', cleanup);
            // Re-enable interactions
            try {
                document.querySelectorAll('.leaderboard-tab').forEach(t => t.style.pointerEvents = '');
                container.style.pointerEvents = '';
            } catch(_) {}
        };
        nextPane.addEventListener('transitionend', cleanup);
        // Fallback: in case transitionend doesn't fire (e.g., display change), force cleanup
        setTimeout(cleanup, 800);
    }
    // #endregion







    // 單次初始化旗標，避免重建造成閃爍
    window.__marqueeInitialized = window.__marqueeInitialized || false;

// #region 初始化與跑馬燈
// 初始化經文跑馬燈：桌面高密度、手機精簡；支援「偏好減少動態」改渲染成靜態行
// Initialize verse marquee: dense on desktop, reduced on mobile; honor reduced motion with static lines
// 初始化首頁跑馬燈（動態經文牆），考慮行動裝置與減少動態
// Initialize the verse marquee on the start screen
function initializeVerseMarquee() {
        const marqueeContainer = document.getElementById('verseMarquee');
        if (!marqueeContainer) return;
        // On small screens, render a reduced-density marquee instead of disabling
        let mobileLite = false;
        try {
            mobileLite = !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches);
        } catch (_) { mobileLite = (window.innerWidth <= 640); }
        let lowEndDevice = false;
        try {
            const cores = Number(navigator.hardwareConcurrency || 0);
            const mem = Number(navigator.deviceMemory || 0);
            lowEndDevice = (cores > 0 && cores <= 4) || (mem > 0 && mem <= 4);
        } catch(_) { lowEndDevice = false; }
        if (window.__marqueeInitialized) return; // 防止重複初始化

        // 構建期間暫時隱藏，避免首度渲染閃爍
        const prevVisibility = marqueeContainer.style.visibility;
        marqueeContainer.style.visibility = 'hidden';
        marqueeContainer.innerHTML = '';

        // 行數：桌面 34，手機 10；低階裝置再降載
        const totalLines = mobileLite ? (lowEndDevice ? 8 : 10) : (lowEndDevice ? 22 : 34);
        const __activeDB = getActiveVerseDB();
        const __commonPool = Array.isArray(__activeDB) ? __activeDB.filter(v => v && v.rarity === 'common') : [];
        const fallbackVersePool = [
            '耶和華是我的牧者，我必不致缺乏。',
            '我靠著那加給我力量的，凡事都能做。',
            '你要專心仰賴耶和華，不可倚靠自己的聰明。',
            '你們要靠主常常喜樂。',
            '你的話是我腳前的燈，是我路上的光。',
            '神愛世人，甚至將他的獨生子賜給他們。',
            '你當剛強壯膽，不要懼怕。',
            '願主耶穌基督的恩常與你們同在。'
        ];
        const sourcePool = (__commonPool && __commonPool.length > 0)
            ? __commonPool
            : fallbackVersePool.map(t => ({ verse: t, rarity: 'common' }));
        try { window.__marqueeUsingFallback = !(__commonPool && __commonPool.length > 0); } catch(_) {}

        const shuffledVerses = [...sourcePool].sort(() => Math.random() - 0.5);
        const selectedVerses = shuffledVerses
            .slice(0, totalLines)
            .map(v => (typeof v === 'string' ? v : (v && v.verse ? v.verse : '')))
            .filter(Boolean);

        // 若使用者偏好減少動態，直接渲染靜態多行文字並退出
        if (getReducedMotion && getReducedMotion()) {
            const frag = document.createDocumentFragment();
            for (let i = 0; i < Math.min(totalLines, selectedVerses.length); i++) {
                const verseElement = document.createElement('div');
                verseElement.className = 'verse-text';
                verseElement.style.animation = 'none';
                verseElement.style.position = 'relative';
                verseElement.style.top = 'auto';
                verseElement.style.left = 'auto';
                verseElement.style.transform = 'none';
                verseElement.style.opacity = '0.65';
                verseElement.style.filter = 'none';
                verseElement.style.fontSize = '1rem';
                verseElement.style.textShadow = 'none';
                verseElement.style.margin = '2px 0';
                verseElement.textContent = selectedVerses[i] || '';
                frag.appendChild(verseElement);
            }
            marqueeContainer.appendChild(frag);
            marqueeContainer.style.visibility = prevVisibility || '';
            window.__marqueeInitialized = true;
            return;
        }

        // 預設的字體大小基準值（以 rem 為單位）。手機使用更小字級範圍，減少遮擋與重繪。
        const baseFontSizes = mobileLite
            ? [1.2,1.4,1.6,1.8,2.0,1.5,1.7,1.3,1.9,2.1,1.6,1.4,1.8,1.2,1.7]
            : [2.6,3.2,3.6,4.2,3.4,4.6,3.9,4.0,3.3,4.8,3.7,2.9,3.0,4.4,3.5,5.2,6.5];
        const baseMin = Math.min(...baseFontSizes);
        const baseMax = Math.max(...baseFontSizes);
        const newMin = baseMin * 0.5; // 最小值 x0.5
        const newMax = baseMax * 2;   // 最大值 x2
        // 線性映射函數，保持原始分佈比例
        const scaledFontSizes = baseFontSizes.map(s => {
            if (baseMax === baseMin) return newMin;
            const t = (s - baseMin) / (baseMax - baseMin);
            return (newMin + t * (newMax - newMin));
        });

        // 速度群組（秒）：低階裝置降低總動畫壓力
        const speedGroups = mobileLite
            ? (lowEndDevice ? [16, 24, 34] : [12, 18, 26])
            : (lowEndDevice ? [22, 34, 52] : [18, 30, 45]);
        const maxDuration = Math.max(...speedGroups);

        // richer color pool (主色 + glow)，循環使用
        const colorPool = [
            { c: '255,99,132',   a: 0.14 }, // pink-red
            { c: '255,159,64',   a: 0.12 }, // orange
            { c: '255,205,86',   a: 0.10 }, // yellow
            { c: '75,192,192',   a: 0.10 }, // teal
            { c: '54,162,235',   a: 0.11 }, // blue
            { c: '153,102,255',  a: 0.12 }, // purple
            { c: '201,203,207',  a: 0.08 }, // gray
            { c: '99,102,241',   a: 0.11 }, // indigo
            { c: '16,185,129',   a: 0.10 }, // green
            { c: '236,72,153',   a: 0.12 }  // fuchsia
        ];

        const frag = document.createDocumentFragment();
        const sharedPool = sourcePool;
        const sharedPoolLen = sharedPool.length;
        const pickVerse = () => {
            if (sharedPoolLen <= 0) return '';
            const v = sharedPool[Math.floor(Math.random() * sharedPoolLen)];
            return (typeof v === 'string') ? v : (v ? (v.verse || '') : '');
        };
        for (let i = 0; i < totalLines; i++) {
            const verseElement = document.createElement('div');
            verseElement.className = 'verse-text';

            // For each line, pick 3 random verses to rotate through on each full marquee cycle
            const picks = [];
            for (let p = 0; p < 3; p++) {
                const text = pickVerse();
                if (text) picks.push(text);
            }
            // ensure we have at least one fallback
            if (picks.length === 0) picks.push(selectedVerses[i] || '');
            verseElement.textContent = picks[0] || '';
            // attach list and index for iteration handler
            verseElement.__marqueeList = picks;
            verseElement.__marqueeIdx = 0;
            // on each completed animation loop, switch to the next verse in this line's list
            verseElement.addEventListener('animationiteration', function() {
                try {
                    this.__marqueeIdx = (this.__marqueeIdx + 1) % (this.__marqueeList ? this.__marqueeList.length : 1);
                    const next = (this.__marqueeList && this.__marqueeList[this.__marqueeIdx]) || '';
                    this.textContent = next;
                } catch (e) { /* ignore */ }
            });

            // 垂直位置以百分比計算，平均分布並保持在視窗外開始/結束
            // 中心偏移控制讓行分布更加均勻
            const centerOffset = mobileLite ? -20 : -30; // 起始偏移
            const step = mobileLite ? 8 : 6; // 每行間距百分比（行距已在 CSS 中調整）
            const vpos = Math.round(centerOffset + i * step);
            verseElement.style.top = `${vpos}%`;

            // 固定 line-height（見 CSS），僅改變 font-size
            const chosenSizeValue = scaledFontSizes[i % scaledFontSizes.length];
            const chosenSize = `${chosenSizeValue}rem`;
            verseElement.style.fontSize = chosenSize;

            // 分配速度群組：循環分配以在視覺上產生深度
            const duration = speedGroups[i % speedGroups.length];
            verseElement.style.animationDuration = `${duration}s`;
            verseElement.style.animation = `marquee-horizontal ${duration}s linear infinite`;

            // 依據字體大小計算深度感（越大視為越靠前）
            const depthNormalized = (chosenSizeValue - newMin) / (newMax - newMin); // 0..1
            const zIndex = 10 + Math.round(depthNormalized * 90); // 10..100
            verseElement.style.zIndex = zIndex;

            // 依深度調整模糊（遠處較模糊）與透明度
            const maxBlur = mobileLite ? 2.0 : 3.0; // px
            const blurPx = Math.round((1 - depthNormalized) * maxBlur * 10) / 10; // 0..maxBlur
            verseElement.style.filter = `blur(${blurPx}px)`;

            // 顏色與發光：根據索引選用 colorPool，並以速度群組與深度增加層次
            const colorEntry = colorPool[i % colorPool.length];
            const baseAlpha = colorEntry.a;
            const speedIndex = i % speedGroups.length; // 0 fast,1 mid,2 slow
            // 深度會讓近處更飽滿、遠處較淡
            const depthFactor = 0.8 + depthNormalized * 1.2; // 0.8..2.0
            const finalAlpha = Math.max(0.04, Math.min(0.30, baseAlpha * depthFactor * (1 - speedIndex * 0.08)));
            verseElement.style.color = `rgba(${colorEntry.c}, ${finalAlpha})`;

            // text-shadow 作為 glow，近處給較強光暈，遠處較弱；慢速群組更強
            if (mobileLite) {
                // 手機版：移除光暈 (Glow) 以降低 GPU 負載 (效能優化)
                verseElement.style.textShadow = 'none';
            } else {
                const glowBase = 12 + Math.round((10 + speedIndex * 8) * (0.6 + depthNormalized * 1.2));
                const glowAlpha = Math.min(0.45, 0.10 + speedIndex * 0.06 + depthNormalized * 0.12 + (i % 5) * 0.01);
                verseElement.style.textShadow = `0 0 ${glowBase}px rgba(${colorEntry.c}, ${glowAlpha}), 0 2px ${Math.round(glowBase/3)}px rgba(0,0,0,0.06)`;
            }

            // 透明度整體表現結合深度與速度（近處與慢速看起來更清晰）
            const baseOpacity = (mobileLite ? 0.35 : 0.55) + depthNormalized * (mobileLite ? 0.35 : 0.45);
            verseElement.style.opacity = `${Math.max(0.18, Math.min(1, baseOpacity - speedIndex * 0.10))}`;

            // 使用最大持續時間來計算延遲步進以避免短速組合時同時出現
            const delayStep = maxDuration / totalLines;
            verseElement.style.animationDelay = `${i * -delayStep}s`;

            frag.appendChild(verseElement);
        }
        marqueeContainer.appendChild(frag);
        marqueeContainer.style.visibility = prevVisibility || '';
        window.__marqueeInitialized = true;
    }

    // 若外部資料於初始化後才抵達，更新每行的輪播備選內容，避免重建造成閃爍
// 重新整理跑馬燈資料來源（依當前題庫）
// Refresh marquee dataset from current verse DB
function refreshVerseMarqueeData() {
        try {
const marqueeContainer = document.getElementById('verseMarquee');
const activeDB = getActiveVerseDB();
const pool = Array.isArray(activeDB) ? activeDB.filter(v => v && v.rarity === 'common') : [];
if (!marqueeContainer || !Array.isArray(pool) || pool.length === 0) return;
            // 若先前因資料未就緒而未完成初始化，資料到齊後在此補做一次初始化
            if (!window.__marqueeInitialized && typeof initializeVerseMarquee === 'function') {
                initializeVerseMarquee();
                return;
            }
            const lines = marqueeContainer.querySelectorAll('.verse-text');
            if (!lines || lines.length === 0) {
                try { initializeVerseMarquee(); } catch(_) {}
                return;
            }
            const poolLen = pool.length;
            const pickVerse = () => {
                if (poolLen <= 0) return '';
                const item = pool[Math.floor(Math.random() * poolLen)];
                return item ? (item.verse || '') : '';
            };
            lines.forEach(line => {
                const picks = [];
                for (let p = 0; p < 3; p++) {
                    const text = pickVerse();
                    if (text) picks.push(text);
                }
                if (picks.length === 0) picks.push(line.textContent || '');
                line.__marqueeList = picks;
                // reduced-motion 靜態模式：即時更新顯示文字
                if (getReducedMotion && getReducedMotion()) {
                    line.textContent = picks[0] || '';
                }
            });
        } catch (e) { /* ignore */ }
    }

    // Online Leaderboard Adapter (Supabase) — optional
    // Provide a global window.Leaderboard with methods: load(), save(record), clear()
    // Requires a config file bible-challenge/leaderboard-config.js that defines window.SUPABASE_CONFIG = { url, anonKey, table }
    function installOnlineLeaderboardAdapter(){
        try {
            const cfg = (window && window.SUPABASE_CONFIG) || null;
            if (!cfg || !cfg.url || !cfg.anonKey) return; // not configured
            if (!(window.supabase && typeof window.supabase.createClient === 'function')) return; // client not loaded

            const baseOpts = cfg.options || {};
            const opts = cfg.projectTag
                ? {
                    ...baseOpts,
                    global: {
                        ...(baseOpts.global || {}),
                        headers: {
                            ...(((baseOpts.global || {}).headers) || {}),
                            'x-project-tag': cfg.projectTag
                        }
                    }
                  }
                : baseOpts;
            const client = (window.getSupabaseClient && window.getSupabaseClient()) || null;
            if (!client) return;
            const table = cfg.table || 'scores';

            function toPublicRecord(row){
                if (!row) return null;
                // Map DB row into app record shape
                return {
                    id: row.id || row.created_at || row.rowid || Date.now(),
                    playerName: row.player_name || row.playerName || '匿名',
                    score: row.score || 0,
                    difficulty: row.difficulty || 'easy',
                    date: row.date || (row.created_at ? new Date(row.created_at).toLocaleDateString('zh-TW') : ''),
                    time: row.time || '',
                    // Also expose an 'elapsed' alias for UI fallbacks
                    elapsed: row.time || null,
                    completed: row.completed ?? true,
                    correctAnswers: row.correct_answers ?? row.correctAnswers ?? null,
                    totalQuestions: row.total_questions ?? row.totalQuestions ?? null,
                    totalMistakes: row.total_mistakes ?? row.totalMistakes ?? null,
                    levelResults: row.level_results ?? row.levelResults ?? {},
                    range: row.range || 'all',
                    rarity: row.rarity || null,
                    mode: row.mode || 'ranking',
                    playMode: row.play_mode || row.playMode || 'classic',
                    testament: row.testament || 'both',
                    customBooks: row.custom_books || [],
                    hintsRemaining: row.hints_remaining ?? null,
                    totalHints: row.total_hints ?? null,
                    showTimeReward: row.show_time_reward ?? false,
                    timeReward: row.time_reward ?? null,
                    usedHintsCount: row.used_hints_count ?? null,
                    closingVerse: row.closing_verse ?? null,
                    closingVerseRef: row.closing_verse_ref ?? null,
                    questionSnapshot: row.question_snapshot ?? null,
                    // Read-through of new average speed columns when available
                    avgAnswerMs: row.avg_answer_ms ?? row.avgAnswerMs ?? null,
                    avgPerfectAnswerMs: row.avg_perfect_answer_ms ?? row.avgPerfectAnswerMs ?? null,
                    // Perfect answer count (no-hint and first-try correct)
                    perfectAnswerCount: row.perfect_answer_count ?? row.perfectAnswerCount ?? row.perfect_count ?? null,
                    // Read-through new combo fields for consistent breakdown display
                    maxComboReached: row.max_combo_reached ?? row.maxComboReached ?? null,
                    comboTotalBonus: row.combo_total_bonus ?? row.comboTotalBonus ?? null,
                    // Provide a minimal finalMetrics to ease consumers looking under this key
                    finalMetrics: (function(){
                        const fm = {};
                        if (typeof row.avg_answer_ms === 'number') fm.avgAnswerMs = row.avg_answer_ms;
                        if (typeof row.avg_perfect_answer_ms === 'number') fm.avgPerfectAnswerMs = row.avg_perfect_answer_ms;
                        if (typeof row.max_combo_reached === 'number') fm.maxComboReached = row.max_combo_reached;
                        return Object.keys(fm).length ? fm : undefined;
                    })(),
                    achievements: row.achievements ?? row.achievement_list ?? []
                    ,isSeed: row.is_seed ?? row.isSeed ?? false
                };
            }

            async function hydrateAchievementsFromRuns(records){
                try {
                    if (!Array.isArray(records) || records.length === 0) return records;
                    const missing = records.filter(r => r && (!Array.isArray(r.achievements) || r.achievements.length === 0) && r.id);
                    if (!missing.length) return records;

                    const ids = missing.map(r => String(r.id));
                    const achvTable = (cfg && cfg.achvRunsTable) || 'achv_runs';
                    const { data, error } = await client
                        .from(achvTable)
                        .select('score_id, achievements, created_at')
                        .in('score_id', ids)
                        .order('created_at', { ascending: false });
                    if (error || !Array.isArray(data) || data.length === 0) return records;

                    const byScore = new Map();
                    for (const row of data) {
                        const scoreId = row && row.score_id ? String(row.score_id) : null;
                        if (!scoreId || byScore.has(scoreId)) continue;
                        const achv = row.achievements;
                        // achv_runs.achievements 可能是陣列，或 { ids: [] } 物件
                        const normalized = Array.isArray(achv)
                            ? achv
                            : (achv && Array.isArray(achv.ids) ? achv.ids.map(id => ({ id })) : []);
                        byScore.set(scoreId, normalized);
                    }

                    records.forEach(r => {
                        const k = r && r.id ? String(r.id) : null;
                        if (!k) return;
                        if (Array.isArray(r.achievements) && r.achievements.length > 0) return;
                        const fallback = byScore.get(k);
                        if (Array.isArray(fallback) && fallback.length > 0) {
                            r.achievements = fallback;
                        }
                    });
                } catch(_) {}
                return records;
            }

            async function load(){
                // Expanded: fetch up to top 20 per mode when possible; if schema lacks play_mode/project_tag, fallback to combined query then partition.
                const PER_MODE_LIMIT = 20;
                const modes = ['classic','survival'];
                const out = { classic: [], survival: [] };
                const runWithTimeout = (p, ms) => Promise.race([
                    p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
                ]);
                const retry = async (fn, tries = 3, base = 600) => {
                    let lastErr; for (let i=0;i<tries;i++){ try { const { data, error } = await runWithTimeout(fn(), 4000 + i*1000); if (error) throw error; return data||[]; } catch(e){ lastErr=e; const jitter=Math.random()*150; await new Promise(r=>setTimeout(r, Math.min(2000, base*Math.pow(2,i))+jitter)); } } throw lastErr||new Error('fetch failed'); };
                const fetchMode = async (mode) => {
                    const base = () => {
                        let q = client.from(table).select('*').eq('play_mode', mode);
                        if (cfg.projectTag) q = q.or(`project_tag.eq.${cfg.projectTag},project_tag.is.null`);
                        return q.order('score',{ascending:false}).limit(PER_MODE_LIMIT);
                    };
                    let data;
                    try { data = await retry(base); }
                    catch(err){
                        // Column missing (42703) or 400 fallback: remove project_tag first, then if still failing remove play_mode filter by doing combined fetch
                        const code = err && err.code; const msg=(err && err.message)||'';
                        if (cfg.projectTag){
                            try {
                                console.warn('[LEADERBOARD] retry without project_tag due to error', err);
                                const alt1 = () => client.from(table).select('*').eq('play_mode', mode).order('score',{ascending:false}).limit(PER_MODE_LIMIT);
                                data = await retry(alt1,2);
                            } catch(e2){ err = e2; }
                        }
                        if (!data && (code==='42703' || code==='PGRST100' || /column .*play_mode/i.test(msg) || /bad request/i.test(msg))){
                            console.warn('[LEADERBOARD] fallback to combined fetch (no play_mode column)');
                            // Combined fetch once; partition later (only perform once overall)
                            if (!window.__lbCombinedFetch){
                                window.__lbCombinedFetch = (async()=>{
                                    const combined = await retry(()=>{
                                        let q = client.from(table).select('*');
                                        if (cfg.projectTag) q = q.or(`project_tag.eq.${cfg.projectTag},project_tag.is.null`);
                                        return q.order('score',{ascending:false}).limit(PER_MODE_LIMIT*2);
                                    });
                                    return combined;
                                })();
                            }
                            const combinedData = await window.__lbCombinedFetch;
                            return (combinedData||[]).filter(r => {
                                const pm = (r.play_mode || r.playMode || 'classic');
                                return pm === mode;
                            }).slice(0, PER_MODE_LIMIT).map(toPublicRecord);
                        } else if (!data) {
                            throw err;
                        }
                    }
                    const mapped = (data||[]).map(toPublicRecord);
                    return await hydrateAchievementsFromRuns(mapped);
                };
                try {
                    const results = await Promise.all(modes.map(m=>fetchMode(m)));
                    modes.forEach((m,i)=>{ out[m]=results[i]||[]; });
                    return out;
                } catch(e){
                    console.warn('[LEADERBOARD] online load error', e);
                    try { return JSON.parse(localStorage.getItem('bibleGameLeaderboard') || '{}'); } catch(_) { return { classic:[], survival:[] }; }
                }
            }

            async function save(record){
                try {
                    const markPendingSynced = (remoteId) => {
                        try {
                            if (window.PendingScoreSync && typeof window.PendingScoreSync.markSynced === 'function') {
                                window.PendingScoreSync.markSynced(record, remoteId || null);
                            }
                        } catch(_) {}
                    };
                    const findExistingByClientRecordId = async () => {
                        if (!row.client_record_id) return null;
                        let q = client
                            .from(table)
                            .select('id, created_at')
                            .eq('client_record_id', row.client_record_id)
                            .order('created_at', { ascending: false })
                            .limit(1);
                        if (cfg.projectTag) q = q.or(`project_tag.eq.${cfg.projectTag},project_tag.is.null`);
                        const { data, error } = await q;
                        if (error || !Array.isArray(data) || data.length === 0) return null;
                        return data[0];
                    };
                    // Persist minimal fields + useful metadata. Avoid overly large questionSnapshot by default; keep if config allows.
                    const keepSnapshot = !!cfg.storeSnapshot;
                    const row = {
                        client_record_id: (record && record.id != null) ? String(record.id) : null,
                        player_name: record.playerName || '匿名',
                        score: record.score || 0,
                        difficulty: record.difficulty || 'easy',
                        date: record.date || new Date().toLocaleDateString('zh-TW'),
                        // Persist the readable elapsed mm:ss into time column for record view fallbacks
                        time: record.time || record.elapsed || '',
                        completed: record.completed !== false,
                        correct_answers: record.correctAnswers ?? null,
                        total_questions: record.totalQuestions ?? null,
                        total_mistakes: record.totalMistakes ?? null,
                        level_results: record.levelResults || {},
                        range: record.range || 'all',
                        rarity: record.rarity || null,
                        // Preserve explicit mode ('ranking'|'practice'|'replay'); default to 'ranking' for safety
                        mode: record.mode || 'ranking',
                        // Play mode bucket for leaderboard display
                        play_mode: record.playMode || 'classic',
                        testament: record.testament || 'both',
                        custom_books: record.customBooks || [],
                        hints_remaining: record.hintsRemaining ?? null,
                        total_hints: record.totalHints ?? null,
                        show_time_reward: record.showTimeReward === true,
                        time_reward: record.timeReward ?? null,
                        used_hints_count: record.usedHintsCount ?? null,
                        closing_verse: record.closingVerse ?? null,
                        closing_verse_ref: record.closingVerseRef ?? null,
                        question_snapshot: keepSnapshot ? (record.questionSnapshot || null) : null,
                        // New performance fields for sorting/filtering
                        avg_answer_ms: (typeof record.avgAnswerMs === 'number') ? Math.round(record.avgAnswerMs) : null,
                        avg_perfect_answer_ms: (typeof record.avgPerfectAnswerMs === 'number') ? Math.round(record.avgPerfectAnswerMs) : null,
                        perfect_answer_count: (typeof record.perfectAnswerCount === 'number') ? record.perfectAnswerCount : (record.finalMetrics && typeof record.finalMetrics.noHintCorrectCount==='number' ? record.finalMetrics.noHintCorrectCount : null),
                        // combo summary fields for persistent breakdown
                        max_combo_reached: (typeof record.maxComboReached === 'number') ? record.maxComboReached : null,
                        combo_total_bonus: (typeof record.comboTotalBonus === 'number') ? Math.round(record.comboTotalBonus) : null,
                        achievements: Array.isArray(record.achievements) ? record.achievements : [],
                        is_seed: record.isSeed === true,
                        project_tag: cfg.projectTag || null
                    };

                    // Primary dedupe: deterministic client_record_id (if DB column exists)
                    try {
                        if (row.client_record_id) {
                            const same = await findExistingByClientRecordId();
                            if (same) {
                                markPendingSynced(same && same.id ? same.id : null);
                                return;
                            }
                        }
                    } catch(_) {}

                    // Best-effort dedupe: skip inserting near-identical row in a short time window
                    try {
                        let q = client
                            .from(table)
                            .select('id, created_at')
                            .eq('player_name', row.player_name)
                            .eq('score', row.score)
                            .eq('play_mode', row.play_mode || 'classic')
                            .eq('time', row.time || '')
                            .order('created_at', { ascending: false })
                            .limit(1);
                        if (cfg.projectTag) q = q.or(`project_tag.eq.${cfg.projectTag},project_tag.is.null`);
                        const { data: dupRows, error: dupErr } = await q;
                        if (!dupErr && Array.isArray(dupRows) && dupRows.length > 0) {
                            const recent = dupRows[0];
                            const recentTs = recent && recent.created_at ? new Date(recent.created_at).getTime() : 0;
                            if (recentTs > 0 && (Date.now() - recentTs) < 15000) {
                                console.warn('[LEADERBOARD] dedupe skipped remote insert', { existingId: recent.id, deltaMs: Date.now() - recentTs });
                                markPendingSynced(recent && recent.id ? recent.id : null);
                                return;
                            }
                        }
                    } catch(_) {}

                    // Attempt insert with progressive fallbacks for missing columns
                    let data = null; let err = null;
                    const tryInsert = async (r) => {
                        const { data, error } = await client.from(table).insert(r).select('*').single();
                        if (error) throw error; return data;
                    };
                    try {
                        data = await tryInsert(row);
                    } catch(e1){
                        err = e1;
                        const code1 = err && err.code; const msg1 = (err && err.message)||'';
                        // First fallback: drop project_tag if column missing
                        if (code1 === '42703' || /column .*project_tag|does not exist/i.test(msg1)){
                            const r1 = { ...row }; delete r1.project_tag;
                            try { data = await tryInsert(r1); err = null; }
                            catch(e2){
                                err = e2;
                                const code2 = err && err.code; const msg2 = (err && err.message)||'';
                                // Second fallback: also drop play_mode if missing
                                if (code2 === '42703' || /column .*play_mode|does not exist/i.test(msg2)){
                                    const r2 = { ...r1 }; delete r2.play_mode;
                                    try { data = await tryInsert(r2); err = null; }
                                    catch(e3){
                                        err = e3;
                                        const code3 = err && err.code; const msg3 = (err && err.message)||'';
                                        // Third fallback: drop other optional large/rare columns if still failing
                                        if (code3 === '42703' || /column .*question_snapshot|achievements|closing_verse|closing_verse_ref|used_hints_count|show_time_reward|time_reward|hints_remaining|total_hints|avg_answer_ms|avg_perfect_answer_ms|perfect_answer_count|max_combo_reached|combo_total_bonus/i.test(msg3)){
                                            const r3 = { ...r2 };
                                            delete r3.client_record_id;
                                            delete r3.question_snapshot; delete r3.achievements; delete r3.closing_verse; delete r3.closing_verse_ref;
                                            delete r3.used_hints_count; delete r3.show_time_reward; delete r3.time_reward;
                                            delete r3.avg_answer_ms; delete r3.avg_perfect_answer_ms; delete r3.perfect_answer_count; delete r3.max_combo_reached; delete r3.combo_total_bonus;
                                            delete r3.hints_remaining; delete r3.total_hints; delete r3.custom_books; delete r3.testament; delete r3.rarity;
                                            try { data = await tryInsert(r3); err = null; }
                                            catch(e4){ err = e4; }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if (err && row.client_record_id) {
                        const code = err && err.code;
                        const msg = (err && err.message) || '';
                        if (code === '23505' || /duplicate key value|unique constraint/i.test(msg)) {
                            try {
                                const existing = await findExistingByClientRecordId();
                                if (existing) {
                                    markPendingSynced(existing && existing.id ? existing.id : null);
                                    return;
                                }
                            } catch(_) {}
                        }
                    }
                    if (err) throw err;
                    if (!data) throw new Error('insert failed');
                    markPendingSynced(data.id);
                    // Link achv_runs -> score_id best-effort
                    try {
                        if (data && data.id && typeof window.linkLatestAchievementRunToScore==='function') {
                            window.linkLatestAchievementRunToScore(data.id);
                            try {
                                if (window.PendingAchvLinkSync && typeof window.PendingAchvLinkSync.markLinked === 'function') {
                                    const latestRunId = (window.__lastAchvRunId != null) ? String(window.__lastAchvRunId) : null;
                                    window.PendingAchvLinkSync.markLinked({ scoreId: data.id, runId: latestRunId });
                                }
                            } catch(_) {}
                        }
                    } catch(_) {}
                    // Link telemetry to this score if pending
                    try {
                        const pending = window.__pendingAchvTelemetry;
                        if (pending && data && data.id && typeof window.sendAchievementRunToSupabase==='function') {
                            await window.sendAchievementRunToSupabase(pending.metrics, pending.unlocked, pending.mode, { linkToScoreId: data.id });
                            window.__pendingAchvTelemetry = null;
                        } else if (data && data.id && typeof window.linkLatestAchievementRunToScore==='function') {
                            // If telemetry was already inserted earlier, attempt to attach it
                            const latestRunId = (window.__lastAchvRunId != null) ? String(window.__lastAchvRunId) : null;
                            await window.linkLatestAchievementRunToScore(data.id, latestRunId);
                            try {
                                if (window.PendingAchvLinkSync && typeof window.PendingAchvLinkSync.markLinked === 'function') {
                                    window.PendingAchvLinkSync.markLinked({ scoreId: data.id, runId: latestRunId });
                                }
                            } catch(_) {}
                        }
                    } catch(_) {
                        try {
                            if (data && data.id && window.PendingAchvLinkSync && typeof window.PendingAchvLinkSync.enqueue === 'function') {
                                const latestRunId = (window.__lastAchvRunId != null) ? String(window.__lastAchvRunId) : null;
                                window.PendingAchvLinkSync.enqueue({ scoreId: data.id, runId: latestRunId });
                            }
                        } catch(_) {}
                    }
                    // Optimistic cache update: merge into __lbLatestData if within top 20 of its mode
                    try {
                        if (data) {
                            const pub = toPublicRecord(data);
                            const modeKey = pub.playMode || 'classic';
                            if (window.__lbLatestData && window.__lbLatestData[modeKey]) {
                                const arr = window.__lbLatestData[modeKey];
                                arr.push(pub);
                                arr.sort((a,b)=> (b.score||0)-(a.score||0) || new Date(a.createdAt||a.date||'').getTime()-new Date(b.createdAt||b.date||'').getTime());
                                window.__lbLatestData[modeKey] = arr.slice(0,20);
                                window.__lbLatestTs = Date.now();
                                try { updateLeaderboardDisplay && updateLeaderboardDisplay(modeKey); } catch(_) {}
                            }
                        }
                    } catch(_) {}
                } catch (e) {
                    console.warn('[LEADERBOARD] online save error', e);
                    throw e;
                }
            }

            async function clear(){
                try {
                    // Danger: wipe all rows. Scope by project_tag when configured; also include legacy NULL-tag rows.
                    if (cfg.projectTag) {
                        try {
                            // Delete rows where project_tag equals current tag OR is NULL (legacy)
                            const { error } = await client
                              .from(table)
                              .delete()
                              .or(`project_tag.eq.${cfg.projectTag},project_tag.is.null`);
                            if (error) throw error;
                        } catch (err) {
                            // If project_tag column missing (42703) or OR unsupported, fallback to a broad delete
                            const code = err && err.code;
                            if (code === '42703' || /column .*project_tag/i.test(err?.message||'')) {
                                const { error } = await client.from(table).delete().neq('id', null);
                                if (error) throw error;
                            } else {
                                // 一次短延遲重試（處理瞬時錯誤/連線換線）
                                await new Promise(r=>setTimeout(r, 200));
                                const { error: retryErr } = await client
                                  .from(table)
                                  .delete()
                                  .or(`project_tag.eq.${cfg.projectTag},project_tag.is.null`);
                                if (retryErr) throw err;
                                throw err;
                            }
                        }
                    } else {
                        const { error } = await client.from(table).delete().neq('id', null);
                        if (error) throw error;
                    }
                } catch (e) {
                    console.warn('[LEADERBOARD] online clear error', e);
                    throw e;
                }
            }

            window.Leaderboard = { load, save, clear };
            console.log('[LEADERBOARD] online adapter enabled');
            try { document.dispatchEvent(new CustomEvent('leaderboard:adapter-ready')); } catch(_) {}
        } catch (e) {
            // no-op if not configured
        }
    }
    // 初始嘗試安裝（若 client 尚未載入或未配置，將無事發生）
    ;(function(){ try { installOnlineLeaderboardAdapter(); } catch(_) {} })();
    // 對外暴露：允許在 Supabase lazy 載入後重試初始化 Adapter（具冪等性）
    if (!window.tryInitOnlineLeaderboard) {
        window.tryInitOnlineLeaderboard = function(){
            try {
                // 若已可用則忽略，否則重試安裝完整 Adapter
                if (window.Leaderboard && typeof window.Leaderboard.load === 'function') return;
                installOnlineLeaderboardAdapter();
            } catch (_) {}
        };
    }
        // Small init: scoring toggle for mobile to hide/show scoring body and remarks together
        document.addEventListener('DOMContentLoaded', function() {
            try {
                // Update replay button sublabel according to config (allowReplaySaves)
                try {
                    const allowReplaySaves = !!(window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.allowReplaySaves);
                    const replayBtn = document.getElementById('replaySameQuestionsBtn');
                    if (replayBtn) {
                        const labelSpan = replayBtn.querySelector('span.text-left');
                        if (labelSpan) {
                            const baseText = '同題重玩';
                            const sub = allowReplaySaves ? '（可列入排行榜）' : '（不列入排行榜）';
                            labelSpan.innerHTML = baseText + '<br><span class="text-xs font-normal">' + sub + '</span>';
                        }
                    }
                } catch (_) {}

                var toggleBtn = document.getElementById('toggleScoringBtn');
                var scoringCard = document.getElementById('scoringCard');
                var scoringBody = document.getElementById('scoringBody');
                if (toggleBtn && scoringCard && scoringBody) {
                    var expanded = scoringCard.classList.contains('scoring-open');
                    toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
                    toggleBtn.textContent = expanded ? '隱藏計分說明' : '顯示計分說明';
                    toggleBtn.addEventListener('click', function() {
                        expanded = !expanded;
                        scoringCard.classList.toggle('scoring-open', expanded);
                        toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
                        toggleBtn.textContent = expanded ? '隱藏計分說明' : '顯示計分說明';
                    });
                }
            } catch (e) {
                console.warn('scoring toggle init failed', e);
            }

            // 無障礙：對話框焦點管理與 Esc 關閉
            try {
                const modals = ['confirmBackModal','playerNameModal'];
                const focusableSel = 'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]';
                modals.forEach(id => {
                    const modal = document.getElementById(id);
                    if (!modal) return;
                    // 開啟時設定 aria-hidden、聚焦到標題或第一個可聚焦元素
                    const open = () => {
                        modal.setAttribute('aria-hidden','false');
                        const title = modal.querySelector('#'+(id==='confirmBackModal'?'confirmBackTitle':'playerNameModalTitle'));
                        const focusables = modal.querySelectorAll(focusableSel);
                        const first = focusables && focusables[0];
                        setTimeout(() => { (title || first || modal).focus({preventScroll:true}); }, 0);
                    };
                    const close = () => {
                        modal.setAttribute('aria-hidden','true');
                    };
                    // 觀察 hidden class 切換以呼叫 open/close
                    const obs = new MutationObserver(() => {
                        const hidden = modal.classList.contains('hidden');
                        if (!hidden) open(); else close();
                    });
                    obs.observe(modal, { attributes:true, attributeFilter:['class'] });

                    // Esc 關閉（playerNameModal 僅在非查看模式且未受保護時可關閉）
                    modal.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape') {
                            if (id === 'confirmBackModal') {
                                document.getElementById('cancelBackBtn')?.click();
                            } else if (id === 'playerNameModal') {
                                const viewing = modal.dataset.viewingRecord === 'true';
                                // When protected (end-of-run), block ESC-to-confirm; only explicit confirm button should exit
                                const isProtected = modal.dataset.protected === '1';
                                if (!viewing && !isProtected) document.getElementById('confirmNameBtn')?.click();
                            }
                        }
                    });
                });
            } catch (e) { /* ignore a11y wiring errors */ }

            // 延後：優先嘗試載入外部經文資料，成功後再初始化跑馬燈（失敗則採用內建資料）
            try {
                const kickoff = () => {
                    try { initializeVerseMarquee(); } catch(e){}
                    // 若已初始化，之後資料更新則只刷新內容，不重建 DOM
                    try { refreshVerseMarqueeData(); } catch(e){}
                    // 綁定裝備課程班級選擇按鈕
                    try {
            const g = document.getElementById('equipTierGrowth');
            const d = document.getElementById('equipTierDisciple');
            const l = document.getElementById('equipTierLeader');
                        const bind = (el, tier) => {
                            if (!el) return;
                            el.addEventListener('click', () => {
                                // Toggle: 若再次點擊同一班級 -> 取消選擇
                                if (gameState.__pendingEquipTier === tier) {
                                    gameState.__pendingEquipTier = null;
                                    highlightSelectedEquipTier(null);
                                    gameState.playMode = null;
                                    try { window.__selectHomeMode && window.__selectHomeMode(null); } catch(_) {}
                                    try { highlightSelectedModeCard(null); } catch(_) {}
                                    updateStartButtonState();
                                    /* removed deselect hint */
                                    // 取消選擇時不滾動（需求）
                                    return;
                                }
                                gameState.__pendingEquipTier = tier;
                                highlightSelectedEquipTier(tier);
                // 切換到裝備課程模式（互斥），並收起自訂書卷區域
                try { window.__selectHomeMode && window.__selectHomeMode('equip'); } catch(_) {}
                                // 四模式互斥：高亮裝備卡片並重置其他卡片樣式
                                try {
                                    const equipCard = document.getElementById('equipCourseCard');
                                    const modeClassicBtn = document.getElementById('modeClassicBtn');
                                    const modeSurvivalBtn = document.getElementById('modeSurvivalBtn');
                                    const customAreaCard = document.getElementById('customAreaCard');
                                    // reset others
                                    if (modeClassicBtn) { modeClassicBtn.style.borderWidth=''; modeClassicBtn.style.borderColor=''; modeClassicBtn.style.boxShadow=''; modeClassicBtn.setAttribute('aria-pressed','false'); }
                                    if (modeSurvivalBtn) { modeSurvivalBtn.style.borderWidth=''; modeSurvivalBtn.style.borderColor=''; modeSurvivalBtn.style.boxShadow=''; modeSurvivalBtn.setAttribute('aria-pressed','false'); }
                                    if (customAreaCard) { customAreaCard.style.borderWidth=''; customAreaCard.style.borderColor=''; customAreaCard.style.boxShadow=''; customAreaCard.setAttribute('aria-pressed','false'); }
                                    if (equipCard) {
                                        equipCard.setAttribute('aria-pressed','true');
                                        equipCard.style.borderWidth = '';
                                        equipCard.style.borderColor = '#7c3aed';
                                        equipCard.style.boxShadow = '';
                                    }
                                } catch(_) {}
                // 收起自訂書卷展開卡
                try { document.getElementById('customBooksExpandCard')?.classList.add('hidden'); } catch(_) {}
                updateStartButtonState();
                                try { window.__applyModeUI && window.__applyModeUI(); } catch(_) {}
                                // 手機：選擇裝備班級後自動滾動到開始按鈕（保留互換要求：取消選擇不滾動）
                                try { scrollToStartButtonForMobile(); } catch(_) {}
                                // Cute hint for tier selection
                                try {
                                    const pools = MODE_HINTS.equipTier;
                                    const def = pools[tier];
                                    if (def) showCuteHint(def.lines, def.theme, undefined, def.icon);
                                    else {
                                        const generic = MODE_HINTS.equip;
                                        showCuteHint(generic.lines, generic.theme, undefined, generic.icon);
                                    }
                                } catch(_) {}
                            });
                            el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); el.click(); } });
                        };
                        bind(g, 'growth'); bind(d, 'disciple'); bind(l, 'leader');
                        // 題庫明細按鈕（避免干擾原本班級選擇：stopPropagation）
                        try {
                            document.querySelectorAll('[data-equip-info]').forEach(btn => {
                                btn.addEventListener('click', (ev)=>{ ev.stopPropagation(); ev.preventDefault(); showEquipTierBankModal(btn.getAttribute('data-equip-info')); });
                            });
                        } catch(_){ }
                    } catch(_) {}
                };
                const loader = () => {
                    const isWebView = /Line|FBAN|FBAV|Instagram/i.test(navigator.userAgent || navigator.vendor || window.opera);
                    
                    if (ENABLE_EXTERNAL_VERSES && !isWebView) {
                        attemptLoadExternalVerses().finally(kickoff);
                    } else {
                        // 🚀 Critical Fix for LINE WebView Infinite Refresh 🚀
                        // In-app browsers like LINE have very strict Jetsam memory and CPU limits. 
                        // Synchronously fetching + parsing an 8MB JSON while the DOM is rendering and animations
                        // are starting will instantly crash the WebKit process and result in a silent reload loop.
                        // By fully rendering the UI first and waiting 3.5 seconds before we even touch the network
                        // or JSON.parse, the browser GC has time to settle, fully bypassing the crash limit.
                        
                        kickoff(); // Initialize with fallbacks first
                    }
                };
                if ('requestIdleCallback' in window) {
                    window.requestIdleCallback(loader);
                } else {
                    setTimeout(loader, 120);
                }
            } catch(e){}
        });
        