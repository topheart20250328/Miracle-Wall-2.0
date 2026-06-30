        // #region 成就系統

        /**********************

         * 成就系統 (單局制)

         * 說明：

         *  - 僅於一局結束時計算，不影響排行榜與分數。

         *  - Replay(同題重玩) 局不產生成就。

         *  - hidden=true 的成就僅在達成後顯示。

         *  - fun=true 為趣味 / 彩蛋成就，排序置後。

         *  - tier 1..5 代表難度/稀有度（1最低 5最高）。

         *  - mode: 'classic' | 'survival' | 'any'

         **********************/

        const AchievementManager = (function(){

            const defs = [];

            /** helper 建立定義 */

              function def(o){ defs.push(o); }

            /* 條件 DSL：

               type: 'metric' => 比較 metrics[field] (operators: >=, <=, ==, >, <)

               type: 'and'/'or' => children: []

               type: 'custom' => fn(metrics) => boolean

            */

            function evalRule(rule, m){

                if(!rule) return false;

                switch(rule.type){

                    case 'metric': {

                        const v = m[rule.field];

                        const t = rule.value;

                        switch(rule.op){

                            case '>=': return v >= t; case '>': return v > t; case '<=': return v <= t; case '<': return v < t; case '==': return v == t; default: return false; }

                    }

                    case 'and': return rule.children.every(r=>evalRule(r,m));

                    case 'or': return rule.children.some(r=>evalRule(r,m));

                    case 'custom': return !!rule.fn(m);

                }

                return false;

            }

                        function evaluateAll(metrics, {mode, isReplay, collapseGroups=true, guaranteedIds=null}){

                if(isReplay) return []; // 重播局直接不產生成就

                if(metrics.answeredQuestions < 5) return []; // 遊玩量過低不評估

                const md = (mode || metrics.mode || 'classic');

                const matched = [];

                const guaranteedSet = guaranteedIds ? new Set(guaranteedIds) : new Set();

                for (const a of defs) {

                    try {

                        if (a.mode !== 'any' && a.mode !== md) continue;

                        // 如果在保底名單內，或當下即時判斷過關

                        if (guaranteedSet.has(a.id) || evalRule(a.condition, metrics)) {

                            matched.push(a);

                        }

                    } catch(_) { /* ignore rule failure */ }

                }

                if (!collapseGroups) return matched;

                const bestByGroup = Object.create(null);

                const singles = [];

                for (const a of matched) {

                    if (a && a.groupKey && typeof a.rung === 'number') {

                        const g = a.groupKey; const prev = bestByGroup[g];

                        if (!prev || (a.rung > (prev.rung||0))) bestByGroup[g] = a;

                    } else {

                        singles.push(a);

                    }

                }

                return singles.concat(Object.values(bestByGroup));

            }

            return {defs, def, evaluateAll};

        })();



        // ===== 開發測試工具 (console) =====

        // 用法：simulateAchievementTest({ answeredQuestions:10, correctCount:9, hintsUsed:0, longestStreak:8 })

        // 缺少的欄位會自動填 0，並套上合理派生值，再跑 evaluateAll 觀察結果。

        window.simulateAchievementTest = function(partial){

            try {

                const base = {

                    mode:'classic', answeredQuestions:0,totalQuestions:0,correctCount:0,wrongCount:0,hintsUsed:0,noHint:true,longestStreak:0,currentStreak:0,

                    maxTime:0,survivalDuration:0,rescueUsed:false,nearDeathRecoveries:0,nearDeathActive:false,comebackFromLow:0,fastestAnswerMs:5000,slowestAnswerMs:0,

                    totalAnswerTimeMs:0,ultraFastCorrectChain:0,ultraFastCorrectMax:0,perQuestionTimes:[],timeSamples:[],levelPerfectFlags:[],levelsPerfectCount:0,

                    consecutivePerfectLevels:0,maxConsecutivePerfect:0,firstFiveCorrect:0

                };

                const m = Object.assign(base, partial||{});

                if(m.answeredQuestions===0) m.answeredQuestions = Math.max(m.correctCount + m.wrongCount, 1);

                if(m.totalQuestions===0) m.totalQuestions = m.answeredQuestions;

                m.accuracy = m.answeredQuestions? (m.correctCount/m.answeredQuestions):0;

                m.avgAnswerMs = m.answeredQuestions? (m.totalAnswerTimeMs / m.answeredQuestions):0;

                const unlocked = AchievementManager.evaluateAll(m, {mode:m.mode||'classic', isReplay:false});

                console.table(unlocked.map(a=>({id:a.id,tier:a.tier,name:a.name})));

                return unlocked;

            } catch(e){ console.warn('simulateAchievementTest error', e); return []; }

        }



        // ====== 即時成就：Tier<=3 增量解鎖 ======

        ;(function(){

            // 建立 toast 容器 & aria-live region（僅一次）

            function ensureAchievementRuntimeContainers(){

                if(!document.getElementById('achievementToastStack')){

                    const stack=document.createElement('div');

                    stack.id='achievementToastStack';

                    stack.className='fixed z-[65] top-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 pointer-events-none';

                    document.body.appendChild(stack);

                }

                if(!document.getElementById('achievementLiveRegion')){

                    const live=document.createElement('div');

                    live.id='achievementLiveRegion';

                    live.setAttribute('aria-live','polite');

                    live.setAttribute('aria-atomic','true');

                    live.className='sr-only';

                    document.body.appendChild(live);

                }

            }



            // 簡易 evalRule（複製自 AchievementManager 以避免全量 evaluateAll）

            function evalRule(rule, m){

                if(!rule) return false;

                switch(rule.type){

                    case 'metric': {

                        const v = m[rule.field]; const t = rule.value; const op=rule.op; if(v==null) return false;

                        switch(op){case '>=':return v>=t;case '>':return v>t;case '<=':return v<=t;case '<':return v<t;case '==':return v==t;default:return false;}

                    }

                    case 'and': return rule.children.every(r=>evalRule(r,m));

                    case 'or': return rule.children.some(r=>evalRule(r,m));

                    case 'custom': try {return !!rule.fn(m);} catch(_){return false;}

                }

                return false;

            }



            // Toast 佇列與上限

            const TOAST_MAX=4;

            let toastQueue=[]; // pending items (achievement objects)

            function showAchievementToast(a){

                            ensureAchievementRuntimeContainers();

                            const stack=document.getElementById('achievementToastStack');

                            if(!stack) return;

                            const active = Array.from(stack.children);

                            if(active.length >= TOAST_MAX){ toastQueue.push(a); return; }

                            const dt = (typeof getDisplayTier==='function') ? getDisplayTier(a) : 5;

                            const icon = (typeof getAchievementIcon==='function') ? getAchievementIcon(a) : '★';

                            const el = document.createElement('div');

                            el.className = `achievement-toast-minimal rarity-t${dt} flex items-center gap-2 px-3 py-2 rounded-lg font-bold text-sm shadow-lg border backdrop-blur animate-enter pointer-events-auto`;

                            el.innerHTML = `<div class="achv-icon w-6 h-6 flex items-center justify-center">${icon}</div><div class="truncate max-w-[160px]">${a.name}</div>`;

                            stack.appendChild(el);

                            try { const live=document.getElementById('achievementLiveRegion'); if(live) live.textContent = `成就解鎖：${a.name}`; } catch(_) {}

                            const lifetime = dt===1?4200: dt===2?3800: dt===3?3500: dt===4?3200:3000;

                            setTimeout(()=>{ el.classList.add('opacity-0','translate-y-1'); setTimeout(()=>{ try{el.remove();}catch(_){ } flushToastQueue(); },300); }, lifetime);

            }

            function flushToastQueue(){

                ensureAchievementRuntimeContainers();

                const stack=document.getElementById('achievementToastStack');

                if(!stack) return;

                while(toastQueue.length && stack.children.length < TOAST_MAX){

                    const next = toastQueue.shift();

                    showAchievementToast(next);

                }

            }



            // icon 映射（系列內共用；跨系列不重複）。新系統：T2–T5 梯隊同名同圖，T1 為特殊合成/高難度。

            const iconMap={

             // Any-mode：完美限定 Accuracy 梯隊（使用無提示正確率 accuracyNoHint）→ 臉盆（潔淨）

             any_acc_t5:'achv-basin', any_acc_t4:'achv-basin', any_acc_t3:'achv-basin', any_acc_t2:'achv-basin',

             // Any-mode：完美限定 平均速度 梯隊（奔跑不困倦）→ 兩個鞋印（放大且更像鞋印）

             any_speed_t5:'achv-footprints', any_speed_t4:'achv-footprints', any_speed_t3:'achv-footprints', any_speed_t2:'achv-footprints',

             // Any-mode：極速連鎖（無提示且 ?1.2s）→ 老鷹（更大更明顯）

             any_ultra_chain_t5:'achv-eagle', any_ultra_chain_t4:'achv-eagle', any_ultra_chain_t3:'achv-eagle', any_ultra_chain_t2:'achv-eagle',

             // Any-mode：連擊（Longest streak）→ 葡萄更多一點（更新符號）

             any_streak_t5:'achv-grapes-rich', any_streak_t4:'achv-grapes-rich', any_streak_t3:'achv-grapes-rich', any_streak_t2:'achv-grapes-rich',

             // Any-mode：低失誤長局（重建城牆）→ 有垛口的城牆

             any_low_miss_t5:'achv-battlement', any_low_miss_t4:'achv-battlement', any_low_miss_t3:'achv-battlement', any_low_miss_t2:'achv-battlement',

             // Classic：開局完美（初熟的果子）→ 蘋果

             c_opening_perfect_t5:'achv-apple', c_opening_perfect_t4:'achv-apple', c_opening_perfect_t3:'achv-apple', c_opening_perfect_t2:'achv-apple',

             // Classic：層數完美（無瑕無疵）→ 寶石（象徵無瑕）

             c_levels_perfect_t5:'achv-gem', c_levels_perfect_t4:'achv-gem', c_levels_perfect_t3:'achv-gem', c_levels_perfect_t2:'achv-gem',

             // Classic：倒數 N 關皆 Perfect（全副軍裝）→ 盔甲

             c_lastN_perfect_t5:'achv-armor', c_lastN_perfect_t4:'achv-armor', c_lastN_perfect_t3:'achv-armor', c_lastN_perfect_t2:'achv-armor',

             // Survival：存活時長（恆久忍耐）

             s_duration_t5:'achv-clock', s_duration_t4:'achv-clock', s_duration_t3:'achv-clock', s_duration_t2:'achv-clock',

             // Survival：中段時間庫存（警醒守望，60–90 秒區間）→ 盾牌（帶十字）

             s_time_band_60_90_t5:'achv-crossshield', s_time_band_60_90_t4:'achv-crossshield', s_time_band_60_90_t3:'achv-crossshield', s_time_band_60_90_t2:'achv-crossshield',

             // Survival：低段時間庫存（耐心等候，0–30 秒區間）→ 沙漏（等待）

             s_time_band_0_30_t5:'achv-hourglass2', s_time_band_0_30_t4:'achv-hourglass2', s_time_band_0_30_t3:'achv-hourglass2', s_time_band_0_30_t2:'achv-hourglass2',

             // Any：穩定如影（CV 梯隊）→ 高山（山寨高台意象）

             any_stability_t5:'achv-sinai', any_stability_t4:'achv-sinai', any_stability_t3:'achv-sinai', any_stability_t2:'achv-sinai',

             // T1 Specials（單一高難度/組合）

             // 聖靈充滿 → 十字架

             t1_chariot_fire:'achv-cross',

             // 分別為聖 → 資料夾（填色）

             t1_near_holy:'achv-folder',

             // 新增 T1 特別成就圖示

             t1_truth_and_love:'achv-gemcross',

             t1_rock_solid:'achv-anchor',

             t1_deer_for_streams:'achv-sea',

             // 明亮晨星 → 將於 getAchievementIcon 中使用星芒 + 星核組合強化細節

             t1_morning_star:'achv-starburst',

             t1_saints_endurance:'achv-dumbbell',

             t1_much_fruit:'achv-cherries',

             t1_blameless_worship:'achv-temple',

             // 成聖之路 → 鞋子（更貼近行走於聖潔道路）

             t1_kings_way:'achv-sandals',

             // 風平浪靜 → 小船安穩於海面

             t1_calm_sea:'achv-boat',

             t1_resurrection_power:'achv-heartpulse'

            };

            // 提供給審核工具使用（唯讀暴露）

            try { window.__iconMap = iconMap; } catch(_) {}

            let achievementSpriteLoadPromise = null;

            function ensureAchievementSpriteLoaded(){

                try {

                    if (document.getElementById('__achvSpriteHost')) return Promise.resolve(true);

                    if (achievementSpriteLoadPromise) return achievementSpriteLoadPromise;

                    const spriteUrl = (window && window.__ACHV_SPRITE_URL) ? String(window.__ACHV_SPRITE_URL) : './data/achievement-sprite.svg';

                    achievementSpriteLoadPromise = fetch(spriteUrl, { cache: 'force-cache' })

                        .then(res => {

                            if (!res || !res.ok) throw new Error('sprite fetch failed');

                            return res.text();

                        })

                        .then(svgText => {

                            if (!svgText || svgText.indexOf('<svg') === -1) throw new Error('invalid sprite payload');

                            if (document.getElementById('__achvSpriteHost')) return true;

                            const host = document.createElement('div');

                            host.id = '__achvSpriteHost';

                            host.setAttribute('aria-hidden', 'true');

                            host.style.position = 'absolute';

                            host.style.width = '0';

                            host.style.height = '0';

                            host.style.overflow = 'hidden';

                            host.innerHTML = svgText;

                            const parent = document.body || document.documentElement;

                            if (parent) parent.prepend(host);

                            return true;

                        })

                        .catch(() => false);

                    return achievementSpriteLoadPromise;

                } catch(_) {

                    return Promise.resolve(false);

                }

            }

            try { window.ensureAchievementSpriteLoaded = ensureAchievementSpriteLoaded; } catch(_) {}

            if (document.readyState === 'loading') {

                try { document.addEventListener('DOMContentLoaded', () => { try { ensureAchievementSpriteLoaded(); } catch(_) {} }, { once: true }); } catch(_) {}

            } else {

                try { ensureAchievementSpriteLoaded(); } catch(_) {}

            }

            function getAchievementIcon(a){

                const sym = iconMap[a.id];

                if(!sym) return '★';

                // dt: 顯示階級（T1 最稀有 → T5 最常見）

                const dt = (typeof getDisplayTier==='function')

                    ? getDisplayTier(a)

                    : (a && typeof a.tier==='number' ? (6 - Math.max(1, Math.min(5, a.tier))) : 5);

                                // 特製：明亮晨星（更強烈）— 大星芒 + 星核 + 外環輝光

                                if (a && a.id === 't1_morning_star') {

                                        return `<svg aria-hidden="true" class="w-7 h-7 achv-icon-svg t${dt}" viewBox="0 0 24 24">

    <defs>

        <radialGradient id="ms_glow" cx="50%" cy="50%" r="50%">

            <stop offset="0%" stop-color="currentColor" stop-opacity="0.55"/>

            <stop offset="60%" stop-color="currentColor" stop-opacity="0.15"/>

            <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>

        </radialGradient>

    </defs>

    <circle cx="12" cy="12" r="10" fill="url(#ms_glow)"/>

    <use href="#achv-starburst"></use>

    <g transform="translate(12 12) scale(0.72) translate(-12 -12)">

        <use href="#achv-star"></use>

    </g>

    </svg>`;

                                }

                                                // 特製：奔跑不困倦 — 兩個鞋印（更像鞋印、放大並加刻紋）

                                                if (a && /^any_speed_t[2-5]$/.test(a.id)) {

                                                                        return `<svg aria-hidden="true" class="w-7 h-7 achv-icon-svg t${dt}" viewBox="0 0 24 24">

                                    <use href="#achv-footprints"></use>

                                    <g stroke="currentColor" stroke-width="1" opacity=".85" fill="none">

                                        <!-- heel/tread accents for realism -->

                                        <path d="M8 16c1-1 2-1.4 3-1.2"/>

                                        <path d="M7.2 14.6c.7-.5 1.4-.7 2.1-.6"/>

                                        <path d="M14 8c1-1 2-1.4 3-1.2"/>

                                        <path d="M13.2 6.6c.7-.5 1.4-.7 2.1-.6"/>

                                    </g>

                                    <!-- enlarge heel patches -->

                                    <circle cx="8.8" cy="16.2" r="2.0" fill="currentColor" opacity=".28"/>

                                    <circle cx="14.8" cy="8.2" r="2.0" fill="currentColor" opacity=".28"/>

                                    </svg>`;

                                                                }

                        // 特製：成聖之路 — 單個雨鞋側面（置中，補齊鞋底）

                        if (a && a.id === 't1_kings_way') {

                            return `<svg aria-hidden="true" class="w-7 h-7 achv-icon-svg t${dt}" viewBox="0 0 24 24">

            <!-- rain boot side silhouette -->

            <path d="M9 4h6a1 1 0 0 1 1 1v7c3 0 5 1.6 5 4v2H7a2 2 0 0 1-2-2v-1c1 .4 2 .6 3 .6h6V5a1 1 0 0 0-1-1Z" fill="currentColor"/>

            <!-- sole fill to fix missing piece -->

            <rect x="7" y="17.3" width="14" height="1.4" fill="currentColor"/>

            <path d="M12 5v7" stroke="#fff" stroke-width="1" opacity=".35"/>

            <path d="M7 18h14" stroke="#fff" stroke-width="1" opacity=".6"/>

            </svg>`;

                        }

                                                // 特製：聖徒忍耐 — 放大

                        if (a && a.id === 't1_saints_endurance') {

                            return `<svg aria-hidden="true" class="w-7 h-7 achv-icon-svg t${dt}">

            <use href="#achv-dumbbell"></use>

            <!-- bar highlight lines -->

            <g stroke="currentColor" stroke-width=".8" opacity=".6" fill="none">

            <path d="M7 12h2"/>

            <path d="M15 12h2"/>

            </g>

            </svg>`;

                        }

                // 特製：如鷹展翅 — 老鷹剪影（更像老鷹）

            if (a && /^any_ultra_chain_t[2-5]$/.test(a.id)) {

                return `<svg aria-hidden="true" class="w-7 h-7 achv-icon-svg t${dt}" viewBox="0 0 24 24">

            <path d="M3 13c3-3 6-4 9-4s6 1 9 4h-3l-2 2-4 1-4-1-2-2H3Z" fill="currentColor"/>

            <!-- white neck patch -->

            <path d="M12.6 10.2c1 .2 1.8.6 2.4 1.2c-.8.2-1.6.2-2.4 0Z" fill="#fff" opacity=".9"/>

            <circle cx="14.5" cy="10" r=".4" fill="#fff" opacity=".9"/>

            <path d="M15.2 10.4l1 .5l-1 .5" stroke="#fff" stroke-width=".8" opacity=".85" fill="none"/>

            </svg>`;

            }

                                // 特製：耐心等候 — 透明外框 + 白色粉末（微縮）

                                if (a && /^s_time_band_0_30_t[2-5]$/.test(a.id)) {

                                                        return `<svg aria-hidden="true" class="w-6 h-6 achv-icon-svg t${dt}" viewBox="0 0 24 24">

                    <!-- frame -->

                    <g stroke="currentColor" stroke-width="1" fill="none" opacity=".95">

                        <path d="M7 5h10"/>

                        <path d="M7 19h10"/>

                        <path d="M7 7c3 3 7 3 10 0"/>

                        <path d="M7 17c3-3 7-3 10 0"/>

                    </g>

                    <!-- white powder -->

                    <path d="M9.3 9.2h5.4l-2.7 1.6Z" fill="#fff" opacity=".9"/>

                    <path d="M9 15h6l-3 2Z" fill="#fff" opacity=".9"/>

                    <path d="M12 11v2.2" stroke="#fff" stroke-width="1" opacity=".8"/>

                    </svg>`;

                                }

                                // 特製：無瑕無疵 — 鑽石刻面加強（外框置於最上層）

                                if (a && /^c_levels_perfect_t[2-5]$/.test(a.id)) {

                                                        return `<svg aria-hidden="true" class="w-7 h-7 achv-icon-svg t${dt}" viewBox="0 0 24 24">

                    <!-- inner facets first -->

                    <path d="M7 4l5 16l5-16" fill="none" stroke="#ffffff" stroke-width="1" opacity=".92"/>

                    <path d="M3 10h18" fill="none" stroke="#ffffff" stroke-width="1" opacity=".92"/>

                    <path d="M9 4l-3 6m12-6l3 6" fill="none" stroke="#ffffff" stroke-width="1" opacity=".92"/>

                    <!-- outer border on top -->

                    <path d="M7 4h10l4 6l-9 10L3 10l4-6Z" fill="none" stroke="currentColor" stroke-width="1"/>

                    </svg>`;

                                }

                                // 特製：分別為聖（資料夾填色）

                                if (a && a.id === 't1_near_holy') {

                                        return `<svg aria-hidden="true" class="w-6 h-6 achv-icon-svg t${dt}" viewBox="0 0 24 24">

    <use href="#achv-folder"></use>

    <rect x="3" y="7" width="18" height="12" rx="2" fill="currentColor" opacity=".25"/>

    </svg>`;

                                }

                                // 特製：連擊（葡萄枝子放大且置中微調）

                                if (a && /^any_streak_t[2-5]$/.test(a.id)) {

                                                        return `<svg aria-hidden="true" class="w-7 h-7 achv-icon-svg t${dt}" viewBox="0 0 24 24">

    <g transform="translate(12 12) scale(1.15) translate(-12 -12)">

        <g transform="translate(0.6,0.6)"><use href="#achv-grapes-rich"></use></g>

    </g>

</svg>`;

                                }

                                // 特製：風平浪靜（小船加旗）

                                if (a && a.id === 't1_calm_sea') {

                                                        return `<svg aria-hidden="true" class="w-6 h-6 achv-icon-svg t${dt}" viewBox="0 0 24 24">

    <use href="#achv-boat"></use>

    <!-- mast + flag overlay -->

    <path d="M12 6v5" stroke="currentColor" stroke-width="1"/>

    <path d="M12 7l2 1l-2 1Z" fill="currentColor"/>

</svg>`;

                                }

                                // 特製：初熟果子（蘋果加色塊高光）

                                if (a && /^c_opening_perfect_t[2-5]$/.test(a.id)) {

                                                        return `<svg aria-hidden="true" class="w-7 h-7 achv-icon-svg t${dt}" viewBox="0 0 24 24">

    <use href="#achv-apple"></use>

                    <circle cx="12" cy="13" r="5.2" fill="currentColor" opacity=".26"/>

                    <ellipse cx="10.2" cy="10.8" rx="2.8" ry="1.5" fill="#fff" opacity=".45"/>

                    <!-- leaf/stem highlight -->

                    <path d="M14 8c.8-.4 1.4-.8 1.8-1.2" stroke="#fff" stroke-width="1" opacity=".6" fill="none"/>

    </svg>`;

                                }

                if(sym.startsWith('achv-')) return `<svg aria-hidden="true" class="w-6 h-6 achv-icon-svg t${dt}"><use href="#${sym}"></use></svg>`;

                return sym; // fallback legacy emoji path if any

            }

            // 暴露給其他模組使用（例如勳章一覽），避免顯示 '★'

            try { window.getAchievementIcon = getAchievementIcon; } catch(_) {}

            // 稀有度顯示邏輯：T1 最稀有，T5 最常見。

            // 優先採用物件上的 displayTier（1..5），否則將內部 tier（1=最常見..5=最稀有）映射為顯示等級 dt（T1..T5）：

            // dt = 6 - clamp(tier,1,5)。

            // 也就是說：tier=5 → T1、4 → T2、3 → T3、2 → T4、1 → T5。

            function getDisplayTier(obj){

                if (obj && typeof obj.displayTier === 'number') {

                    const dt = Math.max(1, Math.min(5, obj.displayTier|0));

                    return dt;

                }

                const t = (obj && typeof obj.tier==='number') ? obj.tier : 1;

                return 6 - Math.max(1, Math.min(5, t));

            }

            try { window.getDisplayTier = getDisplayTier; } catch(_) {}



            // 對外：供 recordAnswer / survivalTick / levelComplete 觸發

            window.evaluateRealtimeAchievements = function(){

                if(!gameMetrics) return;

                if(!gameState || gameState._replaySequence) return; // 重播不即時解鎖

                const mode = (gameMetrics.mode==='survival') ? 'survival' : 'classic';

                // 初始化已解鎖集合（僅本局即時）

                if(!gameState._rtAchUnlocked) gameState._rtAchUnlocked=new Set();

                // 某些需「最終狀態」或容易造成突兀的成就，避免即時發放：

                // - no_hint, flawless, 全程/每層完美

                // - 速度相關（平均/單題極速）：c_speed_hunter, c_speed_fury, c_fastest_1500

                const denyRealtime = (id,a)=> {

                    if (a && a.realtime===false) return true;

                    // 允許葡萄枝子與如鷹展翅在遊戲中提示，其餘需最終狀態或干擾節奏者排除

                    if (/^any_streak_t[2-5]$/.test(id)) return false;

                    if (/^any_ultra_chain_t[2-5]$/.test(id)) return false;

                    return /no_hint|flawless|perfect_all_levels|perfect_last_level|c_speed_hunter|c_speed_fury|c_fastest_1500/.test(id);

                };

                const pending=[]; // 收集此次要顯示的成就，稍作間隔避免一次爆量同時出現

                for(const a of AchievementManager.defs){

                    // 僅提示顯示等級 T5/T4/T3（排除 T2/T1）；避免受內部 tier 稀有度映射影響

                    try {

                        const dt = (typeof getDisplayTier === 'function') ? getDisplayTier(a) : 5;

                        if (dt < 3) continue;

                    } catch(_) { /* 安全回退：若無法取得顯示等級，預設允許 */ }

                    if(a.mode!=='any' && a.mode!==mode) continue;

                    if(gameState._rtAchUnlocked.has(a.id)) continue;

                    if(denyRealtime(a.id, a)) continue;

                    try {

                        if(evalRule(a.condition, gameMetrics)) {

                            gameState._rtAchUnlocked.add(a.id);

                            pending.push(a);

                        }

                    } catch(_) { /* ignore */ }

                }

                // 節奏化顯示：每個間隔 220ms 依序彈出，並加入速率限制避免短時間過多提示

                if(pending.length){

                    const now = Date.now();

                    const windowMs = 8000; // 8 秒視窗

                    const maxPerWindow = 2; // 8 秒內最多 2 個 toast

                    if(!Array.isArray(gameState._rtToastTs)) gameState._rtToastTs = [];

                    // 清理過期的時間戳

                    gameState._rtToastTs = gameState._rtToastTs.filter(t => (now - t) < windowMs);

                    const remaining = Math.max(0, maxPerWindow - gameState._rtToastTs.length);

                    const toShow = pending.slice(0, remaining);

                    toShow.forEach((a, i)=> setTimeout(()=>{

                        try{ showAchievementToast(a); gameState._rtToastTs.push(Date.now()); }catch(_){}

                    }, i*220));

                }

            }

            // Medal flash overlay (1.6s) with reduced-motion fallback

            function medalFlash(a){

                try {

                    // prefers-reduced-motion: no big animation, just brief highlight toast already covers; exit

                    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

                    ensureAchievementRuntimeContainers();

                    let layer=document.getElementById('achievementFlashLayer');

                    if(!layer){

                        layer=document.createElement('div');

                        layer.id='achievementFlashLayer';

                        layer.className='pointer-events-none fixed inset-0 z-[64] flex items-center justify-center';

                        document.body.appendChild(layer);

                    }

                    const wrap=document.createElement('div');

                    wrap.className='flash-medal will-change-transform select-none flex flex-col items-center gap-3 text-center';

                    const icon=getAchievementIcon(a);

                    wrap.innerHTML=`<div class=\"text-[64px] drop-shadow-lg w-[96px] h-[96px] flex items-center justify-center rounded-2xl bg-gradient-to-br from-white to-purple-50 border border-purple-200\">${icon.replace('w-6 h-6','w-14 h-14')}</div><div class=\"px-4 py-2 rounded-full text-sm font-extrabold bg-white/90 border border-purple-300 shadow\">${a.name}</div>`;

                    layer.appendChild(wrap);

                    // 若該成就對應視覺為 T3（互換後的天堂層），套用天堂雲霧與上帝光層

                    try{

                        const dt = (typeof getDisplayTier==='function') ? getDisplayTier(a) : 5;

                        if (dt === 3){

                            wrap.classList.add('rarity-t3');

                            const clouds = document.createElement('div'); clouds.className='heaven-clouds';

                            clouds.style.setProperty('--cloudDurL', (10 + Math.random()*3).toFixed(2)+'s');

                            clouds.style.setProperty('--cloudDurR', (11 + Math.random()*3).toFixed(2)+'s');

                            // 雲帶 2~3 層

                            const bandCount = 2 + Math.floor(Math.random()*2);

                            for(let bi=0; bi<bandCount; bi++){

                                const b=document.createElement('div'); b.className='cloud-band cb'+(bi+1);

                                const topPct = 12 + (bi+0.5)*(60/(bandCount));

                                b.style.top = topPct+'%';

                                b.style.setProperty('--cbDur', (11 + Math.random()*3).toFixed(2)+'s');

                                b.style.setProperty('--cbDelay', (Math.random()*1.2).toFixed(2)+'s');

                                clouds.appendChild(b);

                            }

                            wrap.insertBefore(clouds, wrap.firstChild);

                            const rays = document.createElement('div'); rays.className='god-rays';

                            const n = 3 + Math.floor(Math.random()*3);

                            for(let i=0;i<n;i++){

                                const r=document.createElement('div'); r.className='ray';

                                const left = Math.floor(8 + Math.random()*84);

                                const w = Math.floor(6 + Math.random()*12);

                                r.style.left = left+'%'; r.style.width = w+'%';

                                r.style.setProperty('--rDur', (5.2 + Math.random()*2.4).toFixed(2)+'s');

                                r.style.setProperty('--rDelay', (Math.random()*1.6).toFixed(2)+'s');

                                rays.appendChild(r);

                            }

                            wrap.insertBefore(rays, wrap.firstChild);

                        }

                    }catch(_){}

                    // initial style

                    wrap.style.opacity='0';

                    wrap.style.transform='scale(.6) translateY(20px)';

                    requestAnimationFrame(()=>{

                        wrap.style.transition='transform .5s cubic-bezier(.22,.9,.3,1), opacity .5s ease';

                        wrap.style.opacity='1';

                        wrap.style.transform='scale(1) translateY(0)';

                    });

                    // hold then exit

                    setTimeout(()=>{

                        wrap.style.transition='transform .4s ease, opacity .4s ease';

                        wrap.style.opacity='0';

                        wrap.style.transform='scale(.85) translateY(-10px)';

                        setTimeout(()=>{ try { wrap.remove(); if(layer.childElementCount===0) layer.remove(); } catch(_){} }, 420);

                    }, 1200); // visible ~1.2s + enter/exit ~0.8s

                } catch(_) {}

            }

        })();



        // ====== 成就定義 + 類別 / 門檻集中化 ======

        ;(function defineAchievements(){

            const ACHIEVEMENT_THRESHOLDS = {

                classic:{

                    warmStartFirstFive:4,

                    streak8:8, streak10:10, streak15:15, streak20:20, streak25:25,

                    avgMsSpeedHunter:6000, avgMsSpeedFury:4500, avgMsLightningFlawless:5000,

                    avgMsUnder3500:3500,

                    fastestAnswerMs1500:1500,

                    accuracy90:0.90, accuracy92:0.92, accuracy95:0.95, accuracy98:0.98,

                    answerStdDevMsLow:1200,

                    maxConsecutivePerfect:3,

                    flawlessMinQuestions:10,

                    guardianMaxWrong:2,

                    minAnswered15:15,

                    minAnswered20:20,

                    minAnswered25:25,

                },

                survival:{

                    survive60:60, survive90:90, survive150:150, survive180:180, survive200:200, survive220:220, survive300:300, survive360:360,

                    maxTime80:80, maxTime100:100, maxTime120:120,

                    nearDeathRecoveries1:1, nearDeathRecoveries2:2, nearDeathRecoveries3:3,

                    phoenixRecoveries:2,

                    ultraFastCorrect:5, ultraFastChain7:7,

                    clocksmithStdDev:12, lowVarianceStdDev:8,

                    speedPowerAvgMs:3800, speedPowerAccuracy:0.88,

                    legendAccuracy:0.85,

                    accuracy88:0.88, accuracy90:0.90,

                    avgMsUnder3500:3500,

                },

                shared:{},

                any:{

                    // Accuracy progression

                    acc85:0.85, acc90:0.90, acc92:0.92, acc95:0.95, acc98:0.98,

                    // Average answer time progression (ms)

                    avg6500:6500, avg5500:5500, avg4500:4500, avg3500:3500, avg3000:3000,

                    // Streak progression

                    streak5:5, streak10:10, streak15:15, streak20:20,

                    // No-hint answered thresholds

                    noHint10:10, noHint20:20, noHint30:30,

                    // Answered count progression

                    answered10:10, answered20:20, answered30:30, answered50:50,

                    // Flawless counts (min answered gate to avoid trivial runs)

                    flawless10:10, flawless20:20, flawless30:30,

                    // Fastest single answer thresholds

                    fast2500:2500, fast2000:2000, fast1500:1500,

                    // Ultra-fast correct chain

                    chain3:3, chain5:5, chain7:7,

                    // Answer time stddev low

                    std1800:1800, std1200:1200, std900:900,

                    // Warm start

                    warm4:4, warm5:5,

                    // Low miss constraints for longer runs

                    lowMiss20_1:{ minAnswered:20, maxWrong:1 },

                    lowMiss30_2:{ minAnswered:30, maxWrong:2 }

                }

            };

            window.ACHIEVEMENT_THRESHOLDS = ACHIEVEMENT_THRESHOLDS;

            const D = AchievementManager.def; const T = ACHIEVEMENT_THRESHOLDS;

            // 新成就系統（T1..T5）：

            // - T2–T5 為同名同圖的「梯隊系列」，提供 groupKey 與 rung（2..5，數字越大越高階），顯示以 displayTier 直接對應 T2..T5。

            // - T1 為特殊/複合高難度，獨立命名。

            // - 速度/正確率一律採「無提示且正確」的完美限定統計（avgPerfectAnswerMs、accuracyNoHint、fastestPerfectAnswerMs）。



            // 工具：顯示階級對應（T2..T5 對應 2..5，T1 對應 1）

            const DT = (n)=> Math.max(1, Math.min(5, n|0));



            // Any — AccuracyNoHint 梯隊（同名：聖潔器皿），僅結算判定

            // 規則：結算時 完美命中率 ? 60/70/80/90%

            // 生存模式額外樣本門檻（以題數近似波數，假設每關?4題）：至少到 2/4/6/8 關 -> 8/16/24/32 題

            // 備註：一般模式採用全域 gate (answered?5) 即可，無額外樣本限制。

            D({ id:'any_acc_t5', mode:'any', name:'聖潔器皿', desc:'完美限定 命中率60%（生存2關）', displayTier:5, groupKey:'ladder_any_acc', rung:2, realtime:false,

                condition:{ type:'custom', fn:m=> {

                    const acc = (m.accuracyNoHint||0) >= 0.60;

                    if(!acc) return false;

                    if(m.mode==='survival'){

                        const completedWaves = (m.survivalCompletedWaves|0);

                        return completedWaves >= 2;

                    }

                    return true;

                } } });

            D({ id:'any_acc_t4', mode:'any', name:'聖潔器皿', desc:'完美限定 命中率70%（生存4關）', displayTier:4, groupKey:'ladder_any_acc', rung:3, realtime:false,

                condition:{ type:'custom', fn:m=> {

                    const acc = (m.accuracyNoHint||0) >= 0.70;

                    if(!acc) return false;

                    if(m.mode==='survival'){

                        const completedWaves = (m.survivalCompletedWaves|0);

                        return completedWaves >= 4;

                    }

                    return true;

                } } });

            D({ id:'any_acc_t3', mode:'any', name:'聖潔器皿', desc:'完美限定 命中率80%（生存6關）', displayTier:3, groupKey:'ladder_any_acc', rung:4, realtime:false,

                condition:{ type:'custom', fn:m=> {

                    const acc = (m.accuracyNoHint||0) >= 0.80;

                    if(!acc) return false;

                    if(m.mode==='survival'){

                        const completedWaves = (m.survivalCompletedWaves|0);

                        return completedWaves >= 6;

                    }

                    return true;

                } } });

            D({ id:'any_acc_t2', mode:'any', name:'聖潔器皿', desc:'完美限定 命中率90%（生存8關）', displayTier:2, groupKey:'ladder_any_acc', rung:5, realtime:false,

                condition:{ type:'custom', fn:m=> {

                    const acc = (m.accuracyNoHint||0) >= 0.90;

                    if(!acc) return false;

                    if(m.mode==='survival'){

                        const completedWaves = (m.survivalCompletedWaves|0);

                        return completedWaves >= 8;

                    }

                    return true;

                } } });



            // Any — 平均速度（firstTryAvgAnswerMs）梯隊（同名：奔跑不困倦）— 定義：完美答題=首擊命中（不論是否使用提示）

            // 新門檻（依使用者最新指示）：

            // T5: 完美題數?5 且 平均?8s

            // T4: 完美題數?10 且 平均?7s

            // T3: 完美題數?15 且 平均?6s

            // T2: 完美題數?20 且 平均?5s

            D({ id:'any_speed_t5', mode:'any', name:'奔跑不困倦', desc:'完美答題5題 且 平均作答7秒', displayTier:5, groupKey:'ladder_any_speed', rung:2, realtime:false,

                condition:{ type:'custom', fn:m=> (m.firstTryCorrectCount||0)>=5 && (m.firstTryAvgAnswerMs||0)>0 && m.firstTryAvgAnswerMs<=7000 } });

            D({ id:'any_speed_t4', mode:'any', name:'奔跑不困倦', desc:'完美答題10題 且 平均作答6.5秒', displayTier:4, groupKey:'ladder_any_speed', rung:3, realtime:false,

                condition:{ type:'custom', fn:m=> (m.firstTryCorrectCount||0)>=10 && (m.firstTryAvgAnswerMs||0)>0 && m.firstTryAvgAnswerMs<=6500 } });

            D({ id:'any_speed_t3', mode:'any', name:'奔跑不困倦', desc:'完美答題15題 且 平均作答5.5秒', displayTier:3, groupKey:'ladder_any_speed', rung:4, realtime:false,

                condition:{ type:'custom', fn:m=> (m.firstTryCorrectCount||0)>=15 && (m.firstTryAvgAnswerMs||0)>0 && m.firstTryAvgAnswerMs<=5500 } });

            D({ id:'any_speed_t2', mode:'any', name:'奔跑不困倦', desc:'完美答題20題 且 平均作答5秒', displayTier:2, groupKey:'ladder_any_speed', rung:5, realtime:false,

                condition:{ type:'custom', fn:m=> (m.firstTryCorrectCount||0)>=20 && (m.firstTryAvgAnswerMs||0)>0 && m.firstTryAvgAnswerMs<=5000 } });



            // Any — 極速連鎖（無提示且 ?1.2s，已在記錄處限制 no-hint）同名：如鷹展翅

            // 新門檻：T5 二連、T4 三連、T3 四連、T2 五連（皆 ?1.2s）

            D({ id:'any_ultra_chain_t5', mode:'any', name:'如鷹展翅', desc:'極速二連（1.2秒）', displayTier:5, groupKey:'ladder_any_ultra', rung:2, condition:{ type:'custom', fn:m=> (m.ultraFastCorrectMax||0)>=2 } });

            D({ id:'any_ultra_chain_t4', mode:'any', name:'如鷹展翅', desc:'極速三連（1.2秒）', displayTier:4, groupKey:'ladder_any_ultra', rung:3, condition:{ type:'custom', fn:m=> (m.ultraFastCorrectMax||0)>=3 } });

            D({ id:'any_ultra_chain_t3', mode:'any', name:'如鷹展翅', desc:'極速四連（1.2秒）', displayTier:3, groupKey:'ladder_any_ultra', rung:4, condition:{ type:'custom', fn:m=> (m.ultraFastCorrectMax||0)>=4 } });

            D({ id:'any_ultra_chain_t2', mode:'any', name:'如鷹展翅', desc:'極速五連（1.2秒）', displayTier:2, groupKey:'ladder_any_ultra', rung:5, condition:{ type:'custom', fn:m=> (m.ultraFastCorrectMax||0)>=5 } });



            // Any — 連擊梯隊（同名：葡萄枝子）

            // 葡萄枝子：依照畫面連擊條的最高數字即時解鎖（使用 metrics.maxComboReached）

            D({ id:'any_streak_t5', mode:'any', name:'葡萄枝子', desc:'連擊5', displayTier:5, groupKey:'ladder_any_streak', rung:2, condition:{ type:'metric', field:'maxComboReached', op:'>=', value:5 } });

            D({ id:'any_streak_t4', mode:'any', name:'葡萄枝子', desc:'連擊10', displayTier:4, groupKey:'ladder_any_streak', rung:3, condition:{ type:'metric', field:'maxComboReached', op:'>=', value:10 } });

            D({ id:'any_streak_t3', mode:'any', name:'葡萄枝子', desc:'連擊20', displayTier:3, groupKey:'ladder_any_streak', rung:4, condition:{ type:'metric', field:'maxComboReached', op:'>=', value:20 } });

            D({ id:'any_streak_t2', mode:'any', name:'葡萄枝子', desc:'連擊35', displayTier:2, groupKey:'ladder_any_streak', rung:5, condition:{ type:'metric', field:'maxComboReached', op:'>=', value:35 } });



            // Any — 低失誤平均（重建城牆）：與聖潔器皿一致採用「生存完成關數門檻」

            // 門檻：生存至少達 2/4/6/8 關（完成關，以 5 題一關計算），同時每關平均失誤 ? 4/3/2/1（闖關時沿用 classicAvg）

            D({ id:'any_low_miss_t5', mode:'any', name:'重建城牆', desc:'每關平均失誤4（生存2關）', displayTier:5, groupKey:'ladder_any_lowmiss', rung:2, realtime:false,

                condition:{ type:'custom', fn:m=> {

                    const avgOk = (m.avgMistakesPerLevel||0) <= 4;

                    if(!avgOk) return false;

                    if(m.mode==='survival'){

                        const completedWaves = (m.survivalCompletedWaves|0);

                        return completedWaves >= 2;

                    }

                    return true;

                } } });

            D({ id:'any_low_miss_t4', mode:'any', name:'重建城牆', desc:'每關平均失誤3（生存4關）', displayTier:4, groupKey:'ladder_any_lowmiss', rung:3, realtime:false,

                condition:{ type:'custom', fn:m=> {

                    const avgOk = (m.avgMistakesPerLevel||0) <= 3;

                    if(!avgOk) return false;

                    if(m.mode==='survival'){

                        const completedWaves = (m.survivalCompletedWaves|0);

                        return completedWaves >= 4;

                    }

                    return true;

                } } });

            D({ id:'any_low_miss_t3', mode:'any', name:'重建城牆', desc:'每關平均失誤2（生存6關）', displayTier:3, groupKey:'ladder_any_lowmiss', rung:4, realtime:false,

                condition:{ type:'custom', fn:m=> {

                    const avgOk = (m.avgMistakesPerLevel||0) <= 2;

                    if(!avgOk) return false;

                    if(m.mode==='survival'){

                        const completedWaves = (m.survivalCompletedWaves|0);

                        return completedWaves >= 6;

                    }

                    return true;

                } } });

            D({ id:'any_low_miss_t2', mode:'any', name:'重建城牆', desc:'每關平均失誤1（生存8關）', displayTier:2, groupKey:'ladder_any_lowmiss', rung:5, realtime:false,

                condition:{ type:'custom', fn:m=> {

                    const avgOk = (m.avgMistakesPerLevel||0) <= 1;

                    if(!avgOk) return false;

                    if(m.mode==='survival'){

                        const completedWaves = (m.survivalCompletedWaves|0);

                        return completedWaves >= 8;

                    }

                    return true;

                } } });



            // Classic — 初熟的果子（開局完美梯隊：前 N 層皆 0 錯）

            D({ id:'c_opening_perfect_t5', mode:'classic', name:'初熟果子', desc:'開局1關完美', displayTier:5, groupKey:'ladder_c_opening', rung:2, condition:{ type:'custom', fn:m=> Array.isArray(m.levelPerfectFlags) && m.levelPerfectFlags.length>=1 && !!m.levelPerfectFlags[0] } });

            D({ id:'c_opening_perfect_t4', mode:'classic', name:'初熟果子', desc:'開局2關完美', displayTier:4, groupKey:'ladder_c_opening', rung:3, condition:{ type:'custom', fn:m=> Array.isArray(m.levelPerfectFlags) && m.levelPerfectFlags.length>=2 && m.levelPerfectFlags[0] && m.levelPerfectFlags[1] } });

            D({ id:'c_opening_perfect_t3', mode:'classic', name:'初熟果子', desc:'開局3關完美', displayTier:3, groupKey:'ladder_c_opening', rung:4, condition:{ type:'custom', fn:m=> Array.isArray(m.levelPerfectFlags) && m.levelPerfectFlags.length>=3 && m.levelPerfectFlags[0] && m.levelPerfectFlags[1] && m.levelPerfectFlags[2] } });

            D({ id:'c_opening_perfect_t2', mode:'classic', name:'初熟果子', desc:'開局4關完美', displayTier:2, groupKey:'ladder_c_opening', rung:5, condition:{ type:'custom', fn:m=> { const f=m.levelPerfectFlags||[]; return f.length>=4 && f[0] && f[1] && f[2] && f[3]; } } });



            // Classic — 無瑕之路（達成完美關卡數：全局累計本局各層 0 錯的層數）

            D({ id:'c_levels_perfect_t5', mode:'classic', name:'無瑕無疵', desc:'本局完美關卡1', displayTier:5, groupKey:'ladder_c_levels', rung:2, condition:{ type:'custom', fn:m=> (m.levelsPerfectCount||0)>=1 } });

            D({ id:'c_levels_perfect_t4', mode:'classic', name:'無瑕無疵', desc:'本局完美關卡3', displayTier:4, groupKey:'ladder_c_levels', rung:3, condition:{ type:'custom', fn:m=> (m.levelsPerfectCount||0)>=3 } });

            D({ id:'c_levels_perfect_t3', mode:'classic', name:'無瑕無疵', desc:'本局完美關卡5', displayTier:3, groupKey:'ladder_c_levels', rung:4, condition:{ type:'custom', fn:m=> (m.levelsPerfectCount||0)>=5 } });

            D({ id:'c_levels_perfect_t2', mode:'classic', name:'無瑕無疵', desc:'本局完美關卡7', displayTier:2, groupKey:'ladder_c_levels', rung:5, condition:{ type:'custom', fn:m=> (m.levelsPerfectCount||0)>=7 } });



            // Survival — 恆久忍耐（以時長為主，門檻：T5?90s, T4?120s, T3?150s, T2?180s）

            D({ id:'s_duration_t5', mode:'survival', name:'恆久忍耐', desc:'存活90秒', displayTier:5, groupKey:'ladder_s_duration', rung:2, condition:{ type:'custom', fn:m=> (m.survivalDuration||0)>=90 } });

            D({ id:'s_duration_t4', mode:'survival', name:'恆久忍耐', desc:'存活120秒', displayTier:4, groupKey:'ladder_s_duration', rung:3, condition:{ type:'custom', fn:m=> (m.survivalDuration||0)>=120 } });

            D({ id:'s_duration_t3', mode:'survival', name:'恆久忍耐', desc:'存活150秒', displayTier:3, groupKey:'ladder_s_duration', rung:4, condition:{ type:'custom', fn:m=> (m.survivalDuration||0)>=150 } });

            D({ id:'s_duration_t2', mode:'survival', name:'恆久忍耐', desc:'存活180秒', displayTier:2, groupKey:'ladder_s_duration', rung:5, condition:{ type:'custom', fn:m=> (m.survivalDuration||0)>=180 } });



            // Survival — 警醒守望：計時在 60–90 秒區間的累計秒數（T5/T4/T3/T2: 50/75/100/125）

            D({ id:'s_time_band_60_90_t5', mode:'survival', name:'警醒守望', desc:'60–90秒區間累計50秒', displayTier:5, groupKey:'ladder_s_band_60_90', rung:2, realtime:false,

                condition:{ type:'metric', field:'timeInBand60to90', op:'>=', value:50 } });

            D({ id:'s_time_band_60_90_t4', mode:'survival', name:'警醒守望', desc:'60–90秒區間累計75秒', displayTier:4, groupKey:'ladder_s_band_60_90', rung:3, realtime:false,

                condition:{ type:'metric', field:'timeInBand60to90', op:'>=', value:75 } });

            D({ id:'s_time_band_60_90_t3', mode:'survival', name:'警醒守望', desc:'60–90秒區間累計100秒', displayTier:3, groupKey:'ladder_s_band_60_90', rung:4, realtime:false,

                condition:{ type:'metric', field:'timeInBand60to90', op:'>=', value:100 } });

            D({ id:'s_time_band_60_90_t2', mode:'survival', name:'警醒守望', desc:'60–90秒區間累計125秒', displayTier:2, groupKey:'ladder_s_band_60_90', rung:5, realtime:false,

                condition:{ type:'metric', field:'timeInBand60to90', op:'>=', value:125 } });



            // T1 特別成就（單一高難度 / 複合條件）

            D({ id:'t1_truth_and_love', mode:'any', name:'真理與慈愛', desc:'全題完美答題', displayTier:1, realtime:false,

                condition:{ type:'custom', fn:m=> {

                    const total = Math.max(0, Number(m.totalQuestions||0));

                    if (total <= 0) return false;

                    return (m.firstTryCorrectCount||0) >= total;

                } } });

            D({ id:'t1_rock_solid', mode:'any', name:'聖靈寶劍', desc:'完美答題40題 + 最快1.5秒', displayTier:1, realtime:false,

                condition:{ type:'custom', fn:m=> (m.firstTryCorrectCount||0) >= 40 && (m.fastestFirstTryAnswerMs||9999) <= 1500 } });

            D({ id:'t1_deer_for_streams', mode:'any', name:'如鹿切慕溪水', desc:'最大連擊?15，且其中5題2秒', displayTier:1, realtime:false,

                condition:{ type:'custom', fn:m=> {

                    // 1) 必須達到畫面最大連擊（combo 峰值）? 15

                    const maxCombo = m.maxComboReached|0;

                    if (maxCombo < 15) return false;

                    // 2) 從事件式時間軸中擷取「首次達成 15 連擊的那 15 題」區段

                    // 使用 perQuestionCorrectFlags 來界定連續正確題目

                    const times = Array.isArray(m.perQuestionTimesAll) ? m.perQuestionTimesAll : [];

                    const valids = Array.isArray(m.perQuestionValidFlags) ? m.perQuestionValidFlags : [];

                    const correctFlags = Array.isArray(m.perQuestionCorrectFlags) ? m.perQuestionCorrectFlags : [];

                    // 取首次達到 15 連續正確的區段起點

                    let curStart = -1, curLen = 0; let reached15Start = -1;

                    for (let i=0;i<correctFlags.length;i++){

                        if (valids[i] && !!correctFlags[i]){

                            if (curStart===-1) curStart = i;

                            curLen++;

                            if (curLen>=15){ reached15Start = curStart; break; }

                        } else { curStart = -1; curLen = 0; }

                    }

                    // 若從未達到 15 連（首擊命中連段），則不符

                    if (reached15Start === -1) return false;

                    const start = reached15Start;

                    const end = reached15Start + 15 - 1;

                    // 謹慎：確保索引在陣列長度內

                    if (start<0 || end>=times.length) return false;

                    // 3) 在該 15 題區間內，數出 ?2 秒的題數（以最終正確時間為準）

                    let fastCount = 0;

                    for (let i=start;i<=end;i++){

                        if (!valids[i]) continue;

                        if (!correctFlags[i]) continue; // 只計正確題

                        const t = times[i]||999999;

                        if (t <= 2000) fastCount++;

                    }

                    return fastCount >= 5;

                } } });

            D({ id:'t1_morning_star', mode:'classic', name:'明亮晨星', desc:'開局5關皆完美答題且均速5秒', displayTier:1, realtime:false,

                condition:{ type:'custom', fn:m=> {

                    const f = m.levelHead5QualifyFlags||[]; if(!Array.isArray(f) || f.length<5) return false;

                    // 需開局連續 5 關通過 head-5(?5s) 檢核

                    for(let i=0;i<5;i++){ if(!f[i]) return false; }

                    return true; } } });

            D({ id:'t1_saints_endurance', mode:'survival', name:'聖徒忍耐', desc:'存活240秒（未使用提示）', displayTier:1, realtime:false,

                condition:{ type:'custom', fn:m=> (m.survivalDuration||0) >= 240 && (m.hintsUsed||0) === 0 } });

            D({ id:'t1_much_fruit', mode:'classic', name:'多結果子', desc:'同局達成：開局完美(4) + 無瑕無疵(7)', displayTier:1, realtime:false,

                condition:{ type:'custom', fn:m=> (m.levelsPerfectCount||0) >= 7 && Array.isArray(m.levelPerfectFlags) && m.levelPerfectFlags.length>=4 && m.levelPerfectFlags[0] && m.levelPerfectFlags[1] && m.levelPerfectFlags[2] && m.levelPerfectFlags[3] } });

            D({ id:'t1_blameless_worship', mode:'any', name:'辛苦勞碌', desc:'平均作答3秒（生存8關）', displayTier:1, realtime:false,

                condition:{ type:'custom', fn:m=> {

                    if ((m.avgAnswerMs||99999) > 3000) return false;

                    if (m.mode==='survival') return (m.survivalCompletedWaves|0) >= 8;

                    return true;

                } } });



            // 新增 T1：闖關 1 項、生存 2 項

            // 闖關：王的大道（連續 3 關 Perfect 且頭五題均速 ?2.2s，並且本局 Perfect 樣本 ?20）

            D({ id:'t1_kings_way', mode:'classic', name:'成聖之路', desc:'連續3關完美答題且各關開局3題均速3秒', displayTier:1, realtime:false,

                condition:{ type:'custom', fn:m=> {

                    const f = m.levelPerfectFlags||[]; if(f.length<3) return false;

                    // 尋找任一連續 3 關 Perfect 的區段

                    for(let i=0;i<=f.length-3;i++){

                        if(f[i]&&f[i+1]&&f[i+2]){

                            const h3 = m.levelHead3QualifyFlags||[];

                            if (h3[i] && h3[i+1] && h3[i+2]) return true;

                        }

                    }

                    return false;

                } } });

            // 生存：風平浪靜（時間曲線穩定）

            D({ id:'t1_calm_sea', mode:'survival', name:'風平浪靜', desc:'存活210秒且時間波動低（6）', displayTier:1, realtime:false,

                condition:{ type:'custom', fn:m=> (m.survivalDuration||0)>=210 && (m.timeStdDev||999) <= 6 } });

            // 生存：復活的大能（瀕死多次回升）

            D({ id:'t1_resurrection_power', mode:'survival', name:'死裡復活', desc:'存活180秒且瀕死回升3次', displayTier:1, realtime:false,

                condition:{ type:'custom', fn:m=> (m.survivalDuration||0)>=180 && (m.nearDeathRecoveries||0) >= 3 } });



            // 山寨高台（任一模式）：每關錯誤上限 + 完美關卡下限

            D({ id:'any_stability_t5', mode:'any', name:'山寨高台', desc:'每關錯誤?3 且 完美關卡1', displayTier:5, groupKey:'ladder_any_stability', rung:2, realtime:false,

                condition:{ type:'custom', fn:m=> { if(!Array.isArray(m.levelMistakesList)||m.levelMistakesList.length===0) return false; const ok=m.levelMistakesList.every(x=>(x|0)<=3); return ok && (m.levelsPerfectCount||0)>=1; } } });

            D({ id:'any_stability_t4', mode:'any', name:'山寨高台', desc:'每關錯誤2 且 完美關卡2', displayTier:4, groupKey:'ladder_any_stability', rung:3, realtime:false,

                condition:{ type:'custom', fn:m=> { if(!Array.isArray(m.levelMistakesList)||m.levelMistakesList.length===0) return false; const ok=m.levelMistakesList.every(x=>(x|0)<=2); return ok && (m.levelsPerfectCount||0)>=2; } } });

            D({ id:'any_stability_t3', mode:'any', name:'山寨高台', desc:'每關錯誤?1 且 完美關卡3', displayTier:3, groupKey:'ladder_any_stability', rung:4, realtime:false,

                condition:{ type:'custom', fn:m=> { if(!Array.isArray(m.levelMistakesList)||m.levelMistakesList.length===0) return false; const ok=m.levelMistakesList.every(x=>(x|0)<=1); return ok && (m.levelsPerfectCount||0)>=3; } } });

            D({ id:'any_stability_t2', mode:'any', name:'山寨高台', desc:'每關錯誤=0 且 完美關卡4', displayTier:2, groupKey:'ladder_any_stability', rung:5, realtime:false,

                condition:{ type:'custom', fn:m=> { if(!Array.isArray(m.levelMistakesList)||m.levelMistakesList.length===0) return false; const ok=m.levelMistakesList.every(x=>(x|0)===0); return ok && (m.levelsPerfectCount||0)>=4; } } });



            // Classic 專屬 梯次（全副軍裝）：倒數 N 關皆 Perfect（T5?1..T2?4）

            D({ id:'c_lastN_perfect_t5', mode:'classic', name:'全副軍裝', desc:'倒數1關完美', displayTier:5, groupKey:'ladder_c_lastN', rung:2, realtime:false,

                condition:{ type:'custom', fn:m=> Array.isArray(m.levelPerfectFlags) && m.levelPerfectFlags.length>=1 && !!m.levelPerfectFlags[m.levelPerfectFlags.length-1] } });

            D({ id:'c_lastN_perfect_t4', mode:'classic', name:'全副軍裝', desc:'倒數2關完美', displayTier:4, groupKey:'ladder_c_lastN', rung:3, realtime:false,

                condition:{ type:'custom', fn:m=> { const f=m.levelPerfectFlags||[]; if(f.length<2) return false; return f[f.length-1] && f[f.length-2]; } } });

            D({ id:'c_lastN_perfect_t3', mode:'classic', name:'全副軍裝', desc:'倒數3關完美', displayTier:3, groupKey:'ladder_c_lastN', rung:4, realtime:false,

                condition:{ type:'custom', fn:m=> { const f=m.levelPerfectFlags||[]; if(f.length<3) return false; return f[f.length-1] && f[f.length-2] && f[f.length-3]; } } });

            D({ id:'c_lastN_perfect_t2', mode:'classic', name:'全副軍裝', desc:'倒數4關完美', displayTier:2, groupKey:'ladder_c_lastN', rung:5, realtime:false,

                condition:{ type:'custom', fn:m=> { const f=m.levelPerfectFlags||[]; if(f.length<4) return false; return f[f.length-1] && f[f.length-2] && f[f.length-3] && f[f.length-4]; } } });



            // Survival 專屬 梯次（耐心等候）：計時在 0–30 秒區間的累計秒數（T5/T4/T3/T2: 45/60/75/90）

            D({ id:'s_time_band_0_30_t5', mode:'survival', name:'耐心等候', desc:'0–30秒區間累計45秒', displayTier:5, groupKey:'ladder_s_band_0_30', rung:2, realtime:false,

                condition:{ type:'metric', field:'timeInBand0to30', op:'>=', value:45 } });

            D({ id:'s_time_band_0_30_t4', mode:'survival', name:'耐心等候', desc:'0–30秒區間累計60秒', displayTier:4, groupKey:'ladder_s_band_0_30', rung:3, realtime:false,

                condition:{ type:'metric', field:'timeInBand0to30', op:'>=', value:60 } });

            D({ id:'s_time_band_0_30_t3', mode:'survival', name:'耐心等候', desc:'0–30秒區間累計75秒', displayTier:3, groupKey:'ladder_s_band_0_30', rung:4, realtime:false,

                condition:{ type:'metric', field:'timeInBand0to30', op:'>=', value:75 } });

            D({ id:'s_time_band_0_30_t2', mode:'survival', name:'耐心等候', desc:'0–30秒區間累計90秒', displayTier:2, groupKey:'ladder_s_band_0_30', rung:5, realtime:false,

                condition:{ type:'metric', field:'timeInBand0to30', op:'>=', value:90 } });



            // T1 Specials（可擇一定義，避免與梯隊重疊）

            // 聖靈充滿：改為 Any 類別；文案更新（條件不變）

            D({ id:'t1_chariot_fire', mode:'any', name:'聖靈充滿', desc:'未使用提示 且每關平均失誤1', displayTier:1, realtime:false,

                condition:{ type:'custom', fn:m=> (m.hintsUsed||0) === 0 && (m.avgMistakesPerLevel||0) <= 1 } });

            // 分別為聖：完美限定 命中率?99% 且 ?25題

            // 分別為聖（調整後）：完美命中?97%（?24題）且完美平均作答5秒

            // 目的：與「真理與慈愛」（全程完美答題）區隔，增加速度要求

            D({ id:'t1_near_holy', mode:'any', name:'分別為聖', desc:'完美限定 命中97% 平均5秒', displayTier:1, realtime:false,

                condition:{ type:'custom', fn:m=>

                    (m.noHintAnsweredCount||0) >= 24 &&

                    (m.accuracyNoHint||0) >= 0.97 &&

                    (m.avgPerfectAnswerMs||0) > 0 && (m.avgPerfectAnswerMs||0) <= 5000

                } });



            // 類別推導

            function deriveCategory(a){

                if(a.mode==='survival') return 'survival';

                if(a.mode==='any') return 'any';

                return 'classic';

            }

            const categoryTotals={all:0,classic:0,survival:0,any:0};

            for(const a of AchievementManager.defs){ a.category=deriveCategory(a); categoryTotals[a.category]++; categoryTotals.all++; }

            window.__achievementCategoryTotals = categoryTotals;



            function updateAchievementTabCounts(unlocked){

                const totals=window.__achievementCategoryTotals||{}; const arr=unlocked||[];

                const unlockedCounts={all:arr.length,classic:0,survival:0,any:0};

                arr.forEach(a=>{ unlockedCounts[a.category] = (unlockedCounts[a.category]||0)+1; });

                const tabs=document.getElementById('achievementTabs'); if(!tabs) return;

                tabs.querySelectorAll('button[data-achv-cat]').forEach(btn=>{

                    const cat=btn.getAttribute('data-achv-cat'); const span=btn.querySelector('[data-role="count"]');

                    if(span){ const tot=totals[cat]||0; const got=unlockedCounts[cat]||0; span.textContent= tot?` ${got}/${tot}`:` ${got}`; }

                });

            }

            window.updateAchievementTabCounts = updateAchievementTabCounts;

            function setupAchievementTabs(){

                const tabs=document.getElementById('achievementTabs'); if(!tabs||tabs.__wired) return; tabs.__wired=true;

                tabs.addEventListener('click',e=>{ const b=e.target.closest('button[data-achv-cat]'); if(!b) return; const cat=b.getAttribute('data-achv-cat'); window._achvSelectedCat=cat; tabs.querySelectorAll('button[data-achv-cat]').forEach(x=>{ const act=x===b; x.classList.toggle('bg-purple-600',act); x.classList.toggle('text-white',act); x.classList.toggle('shadow',act); x.classList.toggle('bg-purple-100',!act); x.classList.toggle('text-purple-700',!act); }); try{ renderAchievementsIntoModal(); }catch(_){} });

                updateAchievementTabCounts([]);

            }

            setTimeout(setupAchievementTabs,0);



            // 開發輔助：在瀏覽器直接套用 tier map（不會持久化），便於預覽（可選用）

            window.applyAchievementTierMap = function(map){

                try{

                    if(!map) return;

                    (AchievementManager.defs||[]).forEach(a=>{ if(Object.prototype.hasOwnProperty.call(map, a.id)) a.tier = map[a.id]; });

                    try { if(typeof updateCatalogTabCounts==='function') updateCatalogTabCounts([]); } catch(_){}

                    try { if(typeof renderAchievementsCatalog==='function') renderAchievementsCatalog(); } catch(_){}

                }catch(e){ console.warn('applyAchievementTierMap failed', e); }

            }



            // 圖示檢查工具：列出沒有對應圖示的成就 ID（應避免出現 '★'）

            window.checkAchievementIcons = function(){

                try{

                    const defs = (AchievementManager && AchievementManager.defs) ? AchievementManager.defs : [];

                    const missing = [];

                    for(const a of defs){

                        const html = (typeof window.getAchievementIcon==='function') ? window.getAchievementIcon(a) : '★';

                        if (html === '★') missing.push(a.id);

                    }

                    console.log('[icons] missing:', missing);

                    return missing;

                }catch(e){ console.warn('checkAchievementIcons failed', e); return []; }

            }



            // 審核工具：檢查「同系列共用、跨系列不重複」的圖示規範

            // 用法：在瀏覽器主控台呼叫 auditIconUniqueness()

            // 輸出：

            //  - duplicates: 每個圖示對應到的所有成就 ID（僅列出數量>1者）

            //  - violations: 違反規範的圖示與 ID

            //  - ok: 是否通過檢查（無違規）

            window.auditIconUniqueness = function(){

                try{

                    const defs = (AchievementManager && AchievementManager.defs) ? AchievementManager.defs : [];

                    const byIcon = {};

                    for(const a of defs){

                        // 優先使用 window.__iconMap；退而求其次以 getAchievementIcon() 解析 <use href="#achv-...">

                        let sym = '';

                        try { if (window.__iconMap && typeof window.__iconMap === 'object') sym = window.__iconMap[a.id] || ''; } catch(_) {}

                        if(!sym && typeof window.getAchievementIcon === 'function'){

                            try{

                                const html = window.getAchievementIcon(a) || '';

                                const m = /<use\s+href="#([^"]+)"/i.exec(html);

                                if(m && m[1]) sym = m[1];

                            }catch(_){ /* ignore */ }

                        }

                        if(!sym || typeof sym !== 'string') continue;

                        if(!byIcon[sym]) byIcon[sym] = [];

                        byIcon[sym].push(a.id);

                    }

                    // 允許在同一「進階系列」重複使用的白名單（以圖示為鍵）

                    const allow = {

                        'achv-target2': [/^any_accuracy_/],

                        'achv-avgpace': [/^any_avg_under_/],

                        'achv-grapes': [/^any_streak_/],

                        'achv-tablets': [/^any_no_hint_/],

                        'achv-basket': [/^any_answered_/],

                        'achv-gemcross': [/^any_flawless_/],

                        'achv-stopwatch': [/^any_fastest_/],

                        'achv-boltchain': [/^any_ultrafast_chain_/],

                        'achv-metronome': [/^any_low_stddev_/, /^any_stability_t[245]$/],

                        'achv-lamp': [/^any_warm_start_/],

                        'achv-basin': [/^any_acc_t[245]$/],

                        'achv-leg': [/^any_speed_t[245]$/],

                        'achv-eagle': [/^any_ultra_chain_t[2-5]$/],

                        'achv-clock': [/^s_60s$/, /^s_90s$/, /^s_150s$/, /^s_300s$/, /^s_360s_master$/, /^s_duration_t[245]$/],

                        'achv-sundial': [/^s_time_/, /^s_time_band_60_90_t[245]$/],

                        'achv-reticle': [/^s_accuracy_/, /^s_220s_guard$/],

                        'achv-gears': [/^s_clocksmith$/, /^s_low_variance$/, /^s_time_band_0_30_t[245]$/],

                        'achv-hourglass2': [/^s_steady_rise$/],

                        'achv-breastplate': [/^s_no_rescue_/, /^c_lastN_perfect_t[245]$/],

                        'achv-dove': [/^s_recover_40$/, /^s_phoenix$/, /^s_three_recoveries$/],

                        'achv-ark': [/^s_legend_eternal$/],

                        'achv-menorah': [/^c_perfect_level_one$/, /^c_double_perfect_levels$/, /^c_three_perfect_levels$/],

                        'achv-temple': [/^c_perfect_all_levels$/],

                        'achv-linkedrings': [/^c_two_consecutive_perfect$/, /^c_three_consecutive_perfect$/, /^c_four_consecutive_perfect$/],

                        'achv-scroll': [/^c_perfect_first_two_levels$/, /^c_perfect_first_three_levels$/, /^c_perfect_last_two_levels$/, /^c_perfect_last_three_levels$/, /^c_opening_perfect_t[245]$/],

                        'achv-olivebranch': [/^c_first_last_perfect$/],

                        'achv-banner': [/^c_rebound_perfect$/],

                        'achv-ribbon': [/^c_sandwich_perfect$/],

                        'achv-crown2': [/^c_consec_perfect_2_and_last$/],

                        'achv-steps': [/^c_reach_level_3$/, /^c_reach_level_4$/, /^c_reach_level_5$/],

                        'achv-laurel': [/^c_perfect_majority_levels$/, /^c_all_but_one_perfect$/],

                        'achv-apple': [/^c_opening_perfect_t[245]$/],

                        'achv-wingroad': [/^c_levels_perfect_t[245]$/],

                        // New icon reuse allow-list for updated series

                        'achv-footprints': [/^any_speed_t[245]$/],

                        'achv-grapes-rich': [/^any_streak_t[245]$/],

                        'achv-battlement': [/^any_low_miss_t[245]$/],

                        'achv-bridge': [/^c_levels_perfect_t[245]$/],

                        'achv-armor': [/^c_lastN_perfect_t[245]$/]

                    };

                    const duplicates = {};

                    const violations = {};

                    Object.entries(byIcon).forEach(([sym, ids])=>{

                        if(ids.length<=1) return; // 唯一無需檢查

                        duplicates[sym] = ids.slice();

                        const rules = allow[sym] || [];

                        // 沒有白名單但卻有重覆使用 → 視為違規

                        if(rules.length===0){ violations[sym] = ids.slice(); return; }

                        // 有白名單：每個 ID 至少需符合其中一條

                        const bad = ids.filter(id=> !rules.some(rx=> rx.test(id)) );

                        if(bad.length) violations[sym] = bad;

                    });

                    const ok = Object.keys(violations).length===0;

                    const summary = { ok, duplicates, violations };

                    if(ok) console.log('%c[icons] uniqueness OK','color:#16a34a', summary);

                    else console.warn('[icons] uniqueness VIOLATIONS', summary);

                    return summary;

                }catch(e){ console.warn('auditIconUniqueness failed', e); return { ok:false, error:e && e.message } }

            }

        })();



        // ====== 成就資料紀錄與分析（本地） ======

        ;(function achievementAnalytics(){

            const LS_KEY='achvRuns_v1';

            function loadRuns(){ try { return JSON.parse(localStorage.getItem(LS_KEY)||'[]'); } catch(_){ return []; } }

            function saveRuns(arr){ try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch(_){} }

            window.logAchievementRun = function(metrics, unlocked, mode){

                if(!metrics) return; // unlocked 可能為空陣列

                const runs = loadRuns();

                runs.push({ ts:Date.now(), mode:mode||metrics.mode||'classic', answered:metrics.answeredQuestions||0, accuracy:metrics.accuracy||0, longestStreak:metrics.longestStreak||0, wrong:metrics.wrongCount||0, avgMs:metrics.avgAnswerMs||0, survivalDuration:metrics.survivalDuration||0, maxTime:metrics.maxTime||0, maxComboReached: metrics.maxComboReached||0, unlockIds:(unlocked||[]).map(a=>a.id) });

                // 限制容量 100

                while(runs.length>100) runs.shift();

                saveRuns(runs);

            };

            window.analyzeAchievementStats = function(){

                const runs = loadRuns();

                const freq = {}; const appear = {}; const modeDist={classic:0,survival:0};

                runs.forEach(r=>{ modeDist[r.mode]=(modeDist[r.mode]||0)+1; r.unlockIds.forEach(id=>{ freq[id]=(freq[id]||0)+1; }); r.unlockIds.forEach(id=>{ appear[id]=true; }); });

                const totalRuns = runs.length || 1;

                const defs = AchievementManager.defs || [];

                const summary = defs.map(d=>({ id:d.id, name:d.name, tier:d.tier, mode:d.mode, category:d.category, unlockRate: (freq[d.id]||0)/totalRuns }));

                summary.sort((a,b)=> a.unlockRate-b.unlockRate);

                return { totalRuns, modeDist, summary };

            };

        })();



        // ====== 成就資料上傳（Supabase）與再平衡建議 ======

        ;(function achievementTelemetry(){

            // Unified singleton: get or create one Supabase client for the whole app

            if (!window.getSupabaseClient){

                window.getSupabaseClient = function(){

                    try{

                        const cfg = window.SUPABASE_CONFIG; if(!cfg) return null;

                        if(!(window.supabase && typeof window.supabase.createClient==='function')) return null;

                        if (window.__supabaseClient) return window.__supabaseClient;

                        const baseOpts = cfg.options || {};

                        const opts = cfg.projectTag

                            ? {

                                ...baseOpts,

                                auth: { persistSession: false, storageKey: 'bc_auth', ...(baseOpts.auth||{}) },

                                global: {

                                    ...(baseOpts.global || {}),

                                    headers: {

                                        ...(((baseOpts.global || {}).headers) || {}),

                                        'x-project-tag': cfg.projectTag

                                    }

                                }

                              }

                            : { ...baseOpts, auth: { persistSession: false, storageKey: 'bc_auth', ...(baseOpts.auth||{}) } };

                        window.__supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey, opts);

                        return window.__supabaseClient;

                    }catch(_){ return null; }

                };

            }

            // 惰性取得 client

            function getClient(){

                try{ return window.getSupabaseClient ? window.getSupabaseClient() : null; }catch(_){ return null; }

            }

            function getRunsTable(){ try { return (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.achvRunsTable) || 'achv_runs'; } catch(_){ return 'achv_runs'; } }



            // 上傳單局資料（僅闖關/生存）

            // If a score row will be created shortly, prefer calling with an options { linkToScoreId }

            window.sendAchievementRunToSupabase = async function(metrics, unlocked, mode, options){

                try{

                    if(!metrics) return;

                    const m = metrics; const md = (mode||m.mode||'classic');

                    if(!(md==='classic' || md==='survival')) return;

                    const client = getClient(); if(!client) return;

                    const table = getRunsTable();

                    // Align with schema: achv_runs(metrics jsonb, achievements jsonb, mode, project_tag, score_id?, created_at default)

                    const unlockIds = (unlocked||[]).map(a=>a && a.id).filter(Boolean);

                    const row = {

                        mode: md,

                        metrics: {

                            answered: m.answeredQuestions||0,

                            accuracy: m.accuracy||0,

                            longestStreak: m.longestStreak||0,

                            maxComboReached: m.maxComboReached||0,

                            wrong: m.wrongCount||0,

                            avgMs: m.avgAnswerMs||0,

                            survivalDuration: m.survivalDuration||0,

                            maxTime: m.maxTime||0

                        },

                        achievements: {

                            ids: unlockIds,

                            count: unlockIds.length

                        },

                        project_tag: (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.projectTag)||'bible-challenge-prod'

                    };

                    // Optionally attach a score_id if provided

                    if (options && options.linkToScoreId) row.score_id = options.linkToScoreId;

                    const { data } = await client.from(table).insert(row).select('id, created_at').single().throwOnError();

                    try {

                        const runId = data && data.id ? String(data.id) : null;

                        if (runId) {

                            window.__lastAchvRunId = runId;

                            window.__lastAchvRunTs = Date.now();

                        }

                    } catch(_) {}

                    return data || null;

                }catch(_){ /* ignore */ }

            }



            // After a score is saved, link latest queued telemetry row to that score_id (best-effort)

            window.linkLatestAchievementRunToScore = async function(scoreId, runId){

                try{

                    const client = getClient(); if(!client) return;

                    const table = getRunsTable(); if (!scoreId) return;

                    if (runId) {

                        try {

                            await client.from(table).update({ score_id: scoreId }).eq('id', runId);

                            return;

                        } catch(_) {}

                    }

                    // Find most recent achv_runs without score_id for this project_tag and attach it

                    const tag = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.projectTag)||'bible-challenge-prod';

                    const { data:list } = await client.from(table)

                        .select('id, score_id')

                        .is('score_id', null)

                        .eq('project_tag', tag)

                        .order('created_at', { ascending:false })

                        .limit(1);

                    const row = Array.isArray(list) && list[0];

                    if (row && row.id) {

                        try { await client.from(table).update({ score_id: scoreId }).eq('id', row.id); } catch(_) {}

                    }

                }catch(_){ /* ignore */ }

            } // <- end linkLatestAchievementRunToScore

            

            // 從 Supabase 拉最近 N 局，計算 tier 建議並「立即套用」於本次載入（不下載檔案）

            window.rebalanceTiersFromSupabase = async function(limit){

                try{

                    const runs = await window.fetchRecentAchievementRuns(limit||100);

                    const map = window.computeTierSuggestionFromRuns(runs);

                    if (typeof window.applyAchievementTierMap === 'function') window.applyAchievementTierMap(map);

                    const payload = { generatedAt: new Date().toISOString(), tiers: map };

                    // 僅回傳結果（讓你參考並手動更新 bible-challenge.html 中的 tier）

                    console.log('[rebalance] 建議 tiers：', payload);

                    return payload;

                }catch(e){ console.warn('rebalanceTiersFromSupabase failed', e); return null; }

            }

        })();

        // #endregion



        // ====== 指標封存（結算時）與生存補充紀錄 ======

        ;(function finalizeAndSurvivalHelpers(){

            function ensureMetrics(){

                if (!window.gameMetrics || typeof window.gameMetrics !== 'object') {

                    window.gameMetrics = {

                        mode: 'classic',

                        answeredQuestions: 0,

                        totalQuestions: 0,

                        correctCount: 0,

                        wrongCount: 0,

                        hintsUsed: 0,

                        totalAnswerTimeMs: 0,

                        avgAnswerMs: 0,

                        fastestAnswerMs: 999999,

                        longestStreak: 0,

                        maxConsecutivePerfect: 0,

                        levelPerfectFlags: [],

                        levelsPerfectCount: 0,

                        timeSamples: [],

                        perQuestionTimes: []

                    };

                }

                return window.gameMetrics;

            }



            function calcStd(values){

                try {

                    const arr = (Array.isArray(values) ? values : []).filter(v => Number.isFinite(v));

                    if (!arr.length) return 0;

                    const mean = arr.reduce((a,b)=>a+b,0) / arr.length;

                    const variance = arr.reduce((a,b)=>a + Math.pow(b - mean, 2), 0) / arr.length;

                    return Math.sqrt(variance);

                } catch(_) { return 0; }

            }



            window.recordSurvivalTick = function(seconds){

                try {

                    const m = ensureMetrics();

                    m.mode = 'survival';

                    const sec = Math.max(0, Number(seconds) || 0);

                    const now = Date.now();



                    if (!m._survivalStartTs) m._survivalStartTs = now;

                    m.survivalDuration = Math.max(0, Math.floor((now - m._survivalStartTs) / 1000));



                    m.maxTime = Math.max(Number(m.maxTime || 0), sec);

                    if (Number.isFinite(m.maxTimeVirtual)) {

                        m.maxTime = Math.max(m.maxTime, Number(m.maxTimeVirtual || 0));

                    }



                    if (!Array.isArray(m._survivalSamples)) m._survivalSamples = [];

                    m._survivalSamples.push(sec);

                    if (m._survivalSamples.length > 1200) m._survivalSamples.shift();



                    const secBucket = Math.floor(now / 1000);

                    if (m._survivalLastBucket !== secBucket) {

                        m._survivalLastBucket = secBucket;

                        if (sec >= 60 && sec <= 90) m.timeInBand60to90 = (m.timeInBand60to90 || 0) + 1;

                        if (sec >= 0 && sec <= 30) m.timeInBand0to30 = (m.timeInBand0to30 || 0) + 1;

                    }



                    if (sec <= 15) {

                        m.nearDeathActive = true;

                    } else if (m.nearDeathActive && sec >= 25) {

                        m.nearDeathRecoveries = (m.nearDeathRecoveries || 0) + 1;

                        m.nearDeathActive = false;

                    }

                } catch(_) { /* ignore */ }

            };



            window.recordRescue = function(){

                try {

                    const m = ensureMetrics();

                    m.rescueUsed = true;

                } catch(_) { /* ignore */ }

            };



            window.finalizeMetrics = function(){

                const m = ensureMetrics();

                const gs = (typeof window.gameState === 'object' && window.gameState) ? window.gameState : {};

                const normalizeQKey = (raw)=> String(raw == null ? '' : raw).replace(/\|/g, ':').trim();



                const answered = Math.max(0, Number(m.answeredQuestions || (m.correctCount || 0) + (m.wrongCount || 0) || 0));

                const totalQuestions = Math.max(answered, Number(gs.totalQuestions || m.totalQuestions || answered));

                const correctCount = Math.max(0, Number(m.correctCount || 0));

                const wrongCount = Math.max(0, Number(m.wrongCount || 0));

                const hintsUsed = Math.max(0, Number(m.hintsUsed || 0));

                const accuracy = answered > 0 ? (correctCount / answered) : 0;



                const events = Array.isArray(m.perQuestionTimes) ? m.perQuestionTimes : [];

                const perQuestionTimesAll = events.map(e => Math.max(1, Number(e && e.ms) || 0));

                const perQuestionCorrectFlags = events.map(e => !!(e && e.isCorrect));

                const perQuestionValidFlags = events.map(() => true);



                const hintedKeySet = (()=>{

                    try {

                        const src = gs && gs.usedHints;

                        if (!src) return new Set();

                        const rawList = Array.isArray(src) ? src : Array.from(src);

                        return new Set(rawList.map(normalizeQKey).filter(Boolean));

                    } catch(_) { return new Set(); }

                })();



                const byQuestion = new Map();

                for (const e of events) {

                    if (!e) continue;

                    const qKey = normalizeQKey(e.qKey || '');

                    if (!qKey) continue;

                    if (!byQuestion.has(qKey)) {

                        byQuestion.set(qKey, {

                            attempts: 0,

                            wrongs: 0,

                            correct: false,

                            firstCorrectMs: 0,

                            hinted: hintedKeySet.has(qKey) || !!e.hinted

                        });

                    }

                    const item = byQuestion.get(qKey);

                    item.attempts++;

                    item.hinted = item.hinted || hintedKeySet.has(qKey) || !!e.hinted;

                    if (e.isCorrect) {

                        if (!item.correct) {

                            item.correct = true;

                            item.firstCorrectMs = Math.max(1, Number(e.ms) || 0);

                        }

                    } else {

                        item.wrongs++;

                    }

                }



                const qValues = Array.from(byQuestion.values());

                const noHintQuestions = qValues.filter(q => !q.hinted);

                const noHintAnsweredCount = noHintQuestions.length;

                const noHintCorrectQuestions = noHintQuestions.filter(q => q.correct);

                const noHintCorrectCount = noHintCorrectQuestions.length;

                const accuracyNoHint = noHintAnsweredCount > 0 ? (noHintCorrectCount / noHintAnsweredCount) : 0;

                const perfectTimes = noHintCorrectQuestions

                    .map(q => Math.max(1, Number(q.firstCorrectMs) || 0));

                const avgPerfectAnswerMs = perfectTimes.length

                    ? (perfectTimes.reduce((a,b)=>a+b,0) / perfectTimes.length)

                    : 0;

                const fastestPerfectAnswerMs = perfectTimes.length

                    ? Math.min(...perfectTimes)

                    : Math.max(1, Number(m.fastestAnswerMs || 999999));



                let firstTryCorrectCount = 0;

                let firstTryTimes = [];

                const computedFirstTry = qValues.filter(q => q.correct && q.wrongs === 0);

                if (computedFirstTry.length > 0) {

                    firstTryCorrectCount = computedFirstTry.length;

                    firstTryTimes = computedFirstTry

                        .map(q => Math.max(1, Number(q.firstCorrectMs) || 0));

                } else if (typeof m.firstTryCorrectCount === 'number' && Number.isFinite(m.firstTryCorrectCount)) {

                    firstTryCorrectCount = Math.max(0, Number(m.firstTryCorrectCount || 0));

                    firstTryTimes = Array.isArray(m.firstTryAnswerTimes)

                        ? m.firstTryAnswerTimes.filter(v => Number.isFinite(v)).map(v => Math.max(1, Number(v)))

                        : [];

                } else {

                    for (let i = 0; i < events.length; i++) {

                        const cur = events[i];

                        if (!cur || !cur.isCorrect) continue;

                        const prev = events[i - 1];

                        const likelyRetry = !!(prev && prev.isCorrect === false);

                        if (!likelyRetry) {

                            firstTryCorrectCount++;

                            firstTryTimes.push(Math.max(1, Number(cur.ms) || 0));

                        }

                    }

                }

                const firstTryAvgAnswerMs = firstTryTimes.length

                    ? (firstTryTimes.reduce((a,b)=>a+b,0) / firstTryTimes.length)

                    : 0;

                const fastestFirstTryAnswerMs = firstTryTimes.length ? Math.min(...firstTryTimes) : 999999;



                const levelStatsByKey = new Map();

                if (byQuestion.size > 0) {

                    for (const [qKey, q] of byQuestion.entries()) {

                        const [lvRaw, idxRaw] = qKey.split(':');

                        const lv = Number(lvRaw);

                        const idx = Number(idxRaw);

                        if (!Number.isFinite(lv)) continue;

                        const levelKey = String(lv);

                        if (!levelStatsByKey.has(levelKey)) {

                            levelStatsByKey.set(levelKey, { mistakes: 0, entries: [] });

                        }

                        const bucket = levelStatsByKey.get(levelKey);

                        bucket.mistakes += Math.max(0, Number(q.wrongs || 0));

                        bucket.entries.push({

                            index: Number.isFinite(idx) ? idx : 9999,

                            correct: !!q.correct,

                            firstTry: !!q.correct && (q.wrongs === 0),

                            firstCorrectMs: Math.max(1, Number(q.firstCorrectMs || 0))

                        });

                    }

                }



                const sortedLevelKeys = Array.from(levelStatsByKey.keys()).sort((a,b)=> Number(a)-Number(b));

                const levelMistakesList = sortedLevelKeys.map(k => levelStatsByKey.get(k).mistakes);

                const levelHead3QualifyFlags = sortedLevelKeys.map(k => {

                    const rows = (levelStatsByKey.get(k).entries || [])

                        .filter(r => r && r.correct)

                        .sort((a,b)=> a.index - b.index);

                    if (rows.length < 3) return false;

                    const top3 = rows.slice(0,3);

                    return top3.every(r => r.firstTry && r.firstCorrectMs > 0 && r.firstCorrectMs <= 3000);

                });

                const levelHead5QualifyFlags = sortedLevelKeys.map(k => {

                    const rows = (levelStatsByKey.get(k).entries || [])

                        .filter(r => r && r.correct)

                        .sort((a,b)=> a.index - b.index);

                    if (rows.length < 5) return false;

                    const top5 = rows.slice(0,5);

                    return top5.every(r => r.firstTry && r.firstCorrectMs > 0 && r.firstCorrectMs <= 5000);

                });



                let levelPerfectFlags = Array.isArray(m.levelPerfectFlags) ? [...m.levelPerfectFlags] : [];

                if (!levelPerfectFlags.length && gs.levelResults && typeof gs.levelResults === 'object') {

                    const keys = Object.keys(gs.levelResults)

                        .map(k => Number(k))

                        .filter(Number.isFinite)

                        .sort((a,b)=>a-b);

                    levelPerfectFlags = keys.map(k => gs.levelResults[k] === 'perfect');

                }

                const levelsPerfectCount = levelPerfectFlags.reduce((acc, v) => acc + (v ? 1 : 0), 0);



                let maxConsecutivePerfect = 0;

                let streak = 0;

                for (const flag of levelPerfectFlags) {

                    if (flag) {

                        streak++;

                        if (streak > maxConsecutivePerfect) maxConsecutivePerfect = streak;

                    } else {

                        streak = 0;

                    }

                }



                const completedLevels = (() => {

                    if (String(gs.playMode || '') === 'survival') return Math.max(0, (Number(gs.currentLevel || 1) - 1));

                    if (gs.levelResults && typeof gs.levelResults === 'object') return Object.keys(gs.levelResults).length;

                    return Math.max(0, Number(gs.currentLevel || 1) - 1);

                })();



                const totalMistakes = Math.max(0, Number(gs.totalMistakes || wrongCount));

                const avgMistakesPerLevel = completedLevels > 0 ? (totalMistakes / completedLevels) : totalMistakes;



                const isSurvival = String(gs.playMode || m.mode || 'classic') === 'survival';

                const survivalDuration = isSurvival

                    ? Math.max(0,

                        Number(m.survivalDuration || 0),

                        gs.gameStartTime ? Math.floor(((gs.gameEndTime || Date.now()) - gs.gameStartTime) / 1000) : 0

                    )

                    : 0;



                const timeStdDev = calcStd(m._survivalSamples || []);

                const survivalCompletedWaves = isSurvival ? Math.max(0, Number(gs.currentLevel || 1) - 1) : 0;

                const maxComboReached = Math.max(

                    Number(m.maxComboReached || 0),

                    Number(gs.comboPeak || 0),

                    Number((window.gameState && window.gameState.finalMetrics && window.gameState.finalMetrics.maxComboReached) || 0)

                );



                const result = {

                    ...m,

                    mode: isSurvival ? 'survival' : 'classic',

                    answeredQuestions: answered,

                    totalQuestions,

                    correctCount,

                    wrongCount,

                    hintsUsed,

                    accuracy,

                    avgAnswerMs: answered > 0 ? (Number(m.totalAnswerTimeMs || 0) / answered) : Number(m.avgAnswerMs || 0),

                    noHintAnsweredCount,

                    noHintCorrectCount,

                    accuracyNoHint,

                    avgPerfectAnswerMs,

                    fastestPerfectAnswerMs,

                    firstTryCorrectCount,

                    firstTryAvgAnswerMs,

                    fastestFirstTryAnswerMs,

                    levelPerfectFlags,

                    levelsPerfectCount,

                    maxConsecutivePerfect,

                    levelHead3QualifyFlags,

                    levelHead5QualifyFlags,

                    levelMistakesList,

                    avgMistakesPerLevel,

                    perQuestionTimesAll,

                    perQuestionCorrectFlags,

                    perQuestionValidFlags,

                    survivalDuration,

                    survivalCompletedWaves,

                    timeInBand60to90: Number(m.timeInBand60to90 || 0),

                    timeInBand0to30: Number(m.timeInBand0to30 || 0),

                    nearDeathRecoveries: Number(m.nearDeathRecoveries || 0),

                    rescueUsed: !!m.rescueUsed,

                    maxTime: Math.max(Number(m.maxTime || 0), Number(m.maxTimeVirtual || 0)),

                    maxComboReached,

                    timeStdDev

                };



                try { window.gameMetrics = result; } catch(_) {}

                try { if (window.gameState) window.gameState.finalMetrics = result; } catch(_) {}

                return result;

            };

        })();



        // 之後：在遊戲各處呼叫 recordAnswer / recordHint / recordSurvivalTick / recordRescue / recordLevelResult

        // 結束時計算： finalizeMetrics() + AchievementManager.evaluateAll

        // 勳章渲染稍後插入。









