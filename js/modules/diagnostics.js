    /* =============================================================
       Dev/Test Utilities (A5) - Pure function wrappers + mini tests
       可在 Console 呼叫 window.__runCoreSelfTest()
             Leaderboard 同步檢查：
                 - window.__diagLeaderboardSyncState()
                 - await window.__runLeaderboardSyncPathTest()
                 - await window.__runAchvLinkSyncPathTest()
                 - window.__diagSyncFailedQueues({ limit: 20 })
                 - await window.__runSyncHealthSuite({ includePathTests: false })
                 - window.__diagSyncHealthHistory({ limit: 15 })
                 - window.__clearSyncHealthHistory({ keepLast: 0 })
                 - window.__clearSyncFailedQueues({ target: 'all' })
                 - window.__clearDiagnosticFailedSyncItems({ target: 'all', dryRun: true })
                 - await window.__requeueFailedSyncItems({ target: 'all', limit: 30 })
                 - await window.__runSupabaseSchemaReadinessCheck()
                 - await window.__runSupabaseReadHealthCheck({ timeoutMs: 7000 })
                 - await window.__runSupabaseWritePathCheck({ runLiveWriteProbe: false })
                 - await window.__runAppSanityCheck()
                 - window.__diagExternalVerseState()
       ============================================================= */
    (function exposeCorePureHelpers(){
        try {
            if (window.__coreHelpersExposed) return;
            window.__coreHelpersExposed = true;
            // 包裝 computeRank 供測試（避免直接覆蓋）
            window.__test_computeRank = function(list, score, limit){ return computeRank(list, score, limit); };
            // 成就條件快速測試：傳 metrics 與成就 id，返回是否通過（僅用於開發）
            window.__test_checkAchievement = function(id, metrics){
                try { const defs = (AchievementManager && AchievementManager.defs)||[]; const a = defs.find(d=>d.id===id); if(!a) return null; return !!(function evalRule(rule,m){ if(!rule) return false; switch(rule.type){ case 'metric': { const v=m[rule.field]; const t=rule.value; switch(rule.op){ case '>=':return v>=t; case '>':return v>t; case '<=':return v<=t; case '<':return v<t; case '==':return v==t; default:return false;} } case 'and': return rule.children.every(r=>evalRule(r,m)); case 'or': return rule.children.some(r=>evalRule(r,m)); case 'custom': return !!rule.fn(m);} return false;})(a.condition, metrics||{}); } catch(e){ return false; }
            };
            // 簡單核心自我測試：僅測 computeRank 邏輯幾條關鍵案例
            window.__runCoreSelfTest = function(){
                // --- computeRank 核心案例 ---
                const rankCases = [
                    { list:[], score:100, limit:5, expect:1, note:'空榜單第一位'},
                    { list:[{score:200},{score:150}], score:120, limit:5, expect:3, note:'插到末尾 (榜未滿)'},
                    { list:[{score:300},{score:200},{score:100}], score:250, limit:5, expect:2, note:'中間插入'},
                    { list:[{score:300},{score:280},{score:260},{score:240},{score:220}], score:220, limit:5, expect:0, note:'等於最低不入榜(嚴格大於)'},
                    { list:[{score:300},{score:280},{score:260},{score:240},{score:220}], score:239, limit:5, expect:0, note:'低於最低不入榜'},
                    { list:[{score:300},{score:280},{score:260},{score:240}], score:100, limit:5, expect:5, note:'榜未滿 + 最低'}
                ];
                const rankResults = rankCases.map(c=>{ const got = computeRank(c.list, c.score, c.limit); return { ok: got===c.expect, got, expect:c.expect, note:c.note }; });
                const rankPass = rankResults.every(r=>r.ok);
                console.log('[SelfTest][computeRank]', rankPass?'ALL PASS':'SOME FAIL', rankResults);

                // --- Performance Score 測試 ---
                if (!window.__test_performanceScore) {
                    console.log('%c[SelfTest][PS] 尚未抽離 performance score 計算函式，後續可擴充。','color:orange');
                } else {
                    const psCases = [
                        { note:'基線：無失誤/無提示', input:{ mistakes:0, hints:0, duration:30, avgAnswerMs:4000, perfectBonus:true } },
                        { note:'輕微失誤', input:{ mistakes:1, hints:0, duration:32, avgAnswerMs:4500, perfectBonus:false } },
                        { note:'多失誤+提示', input:{ mistakes:3, hints:2, duration:40, avgAnswerMs:5200, perfectBonus:false } },
                        { note:'極快高品質', input:{ mistakes:0, hints:0, duration:22, avgAnswerMs:2800, perfectBonus:true } }
                    ];
                    const psResults = psCases.map(pc=>{ let v; try{ v=window.__test_performanceScore(pc.input); }catch(e){ v=null; } return { note:pc.note, value:v }; });
                    console.log('[SelfTest][PS]', psResults);
                }

                // --- Rarity Buffer 序列模擬 ---
                if (window.__test_rarityBufferSequence) {
                    const rseq = window.__test_rarityBufferSequence([0.18,0.20,-0.10,-0.18,-0.16,0.42]);
                    console.log('[SelfTest][RarityBuf]', rseq);
                } else {
                    console.log('%c[SelfTest][RarityBuf] 尚未提供 rarity buffer 模擬。','color:orange');
                }

                // --- computeRank 壓力測試（縮小預設 n 保守執行）---
                if (window.__stress_computeRank) {
                    const stress = window.__stress_computeRank(1200);
                    console.log('[StressTest][computeRank]', { durationMs:stress.durationMs, perOpMs:stress.perOpMs, n:1200, sample:stress.sample.slice(0,5) });
                }

                return { pass: rankPass, rankResults };
            };

            // ========= Performance Score (方案C) 純計算函式（推測重建，僅供測試，不影響正式流程） =========
            window.__test_performanceScore = function(meta){
                const mistakes = meta.mistakes||0;
                const hints = meta.hints||0;
                const duration = meta.duration||30; // 秒
                const avgAnswerMs = meta.avgAnswerMs||5000;
                const perfectBonus = !!meta.perfectBonus;
                const speedRatio = Math.min(2, Math.max(0.5, avgAnswerMs/5000)); // 0.5(快)~2(慢)
                const timeScore = (1 - (speedRatio-1)); // ratio=1 =>0, 0.5=>+0.5, 2=>-1
                const mistakePenalty = Math.min(0.8, mistakes * 0.18);
                const hintPenalty = Math.min(0.7, hints * 0.22);
                const durationAdj = (duration>35)? -((duration-35)/60):0; // 拖長懲罰
                const perfect = perfectBonus ? 0.25 : 0;
                let ps = timeScore - mistakePenalty - hintPenalty + durationAdj + perfect;
                if (ps>1) ps = 1 - (ps-1)*0.3; if (ps<-1) ps = -1 + (ps+1)*0.3; // 壓縮範圍
                return +ps.toFixed(3);
            };
            // 真實 vs 近似 PS 收集器：呼叫 collectRealPS(meta, realPs)
            (function initPSCollector(){
                if(window.__psCollector) return;
                const STORAGE_KEY = 'bc-psCollector-v1';
                const buf=[]; // {real, approx, delta, meta}
                // load persisted
                try {
                    const raw = localStorage.getItem(STORAGE_KEY);
                    if (raw) {
                        const arr = JSON.parse(raw);
                        if (Array.isArray(arr)) arr.slice(-120).forEach(o=>buf.push(o));
                    }
                } catch(_) {}
                let dirty=false; let saveTimer=null;
                function scheduleSave(){
                    dirty=true;
                    if(saveTimer) return;
                    saveTimer = setTimeout(()=>{
                        try { if(dirty){ localStorage.setItem(STORAGE_KEY, JSON.stringify(buf.slice(-120))); dirty=false; } } catch(_) {}
                        saveTimer=null;
                    }, 1500);
                }
                window.__psCollector = {
                    collect(meta, real){
                        try {
                            if(typeof window.__test_performanceScore !== 'function') return;
                            const approx = window.__test_performanceScore(meta||{});
                            const delta = (typeof real==='number')? +(real-approx).toFixed(3):null;
                            const metaLite = meta ? {
                                mistakes: meta.mistakes||0,
                                hints: meta.hints||0,
                                dur: meta.duration||0,
                                avg: meta.avgAnswerMs||0,
                                perfect: !!meta.perfectBonus
                            }:null;
                            buf.push({ ts: Date.now(), real, approx, delta, meta: metaLite });
                            if(buf.length>240) buf.splice(0, buf.length-240);
                            scheduleSave();
                        } catch(_) {}
                    },
                    stats(){
                        if(!buf.length) return { count:0 };
                        const deltas = buf.map(r=> typeof r.delta==='number'? Math.abs(r.delta):null).filter(v=>v!==null);
                        const avg = deltas.length? +(deltas.reduce((a,b)=>a+b,0)/deltas.length).toFixed(3):null;
                        const max = deltas.length? Math.max(...deltas):null;
                        return { count: buf.length, avgAbsDelta: avg, maxAbsDelta: max, recent: buf.slice(-10) };
                    },
                    export(){ try { return JSON.stringify(buf); } catch(e){ return '[]'; } },
                    import(json){
                        try {
                            const arr = JSON.parse(json); if(!Array.isArray(arr)) return false;
                            buf.length=0; arr.slice(-240).forEach(o=>buf.push(o)); scheduleSave(); return true;
                        } catch(e){ return false; }
                    },
                    clear(){ buf.length=0; scheduleSave(); },
                    raw(){ return buf.slice(); }
                };
            })();

            // ========= Rarity Buffer 升降級序列模擬 =========
            window.__test_rarityBufferSequence = function(psArray){
                let cur='common'; let pos=0, neg=0; const log=[];
                for (let i=0;i<psArray.length;i++){
                    const PS = psArray[i]; let promote=false, demote=false;
                    if (PS >= 0.40){ if(cur!=='rare'){ promote=true; cur='rare'; } pos=neg=0; }
                    else if (PS <= -0.40){ if(cur!=='common'){ demote=true; cur='common'; } pos=neg=0; }
                    else if (PS >= 0.15){ pos++; neg=0; if(pos>=2 && cur!=='rare'){ promote=true; cur='rare'; pos=0; } }
                    else if (PS <= -0.15){ neg++; pos=0; if(neg>=2 && cur!=='common'){ demote=true; cur='common'; neg=0; } }
                    else { pos=neg=0; }
                    log.push({i,PS,cur,pos,neg,promote,demote});
                }
                return log;
            };

            // ========= computeRank 壓力測試 =========
            window.__stress_computeRank = function(n){
                const list=[]; for(let i=0;i<50;i++){ list.push({score: Math.floor(Math.random()*5000)}); }
                list.sort((a,b)=>b.score-a.score);
                const sample=[]; const t0=performance.now();
                for(let k=0;k<n;k++){
                    const s = Math.floor(Math.random()*5000);
                    const r = computeRank(list, s, 50);
                    if (k<30) sample.push({s,r});
                }
                const t1=performance.now();
                return { durationMs:+(t1-t0).toFixed(2), perOpMs:+((t1-t0)/n).toFixed(4), sample };
            };

            // ========= Focus Trap 測試（需要 modal 已在 DOM） =========
            window.__test_focusTrap = function(modalSelector){
                const sel = modalSelector || '#playerNameModal';
                const m = document.querySelector(sel); if(!m) return {error:'modal not found'};
                const focusables = Array.from(m.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'))
                  .filter(el=>!el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));
                return { count: focusables.length, first: focusables[0]&&focusables[0].tagName, last: focusables.at(-1)&&focusables.at(-1).tagName };
            };

            // ========= Leaderboard 同步健檢（不寫入真實線上資料） =========
            window.__diagLeaderboardSyncState = function(){
                try {
                    const queueApi = window.PendingScoreSync;
                    const queue = (queueApi && typeof queueApi.load==='function') ? queueApi.load() : [];
                    const state = (queueApi && typeof queueApi.getState === 'function') ? queueApi.getState() : null;
                    const achvApi = window.PendingAchvLinkSync;
                    const achvQueue = (achvApi && typeof achvApi.load === 'function') ? achvApi.load() : [];
                    const achvState = (achvApi && typeof achvApi.getState === 'function') ? achvApi.getState() : null;
                    return {
                        adapterReady: !!(window.Leaderboard && typeof window.Leaderboard.save === 'function'),
                        queueEnabled: !!(queueApi && typeof queueApi.enqueue==='function' && typeof queueApi.flush==='function'),
                        queueLength: Array.isArray(queue) ? queue.length : 0,
                        flushing: !!(state && state.flushing),
                        failedQueueLength: state ? (state.failedQueueLength || 0) : null,
                        totalFlushed: state ? (state.totalFlushed || 0) : null,
                        totalFailed: state ? (state.totalFailed || 0) : null,
                        retryDelayMs: state ? (state.retryDelayMs || 0) : null,
                        nextRetryAt: state ? (state.nextRetryAt || 0) : null,
                        syncedKeyCount: state ? (state.syncedKeyCount || 0) : null,
                        lastFlushAt: state ? (state.lastFlushAt || 0) : null,
                        lastFlushError: state ? (state.lastFlushError || null) : null,
                        achvLinkEnabled: !!(achvApi && typeof achvApi.enqueue==='function' && typeof achvApi.flush==='function'),
                        achvLinkQueueLength: Array.isArray(achvQueue) ? achvQueue.length : 0,
                        achvLinkFlushing: !!(achvState && achvState.flushing),
                        achvLinkFailedQueueLength: achvState ? (achvState.failedQueueLength || 0) : null,
                        achvLinkTotalFlushed: achvState ? (achvState.totalFlushed || 0) : null,
                        achvLinkTotalFailed: achvState ? (achvState.totalFailed || 0) : null,
                        achvLinkRetryDelayMs: achvState ? (achvState.retryDelayMs || 0) : null,
                        achvLinkNextRetryAt: achvState ? (achvState.nextRetryAt || 0) : null,
                        achvLinkedKeyCount: achvState ? (achvState.linkedKeyCount || 0) : null,
                        achvLinkLastFlushAt: achvState ? (achvState.lastFlushAt || 0) : null,
                        achvLinkLastFlushError: achvState ? (achvState.lastFlushError || null) : null,
                        timeoutMs: (window.__BC_CONSTS && window.__BC_CONSTS.LEADERBOARD_ONLINE_TIMEOUT_MS) || null,
                        online: (typeof navigator !== 'undefined') ? !!navigator.onLine : null
                    };
                } catch(e) {
                    return { error: String(e && e.message || e) };
                }
            };

            window.__runLeaderboardSyncPathTest = async function(){
                const out = { startedAt: new Date().toISOString(), tests: [] };
                const queueApi = window.PendingScoreSync;
                const cfg = window.__BC_CONSTS || {};
                if (!queueApi || typeof queueApi.enqueue!=='function' || typeof queueApi.flush!=='function') {
                    out.error = 'PendingScoreSync not available';
                    return out;
                }

                const key = cfg.STORAGE_KEY_PENDING_SCORE_QUEUE || 'bibleGamePendingScoreQueue';
                const failedKey = cfg.STORAGE_KEY_PENDING_SCORE_FAILED || 'bibleGamePendingScoreFailed';
                const originalQueue = (queueApi.load && queueApi.load()) || [];
                const originalFailed = (window.__bcStorage && window.__bcStorage.get(failedKey, [])) || [];
                const originalLeaderboard = window.Leaderboard;
                const originalTimeout = cfg.LEADERBOARD_ONLINE_TIMEOUT_MS;

                function clearQueue(){ try { window.__bcStorage && window.__bcStorage.set(key, []); } catch(_) {} }
                function clearFailed(){ try { window.__bcStorage && window.__bcStorage.set(failedKey, []); } catch(_) {} }
                function fakeRecord(tag){
                    return {
                        id: `diag-${tag}-${Date.now()}-${Math.floor(Math.random()*1e6)}`,
                        playerName: 'diag',
                        score: 123,
                        playMode: 'classic',
                        date: new Date().toLocaleDateString('zh-TW'),
                        time: '0:10',
                        mode: 'ranking'
                    };
                }

                try {
                    // test-1: success path
                    clearQueue();
                    window.Leaderboard = { save: async () => ({ ok:true }) };
                    queueApi.enqueue(fakeRecord('success'));
                    const r1 = await queueApi.flush({ limit: 5 });
                    out.tests.push({ path:'success', result:r1, pass: !!(r1 && r1.flushed >= 1 && r1.remaining === 0) });

                    // test-2: timeout path (fast timeout for diagnostics)
                    clearQueue();
                    try { if (window.__BC_CONSTS) window.__BC_CONSTS.LEADERBOARD_ONLINE_TIMEOUT_MS = 120; } catch(_) {}
                    window.Leaderboard = { save: () => new Promise(()=>{}) };
                    queueApi.enqueue(fakeRecord('timeout'));
                    const r2 = await queueApi.flush({ limit: 5 });
                    const q2 = (queueApi.load && queueApi.load()) || [];
                    out.tests.push({ path:'timeout', result:r2, queueAfter:q2.length, pass: !!(q2.length >= 1) });

                    // test-3: adapter unavailable path
                    clearQueue();
                    window.Leaderboard = null;
                    queueApi.enqueue(fakeRecord('adapter-unavailable'));
                    const r3 = await queueApi.flush({ limit: 5 });
                    out.tests.push({ path:'adapter-unavailable', result:r3, pass: !!(r3 && r3.reason === 'adapter-unavailable') });

                    // test-4: poison item path (max attempts -> move to failed queue)
                    clearQueue();
                    clearFailed();
                    window.Leaderboard = { save: async () => { throw new Error('diag-poison-score'); } };
                    queueApi.enqueue(fakeRecord('poison'));
                    for (let i = 0; i < 4; i++) {
                        try { await queueApi.flush({ limit: 1 }); } catch(_) {}
                    }
                    const q4 = (queueApi.load && queueApi.load()) || [];
                    const f4 = (window.__bcStorage && window.__bcStorage.get(failedKey, [])) || [];
                    out.tests.push({ path:'poison-isolation', queueAfter:q4.length, failedAfter:f4.length, pass: !!(q4.length === 0 && f4.length >= 1) });
                } catch(e) {
                    out.error = String(e && e.message || e);
                } finally {
                    try { if (window.__BC_CONSTS) window.__BC_CONSTS.LEADERBOARD_ONLINE_TIMEOUT_MS = originalTimeout; } catch(_) {}
                    try { window.Leaderboard = originalLeaderboard; } catch(_) {}
                    try { window.__bcStorage && window.__bcStorage.set(key, originalQueue); } catch(_) {}
                    try { window.__bcStorage && window.__bcStorage.set(failedKey, originalFailed); } catch(_) {}
                    out.finishedAt = new Date().toISOString();
                    out.ok = !out.error && out.tests.length>0 && out.tests.every(t=>t.pass);
                }
                return out;
            };

            window.__runAchvLinkSyncPathTest = async function(){
                const out = { startedAt: new Date().toISOString(), tests: [] };
                const api = window.PendingAchvLinkSync;
                const cfg = window.__BC_CONSTS || {};
                if (!api || typeof api.enqueue!=='function' || typeof api.flush!=='function') {
                    out.error = 'PendingAchvLinkSync not available';
                    return out;
                }

                const key = cfg.STORAGE_KEY_PENDING_ACHV_LINK_QUEUE || 'bibleGamePendingAchvLinkQueue';
                const failedKey = cfg.STORAGE_KEY_PENDING_ACHV_LINK_FAILED || 'bibleGamePendingAchvLinkFailed';
                const originalQueue = (api.load && api.load()) || [];
                const originalFailed = (window.__bcStorage && window.__bcStorage.get(failedKey, [])) || [];
                const originalLinkFn = window.linkLatestAchievementRunToScore;

                function clearQueue(){ try { window.__bcStorage && window.__bcStorage.set(key, []); } catch(_) {} }
                function clearFailed(){ try { window.__bcStorage && window.__bcStorage.set(failedKey, []); } catch(_) {} }
                function fakeItem(tag){ return { scoreId: `diag-score-${tag}-${Date.now()}`, runId: `diag-run-${tag}` }; }

                try {
                    // test-1: success path
                    clearQueue();
                    window.linkLatestAchievementRunToScore = async () => ({ ok:true });
                    api.enqueue(fakeItem('success'));
                    const r1 = await api.flush({ limit: 5 });
                    out.tests.push({ path:'success', result:r1, pass: !!(r1 && r1.flushed >= 1 && r1.remaining === 0) });

                    // test-2: failure path (should remain queued)
                    clearQueue();
                    window.linkLatestAchievementRunToScore = async () => { throw new Error('diag-link-fail'); };
                    api.enqueue(fakeItem('failure'));
                    const r2 = await api.flush({ limit: 5 });
                    const q2 = (api.load && api.load()) || [];
                    out.tests.push({ path:'failure', result:r2, queueAfter:q2.length, pass: !!(q2.length >= 1) });

                    // test-3: API unavailable path
                    clearQueue();
                    window.linkLatestAchievementRunToScore = null;
                    api.enqueue(fakeItem('api-unavailable'));
                    const r3 = await api.flush({ limit: 5 });
                    out.tests.push({ path:'api-unavailable', result:r3, pass: !!(r3 && r3.reason === 'link-api-unavailable') });

                    // test-4: poison item path (max attempts -> move to failed queue)
                    clearQueue();
                    clearFailed();
                    window.linkLatestAchievementRunToScore = async () => { throw new Error('diag-poison-achv'); };
                    api.enqueue(fakeItem('poison'));
                    for (let i = 0; i < 5; i++) {
                        try { await api.flush({ limit: 1 }); } catch(_) {}
                    }
                    const q4 = (api.load && api.load()) || [];
                    const f4 = (window.__bcStorage && window.__bcStorage.get(failedKey, [])) || [];
                    out.tests.push({ path:'poison-isolation', queueAfter:q4.length, failedAfter:f4.length, pass: !!(q4.length === 0 && f4.length >= 1) });
                } catch(e) {
                    out.error = String(e && e.message || e);
                } finally {
                    try { window.linkLatestAchievementRunToScore = originalLinkFn; } catch(_) {}
                    try { window.__bcStorage && window.__bcStorage.set(key, originalQueue); } catch(_) {}
                    try { window.__bcStorage && window.__bcStorage.set(failedKey, originalFailed); } catch(_) {}
                    out.finishedAt = new Date().toISOString();
                    out.ok = !out.error && out.tests.length>0 && out.tests.every(t=>t.pass);
                }
                return out;
            };

            window.__diagSyncFailedQueues = function(options){
                try {
                    const cfg = window.__BC_CONSTS || {};
                    const lim = Math.max(1, Number(options && options.limit) || 20);
                    const scoreKey = cfg.STORAGE_KEY_PENDING_SCORE_FAILED || 'bibleGamePendingScoreFailed';
                    const achvKey = cfg.STORAGE_KEY_PENDING_ACHV_LINK_FAILED || 'bibleGamePendingAchvLinkFailed';
                    const scoreFailed = (window.__bcStorage && window.__bcStorage.get(scoreKey, [])) || [];
                    const achvFailed = (window.__bcStorage && window.__bcStorage.get(achvKey, [])) || [];

                    const isDiagEntry = (entry) => {
                        if (!entry || typeof entry !== 'object') return false;
                        const reason = String(entry.reason || '').toLowerCase();
                        if (reason.includes('diag')) return true;
                        const record = entry.record || null;
                        const item = entry.item || null;
                        const recordId = record && record.id != null ? String(record.id).toLowerCase() : '';
                        const playerName = record && record.playerName != null ? String(record.playerName).toLowerCase() : '';
                        const scoreId = item && item.scoreId != null ? String(item.scoreId).toLowerCase() : '';
                        const runId = item && item.runId != null ? String(item.runId).toLowerCase() : '';
                        return (
                            recordId.startsWith('diag-') ||
                            playerName.startsWith('diag-') ||
                            scoreId.startsWith('diag-') ||
                            runId.startsWith('diag-')
                        );
                    };

                    const reasonStats = (arr) => {
                        const stats = Object.create(null);
                        (Array.isArray(arr) ? arr : []).forEach((x) => {
                            const key = x && x.reason ? String(x.reason) : 'unknown';
                            stats[key] = (stats[key] || 0) + 1;
                        });
                        return stats;
                    };

                    const toRecent = (arr) => (Array.isArray(arr) ? arr.slice(-lim) : []).map((x)=>(
                        {
                            reason: x && x.reason ? String(x.reason) : null,
                            failedAt: x && x.failedAt ? Number(x.failedAt) : null,
                            hasRecord: !!(x && x.record),
                            hasItem: !!(x && x.item),
                            recordId: (x && x.record && x.record.id != null) ? String(x.record.id) : null,
                            playerName: (x && x.record && x.record.playerName != null) ? String(x.record.playerName) : null,
                            playMode: (x && x.record && x.record.playMode != null) ? String(x.record.playMode) : null,
                            score: (x && x.record && typeof x.record.score === 'number') ? x.record.score : null,
                            scoreId: (x && x.item && x.item.scoreId) ? String(x.item.scoreId) : null,
                            runId: (x && x.item && x.item.runId != null) ? String(x.item.runId) : null,
                            diagnostic: isDiagEntry(x)
                        }
                    ));

                    const scoreDiagCount = Array.isArray(scoreFailed) ? scoreFailed.filter(isDiagEntry).length : 0;
                    const achvDiagCount = Array.isArray(achvFailed) ? achvFailed.filter(isDiagEntry).length : 0;
                    return {
                        scoreFailedCount: Array.isArray(scoreFailed) ? scoreFailed.length : 0,
                        achvFailedCount: Array.isArray(achvFailed) ? achvFailed.length : 0,
                        scoreFailedDiagnostic: scoreDiagCount,
                        achvFailedDiagnostic: achvDiagCount,
                        scoreFailedEffective: Math.max(0, (Array.isArray(scoreFailed) ? scoreFailed.length : 0) - scoreDiagCount),
                        achvFailedEffective: Math.max(0, (Array.isArray(achvFailed) ? achvFailed.length : 0) - achvDiagCount),
                        scoreReasonStats: reasonStats(scoreFailed),
                        achvReasonStats: reasonStats(achvFailed),
                        scoreRecent: toRecent(scoreFailed),
                        achvRecent: toRecent(achvFailed)
                    };
                } catch(e) {
                    return { error: String(e && e.message || e) };
                }
            };

            window.__clearSyncFailedQueues = function(options){
                try {
                    const cfg = window.__BC_CONSTS || {};
                    const target = String((options && options.target) || 'all').toLowerCase();
                    const dryRun = !!(options && options.dryRun);
                    const scoreKey = cfg.STORAGE_KEY_PENDING_SCORE_FAILED || 'bibleGamePendingScoreFailed';
                    const achvKey = cfg.STORAGE_KEY_PENDING_ACHV_LINK_FAILED || 'bibleGamePendingAchvLinkFailed';
                    const scoreFailed = (window.__bcStorage && window.__bcStorage.get(scoreKey, [])) || [];
                    const achvFailed = (window.__bcStorage && window.__bcStorage.get(achvKey, [])) || [];
                    const out = {
                        target,
                        dryRun,
                        before: {
                            scoreFailedCount: Array.isArray(scoreFailed) ? scoreFailed.length : 0,
                            achvFailedCount: Array.isArray(achvFailed) ? achvFailed.length : 0
                        },
                        cleared: { score: 0, achv: 0 }
                    };
                    if (!dryRun) {
                        if (target === 'all' || target === 'score') {
                            out.cleared.score = out.before.scoreFailedCount;
                            try { window.__bcStorage && window.__bcStorage.set(scoreKey, []); } catch(_) {}
                        }
                        if (target === 'all' || target === 'achv' || target === 'achvlink') {
                            out.cleared.achv = out.before.achvFailedCount;
                            try { window.__bcStorage && window.__bcStorage.set(achvKey, []); } catch(_) {}
                        }
                    }
                    return out;
                } catch(e) {
                    return { error: String(e && e.message || e) };
                }
            };

            window.__clearDiagnosticFailedSyncItems = function(options){
                try {
                    const cfg = window.__BC_CONSTS || {};
                    const target = String((options && options.target) || 'all').toLowerCase();
                    const dryRun = !!(options && options.dryRun);
                    const scoreKey = cfg.STORAGE_KEY_PENDING_SCORE_FAILED || 'bibleGamePendingScoreFailed';
                    const achvKey = cfg.STORAGE_KEY_PENDING_ACHV_LINK_FAILED || 'bibleGamePendingAchvLinkFailed';
                    const scoreFailed = (window.__bcStorage && window.__bcStorage.get(scoreKey, [])) || [];
                    const achvFailed = (window.__bcStorage && window.__bcStorage.get(achvKey, [])) || [];

                    const isDiagEntry = (entry) => {
                        if (!entry || typeof entry !== 'object') return false;
                        const reason = String(entry.reason || '').toLowerCase();
                        if (reason.includes('diag')) return true;
                        const record = entry.record || null;
                        const item = entry.item || null;
                        const recordId = record && record.id != null ? String(record.id).toLowerCase() : '';
                        const playerName = record && record.playerName != null ? String(record.playerName).toLowerCase() : '';
                        const scoreId = item && item.scoreId != null ? String(item.scoreId).toLowerCase() : '';
                        const runId = item && item.runId != null ? String(item.runId).toLowerCase() : '';
                        return (
                            recordId.startsWith('diag-') ||
                            playerName.startsWith('diag-') ||
                            scoreId.startsWith('diag-') ||
                            runId.startsWith('diag-')
                        );
                    };

                    const filterKeep = (arr) => (Array.isArray(arr) ? arr.filter((entry) => !isDiagEntry(entry)) : []);
                    const scoreAfter = (target === 'all' || target === 'score') ? filterKeep(scoreFailed) : scoreFailed;
                    const achvAfter = (target === 'all' || target === 'achv' || target === 'achvlink') ? filterKeep(achvFailed) : achvFailed;
                    const removedScore = Math.max(0, (Array.isArray(scoreFailed) ? scoreFailed.length : 0) - (Array.isArray(scoreAfter) ? scoreAfter.length : 0));
                    const removedAchv = Math.max(0, (Array.isArray(achvFailed) ? achvFailed.length : 0) - (Array.isArray(achvAfter) ? achvAfter.length : 0));

                    if (!dryRun) {
                        if (target === 'all' || target === 'score') {
                            try { window.__bcStorage && window.__bcStorage.set(scoreKey, scoreAfter); } catch(_) {}
                        }
                        if (target === 'all' || target === 'achv' || target === 'achvlink') {
                            try { window.__bcStorage && window.__bcStorage.set(achvKey, achvAfter); } catch(_) {}
                        }
                    }

                    return {
                        target,
                        dryRun,
                        removed: { score: removedScore, achv: removedAchv },
                        before: {
                            scoreFailedCount: Array.isArray(scoreFailed) ? scoreFailed.length : 0,
                            achvFailedCount: Array.isArray(achvFailed) ? achvFailed.length : 0
                        },
                        after: {
                            scoreFailedCount: Array.isArray(scoreAfter) ? scoreAfter.length : 0,
                            achvFailedCount: Array.isArray(achvAfter) ? achvAfter.length : 0
                        }
                    };
                } catch(e) {
                    return { error: String(e && e.message || e) };
                }
            };

            window.__requeueFailedSyncItems = async function(options){
                const out = { startedAt: new Date().toISOString() };
                try {
                    const cfg = window.__BC_CONSTS || {};
                    const target = String((options && options.target) || 'all').toLowerCase();
                    const limit = Math.max(1, Number(options && options.limit) || 30);
                    const scoreKey = cfg.STORAGE_KEY_PENDING_SCORE_FAILED || 'bibleGamePendingScoreFailed';
                    const achvKey = cfg.STORAGE_KEY_PENDING_ACHV_LINK_FAILED || 'bibleGamePendingAchvLinkFailed';
                    const scoreApi = window.PendingScoreSync;
                    const achvApi = window.PendingAchvLinkSync;
                    let scoreFailed = (window.__bcStorage && window.__bcStorage.get(scoreKey, [])) || [];
                    let achvFailed = (window.__bcStorage && window.__bcStorage.get(achvKey, [])) || [];
                    out.before = {
                        scoreFailedCount: Array.isArray(scoreFailed) ? scoreFailed.length : 0,
                        achvFailedCount: Array.isArray(achvFailed) ? achvFailed.length : 0
                    };
                    out.moved = { score: 0, achv: 0 };

                    if ((target === 'all' || target === 'score') && scoreApi && typeof scoreApi.enqueue === 'function' && Array.isArray(scoreFailed) && scoreFailed.length) {
                        const take = scoreFailed.slice(-limit);
                        const remain = scoreFailed.slice(0, Math.max(0, scoreFailed.length - take.length));
                        take.forEach((entry) => {
                            try {
                                if (entry && entry.record) {
                                    const ok = scoreApi.enqueue(entry.record);
                                    if (ok) out.moved.score++;
                                }
                            } catch(_) {}
                        });
                        scoreFailed = remain;
                        try { window.__bcStorage && window.__bcStorage.set(scoreKey, scoreFailed); } catch(_) {}
                        try { await scoreApi.flush({ limit: Math.min(20, limit) }); } catch(_) {}
                    }

                    if ((target === 'all' || target === 'achv' || target === 'achvlink') && achvApi && typeof achvApi.enqueue === 'function' && Array.isArray(achvFailed) && achvFailed.length) {
                        const take = achvFailed.slice(-limit);
                        const remain = achvFailed.slice(0, Math.max(0, achvFailed.length - take.length));
                        take.forEach((entry) => {
                            try {
                                if (entry && entry.item) {
                                    const ok = achvApi.enqueue(entry.item);
                                    if (ok) out.moved.achv++;
                                }
                            } catch(_) {}
                        });
                        achvFailed = remain;
                        try { window.__bcStorage && window.__bcStorage.set(achvKey, achvFailed); } catch(_) {}
                        try { await achvApi.flush({ limit: Math.min(20, limit) }); } catch(_) {}
                    }

                    out.after = {
                        scoreFailedCount: Array.isArray(scoreFailed) ? scoreFailed.length : 0,
                        achvFailedCount: Array.isArray(achvFailed) ? achvFailed.length : 0
                    };
                    out.ok = true;
                } catch(e) {
                    out.ok = false;
                    out.error = String(e && e.message || e);
                }
                out.finishedAt = new Date().toISOString();
                return out;
            };

            window.__diagSyncHealthHistory = function(options){
                try {
                    const lim = Math.max(1, Number(options && options.limit) || 20);
                    const onlyFailures = !!(options && options.onlyFailures);
                    const key = 'bibleGameSyncHealthHistory';
                    let hist = [];
                    try {
                        if (window.__bcStorage && typeof window.__bcStorage.get === 'function') {
                            hist = window.__bcStorage.get(key, []);
                        }
                        if (!Array.isArray(hist)) hist = [];
                    } catch(_) { hist = []; }
                    if (!Array.isArray(hist) || hist.length === 0) {
                        try {
                            const raw = localStorage.getItem(key);
                            if (raw) {
                                const parsed = JSON.parse(raw);
                                if (Array.isArray(parsed)) hist = parsed;
                            }
                        } catch(_) {}
                    }
                    const list = Array.isArray(hist) ? hist : [];
                    const base = onlyFailures ? list.filter((x)=>x && x.ok === false) : list;
                    const recent = base.slice(-lim);
                    const failureCount = list.filter((x)=>x && x.ok === false).length;
                    const degradation = (function(){
                        if (list.length < 2) return false;
                        const last = list[list.length - 1];
                        const prev = list[list.length - 2];
                        if (!last || !prev) return false;
                        if (prev.ok === true && last.ok === false) return true;
                        const prevScoreEff = Number(prev && prev.summary && prev.summary.scoreFailedEffective) || 0;
                        const lastScoreEff = Number(last && last.summary && last.summary.scoreFailedEffective) || 0;
                        const prevAchvEff = Number(prev && prev.summary && prev.summary.achvFailedEffective) || 0;
                        const lastAchvEff = Number(last && last.summary && last.summary.achvFailedEffective) || 0;
                        return (lastScoreEff > prevScoreEff) || (lastAchvEff > prevAchvEff);
                    })();
                    return {
                        count: list.length,
                        failureCount,
                        healthyRatio: list.length ? +(((list.length - failureCount) / list.length).toFixed(3)) : 1,
                        degradation,
                        recent
                    };
                } catch(e) {
                    return { error: String(e && e.message || e) };
                }
            };

            window.__clearSyncHealthHistory = function(options){
                try {
                    const key = 'bibleGameSyncHealthHistory';
                    const keepLast = Math.max(0, Number(options && options.keepLast) || 0);
                    let hist = [];
                    try {
                        if (window.__bcStorage && typeof window.__bcStorage.get === 'function') {
                            hist = window.__bcStorage.get(key, []);
                        }
                        if (!Array.isArray(hist)) hist = [];
                    } catch(_) { hist = []; }
                    if (!Array.isArray(hist) || hist.length === 0) {
                        try {
                            const raw = localStorage.getItem(key);
                            if (raw) {
                                const parsed = JSON.parse(raw);
                                if (Array.isArray(parsed)) hist = parsed;
                            }
                        } catch(_) {}
                    }
                    const list = Array.isArray(hist) ? hist : [];
                    const next = keepLast > 0 ? list.slice(-keepLast) : [];
                    try { window.__bcStorage && window.__bcStorage.set && window.__bcStorage.set(key, next); } catch(_) {}
                    try { localStorage.setItem(key, JSON.stringify(next)); } catch(_) {}
                    return {
                        before: list.length,
                        after: next.length,
                        cleared: Math.max(0, list.length - next.length)
                    };
                } catch(e) {
                    return { error: String(e && e.message || e) };
                }
            };

            window.__runSyncHealthSuite = async function(options){
                const out = {
                    startedAt: new Date().toISOString(),
                    options: {
                        includePathTests: !!(options && options.includePathTests),
                        includeWriteCheck: (options && typeof options.includeWriteCheck === 'boolean') ? !!options.includeWriteCheck : true,
                        includeSchemaCheck: (options && typeof options.includeSchemaCheck === 'boolean') ? !!options.includeSchemaCheck : true,
                        ignoreDiagnosticFailed: (options && typeof options.ignoreDiagnosticFailed === 'boolean') ? !!options.ignoreDiagnosticFailed : true,
                        failedQueueLimit: Math.max(1, Number(options && options.failedQueueLimit) || 20)
                    }
                };
                try {
                    const sync = (typeof window.__diagLeaderboardSyncState === 'function') ? window.__diagLeaderboardSyncState() : { error: 'diag-sync-state-unavailable' };
                    const failed = (typeof window.__diagSyncFailedQueues === 'function')
                        ? window.__diagSyncFailedQueues({ limit: out.options.failedQueueLimit })
                        : { error: 'diag-failed-queues-unavailable' };

                    out.sync = sync;
                    out.failedQueues = failed;

                    const isDiagEntry = (entry) => {
                        if (!entry || typeof entry !== 'object') return false;
                        const reason = String(entry.reason || '').toLowerCase();
                        if (reason.includes('diag')) return true;
                        const record = entry.record || null;
                        const item = entry.item || null;
                        const recordId = record && record.id != null ? String(record.id).toLowerCase() : '';
                        const playerName = record && record.playerName != null ? String(record.playerName).toLowerCase() : '';
                        const scoreId = item && item.scoreId != null ? String(item.scoreId).toLowerCase() : '';
                        const runId = item && item.runId != null ? String(item.runId).toLowerCase() : '';
                        return (
                            recordId.startsWith('diag-') ||
                            playerName.startsWith('diag-') ||
                            scoreId.startsWith('diag-') ||
                            runId.startsWith('diag-')
                        );
                    };

                    const cfg = window.__BC_CONSTS || {};
                    const scoreFailedKey = cfg.STORAGE_KEY_PENDING_SCORE_FAILED || 'bibleGamePendingScoreFailed';
                    const achvFailedKey = cfg.STORAGE_KEY_PENDING_ACHV_LINK_FAILED || 'bibleGamePendingAchvLinkFailed';
                    const scoreFailedRaw = (window.__bcStorage && window.__bcStorage.get(scoreFailedKey, [])) || [];
                    const achvFailedRaw = (window.__bcStorage && window.__bcStorage.get(achvFailedKey, [])) || [];
                    const scoreDiagFailedCount = Array.isArray(scoreFailedRaw) ? scoreFailedRaw.filter(isDiagEntry).length : 0;
                    const achvDiagFailedCount = Array.isArray(achvFailedRaw) ? achvFailedRaw.filter(isDiagEntry).length : 0;

                    const rawScoreFailed = Number(failed && failed.scoreFailedCount) || 0;
                    const rawAchvFailed = Number(failed && failed.achvFailedCount) || 0;
                    const effectiveScoreFailed = out.options.ignoreDiagnosticFailed ? Math.max(0, rawScoreFailed - scoreDiagFailedCount) : rawScoreFailed;
                    const effectiveAchvFailed = out.options.ignoreDiagnosticFailed ? Math.max(0, rawAchvFailed - achvDiagFailedCount) : rawAchvFailed;

                    out.summary = {
                        queueBacklog: Number(sync && sync.queueLength) || 0,
                        achvBacklog: Number(sync && sync.achvLinkQueueLength) || 0,
                        scoreFailed: rawScoreFailed,
                        achvFailed: rawAchvFailed,
                        scoreFailedDiagnostic: scoreDiagFailedCount,
                        achvFailedDiagnostic: achvDiagFailedCount,
                        scoreFailedEffective: effectiveScoreFailed,
                        achvFailedEffective: effectiveAchvFailed,
                        online: (sync && typeof sync.online === 'boolean') ? sync.online : null,
                        adapterReady: !!(sync && sync.adapterReady),
                        queueEnabled: !!(sync && sync.queueEnabled),
                        achvLinkEnabled: !!(sync && sync.achvLinkEnabled),
                        hasLastError: !!((sync && sync.lastFlushError) || (sync && sync.achvLinkLastFlushError))
                    };

                    if (out.options.includeWriteCheck && typeof window.__runSupabaseWritePathCheck === 'function') {
                        const writeCheck = await window.__runSupabaseWritePathCheck({ runLiveWriteProbe: false });
                        out.writePath = writeCheck;
                        out.summary.writePathOk = !!(writeCheck && writeCheck.ok);
                    } else {
                        out.summary.writePathOk = null;
                    }

                    if (out.options.includeSchemaCheck && typeof window.__runSupabaseSchemaReadinessCheck === 'function') {
                        const schemaCheck = await window.__runSupabaseSchemaReadinessCheck();
                        out.schemaCheck = schemaCheck;
                        out.summary.schemaReady = !!(schemaCheck && schemaCheck.ok);
                        out.summary.schemaDegraded = !!(schemaCheck && schemaCheck.degraded);
                    } else {
                        out.summary.schemaReady = null;
                        out.summary.schemaDegraded = null;
                    }

                    const scoreReasonStats = (failed && failed.scoreReasonStats && typeof failed.scoreReasonStats === 'object') ? failed.scoreReasonStats : {};
                    const achvReasonStats = (failed && failed.achvReasonStats && typeof failed.achvReasonStats === 'object') ? failed.achvReasonStats : {};
                    out.reasonStats = { score: scoreReasonStats, achv: achvReasonStats };

                    const actions = [];
                    const addAction = (msg) => { if (msg && actions.indexOf(msg) === -1) actions.push(msg); };
                    const reasonKeySet = Object.keys(scoreReasonStats).concat(Object.keys(achvReasonStats)).map((k)=>String(k||'').toLowerCase());
                    const hasReason = (matcher) => reasonKeySet.some((k)=>matcher(k));

                    if (!out.summary.adapterReady) addAction('Leaderboard adapter not ready; call tryInitOnlineLeaderboard() then re-check.');
                    if (!out.summary.queueEnabled) addAction('PendingScoreSync unavailable; verify bootstrap execution and constants wiring.');
                    if (!out.summary.achvLinkEnabled) addAction('PendingAchvLinkSync unavailable; verify bootstrap execution and achievement link wiring.');
                    if (out.summary.scoreFailedEffective > 0 || out.summary.achvFailedEffective > 0) {
                        addAction('Review failed items with __diagSyncFailedQueues(); then __requeueFailedSyncItems() or __clearSyncFailedQueues().');
                    }
                    if (out.options.ignoreDiagnosticFailed && (out.summary.scoreFailedDiagnostic > 0 || out.summary.achvFailedDiagnostic > 0)) {
                        addAction('Diagnostic failed residues detected; clear only diagnostics via __clearDiagnosticFailedSyncItems({ target: "all" }).');
                    }
                    if (out.summary.queueBacklog > 0 || out.summary.achvBacklog > 0) {
                        addAction('Backlog exists; call PendingScoreSync.flush() and PendingAchvLinkSync.flush() after network recovers.');
                    }
                    if (out.summary.writePathOk === false) {
                        addAction('Write-path check failed; run __runSupabaseWritePathCheck() and inspect timeout/offline fallback behavior.');
                    }
                    if (out.summary.schemaReady === false) {
                        addAction('Supabase schema is not fully aligned; run __runSupabaseSchemaReadinessCheck() and apply setup_supabase.sql when available.');
                    }
                    if (out.summary.schemaDegraded === true) {
                        addAction('Supabase schema is partially aligned (degraded mode); apply setup_supabase.sql later to restore full dedupe/analytics fields.');
                    }

                    if (hasReason((k)=>/timeout/.test(k))) {
                        addAction('Timeout-like failures detected; verify network latency and tune LEADERBOARD_ONLINE_TIMEOUT_MS if needed.');
                    }
                    if (hasReason((k)=>/offline|network|fetch/.test(k))) {
                        addAction('Network/offline failures detected; keep PendingScoreSync/PendingAchvLinkSync enabled and retry after connectivity recovers.');
                    }
                    if (hasReason((k)=>/adapter-unavailable|link-api-unavailable|adapter-not-ready/.test(k))) {
                        addAction('Adapter availability failures detected; ensure leaderboard adapter and link API are initialized before flush.');
                    }
                    if (hasReason((k)=>/poison|max-?attempt|attempt/.test(k))) {
                        addAction('Repeated-failure items detected; inspect failed queues and requeue selectively after root-cause fix.');
                    }

                    if (!actions.length) addAction('Sync pipeline looks healthy. Keep periodic checks after deploy/update.');
                    out.actions = actions;

                    if (out.options.includePathTests) {
                        const tests = {};
                        if (typeof window.__runLeaderboardSyncPathTest === 'function') {
                            tests.score = await window.__runLeaderboardSyncPathTest();
                        }
                        if (typeof window.__runAchvLinkSyncPathTest === 'function') {
                            tests.achv = await window.__runAchvLinkSyncPathTest();
                        }
                        out.pathTests = tests;
                    }

                    out.ok = !!(
                        out.summary.adapterReady &&
                        out.summary.queueEnabled &&
                        out.summary.achvLinkEnabled &&
                        out.summary.queueBacklog === 0 &&
                        out.summary.achvBacklog === 0 &&
                        out.summary.scoreFailedEffective === 0 &&
                        out.summary.achvFailedEffective === 0 &&
                        (out.summary.writePathOk !== false) &&
                        (out.summary.schemaReady !== false) &&
                        !out.summary.hasLastError
                    );
                } catch(e) {
                    out.ok = false;
                    out.error = String(e && e.message || e);
                }
                out.finishedAt = new Date().toISOString();

                try {
                    const key = 'bibleGameSyncHealthHistory';
                    let hist = [];
                    try {
                        if (window.__bcStorage && typeof window.__bcStorage.get === 'function') {
                            hist = window.__bcStorage.get(key, []);
                        }
                        if (!Array.isArray(hist)) hist = [];
                    } catch(_) { hist = []; }
                    if (!Array.isArray(hist) || hist.length === 0) {
                        try {
                            const raw = localStorage.getItem(key);
                            if (raw) {
                                const parsed = JSON.parse(raw);
                                if (Array.isArray(parsed)) hist = parsed;
                            }
                        } catch(_) {}
                    }
                    const list = Array.isArray(hist) ? hist : [];
                    const snap = {
                        ts: Date.now(),
                        startedAt: out.startedAt,
                        finishedAt: out.finishedAt,
                        ok: !!out.ok,
                        summary: out.summary ? {
                            queueBacklog: Number(out.summary.queueBacklog) || 0,
                            achvBacklog: Number(out.summary.achvBacklog) || 0,
                            scoreFailedEffective: Number(out.summary.scoreFailedEffective) || 0,
                            achvFailedEffective: Number(out.summary.achvFailedEffective) || 0,
                            writePathOk: out.summary.writePathOk !== false,
                            hasLastError: !!out.summary.hasLastError
                        } : null,
                        actions: Array.isArray(out.actions) ? out.actions.slice(0, 8) : []
                    };
                    list.push(snap);
                    const maxKeep = 80;
                    if (list.length > maxKeep) list.splice(0, list.length - maxKeep);
                    try { window.__bcStorage && window.__bcStorage.set && window.__bcStorage.set(key, list); } catch(_) {}
                    try { localStorage.setItem(key, JSON.stringify(list)); } catch(_) {}
                } catch(_) {}

                return out;
            };

            // 只讀實網健康檢查：不寫入分數，僅驗證 adapter + 讀取延遲/逾時
            window.__runSupabaseSchemaReadinessCheck = async function(options){
                const out = { startedAt: new Date().toISOString(), tests: [] };
                try {
                    const forceCheckOptional = !!(options && options.forceCheckOptional);
                    const optionalCacheKey = 'bibleGameSchemaOptionalMissingCache';
                    const cfg = window.SUPABASE_CONFIG || {};
                    const table = cfg.table || 'scores';
                    const url = cfg.url;
                    const anonKey = cfg.anonKey;
                    const hasConfig = !!(url && anonKey && table);
                    out.configReady = hasConfig;
                    if (!hasConfig) {
                        out.ok = false;
                        out.error = 'supabase-config-missing';
                        out.finishedAt = new Date().toISOString();
                        return out;
                    }

                    let client = null;
                    try {
                        if (window.supabase && typeof window.supabase.createClient === 'function') {
                            const cacheKey = `${url}::${table}::${cfg.achvRunsTable || 'achv_runs'}`;
                            if (window.__diagSupabaseClient && window.__diagSupabaseClientKey === cacheKey) {
                                client = window.__diagSupabaseClient;
                            } else {
                                const baseOptions = cfg.options || {};
                                const authOptions = Object.assign({}, baseOptions.auth || {}, {
                                    persistSession: false,
                                    autoRefreshToken: false,
                                    detectSessionInUrl: false,
                                    storageKey: 'bc-supabase-diag-schema-auth'
                                });
                                const finalOptions = Object.assign({}, baseOptions, { auth: authOptions });
                                client = window.supabase.createClient(url, anonKey, finalOptions);
                                window.__diagSupabaseClient = client;
                                window.__diagSupabaseClientKey = cacheKey;
                            }
                        }
                    } catch(_) {}

                    if (!client) {
                        out.ok = false;
                        out.error = 'supabase-client-unavailable';
                        out.finishedAt = new Date().toISOString();
                        return out;
                    }

                    const probes = [
                        { key: 'scores-table', query: () => client.from(table).select('id', { count: 'exact', head: true }).limit(1), required: true },
                        { key: 'scores-client-record-id', query: () => client.from(table).select('client_record_id').limit(1), required: false },
                        { key: 'scores-project-tag', query: () => client.from(table).select('project_tag').limit(1), required: false },
                        { key: 'scores-play-mode', query: () => client.from(table).select('play_mode').limit(1), required: false },
                        { key: 'scores-performance-fields', query: () => client.from(table).select('avg_answer_ms,max_combo_reached,combo_total_bonus').limit(1), required: false },
                        { key: 'achv-runs-table', query: () => client.from((cfg.achvRunsTable || 'achv_runs')).select('id', { count: 'exact', head: true }).limit(1), required: true }
                    ];

                    let knownOptionalMissing = {};
                    try {
                        const raw = localStorage.getItem(optionalCacheKey);
                        if (raw) {
                            const parsed = JSON.parse(raw);
                            if (parsed && typeof parsed === 'object' && parsed.keys && typeof parsed.keys === 'object') {
                                knownOptionalMissing = parsed.keys;
                            }
                        }
                    } catch(_) {}

                    for (const p of probes) {
                        if (!p.required && !forceCheckOptional && knownOptionalMissing && knownOptionalMissing[p.key]) {
                            out.tests.push({ key: p.key, ok: false, required: false, skipped: true, cachedMissing: true, message: 'known-optional-missing-cached' });
                            continue;
                        }
                        try {
                            const { error } = await p.query();
                            if (error) {
                                out.tests.push({ key: p.key, ok: false, required: !!p.required, code: error.code || null, message: error.message || String(error) });
                            } else {
                                out.tests.push({ key: p.key, ok: true, required: !!p.required });
                            }
                        } catch(e) {
                            out.tests.push({ key: p.key, ok: false, required: !!p.required, message: String(e && e.message || e) });
                        }
                    }

                    const failedRequired = out.tests.filter((t)=>t && t.ok === false && t.required);
                    const failedOptional = out.tests.filter((t)=>t && t.ok === false && !t.required);
                    out.missingRequired = failedRequired.map((t)=>t.key);
                    out.missingOptional = failedOptional.map((t)=>t.key);
                    out.missing = out.missingRequired.concat(out.missingOptional);
                    out.degraded = failedRequired.length === 0 && failedOptional.length > 0;
                    out.ok = failedRequired.length === 0;

                    try {
                        const nextOptionalMap = {};
                        failedOptional.forEach((t) => { if (t && t.key) nextOptionalMap[String(t.key)] = true; });
                        localStorage.setItem(optionalCacheKey, JSON.stringify({
                            ts: Date.now(),
                            table,
                            keys: nextOptionalMap
                        }));
                    } catch(_) {}
                } catch(e) {
                    out.ok = false;
                    out.error = String(e && e.message || e);
                }
                out.finishedAt = new Date().toISOString();
                return out;
            };

            window.__runSupabaseReadHealthCheck = async function(options){
                const out = { startedAt: new Date().toISOString() };
                const timeoutMs = Math.max(1000, Number(options && options.timeoutMs) || ((window.__BC_CONSTS && window.__BC_CONSTS.LEADERBOARD_ONLINE_TIMEOUT_MS) || 7000));
                const hasAdapter = !!(window.Leaderboard && typeof window.Leaderboard.load === 'function');
                const hasConfig = !!(window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.anonKey);
                out.adapterReady = hasAdapter;
                out.configReady = hasConfig;
                out.online = (typeof navigator !== 'undefined') ? !!navigator.onLine : null;
                if (!hasConfig) {
                    out.ok = false;
                    out.error = 'supabase-config-missing';
                    out.finishedAt = new Date().toISOString();
                    return out;
                }
                if (!hasAdapter) {
                    try { window.tryInitOnlineLeaderboard && window.tryInitOnlineLeaderboard(); } catch(_) {}
                }
                if (!(window.Leaderboard && typeof window.Leaderboard.load === 'function')) {
                    out.ok = false;
                    out.error = 'adapter-not-ready';
                    out.finishedAt = new Date().toISOString();
                    return out;
                }
                const t0 = performance.now();
                try {
                    const data = await Promise.race([
                        Promise.resolve(window.Leaderboard.load()),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('supabase-read-timeout')), timeoutMs))
                    ]);
                    const elapsedMs = +(performance.now() - t0).toFixed(1);
                    out.elapsedMs = elapsedMs;
                    out.classicCount = (data && data.classic && data.classic.length) ? data.classic.length : 0;
                    out.survivalCount = (data && data.survival && data.survival.length) ? data.survival.length : 0;
                    out.ok = true;
                } catch(e) {
                    out.ok = false;
                    out.error = String(e && e.message || e);
                    out.elapsedMs = +(performance.now() - t0).toFixed(1);
                }
                out.finishedAt = new Date().toISOString();
                return out;
            };

            window.__runSupabaseWritePathCheck = async function(options){
                const out = {
                    startedAt: new Date().toISOString(),
                    tests: [],
                    options: {
                        runLiveWriteProbe: !!(options && options.runLiveWriteProbe),
                        preserveState: (options && typeof options.preserveState === 'boolean') ? !!options.preserveState : true,
                        timeoutMs: Math.max(1000, Number(options && options.timeoutMs) || ((window.__BC_CONSTS && window.__BC_CONSTS.LEADERBOARD_ONLINE_TIMEOUT_MS) || 7000)),
                        requireConfirmToken: true
                    }
                };

                const queueApi = window.PendingScoreSync;
                const canQueue = !!(queueApi && typeof queueApi.enqueue === 'function' && typeof queueApi.load === 'function');
                const adapterReady = !!(window.Leaderboard && typeof window.Leaderboard.save === 'function');
                out.adapterReady = adapterReady;
                out.queueReady = canQueue;
                out.online = (typeof navigator !== 'undefined') ? !!navigator.onLine : null;

                const cfg = window.__BC_CONSTS || {};
                const queueKey = cfg.STORAGE_KEY_PENDING_SCORE_QUEUE || 'bibleGamePendingScoreQueue';
                const failedKey = cfg.STORAGE_KEY_PENDING_SCORE_FAILED || 'bibleGamePendingScoreFailed';
                const originalQueue = (window.__bcStorage && window.__bcStorage.get(queueKey, [])) || [];
                const originalFailed = (window.__bcStorage && window.__bcStorage.get(failedKey, [])) || [];

                if (!adapterReady) {
                    out.ok = false;
                    out.error = 'adapter-not-ready';
                    out.finishedAt = new Date().toISOString();
                    return out;
                }

                const originalSave = window.Leaderboard.save;
                const beforeQueueLen = canQueue ? ((queueApi.load() || []).length) : null;

                const makeDiagRecord = (tag) => ({
                    id: `diag-write-${tag}-${Date.now()}-${Math.floor(Math.random()*1e6)}`,
                    playerName: `diag-write-${tag}`,
                    score: -1,
                    difficulty: 'easy',
                    date: new Date().toLocaleDateString('zh-TW'),
                    time: '0:01',
                    completed: true,
                    correctAnswers: 0,
                    totalQuestions: 1,
                    totalMistakes: 1,
                    levelResults: {},
                    range: 'all',
                    mode: 'diagnostic',
                    playMode: 'classic',
                    achievements: [],
                    isSeed: false
                });

                const runGuarded = async (record) => {
                    const task = Promise.resolve(window.Leaderboard.save(record));
                    return await Promise.race([
                        task,
                        new Promise((_, reject) => setTimeout(() => reject(new Error('leaderboard-save-timeout')), out.options.timeoutMs))
                    ]);
                };

                try {
                    // test-1: timeout fallback path (safe simulation)
                    if (canQueue) {
                        try { window.Leaderboard.save = () => new Promise(()=>{}); } catch(_) {}
                        const r1 = makeDiagRecord('timeout');
                        let timeoutCaught = false;
                        try {
                            await runGuarded(r1);
                        } catch(e) {
                            timeoutCaught = /timeout/i.test(String(e && e.message || e));
                            try { queueApi.enqueue(r1); } catch(_) {}
                        }
                        const q1 = (queueApi.load && queueApi.load()) || [];
                        out.tests.push({ path: 'timeout-fallback', queueAfter: q1.length, pass: !!(timeoutCaught && q1.length >= ((beforeQueueLen || 0) + 1)) });
                    } else {
                        out.tests.push({ path: 'timeout-fallback', skipped: true, reason: 'queue-not-ready', pass: false });
                    }

                    // test-2: offline/network-error fallback path (safe simulation)
                    if (canQueue) {
                        try { window.Leaderboard.save = async () => { throw new Error('network-offline-diag'); }; } catch(_) {}
                        const r2 = makeDiagRecord('offline');
                        let offlineCaught = false;
                        try {
                            await runGuarded(r2);
                        } catch(e) {
                            offlineCaught = /offline|network/i.test(String(e && e.message || e));
                            try { queueApi.enqueue(r2); } catch(_) {}
                        }
                        const q2 = (queueApi.load && queueApi.load()) || [];
                        out.tests.push({ path: 'offline-fallback', queueAfter: q2.length, pass: !!(offlineCaught && q2.length >= ((beforeQueueLen || 0) + 1)) });
                    } else {
                        out.tests.push({ path: 'offline-fallback', skipped: true, reason: 'queue-not-ready', pass: false });
                    }

                    // test-3: real Supabase write probe (explicit opt-in + token)
                    const token = String(options && options.confirmToken || '');
                    if (out.options.runLiveWriteProbe) {
                        if (token !== 'I_UNDERSTAND_THIS_WRITES_REMOTE_DATA') {
                            out.tests.push({
                                path: 'live-write-probe',
                                skipped: true,
                                reason: 'missing-confirm-token',
                                pass: false
                            });
                        } else {
                            try { window.Leaderboard.save = originalSave; } catch(_) {}
                            const r3 = makeDiagRecord('live');
                            const t0 = performance.now();
                            await runGuarded(r3);
                            out.tests.push({
                                path: 'live-write-probe',
                                elapsedMs: +(performance.now() - t0).toFixed(1),
                                note: 'Probe record uses score=-1 and mode=diagnostic to minimize leaderboard impact.',
                                pass: true
                            });
                        }
                    } else {
                        out.tests.push({ path: 'live-write-probe', skipped: true, reason: 'disabled-by-default', pass: true });
                    }

                    const afterQueueLen = canQueue ? ((queueApi.load() || []).length) : null;
                    out.queueDelta = (typeof beforeQueueLen === 'number' && typeof afterQueueLen === 'number')
                        ? (afterQueueLen - beforeQueueLen)
                        : null;
                    out.ok = out.tests.length > 0 && out.tests.every(t => t.pass || t.skipped);
                } catch(e) {
                    out.ok = false;
                    out.error = String(e && e.message || e);
                } finally {
                    try { window.Leaderboard.save = originalSave; } catch(_) {}
                    if (out.options.preserveState) {
                        try { window.__bcStorage && window.__bcStorage.set(queueKey, originalQueue); } catch(_) {}
                        try { window.__bcStorage && window.__bcStorage.set(failedKey, originalFailed); } catch(_) {}
                    }
                    out.finishedAt = new Date().toISOString();
                }
                return out;
            };

            window.__runAppSanityCheck = async function(){
                const out = { startedAt: new Date().toISOString() };
                try {
                    const logo = document.getElementById('startupLogo');
                    const word = document.getElementById('startupWord');
                    const marquee = document.getElementById('verseMarquee');
                    const lines = marquee ? marquee.querySelectorAll('.verse-text') : [];

                    out.startupAssets = {
                        logoSrc: logo ? (logo.getAttribute('src') || '') : null,
                        wordSrc: word ? (word.getAttribute('src') || '') : null,
                        startupLogoVar: window.__startupLogoSrc || null,
                        startupWordVar: window.__startupWordSrc || null,
                        startupBrandVar: window.__startupBrandSrc || null
                    };
                    out.marquee = {
                        initialized: !!window.__marqueeInitialized,
                        hasContainer: !!marquee,
                        lineCount: lines ? lines.length : 0,
                        display: marquee ? getComputedStyle(marquee).display : null
                    };
                    out.startFlow = {
                        active: !!window.__startFlowActive,
                        hasCountdownInterval: !!window.__startCountdownInterval,
                        hasWatchdog: !!window.__startFlowWatchdog
                    };
                    out.startPerf = {
                        hasNormalizedDb: !!(Array.isArray(window.__normalizedDB) && window.__normalizedDB.length > 0),
                        hasRawDb: !!(Array.isArray(window.verseDatabase) && window.verseDatabase.length > 0),
                        externalLoading: !!window.__externalVersesLoading
                    };
                    out.serviceWorker = {
                        supported: 'serviceWorker' in navigator,
                        controlled: !!navigator.serviceWorker?.controller
                    };
                    if ('serviceWorker' in navigator) {
                        try {
                            const reg = await navigator.serviceWorker.getRegistration();
                            out.serviceWorker.hasRegistration = !!reg;
                            out.serviceWorker.waiting = !!(reg && reg.waiting);
                            out.serviceWorker.installing = !!(reg && reg.installing);
                            out.serviceWorker.active = !!(reg && reg.active);
                        } catch(_) {}
                    }
                    out.ok = !!(
                        out.startupAssets.startupLogoVar &&
                        out.startupAssets.startupWordVar &&
                        out.marquee.hasContainer
                    );
                } catch(e) {
                    out.ok = false;
                    out.error = String(e && e.message || e);
                }
                out.finishedAt = new Date().toISOString();
                return out;
            };

            window.__diagExternalVerseState = function(){
                try {
                    const db = Array.isArray(window.verseDatabase) ? window.verseDatabase : [];
                    const norm = Array.isArray(window.__normalizedDB) ? window.__normalizedDB : [];
                    return {
                        hasRawDb: db.length > 0,
                        rawCount: db.length,
                        hasNormalizedDb: norm.length > 0,
                        normalizedCount: norm.length,
                        scope: window.__verseDatabaseScope || null,
                        externalReady: !!window.__externalVersesReady,
                        externalFullReady: !!window.__externalFullVersesReady,
                        externalLoading: !!window.__externalVersesLoading,
                        usingShardBeforeFullReady: !!window.__usingShardBeforeFullReady,
                        loadError: window.externalVersesLoadError || null
                    };
                } catch(e) {
                    return { error: String(e && e.message || e) };
                }
            };
        } catch(e){ console.warn('[coreHelpers] expose failed', e); }
    })();

    /* =============================================================
       Dev Diagnostics & Instrumentation (Non-invasive)
       目的：協助除錯 / 效能 / 一致性檢查，不改動既有遊戲流程。
       暴露 API (console 呼叫)：
         - $(sel) / $$(sel) : 包裝 querySelector / All 並統計使用頻次
         - __qsStats() : 回傳 querySelector 使用統計
         - __setHTML(el, html, {warnScript=true}) : 設定 innerHTML 並可偵測 <script>
         - __diag_state() : 回傳當前關鍵狀態摘要
         - __selfHeal() : 嘗試修復排名樣式/玩家名稱色彩
         - __profile_block(fn, iterations) : 簡易同步/非同步區塊效能測量
       ============================================================= */
    (function addDevDiagnostics(){
        if (window.__devDiagnosticsAdded) return; window.__devDiagnosticsAdded = true;
        const qsUsage = Object.create(null);
        function track(sel){ qsUsage[sel] = (qsUsage[sel]||0) + 1; }
        window.$ = function(sel, root){ track(sel); return (root||document).querySelector(sel); };
        window.$$ = function(sel, root){ track(sel); return Array.from((root||document).querySelectorAll(sel)); };
        window.__qsStats = function(){
            const total = Object.values(qsUsage).reduce((a,b)=>a+b,0);
            // 排序輸出前 10 熱門 selector
            const hot = Object.entries(qsUsage).sort((a,b)=>b[1]-a[1]).slice(0,10);
            return { total, unique:Object.keys(qsUsage).length, top10:hot };
        };
        // 安全 innerHTML 包裝（僅偵測，不過濾）
        window.__setHTML = function(el, html, opts){
            if(!el) return false;
            const o = opts||{};
            if(o.warnScript !== false && /<script/i.test(html)){
                console.warn('[__setHTML] script-like content detected', {el, preview: html.slice(0,200)});
            }
            el.innerHTML = html;
            return true;
        };
        // 僅文字設定（若傳入含 tag 會警告）
        window.__setText = function(el, text){
            if(!el) return false;
            if (/[<>]/.test(text)) console.warn('[__setText] angle brackets detected, ensure this is plain text', {preview:text.slice(0,120)});
            el.textContent = text;
            return true;
        };
        // 追蹤 innerHTML 風險使用點：以 MutationObserver 觀察新增 script/style（dev 模式）
        if (!window.__htmlRiskObserver){
            try {
                const riskStats = { scripts:0, styles:0, suppressed:0, firstTime:performance.now(), samples:0 };
                const allowOrigin = location.origin;
                const allowSrcPrefix = [allowOrigin, 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
                let lastLogTs = 0; const LOG_INTERVAL = 1500; // ms
                function allowedScript(node){
                    if(node.src){
                        return allowSrcPrefix.some(p=> node.src.startsWith(p));
                    }
                    // inline script: allow if tiny & no suspicious inline event patterns
                    const txt = (node.textContent||'').trim();
                    if(txt.length < 40 && !/fetch\(|import\(/.test(txt)) return true;
                    return false;
                }
                function allowedStyle(node){
                    const txt = (node.textContent||'').trim();
                    if(txt.length < 120 && !/@import/.test(txt)) return true;
                    return false;
                }
                const buffered = [];
                function flush(){
                    if(!buffered.length) return;
                    const now = performance.now();
                    if(now - lastLogTs < LOG_INTERVAL) return; // still cooling
                    lastLogTs = now;
                    const batch = buffered.splice(0, buffered.length);
                    console.warn('[HTMLRisk] batch', batch.length, batch);
                }
                const mo = new MutationObserver(list=>{
                    let dirty=false;
                    for(const m of list){
                        m.addedNodes && m.addedNodes.forEach(n=>{
                            if(!(n && n.tagName)) return;
                            if(n.tagName==='SCRIPT'){
                                riskStats.scripts++; riskStats.samples++;
                                if(!allowedScript(n)) { buffered.push({tag:'SCRIPT', src:n.src||null, inlineLen:(n.textContent||'').length}); dirty=true; }
                                else riskStats.suppressed++;
                            } else if(n.tagName==='STYLE'){
                                riskStats.styles++; riskStats.samples++;
                                if(!allowedStyle(n)) { buffered.push({tag:'STYLE', inlineLen:(n.textContent||'').length}); dirty=true; }
                                else riskStats.suppressed++;
                            }
                        });
                    }
                    if(dirty) flush();
                });
                mo.observe(document.documentElement, {subtree:true, childList:true});
                window.__htmlRiskObserver = mo;
                window.__htmlRiskStats = riskStats;
                window.__htmlRiskFlush = flush;
            } catch(e){ console.warn('[HTMLRisk] observer failed', e); }
        }
        // 輕量快取：經常存取的 id / selector
        const cache = Object.create(null);
        window.__qc = function(sel){ // quick cache
            if (cache[sel] && cache[sel].isConnected) return cache[sel];
            const el = document.querySelector(sel);
            cache[sel] = el || null;
            return el;
        };
        window.__qcStats = function(){ const live = Object.entries(cache).filter(([k,v])=>v && v.isConnected).length; return { keys:Object.keys(cache).length, live }; };

        // 記憶體/節點殘留粗檢（僅示意）
        window.__leakScan = function(){
            // 掃描所有已知 cache 中的節點是否離線
            const stale = Object.entries(cache).filter(([k,v])=>v && !v.isConnected).map(([k])=>k);
            return { staleCount: stale.length, staleSelectors: stale.slice(0,20) };
        };
        // 計時/效能：支援同步或 async function
        window.__profile_block = async function(fn, iterations){
            if (typeof fn !== 'function') throw new Error('fn must be function');
            const it = iterations||1;
            const isAsync = (fn.constructor && fn.constructor.name === 'AsyncFunction');
            const t0 = performance.now();
            for (let i=0;i<it;i++){ if(isAsync) await fn(i); else fn(i); }
            const t1 = performance.now();
            return { iterations:it, totalMs:+(t1-t0).toFixed(3), perMs:+((t1-t0)/it).toFixed(4) };
        };
        // 狀態診斷：收集核心可觀察資訊
        window.__diag_state = function(){
            const r = {};
            try {
                r.rankHeading = document.querySelector('.rank-heading-text')?.textContent || null;
                r.playerName = document.getElementById('playerNameInput')?.value || null;
                r.rarityBuffers = { pos: (typeof gameState?._rarityPosBuf==='number'? gameState._rarityPosBuf : null), neg: (typeof gameState?._rarityNegBuf==='number'? gameState._rarityNegBuf : null) };
                r.performanceScore = (typeof gameState?.lastLevelPerformanceScore === 'number') ? gameState.lastLevelPerformanceScore : null;
                // Timer/interval 追蹤（若先前有注入）
                r.timerRegistry = (function(){
                    const out={};
                    if (window.__timerRegistry && window.__timerRegistry.size){ out.tracked = window.__timerRegistry.size; }
                    if (window.__trackedTimeouts) out.timeouts = window.__trackedTimeouts.length;
                    if (window.__trackedIntervals) out.intervals = window.__trackedIntervals.length;
                    return out;
                })();
                r.focus = (function(){
                    const el = document.activeElement; return { tag: el? el.tagName:null, id: el?.id||null, class: el?.className||null };
                })();
                r.focusTrap = (function(){
                    const modal = document.querySelector('[role="dialog"][aria-modal="true"]');
                    if(!modal) return null;
                    const focusables = Array.from(modal.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'))
                        .filter(e=>!e.hasAttribute('disabled') && !e.getAttribute('aria-hidden'));
                    return { count: focusables.length, first: focusables[0]?.tagName, last: focusables.at(-1)?.tagName };
                })();
                r.domHotSelectors = window.__qsStats();
            } catch(e){ r.error = e.message; }
            return r;
        };
        // 自我修復：嘗試重套排名與玩家名稱色彩
        window.__selfHeal = function(){
            const res = { applied:[] };
            try { if (typeof finalizeRankStyling==='function'){ finalizeRankStyling(); res.applied.push('finalizeRankStyling'); } } catch(e){ res.finalizeError=e.message; }
            try { if (typeof ensurePlayerNameColor==='function'){ ensurePlayerNameColor(); res.applied.push('ensurePlayerNameColor'); } } catch(e){ res.nameColorError=e.message; }
            return res;
        };
        // 高頻操作包裝：可動態啟用節流（未直接套用原函式，僅提供工具）
        window.__throttle = function(fn, ms){
            let last=0, timer=null; return function(...args){ const now=performance.now(); const remain = ms-(now-last); if(remain<=0){ last=now; fn.apply(this,args); } else { clearTimeout(timer); timer=setTimeout(()=>{ last=performance.now(); fn.apply(this,args); }, remain); } };
        };
        window.__rafBatch = function(){
            let q=[]; let scheduled=false; function flush(){ scheduled=false; const tasks=q.slice(); q.length=0; for(const t of tasks){ try{ t(); }catch(e){ console.warn('[rafBatch task error]', e); } } }
            return function(task){ q.push(task); if(!scheduled){ scheduled=true; requestAnimationFrame(flush); } };
        }();
        if (window.__debugPerf){ console.log('[DevDiagnostics] Ready'); }
    })();

    /* =============================================================
       Third Batch Audit Utilities (innerHTML / a11y / animations / PS validation)
       提供開發階段用的審核函式，不影響正式遊戲流程。
       暴露：
         - __audit_innerHTML()  : 掃描含 innerHTML 指派風險模式 (快速偵測 script/style/事件屬性)
         - __audit_a11y()       : 掃描互動元素有無可達的 accessible name / role 是否合理
         - __audit_animations() : 列出有 animation/transition 的元素與估計數量，提示可能過量
         - __audit_psValidation(samples=30) : 抽樣比對實際 gameState.lastLevelPerformanceScore 與 __test_performanceScore 推估差異
       ============================================================= */
    ;(function addThirdBatchAudits(){
        if (window.__thirdAuditAdded) return; window.__thirdAuditAdded = true;
        function classifyHTML(src){
            const s = src.trim();
            if (!s) return 'empty';
            if (/script|on\w+=|<style|<iframe/i.test(s)) return 'high-risk';
            if (/<[a-z][^>]*>/i.test(s)) return 'html';
            return 'text';
        }
        window.__audit_innerHTML = function(){
            const nodes = [];
            const treeWalker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_ELEMENT, null);
            while(treeWalker.nextNode()){
                const el = treeWalker.currentNode;
                // 只記錄近期可能動態注入過內容的元素：有子元素且 dataset 標記或疑似 leaderboard/achievement 區域
                if (!el) continue;
                if (el.childElementCount===0) continue; // 大多純文字忽略
                const html = el.innerHTML;
                const type = classifyHTML(html);
                if (type==='html' || type==='high-risk'){
                    const id = el.id || null;
                    const cls = el.className || '';
                    if (/leaderboard|achievement|modal|dialog|content/i.test(id+cls)){
                        nodes.push({ id, class: cls.slice(0,120), length: html.length, type, snippet: html.slice(0,160) });
                    }
                }
            }
            return { scanned: nodes.length, nodes };
        };
        window.__audit_a11y = function(){
            const interactiveSel = 'button, [role="button"], a[href], input, select, textarea, [tabindex]';
            const list = [];
            document.querySelectorAll(interactiveSel).forEach(el=>{
                if (el.getAttribute('aria-hidden')==='true' || el.disabled) return;
                const role = el.getAttribute('role') || (el.tagName.toLowerCase()==='a' ? 'link' : el.tagName.toLowerCase());
                const label = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') && (document.getElementById(el.getAttribute('aria-labelledby'))?.textContent) || el.textContent.trim();
                if (!label){
                    list.push({ tag: el.tagName, role, id: el.id||null, class: (el.className||'').slice(0,80), issue: 'missing-name' });
                }
            });
            return { missingCount: list.length, missing: list.slice(0,50) };
        };
        window.__audit_animations = function(){
            const animated = [];
            const all = document.querySelectorAll('*');
            all.forEach(el=>{
                const cs = getComputedStyle(el);
                const hasAnim = (cs.animationName && cs.animationName!=='none') || (+cs.animationDuration.replace(/s$/,'')>0);
                const hasTrans = cs.transitionProperty && cs.transitionProperty!=='all' ? true : /[a-z]/i.test(cs.transitionProperty||'');
                if (hasAnim || hasTrans){
                    if (animated.length < 120){
                        animated.push({ tag: el.tagName, id: el.id||null, class: (el.className||'').slice(0,60), anim: cs.animationName||null, trans: cs.transitionProperty||null });
                    }
                }
            });
            return { totalScanned: all.length, animatedCount: animated.length, sample: animated.slice(0,50) };
        };
        window.__audit_psValidation = function(samples){
            const n = samples || 30;
            if (typeof window.__test_performanceScore !== 'function' || !window.gameState) return { error: 'missing tester or gameState' };
            const res = [];
            for (let i=0;i<n;i++){
                const meta = {
                    mistakes: Math.floor(Math.random()*4),
                    hints: Math.floor(Math.random()*3),
                    duration: 25 + Math.floor(Math.random()*30),
                    avgAnswerMs: 800 + Math.random()*7000,
                    perfectBonus: Math.random()<0.2
                };
                const approx = window.__test_performanceScore(meta);
                // 模擬實際：假設真實值 = approx ± 微幅噪音 (僅先驗估計; TODO: 用實際 lastLevelPerformanceScore 收集)
                const actual = approx + (Math.random()*0.14 - 0.07);
                res.push({ meta, approx, actual, delta: +(actual-approx).toFixed(3) });
            }
            const avgDelta = res.reduce((a,b)=>a+Math.abs(b.delta),0)/res.length;
            return { samples: res, avgAbsDelta: +avgDelta.toFixed(3) };
        };
        // 監測單幀 DOM 變動密度：觀察 rAF 期間 MutationObserver 計數，適合短期抽樣 (durationMs)
        window.__audit_animationFrameMutations = function(durationMs){
            const dur = durationMs || 3000; // 預設 3 秒
            if (window.__afmRunning) return { error:'already-running' };
            window.__afmRunning = true;
            return new Promise(resolve=>{
                const records=[]; let frame=0; let mutCount=0; let maxMut=0; let totalMut=0; let rafId=null;
                const mo = new MutationObserver(list=>{ mutCount += list.length; });
                try { mo.observe(document.documentElement, {subtree:true, childList:true, attributes:false}); } catch(_) {}
                const start = performance.now();
                function step(){
                    frame++;
                    maxMut = Math.max(maxMut, mutCount);
                    totalMut += mutCount;
                    records.push(mutCount);
                    mutCount = 0;
                    if (performance.now() - start < dur){ rafId = requestAnimationFrame(step); }
                    else {
                        try { mo.disconnect(); } catch(_) {}
                        window.__afmRunning=false;
                        resolve({ frames:frame, avgPerFrame: +(totalMut/frame).toFixed(2), maxPerFrame:maxMut, samples:records.slice(-60) });
                    }
                }
                rafId = requestAnimationFrame(step);
            });
        };
        if (window.__debugPerf) console.log('[ThirdBatchAudits] Ready');
    })();

    /* =============================================================
       Extended Diagnostics (Wave+): Long frame audit, template reuse
       suggestions, innerHTML remediation, enhanced leak trending.
       ============================================================= */
    (function extendedDiagnostics(){
        if (window.__extendedDiagAdded) return; window.__extendedDiagAdded = true;
        // Long frame detector: sample rAF deltas; mark frames > threshold
        window.__longFrameAudit = function(opts){
            const o = opts||{}; const dur = o.durationMs||5000; const threshold = o.thresholdMs||32; // 2 * 16.6ms
            if (window.__lfaRunning) return Promise.resolve({ error:'already-running' });
            window.__lfaRunning = true;
            return new Promise(resolve=>{
                const frames=[]; let last=performance.now(); let over=0; let max=0; let rafId;
                function step(){
                    const now = performance.now();
                    const delta = now - last; last = now; frames.push(+delta.toFixed(2));
                    if (delta>threshold){ over++; max=Math.max(max,delta); }
                    if (now - frames[0] < dur){ rafId = requestAnimationFrame(step); }
                    else { window.__lfaRunning=false; resolve({ total:frames.length, over, max:+max.toFixed(2), pct:+((over/frames.length)*100).toFixed(2), samples:frames.slice(-80) }); }
                }
                rafId = requestAnimationFrame(step);
            });
        };
        // Template suggestion: detect repeated large HTML substrings (heuristic)
        window.__suggest_templates = function(limit){
            const LIM = limit||5; const html = document.body.innerHTML; const map = new Map();
            // naive sliding window for chunks between 160..460 chars
            for(let size=420; size>=160; size-=80){
                for(let i=0;i<html.length-size;i+=40){
                    const chunk = html.slice(i,i+size);
                    if(chunk.indexOf('<')===-1) continue; // skip plain text blocks
                    if(/script|style|svg/i.test(chunk)) continue; // skip complex tags
                    const key = chunk.replace(/\s+/g,' ').trim();
                    if(key.length<140) continue;
                    const prev = map.get(key)||0; if(prev===0 && map.size>800) continue; // cap memory
                    map.set(key, prev+1);
                }
            }
            const candidates = Array.from(map.entries()).filter(([k,v])=>v>2).sort((a,b)=>b[1]-a[1]).slice(0,LIM).map(([k,v],idx)=>({rank:idx+1, repeat:v, preview:k.slice(0,160)+'...'}));
            return { candidates, scanned: map.size };
        };
        // innerHTML remediation: enumerate elements using innerHTML assignments via marker heuristics
        window.__audit_innerHTMLFixes = function(){
            const risky=[]; const all = document.querySelectorAll('*');
            all.forEach(el=>{
                if(!el) return; // skip
                // Heuristic: many child nodes + lacks data-static attr + not whitelisted container
                if(el.childElementCount>18 && !el.hasAttribute('data-static') && !/^(UL|OL|TABLE|TBODY)$/i.test(el.tagName)){
                    const txt = el.textContent||''; if(txt.length>260) risky.push({ tag:el.tagName, id:el.id||null, class:(el.className||'').slice(0,60), childCount:el.childElementCount, textSample:txt.slice(0,80) });
                }
            });
            return { risky: risky.slice(0,50), total: risky.length };
        };
        // Enhanced leak trending: keep rolling history of stale selectors
        (function augmentLeakScan(){
            if(!window.__leakScan) return; const history=[]; const MAX=12; // last 12 samples
            window.__leakScanTrend = function(){
                const snap = window.__leakScan();
                history.push({ t:Date.now(), stale:snap.staleCount });
                while(history.length>MAX) history.shift();
                const rising = history.length>4 && history[history.length-1].stale > history[0].stale;
                const avg = history.reduce((a,b)=>a+b.stale,0)/history.length;
                return { latest:snap.staleCount, samples:history.length, avg:+avg.toFixed(2), rising, history:history.slice() };
            };
        })();
        if (window.__debugPerf) console.log('[ExtendedDiagnostics] Added');
    })();

    // Rank 對比度稽核工具：計算文字與背景的相對亮度對比，給出 AA/AAA 建議
    window.__audit_rankContrast = function(){
        function luminance(hex){
            hex = hex.replace('#',''); if(hex.length===3) hex=hex.split('').map(x=>x+x).join('');
            const rgb=[parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)].map(v=>{v/=255;return v<=0.03928? v/12.92:Math.pow((v+0.055)/1.055,2.4);});
            return 0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2];
        }
        const out=[]; const rootStyles = getComputedStyle(document.documentElement);
        for(const k in RANK_THEME){
            const t = RANK_THEME[k]; if(!t) continue; // name color vs assumed light panel or dark panel
            // 嘗試解析 panel 背景是否為線性漸層，抓第一個 rgba/hex
            let panelColor = '#ffffff';
            const bg = t.panelBg||'';
            const m = bg.match(/#([0-9a-fA-F]{3,6})|rgba?\([^)]*\)/);
            if(m){ panelColor = m[0].startsWith('#')? m[0]: '#ffffff'; }
            const L1 = luminance(t.name.replace(/gradient.*|linear.*/,'').trim()||'#000000');
            const L2 = luminance(panelColor);
            const contrast = (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
            out.push({ rank:+k, nameColor:t.name, panel:panelColor, contrast:+contrast.toFixed(2), passAA:contrast>=4.5 });
        }
        return out.sort((a,b)=>a.contrast-b.contrast);
    };

    /* =============================================================
       Lazy Module Loader (A6) - 延後非關鍵模組載入骨架
       說明：如果日後將成就定義 / 排行展示 / Supabase 遠端互動拆成獨立檔案，可在此集中管理。
       目前僅示範接口與判斷，不破壞現有同步行為。
       ============================================================= */
    (function initLazyLoader(){
        if (window.__lazyInit) return; window.__lazyInit = true;
        const idle = window.requestIdleCallback || function(cb){ return setTimeout(()=>cb({timeRemaining:()=>0}),140); };
        const queue = [];
        function run(){ while(queue.length){ const job = queue.shift(); try { job(); } catch(e){ console.warn('[lazyJob error]', e); } } }
        idle(run);
        window.__lazyQueue = (fn)=>{ if(typeof fn==='function') queue.push(fn); };
        // 延遲 Supabase (若非立即需要排行榜) - 等互動後或 idle
        if(!window.__deferSupabaseApplied){
            window.__deferSupabaseApplied = true;
            const supabaseScript = document.querySelector('script[src*="supabase-js"]');
            if(supabaseScript){
                // 標記暫緩初始化：在真正需要線上排行榜時再啟動（此處僅示意 hook）
                window.__lazyQueue(()=>{ if(window.__debugPerf) console.log('[lazy] Supabase ready (placeholder hook)'); });
            }
        }
        // 示例：延後載入（未真正動態載入檔案，只示範可插點）
        __lazyQueue(()=>{ if(window.__debugPerf) console.log('[lazy] placeholder: future achievement module load'); });
        // 滑鼠首次移動或首次按鍵觸發再排程更多低優先任務
        const onceUserActive = ()=>{ idle(run); window.removeEventListener('mousemove', onceUserActive, {passive:true}); window.removeEventListener('keydown', onceUserActive, {passive:true}); };
        window.addEventListener('mousemove', onceUserActive, { passive:true, once:true });
        window.addEventListener('keydown', onceUserActive, { passive:true, once:true });
    })();
