
    // 是否啟用外部經文載入（關閉則完全不嘗試抓取 external-verses.json）
    // Enable/disable external verses loading (skip fetching when disabled)
    const ENABLE_EXTERNAL_VERSES = true;
    // 啟動時延後載入大型題庫，改為使用時觸發
    const DEFER_EXTERNAL_VERSES_BOOT = true;
    const ENABLE_VERSE_SHARDS = true;
    const EXTERNAL_FETCH_TIMEOUT_MS = 4500;
    const EXTERNAL_FETCH_TIMEOUT_URGENT_MS = 2600;
    const EXTERNAL_VERSE_SHARDS = {
        old: 'data/external-verses-old.json',
        new: 'data/external-verses-new.json'
    };
    const NEW_TESTAMENT_BOOKS = new Set([
        '馬太福音','馬可福音','路加福音','約翰福音','使徒行傳','羅馬書',
        '哥林多前書','哥林多後書','加拉太書','以弗所書','腓立比書','歌羅西書',
        '帖撒羅尼迦前書','帖撒羅尼迦後書','提摩太前書','提摩太後書','提多書',
        '腓利門書','希伯來書','雅各書','彼得前書','彼得後書','約翰一書',
        '約翰二書','約翰三書','猶大書','啟示錄'
    ]);

    function isConstrainedInAppBrowser() {
        try {
            if (typeof window !== 'undefined' && typeof window.__BC_IS_IN_APP_BROWSER === 'boolean') {
                return window.__BC_IS_IN_APP_BROWSER;
            }
        } catch(_) {}
        const ua = navigator.userAgent || navigator.vendor || window.opera || '';
        return /Line|FBAN|FBAV|Instagram/i.test(ua);
    }
    try { window.isConstrainedInAppBrowser = isConstrainedInAppBrowser; } catch(_) {}

    // IndexedDB Helper 已移至 js/utils/idb-helper.js
    // IDBHelper logic moved to external script

    function scheduleIdleTask(fn, timeout = 1200) {
        // iOS WebViews don't handle massive IDLE tasks well and lack robust requestIdleCallback
        const isWebView = isConstrainedInAppBrowser();
        if (isWebView) {
            return setTimeout(() => { try { fn(); } catch(_) {} }, 3500); // Massive delay to let initial animations settle
        }
        
        try {
            if (window.requestIdleCallback) {
                return window.requestIdleCallback(() => { try { fn(); } catch(_) {} }, { timeout });
            }
        } catch(_) {}
        return setTimeout(() => { try { fn(); } catch(_) {} }, 500);
    }

    async function normalizeVerseDatabaseChunked(db, chunkSize = 100) {
        const out = [];
        const seen = new Set();
        const defaultVersion = '新標點和合本 神版';
        if (!Array.isArray(db)) return out;

        for (let i = 0; i < db.length; i++) {
            const raw = db[i];
            const v = raw || {};

            try { v.book = normalizeBookName(v.book); } catch (_) {}
            try { if (typeof v.chapter === 'number') v.chapter = String(v.chapter); } catch(_){}
            try { if (typeof v.verse === 'string') v.verse = sanitizeVerseText(v.verse); } catch(_){}
            if (!isValidVerseRecord(v)) continue;
            try { if (isWeakTopicalVerse(v.verse)) continue; } catch(_) {}

            const key = `${v.book}|${v.chapter}|${v.verse}|${v.version||''}`;
            if (seen.has(key)) continue;
            seen.add(key);

            try { if (!v.version) v.version = defaultVersion; } catch(_) {}
            try {
                const rawR = (v && v.rarity != null) ? String(v.rarity).trim().toLowerCase() : '';
                if (rawR) {
                    const map = {
                        '常見': 'common', '中等': 'common', '少見': 'uncommon', '冷門': 'rare', '全部': 'all',
                        'common': 'common', 'medium': 'common', 'uncommon': 'uncommon', 'rare': 'rare', 'all': 'all'
                    };
                    v.rarity = map[rawR] || classifyRarity(v);
                } else {
                    v.rarity = classifyRarity(v);
                }
            } catch(_) {}

            out.push(v);

            if ((i + 1) % chunkSize === 0) {
                // 🚀 Yield more time to the browser in WebViews to prevent Jetsam memory limits hitting max
                const waitTime = /Line|FBAN|FBAV|Instagram/i.test(navigator.userAgent || navigator.vendor || window.opera) ? 25 : 0;
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
        return out;
    }

    function warmNormalizeAndIndex(rawData) {
        try {
            if (!Array.isArray(rawData) || rawData.length === 0) return;
            const scope = String(arguments[1] || 'full');
            if (window.__normalizedWarmupRunning) {
                window.__pendingNormalizedWarmup = { rawData, scope };
                return;
            }
            window.__normalizedWarmupRunning = true;
            scheduleIdleTask(async () => {
                try {
                    const norm = await normalizeVerseDatabaseChunked(rawData);
                    window.__normalizedDB = norm;
                    window.__normalizedDBScope = scope;
                    try { buildVerseIndex(norm); } catch(_) {}
                    try {
                        window.dispatchEvent(new CustomEvent('externalVersesIndexed', { detail: { count: norm.length, scope } }));
                    } catch(_) {}
                } catch(_) {
                    // fallback: keep sync path in getActiveVerseDB
                } finally {
                    window.__normalizedWarmupRunning = false;
                    try {
                        const pending = window.__pendingNormalizedWarmup;
                        window.__pendingNormalizedWarmup = null;
                        if (pending && Array.isArray(pending.rawData) && pending.rawData.length > 0) {
                            const pendingScope = String(pending.scope || 'full');
                            const currentScope = String(window.__normalizedDBScope || '');
                            if (pendingScope !== currentScope) {
                                warmNormalizeAndIndex(pending.rawData, pendingScope);
                            }
                        }
                    } catch(_) {}
                }
            }, 1500);
        } catch(_) {}
    }

    let __externalLoadPromise = null;
    let __externalBootLoadScheduled = false;
    let __lastUrgentLoadTs = 0;
    let __lastUrgentForceFull = false;

    function requestUrgentVerseLoad(forceFull = false, options = {}) {
        try {
            const interactive = !!options.interactive;
            const constrained = isConstrainedInAppBrowser();
            const preferredScope = pickPreferredVerseScope();
            if (constrained && !interactive) {
                const hasExistingData = !!(
                    (Array.isArray(window.__normalizedDB) && window.__normalizedDB.length > 0) ||
                    (Array.isArray(window.verseDatabase) && window.verseDatabase.length > 0)
                );
                if (!hasExistingData) return;
            }
            if (constrained && !forceFull && !preferredScope) {
                return;
            }
            const desiredScope = forceFull ? 'full' : (preferredScope || getDesiredVerseScope());
            const currentScope = String(window.__verseDatabaseScope || '');
            const hasData = Array.isArray(window.verseDatabase) && window.verseDatabase.length > 0;
            const scopeSatisfied = desiredScope === 'full'
                ? currentScope === 'full'
                : (currentScope === desiredScope || currentScope === 'full');
            if (hasData && scopeSatisfied) return;
            const now = Date.now();
            const recentlyTriggered = (now - __lastUrgentLoadTs) < 450;
            if (recentlyTriggered && (!forceFull || __lastUrgentForceFull)) return;
            __lastUrgentLoadTs = now;
            __lastUrgentForceFull = !!forceFull;
            attemptLoadExternalVerses({ urgent: true, forceFull: !!forceFull });
        } catch(_) {}
    }

    function pickPreferredVerseScope() {
        if (!ENABLE_VERSE_SHARDS) return null;
        try {
            const gs = (typeof window.gameState === 'object' && window.gameState) ? window.gameState : {};
            if (gs && gs.range === 'testament' && (gs.testament === 'old' || gs.testament === 'new')) {
                return gs.testament;
            }
            if (gs && gs.range === 'custom' && Array.isArray(gs.customBooks) && gs.customBooks.length > 0) {
                let hasOld = false;
                let hasNew = false;
                for (const book of gs.customBooks) {
                    if (NEW_TESTAMENT_BOOKS.has(String(book || ''))) hasNew = true;
                    else hasOld = true;
                    if (hasOld && hasNew) break;
                }
                if (hasOld && !hasNew) return 'old';
                if (hasNew && !hasOld) return 'new';
            }
            if (gs && (gs.testament === 'old' || gs.testament === 'new')) return gs.testament;
        } catch(_) {}
        return null;
    }

    function getDesiredVerseScope() {
        if (!ENABLE_VERSE_SHARDS) return 'full';
        const preferred = pickPreferredVerseScope();
        return preferred || 'full';
    }

    async function fetchVerseJson(path, options = {}) {
        try {
            const timeoutMs = Math.max(800, Number(options.timeoutMs) || EXTERNAL_FETCH_TIMEOUT_MS);
            const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            const timer = setTimeout(() => { try { ctrl && ctrl.abort(); } catch(_) {} }, timeoutMs);
            const res = await fetch(path, {
                signal: ctrl ? ctrl.signal : undefined,
                cache: options.cache || 'default'
            });
            clearTimeout(timer);
            if (!res || !res.ok) return null;
            const json = await res.json();
            return Array.isArray(json) ? json : null;
        } catch(_) {
            return null;
        }
    }

    function scheduleDeferredExternalLoad() {
        try {
            if (__externalBootLoadScheduled) return;
            if (Array.isArray(window.verseDatabase) && window.verseDatabase.length > 0) return;
            if (isConstrainedInAppBrowser()) return;
            __externalBootLoadScheduled = true;
            scheduleIdleTask(() => {
                try { requestUrgentVerseLoad(false); } catch(_) {}
            }, 900);
        } catch(_) {}
    }

    // 嘗試載入外部經文資料（非同步、可快取），失敗則保留內建資料
    // Load external verses asynchronously with IndexedDB cache; fallback gracefully on errors
    // 嘗試載入外部題庫 JSON，正規化後放入全域 verseDatabase
    // Attempt to load external verse JSON, normalize, and set window.verseDatabase
    async function attemptLoadExternalVerses(options = {}) {
            // 若不啟用外部載入，直接返回
            if (!ENABLE_EXTERNAL_VERSES) return;
            const urgent = !!options.urgent;
            const forceFull = !!options.forceFull;
            const constrained = isConstrainedInAppBrowser();
            const preferredScope = (!forceFull && ENABLE_VERSE_SHARDS) ? pickPreferredVerseScope() : null;

            if (constrained && !forceFull && !preferredScope) {
                return;
            }

            // 非急迫情境下採延遲載入，降低首屏負擔
            if (!urgent && DEFER_EXTERNAL_VERSES_BOOT) {
                scheduleDeferredExternalLoad();
                return;
            }

            if (__externalLoadPromise) return __externalLoadPromise;

            __externalLoadPromise = (async () => {
            try {
                window.__externalVersesLoading = true;
                const loadingEvt = new CustomEvent('externalVersesLoading', { detail: { loading: true, urgent, forceFull } });
                window.dispatchEvent(loadingEvt);
            } catch(_) {}
            try {
                const idbCandidates = preferredScope ? [`externalVerses:${preferredScope}`, 'externalVerses'] : ['externalVerses'];
                // 1. 嘗試從 IndexedDB 讀取
                // 1. Try reading from IndexedDB
                let data = [];
                let scope = 'full';
                try {
                    for (const key of idbCandidates) {
                        const cached = await IDBHelper.get(key);
                        if (Array.isArray(cached) && cached.length > 0) {
                            data = cached;
                            scope = key === 'externalVerses' ? 'full' : String(key).split(':')[1] || 'full';
                            break;
                        }
                    }
                } catch (e) { console.warn('IDB read failed', e); }

// 2. If IDB empty, fetch from network
                if (data.length === 0) {
                    const timeoutMs = urgent ? EXTERNAL_FETCH_TIMEOUT_URGENT_MS : EXTERNAL_FETCH_TIMEOUT_MS;
                    
                    try {
                        if (preferredScope === 'new') {
                            data = await fetchVerseJson(EXTERNAL_VERSE_SHARDS.new, { timeoutMs, cache: urgent ? 'no-store' : 'default' }) || [];
                            scope = 'new';
                            if (data.length > 0) try { IDBHelper.set('externalVerses:new', data).catch(()=>{}); } catch(_){}
                        } else if (preferredScope === 'old') {
                            data = await fetchVerseJson(EXTERNAL_VERSE_SHARDS.old, { timeoutMs, cache: urgent ? 'no-store' : 'default' }) || [];
                            scope = 'old';
                            if (data.length > 0) try { IDBHelper.set('externalVerses:old', data).catch(()=>{}); } catch(_){}
                        } else {
                            // 🚀 Critical Memory Fix: Fetch shards sequentially instead of concurrently. 
                            // Resolves iOS LINE WebView Out-Of-Memory (Jetsam) crashes caused by simultaneous parsing of 7.8MB JSON.
                            const newData = await fetchVerseJson(EXTERNAL_VERSE_SHARDS.new, { timeoutMs, cache: urgent ? 'no-store' : 'default' }) || [];
                            await new Promise(r => setTimeout(r, 150)); // Allow garbage collector to settle
                            const oldData = await fetchVerseJson(EXTERNAL_VERSE_SHARDS.old, { timeoutMs, cache: urgent ? 'no-store' : 'default' }) || [];
                            
                            if (Array.isArray(newData) && Array.isArray(oldData)) {
                                data = oldData.concat(newData);
                                scope = 'full';
                                if (data.length > 0) try { IDBHelper.set('externalVerses', data).catch(()=>{}); } catch(_){}
                            }
                        }
                    } catch(e) {
                         console.warn('Safe sequential fetch failed:', e);
                    }
                }

                // 若主檔不存在或為空，直接改用內建資料（不再嘗試不存在的備份檔）
                // If missing/empty, keep internal dataset (no further fallbacks)
                if (!Array.isArray(data) || data.length === 0) {
                    data = [];
                }

                if (Array.isArray(data) && data.length > 0) {
                    // 先存原始資料，實際使用時會再經 normalize 與驗證
                    const previousScope = String(window.__verseDatabaseScope || '');
                    window.verseDatabase = data;
                    window.__verseDatabaseScope = scope;
                    try { window.__externalVersesReady = true; } catch(_) {}
                    try { window.__externalFullVersesReady = scope === 'full'; } catch(_) {}
                    try {
                        window.externalVersesLoadError = '';
                        window.__externalVersesLastErrorTs = 0;
                    } catch(_) {}
                    try {
                        if (previousScope && previousScope !== scope) {
                            window.__normalizedDB = null;
                            window.__normalizedDBScope = '';
                            window.__verseIndex = null;
                        }
                    } catch(_) {}
                    try {
                        const idx = {};
                        data.forEach(v => { if (v.book!=null && v.chapter!=null && v.verse!=null) idx[`${v.book}|${v.chapter}|${v.verse}`] = v; });
                        window.__versesIndex = idx;
                    } catch(_) {}
                    
                    // 正規化與索引改為背景分段處理，降低主執行緒卡頓
                    try { warmNormalizeAndIndex(data, scope); } catch(_) {}
                    try { updateStartButtonState(); } catch(e) {}
                    try {
                        if (!window.__marqueeInitialized && typeof initializeVerseMarquee === 'function') {
                            initializeVerseMarquee();
                        }
                    } catch(_) {}
                    try { refreshVerseMarqueeData(); } catch(e) {}
                    try {
                        const evt = new CustomEvent('externalVersesLoaded', { detail: { hasData: true, source: scope } });
                        window.dispatchEvent(evt);
                    } catch(_) {}

                    // 若先載入分片，背景再補完整題庫，避免後續跨約範圍切換再等待
                    if (scope !== 'full' && !forceFull && !constrained && !window.__BC_DISABLE_EXTERNAL_FULL_LOAD) {
                        scheduleIdleTask(() => {
                            try {
                                if (!window.__externalFullVersesReady) attemptLoadExternalVerses({ urgent: true, forceFull: true });
                            } catch(_) {}
                        }, urgent ? 900 : 2200);
                    }
                }
            } catch (e) {
                // 記錄失敗，以便 UI 顯示明確提示（例如 file:// 或 CORS/路徑問題）
                // Record error for UI hints (e.g., file:// access or CORS/path issues)
                try { window.__externalVersesReady = false; } catch(_) {}
                try { window.externalVersesLoadError = (e && e.message) ? String(e.message) : 'unknown'; } catch(_) {}
                try { window.__externalVersesLastErrorTs = Date.now(); } catch(_) {}
                try { updateStartButtonState(); } catch(_) {}
                try {
                    const evt = new CustomEvent('externalVersesLoaded', { detail: { hasData: false, source: 'error', error: (e && e.message) || 'unknown' } });
                    window.dispatchEvent(evt);
                } catch(_) {}
            } finally {
                try {
                    window.__externalVersesLoading = false;
                    const loadingEvt = new CustomEvent('externalVersesLoading', { detail: { loading: false, urgent, forceFull } });
                    window.dispatchEvent(loadingEvt);
                } catch(_) {}
                __externalLoadPromise = null;
            }
            })();

            return __externalLoadPromise;
        }

        // 聖經書卷數據
        const bibleBooks = {
            old: ['創世記', '出埃及記', '利未記', '民數記', '申命記', '約書亞記', '士師記', '路得記', 
                  '撒母耳記上', '撒母耳記下', '列王紀上', '列王紀下', '歷代志上', '歷代志下', 
                  '以斯拉記', '尼希米記', '以斯帖記', '約伯記', '詩篇', '箴言', '傳道書', '雅歌', 
                  '以賽亞書', '耶利米書', '耶利米哀歌', '以西結書', '但以理書', '何西阿書', 
                  '約珥書', '阿摩司書', '俄巴底亞書', '約拿書', '彌迦書', '那鴻書', '哈巴谷書', 
                  '西番雅書', '哈該書', '撒迦利亞書', '瑪拉基書'],
            new: ['馬太福音', '馬可福音', '路加福音', '約翰福音', '使徒行傳', '羅馬書', 
                  '哥林多前書', '哥林多後書', '加拉太書', '以弗所書', '腓立比書', '歌羅西書', 
                  '帖撒羅尼迦前書', '帖撒羅尼迦後書', '提摩太前書', '提摩太後書', '提多書', 
                  '腓利門書', '希伯來書', '雅各書', '彼得前書', '彼得後書', '約翰一書', 
                  '約翰二書', '約翰三書', '猶大書', '啟示錄']
        };

        // 書卷簡稱對照表
        const bookAbbreviations = {
            '創世記': '創', '出埃及記': '出', '利未記': '利', '民數記': '民', '申命記': '申',
            '約書亞記': '書', '士師記': '士', '路得記': '得', '撒母耳記上': '撒上', '撒母耳記下': '撒下',
            '列王紀上': '王上', '列王紀下': '王下', '歷代志上': '代上', '歷代志下': '代下',
            '以斯拉記': '拉', '尼希米記': '尼', '以斯帖記': '斯', '約伯記': '伯', '詩篇': '詩',
            '箴言': '箴', '傳道書': '傳', '雅歌': '歌', '以賽亞書': '賽', '耶利米書': '耶',
            '耶利米哀歌': '哀', '以西結書': '結', '但以理書': '但', '何西阿書': '何',
            '約珥書': '珥', '阿摩司書': '摩', '俄巴底亞書': '俄', '約拿書': '拿', '彌迦書': '彌',
            '那鴻書': '鴻', '哈巴谷書': '哈', '西番雅書': '番', '哈該書': '該',
            '撒迦利亞書': '亞', '瑪拉基書': '瑪',
            '馬太福音': '太', '馬可福音': '可', '路加福音': '路', '約翰福音': '約',
            '使徒行傳': '徒', '羅馬書': '羅', '哥林多前書': '林前', '哥林多後書': '林後',
            '加拉太書': '加', '以弗所書': '弗', '腓立比書': '腓', '歌羅西書': '西',
            '帖撒羅尼迦前書': '帖前', '帖撒羅尼迦後書': '帖後', '提摩太前書': '提前',
            '提摩太後書': '提後', '提多書': '多', '腓利門書': '門', '希伯來書': '來',
            '雅各書': '雅', '彼得前書': '彼前', '彼得後書': '彼後', '約翰一書': '約一',
            '約翰二書': '約二', '約翰三書': '約三', '猶大書': '猶', '啟示錄': '啟'
        };

        // 將各種可能的書卷名稱（含簡稱）正規化為此程式所使用的「完整中文書名」
        function normalizeBookName(name) {
            try {
                if (!name) return name;
                const raw = String(name).trim();
                // 如果本就為完整中文書名且存在於清單中，直接回傳
                if ([...bibleBooks.old, ...bibleBooks.new].includes(raw)) return raw;

                // 嘗試用簡稱（如「太、林前、彼後、創、詩」）反查完整書名
                for (const [full, abbr] of Object.entries(bookAbbreviations)) {
                    if (raw === abbr) return full;
                }

                // 寬鬆處理：移除空白再比對一次
                const compact = raw.replace(/\s+/g, '');
                for (const [full, abbr] of Object.entries(bookAbbreviations)) {
                    if (compact === abbr) return full;
                    if (compact === full.replace(/\s+/g, '')) return full;
                }

                // 未辨識則回傳原值（後續過濾可能會略過此書名）
                return raw;
            } catch (e) {
                return name;
            }
        }

    // 內建題庫已移除，改用 external-verses.json 作為唯一資料來源

    // 清理經文：移除說明用括號內容與多餚空白（保留原文語句）
    // Clean verse text: remove parenthetical notes and extra whitespace (keep original sentences).
        function sanitizeVerseText(text) {
            try {
                if (text == null) return text;
                let s = String(text);
                // 反覆移除半形與全形括號內的內容（不跨越嵌套，迭代處理多段）
                const patterns = [/\([^()]*\)/g, /（[^（）]*）/g];
                let changed = true;
                while (changed) {
                    changed = false;
                    for (const re of patterns) {
                        const next = s.replace(re, '');
                        if (next !== s) { s = next; changed = true; }
                    }
                }
                // 移除常見註腳/異譯提示片語（不在括號中者也移除）
                // 例如："或譯：…"、"原文是…"、"又作…"、"直譯…"、"意即…"、"希臘文…"、"希伯來文…"
                const notePhrases = [
                    '或譯', '原文', '又作', '直譯', '意即', '希臘文', '希伯來文', '古卷', '小字', '有作'
                ];
                // 以冒號/破折號等起始到行尾的形式清理註腳（保守處理）
                for (const kw of notePhrases) {
                    const re = new RegExp(`${kw}\s*[：:，,]?[^。！？…\n]*`, 'g');
                    s = s.replace(re, '');
                }
                // 清理可能混入的章節引用片段（如 "46:24:"、"46:25:" 等）
                s = s.replace(/\b\d{1,3}:\d{1,3}\s*[:：]?/g, '');
                // 收斂空白與標點周圍空白
                s = s.replace(/\s{2,}/g, ' ').replace(/\s*([，。！？…；;:：,\.\!\?])\s*/g, '$1').trim();
                return s;
            } catch (_) { return text; }
        }

    // 主題性偵測：盡量避開不具主題性的對話型經文（如「百姓回答說：…」）
    // Topicality check: favor verses with clear spiritual keywords; avoid generic dialogues.
        function hasTopicalKeywords(text) {
            try {
                if (!text) return false;
                const keywords = [
                    '耶和華','主','神','耶穌','基督','聖靈','信','愛','義','罪','救','救恩','恩典','福',
                    '讚美','稱謝','敬畏','盼望','永生','生命','聖潔','公義','真理','福音','喜樂','平安','智慧','祈求','禱告'
                ];
                return keywords.some(k => text.includes(k));
            } catch (_) { return false; }
        }

    // 判斷是否屬於不明確的對話開頭（可能缺乏明確主題）
    // Detect ambiguous conversational openings that are weak as standalone prompts.
    function looksLikeAmbiguousDialogue(text) {
            try {
                if (!text) return false;
                const t = String(text).trim().replace(/^^[「『\"]+/, '');
                // 通用對話觸發詞
                const genericSubjects = '(百姓|眾人|人們|他|他們|門徒|婦人|僕人|朋友|眾弟兄|眾民|長老|祭司|文士|法利賽人|官長|王|母親|父親|群眾|有人)';
                const say = '(說|回答說|回說|問|對)';
                // 1) 主語 + 對/問 + 說：
                const re1 = new RegExp('^' + genericSubjects + '[^，。！？:：]{0,8}?' + say + '[^，。！？:：]{0,6}?(說|)[：:]');
                // 2) 主語 + 回答說：
                const re2 = new RegExp('^' + genericSubjects + '(?:[^，。！？:：]{0,6})?回答說[：:]');
                // 3) 對他(們)說 / 問他(們)說：
                const re3 = /^(他|他們|眾人|百姓|人|門徒)[^，。！？:：]{0,6}(對|問)[^，。！？:：]{0,6}說[：:]/;
                return re1.test(t) || re2.test(t) || re3.test(t);
            } catch (_) { return false; }
        }

    // 主題性評估：過短或含糊對話且無關鍵詞 → 視為弱主題
    // Topicality decision: very short or ambiguous dialogue without keywords => weak topical.
    function isWeakTopicalVerse(text) {
            try {
                if (!text) return true;
                const cleaned = String(text).trim();
                const len = cleaned.replace(/[\s，。！？…；:：、\-—\(\)（）\u3000\'\"「」『』《》〈〉]/g, '').length;
                const dialogue = looksLikeAmbiguousDialogue(cleaned);
                const topical = hasTopicalKeywords(cleaned);
                // 規則：
                // - 若像是含糊對話且無明顯主題關鍵詞 → 視為弱主題
                // - 或者字數極短且無關鍵詞 → 視為弱主題
                if ((dialogue && !topical) || (len < 8 && !topical)) return true;
                // 放行例外：出現「耶穌」「主」「耶和華」「神」等即使是對話也常具主題性
                if (/耶穌|主|耶和華|神/.test(cleaned)) return false;
                return false;
            } catch (_) { return false; }
        }

        // --- 題庫整理與難度對應：統一出題來源、去重、罕見度標註、難度過濾 ---
    // 罕見度類別（UI 僅三種）：
    // - common    常見
    // - uncommon  少見（內部用；UI 已併入冷門）
    // - rare      冷門
            // 備註：可在 external-verses.json 直接提供 rarity 屬性（支援英文或中文：常見/中等/少見/冷門/全部）以覆蓋預設分類

// 根據書卷分類法 (Book Tiers)、黃金名句表與句型分析動態判定稀有度
    function classifyRarity(v) {
            try {
                if (v && typeof v.rarity === 'string') {
                    // 若外部資料有強勢指定，以此為準
                    const raw = v.rarity.trim().toLowerCase();
                    const map = {
                        '常見': 'common', '中等': 'common', '少見': 'uncommon', '冷門': 'rare', '全部': 'all',
                        'common': 'common', 'medium': 'common', 'uncommon': 'uncommon', 'rare': 'rare', 'all': 'all'
                    };
                    const m = map[raw];
                    if (m) return m;
                }
            } catch (e) {}

            const key = `${v.book}|${v.chapter}`;
            const text = String(v.text || '');

            // 1. 特徵輔助判斷 (Heuristic Filtering) - 含有強烈「族譜/邊界點交接」的冷僻特徵直接打入 rare
            const genealogyKeywords = ['生了', '的兒子是', '支派', '族長', '名單', '宗族', '的後代', '首領', '諸子', '年歲', '幾歲'];
            let genealogyMatchCount = 0;
            for (let word of genealogyKeywords) {
                // 若簡短經文中同時出現多個族譜關鍵字，或是單一關鍵字出現多次
                const matches = text.match(new RegExp(word, 'g'));
                if (matches) genealogyMatchCount += matches.length;
            }
            // 若含有大量這類字眼，視為題庫干擾項目（罕見）
            if (genealogyMatchCount >= 2) return 'rare';

                          // 2. 擴充版的網路金句名節表 (COMMON) - 這些經文一律視為常見
              const COMMON = new Set([
                  // ==== 舊約 (Old Testament) ====
                  '創世記|1:1', '創世記|1:27', '創世記|1:31', '創世記|2:7', '創世記|2:18', '創世記|3:15', '創世記|12:1', '創世記|12:2', '創世記|12:3', '創世記|50:20',
                  '出埃及記|3:14', '出埃及記|14:14', '出埃及記|20:3', '出埃及記|20:12', '出埃及記|20:13', '出埃及記|20:14', '出埃及記|20:15',
                  '利未記|11:44', '利未記|19:18',
                  '民數記|6:24', '民數記|6:25', '民數記|6:26', '民數記|23:19',
                  '申命記|6:4', '申命記|6:5', '申命記|8:3', '申命記|28:1', '申命記|31:6', '申命記|31:8',
                  '約書亞記|1:8', '約書亞記|1:9', '約書亞記|24:15',
                  '路得記|1:16',
                  '撒母耳記上|15:22', '撒母耳記上|16:7', 
                  '撒母耳記下|7:22', '撒母耳記下|22:31',
                  '列王紀上|8:56',
                  '歷代志上|16:11', '歷代志上|29:11',
                  '歷代志下|7:14',
                  '尼希米記|8:10',
                  '約伯記|1:21', '約伯記|19:25', '約伯記|42:2',
                  '詩篇|1:1', '詩篇|1:2', '詩篇|1:3', '詩篇|8:4', '詩篇|16:11', '詩篇|19:1', '詩篇|19:14', '詩篇|23:1', '詩篇|23:4', '詩篇|27:1', '詩篇|27:4', '詩篇|34:8', '詩篇|37:4', '詩篇|37:5', '詩篇|42:1', '詩篇|46:1', '詩篇|46:10', '詩篇|51:10', '詩篇|62:1', '詩篇|84:11', '詩篇|90:12', '詩篇|91:1', '詩篇|91:2', '詩篇|100:3', '詩篇|103:1', '詩篇|103:2', '詩篇|105:1', '詩篇|118:24', '詩篇|119:9', '詩篇|119:11', '詩篇|119:105', '詩篇|121:1', '詩篇|121:2', '詩篇|127:1', '詩篇|133:1', '詩篇|139:14', '詩篇|139:23', '詩篇|139:24', '詩篇|145:18', '詩篇|150:6',
                  '箴言|1:7', '箴言|3:5', '箴言|3:6', '箴言|4:23', '箴言|9:10', '箴言|15:1', '箴言|16:3', '箴言|16:9', '箴言|16:18', '箴言|17:22', '箴言|18:10', '箴言|22:6', '箴言|27:17', '箴言|28:13',
                  '傳道書|3:1', '傳道書|3:11', '傳道書|12:1', '傳道書|12:13',
                  '雅歌|8:6', '雅歌|8:7',
                  '以賽亞書|9:6', '以賽亞書|12:2', '以賽亞書|26:3', '以賽亞書|40:8', '以賽亞書|40:31', '以賽亞書|41:10', '以賽亞書|43:1', '以賽亞書|43:2', '以賽亞書|53:5', '以賽亞書|53:6', '以賽亞書|55:8', '以賽亞書|55:9', '以賽亞書|60:1',
                  '耶利米書|29:11', '耶利米書|29:12', '耶利米書|29:13', '耶利米書|31:3', '耶利米書|33:3',
                  '耶利米哀歌|3:22', '耶利米哀歌|3:23',
                  '以西結書|36:26', '但以理書|12:3', '何西阿書|6:6', '瑪拉基書|3:10', '瑪拉基書|3:11',
                  
                  // ==== 新約 (New Testament) ====
                  '馬太福音|1:21', '馬太福音|1:23', '馬太福音|4:4', '馬太福音|5:3', '馬太福音|5:4', '馬太福音|5:5', '馬太福音|5:6', '馬太福音|5:7', '馬太福音|5:8', '馬太福音|5:9', '馬太福音|5:14', '馬太福音|5:16', '馬太福音|5:44', '馬太福音|6:9', '馬太福音|6:10', '馬太福音|6:11', '馬太福音|6:12', '馬太福音|6:13', '馬太福音|6:33', '馬太福音|6:34', '馬太福音|7:7', '馬太福音|7:8', '馬太福音|7:12', '馬太福音|11:28', '馬太福音|16:16', '馬太福音|16:24', '馬太福音|18:20', '馬太福音|19:14', '馬太福音|22:37', '馬太福音|22:38', '馬太福音|22:39', '馬太福音|28:19', '馬太福音|28:20',
                  '馬可福音|8:36', '馬可福音|10:27', '馬可福音|16:15',
                  '路加福音|1:37', '路加福音|2:11', '路加福音|2:14', '路加福音|9:23', '路加福音|19:10',
                  '約翰福音|1:1', '約翰福音|1:12', '約翰福音|1:14', '約翰福音|3:16', '約翰福音|3:36', '約翰福音|4:24', '約翰福音|6:35', '約翰福音|8:12', '約翰福音|8:32', '約翰福音|10:10', '約翰福音|10:11', '約翰福音|10:27', '約翰福音|10:28', '約翰福音|11:25', '約翰福音|14:1', '約翰福音|14:6', '約翰福音|14:27', '約翰福音|15:1', '約翰福音|15:5', '約翰福音|15:13', '約翰福音|16:33',
                  '使徒行傳|1:8', '使徒行傳|4:12', '使徒行傳|16:31',
                  '羅馬書|1:16', '羅馬書|3:23', '羅馬書|5:8', '羅馬書|6:23', '羅馬書|8:1', '羅馬書|8:28', '羅馬書|8:37', '羅馬書|8:38', '羅馬書|8:39', '羅馬書|10:9', '羅馬書|10:10', '羅馬書|12:1', '羅馬書|12:2', '羅馬書|12:12', '羅馬書|15:13',
                  '哥林多前書|1:18', '哥林多前書|2:9', '哥林多前書|6:19', '哥林多前書|10:13', '哥林多前書|10:31', '哥林多前書|13:4', '哥林多前書|13:5', '哥林多前書|13:6', '哥林多前書|13:7', '哥林多前書|13:13', '哥林多前書|15:58',
                  '哥林多後書|4:16', '哥林多後書|4:18', '哥林多後書|5:17', '哥林多後書|5:21', '哥林多後書|9:7', '哥林多後書|12:9',
                  '加拉太書|2:20', '加拉太書|5:1', '加拉太書|5:22', '加拉太書|5:23', '加拉太書|6:9',
                  '以弗所書|2:8', '以弗所書|2:9', '以弗所書|2:10', '以弗所書|4:26', '以弗所書|4:32', '以弗所書|6:10', '以弗所書|6:11', '以弗所書|6:12',
                  '腓立比書|1:6', '腓立比書|1:21', '腓立比書|2:3', '腓立比書|2:4', '腓立比書|3:14', '腓立比書|4:4', '腓立比書|4:6', '腓立比書|4:7', '腓立比書|4:8', '腓立比書|4:13', '腓立比書|4:19',
                  '歌羅西書|3:2', '歌羅西書|3:16', '歌羅西書|3:17', '歌羅西書|3:23',
                  '帖撒羅尼迦前書|5:16', '帖撒羅尼迦前書|5:17', '帖撒羅尼迦前書|5:18', '帖撒羅尼迦前書|5:23',
                  '提摩太前書|4:12', '提摩太前書|6:10',
                  '提摩太後書|1:7', '提摩太後書|2:15', '提摩太後書|3:16', '提摩太後書|3:17', '提摩太後書|4:7',
                  '希伯來書|4:12', '希伯來書|4:16', '希伯來書|10:24', '希伯來書|10:25', '希伯來書|11:1', '希伯來書|11:6', '希伯來書|12:1', '希伯來書|12:2', '希伯來書|13:5', '希伯來書|13:8',
                  '雅各書|1:2', '雅各書|1:3', '雅各書|1:5', '雅各書|1:19', '雅各書|1:22', '雅各書|4:7', '雅各書|4:8', '雅各書|5:16',
                  '彼得前書|2:9', '彼得前書|3:15', '彼得前書|5:7', '彼得前書|5:8',
                  '約翰一書|1:9', '約翰一書|3:18', '約翰一書|4:7', '約翰一書|4:8', '約翰一書|4:18', '約翰一書|4:19', '約翰一書|5:14',
                  '猶大書|1:20', '猶大書|1:21',
                  '啟示錄|3:20', '啟示錄|21:4'
              ]);
            if (COMMON.has(key)) return 'common';

            // 3. 標準化書卷分區法 (Book-based Tiers)
            // 將所有 66 卷書按照「大眾主日學與講道引用頻率」建立基礎判定，廢除預設全部淪為 rare 的作法
            const BASE_TIERS = {
                // 超高頻核心書卷 (預設皆為 common，除非被特定章節篩選掉)
                '創世記': 'common', '詩篇': 'common', '箴言': 'common', 
                '馬太福音': 'common', '馬可福音': 'common', '路加福音': 'common', '約翰福音': 'common',
                '使徒行傳': 'common', '羅馬書': 'common', '哥林多前書': 'common', '哥林多後書': 'common', 
                '加拉太書': 'common', '以弗所書': 'common', '腓立比書': 'common', '歌羅西書': 'common',
                
                // 中高頻書卷 (預設為 uncommon，玩家仍可頻繁抽到)
                '出埃及記': 'uncommon', '申命記': 'uncommon', '約書亞記': 'uncommon', '士師記': 'uncommon',
                '撒母耳記上': 'uncommon', '撒母耳記下': 'uncommon', '以賽亞書': 'uncommon', '耶利米書': 'uncommon',
                '但以理書': 'uncommon', '路得記': 'uncommon', '以斯帖記': 'uncommon', '尼希米記': 'uncommon',
                '傳道書': 'uncommon', '帖撒羅尼迦前書': 'uncommon', '帖撒羅尼迦後書': 'uncommon', 
                '提摩太前書': 'uncommon', '提摩太後書': 'uncommon', '希伯來書': 'uncommon', '雅各書': 'uncommon', 
                '彼得前書': 'uncommon', '彼得後書': 'uncommon', '約翰一書': 'uncommon', '啟示錄': 'uncommon',

                // 低頻與專業級書卷 (預設為 rare)
                '利未記': 'rare', '民數記': 'rare', '列王紀上': 'rare', '列王紀下': 'rare', 
                '歷代志上': 'rare', '歷代志下': 'rare', '以斯拉記': 'rare', '雅歌': 'rare', '耶利米哀歌': 'rare',
                '以西結書': 'rare', '何西阿書': 'rare', '約珥書': 'rare', '阿摩司書': 'rare', '俄巴底亞書': 'rare', 
                '約拿書': 'rare', '彌迦書': 'rare', '那鴻書': 'rare', '哈巴谷書': 'rare', '西番雅書': 'rare', 
                '哈該書': 'rare', '撒迦利亞書': 'rare', '瑪拉基書': 'rare',
                '提多書': 'rare', '腓利門書': 'rare', '約翰二書': 'rare', '約翰三書': 'rare', '猶大書': 'rare'
            };

            // 如果該書卷有被定義在 BASE_TIERS 裡面，直接回傳其基底級別
            if (BASE_TIERS[v.book]) {
                // 如果是 common 書卷中的前幾章，通常更常見（保留彈性以防後續實作）；這裡直接套用 Tier
                return BASE_TIERS[v.book];
            }

            // 終極防呆：若有不認識的書卷名稱（例如拼字錯誤或擴充書卷），預設為少見而非罕見，避免題目過度乾枯
            return 'uncommon';
        }

        // 驗證題庫紀錄是否有效，避免「經文內夾雜其他經文參照或頁碼」等髒資料
        function isValidVerseRecord(v) {
            try {
                if (!v || typeof v !== 'object') return false;
                const book = String(v.book || '').trim();
                const chapter = String(v.chapter || '').trim();
                const verse = String(v.verse || '').trim();

                // 書卷需存在於清單
                const allBooks = [...bibleBooks.old, ...bibleBooks.new];
                if (!allBooks.includes(book)) return false;

                // 章節格式：N:N 或 N:N-N
                if (!/^\d+:\d+(?:-\d+)?$/.test(chapter)) return false;

                // 經文內不應再出現第二個書卷參照，例如「民數記 4:43-44」
                const bookNamePattern = /(創世記|出埃及記|利未記|民數記|申命記|約書亞記|士師記|路得記|撒母耳記上|撒母耳記下|列王紀上|列王紀下|歷代志上|歷代志下|以斯拉記|尼希米記|以斯帖記|約伯記|詩篇|箴言|傳道書|雅歌|以賽亞書|耶利米書|耶利米哀歌|以西結書|但以理書|何西阿書|約珥書|阿摩司書|俄巴底亞書|約拿書|彌迦書|那鴻書|哈巴谷書|西番雅書|哈該書|撒迦利亞書|瑪拉基書|馬太福音|馬可福音|路加福音|約翰福音|使徒行傳|羅馬書|哥林多前書|哥林多後書|加拉太書|以弗所書|腓立比書|歌羅西書|帖撒羅尼迦前書|帖撒羅尼迦後書|提摩太前書|提摩太後書|提多書|腓利門書|希伯來書|雅各書|彼得前書|彼得後書|約翰一書|約翰二書|約翰三書|猶大書|啟示錄)\s+\d+:\d+/;
                if (bookNamePattern.test(verse)) return false;

                // 破碎續行的負號段號，如「-40 從三十歲…」
                if (/^-\d+\b/.test(verse)) return false;

                // 明顯頁碼殘留：空白夾著 2-4 位數字（保守處理）
                if (/\s\d{2,4}\s/.test(verse)) return false;

                return true;
            } catch (_) {
                return false;
            }
        }

        function normalizeVerseDatabase(db) {
            const out = [];
            const seen = new Set();
            const defaultVersion = '新標點和合本 神版';
            if (!Array.isArray(db)) return out;
            for (const raw of db) {
                const v = raw || {};
                // 正規化書卷名稱以對齊本遊戲清單（避免外部資料使用簡稱或其他變體造成過濾失敗）
                try { v.book = normalizeBookName(v.book); } catch (e) {}
                // 將數字章轉成字串以統一選擇器與渲染（external JSON 可能為數字）
                try { if (typeof v.chapter === 'number') v.chapter = String(v.chapter); } catch(e){}
                // 先清理經文中的括號說明，提升可讀性與易分段性
                try { if (typeof v.verse === 'string') v.verse = sanitizeVerseText(v.verse); } catch(e){}
                // 先做資料面向的有效性驗證（在建立 key 之前）
                if (!isValidVerseRecord(v)) continue;
                // 過濾主題性較弱或含糊對話型的經文（例如：「百姓回答說：…」）
                try {
                    if (isWeakTopicalVerse(v.verse)) continue;
                } catch(_) {}
                const key = `${v.book}|${v.chapter}|${v.verse}|${v.version||''}`;
                if (seen.has(key)) continue;
                seen.add(key);
                // 保留外部提供的版本與稀有度；僅在缺失時回填預設與分類
                try { if (!v.version) v.version = defaultVersion; } catch(e){}
                try {
                    // 將外部提供的罕見度（支援中英文）統一到 canonical 值；若缺失則自動分類
                    const rawR = (v && v.rarity != null) ? String(v.rarity).trim().toLowerCase() : '';
                    if (rawR) {
                        const map = {
                            '常見': 'common', '中等': 'common', '少見': 'uncommon', '冷門': 'rare', '全部': 'all',
                            'common': 'common', 'medium': 'common', 'uncommon': 'uncommon', 'rare': 'rare', 'all': 'all'
                        };
                        v.rarity = map[rawR] || classifyRarity(v);
                    } else {
                        v.rarity = classifyRarity(v);
                    }
                } catch(e){}
                out.push(v);
            }
            return out;
        }

        // 建立輕量索引以加速過濾/計數：
        // window.__verseIndex = { byBook: Map<string, Verse[]>, counts: { byBook: Map<string, { total, common, uncommon, rare }> } }
        function buildVerseIndex(normalizedDB) {
            try {
                const arr = Array.isArray(normalizedDB) ? normalizedDB : [];
                const byBook = new Map();
                const counts = new Map();
                for (const v of arr) {
                    const b = v.book;
                    if (!byBook.has(b)) byBook.set(b, []);
                    byBook.get(b).push(v);
                    // counts per rarity
                    if (!counts.has(b)) counts.set(b, { total: 0, common: 0, uncommon: 0, rare: 0 });
                    const c = counts.get(b);
                    c.total++;
                    if (v.rarity === 'common') c.common++;
                    else if (v.rarity === 'uncommon') c.uncommon++;
                    else if (v.rarity === 'rare') c.rare++;
                }
                window.__verseIndex = { byBook, counts };
                return window.__verseIndex;
            } catch (_) {
                window.__verseIndex = { byBook: new Map(), counts: new Map() };
                return window.__verseIndex;
            }
        }

        function getActiveVerseDB() {
            // 改為只使用外部題庫（external-verses.json）；不再使用內建備援
            try {
                const desiredScope = getDesiredVerseScope();
                const currentScope = String(window.__verseDatabaseScope || '');

                // 目標為 full 但目前僅有分片時：先觸發 full 急載入，並允許先用分片開局
                // 這可避免弱網下首局被「等待完整題庫」卡住。
                if (desiredScope === 'full' && currentScope && currentScope !== 'full') {
                    try { requestUrgentVerseLoad(true); } catch(_) {}
                    try { window.__usingShardBeforeFullReady = true; } catch(_) {}
                } else {
                    try { window.__usingShardBeforeFullReady = false; } catch(_) {}
                }

                // 若已有正規化快取，直接使用
                const normalizedScope = String(window.__normalizedDBScope || '');
                if (
                    Array.isArray(window.__normalizedDB) &&
                    window.__normalizedDB.length > 0 &&
                    normalizedScope &&
                    normalizedScope === currentScope
                ) {
                    if (!window.__verseIndex || !window.__verseIndex.byBook) {
                        try { buildVerseIndex(window.__normalizedDB); } catch(_) {}
                    }
                    return window.__normalizedDB;
                }

                // 尚未載入時立即觸發急迫載入（非阻塞），並回傳空陣列給呼叫端顯示「載入中」狀態
                if (!Array.isArray(window.verseDatabase) || window.verseDatabase.length === 0) {
                    // 首次載入優先採 shard-first，提高弱網下「先可開始」成功率
                    try { requestUrgentVerseLoad(false); } catch(_) {}
                    return [];
                }

                const active = (Array.isArray(window.verseDatabase) && window.verseDatabase.length) ? window.verseDatabase : [];
                const norm = normalizeVerseDatabase(active);
                window.__normalizedDB = norm;
                window.__normalizedDBScope = currentScope || desiredScope || 'full';
                try { buildVerseIndex(norm); } catch(_) {}
                return norm;
            } catch (e) {
                return [];
            }
        }

    // 已棄用：舊版難度→罕見度過濾器（現行模型改為：練習=範圍優先、排行=罕見度優先）
    // function filterByDifficultyAndRarity(...) { /* removed */ }

    // 罕見度統計摘要（僅供除錯/顯示）
    // Summarize rarity counts for debugging/display
    function summarizeRarity(db) {
            const sum = { total: 0, common: 0, uncommon: 0, rare: 0 };
            for (const v of (db || [])) {
                sum.total++;
                const r = (v && v.rarity) || 'common';
                if (r === 'common' || r === 'uncommon' || r === 'rare') sum[r]++;
            }
            return sum;
        }

