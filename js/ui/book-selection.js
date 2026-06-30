// Extracted from bible-challenge.html
// book-selection.js

function escapeHtmlBook(text) {
        const value = text == null ? '' : String(text);
        return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

function initializeCustomBooks() {
            // 這個函數現在只是為了保持兼容性，實際初始化在各自的函數中進行
        }

    // 初始化展開卡片中的自訂書卷按鈕（響應式網格與觸控友善）
    // Initialize buttons for expand-card grid; mobile-friendly.
    // 初始化展開卡清單與勾選狀態
    // Initialize expand-card list and checks
    function initializeCustomBooksInExpandCard() {
            const container = document.querySelector('#customBooksExpandCard #customBooksExpand');
            container.innerHTML = '';
            const allBooks = [...bibleBooks.old, ...bibleBooks.new];
            allBooks.forEach(book => {
                const isSelected = gameState.customBooks.includes(book);
                const abbreviation = bookAbbreviations[book] || book;
                const btn = document.createElement('button');
                btn.type = 'button';
                // larger tappable target, centered abbreviation, visual selected state
                // don't force full width so grid can place multiple items per row on small screens
                btn.className = `inline-flex items-center justify-center px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-150 ${isSelected ? 'bg-orange-400 text-white border-orange-600 shadow-md scale-105' : 'bg-white text-gray-700 border-gray-300 hover:bg-orange-50'}`;
                btn.style.minWidth = '64px';
                btn.style.width = 'auto';
                btn.title = book;
                btn.textContent = abbreviation;
                btn.setAttribute('data-book', book);
                btn.addEventListener('click', function(ev) {
                    // avoid bubbling to the card toggle handler which collapses the panel
                    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
                    if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
                    // toggle selection state
                    if (gameState.customBooks.includes(book)) {
                        gameState.customBooks = gameState.customBooks.filter(b => b !== book);
                    } else {
                        gameState.customBooks.push(book);
                    }
                    // re-render to reflect selection
                    initializeCustomBooksInExpandCard();
                    
                    updateStartButtonState();
                });
                container.appendChild(btn);
            });
            // ensure the container uses an auto-fit responsive grid so many items can appear per row on narrow screens
            container.style.gridTemplateColumns = 'repeat(auto-fit, minmax(64px, 1fr))';
        }

    // 初始化彈窗中的自訂書卷清單（tile 網格 + checkbox）
    // Initialize modal tile grid with checkboxes for books.
    // 初始化對話框清單與勾選狀態
    // Initialize modal list and checks
    function initializeCustomBooksInModal() {
            const container = document.querySelector('#customBooksModal #customBooks');
            container.innerHTML = ''; // 清空容器

            // render as responsive auto-fit grid of tiles for easier mobile tapping
            container.className = 'grid gap-2 mb-4 max-h-64 overflow-y-auto';
            container.style.gridTemplateColumns = 'repeat(auto-fit, minmax(80px, 1fr))';

            const allBooks = [...bibleBooks.old, ...bibleBooks.new];

            allBooks.forEach(book => {
                const isSelected = gameState.customBooks.includes(book);
                const safeBook = escapeHtmlBook(book);
                const tile = document.createElement('label');
                // use inline-flex so tiles can size to the grid cell and allow multiple per row
                tile.className = `relative cursor-pointer select-none inline-flex items-center justify-center rounded-lg p-2 text-center border ${isSelected ? 'bg-orange-400 text-white border-orange-600 shadow-md' : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50'}`;
                tile.style.minHeight = '44px';
                tile.style.alignItems = 'center';
                tile.style.justifyContent = 'center';
                tile.setAttribute('data-book', book);

                tile.innerHTML = `
                    <input type="checkbox" class="absolute left-2 top-2" ${isSelected ? 'checked' : ''} />
                    <div class="flex items-center justify-center h-full">
                        <div class="text-sm font-medium truncate" title="${safeBook}">${safeBook}</div>
                    </div>
                `;

                const input = tile.querySelector('input');
                if (input) input.setAttribute('data-book', book);

                container.appendChild(tile);

                // toggle when clicking tile or checkbox
                if (input) {
                    input.addEventListener('change', () => {
                        updateCustomBooks();
                    });
                }
                tile.addEventListener('click', (e) => {
                    // avoid double-toggling when clicking the checkbox
                    if (e.target === input) return;
                    if (!input) return;
                    input.checked = !input.checked;
                    updateCustomBooks();
                });
            });

            // 更新選擇數量顯示
            updateSelectedCount();
        }

    // 從展開卡片（按鈕）同步自訂選擇到狀態
    // Sync selected books from expand-card buttons into state.
    // 由展開卡回寫選擇
    // Sync selections from expand card to state
    function updateCustomBooksFromExpandCard() {
            const checkboxes = document.querySelectorAll('#customBooksExpandCard #customBooksExpand input[type="checkbox"]');
            gameState.customBooks = Array.from(checkboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.dataset.book);
            
            
            updateStartButtonState();
        }

    // 從彈窗（checkbox）同步自訂選擇到狀態
    // Sync selected books from modal checkboxes into state.
    // 統一回寫自訂書卷選擇（modal/expand）
    // Persist custom books selections into state
    function updateCustomBooks() {
            const checkboxes = document.querySelectorAll('#customBooksModal #customBooks input[type="checkbox"]');
            gameState.customBooks = Array.from(checkboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.dataset.book);
            
            updateSelectedCount();
        }

    // 更新彈窗中「已選 N 本」的計數顯示
    // Update the selected-count badge text in modal.
    // 更新己選書卷數顯示
    // Update selected-count badge
    function updateSelectedCount() {
            const countElement = document.querySelector('#customBooksModal #selectedCount');
            if (countElement) {
                countElement.textContent = `已選: ${gameState.customBooks.length}本`;
            }
        }

    // 清除所有自訂選擇（依所在介面：展開卡片或彈窗）
    // Clear all selected books from either expand-card or modal.
    // 清空所有勾選
    // Clear all selected books
    window.clearAllBooks = function clearAllBooks() {
            // 檢查是在擴展卡片還是模態視窗中
            const expandCardCheckboxes = document.querySelectorAll('#customBooksExpandCard #customBooksExpand input[type="checkbox"]');
            const modalCheckboxes = document.querySelectorAll('#customBooksModal #customBooks input[type="checkbox"]');
            
            if (expandCardCheckboxes.length > 0) {
                expandCardCheckboxes.forEach(cb => cb.checked = false);
                gameState.customBooks = [];
                
                updateStartButtonState();
                
                // 如果沒有選擇任何書卷，隱藏擴展卡片
                if (gameState.customBooks.length === 0) {
                    document.getElementById('customBooksExpandCard').classList.add('hidden');
                    // 取消自訂範圍選擇
                    gameState.range = null;
                    try { if (window.__applyModeUI) window.__applyModeUI(); } catch(_) {}
                    try { if (typeof highlightSelectedModeCard === 'function') highlightSelectedModeCard(null); } catch(_) {}
                    
                    updateStartButtonState();
                }
            } else if (modalCheckboxes.length > 0) {
                modalCheckboxes.forEach(cb => cb.checked = false);
                gameState.customBooks = [];
                updateSelectedCount();
            }
        }
        
    // 在彈窗與展開卡片中以輸入框關鍵字過濾書卷清單
    // Filter book tiles/buttons by search term.
    // 對話框內過濾書卷清單
    // Filter book list inside modal
    window.filterBooks = function filterBooks() {
            const searchTerm = document.getElementById('bookSearch').value.toLowerCase();
            // target both modal tiles (label) and expand-card buttons
            const modalTiles = document.querySelectorAll('#customBooksModal #customBooks label');
            const expandBtns = document.querySelectorAll('#customBooksExpandCard #customBooksExpand button');
            modalTiles.forEach(tile => {
                const bookName = (tile.getAttribute('data-book') || tile.textContent || '').toLowerCase();
                tile.style.display = bookName.includes(searchTerm) ? '' : 'none';
            });
            expandBtns.forEach(btn => {
                const bookName = (btn.getAttribute('data-book') || btn.textContent || '').toLowerCase();
                btn.style.display = bookName.includes(searchTerm) ? '' : 'none';
            });
        }
        
    // 一鍵選取舊約所有書卷（支援展開卡片與彈窗兩種 UI）
    // Select all Old Testament books across both UIs.
    // 快速勾選舊約
    // Quick select Old Testament
    window.selectOldTestamentBooks = function selectOldTestamentBooks() {
            // 支援兩種 UI：擴展卡片（按鈕）與模態（勾選框）
            const expandButtons = document.querySelectorAll('#customBooksExpandCard #customBooksExpand button[data-book]');
            const modalCheckboxes = document.querySelectorAll('#customBooksModal #customBooks input[type="checkbox"]');

            if (expandButtons.length > 0) {
                const set = new Set(gameState.customBooks);
                bibleBooks.old.forEach(b => set.add(b));
                gameState.customBooks = Array.from(set);
                initializeCustomBooksInExpandCard();
                
                updateStartButtonState();
            }
            if (modalCheckboxes.length > 0) {
                modalCheckboxes.forEach(cb => {
                    if (bibleBooks.old.includes(cb.dataset.book)) {
                        cb.checked = true;
                    }
                });
                updateCustomBooks();
            }
        }
        
    // 一鍵選取新約所有書卷（支援展開卡片與彈窗兩種 UI）
    // Select all New Testament books across both UIs.
    // 快速勾選新約
    // Quick select New Testament
    window.selectNewTestamentBooks = function selectNewTestamentBooks() {
            // 支援兩種 UI：擴展卡片（按鈕）與模態（勾選框）
            const expandButtons = document.querySelectorAll('#customBooksExpandCard #customBooksExpand button[data-book]');
            const modalCheckboxes = document.querySelectorAll('#customBooksModal #customBooks input[type="checkbox"]');

            if (expandButtons.length > 0) {
                const set = new Set(gameState.customBooks);
                bibleBooks.new.forEach(b => set.add(b));
                gameState.customBooks = Array.from(set);
                initializeCustomBooksInExpandCard();
                
                updateStartButtonState();
            }
            if (modalCheckboxes.length > 0) {
                modalCheckboxes.forEach(cb => {
                    if (bibleBooks.new.includes(cb.dataset.book)) {
                        cb.checked = true;
                    }
                });
                updateCustomBooks();
            }
        }

    // 自訂專區：快速勾選工具
    function applyQuickSelectBooks(books, replace = false) {
            try {
                const all = Array.isArray(books) ? books : [];
                const universe = [...bibleBooks.old, ...bibleBooks.new];
                // 若 replace=true 代表此為「套用或切換」模式（可作為 toggle）
                if (replace) {
                    // 判斷：若 all 中所有書卷都已包含於 customBooks，代表再次點擊 → 執行『移除這一組』
                    const allSelected = all.every(b => gameState.customBooks.includes(normalizeBookName(b)));
                    if (allSelected) {
                        gameState.customBooks = gameState.customBooks.filter(b => !all.map(normalizeBookName).includes(b));
                        showCuteHint(`已取消：${all.length} 本（剩餘 ${gameState.customBooks.length}）`, 'rose', 1400, '🧩');
                    } else {
                        // 加入缺少的書卷
                        const set = new Set(gameState.customBooks || []);
                        all.forEach(b => { const full = normalizeBookName(b); if (full && universe.includes(full)) set.add(full); });
                        gameState.customBooks = Array.from(set);
                        showCuteHint(`加入 ${all.length} 本；共 ${gameState.customBooks.length} 本`, 'blue', 1400, '🧩');
                    }
                } else {
                    const set = new Set(gameState.customBooks || []);
                    all.forEach(b => { const full = normalizeBookName(b); if (full && universe.includes(full)) set.add(full); });
                    gameState.customBooks = Array.from(set);
                }
                gameState.range = 'custom';
                gameState.theme = null;
                initializeCustomBooksInExpandCard();
                
                updateStartButtonState();
                try { window.__applyModeUI && window.__applyModeUI(); } catch(_) {}
                try { window.__selectHomeMode && window.__selectHomeMode('custom'); } catch(_) {}
                // 更新快速按鈕視覺（高亮已完全包含的分類）
                refreshQuickSelectCategoryStates();
            } catch (_) { /* noop */ }
        }

    function refreshQuickSelectCategoryStates(){
        try {
            const categories = [
                { id:'qsOld',   list: bibleBooks.old },
                { id:'qsNew',   list: bibleBooks.new },
                { id:'qsLaw',   list: ['創世記','出埃及記','利未記','民數記','申命記'] },
                { id:'qsHistory', list: ['約書亞記','士師記','路得記','撒母耳記上','撒母耳記下','列王紀上','列王紀下','歷代志上','歷代志下','以斯拉記','尼希米記','以斯帖記'] },
                { id:'qsPoetry', list: ['約伯記','詩篇','箴言','傳道書','雅歌'] },
                { id:'qsProphets', list: ['以賽亞書','耶利米書','耶利米哀歌','以西結書','但以理書','何西阿書','約珥書','阿摩司書','俄巴底亞書','約拿書','彌迦書','那鴻書','哈巴谷書','西番雅書','哈該書','撒迦利亞書','瑪拉基書'] },
                { id:'qsGospels', list: ['馬太福音','馬可福音','路加福音','約翰福音'] },
                { id:'qsPaul', list: ['羅馬書','哥林多前書','哥林多後書','加拉太書','以弗所書','腓立比書','歌羅西書','帖撒羅尼迦前書','帖撒羅尼迦後書','提摩太前書','提摩太後書','提多書','腓利門書'] },
                { id:'qsGeneral', list: ['希伯來書','雅各書','彼得前書','彼得後書','約翰一書','約翰二書','約翰三書','猶大書','啟示錄'] }
            ];
            categories.forEach(cat => {
                const btn = document.getElementById(cat.id);
                if (!btn) return;
                const allIncluded = cat.list.every(b => gameState.customBooks.includes(normalizeBookName(b)));
                btn.classList.toggle('ring-2', allIncluded);
                btn.classList.toggle('ring-offset-1', allIncluded);
                btn.classList.toggle('font-bold', allIncluded);
                btn.style.opacity = allIncluded ? '1' : '';
            });
        } catch(_) {}
    }
    function quickSelectGospels(replace = false) {
    applyQuickSelectBooks(['馬太福音','馬可福音','路加福音','約翰福音'], !!replace);
        }
    function quickSelectLaw(replace=false){
    applyQuickSelectBooks(['創世記','出埃及記','利未記','民數記','申命記'],!!replace);
    }
    function quickSelectHistory(replace=false){
    applyQuickSelectBooks(['約書亞記','士師記','路得記','撒母耳記上','撒母耳記下','列王紀上','列王紀下','歷代志上','歷代志下','以斯拉記','尼希米記','以斯帖記'],!!replace);
    }
    function quickSelectPoetry(replace=false){
    applyQuickSelectBooks(['約伯記','詩篇','箴言','傳道書','雅歌'],!!replace);
    }
    function quickSelectProphets(replace=false){
    applyQuickSelectBooks(['以賽亞書','耶利米書','耶利米哀歌','以西結書','但以理書','何西阿書','約珥書','阿摩司書','俄巴底亞書','約拿書','彌迦書','那鴻書','哈巴谷書','西番雅書','哈該書','撒迦利亞書','瑪拉基書'],!!replace);
    }
    function quickSelectPaul(replace=false){
    applyQuickSelectBooks(['羅馬書','哥林多前書','哥林多後書','加拉太書','以弗所書','腓立比書','歌羅西書','帖撒羅尼迦前書','帖撒羅尼迦後書','提摩太前書','提摩太後書','提多書','腓利門書'],!!replace);
    }
    function quickSelectGeneral(replace=false){
    applyQuickSelectBooks(['希伯來書','雅各書','彼得前書','彼得後書','約翰一書','約翰二書','約翰三書','猶大書','啟示錄'],!!replace);
    }

    // 彈窗：全選所有書卷（checkbox）
    // Modal: select-all all books via checkboxes.
    // 一鍵全選（對話框）
    // Select all books in modal
    window.selectAllBooksInModal = function selectAllBooksInModal() {
            const modalCheckboxes = document.querySelectorAll('#customBooksModal #customBooks input[type="checkbox"]');
            modalCheckboxes.forEach(cb => cb.checked = true);
            updateCustomBooks();
        }

    // 展開卡片：全選所有書卷（按鈕）
    // Expand-card: select-all by toggling all buttons to selected state.
    // 一鍵全選（展開卡）
    // Select all books in expand card
    window.selectAllBooksInExpandCard = function selectAllBooksInExpandCard() {
            const allBooks = [...bibleBooks.old, ...bibleBooks.new];
            gameState.customBooks = allBooks.slice();
            initializeCustomBooksInExpandCard();
            
            updateStartButtonState();
        }
        
    // 展開卡片：依搜尋框即時過濾按鈕
    // Expand-card: filter buttons with instant search.
    // 展開卡過濾書卷清單
    // Filter book list in expand card
    window.filterBooksInExpandCard = function filterBooksInExpandCard() {
            const searchTerm = document.getElementById('bookSearchExpand').value.toLowerCase();
            // expand card uses buttons, target those
            const btns = document.querySelectorAll('#customBooksExpandCard #customBooksExpand button');
            btns.forEach(btn => {
                const bookName = (btn.getAttribute('data-book') || btn.textContent || '').toLowerCase();
                if (bookName.includes(searchTerm)) btn.style.display = '';
                else btn.style.display = 'none';
            });
        }
        
    // 展開卡片：清空所有選擇（保留卡片可見，保留自訂狀態）
    // Expand-card: clear selections, keep card visible, and keep custom range.
    // 清空展開卡勾選
    // Clear all selections in expand card
    window.clearAllBooksInExpandCard = function clearAllBooksInExpandCard() {
            // 擴展卡片使用按鈕，不存在 checkbox；直接清空選擇
            gameState.customBooks = [];
            initializeCustomBooksInExpandCard();
            
            updateStartButtonState();
        // 保持於自訂模式，讓提示顯示「自訂範圍至少選 1 本書卷」且停用開始
        // 若先前不在自訂，顯式切至自訂（正常情況下此函式只會在自訂展開面板中使用）
        gameState.range = 'custom';
        
        updateStartButtonState();
            // 也清除快速選擇分類按鈕的高亮效果（ring 等）
            try { refreshQuickSelectCategoryStates(); } catch(_) {}
        }

    // 根據目前設定與題庫可用性，更新「開始遊戲」按鈕的可用狀態與提示
    // Update start button enabled/disabled state based on selections and data availability.
    // 依設定與選擇狀態決定「開始遊戲」可用性
    // Enable/disable Start button based on selections
    function updateStartButtonState() {
            const startBtn = document.getElementById('startGameBtn');
            const hintElement = document.getElementById('gameStartHint');
            const confirmTitle = document.getElementById('confirmStartTitle');
            const equipCourseCard = document.getElementById('equipCourseCard');
            if (!startBtn || !hintElement) return;
            const startScreen = document.getElementById('startScreen');
            if (startScreen && startScreen.classList.contains('hidden')) return;
            if (!startBtn.dataset.defaultLabel) {
                startBtn.dataset.defaultLabel = (startBtn.textContent || '開始遊戲').trim();
                startBtn.dataset.defaultLetterSpacing = startBtn.style.letterSpacing || '';
                try {
                    const c = getComputedStyle(startBtn);
                    startBtn.dataset.defaultBgImage = c.backgroundImage || '';
                    startBtn.dataset.defaultBgColor = c.backgroundColor || '';
                    startBtn.dataset.defaultBoxShadow = c.boxShadow || '';
                } catch(_) {
                    startBtn.dataset.defaultBgImage = startBtn.style.backgroundImage || '';
                    startBtn.dataset.defaultBgColor = startBtn.style.backgroundColor || '';
                    startBtn.dataset.defaultBoxShadow = startBtn.style.boxShadow || '';
                }
            }
            const hasData = !!(
                (Array.isArray(window.__normalizedDB) && window.__normalizedDB.length > 0) ||
                (Array.isArray(window.verseDatabase) && window.verseDatabase.length > 0)
            );
            if (!hasData && !window.__externalVersesLoading) {
                const now = Date.now();
                const lastReqTs = Number(updateStartButtonState.__lastUrgentReqTs || 0);
                const lastErrorTs = Number(window.__externalVersesLastErrorTs || 0);
                const recentLoadError = lastErrorTs > 0 && (now - lastErrorTs) < 5000;
                if ((now - lastReqTs) > 700 && !recentLoadError) {
                    updateStartButtonState.__lastUrgentReqTs = now;
                    try { if (typeof requestUrgentVerseLoad === 'function') requestUrgentVerseLoad(false); } catch(_) {}
                }
            }
            const isLoadingData = !hasData && !!window.__externalVersesLoading && !(window && window.externalVersesLoadError);
            // 可以以「排行模式（選罕見度）」或「練習模式（選範圍）」開始
            const hasRanking = !!gameState.rarity;
            const hasPractice = !!gameState.range; // 包含 theme/testament/custom/all 任一
            const isCoreMode = (gameState.playMode === 'classic' || gameState.playMode === 'survival');
            const hasEquipSelected = !!(equipCourseCard && equipCourseCard.getAttribute('aria-pressed') === 'true');
            const hasEquipPending = !!gameState.__pendingEquipTier;
            let canStart = !!(((hasRanking || hasPractice || hasEquipPending) || isCoreMode) && hasData);
            
            // 檢查可開始條件：所有模式至少需有基本題數；「自訂範圍」在普通 >=3，本；簡單/困難 >=1 本
            if (canStart && hasPractice) {
                let availableVersesCount = 0;
                try {
                    const cache = updateStartButtonState.__countCache || (updateStartButtonState.__countCache = { key: '', value: 0, ts: 0 });
                    const key = [
                        gameState.range || '',
                        gameState.testament || '',
                        Array.isArray(gameState.customBooks) ? gameState.customBooks.join(',') : '',
                        gameState.rarity || '',
                        gameState.playMode || '',
                        window.__verseDatabaseScope || '',
                        hasData ? '1' : '0'
                    ].join('|');
                    const now = Date.now();
                    if (cache.key === key && (now - Number(cache.ts || 0)) < 400) {
                        availableVersesCount = Number(cache.value || 0);
                    } else {
                        availableVersesCount = getAvailableVersesQuickCount();
                        cache.key = key;
                        cache.value = availableVersesCount;
                        cache.ts = now;
                    }
                } catch(_) {
                    availableVersesCount = getAvailableVersesQuickCount();
                }
                // 自訂範圍：至少 1 本書卷
                if (gameState.range === 'custom' && gameState.customBooks.length < 1) { canStart = false; }
                canStart = canStart && availableVersesCount >= 5;
            }
            
            let desiredPulse = false;
            let desiredDisabled = true;
            let desiredCursor = 'not-allowed';
            let desiredOpacity = '0.6';
            let desiredLabel = startBtn.dataset.defaultLabel || '開始遊戲';
            let desiredLetterSpacing = startBtn.dataset.defaultLetterSpacing || '';
            let desiredBusy = 'false';
            let desiredHintText = '';
            let desiredHintOpacity = '1';
            let desiredModeTone = 'default';

            const resolveModeLabel = () => {
                if (hasEquipPending || hasEquipSelected) return '開始裝備課程';
                if (hasPractice) return '開始自訂練習';
                if (gameState.playMode === 'survival') return '開始生存計時';
                if (gameState.playMode === 'classic') return '開始闖關挑戰';
                return (startBtn.dataset.defaultLabel || '開始遊戲');
            };

            const resolveModeTone = () => {
                if (hasEquipPending || hasEquipSelected) return 'equip';
                if (hasPractice) return 'custom';
                if (gameState.playMode === 'survival') return 'survival';
                if (gameState.playMode === 'classic') return 'classic';
                return 'default';
            };

            if (canStart) {
                desiredPulse = true;
                desiredDisabled = false;
                desiredCursor = 'pointer';
                desiredOpacity = '1';
                desiredBusy = 'false';
                desiredLabel = resolveModeLabel();
                desiredLetterSpacing = '0.14em';
                desiredModeTone = resolveModeTone();
                const isShardWarm = !!(window.__usingShardBeforeFullReady && window.__verseDatabaseScope && window.__verseDatabaseScope !== 'full' && !window.__externalFullVersesReady);
                if (isShardWarm) {
                    desiredHintText = '已可開始；完整題庫仍在背景載入中…';
                    desiredHintOpacity = '1';
                } else if (gameState.range === 'custom' && gameState.customBooks.length > 0) {
                    desiredHintText = `已選 ${gameState.customBooks.length} 本書卷`;
                    desiredHintOpacity = '1';
                } else {
                    desiredHintText = '';
                    desiredHintOpacity = '0';
                }
            } else {
                desiredLabel = resolveModeLabel();
                desiredLetterSpacing = '0.14em';
                desiredModeTone = resolveModeTone();
                if (isLoadingData) {
                    desiredLabel = '題庫載入中…';
                    desiredLetterSpacing = '0.08em';
                    desiredBusy = 'true';
                    desiredModeTone = 'default';
                }

                if (!hasData) {
                    if (location && location.protocol === 'file:') {
                        desiredHintText = '需要透過本機伺服器開啟（如 VS Code Live Server 或 python -m http.server），file:// 無法載入題庫。';
                    } else if (window && window.externalVersesLoadError) {
                        desiredHintText = '題庫載入失敗，請重新整理（Ctrl+F5），或確認 external-verses.json 路徑/CORS 設定。';
                    } else {
                        desiredHintText = '正在載入題庫…';
                    }
                } else if (!hasRanking && !hasPractice && !isCoreMode && !hasEquipSelected) {
                    desiredHintText = '請先選擇模式（闖關 / 生存 / 裝備 / 自訂）';
                } else if (hasEquipSelected && !hasEquipPending) {
                    desiredHintText = '裝備課程請先選擇班級';
                } else if (gameState.range === 'custom') {
                    if (gameState.customBooks.length < 1) {
                        desiredHintText = '自訂範圍至少選 1 本書卷';
                    } else {
                        const cnt = gameState.customBooks.length;
                        desiredHintText = `已選 ${cnt} 本書卷；可用經文不足，請擴大或調整`;
                    }
                } else {
                    desiredHintText = '此設定可用經文不足，請擴大範圍或更換主題';
                }
            }

            const btnSig = [
                desiredPulse ? 1 : 0,
                desiredDisabled ? 1 : 0,
                desiredCursor,
                desiredOpacity,
                desiredLabel,
                desiredLetterSpacing,
                desiredBusy,
                desiredModeTone
            ].join('|');
            if (startBtn.dataset.uiSig !== btnSig) {
                startBtn.dataset.uiSig = desiredModeTone; // Pass modeTone natively for particles
                startBtn.classList.toggle('start-button-pulse', desiredPulse);
                startBtn.disabled = desiredDisabled;
                startBtn.style.cursor = desiredCursor;
                startBtn.style.opacity = desiredOpacity;
                startBtn.textContent = desiredLabel;
                startBtn.style.letterSpacing = desiredLetterSpacing;
                startBtn.setAttribute('aria-busy', desiredBusy);

                const setTone = (bgImage, bgColor, shadow, titleText, titleColor) => {
                    startBtn.style.backgroundImage = bgImage;
                    startBtn.style.backgroundColor = bgColor;
                    startBtn.style.boxShadow = shadow;
                    if (confirmTitle) {
                        confirmTitle.textContent = '確認並開始';
                        confirmTitle.style.color = '#374151'; // gray-700
                    }
                };
                switch (desiredModeTone) {
                    case 'classic':
                        setTone('linear-gradient(90deg, #f43f5e, #ec4899)', '', '0 10px 24px -8px rgba(244,63,94,0.55)');
                        break;
                    case 'survival':
                        setTone('linear-gradient(90deg, #10b981, #14b8a6)', '', '0 10px 24px -8px rgba(16,185,129,0.55)');
                        break;
                    case 'equip':
                        setTone('linear-gradient(90deg, #7c3aed, #6366f1)', '', '0 10px 24px -8px rgba(124,58,237,0.55)');
                        break;
                    case 'custom':
                        setTone('linear-gradient(90deg, #0ea5e9, #22d3ee)', '', '0 10px 24px -8px rgba(14,165,233,0.55)');
                        break;
                    default:
                        setTone(
                            startBtn.dataset.defaultBgImage || '',
                            startBtn.dataset.defaultBgColor || '',
                            startBtn.dataset.defaultBoxShadow || ''
                        );
                        break;
                }
            }

            const hintSig = `${desiredHintText}|${desiredHintOpacity}`;
            if (hintElement.dataset.uiSig !== hintSig) {
                hintElement.dataset.uiSig = hintSig;
                hintElement.textContent = desiredHintText;
                hintElement.style.opacity = desiredHintOpacity;
            }
        }

        // #region 核心遊戲流程
        

// ---------------------------------------------------- 
// Book Selection Bindings (Extracted from engine.js) 
// ---------------------------------------------------- 
function initBookSelectionUI() {
            // 書卷搜尋和快速選擇事件
            document.getElementById('bookSearch').addEventListener('input', filterBooks);
            document.getElementById('selectAllBooks').addEventListener('click', selectAllBooksInModal);
            document.getElementById('selectOldTestament').addEventListener('click', selectOldTestamentBooks);
            document.getElementById('selectNewTestament').addEventListener('click', selectNewTestamentBooks);
            
            // 自訂專區（固定面板）搜尋與操作
            document.getElementById('bookSearchExpand').addEventListener('input', filterBooksInExpandCard);
            document.getElementById('selectAllBooksExpand').addEventListener('click', selectAllBooksInExpandCard);
            document.getElementById('clearAllBooksExpand').addEventListener('click', clearAllBooksInExpandCard);
            // 快速選擇按鈕
            document.getElementById('qsOld').addEventListener('click', () => applyQuickSelectBooks(bibleBooks.old, true));
            document.getElementById('qsLaw').addEventListener('click', () => quickSelectLaw(true));
            document.getElementById('qsHistory').addEventListener('click', () => quickSelectHistory(true));
            document.getElementById('qsPoetry').addEventListener('click', () => quickSelectPoetry(true));
            document.getElementById('qsProphets').addEventListener('click', () => quickSelectProphets(true));
            document.getElementById('qsNew').addEventListener('click', () => applyQuickSelectBooks(bibleBooks.new, true));
            document.getElementById('qsGospels').addEventListener('click', () => quickSelectGospels(true));
            document.getElementById('qsPaul').addEventListener('click', () => quickSelectPaul(true));
            document.getElementById('qsGeneral').addEventListener('click', () => quickSelectGeneral(true));
            try { refreshQuickSelectCategoryStates(); } catch(_) {}

}
window.initBookSelectionUI = initBookSelectionUI;
