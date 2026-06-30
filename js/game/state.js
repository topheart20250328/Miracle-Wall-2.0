// Extracted from bible-challenge.html
// Game State Definitions

// #region 遊戲狀態與變數
        // 遊戲狀態
        const initialGameState = {
            difficulty: null, // 動態難度追蹤：'easy' | 'normal' | 'hard' (由遊戲引擎根據 Combo 動態調整)
            // ranking/practice model
            mode: null, // 'ranking' or 'practice' (derived from UI selection); optional display helper
            // play mode: 'classic' (10 levels) or 'survival' (90s countdown)
            // 初始不預設任何主模式，避免主選單出現預設粗框高亮
            playMode: null,
            rarity: null, // 廢棄：原本用於玩家手動選擇 'common' | 'rare' | 'all'，現已改為內部動態計算 adaptiveVerseRarity
            range: null,
            theme: null,
            testament: 'old',
            customBooks: [],
            currentLevel: 1,
            currentQuestion: 1,
            score: 0,
            hintsUsed: 0,
            levelPerfect: true,
            questionData: [],
            currentQuestionIndex: 0,
            questionAttempts: {},
            usedHints: new Set(),
            selectedVerseIndex: null,
            levelStartTime: null,
            timerInterval: null,
            // Survival mode global timer
            survivalTimeRemaining: 0, // in seconds
            survivalTotalTime: 0,     // initial total seconds for progress bar
            survivalTimerInterval: null,
            // Survival enhancement: track last answer time (for speed-based gain) and one-time rescue boost availability
            survivalLastAnswerTs: 0,
            survivalRescueReady: true,
            // Track number of correct answers in current survival run for phase-based diminishing
            survivalCorrectCount: 0,
            // 生存模式：每題已扣秒累計（用於最終答錯時只補扣到目標總額）
            survivalPenaltiesByQuestion: {},
            totalCorrectAnswers: 0,
            totalQuestions: 0,
            gameStartTime: null,
            gameCompleted: false,
            levelResults: {},
            hintsRemaining: 5,
            isFirstQuestionOfLevel: true,
            consecutiveMistakes: 0,
            hintReminderShown: false,
            levelFailedCount: 0,
            showTimeReward: true, // 時間獎勵固定啟用（不再提供開關）
            // 本局（整場遊戲）首次「該題無法再得分」時顯示提示功能提醒（只顯示一次）
            firstNoScoreMissToastShown: false,
            // 防止同一關結束流程被重複觸發（避免重複加分／連跳關）
            // Prevent duplicate end-of-level handling (avoid double scoring / skipping two levels)
            levelEndHandled: false,
            // Combo system
            combo: 0,              // current combo level (0..24)
            maxCombo: 25,          // cap (25 觸發 MAX 顯示，視覺仍維持第三條滿格)
            comboProgress: 0,      // 0..1 progress toward next combo
            comboDecayTimer: null,  // timeout-based decay controller (optional future)
            comboTotalBonus: 0,    // accumulated extra points from combo multiplier (for breakdown)
            comboPeak: 0           // 本局最高連擊（供離線模式與裝備課程紀錄）
            ,
            // 裝備課程狀態
            equipRunning: false,           // 是否正在進行裝備課程
            equipTier: null,               // 'growth' | 'disciple' | 'leader'
            equipPhase: 0,                 // 1 書卷抽選, 2 章節選擇, 3 排序經文
            equipBank: null,               // 已載入的裝備課程題庫
            equipRemaining: [],            // 尚未作答的本班級關卡（元素為 {book, chapter, verses[]}）
            currentEquipEntry: null,       // 本關卡的目標（book/chapter/verses）
            equipLevelMistakes: 0,         // 本關累計失誤
            equipStepAttempts: 3,          // 排序步驟的剩餘嘗試次數（每步上限3）
            equipExpectedIndex: 0,         // 排序下一個正確片段索引
            equipDistractorPool: [],       // 同班級干擾片段池
            equipLastBook: null,           // 上一關選中的書卷名稱（避免連續重複）
            equipLevelCount: 10,           // 本次裝備課程實際關卡數（最多 10，視可用書卷數而定）
            nonRankingRun: false           // 不列入排行（裝備課程/重播等）
        };

        // 使用 Proxy 攔截狀態改變，自動觸發事件總線 (Event Bus)
        window.gameState = new Proxy(initialGameState, {
            set: function(target, property, value) {
                const oldValue = target[property];
                target[property] = value;
                
                // 如果值有改變且事件總線存在，則發送狀態變更事件
                if (oldValue !== value && window.bcEvents) {
                    window.bcEvents.emit('state:' + property, { old: oldValue, new: value });
                }
                return true;
            }
        });
        // #endregion

        // Helper: get total levels for current play mode
        function getLevelCount() {
                    // 裝備課程：即使結束後 (equipRunning=false) 在結算/回放期間仍需要穩定的總關卡數
                    if (gameState.equipRunning || gameState.equipTier || (gameState.levelResults && Object.keys(gameState.levelResults).length>0 && gameState.equipLevelCount)) {
                        return Math.max(1, Math.min(10, Number(gameState.equipLevelCount||10)));
                    }
            // 練習模式（任何 range）與闖關模式皆為 10 關；生存無上限（以時間為準）
            if (gameState.range) return 10;
            return (gameState.playMode === 'classic') ? 10 : 0; // survival has no fixed level cap
        }

    function isSurvival() { return gameState.playMode === 'survival' && !gameState.range; }

        // Helper: ensure a dynamic CSS rule to control #levelProgressMini columns with !important
        function setMiniProgressGridColumns(count) {
            try {
                const id = 'miniLevelGridStyle';
                let styleEl = document.getElementById(id);
                const css = `@media (max-width: 640px) { #levelProgressMini { grid-template-columns: repeat(${Math.max(1, count)}, minmax(0, 1fr)) !important; } }`;
                if (!styleEl) {
                    styleEl = document.createElement('style');
                    styleEl.id = id;
                    styleEl.textContent = css;
                    document.head.appendChild(styleEl);
                } else {
                    styleEl.textContent = css;
                }
            } catch (_) { /* non-fatal */ }
        }

// End of clean state.js
