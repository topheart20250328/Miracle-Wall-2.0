// Board UI Generator (Extracted from engine.js)
    // 渲染本關題目卡片（經文卡＋章節卡）
    // Render question cards for the current level
    function displayQuestions() {
            const versesContainer = document.getElementById('gameVerses');
            const chaptersContainer = document.getElementById('gameChapters');
            // 不主動清除吐司提示，避免剛顯示就被隱藏造成閃動；
            // 新提示會直接覆蓋內容並保持顯示。
            // 根據難度動態顯示標題：簡單顯示「前 段 經 文 / 後 段 經 文」，其餘難度保持原本「經 文 內 容 / 章 節 選 擇」
            const verseTitleEl = document.getElementById('verseTitle');
            const chapterTitleEl = document.getElementById('chapterTitle');
            if (verseTitleEl && chapterTitleEl) {
                if (gameState.difficulty === 'easy') {
                    verseTitleEl.innerHTML = `<span class="text-4xl animate-pulse mr-4">📜</span><span class="tracking-widest bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">前 段 經 文</span><span class="text-4xl animate-pulse ml-4">📜</span>`;
                    chapterTitleEl.innerHTML = `<span class="text-4xl animate-pulse mr-4">📍</span><span class="tracking-widest bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">後 段 經 文</span><span class="text-4xl animate-pulse ml-4">📍</span>`;
                } else {
                    verseTitleEl.innerHTML = `<span class="text-4xl animate-pulse mr-4">📜</span><span class="tracking-widest bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">經 文 內 容</span><span class="text-4xl animate-pulse ml-4">📜</span>`;
                    chapterTitleEl.innerHTML = `<span class="text-4xl animate-pulse mr-4">📍</span><span class="tracking-widest bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">章 節 選 擇</span><span class="text-4xl animate-pulse ml-4">📍</span>`;
                }
            }

            versesContainer.innerHTML = '';
            chaptersContainer.innerHTML = '';
            
            // 顯示經文 (簡單難度為前段；其他為整段經文)
            gameState.questionData.forEach((item, index) => {
                // 簡單難度：移除頭尾「」符號（舊快照亦在此保險處理）
                const verseText = (gameState.difficulty === 'easy') ? stripOuterCornerQuotes(item.front) : item.verse;
                const verseCard = createVerseCard(verseText, index);
                versesContainer.appendChild(verseCard);
            });
            
            // 顯示章節選項（打亂順序；重播時採用快照既有順序）
            // 章節 / 後段顯示（簡單模式顯示後段經文作為選項）
            let shuffledChapters;
            if (Array.isArray(gameState._forcedChapterOrder)) {
                // Replay: use stored order indices
                shuffledChapters = gameState._forcedChapterOrder.map(i => gameState.questionData[i]).filter(Boolean);
            } else {
                // Fresh session: produce a shuffle and store its index order for snapshot v2 persistence
                const arr = [...gameState.questionData];
                // Fisher-Yates for reproducibility if seeded in future (currently Math.random)
                for (let i = arr.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [arr[i], arr[j]] = [arr[j], arr[i]];
                }
                shuffledChapters = arr;
                try {
                    gameState._lastChapterShuffleOrder = shuffledChapters.map(item => gameState.questionData.indexOf(item));
                } catch(_) { gameState._lastChapterShuffleOrder = null; }
            }
            shuffledChapters.forEach((item, index) => {
                let chapterText;
                if (gameState.difficulty === 'easy') {
                    // 簡單難度選項顯示後段經文，同樣移除頭尾「」
                    chapterText = stripOuterCornerQuotes(item.back);
                } else {
                    chapterText = (gameState.difficulty === 'easy' || gameState.difficulty === 'normal') ? item.book : `${item.book} ${item.chapter}`;
                }
                const chapterCard = createChapterCard(chapterText, item);
                chaptersContainer.appendChild(chapterCard);
            });
            
            // 進場動畫：不規則從右側滑入（使用隨機 delay/位移/角度/時長）
            try {
                const allCards = [
                    ...versesContainer.querySelectorAll('.verse-card'),
                    ...chaptersContainer.querySelectorAll('.chapter-card')
                ];
                const prefersReduce = (typeof isReducedMotionPreferred === 'function') ? isReducedMotionPreferred() : (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
                const baseDelay = 10; // 毫秒（原 40 → 10，讓下一關更快進場）
                allCards.forEach((el, i) => {
                    const jitter = (min, max) => Math.random() * (max - min) + min;
                    const delay = prefersReduce ? 0 : Math.round(i * baseDelay + jitter(0, 24));
                    const dx = Math.round(jitter(80, 160));
                    const dy = Math.round(jitter(-10, 12));
                    // 普通/綠色卡片不傾斜：進場時不旋轉
                    const dr = '0deg';
                    const dur = prefersReduce ? 0 : Math.round(jitter(460, 620));
                    el.style.setProperty('--enterDelay', `${delay}ms`);
                    el.style.setProperty('--enterX', `${dx}px`);
                    el.style.setProperty('--enterY', `${dy}px`);
                    el.style.setProperty('--enterR', dr);
                    el.style.setProperty('--enterDur', `${dur}ms`);
                    el.classList.add('card-enter');
                });
            } catch (_) { /* non-fatal */ }
            
            // 僅在第一關的第一題顯示遊戲提示（可愛語氣吐司提示，不自動關閉）
            if (gameState.currentLevel === 1 && gameState.isFirstQuestionOfLevel) {
                const introPool = (gameState.difficulty === 'easy') ? HINTS.play.introEasy : HINTS.play.introOther;
                // 顯示首個指示 2.8 秒
                gameState._fadeVerseInstruction = showGameInstruction(pick(introPool), 2800);
            }
        }

        // 返回對應的文字大小 class（共用給章節卡與簡單模式的前段經文）
    // 根據經文長度決定卡片字級
    // Pick font-size class based on verse length
    function getCardTextSize(text) {
            if (!text) return 'text-lg';
            if (text.length <= 8) return 'text-xl';
            if (text.length <= 15) return 'text-lg';
            if (text.length <= 25) return 'text-base';
            return 'text-sm';
        }

    // 產生經文卡片（依嘗試次數顯示顏色；行動裝置於 carousel 中以 full-width 呈現）
    // Create verse card with color by attempts; on mobile carousel use full-width layout.
    // 建立經文卡片（可點選）
    // Create a verse card element
    function createVerseCard(verse, index) {
            const card = document.createElement('div');
            const attempts = gameState.questionAttempts[index];
            const maxAttempts = { easy: 3, normal: 3, hard: 3 };
            const originalAttempts = maxAttempts[gameState.difficulty];
            
            // 若該經文還未作答（嘗試次數等於原始次數），一律顯示藍色
            let bgColor = 'bg-blue-50 border-blue-200';
            if (attempts < originalAttempts) {
                // 已經作答過但還有機會，根據剩餘次數顯示不同顏色
                if (attempts === 2) bgColor = 'bg-yellow-100 border-yellow-300';
                else if (attempts === 1) bgColor = 'bg-orange-100 border-orange-300';
                else if (attempts === 0) bgColor = 'bg-red-100 border-red-300';
            }
            
            // 根據是否在 carousel 內調整卡片樣式：carousel 僅在手機視窗下啟用
            const inCarousel = !!document.getElementById('versesCarousel') && window.matchMedia('(max-width: 760px)').matches;
            let widthClass = inCarousel ? 'w-full' : 'w-64'; // 使用 full-width 作為 carousel 的預設
            let heightClass = inCarousel ? 'min-h-[64px]' : 'min-h-[120px]';

            if (!inCarousel) {
                if (verse.length <= 30) {
                    widthClass = 'w-48';
                    heightClass = 'min-h-[80px]';
                } else if (verse.length <= 60) {
                    widthClass = 'w-56';
                    heightClass = 'min-h-[90px]';
                } else if (verse.length <= 100) {
                    widthClass = 'w-72';
                    heightClass = 'min-h-[100px]';
                } else {
                    widthClass = 'w-80';
                    heightClass = 'min-h-[110px]';
                }
            }

            // 在 carousel 情況下，不使用 flex-shrink-0 並改為垂直對齊
            card.className = inCarousel
                ? `verse-card ${bgColor} border-2 p-2 ${heightClass} ${widthClass} flex items-center justify-between` 
                : `verse-card ${bgColor} border-2 p-2 ${heightClass} ${widthClass} flex items-center justify-center flex-shrink-0`;
            card.dataset.index = index;
            // 綱一致化：所有難度使用與簡單模式相同的文字大小/字重規則，並以藍色文字顯示經文內容
            const textSize = getCardTextSize(verse);
            card.innerHTML = `<div class="font-normal text-blue-800 ${textSize} leading-tight break-words text-center max-w-full">${verse}</div>`;
            
            // 鍵盤可達性
            card.setAttribute('tabindex', '0');
            card.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectVerse(index); }
            });
            // 添加點擊事件 + subtle click effect
        card.addEventListener('click', (ev) => {
                // visual: small blue-themed star burst from the card
                try {
                    // If clicking the same selected verse, treat as deselect: no particle effect
                    if (gameState.selectedVerseIndex === index) {
                        selectVerse(index);
                        return;
                    }
                    const rect = card.getBoundingClientRect();
                    const attemptsLeft = gameState.questionAttempts[index];
            // palette: blue/cyan; simpler sparkle glyph, fewer, closer
            let colors = ['#93C5FD','#60A5FA','#3B82F6','#06B6D4','#67E8F9'];
            if (attemptsLeft === 1) colors = ['#F59E0B','#FBBF24','#FDE68A'];
            if (attemptsLeft === 0) colors = ['#F87171','#FB7185','#FCA5A5'];
            // extremely subtle front-verse click effect: almost invisible
            spawnScoreParticles(5, rect, { colors, glyph: '·', count: 1, distanceMin: 4, distanceMax: 10, durationMs: 380, opacity: 0.18, sizeMin: 6, sizeMax: 8 });
                } catch(_) {}
                selectVerse(index);
            });
            
            return card;
        }

    // 產生章節/後段卡片（手機 carousel 與桌面版不同尺寸；含配對用 data-* 標記）
    // Create chapter/back card; mobile carousel uses compact size; includes data for matching.
    // 建立章節卡片（作為配對目標）
    // Create a chapter card element as match target
    function createChapterCard(chapterText, originalData) {
            const card = document.createElement('div');
            
            // 在 carousel 中使用 full-width 垂直列表樣式（僅在手機視窗）
            const inCarousel = !!document.getElementById('versesCarousel') && window.matchMedia('(max-width: 760px)').matches;
            let widthClass = inCarousel ? 'w-full' : 'w-48';
            if (!inCarousel) {
                if (chapterText.length <= 8) widthClass = 'w-36';
                else if (chapterText.length <= 15) widthClass = 'w-44';
                else if (chapterText.length <= 25) widthClass = 'w-52';
                else widthClass = 'w-60';
            }
            const textSize = getCardTextSize(chapterText);

            // On mobile (carousel) use the same compact sizing as verse cards so front/back panels match
            card.className = inCarousel
                ? `chapter-card bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300 p-2 text-center min-h-[64px] ${widthClass} flex items-center justify-between shadow-sm transition-all duration-150`
                : `chapter-card bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300 p-4 text-center min-h-[80px] ${widthClass} flex items-center justify-center flex-shrink-0 shadow-lg hover:shadow-xl transition-all duration-300`;
            // 標記配對資訊（若為 easy 模式，originalData 包含 front/back/pairId）
            if (gameState.difficulty === 'easy' && originalData.pairId) {
                card.dataset.pairId = originalData.pairId;
                card.dataset.book = originalData.book;
                card.dataset.chapter = originalData.chapter;
            } else {
                card.dataset.book = originalData.book;
                card.dataset.chapter = originalData.chapter;
            }
            // 顯示原始章節文字（保留標點），章節文字使用紫色系
            card.innerHTML = `<div class="font-normal text-purple-800 ${textSize} leading-tight break-words text-center max-w-full">${chapterText}</div>`;
            
            // 鍵盤可達性
            card.setAttribute('tabindex', '0');
            card.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); handleChapterClick(card, originalData); }
            });
    card.addEventListener('click', () => {
        // Only show particles when selection is correct (handled inside handleChapterClick)
        handleChapterClick(card, originalData);
        });
            
            return card;
        }

    // 選取前段經文卡：設定選中樣式、顯示教學提示（僅第一關第一題），並在手機自動滑到後段面板
    // Select a verse: mark selected, possibly show first-level guide, and auto-slide to back panel on mobile.

    function selectVerse(index) {
            // 移除之前選中的經文樣式
            document.querySelectorAll('.verse-card').forEach(card => {
                card.classList.remove('selected-verse');
            });
            
            // 選中當前經文
            const selectedCard = document.querySelector(`#gameVerses [data-index="${index}"]`);
            if (selectedCard && gameState.questionAttempts[index] > 0) {
                selectedCard.classList.add('selected-verse');
                gameState.selectedVerseIndex = index;

                // 僅在第一關的第一題顯示選擇章節/配對的提示
                if (gameState.currentLevel === 1 && gameState.isFirstQuestionOfLevel) {
                        // 先淡出上一個提示，再延遲顯示下一個提示，避免同時被隱藏
                        if (gameState._fadeVerseInstruction) {
                            gameState._fadeVerseInstruction();
                            gameState._fadeVerseInstruction = null;
                        }
                        const pairPool = (gameState.difficulty === 'easy') ? HINTS.play.pairEasy : HINTS.play.pairOther;
                        setTimeout(() => {
                            // 顯示第二段 2.8 秒
                            gameState._fadeChapterInstruction = showGameInstruction(pick(pairPool), 2800);
                        }, 260); // 等待上一個淡出動畫
                        gameState.isFirstQuestionOfLevel = false;
                }
                // 如果是在手機並存在 carousel，將視圖自動滑到後段章節面板，協助使用者選擇
                const carousel = document.getElementById('versesCarousel');
                if (carousel && window.innerWidth <= 760) {
                    // 僅水平滑動到第二個面板 (back)，避免影響垂直位置
                    const panels = carousel.querySelectorAll('.panel');
                    if (panels && panels.length > 1) {
                        const backPanel = panels[1];
                        try {
                            const carRect = carousel.getBoundingClientRect();
                            const backRect = backPanel.getBoundingClientRect();
                            const targetLeft = (backRect.left - carRect.left) + carousel.scrollLeft;
                            carousel.scrollTo({ left: targetLeft, behavior: 'smooth' });
                        } catch (_) {
                            // fallback
                            carousel.scrollLeft = backPanel.offsetLeft;
                        }
                    }
                }
                // 記錄本題開始作答時間（供罕見度自適應使用）
                try { gameState.currentQuestionStartTime = Date.now(); } catch(_) {}
                // 事件式速度段：若尚未啟動，從此刻開始計時
                try { if (gameMetrics && !gameMetrics.speedEventStartTs) gameMetrics.speedEventStartTs = Date.now(); } catch(_) {}
            }
        }

    function scrollToFrontPanel() {
            const carousel = document.getElementById('versesCarousel');
            if (!carousel || window.innerWidth > 760) return;
            const panels = carousel.querySelectorAll('.panel');
            if (!panels || panels.length === 0) return;
            const frontPanel = panels[0];
            try {
                // 僅水平滑動回前段面板，保持目前的垂直位置不變
                const carRect = carousel.getBoundingClientRect();
                const frontRect = frontPanel.getBoundingClientRect();
                const targetLeft = (frontRect.left - carRect.left) + carousel.scrollLeft;
                carousel.scrollTo({ left: targetLeft, behavior: 'smooth' });

                // 優先嘗試聚焦第一張經文卡，若不存在則聚焦 panel 本身（使用 tabindex -1 確保可聚焦）
                const firstVerse = frontPanel.querySelector('.verse-card');
                if (firstVerse) {
                    if (!firstVerse.hasAttribute('tabindex')) firstVerse.setAttribute('tabindex', '-1');
                    firstVerse.focus({ preventScroll: true });
                } else {
                    if (!frontPanel.hasAttribute('tabindex')) frontPanel.setAttribute('tabindex', '-1');
                    frontPanel.focus({ preventScroll: true });
                }
            } catch (e) {
                // defensive: ignore focus errors
            }
        }

    function clearErrorState(el) {
            if (!el) return;
            // 移除常見會造成錯誤視覺或阻礙變色的類別
            el.classList.remove('shake-error', 'bg-red-100', 'border-red-300');
            // 若元素內有文字節點，亦清除會覆蓋文字顏色的類別
            try {
                const inner = el.querySelector && el.querySelector('div');
                if (inner) {
                    inner.classList.remove('text-red-800', 'text-yellow-800', 'text-orange-800', 'text-blue-800', 'text-purple-800');
                }
            } catch (e) {
                // defensive: 如果不是 element 或 querySelector 發生例外，忽略
            }
        }

    let isProcessingAction = false;
    // 使用者點擊章節卡時的核心判題/計分流程
    // Core answer handler when a chapter card is clicked
    function handleChapterClick(chapterCard, chapterData) {
            // 防抖/防多重連點：避免過場動畫中或多根手指同時觸發多次判題
            if (isProcessingAction) return;
            
            // 必須先選擇經文
            if (gameState.selectedVerseIndex === null) {
                return;
            }

            isProcessingAction = true;
            setTimeout(() => { isProcessingAction = false; }, 350);
            
            const selectedQuestion = gameState.questionData[gameState.selectedVerseIndex];
            
            // 檢查是否正確：
            // - easy：使用 pairId（前段/後段配對）
            // - normal：僅比對書卷名稱
            // - hard：比對書卷與章節
            let isCorrect = false;
            if (gameState.difficulty === 'easy') {
                isCorrect = !!(selectedQuestion.pairId && chapterCard.dataset.pairId && selectedQuestion.pairId === chapterCard.dataset.pairId);
            } else if (gameState.difficulty === 'normal') {
                isCorrect = selectedQuestion.book === chapterData.book;
            } else {
                isCorrect = selectedQuestion.book === chapterData.book && selectedQuestion.chapter === chapterData.chapter;
            }
            
            if (isCorrect) {
                // 移除舊的 recentAnswerTimes 蒐集（已改為逐關耗時 adaptiveVerseRarity）
                // SFX: correct answer
                try { SFX.play('correct'); } catch(_) {}
                // 淡出遊戲提示
                const existingInstructions = document.querySelectorAll('.game-instruction');
                existingInstructions.forEach(inst => {
                    inst.style.animation = 'instructionFadeOut 1s ease-out forwards';
                    setTimeout(() => {
                        if (inst.parentElement) {
                            inst.parentElement.removeChild(inst);
                        }
                    }, 1000);
                });
                // 同步隱藏可愛吐司提示
                try { hideCuteHint(true); } catch (_) {}

                // 取消舊規則：不在答對時根據連續錯誤數顯示提示提醒（改採每關兩題完全答錯觸發）

                // 若該題有提示效果，立即移除（easy 模式使用 pairId）
                const hintVerseCard = document.querySelector(`#gameVerses [data-index="${gameState.selectedVerseIndex}"]`);
                if (hintVerseCard) hintVerseCard.classList.remove('hint-flash');
                if (gameState.difficulty === 'easy') {
                    const hintChapterCard = document.querySelector(`[data-pair-id="${selectedQuestion.pairId}"]`);
                    if (hintChapterCard) hintChapterCard.classList.remove('hint-flash');
                } else {
                    const hintChapterCard = document.querySelector(`[data-book="${chapterData.book}"][data-chapter="${chapterData.chapter}"]`);
                    if (hintChapterCard) hintChapterCard.classList.remove('hint-flash');
                }

                // 記錄答對時的失誤次數（用於進度條顏色判斷）
                const maxAttempts = { easy: 3, normal: 3, hard: 3 };
                const originalAttempts = maxAttempts[gameState.difficulty];
                const currentAttempts = gameState.questionAttempts[gameState.selectedVerseIndex];
                const hadMistakes = currentAttempts < originalAttempts;

                // 答對了
                let scoreGained = 0;
                if (gameState.questionAttempts[gameState.selectedVerseIndex] > 0) {
                    // 基礎分數：練習模式固定 100；排行模式依罕見度（常見/冷門/全部）100/125/150；每次失誤扣50分
                    const mistakeCount = originalAttempts - currentAttempts;
                    const inPractice = !!gameState.range;
                    const rarityBaseMap = { common: 100, rare: 125, all: 150 };
                    const basePerQuestion = inPractice ? 100 : (rarityBaseMap[gameState.rarity] || 100);
                    // 僅對「基礎分數（含失誤扣分）」套用 Combo 倍率；時間獎勵不加倍
                    const baseCore = basePerQuestion - (mistakeCount * 50);
                    const mult = getComboMultiplier(gameState.combo);
                    const baseClamped = Math.max(0, baseCore);
                    const baseWithCombo = Math.round(baseClamped * mult);
                    // 時間獎勵單獨計算（不受 Combo 影響）
                    let timeRewardScore = 0;
                    if (gameState.showTimeReward) {
                        timeRewardScore = updateCurrentScore();
                    }
                    const totalScore = baseWithCombo + timeRewardScore;
                    // 記錄 Combo 額外加成（用於結算明細）= 套用倍數後的基礎分 - 原始基礎分（下限 0）
                    const comboBonus = Math.max(0, baseWithCombo - baseClamped);
                    gameState.comboTotalBonus += comboBonus;
                    
                    gameState.score += totalScore;
                    scoreGained = totalScore;
                    gameState.totalCorrectAnswers++;
                }
                // Metrics: 記錄正確答題（毫秒）：以事件式段起點計
                try {
                    const baseTs = (gameMetrics && gameMetrics.speedEventStartTs) || (gameState.currentQuestionStartTime || gameState.levelStartTime || Date.now());
                    const qKey = `${gameState.currentLevel || 0}:${gameState.selectedVerseIndex || 0}`;
                    recordAnswer(true, Math.max(1, Date.now() - baseTs), qKey);
                    if (gameMetrics) gameMetrics.speedEventStartTs = Date.now();
                } catch(_) {}
                // 正確答案：提高 Combo
                addComboOnCorrect();
                
                // 標記為正確，並清除任何殘留的錯誤/動畫/紅色類別，確保文字能正確變成綠色
                chapterCard.classList.add('bg-green-100', 'border-green-300');
                chapterCard.classList.remove('bg-gradient-to-br', 'from-purple-50', 'to-purple-100', 'border-purple-300', 'chapter-arrow');
                // 清除可能殘留的錯誤／震動／紅色樣式，統一使用 helper
                clearErrorState(chapterCard);
                // 正確卡片給予輕微彈跳，不與平移衝突（縮放動畫）
                chapterCard.classList.remove('correct-pop');
                void chapterCard.offsetWidth; // reflow to restart
                chapterCard.classList.add('correct-pop');
                // 將章節文字改為綠色
                const chapterInner = chapterCard.querySelector('div');
                if (chapterInner) {
                    chapterInner.classList.remove('text-red-800', 'text-blue-800', 'text-purple-800');
                    chapterInner.classList.add('text-green-800');
                }
                
                // 移除經文卡片的選中狀態和點擊事件
                const verseCard = document.querySelector(`#gameVerses [data-index="${gameState.selectedVerseIndex}"]`);
                    if (verseCard) {
                    // mark verse correct and clear any lingering error/shake/red classes via helper
                    clearErrorState(verseCard);
                    verseCard.classList.remove('bg-blue-50', 'border-blue-200', 'bg-yellow-100', 'border-yellow-300', 'bg-orange-100', 'border-orange-300', 'selected-verse');
                    verseCard.classList.add('bg-green-100', 'border-green-300');
                    verseCard.style.pointerEvents = 'none';
                    verseCard.classList.remove('correct-pop');
                    void verseCard.offsetWidth;
                    verseCard.classList.add('correct-pop');
                    // 經文文字變綠表示答對
                    const innerText = verseCard.querySelector('div');
                    if (innerText) {
                        innerText.classList.remove('text-red-800', 'text-blue-800', 'text-purple-800');
                        innerText.classList.add('text-green-800');
                    }

                    // 簡單/普通難度：在該題前段/整段經文卡片下方顯示「書卷 章節」（例如：馬太福音 5:9）
                    if (gameState.difficulty === 'easy' || gameState.difficulty === 'normal') {
                        try {
                            const already = verseCard.querySelector('.verse-ref-label');
                            if (!already) {
                                const ref = document.createElement('div');
                                ref.className = 'verse-ref-label text-xs text-gray-700 font-semibold text-center';
                                ref.textContent = `${selectedQuestion.book || ''} ${selectedQuestion.chapter || ''}`.trim();
                                // 淡入效果
                                ref.style.opacity = '0';
                                ref.style.transition = 'opacity 260ms ease';
                                verseCard.appendChild(ref);
                                requestAnimationFrame(() => { ref.style.opacity = '1'; });
                                // 顯示 5 秒後淡出並移除
                                try { if (ref.__hideTimer) clearTimeout(ref.__hideTimer); } catch (e) {}
                                ref.__hideTimer = setTimeout(() => {
                                    try {
                                        ref.style.opacity = '0';
                                        const onEnd = () => {
                                            ref.removeEventListener('transitionend', onEnd);
                                            try { if (ref.parentElement) ref.parentElement.removeChild(ref); } catch (e2) {}
                                        };
                                        ref.addEventListener('transitionend', onEnd);
                                    } catch (e3) {}
                                }, 3000);
                            } else {
                                // 已存在：重置淡出計時並確保可見
                                already.style.transition = already.style.transition || 'opacity 260ms ease';
                                already.style.opacity = '1';
                                try { if (already.__hideTimer) clearTimeout(already.__hideTimer); } catch (e) {}
                                already.__hideTimer = setTimeout(() => {
                                    try {
                                        already.style.opacity = '0';
                                        const onEnd = () => {
                                            already.removeEventListener('transitionend', onEnd);
                                            try { if (already.parentElement) already.parentElement.removeChild(already); } catch (e2) {}
                                        };
                                        already.addEventListener('transitionend', onEnd);
                                    } catch (e3) {}
                                }, 3000);
                            }
                        } catch (e) { /* ignore label errors */ }
                    }
                }
                
                // 重置選中狀態
                gameState.selectedVerseIndex = null;
                
                // 更新題目進度顯示
                if (typeof scheduleProgressUIUpdate === 'function') scheduleProgressUIUpdate({ question: true });
                else updateQuestionOvals();
                
                // 檢查是否完成所有題目（合併重複觸發）
                scheduleLevelCompleteCheck(140);
                
                // 答題結束後，在手機上將焦點回到前段經文面板
                scrollToFrontPanel();

                if (scoreGained > 0) {
                    // 立即顯示加分數字
                    showScoreAnimation(`+${scoreGained}分`, false, verseCard);
                    // 立即顯示「Combo x N」（無延遲）；若卡片被移除則以中心區域為錨點
                    try {
                        const comboNowRaw = Math.max(0, Math.min(gameState.maxCombo || 25, gameState.combo || 0));
                        const comboNow = comboNowRaw >= 25 ? 'MAX' : comboNowRaw;
                        let anchor = verseCard;
                        try { if (!anchor || !anchor.isConnected) anchor = null; } catch(_) { anchor = null; }
                        showScoreAnimation(`Combo x ${comboNow}` , false, anchor);
                    } catch(_) { /* ignore */ }
                    // 派發答對事件，讓各模式自行處理專屬邏輯（如生存模式加秒）
                    if (window.bcEvents) {
                        try {
                            window.bcEvents.emit('game:answerCorrect', {
                                verseIndex: gameState.selectedVerseIndex,
                                now: Date.now()
                            });
                        } catch(e) {}
                    }
                    
                    // Emit subtle green-only particles to celebrate correct selection; count halved
                    try {
                        const rect = chapterCard.getBoundingClientRect();
                        const greens = ['#22C55E','#16A34A','#4ADE80','#86EFAC','#BBF7D0'];
                        spawnScoreParticles(null, rect, { colors: greens, glyph: '✹', count: 6, distanceMin: 50, distanceMax: 140, durationMs: 1800 });
                    } catch(_) { /* ignore */ }
                }
                // 刷新倒數條：答對題目後立即重置
                try { gameState.levelStartTime = Date.now(); gameState.__comboDroppedForTimeout = false; } catch(_) {}
                
            } else {
                // 答錯了
                // SFX: wrong answer
                try { SFX.play('wrong'); } catch(_) {}
                // 派發答錯事件，讓各模式處理（如生存模式非最終失誤短扣秒）
                if (window.bcEvents) {
                    try {
                        window.bcEvents.emit('game:answerWrong', {
                            verseIndex: gameState.selectedVerseIndex
                        });
                    } catch(e) {}
                }
                gameState.questionAttempts[gameState.selectedVerseIndex]--;
                gameState.levelPerfect = false;
                gameState.consecutiveMistakes++;
                gameState.totalMistakes++; // 增加失誤計數
                // 保留成就與統計紀錄；自 adaptiveVerseRarity 改版後不再收集 recentAnswerTimes。
                try {
                    const baseTs = (gameMetrics && gameMetrics.speedEventStartTs) || (gameState.currentQuestionStartTime || gameState.levelStartTime || Date.now());
                    const qKey = `${gameState.currentLevel || 0}:${gameState.selectedVerseIndex || 0}`;
                    recordAnswer(false, Math.max(1, Date.now() - baseTs), qKey);
                    if (gameMetrics) gameMetrics.speedEventStartTs = Date.now();
                } catch(_) {}
                
                // 淡出遊戲提示
                const existingInstructions = document.querySelectorAll('.game-instruction');
                existingInstructions.forEach(inst => {
                    inst.style.animation = 'instructionFadeOut 1s ease-out forwards';
                    setTimeout(() => {
                        if (inst.parentElement) {
                            inst.parentElement.removeChild(inst);
                        }
                    }, 1000);
                });
                // 同步隱藏可愛吐司提示
                try { hideCuteHint(true); } catch (_) {}
                
                // 顯示失誤扣分動畫
                const verseCard = document.querySelector(`#gameVerses [data-index="${gameState.selectedVerseIndex}"]`);
                if (verseCard) {
                    showScoreAnimation('-50', false, verseCard);
                }
                
                // 取消舊規則：不再使用「連續 3 次失誤」作為提示提醒觸發條件
                
                // 添加震動效果到選錯的章節卡片（作用於內層以避免與位移動畫衝突）
                (function(){
                    const inner = chapterCard.querySelector('div') || chapterCard;
                    inner.classList.remove('shake-error');
                    void inner.offsetWidth; // reflow
                    inner.classList.add('shake-error');
                    setTimeout(() => { inner.classList.remove('shake-error'); }, 600);
                })();
                // 失誤：Combo 掉 3 級
                dropCombo(3);
                
                if (gameState.questionAttempts[gameState.selectedVerseIndex] <= 0) {
                    // 派發最終答錯事件，讓各模式處理（如生存模式補扣至目標總額）
                    if (window.bcEvents) {
                        try {
                            window.bcEvents.emit('game:answerFinalWrong', {
                                verseIndex: gameState.selectedVerseIndex
                            });
                        } catch(e) {}
                    }
                    // 沒有機會了，標記經文為錯誤
                    const verseCard = document.querySelector(`#gameVerses [data-index="${gameState.selectedVerseIndex}"]`);
                    if (verseCard) {
                        verseCard.classList.remove('bg-green-100', 'border-green-300');
                        verseCard.classList.add('bg-red-100', 'border-red-300');
                        const vInner = verseCard.querySelector('div') || verseCard;
                        vInner.classList.remove('shake-error');
                        void vInner.offsetWidth; // reflow
                        vInner.classList.add('shake-error');
                        verseCard.classList.remove('bg-blue-50', 'border-blue-200', 'bg-yellow-100', 'border-yellow-300', 'bg-orange-100', 'border-orange-300', 'selected-verse');
                        verseCard.style.pointerEvents = 'none';
                        
                        // 將經文內容文字也改為紅色，表示此題已鎖定無法得分
                        const innerText = verseCard.querySelector('div');
                        if (innerText) {
                            innerText.classList.remove('text-blue-800', 'text-purple-800', 'text-green-800');
                            innerText.classList.add('text-red-800');
                        }

                        // 移除震動效果
                        setTimeout(() => { vInner.classList.remove('shake-error'); }, 600);
                    }
                    // 最終答錯：已於本次失誤時扣除 Combo，這裡重置倒數旗標並重置下一題計時起點
                    try { gameState.levelStartTime = Date.now(); gameState.__comboDroppedForTimeout = false; gameState.currentQuestionStartTime = Date.now(); } catch(_) {}
                    
                    // 找到正確答案並標記為紅色（只標記正確答案，不標記選錯的章節）
                    let correctChapter = null;
                    const allChapters = document.querySelectorAll('.chapter-card');
                    
                    for (let chapter of allChapters) {
                        // easy: 使用 pairId 比對
                        if (gameState.difficulty === 'easy' && selectedQuestion.pairId) {
                            if (chapter.dataset.pairId && chapter.dataset.pairId === selectedQuestion.pairId) {
                                correctChapter = chapter;
                                break;
                            }
                        } else if (gameState.difficulty === 'normal') {
                            if (chapter.dataset.book === selectedQuestion.book) {
                                correctChapter = chapter;
                                break;
                            }
                        } else {
                            if (chapter.dataset.book === selectedQuestion.book && chapter.dataset.chapter === selectedQuestion.chapter) {
                                correctChapter = chapter;
                                break;
                            }
                        }
                    }
                    
                    // 只將正確答案標記為紅色，不標記選錯的章節
                    if (correctChapter) {
                        correctChapter.classList.remove('bg-green-100', 'border-green-300');
                        correctChapter.classList.add('bg-red-100', 'border-red-300');
                        const cInner = correctChapter.querySelector('div') || correctChapter;
                        cInner.classList.remove('shake-error');
                        void cInner.offsetWidth; // reflow
                        cInner.classList.add('shake-error');
                        correctChapter.classList.remove('bg-gradient-to-br', 'from-purple-50', 'to-purple-100', 'border-purple-300');
                        correctChapter.style.pointerEvents = 'none';
                        // 答案文字也改為紅色以示提示
                        const correctInner = correctChapter.querySelector('div');
                        if (correctInner) {
                            correctInner.classList.remove('text-blue-800', 'text-purple-800', 'text-green-800');
                            correctInner.classList.add('text-red-800');
                        }
                        
                        // 移除震動效果
                        setTimeout(() => { cInner.classList.remove('shake-error'); }, 600);
                    }
                    
                    // 取消舊規則：不再於「該題無法再得分」時彈出提示提醒（避免在困難模式首次失誤即觸發）

                    // 新規則：統計本關「完全答錯」題數；同一關中任兩題完全答錯時，若本局尚未提醒且仍有提示次數，顯示一次提醒
                    // Hint rule: count per-level fully-wrong questions; on the 2nd fully wrong,
                    // show a one-time hint reminder for this run if hints remain.
                    try {
                        gameState.levelFailedCount = (gameState.levelFailedCount || 0) + 1;
                        if (gameState.levelFailedCount >= 2 && !gameState.firstNoScoreMissToastShown && gameState.hintsRemaining > 0) {
                            showCuteHint('陷入苦戰了嗎？不妨點擊提示功能！', 'amber', 3200, '💡');
                            gameState.firstNoScoreMissToastShown = true;
                        }
                    } catch (_) {}

                    // 刷新倒數條：該題最終判定為答錯時（非僅失誤）立即重置
                    try { gameState.levelStartTime = Date.now(); } catch(_) {}

            // 新規則：當本關「剩 2 題」時，若其中一題被判定為錯（本段即處理該題），
            // 另一題將直接判定為答錯，並進入下一關（無額外扣分動畫）
            // New rule: when a level has 2 questions remaining and one just became wrong,
            // auto-mark the other remaining question as wrong and proceed (no extra penalty animation)
                    try {
                        const total = Array.isArray(gameState.questionData) ? gameState.questionData.length : 0;
                        if (total > 0) {
                            const remaining = [];
                            for (let i = 0; i < total; i++) {
                                const vc = document.querySelector(`#gameVerses [data-index="${i}"]`);
                                if (!vc) continue;
                                const isDoneWrong = vc.classList.contains('bg-red-100');
                                const isDoneRight = vc.classList.contains('bg-green-100');
                                if (!isDoneWrong && !isDoneRight) remaining.push(i);
                            }
                // 若在本題被判錯後只剩 1 題未完成，表示原先剩 2 題，依規則將最後一題直接判錯
                if (remaining.length === 1) {
                                const remIdx = remaining[0];
                                const q = gameState.questionData[remIdx];
                                // 將剩餘題目直接標記為錯誤（不顯示扣分動畫，不更動分數）
                                gameState.questionAttempts[remIdx] = 0;
                                const remVerseCard = document.querySelector(`#gameVerses [data-index="${remIdx}"]`);
                                if (remVerseCard) {
                                    clearErrorState(remVerseCard);
                                    remVerseCard.classList.remove('bg-blue-50','border-blue-200','bg-yellow-100','border-yellow-300','bg-orange-100','border-orange-300','selected-verse');
                                    remVerseCard.classList.add('bg-red-100','border-red-300');
                                    remVerseCard.style.pointerEvents = 'none';
                                    const inner = remVerseCard.querySelector('div');
                                    if (inner) {
                                        inner.classList.remove('text-blue-800','text-yellow-800','text-orange-800','text-green-800');
                                        inner.classList.add('text-red-800');
                                    }
                                }
                                // 記錄一筆「無效」答題速度段（最後一題自動判錯）
                                try { if (typeof recordInvalidSpeedSegment==='function') recordInvalidSpeedSegment(); } catch(_) {}
                                // 同步標示正確答案章節（紅色）
                                try {
                                    let correctChapter = null;
                                    const allChapters = document.querySelectorAll('.chapter-card');
                                    for (let chapter of allChapters) {
                                        if (gameState.difficulty === 'easy' && q.pairId) {
                                            if (chapter.dataset.pairId && chapter.dataset.pairId === q.pairId) { correctChapter = chapter; break; }
                                        } else if (gameState.difficulty === 'normal') {
                                            if (chapter.dataset.book === q.book) { correctChapter = chapter; break; }
                                        } else {
                                            if (chapter.dataset.book === q.book && chapter.dataset.chapter === q.chapter) { correctChapter = chapter; break; }
                                        }
                                    }
                                    if (correctChapter) {
                                        correctChapter.classList.remove('bg-green-100', 'border-green-300');
                                        correctChapter.classList.add('bg-red-100','border-red-300');
                                        correctChapter.classList.remove('bg-gradient-to-br','from-purple-50','to-purple-100','border-purple-300');
                                        correctChapter.style.pointerEvents = 'none';
                                        const ci = correctChapter.querySelector('div');
                                        if (ci) {
                                            ci.classList.remove('text-blue-800','text-purple-800','text-green-800');
                                            ci.classList.add('text-red-800');
                                        }
                                    }
                                } catch(_) {}

                                // 清理狀態並刷新進度（後續會有統一的完成檢查排程）
                                gameState.selectedVerseIndex = null;
                                if (typeof scheduleProgressUIUpdate === 'function') scheduleProgressUIUpdate({ question: true });
                                else updateQuestionOvals();
                                // 視圖回到前段面板
                                scrollToFrontPanel();
                            }
                        }
                    } catch(_) {}

                    // 移除選中狀態
                    gameState.selectedVerseIndex = null;
                    
                    // 更新題目進度顯示
                    if (typeof scheduleProgressUIUpdate === 'function') scheduleProgressUIUpdate({ question: true });
                    else updateQuestionOvals();
                    
                    // 檢查是否所有題目都完成（合併重複觸發）
                    scheduleLevelCompleteCheck(140);

                    // 若該題次數用盡，將視圖回到前段面板，方便使用者查看下一題
                    scrollToFrontPanel();
                } else {
                    // 還有機會，更新經文卡片顏色並保持選中狀態
                    // 不重置 currentQuestionStartTime，讓本題持續計時直至成功或最終錯誤
                    updateVerseCardColor(gameState.selectedVerseIndex);
                }
            }
        }

    function updateVerseCardColor(index) {
            const verseCard = document.querySelector(`#gameVerses [data-index="${index}"]`);
            if (!verseCard) return;
            
            const attempts = gameState.questionAttempts[index];
            const maxAttempts = { easy: 3, normal: 3, hard: 3 };
            const originalAttempts = maxAttempts[gameState.difficulty];
            
            // 移除所有顏色類別
            verseCard.classList.remove('bg-blue-50', 'border-blue-200', 'bg-yellow-100', 'border-yellow-300', 'bg-orange-100', 'border-orange-300', 'bg-red-100', 'border-red-300');
            
            // 若該經文還未作答（嘗試次數等於原始次數），一律顯示藍色
            if (attempts === originalAttempts) {
                verseCard.classList.add('bg-blue-50', 'border-blue-200');
                // 文字回復藍色
                const inner = verseCard.querySelector('div');
                if (inner) {
                    inner.classList.remove('text-red-800', 'text-purple-800', 'text-green-800');
                    inner.classList.add('text-blue-800');
                }
            } else {
                // 已經作答過但還有機會，根據剩餘次數顯示不同顏色
                if (attempts === 2) {
                    verseCard.classList.add('bg-yellow-100', 'border-yellow-300');
                    const inner = verseCard.querySelector('div');
                    if (inner) {
                        inner.classList.remove('text-red-800', 'text-blue-800', 'text-green-800');
                        inner.classList.add('text-yellow-800');
                    }
                } else if (attempts === 1) {
                    verseCard.classList.add('bg-orange-100', 'border-orange-300');
                    const inner = verseCard.querySelector('div');
                    if (inner) {
                        inner.classList.remove('text-red-800', 'text-blue-800', 'text-green-800');
                        inner.classList.add('text-orange-800');
                    }
                } else if (attempts === 0) {
                    verseCard.classList.add('bg-red-100', 'border-red-300');
                    const inner = verseCard.querySelector('div');
                    if (inner) {
                        inner.classList.remove('text-blue-800', 'text-yellow-800', 'text-orange-800', 'text-green-800');
                        inner.classList.add('text-red-800');
                    }
                }
            }
            
            // 更新題目進度顯示
            if (typeof scheduleProgressUIUpdate === 'function') scheduleProgressUIUpdate({ question: true });
            else updateQuestionOvals();
        }

    // 讓這些 UI 方法暴露給 engine，或者綁定在 global
    window.selectVerse = selectVerse;
    window.scrollToFrontPanel = scrollToFrontPanel;
    window.clearErrorState = clearErrorState;
    window.handleChapterClick = handleChapterClick;
    window.updateVerseCardColor = updateVerseCardColor;
