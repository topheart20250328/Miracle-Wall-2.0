            // #region 成就UI模組
            // Force Save from VS Code
            // ===== 成就渲染 =====
                        function renderAchievementsIntoModal(){
                try {
                    const host = document.getElementById('settlementAchievements');
                    if (!host) return;
                    host.innerHTML = '';
                    const suppress = !!(typeof gameState === 'object' && gameState && gameState.suppressSettlementAchievements);
                    const list = (gameState && Array.isArray(gameState.unlockedAchievements)) ? gameState.unlockedAchievements : [];
                    try { console.log('[ACHV][UI] rendering settlement achievements', list.map(x=>({id:x.id,dt:x.displayTier,t:x.tier}))); } catch(_) {}
                    
                    if (suppress || list.length === 0) {
                        try { window.dispatchEvent(new CustomEvent('achievementsAnimationStarted')); } catch(_) {}
                        try { window.dispatchEvent(new CustomEvent('achievementsAnimationDone')); } catch(_) {}
                        host.style.display = 'none';
                        return;
                    }
                    
                    host.style.display = 'block';
                    
                    // Header wrap
                    const wrap = document.createElement('div');
                    wrap.className = 'w-full mb-4 flex flex-col items-center gap-1';
                    const title = document.createElement('div');
                    title.className = 'text-xl font-black text-gray-800 tracking-wide';
                    title.textContent = '此局勳章';
                    wrap.appendChild(title);
                    host.appendChild(wrap);

                    // Separate T1/T2 from T3/T4/T5 to emphasize top tier achievements
                    const topTier = [];
                    const otherTier = [];
                    for(const a of list) {
                        const dt = (typeof getDisplayTier === 'function') ? getDisplayTier(a) : 5;
                        if (dt <= 2) {
                            topTier.push({a, dt});
                        } else {
                            otherTier.push({a, dt});
                        }
                    }

                    // Render top tier in large size, potentially with extra shaking/animations
                    if (topTier.length > 0) {
                        topTier.sort((x, y) => x.dt - y.dt);
                        const topGrid = document.createElement('div');
                        topGrid.className = 'settlement-achv-grid settlement-achv-grid-feature w-full mb-4';
                        for(const item of topTier) {
                            const a = item.a;
                            const dt = item.dt;
                            const card = document.createElement('div');
                            card.className = `achv-card settlement-achv-card settlement-achv-feature rarity-t${dt} relative flex items-center gap-3 px-4 py-4 rounded-xl border border-white/40 shadow-xl overflow-hidden cursor-pointer`;
                            card.dataset.dt = String(dt);
                            card.dataset.achievementId = a.id || '';
                            card.setAttribute('role', 'button');
                            card.setAttribute('tabindex', '0');
                            card.setAttribute('aria-label', `${a.name || '成就'} 詳細說明`);
                            
                            // Visual enhancements inside standard settlement UI
                            try { if(typeof window.__injectAchvDecor === 'function') window.__injectAchvDecor(card); } catch(_) {}
                            
                            const iconBox = document.createElement('div');
                            iconBox.className = 'achv-icon settlement-achv-icon settlement-achv-icon-feature w-12 h-12 flex items-center justify-center filter drop-shadow z-10 flex-shrink-0';
                            iconBox.innerHTML = (typeof getAchievementIcon === 'function') ? getAchievementIcon(a) : '';
                            const info = document.createElement('div');
                            info.className = 'settlement-achv-info settlement-achv-info-feature flex flex-col min-w-0 z-10 flex-1';
                            const nameEl = document.createElement('div');
                            nameEl.className = 'settlement-achv-title settlement-achv-title-feature text-base font-extrabold text-white drop-shadow z-10';
                            nameEl.textContent = a.name;
                            const descEl = document.createElement('div');
                            descEl.className = 'settlement-achv-desc settlement-achv-desc-feature text-[11px] text-white/90 leading-tight block z-10 mt-1 font-bold';
                            descEl.textContent = a.desc || '';
                            info.appendChild(nameEl);
                            info.appendChild(descEl);
                            card.appendChild(iconBox);
                            card.appendChild(info);
                            card.addEventListener('click', () => {
                                try { window.openAchievementDetail && window.openAchievementDetail(a.id); } catch(_) {}
                            });
                            card.addEventListener('keydown', (ev) => {
                                if (ev.key === 'Enter' || ev.key === ' ') {
                                    ev.preventDefault();
                                    try { window.openAchievementDetail && window.openAchievementDetail(a.id); } catch(_) {}
                                }
                            });
                            // Set custom property to allow CSS to do sequential bounce
                            card.style.setProperty('--popDelay', topGrid.childElementCount * 0.2 + 's');
                            card.classList.add('achv-pop-in-large');
                            topGrid.appendChild(card);
                        }
                        host.appendChild(topGrid);
                    }

                    // Render other tiers as standard compact cards
                    if (otherTier.length > 0) {
                        otherTier.sort((x, y) => x.dt - y.dt);
                        const grid = document.createElement('div');
                        grid.className = 'settlement-achv-grid settlement-achv-grid-compact w-full';
                        let i = 0;
                        for(const item of otherTier) {
                            const a = item.a;
                            const dt = item.dt;
                            const card = document.createElement('div');
                            card.className = `achv-card settlement-achv-card settlement-achv-compact min-w-0 flex items-center gap-2 px-3 py-3 rounded-lg border shadow-sm rarity-t${dt} relative overflow-hidden cursor-pointer`;
                            card.dataset.dt = String(dt);
                            card.dataset.achievementId = a.id || '';
                            card.setAttribute('role', 'button');
                            card.setAttribute('tabindex', '0');
                            card.setAttribute('aria-label', `${a.name || '成就'} 詳細說明`);
                            
                            try { if(typeof window.__injectAchvDecor === 'function') window.__injectAchvDecor(card); } catch(_) {}

                            const iconBox = document.createElement('div');
                            iconBox.className = 'achv-icon settlement-achv-icon settlement-achv-icon-compact w-8 h-8 flex-shrink-0 flex items-center justify-center z-10 drop-shadow-sm';
                            iconBox.innerHTML = (typeof getAchievementIcon === 'function') ? getAchievementIcon(a) : '';
                            const info = document.createElement('div');
                            info.className = 'settlement-achv-info settlement-achv-info-compact flex flex-col min-w-0 z-10 flex-1 leading-tight';
                            const nameEl = document.createElement('div');
                            nameEl.className = 'settlement-achv-title settlement-achv-title-compact text-sm font-extrabold text-white drop-shadow-sm';
                            nameEl.textContent = a.name;
                            const descEl = document.createElement('div');
                            descEl.className = 'settlement-achv-desc settlement-achv-desc-compact text-[10px] text-white/90 font-bold';
                            descEl.textContent = a.desc || '';
                            info.appendChild(nameEl);
                            info.appendChild(descEl);
                            card.appendChild(iconBox);
                            card.appendChild(info);
                            card.addEventListener('click', () => {
                                try { window.openAchievementDetail && window.openAchievementDetail(a.id); } catch(_) {}
                            });
                            card.addEventListener('keydown', (ev) => {
                                if (ev.key === 'Enter' || ev.key === ' ') {
                                    ev.preventDefault();
                                    try { window.openAchievementDetail && window.openAchievementDetail(a.id); } catch(_) {}
                                }
                            });
                            card.style.setProperty('--popDelay', (topTier.length * 0.15 + i * 0.08) + 's');
                            card.classList.add('achv-pop-in-small');
                            grid.appendChild(card);
                            i++;
                        }
                        host.appendChild(grid);
                    }

                    if (typeof window.animateSettlementAchievements === 'function') {
                        setTimeout(()=>{ try { window.animateSettlementAchievements(); } catch(_) {} }, 120);
                    } else {
                        try { window.dispatchEvent(new CustomEvent('achievementsAnimationStarted')); setTimeout(()=> window.dispatchEvent(new CustomEvent('achievementsAnimationDone')), 500); } catch(_) {}
                    }
                } catch(e){ console.warn('renderAchievementsIntoModal error', e); }
            }
                window.animateSettlementAchievements = function(){
                    try {
                        const grid = document.getElementById('settlementAchievements'); if(!grid) return;
                        const cards = Array.from(grid.querySelectorAll('.achv-card')); if(!cards.length) return;
                        // 減少動態：直接顯示
                        if (typeof getReducedMotion==='function' && getReducedMotion()) {
                            cards.forEach(c=>{ c.style.opacity=''; c.style.transform=''; c.style.transition=''; });
                            return;
                        }
                        // 動態附加（一次性）增強樣式：影響爆光、定位特效與火苗
                        if(!document.getElementById('achvEnhanceStyles')){
                            const st=document.createElement('style'); st.id='achvEnhanceStyles'; st.textContent=`
/* 成就進場定位特效（移除火苗） */
.achv-card{position:relative;overflow:hidden;}
@keyframes achvImpact{0%{transform:translate(-50%,-50%) scale(.3);opacity:.75;}45%{opacity:1;}70%{opacity:.55;}100%{transform:translate(-50%,-50%) scale(1.45);opacity:0;}}
.achv-impact-ring{position:absolute;left:50%;top:50%;width:140%;height:140%;border-radius:50%;pointer-events:none;mix-blend-mode:screen;animation:achvImpact 900ms ease-out forwards;box-shadow:0 0 14px 4px rgba(255,255,255,0.35) inset,0 0 32px 8px rgba(255,255,255,0.18);} 
@keyframes achvPop{0%{transform:scale(1);}38%{transform:scale(1.09);}68%{transform:scale(.985);}100%{transform:scale(1);} }
.achv-lock-pop{animation:achvPop 520ms cubic-bezier(.25,1.4,.4,1);}
.achv-card.rarity-t1{z-index:10;}
`; document.head.appendChild(st);
                        }
                        // 長時序設定：更平滑、避免同幀大量 transition 競爭造成卡頓
                        const baseDur = 1400; // 基礎位移+淡入時間（ms）
                        const extraByTier = {1:420,2:360,3:280,4:200,5:160};
                        const dyByTier = {1:48,2:42,3:36,4:30,5:26};
                        const scaleByTier = {1:0.94,2:0.95,3:0.955,4:0.965,5:0.97};
                        const stagger = 120; // 單卡延遲間隔（ms）
                        const maxDelay = 4000; // 安全上限
                        const colorByTier = {
                            1:'linear-gradient(135deg,#ffecd1,#ff9d42 40%,#ff5b00 70%)',
                            2:'linear-gradient(135deg,#ede7ff,#b69bff 45%,#8457ff 75%)',
                            3:'linear-gradient(135deg,#e0ecff,#9bc5ff 45%,#4d85ff 75%)',
                            4:'linear-gradient(135deg,#e8f5f0,#b7e3d3 45%,#6ec7ac 75%)',
                            5:'linear-gradient(135deg,#f1f5f9,#d4dbe3 45%,#9aa4b1 75%)'
                        };
                        // 初始狀態批次設定（減少 layout thrash）
                        for (const card of cards){
                            const dt = parseInt(card.dataset.dt||'4',10)||4;
                            const dy = dyByTier[dt]||32;
                            const sc = scaleByTier[dt]||0.96;
                            card.style.transition='none';
                            // 已在 render 時 opacity:0; visibility:hidden
                            card.style.transform=`translateY(${dy}px) scale(${sc})`;
                            card.style.willChange='transform,opacity';
                            card.__achvFinalized=false;
                        }
                        // 雙 rAF 確保初始樣式生效
                        requestAnimationFrame(()=>{
                            requestAnimationFrame(()=>{
                                const startTs = performance.now();
                                cards.forEach((card,i)=>{
                                    const dt = parseInt(card.dataset.dt||'4',10)||4;
                                    const dur = baseDur + (extraByTier[dt]||0);
                                    const delay = Math.min(maxDelay, i*stagger);
                                    card.style.transition = `transform ${dur}ms cubic-bezier(.16,.84,.3,1), opacity ${Math.round(dur*0.65)}ms ease-out`;
                                    card.style.transitionDelay = `${delay}ms`;
                                    // 最終狀態
                                    card.style.visibility='visible';
                                    card.style.opacity='1';
                                    card.style.transform='translateY(0) scale(1)';
                                    const finalize = ()=>{
                                        if(card.__achvFinalized) return; card.__achvFinalized=true;
                                        try { card.style.willChange=''; } catch(_){ }
                                        // 定位爆光：加入環形衝擊（顏色依稀有度）
                                        try {
                                            const dtNow = parseInt(card.dataset.dt||'4',10)||4;
                                            const ring=document.createElement('div');
                                            ring.className='achv-impact-ring';
                                            ring.style.background=colorByTier[dtNow]||'linear-gradient(135deg,#fff,#ccc)';
                                            ring.style.border='2px solid rgba(255,255,255,0.65)';
                                            card.appendChild(ring);
                                            setTimeout(()=>{ try { ring.remove(); } catch(_){} }, 1200);
                                        } catch(_) {}
                                        // 卡片彈性定位強調
                                        try { card.classList.add('achv-lock-pop'); setTimeout(()=>{ card.classList.remove('achv-lock-pop'); }, 900); } catch(_){}
                                        //（原 T1 火苗效果已移除）
                                    };
                                    const onEnd=(ev)=>{ if(ev.propertyName==='transform'){ finalize(); card.removeEventListener('transitionend', onEnd); } };
                                    card.addEventListener('transitionend', onEnd);
                                });
                                // 若需要之後與數字動畫串聯，可在這裡觸發事件
                                try { window.dispatchEvent(new CustomEvent('achievementsAnimationStarted')); } catch(_) {}
                            });
                        });
                        //（原 startEmbers 已刪除）
                    } catch(e){ /* ignore */ }
                }
            // 結算視窗：點擊勳章開啟「成就詳情」子視窗

            // 成就詳情渲染 & 開啟
            ;(function(){
                const detailId = 'achievementDetailModal';
                function $(id){ return document.getElementById(id); }
                function elIcon(){ return $('achievementDetailIcon'); }
                function elTitle(){ return $('achievementDetailTitle'); }
                function elMeta(){ return $('achievementDetailMeta'); }
                function elDesc(){ return $('achievementDetailDesc'); }
                

                function getDefById(id){ try { return (AchievementManager && AchievementManager.defs || []).find(d=>d.id===id) || null; } catch(_) { return null; } }
                function esc(str){ return String(str).replace(/[&<>"']/g, s=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s])); }
                function tierBadge(t){
                    // Force black text for badges regardless of tier
                    const map={
                        1:{text:'T1',cls:'bg-amber-50 text-black border-amber-200'},
                        2:{text:'T2',cls:'bg-purple-50 text-black border-purple-200'},
                        3:{text:'T3',cls:'bg-indigo-50 text-black border-indigo-200'},
                        4:{text:'T4',cls:'bg-gray-100 text-black border-gray-200'},
                        5:{text:'T5',cls:'bg-emerald-50 text-black border-emerald-200'}
                    };
                    const x = map[t] || map[4];
                    return `<span class="inline-flex items-center px-2 py-0.5 text-[11px] font-bold rounded-md border ${x.cls}">${x.text}</span>`;
                }
                function modeBadge(mode){
                    const map={ classic:{text:'闖關',cls:'bg-rose-50 text-rose-700 border-rose-200'}, survival:{text:'生存',cls:'bg-emerald-50 text-emerald-700 border-emerald-200'}, any:{text:'共通',cls:'bg-gray-50 text-gray-700 border-gray-200'} };
                    const x = map[mode] || map.any; return `<span class="inline-flex items-center px-2 py-0.5 text-[11px] font-bold rounded-md border ${x.cls}">${x.text}</span>`;
                }
                function labelKey(k){
                    const map={
                        answeredQuestions:'完成題數', totalQuestions:'總題數', correctCount:'答對題數', wrongCount:'答錯題數',
                        accuracy:'正確率', avgAnswerMs:'平均作答', fastestAnswerMs:'最快作答', slowestAnswerMs:'最慢作答',
                        longestStreak:'最高連擊', maxComboReached:'最高連擊數', maxConsecutivePerfect:'連續完美層數', levelsPerfectCount:'完美層數',
                        hintsUsed:'使用提示', survivalDuration:'存活時間', maxTime:'時間峰值', maxTimeOverStart:'超過起始值峰值', timeStdDev:'時間標準差',
                        ultraFastCorrectMax:'極速連擊峰值'
                    };
                    return map[k] || k;
                }
                function fmt(metrics, key){
                    if (!metrics) return '-'; const v = metrics[key]; if (v==null) return '-';
                    if (key==='accuracy') return Math.round((v||0)*100) + '%';
                    if (/Ms$/.test(key)) return (typeof v==='number'? (v/1000).toFixed(2): v) + ' 秒';
                    if (/time|Time|Duration|Seconds/i.test(key)) return (typeof v==='number'? v.toFixed(0): v) + ' 秒';
                    return String(v);
                }
                function humanize(rule, m){
                    if (!rule) return '';
                    try {
                        if (rule.type==='metric'){
                            const my = fmt(m, rule.field);
                            return `本局「${labelKey(rule.field)}」 ${rule.op} ${rule.value}（你的：${esc(my)}）`;
                        } else if (rule.type==='and' && Array.isArray(rule.children)){
                            return rule.children.map(r=> humanize(r,m)).filter(Boolean).join('\n');
                        } else if (rule.type==='or' && Array.isArray(rule.children)){
                            const parts = rule.children.map(r=> humanize(r,m)).filter(Boolean);
                            return ['滿足以下任一條件：', ...parts.map(p=>'・'+p)].join('\n');
                        } else if (rule.type==='custom'){
                            return '';
                        }
                    } catch(_) { return ''; }
                    return '';
                }
                function setIcon(def){
                    const box = elIcon();
                    try {
                        box.innerHTML = (typeof getAchievementIcon==='function')? getAchievementIcon(def) : '🏅';
                        // Make SVG icon slightly larger to match settlement cards
                        box.querySelector('svg')?.classList?.add('w-7','h-7');
                    } catch(_) { box.textContent='🏅'; }
                }
                function openDetail(def){
                    if (!def) return;
                    setIcon(def);
                    elTitle().textContent = def.name || def.title || def.id;
                    const dt = (def.displayTier!=null)? def.displayTier : ((typeof getDisplayTier==='function')? getDisplayTier(def) : (6 - Math.max(1, Math.min(5, def.tier||1))));
                    elMeta().innerHTML = `${tierBadge(dt)} <span class="mx-1">·</span> ${modeBadge(def.mode||'any')}`;
                    elDesc().textContent = def.desc || def.description || '';
                    try {
                        const card = document.getElementById('achievementDetailCard');
                        if (card) {
                            // Detail-only safeguard: ensure any decorative layers are absolutely positioned (no layout impact)
                            try{
                                if (!document.getElementById('achvDetailFixStyles')){
                                    const st = document.createElement('style');
                                    st.id = 'achvDetailFixStyles';
                                    st.textContent = `
/* Ensure injected FX layers in detail card never affect layout height */
#achievementDetailCard > .vignette,
#achievementDetailCard > .corner-glint,
#achievementDetailCard > .tier-particles,
#achievementDetailCard > .flame-layer,
#achievementDetailCard > .heaven-clouds,
#achievementDetailCard > .god-rays,
#achievementDetailCard > .starfield,
#achievementDetailCard > .nebula,
#achievementDetailCard > .meteor,
#achievementDetailCard > .meteor-tilt,
#achievementDetailCard > .wave-field,
#achievementDetailCard > .leaf-field,
#achievementDetailCard > .edge-sweep{ position:absolute; pointer-events:none; z-index:0; border-radius:inherit; }
#achievementDetailCard .achv-icon,
#achievementDetailCard #achievementDetailTitle,
#achievementDetailCard #achievementDetailMeta,
#achievementDetailCard #achievementDetailDesc{ position:relative; z-index:2; }
`;
                                    document.head.appendChild(st);
                                }
                            }catch(_){ /* noop */ }
                            // Remove any stale decorative layers from previous opens to avoid stacking/misaligned static blocks
                            try{
                                const staleSelectors = ['.vignette','.corner-glint','.tier-particles','.flame-layer','.heaven-clouds','.god-rays','.starfield','.nebula','.meteor','.meteor-tilt','.wave-field','.leaf-field','.edge-sweep'];
                                staleSelectors.forEach(sel=>{
                                    card.querySelectorAll(`:scope > ${sel}`).forEach(n=>{ try{ n.remove(); }catch(_){ } });
                                });
                            }catch(_){ /* noop */ }
                            card.classList.remove('rarity-t1','rarity-t2','rarity-t3','rarity-t4','rarity-t5');
                            card.classList.add(`rarity-t${dt}`);
                            try {
                                window.__injectAchvDecor(card);
                                const deco = card.querySelector(':scope > .achv-decor');
                                if (deco) { deco.style.zIndex='0'; deco.style.opacity='0.55'; }
                                const contentChildren = card.querySelectorAll('#achievementDetailIcon,#achievementDetailTitle,#achievementDetailMeta,#achievementDetailDesc');
                                contentChildren.forEach(n=>{ try { n.style.position='relative'; n.style.zIndex='2'; } catch(_) {} });
                            } catch(_) {}
                            if (dt===3) {
                                try { if (!card.querySelector(':scope > .edge-sweep')){ const es=document.createElement('div'); es.className='edge-sweep'; card.appendChild(es); } } catch(_) {}
                            }
                        }
                    } catch(_) {}
                    try {
                        // Ensure detail modal is opened as top-most
                        openModal(detailId);
                        const detail = document.getElementById(detailId);
                        if (detail) detail.style.zIndex = '12030';
                    } catch(_) {
                        const modal=$(detailId);
                        if (modal) { modal.classList.remove('hidden'); modal.style.zIndex='12030'; }
                    }
                }
                window.openAchievementDetail = function(id){ const def = getDefById(id); openDetail(def); };
            })();
            // #endregion





// ---------------------------------------------------- 
// Settlement binding & Replay logic (Extracted from engine.js) 
// ---------------------------------------------------- 
function initSettlementUI() {
            // 重新播放排行榜紀錄或使用相同題目再來一局的處理
            window.openLeaderboardRecordById = async function(id, mode) {
                // If full leaderboard is open, we'll stack the settlement modal on top via unified modal manager.
                // Mark context for confirm flow.
                let fullLb = document.getElementById('fullLeaderboardModal');
                const openedFromFullLeaderboard = !!(fullLb && !fullLb.classList.contains('hidden'));
                // Try cached data first for instant response
                let all = null;
                try {
                    if (window.__lbLatestData) all = window.__lbLatestData;
                } catch(_) {}
                if (!all || !all[mode]) {
                    // fallback to local storage immediately (non-blocking UI), fire online in background
                    try { all = JSON.parse(localStorage.getItem('bibleGameLeaderboard') || '{}') || { classic:[], survival:[] }; } catch(_) { all = { classic:[], survival:[] }; }
                    try {
                        const p = loadLeaderboard();
                        if (p && typeof p.then === 'function') {
                            p.then(data => { try { window.__lbLatestData = data; window.__lbLatestTs = Date.now(); } catch(_) {} }).catch(()=>{});
                        }
                    } catch(_) {}
                }
                if (!all || !all[mode]) return;
                const record = all[mode].find(r => String(r.id) === String(id));
                if (!record) return;

                // debug helper: surface whether timeReward was present/estimated for this record
                try {
                    if (window.__debugPerf || window.__BC_DEBUG_ENABLED) {
                        console.log('[DEBUG] openLeaderboardRecordById record:', { id: record.id, score: record.score, timeReward: record.timeReward, timeRewardEstimated: record.timeRewardEstimated, hintsRemaining: record.hintsRemaining, totalHints: record.totalHints });
                    }
                } catch (e) {}

                // 填入結算視窗內容（從儲存紀錄填充，不會進行新的儲存）
                // Prefill text (will be animated after breakdown render)
                // Reset and cancel any prior inline animations before rendering
                try {
                    const fs = document.getElementById('finalScore');
                    if (fs && fs.__ainCancel) { try { fs.__ainCancel(); } catch(_) {} }
                    if (fs) fs.textContent = '0';
                    const fa = document.getElementById('finalAccuracy');
                    if (fa && fa.__ainCancel) { try { fa.__ainCancel(); } catch(_) {} }
                    if (fa) fa.textContent = '0%';
                } catch(_) {}
                const accuracy = record.totalQuestions ? Math.round(((record.correctAnswers||0)/record.totalQuestions)*100) : 0;
                document.getElementById('finalAccuracy').textContent = '0%';
                const ratioEl = document.getElementById('finalAccuracyRatio');
                if (ratioEl) setRatio(ratioEl, (record.correctAnswers||0), (record.totalQuestions||0));

                // 優先使用儲存的結語經文（若有），否則以遊戲結束相同的方式自動選詩句
                const closingTextEl = document.getElementById('closingVerseText');
                const closingRefEl = document.getElementById('closingVerseRef');
                if (record.closingVerse || record.closingVerseRef) {
                    applyClosingVerse(record.closingVerse, record.closingVerseRef, false);
                } else {
                    updateClosingVerse(accuracy);
                }
                // 計算該記錄在該難度排行榜中的名次（若存在）以供顯示標頭
                let computedRank = null;
                try {
                    const list = all[mode] || [];
                    for (let idx = 0; idx < list.length; idx++) {
                        const r = list[idx];
                        if (String(r.id) === String(record.id)) {
                            computedRank = idx + 1;
                            break;
                        }
                    }
                } catch (e) { computedRank = null; }

                // Show the player's name for this record
                document.getElementById('rankMessage').textContent = record.playerName || '匿名';
                const hdr = document.getElementById('leaderboardHeader');
                if (hdr) {
                    if (computedRank) {
                        try { applyRankThemeUnified(computedRank,'record-view'); } catch(_) {}
                        try { finalizeRankStyling(computedRank); } catch(_) {}
                    } else {
                        hdr.innerHTML = `<span style="font-weight:700;">檢視記錄</span>`;
                    }
                }

                // 填入隱藏欄位以便後續按鈕使用
                document.getElementById('currentViewedRecordId').value = record.id || '';

                // 根據排名主題化名稱輸入區 (若當前檢視的紀錄含 computedRank 且介面顯示輸入欄則忽略)
                try { if (computedRank) applyPlayerNameFieldTheme(computedRank); } catch(_){ }

                // 填充計分詳細（使用統一的渲染器，與遊戲結束時相同的格式）
                const breakdown = document.getElementById('scoreBreakdownContent');
                if (breakdown) {
                    breakdown.innerHTML = '';
                    try {
                        // use unified renderer; if it throws, fall back to a minimal summary
                        renderScoreBreakdownFromRecord(record);
                    } catch (e) {
                        const rows = [];
                        rows.push(`<div>總分：<strong>${record.score || 0}</strong></div>`);
                        rows.push(`<div>答對：<strong>${(record.correctAnswers||0)}/${(record.totalQuestions||0)}</strong></div>`);
                        rows.push(`<div>失誤：<strong>${record.totalMistakes != null ? record.totalMistakes : '--'}</strong></div>`);
                        // omit time display for record view per UX request
                        breakdown.innerHTML = rows.map(r=>`<div class="text-xs text-gray-700">${r}</div>`).join('');
                    }
                }

                // 顯示 modal
                const modal = document.getElementById('playerNameModal');
                if (modal) {
                    // If modal is nested under a hidden parent (like #gameScreen), move it to document.body
                    if (modal.parentElement !== document.body) {
                        document.body.appendChild(modal);
                    }
                    // 標記為檢視模式，避免在關閉時再次儲存或修改名稱
                    modal.dataset.viewingRecord = 'true';
                    // 記錄當前檢視的排行榜模式，以便關閉後還原同一標籤
                    modal.dataset.viewingMode = (mode || record.playMode || gameState.playMode || '').toString();
                    // 記錄來源：若來自 full leaderboard，確認時應一併關閉它
                    modal.dataset.fromFullLeaderboard = openedFromFullLeaderboard ? '1' : '';

                    // 隱藏名稱輸入區，禁止在首頁檢視時更改名稱
                    const nameInputSection = document.getElementById('nameInputSection');
                    if (nameInputSection) nameInputSection.classList.add('hidden');
                    const leaderboardMessage = document.getElementById('leaderboardMessage');
                    if (leaderboardMessage) leaderboardMessage.classList.remove('hidden');

                    // When viewing a saved leaderboard record (opened from leaderboard cards),
                    // show the same-question replay button so users can replay that saved snapshot.
                    const replayBtn = document.getElementById('replaySameQuestionsBtn');
                    if (replayBtn) {
                        const pm = (record.playMode || gameState.playMode || '').toString();
                        if (pm === 'survival') {
                            replayBtn.classList.add('hidden');
                        } else {
                            replayBtn.classList.remove('hidden');
                        }
                    }

                    // 打開結算視窗（使用統一 modal manager 疊在 full leaderboard 之上）
                    try { window.openModal && window.openModal('playerNameModal'); } catch(_) { modal.classList.remove('hidden'); }
                    // attach record object for later use
                    modal.dataset.currentRecord = JSON.stringify(record);
                    // If this saved record has achievements, populate UI accordingly
                    try {
                        if (Array.isArray(record.achievements)) {
                            // temporarily set unlocked list and render
                            const prev = gameState.unlockedAchievements;
                            gameState.unlockedAchievements = record.achievements.map(a=>({ id:a.id, name:a.name, tier:a.tier, mode:a.mode, displayTier: a.displayTier != null ? a.displayTier : (typeof getDisplayTier==='function'? getDisplayTier(a):undefined) }));
                            try { renderAchievementsIntoModal(); } catch(_) {}
                            // restore to avoid leaking into gameplay state
                            gameState.unlockedAchievements = prev;
                        }
                    } catch(_) {}
                    // 不再手動隱藏/還原 full leaderboard，改由 modal stack 處理
                }
            };

            // (removed) replayAgainBtn event listener - button removed from DOM

            // 同樣題目再來一局（不列入排行榜）：載入題組快照並開始遊戲，並設定 skipLeaderboardOnComplete 標誌
            document.getElementById('replaySameQuestionsBtn').addEventListener('click', async () => {
                try { SFX.play('replayStart'); } catch(_) {}
                const modal = document.getElementById('playerNameModal');
                // Detach Enter hotkey as we are leaving the modal context
                try { detachPlayerNameModalEnterHotkey(); } catch (e) {}
                const raw = modal.dataset.currentRecord;
                if (!raw) return;
                const record = JSON.parse(raw);
                // 生存計時模式不提供「同題重玩」
                try {
                    const pm = (record.playMode || gameState.playMode || '').toString();
                    if (pm === 'survival') {
                        alert('生存計時模式不提供同題重玩。');
                        return;
                    }
                } catch(_) {}
                // 若沒有快照則無法執行
                if (!record.questionSnapshot) {
                    alert('此紀錄不包含題組快照，無法使用相同題目再來一局。');
                    return;
                }

                // 如果該紀錄已儲存到排行榜（有 id）且玩家名稱為空或為匿名，先提醒使用者
                const nameIsEmptyOrAnonymous = !record.playerName || record.playerName === '匿名';
                const isSavedRecord = !!record.id;
                console.log('[REPLAY] clicked replaySameQuestionsBtn', { recordId: record.id, playerName: record.playerName, isSavedRecord, nameIsEmptyOrAnonymous });
                // 需求：匿名玩家排行榜卡片 → 同題重玩不再跳出確認視窗，直接進行
                // 因此當為匿名紀錄時不顯示任何確認。若未來需對具名紀錄提示，可在此加入額外條件與詢問。

                // 載入快照（快照可能為新格式 { questionData, levelResults, totalQuestions } 或舊格式的陣列）
                gameState.difficulty = record.difficulty || gameState.difficulty;
                gameState.range = record.range || gameState.range;
                gameState.testament = record.testament || gameState.testament;
                gameState.customBooks = record.customBooks || gameState.customBooks;

                // 將題組替換為快照（優先使用 snapshot.questionData），並設定不要儲存排行榜的旗標
                try {
                    const rawSnap = record.questionSnapshot;
                    let snapshotData;
                    if (rawSnap && typeof rawSnap === 'object') {
                        if (rawSnap.version === 3 && Array.isArray(rawSnap.levels) && rawSnap.levels.length) {
                            // Multi-level sequence replay
                            gameState._replaySequence = rawSnap.levels.map(l => ({
                                level: l.level,
                                difficulty: l.difficulty,
                                questionData: l.questionData,
                                chapterOrder: l.chapterOrder || null
                            }));
                            gameState._replaySeqIndex = 0;
                            const first = gameState._replaySequence[0];
                            snapshotData = first.questionData;
                            gameState._forcedChapterOrder = Array.isArray(first.chapterOrder) ? [...first.chapterOrder] : null;
                            gameState.difficulty = first.difficulty || rawSnap.difficultyAtStart || gameState.difficulty;
                            gameState._adaptiveDisabled = true; // fully freeze adaptive for identical sequence
                            gameState._replaySnapshotHash = rawSnap.hash || null;
                        } else if (rawSnap.version === 2) {
                            snapshotData = rawSnap.questionData;
                            if (Array.isArray(rawSnap.chapterOrder)) {
                                gameState._forcedChapterOrder = [...rawSnap.chapterOrder];
                            } else {
                                gameState._forcedChapterOrder = null;
                            }
                            if (rawSnap.difficulty) gameState.difficulty = rawSnap.difficulty;
                            gameState._replaySnapshotHash = rawSnap.hash || null;
                            gameState._adaptiveDisabled = true; // freeze for v2 as well (ensures consistent attempts/hints scaling)
                        } else {
                            snapshotData = (rawSnap.questionData) ? rawSnap.questionData : rawSnap;
                            gameState._forcedChapterOrder = null;
                            gameState._replaySnapshotHash = null;
                        }
                    } else {
                        snapshotData = (rawSnap && rawSnap.questionData) ? rawSnap.questionData : rawSnap;
                        gameState._forcedChapterOrder = null;
                        gameState._replaySnapshotHash = null;
                    }
                    gameState.questionData = JSON.parse(JSON.stringify(snapshotData || []));
                } catch (e) {
                    const rawSnap = record.questionSnapshot;
                    const snapshotData = (rawSnap && rawSnap.questionData) ? rawSnap.questionData : rawSnap;
                    gameState.questionData = snapshotData || [];
                    gameState._forcedChapterOrder = null;
                    gameState._replaySnapshotHash = null;
                }
                gameState.skipLeaderboardOnComplete = true;
                // remember the original record so end-of-replay modal can reuse its static fields (closing verse, date/time)
                gameState.replaySourceRecord = record;
                console.log('[REPLAY] initialized replay flags', { skipLeaderboardOnComplete: gameState.skipLeaderboardOnComplete, replaySourceRecordId: gameState.replaySourceRecord && gameState.replaySourceRecord.id });
                // 改為於遊戲資訊卡顯示重播狀態，移除舊有角標切換
                // Diagnostic: verify snapshot hash integrity if available (best-effort, non-security)
                try {
                    if (gameState._replaySnapshotHash) {
                        const str = JSON.stringify(gameState.questionData || []);
                        let h = 0; for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) >>> 0; }
                        const currentHash = h.toString(16);
                        if (currentHash !== gameState._replaySnapshotHash) {
                            console.warn('[REPLAY][INTEGRITY] snapshot hash mismatch', { stored: gameState._replaySnapshotHash, computed: currentHash });
                        } else {
                            console.log('[REPLAY][INTEGRITY] snapshot hash verified', currentHash);
                        }
                    }
                } catch(e){ console.warn('[REPLAY][INTEGRITY] hash verification failed', e); }

                // 關閉 modal 並開始遊戲介面（直接顯示 gameScreen 並初始化狀態為該快照）
                document.getElementById('playerNameModal').classList.add('hidden');
                // ensure background scrolling is restored on mobile
                try { unlockBodyScroll(); } catch(e) {}
                // 手動進入遊戲畫面，避免重新生成題組
                hideAllScreens();
                document.getElementById('gameScreen').classList.remove('hidden');
                // 重播同題也重置滑動到前段（左側）
                try {
                    const carousel = document.getElementById('versesCarousel');
                    if (carousel) carousel.scrollTo({ left:0, behavior:'auto' });
                } catch(_) {}

                // 初始化遊戲狀態 but keep questionData
                gameState.currentLevel = 1;
                gameState.currentQuestion = 1;
                gameState.score = 0;
                gameState.hintsUsed = 0;
                gameState.levelPerfect = true;
                gameState.questionAttempts = {};
                gameState.usedHints = new Set();
                gameState.gameStartTime = Date.now();
                gameState.gameCompleted = false;
                gameState.isFirstQuestionOfLevel = true;
                gameState.consecutiveMistakes = 0;
                gameState.hintReminderShown = false;
                gameState.levelHintReminderShown = false;
                gameState.totalCorrectAnswers = 0;
                gameState.totalQuestions = record.totalQuestions || (gameState.questionData ? gameState.questionData.length : 0);
                // initialize attempts per question so UI logic (selecting / coloring) works
                (function initAttemptsForReplay() {
                    const maxAttemptsMap = { easy: 3, normal: 3, hard: 3 };
                    const perQuestion = maxAttemptsMap[gameState.difficulty] || 3;
                    if (Array.isArray(gameState.questionData)) {
                        gameState.questionData.forEach((q, i) => {
                            gameState.questionAttempts[i] = perQuestion;
                        });
                    }
                    // restore hint counts according to difficulty so hint button behaves
                    const hintCounts = { easy: 3, normal: 3, hard: 3 };
                    gameState.hintsRemaining = hintCounts[gameState.difficulty] || 3;
                })();
                gameState.totalMistakes = 0;
                // For a replay we must start with fresh level results so progress ovals reflect the new run
                gameState.levelResults = {};
                // Reset one-time per-run toast flag for the replayed session
                gameState.firstNoScoreMissToastShown = false;
                // 重播啟動時重新建立連擊 8 格 UI 並重設 combo 狀態
                try {
                    gameState.combo = 0; gameState.comboProgress = 0;
                    ensureComboSegmentsReady();
                    if (typeof updateComboUI==='function') updateComboUI(true);
                } catch(_) {}
                // Reset per-level failed counter for the replay session
                gameState.levelFailedCount = 0;
                // Reset combo state at the beginning of replay
                gameState.combo = 0;
                gameState.comboProgress = 0;
                gameState.comboTotalBonus = 0;
                try { if (gameState.comboDecayTimer) { clearTimeout(gameState.comboDecayTimer); gameState.comboDecayTimer = null; } } catch(_) {}
                try { updateComboUI(true); } catch(_) {}

                // 初始化題目相關 UI
                updateGameUI();
                displayQuestions();
                if (typeof scheduleProgressUIUpdate === 'function') scheduleProgressUIUpdate({ question: true });
                else updateQuestionOvals();

                // start level timer so time-reward and score updates work for the replayed session
                try {
                    gameState.levelStartTime = Date.now();
                    startLevelTimer();
                } catch (e) {
                    console.warn('Unable to start level timer after replay:', e);
                }
            });
            
}
window.initSettlementUI = initSettlementUI;
