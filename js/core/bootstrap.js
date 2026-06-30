// Centralized constants & lightweight utilities (Batch A)
(function(){
    if (window.__BC_CONSTS) return; // idempotent
    const C = {
        VERSION: '1.0.0-refactor-a1',
        LEADERBOARD_LIMIT: 20,
        LEADERBOARD_PREVIEW_LIMIT: 5,
        LEADERBOARD_CACHE_TTL_MS: 5 * 60 * 1000, // 5 分鐘
        LEADERBOARD_ONLINE_TIMEOUT_MS: 7000,
        PENDING_SCORE_QUEUE_MAX: 50,
        PENDING_ACHV_LINK_QUEUE_MAX: 80,
        STORAGE_KEY_LEADERBOARD: 'bibleGameLeaderboard',
        STORAGE_KEY_PENDING_SCORE_QUEUE: 'bibleGamePendingScoreQueue',
        STORAGE_KEY_PENDING_SCORE_SYNCED: 'bibleGamePendingScoreSynced',
        STORAGE_KEY_PENDING_SCORE_FAILED: 'bibleGamePendingScoreFailed',
        STORAGE_KEY_PENDING_ACHV_LINK_QUEUE: 'bibleGamePendingAchvLinkQueue',
        STORAGE_KEY_PENDING_ACHV_LINK_SYNCED: 'bibleGamePendingAchvLinkSynced',
        STORAGE_KEY_PENDING_ACHV_LINK_FAILED: 'bibleGamePendingAchvLinkFailed',
        STORAGE_KEY_PLAYER_NAME: 'bibleGamePlayerName',
        STORAGE_KEY_SETTINGS: 'bibleGameSettings'
    };
    function safeParse(str, fallback){
        try { return JSON.parse(str); } catch(_) { return fallback; }
    }
    const storage = {
        get(k, def){ try { return safeParse(localStorage.getItem(k), def); } catch(_) { return def; } },
        set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch(_) { return false; } },
        getRaw(k){ try { return localStorage.getItem(k); } catch(_) { return null; } },
        setRaw(k,v){ try { localStorage.setItem(k,v); return true; } catch(_) { return false; } },
        remove(k){ try { localStorage.removeItem(k); return true; } catch(_) { return false; } }
    };
    const logger = (function(){
        const base = '[BC]';
        function ts(){ return new Date().toISOString().replace('T',' ').replace('Z',''); }
        function fmt(args){ return [base, ts(), ...args]; }
        return {
            info: (...a)=>{ try { console.log(...fmt(a)); } catch(_) {} },
            warn: (...a)=>{ try { console.warn(...fmt(a)); } catch(_) {} },
            error: (...a)=>{ try { console.error(...fmt(a)); } catch(_) {} },
            debug: (...a)=>{ if (location && location.hash && location.hash.includes('debug')) { try { console.debug(...fmt(a)); } catch(_) {} } }
        };
    })();
    function normalizeLeaderboard(data){
        try {
            if (!data || typeof data !== 'object') return { classic: [], survival: [] };
            const limit = C.LEADERBOARD_LIMIT;
            const out = { classic: Array.isArray(data.classic)? data.classic.slice(): [], survival: Array.isArray(data.survival)? data.survival.slice(): [] };
            ['classic','survival'].forEach(k => {
                const seenIds = new Set();
                out[k] = out[k].filter((record) => {
                    if (!record || typeof record !== 'object') return false;
                    if (record.id == null) return true;
                    const key = String(record.id);
                    if (seenIds.has(key)) return false;
                    seenIds.add(key);
                    return true;
                });
                out[k].sort((a,b)=> (b.score||0) - (a.score||0));
                if (out[k].length > limit) out[k] = out[k].slice(0, limit);
            });
            return out;
        } catch(e) { logger.warn('normalizeLeaderboard failed', e); return { classic: [], survival: [] }; }
    }
    window.__BC_CONSTS = C;
    window.__bcStorage = storage;
    window.__bcLog = logger;
    window.__normalizeLeaderboard = normalizeLeaderboard;

    (function initStartupAssetsEarly(){
        try {
            if (window.__startupLogoSrc && window.__startupWordSrc && window.__startupBrandSrc) return;
            const pick = Math.ceil(Math.random() * 4); // 1..4
            window.__startupPick = pick;
            const isDark = (pick === 1 || pick === 2);
            window.__startupIsDark = isDark;

            const logo = isDark
                ? (pick === 1 ? 'logo/logo1-light.webp' : 'logo/logo2-light.webp')
                : (pick === 3 ? 'logo/logo1-dark.webp'  : 'logo/logo2-dark.webp');
            const word = isDark
                ? (pick === 1 ? 'logo/word1-light.webp' : 'logo/word2-light.webp')
                : (pick === 3 ? 'logo/word1-dark.webp'  : 'logo/word2-dark.webp');
            const brand = isDark ? 'logo/logo0-light.webp' : 'logo/logo0-dark.webp';

            window.__startupLogoSrc = logo;
            window.__startupWordSrc = word;
            window.__startupBrandSrc = brand;

            try {
                const preloads = [logo, word, brand];
                preloads.forEach((href) => {
                    if (!href || !document || !document.head) return;
                    const exists = document.querySelector(`link[rel="preload"][as="image"][href="${href}"]`);
                    if (exists) return;
                    const link = document.createElement('link');
                    link.rel = 'preload';
                    link.as = 'image';
                    link.href = href;
                    document.head.appendChild(link);
                });
            } catch(_) {}
            
            // 實際套用到 index.html 中的佔位圖片
            const applyVariables = () => {
                try {
                    const l = document.getElementById('startupLogo');
                    if (l) l.src = window.__startupLogoSrc;
                    const w = document.getElementById('startupWord');
                    if (w) w.src = window.__startupWordSrc;
                    const b = document.getElementById('startupBrand');
                    if (b) b.src = window.__startupBrandSrc;
                    const v = document.getElementById('startupVersion');
                    if (v) v.textContent = 'v' + C.VERSION;

                    // 根據深色/淺色主題調整片頭底色與文字顏色
                    const overlay = document.getElementById('startupOverlay');
                    const loadingText = document.getElementById('startupLoadingText');
                    
                    if (overlay) {
                        overlay.classList.remove('theme-light', 'theme-dark');
                        if (window.__startupIsDark) {
                            overlay.classList.add('theme-dark');
                            if (loadingText) loadingText.style.color = 'rgba(255,255,255,0.95)';
                            if (v) {
                                v.classList.remove('text-slate-800');
                                v.classList.add('text-white/90');
                            }
                        } else {
                            overlay.classList.add('theme-light');
                            if (loadingText) {
                                loadingText.style.color = 'rgba(30,30,30,0.95)';
                                loadingText.style.textShadow = '0 0 14px rgba(255,255,255,0.6)';
                            }
                            if (v) {
                                v.classList.remove('text-white/90');
                                v.classList.add('text-slate-800');
                            }
                        }
                    }
                } catch(_) {}
            };
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', applyVariables);
            } else {
                applyVariables();
            }

        } catch(_) {}
    })();

    window.getSavedPlayerName = function(){
        try { const key = C.STORAGE_KEY_PLAYER_NAME; const v = window.__bcStorage.getRaw(key); return v || ''; } catch(_) { return ''; }
    };
    window.setSavedPlayerName = function(name){
        try { const key = C.STORAGE_KEY_PLAYER_NAME; if (name==null) name=''; localStorage.setItem(key, name); return true; } catch(_) { return false; }
    };
    window.loadSettings = function(){
        try { return window.__bcStorage.get(C.STORAGE_KEY_SETTINGS, {}) || {}; } catch(_) { return {}; }
    };
    window.saveSettings = function(part){
        try { const cur = window.loadSettings(); const next = Object.assign({}, cur, part||{}); window.__bcStorage.set(C.STORAGE_KEY_SETTINGS, next); return true; } catch(_) { return false; }
    };
    (function purgeLegacySeedRecordsOnce(){
        try {
            const flagKey = 'bc.seedCleanup.v1';
            if (localStorage.getItem(flagKey)) return;
            const key = C.STORAGE_KEY_LEADERBOARD;
            const raw = window.__bcStorage.get(key, null);
            if (raw && (raw.classic || raw.survival)) {
                const cleaned = { classic: Array.isArray(raw.classic) ? raw.classic.filter(r => !(r && typeof r.id === 'string' && r.id.startsWith('seed-'))) : [],
                                  survival: Array.isArray(raw.survival) ? raw.survival.filter(r => !(r && typeof r.id === 'string' && r.id.startsWith('seed-'))) : [] };
                window.__bcStorage.set(key, cleaned);
            }
            localStorage.setItem(flagKey, '1');
        } catch(_) {}
    })();
    (function migrateOldSettings(){
        try {
            const legacyKey = 'bibleChallenge.prefs';
            const newKey = C.STORAGE_KEY_SETTINGS;
            const existingNew = window.__bcStorage.get(newKey, null);
            if (!existingNew) {
                const raw = localStorage.getItem(legacyKey);
                if (raw) {
                    const parsed = safeParse(raw, {});
                    if (parsed && typeof parsed === 'object') {
                        window.__bcStorage.set(newKey, parsed);
                        try { localStorage.removeItem(legacyKey); } catch(_) {}
                    }
                }
            }
        } catch(_) {}
    })();
    (function gateConsoleNoise(){
        try {
            const debugEnabled = !!(window.__BC_DEBUG_LOGS || (location && location.hash && location.hash.includes('debug')));
            window.__BC_DEBUG_ENABLED = debugEnabled;
            if (debugEnabled) return;
            const noisyPrefixes = [
                '[ACHV', '[EQUIP', '[GAME', '[REPLAY', '[LEADERBOARD', '[SelfTest', '[StressTest', '[DevDiagnostics',
                '[ThirdBatchAudits', '[ExtendedDiagnostics', '[lazy', '[icons', '[rebalance', '[DEBUG'
            ];
            const matchPrefix = (args) => {
                if (!args || !args.length) return false;
                const first = args[0];
                return typeof first === 'string' && noisyPrefixes.some(prefix => first.startsWith(prefix));
            };
            const originalLog = console.log ? console.log.bind(console) : null;
            if (originalLog) {
                console.log = function(...args){ if (matchPrefix(args)) return; originalLog(...args); };
            }
            const originalWarn = console.warn ? console.warn.bind(console) : null;
            if (originalWarn) {
                console.warn = function(...args){ if (matchPrefix(args)) return; originalWarn(...args); };
            }
        } catch(_) { }
    })();
    window.LeaderboardLocal = {
        load(){
            try {
                const raw = window.__bcStorage.get(C.STORAGE_KEY_LEADERBOARD, { classic:[], survival:[] });
                return window.__normalizeLeaderboard ? window.__normalizeLeaderboard(raw) : raw;
            } catch(e){ window.__bcLog && window.__bcLog.warn('LeaderboardLocal.load failed', e); return { classic:[], survival:[] }; }
        },
        save(record, mode){
            try {
                const data = this.load();
                const bucket = mode || record.playMode || 'classic';
                if (!data[bucket]) data[bucket] = [];
                data[bucket].push(record);
                const norm = window.__normalizeLeaderboard ? window.__normalizeLeaderboard(data) : data;
                window.__bcStorage.set(C.STORAGE_KEY_LEADERBOARD, norm);
                return norm;
            } catch(e){ window.__bcLog && window.__bcLog.warn('LeaderboardLocal.save failed', e); return null; }
        }
    };

    window.PendingScoreSync = (function(){
        let flushing = false;
        let retryTimer = null;
        let retryDelayMs = 5000;
        let nextRetryAt = 0;
        let lastFlushError = null;
        let lastFlushAt = 0;
        let totalFlushed = 0;
        let totalFailed = 0;

        const MAX_ATTEMPTS = 3;
        const MAX_QUEUE_AGE_MS = 72 * 60 * 60 * 1000;
        const FAILED_QUEUE_MAX = 120;

        function makeRecordKey(record){
            try {
                if (!record || typeof record !== 'object') return '';
                if (record.id != null) return `id:${String(record.id)}`;
                const parts = [
                    String(record.playerName || ''),
                    String(record.playMode || ''),
                    String(record.score || 0),
                    String(record.time || record.elapsed || ''),
                    String(record.date || ''),
                    String(record.difficulty || '')
                ];
                return `fp:${parts.join('|')}`;
            } catch(_) { return ''; }
        }

        function loadSyncedMap(){
            try {
                const raw = window.__bcStorage.get(C.STORAGE_KEY_PENDING_SCORE_SYNCED, {});
                return (raw && typeof raw === 'object') ? raw : {};
            } catch(_) { return {}; }
        }
        function saveSyncedMap(map){
            try {
                const now = Date.now();
                const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
                const entries = Object.entries(map || {})
                    .filter(([, ts]) => Number(ts) > 0 && (now - Number(ts)) < maxAgeMs)
                    .sort((a,b) => Number(b[1]) - Number(a[1]))
                    .slice(0, 500);
                const next = {};
                entries.forEach(([k, ts]) => { next[k] = Number(ts); });
                window.__bcStorage.set(C.STORAGE_KEY_PENDING_SCORE_SYNCED, next);
                return next;
            } catch(_) { return map || {}; }
        }
        function markSynced(recordOrKey, remoteId){
            try {
                const key = (typeof recordOrKey === 'string') ? recordOrKey : makeRecordKey(recordOrKey);
                if (!key) return false;
                const map = loadSyncedMap();
                const now = Date.now();
                map[key] = now;
                if (remoteId != null && remoteId !== '') map[`remote:${String(remoteId)}`] = now;
                saveSyncedMap(map);
                return true;
            } catch(_) { return false; }
        }
        function isSynced(recordOrKey){
            try {
                const key = (typeof recordOrKey === 'string') ? recordOrKey : makeRecordKey(recordOrKey);
                if (!key) return false;
                const map = loadSyncedMap();
                const ts = Number(map[key] || 0);
                if (!ts) return false;
                return (Date.now() - ts) < (7 * 24 * 60 * 60 * 1000);
            } catch(_) { return false; }
        }

        function clearRetry(){
            try { if (retryTimer) clearTimeout(retryTimer); } catch(_) {}
            retryTimer = null;
            nextRetryAt = 0;
        }
        function scheduleRetry(){
            if (retryTimer) return;
            nextRetryAt = Date.now() + retryDelayMs;
            retryTimer = setTimeout(async () => {
                retryTimer = null;
                nextRetryAt = 0;
                try {
                    const res = await flush({ limit: 20 });
                    if (res && typeof res.remaining === 'number' && res.remaining > 0) {
                        retryDelayMs = Math.min(60000, Math.max(5000, retryDelayMs * 2));
                        scheduleRetry();
                    } else {
                        retryDelayMs = 5000;
                    }
                } catch(_) {
                    retryDelayMs = Math.min(60000, Math.max(5000, retryDelayMs * 2));
                    scheduleRetry();
                }
            }, retryDelayMs);
        }

        function loadQueue(){
            try {
                const raw = window.__bcStorage.get(C.STORAGE_KEY_PENDING_SCORE_QUEUE, []);
                return Array.isArray(raw) ? raw : [];
            } catch(_) { return []; }
        }
        function loadFailedQueue(){
            try {
                const raw = window.__bcStorage.get(C.STORAGE_KEY_PENDING_SCORE_FAILED, []);
                return Array.isArray(raw) ? raw : [];
            } catch(_) { return []; }
        }
        function saveFailedQueue(queue){
            try {
                const next = Array.isArray(queue) ? queue.slice(-FAILED_QUEUE_MAX) : [];
                window.__bcStorage.set(C.STORAGE_KEY_PENDING_SCORE_FAILED, next);
            } catch(_) {}
        }
        function moveToFailed(record, reason){
            try {
                const failed = loadFailedQueue();
                failed.push({
                    record,
                    reason: String(reason || 'unknown'),
                    failedAt: Date.now()
                });
                saveFailedQueue(failed);
            } catch(_) {}
        }
        function getMeta(record){
            try {
                if (!record || typeof record !== 'object') return null;
                if (!record.__syncMeta || typeof record.__syncMeta !== 'object') {
                    record.__syncMeta = {
                        queuedAt: Date.now(),
                        attempts: 0,
                        lastError: null,
                        lastAttemptAt: 0
                    };
                }
                return record.__syncMeta;
            } catch(_) { return null; }
        }
        function pruneQueue(queue){
            try {
                const now = Date.now();
                const out = [];
                for (const item of (Array.isArray(queue) ? queue : [])) {
                    if (!item || typeof item !== 'object') continue;
                    const meta = getMeta(item);
                    const queuedAt = Number(meta && meta.queuedAt || item.ts || 0) || now;
                    if ((now - queuedAt) > MAX_QUEUE_AGE_MS) {
                        moveToFailed(item, 'stale-queue-item');
                        continue;
                    }
                    const recKey = makeRecordKey(item);
                    if (recKey && isSynced(recKey)) continue;
                    out.push(item);
                }
                return out;
            } catch(_) { return Array.isArray(queue) ? queue : []; }
        }
        function saveQueue(queue){
            try {
                const max = C.PENDING_SCORE_QUEUE_MAX || 50;
                const cleaned = pruneQueue(Array.isArray(queue) ? queue : []);
                const next = cleaned.slice(-max);
                window.__bcStorage.set(C.STORAGE_KEY_PENDING_SCORE_QUEUE, next);
            } catch(_) {}
        }
        function enqueue(record){
            try {
                if (!record || typeof record !== 'object') return false;
                const recKey = makeRecordKey(record);
                if (recKey && isSynced(recKey)) return true;
                const queue = pruneQueue(loadQueue());
                getMeta(record);
                const duplicate = queue.some(item => {
                    const k = makeRecordKey(item);
                    return !!(k && recKey && k === recKey);
                });
                if (!duplicate) queue.push(record);
                saveQueue(queue);
                try {
                    if (navigator.onLine && window.Leaderboard && typeof window.Leaderboard.save === 'function') {
                        setTimeout(() => { try { flush({ limit: 5 }); } catch(_) {} }, 600);
                    } else {
                        scheduleRetry();
                    }
                } catch(_) { scheduleRetry(); }
                return true;
            } catch(_) { return false; }
        }
        async function flush(options = {}){
            if (flushing) return { flushed: 0, remaining: loadQueue().length, skipped: true };
            flushing = true;
            lastFlushAt = Date.now();
            try {
                if (!window.Leaderboard || typeof window.Leaderboard.save !== 'function') {
                    return { flushed: 0, remaining: loadQueue().length, reason: 'adapter-unavailable' };
                }
                let queue = pruneQueue(loadQueue());
                if (!queue.length) return { flushed: 0, remaining: 0 };
                const timeoutMs = (window.__BC_CONSTS && window.__BC_CONSTS.LEADERBOARD_ONLINE_TIMEOUT_MS) || 7000;
                const limit = Math.max(1, Number(options.limit) || 10);
                let flushed = 0;
                let processed = 0;
                let failed = false;
                while (queue.length && processed < limit) {
                    const record = queue[0];
                    if (!record || typeof record !== 'object') {
                        queue.shift();
                        processed++;
                        continue;
                    }
                    const meta = getMeta(record);
                    try {
                        await Promise.race([
                            window.Leaderboard.save(record),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('pending-flush-timeout')), timeoutMs))
                        ]);
                        markSynced(record);
                        queue.shift();
                        flushed++;
                        totalFlushed++;
                        processed++;
                    } catch(_) {
                        failed = true;
                        try {
                            if (meta) {
                                meta.attempts = Math.max(0, Number(meta.attempts || 0)) + 1;
                                meta.lastAttemptAt = Date.now();
                                meta.lastError = 'flush-item-failed';
                                if (meta.attempts >= MAX_ATTEMPTS) {
                                    moveToFailed(record, 'max-attempts-exceeded');
                                    queue.shift();
                                    processed++;
                                    totalFailed++;
                                    continue;
                                }
                            }
                        } catch(_) {}
                        break;
                    }
                }
                saveQueue(queue);
                if (flushed > 0 && queue.length === 0) {
                    retryDelayMs = 5000;
                    clearRetry();
                }
                if (failed && queue.length > 0) scheduleRetry();
                lastFlushError = failed ? 'flush-item-failed' : null;
                return { flushed, remaining: queue.length };
            } catch(e) {
                lastFlushError = String(e && e.message || e);
                throw e;
            } finally {
                flushing = false;
            }
        }
        function getState(){
            try {
                const queue = loadQueue();
                const synced = loadSyncedMap();
                return {
                    flushing,
                    queueLength: Array.isArray(queue) ? queue.length : 0,
                    failedQueueLength: loadFailedQueue().length,
                    retryDelayMs,
                    nextRetryAt,
                    syncedKeyCount: Object.keys(synced || {}).length,
                    lastFlushAt,
                    lastFlushError,
                    totalFlushed,
                    totalFailed
                };
            } catch(_) {
                return { flushing, queueLength: 0, failedQueueLength: 0, retryDelayMs, nextRetryAt, syncedKeyCount: 0, lastFlushAt, lastFlushError, totalFlushed, totalFailed };
            }
        }
        return { load: loadQueue, enqueue, flush, markSynced, isSynced, getState };
    })();

    window.PendingAchvLinkSync = (function(){
        let flushing = false;
        let retryTimer = null;
        let retryDelayMs = 5000;
        let nextRetryAt = 0;
        let lastFlushAt = 0;
        let lastFlushError = null;
        let totalFlushed = 0;
        let totalFailed = 0;

        const MAX_ATTEMPTS = 4;
        const MAX_QUEUE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
        const FAILED_QUEUE_MAX = 180;

        function makeLinkKey(item){
            try {
                if (!item || !item.scoreId) return '';
                return `${String(item.scoreId)}::${String(item.runId || '')}`;
            } catch(_) { return ''; }
        }
        function loadLinkedMap(){
            try {
                const raw = window.__bcStorage.get(C.STORAGE_KEY_PENDING_ACHV_LINK_SYNCED, {});
                return (raw && typeof raw === 'object') ? raw : {};
            } catch(_) { return {}; }
        }
        function saveLinkedMap(map){
            try {
                const now = Date.now();
                const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
                const entries = Object.entries(map || {})
                    .filter(([, ts]) => Number(ts) > 0 && (now - Number(ts)) < maxAgeMs)
                    .sort((a,b) => Number(b[1]) - Number(a[1]))
                    .slice(0, 600);
                const next = {};
                entries.forEach(([k, ts]) => { next[k] = Number(ts); });
                window.__bcStorage.set(C.STORAGE_KEY_PENDING_ACHV_LINK_SYNCED, next);
                return next;
            } catch(_) { return map || {}; }
        }
        function markLinked(itemOrKey){
            try {
                const key = (typeof itemOrKey === 'string') ? itemOrKey : makeLinkKey(itemOrKey);
                if (!key) return false;
                const map = loadLinkedMap();
                map[key] = Date.now();
                saveLinkedMap(map);
                return true;
            } catch(_) { return false; }
        }
        function isLinked(itemOrKey){
            try {
                const key = (typeof itemOrKey === 'string') ? itemOrKey : makeLinkKey(itemOrKey);
                if (!key) return false;
                const map = loadLinkedMap();
                const ts = Number(map[key] || 0);
                if (!ts) return false;
                return (Date.now() - ts) < (7 * 24 * 60 * 60 * 1000);
            } catch(_) { return false; }
        }

        function loadQueue(){
            try {
                const raw = window.__bcStorage.get(C.STORAGE_KEY_PENDING_ACHV_LINK_QUEUE, []);
                return Array.isArray(raw) ? raw : [];
            } catch(_) { return []; }
        }
        function loadFailedQueue(){
            try {
                const raw = window.__bcStorage.get(C.STORAGE_KEY_PENDING_ACHV_LINK_FAILED, []);
                return Array.isArray(raw) ? raw : [];
            } catch(_) { return []; }
        }
        function saveFailedQueue(queue){
            try {
                const next = Array.isArray(queue) ? queue.slice(-FAILED_QUEUE_MAX) : [];
                window.__bcStorage.set(C.STORAGE_KEY_PENDING_ACHV_LINK_FAILED, next);
            } catch(_) {}
        }
        function moveToFailed(item, reason){
            try {
                const failed = loadFailedQueue();
                failed.push({
                    item,
                    reason: String(reason || 'unknown'),
                    failedAt: Date.now()
                });
                saveFailedQueue(failed);
            } catch(_) {}
        }
        function getMeta(item){
            try {
                if (!item || typeof item !== 'object') return null;
                if (!item.__syncMeta || typeof item.__syncMeta !== 'object') {
                    item.__syncMeta = {
                        queuedAt: Number(item.ts || Date.now()),
                        attempts: 0,
                        lastError: null,
                        lastAttemptAt: 0
                    };
                }
                return item.__syncMeta;
            } catch(_) { return null; }
        }
        function pruneQueue(queue){
            try {
                const now = Date.now();
                const out = [];
                for (const item of (Array.isArray(queue) ? queue : [])) {
                    if (!item || typeof item !== 'object' || !item.scoreId) continue;
                    const key = makeLinkKey(item);
                    if (key && isLinked(key)) continue;
                    const meta = getMeta(item);
                    const queuedAt = Number(meta && meta.queuedAt || item.ts || now);
                    if ((now - queuedAt) > MAX_QUEUE_AGE_MS) {
                        moveToFailed(item, 'stale-queue-item');
                        continue;
                    }
                    out.push(item);
                }
                return out;
            } catch(_) { return Array.isArray(queue) ? queue : []; }
        }
        function saveQueue(queue){
            try {
                const max = C.PENDING_ACHV_LINK_QUEUE_MAX || 80;
                const cleaned = pruneQueue(Array.isArray(queue) ? queue : []);
                const next = cleaned.slice(-max);
                window.__bcStorage.set(C.STORAGE_KEY_PENDING_ACHV_LINK_QUEUE, next);
            } catch(_) {}
        }
        function scheduleRetry(){
            if (retryTimer) return;
            nextRetryAt = Date.now() + retryDelayMs;
            retryTimer = setTimeout(async () => {
                retryTimer = null;
                nextRetryAt = 0;
                try {
                    const r = await flush({ limit: 20 });
                    if (r && r.remaining > 0) {
                        retryDelayMs = Math.min(60000, Math.max(5000, retryDelayMs * 2));
                        scheduleRetry();
                    } else {
                        retryDelayMs = 5000;
                    }
                } catch(_) {
                    retryDelayMs = Math.min(60000, Math.max(5000, retryDelayMs * 2));
                    scheduleRetry();
                }
            }, retryDelayMs);
        }
        function enqueue(item){
            try {
                if (!item || !item.scoreId) return false;
                const key = makeLinkKey(item);
                if (key && isLinked(key)) return true;
                const queue = pruneQueue(loadQueue());
                const dup = queue.some(x => makeLinkKey(x) === key);
                if (!dup) {
                    const payload = { scoreId: item.scoreId, runId: item.runId || null, ts: Date.now() };
                    getMeta(payload);
                    queue.push(payload);
                }
                saveQueue(queue);
                if (navigator.onLine && typeof window.linkLatestAchievementRunToScore === 'function') {
                    setTimeout(() => { try { flush({ limit: 8 }); } catch(_) {} }, 700);
                } else {
                    scheduleRetry();
                }
                return true;
            } catch(_) { return false; }
        }
        async function flush(options = {}){
            if (flushing) return { flushed: 0, remaining: loadQueue().length, skipped: true };
            flushing = true;
            lastFlushAt = Date.now();
            try {
                if (typeof window.linkLatestAchievementRunToScore !== 'function') {
                    return { flushed: 0, remaining: loadQueue().length, reason: 'link-api-unavailable' };
                }
                let queue = pruneQueue(loadQueue());
                if (!queue.length) return { flushed: 0, remaining: 0 };
                const limit = Math.max(1, Number(options.limit) || 10);
                let flushed = 0;
                let processed = 0;
                let failed = false;
                while (queue.length && processed < limit) {
                    const item = queue[0];
                    if (!item || typeof item !== 'object' || !item.scoreId) {
                        queue.shift();
                        processed++;
                        continue;
                    }
                    const key = makeLinkKey(item);
                    if (key && isLinked(key)) {
                        queue.shift();
                        processed++;
                        continue;
                    }
                    const meta = getMeta(item);
                    try {
                        await window.linkLatestAchievementRunToScore(item.scoreId, item.runId || null);
                        if (key) markLinked(key);
                        queue.shift();
                        flushed++;
                        totalFlushed++;
                        processed++;
                    } catch(_) {
                        failed = true;
                        try {
                            if (meta) {
                                meta.attempts = Math.max(0, Number(meta.attempts || 0)) + 1;
                                meta.lastAttemptAt = Date.now();
                                meta.lastError = 'flush-item-failed';
                                if (meta.attempts >= MAX_ATTEMPTS) {
                                    moveToFailed(item, 'max-attempts-exceeded');
                                    queue.shift();
                                    processed++;
                                    totalFailed++;
                                    continue;
                                }
                            }
                        } catch(_) {}
                        break;
                    }
                }
                saveQueue(queue);
                if (failed && queue.length > 0) scheduleRetry();
                if (queue.length === 0) retryDelayMs = 5000;
                lastFlushError = failed ? 'flush-item-failed' : null;
                return { flushed, remaining: queue.length };
            } catch(e) {
                lastFlushError = String(e && e.message || e);
                throw e;
            } finally {
                flushing = false;
            }
        }
        function getState(){
            try {
                const queue = loadQueue();
                const linked = loadLinkedMap();
                return {
                    flushing,
                    queueLength: Array.isArray(queue) ? queue.length : 0,
                    failedQueueLength: loadFailedQueue().length,
                    retryDelayMs,
                    nextRetryAt,
                    linkedKeyCount: Object.keys(linked || {}).length,
                    lastFlushAt,
                    lastFlushError,
                    totalFlushed,
                    totalFailed
                };
            } catch(_) {
                return { flushing, queueLength: 0, failedQueueLength: 0, retryDelayMs, nextRetryAt, linkedKeyCount: 0, lastFlushAt, lastFlushError, totalFlushed, totalFailed };
            }
        }
        return { load: loadQueue, enqueue, flush, markLinked, isLinked, getState };
    })();

    window.addEventListener('online', () => {
        try { window.PendingScoreSync && window.PendingScoreSync.flush({ limit: 20 }); } catch(_) {}
        try { window.PendingAchvLinkSync && window.PendingAchvLinkSync.flush({ limit: 20 }); } catch(_) {}
    });
    document.addEventListener('leaderboard:adapter-ready', () => {
        try { window.PendingScoreSync && window.PendingScoreSync.flush({ limit: 20 }); } catch(_) {}
        try { window.PendingAchvLinkSync && window.PendingAchvLinkSync.flush({ limit: 20 }); } catch(_) {}
    });
    document.addEventListener('visibilitychange', () => {
        try {
            if (document.visibilityState === 'visible' && navigator.onLine) {
                window.PendingScoreSync && window.PendingScoreSync.flush({ limit: 12 });
                window.PendingAchvLinkSync && window.PendingAchvLinkSync.flush({ limit: 12 });
            }
        } catch(_) {}
    });
    window.addEventListener('focus', () => {
        try {
            if (navigator.onLine) {
                window.PendingScoreSync && window.PendingScoreSync.flush({ limit: 8 });
                window.PendingAchvLinkSync && window.PendingAchvLinkSync.flush({ limit: 8 });
            }
        } catch(_) {}
    });

    window.invalidateLeaderboardCache = function(){ try { window.__lbLatestData = null; window.__lbLatestTs = 0; } catch(_) {} };
    window.announce = function(msg){ try { const el = document.getElementById('ariaAnnouncements'); if(!el) return; el.textContent=''; setTimeout(()=>{ el.textContent=msg; }, 10); } catch(_) {} };
})();
