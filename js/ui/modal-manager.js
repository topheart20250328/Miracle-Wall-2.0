    // Unified Modal Manager
    // Usage:
    //  - openModal('modalId', { trigger: HTMLElement }) / closeModal('modalId') / closeAllModals()
    //  - In markup, add data-open-modal="modalId" to any button/link to open; data-close-modal to close
    //  - Add data-autofocus to the first field to focus when opened
    // Accessibility:
    //  - Provides focus trapping, ESC to close top-most modal, restores focus to trigger on close
    //  - Locks body scrolling while any modal is open
    // Reduced Motion:
    //  - If user prefers reduced motion, modal animations are suppressed (CSS + JS hints)
    (function(){
        if (window.__modalManager) return;
        const stack = []; // { id, trigger, lastFocus }
        let bodyScrollLocked = false;
        const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
        function lockScroll(){
            if (bodyScrollLocked) return; bodyScrollLocked = true; document.documentElement.style.setProperty('--scrollbar-width', (window.innerWidth - document.documentElement.clientWidth) + 'px');
            document.body.style.overflow='hidden';
        }
        function unlockScroll(){
            if (!bodyScrollLocked) return; bodyScrollLocked = false; document.body.style.overflow=''; document.documentElement.style.removeProperty('--scrollbar-width');
        }
        // 抽象化 Focus Trap API，方便外部/其他元件重用
        function __activateFocusTrap(modal){
            if(!modal || modal.__focusTrapActive) return;
            const nodes = Array.from(modal.querySelectorAll(focusableSelector)).filter(el=> el.offsetParent !== null || el.getBoundingClientRect().width);
            if (!nodes.length) return;
            const first = nodes[0], last = nodes[nodes.length-1];
            function handle(e){
                if (e.key !== 'Tab') return;
                if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
            }
            modal.__focusTrapHandler = handle;
            modal.__focusTrapActive = true;
            modal.addEventListener('keydown', handle);
        }
        function __deactivateFocusTrap(modal){
            if(!modal || !modal.__focusTrapActive) return;
            if (modal.__focusTrapHandler){ modal.removeEventListener('keydown', modal.__focusTrapHandler); }
            delete modal.__focusTrapHandler; delete modal.__focusTrapActive;
        }
        // 對外暴露（避免命名污染已加前綴）
        window.__activateFocusTrap = __activateFocusTrap;
        window.__deactivateFocusTrap = __deactivateFocusTrap;
        function reducedMotion(){ return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
        function openModal(id, opts){
            const modal = typeof id === 'string' ? document.getElementById(id) : id;
            if (!modal) return false;
            if (!modal.classList.contains('hidden')) { // already open – push again? skip
                return true;
            }
            // If this is the end-of-run modal, mark it as protected to avoid accidental closure in Survival
            try {
                const isViewing = modal.id === 'playerNameModal' && modal.dataset.viewingRecord === 'true';
                if (modal.id === 'playerNameModal' && !isViewing && window.gameState && window.gameState.gameCompleted) {
                    modal.dataset.protected = '1';
                    // Hide the top-right X button to reduce confusion
                    const x = modal.querySelector('[data-close-modal="playerNameModal"]');
                    if (x) x.classList.add('hidden');
                }
            } catch(_) {}
            const trigger = (opts && opts.trigger) || document.activeElement;
            modal.classList.remove('hidden');
            modal.setAttribute('aria-hidden','false');
            // layering
            stack.push({ id: modal.id, trigger });
            lockScroll();
            // focus
            const autoFocus = modal.querySelector('[data-autofocus]') || modal.querySelector('input, button, select, textarea');
            if (autoFocus) { setTimeout(()=>{ try { autoFocus.focus(); } catch(_){} }, 20); }
            __activateFocusTrap(modal);
            // animation: if reduced motion skip fade-in classes (could add) – currently rely on existing CSS
            if (reducedMotion()) { modal.style.animation='none'; }
            document.dispatchEvent(new CustomEvent('modal:opened', { detail:{ id: modal.id } }));
            return true;
        }
    function closeModal(id){
            let modal = null; let entryIndex=-1; let closedEntry=null;
            if (id){ modal = typeof id === 'string' ? document.getElementById(id) : id; }
            else if (stack.length){ const top = stack[stack.length-1]; modal = document.getElementById(top.id); }
            if (!modal) return false;
            // Prevent closing protected end-of-run modal unless explicitly allowed (not applied to viewingRecord mode)
            try {
                const isViewing = modal.id === 'playerNameModal' && modal.dataset.viewingRecord === 'true';
                if (modal.id === 'playerNameModal' && !isViewing && modal.dataset.protected === '1') {
                    // Allow close only when button carries data-allow-close or when we are navigating back to menu
                    const active = document.activeElement;
                    const allow = (active && active.hasAttribute && active.hasAttribute('data-allow-close'));
                    if (!allow) return false;
                }
            } catch(_) {}
            // remove from stack
            for (let i=stack.length-1;i>=0;i--){ if (stack[i].id === modal.id){ entryIndex=i; closedEntry = stack[i]; break; } }
            if (entryIndex>=0) stack.splice(entryIndex,1);
            __deactivateFocusTrap(modal);
            modal.classList.add('hidden');
            modal.setAttribute('aria-hidden','true');
            // restore focus: if still stacked, focus previous modal's trigger; else focus the trigger that opened this modal
            if (!stack.length){
                unlockScroll();
            }
            try {
                const top = stack[stack.length-1];
                const target = top && top.trigger ? top.trigger : (closedEntry && closedEntry.trigger ? closedEntry.trigger : null);
                if (target && typeof target.focus === 'function') target.focus();
            } catch(_) {}
            document.dispatchEvent(new CustomEvent('modal:closed', { detail:{ id: modal.id } }));
            return true;
        }
        function closeAll(){ while(stack.length) closeModal(stack[stack.length-1].id); }
        // Global key handlers
        document.addEventListener('keydown', e=>{
            if (e.key === 'Escape' && stack.length){ 
                // Block ESC for end-of-run modal (protected flag or gameCompleted true)
                const top = stack[stack.length-1];
                const el = top && document.getElementById(top.id);
                try {
                    if (el && el.id === 'playerNameModal') {
                        const onMenu = !!(document.getElementById('startScreen') && !document.getElementById('startScreen').classList.contains('hidden'));
                        const isViewing = el.dataset.viewingRecord === 'true';
                        // 新規則：不在主選單時 (遊戲途中/結算流程) 不允許 ESC 關閉
                        if (!onMenu) { e.stopPropagation(); return; }
                        if (!isViewing) {
                            const isProtected = el.dataset.protected === '1';
                            const runEnded = !!(window.gameState && window.gameState.gameCompleted);
                            if (isProtected || runEnded) { e.stopPropagation(); return; }
                        }
                    }
                } catch(_) {}
                e.stopPropagation(); closeModal(); 
            }
        }, true);
        // Backdrop click (only if click outside content) – delegate to all fixed modals with backdrop
        document.addEventListener('mousedown', e=>{
            const target = e.target;
            if (!(target instanceof HTMLElement)) return;
            if (target.getAttribute('role') === 'dialog'){ // click on backdrop wrapper
                // Defensive: NEVER allow end-of-run settlement to close via backdrop when a run just finished,
                // even if the protection flag wasn't set yet due to timing.
                try {
                    if (target.id === 'playerNameModal') {
                        const onMenu = !!(document.getElementById('startScreen') && !document.getElementById('startScreen').classList.contains('hidden'));
                        if (!onMenu) return; // 遊戲中禁止點擊外部關閉結算視窗
                        const isViewing = target.dataset.viewingRecord === 'true';
                        if (!isViewing) {
                            const isProtected = target.dataset.protected === '1';
                            const runEnded = !!(window.gameState && window.gameState.gameCompleted);
                            if (isProtected || runEnded) return; // block backdrop close
                        }
                    }
                } catch(_) {}
                closeModal(target.id);
            }
        });
        // Attribute delegation
        document.addEventListener('click', e=>{
            const t = e.target.closest('[data-open-modal],[data-close-modal]');
            if (!t) return;
            const openId = t.getAttribute('data-open-modal');
            const closeId = t.getAttribute('data-close-modal');
            if (openId){ e.preventDefault(); openModal(openId, { trigger: t }); }
            else if (closeId){ e.preventDefault(); closeModal(closeId); }
        });
        // Expose
        window.openModal = openModal;
        window.closeModal = closeModal;
        window.closeAllModals = closeAll;
        window.__modalManager = { openModal, closeModal, closeAll, stack };
    })();

window.ensureConfirmModalExists = function ensureConfirmModalExists() {
            if (document.getElementById('inPageConfirmModal')) return;
            const div = document.createElement('div');
            div.id = 'inPageConfirmModal';
            div.className = 'fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center hidden z-60';
            div.innerHTML = `
                <div class="cute-card bg-white p-6 max-w-lg mx-4 text-center rounded-xl">
                    <div id="inPageConfirmMessage" class="text-base text-gray-800 mb-4"></div>
                    <div class="flex gap-3 justify-center mt-4">
                        <button id="inPageConfirmYes" class="cute-button bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold">繼續</button>
                        <button id="inPageConfirmNo" class="cute-button bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-lg font-bold">取消</button>
                    </div>
                </div>
            `;
            document.body.appendChild(div);
            document.getElementById('inPageConfirmYes').addEventListener('click', () => {
                div.dataset.choice = 'yes';
                div.classList.add('hidden');
            });
            document.getElementById('inPageConfirmNo').addEventListener('click', () => {
                div.dataset.choice = 'no';
                div.classList.add('hidden');
            });
        }

    // 顯示一個頁內確認提示（非阻塞），供返回/關鍵操作使用
    // Show a lightweight in-page confirm for return/critical actions

window.showInPageConfirm = function showInPageConfirm(message) {
            return new Promise((resolve) => {
                ensureConfirmModalExists();
                const modal = document.getElementById('inPageConfirmModal');
                const msg = document.getElementById('inPageConfirmMessage');
                modal.dataset.choice = '';
                if (msg) msg.textContent = message || '';
                modal.classList.remove('hidden');

                // poll for choice (simple approach to avoid complex event plumbing)
                const interval = setInterval(() => {
                    const choice = modal.dataset.choice;
                    if (choice === 'yes' || choice === 'no') {
                        clearInterval(interval);
                        resolve(choice === 'yes');
                    }
                }, 100);
            });
        }

    // ...existing code...

    // 渲染本關題目卡片（經文卡＋章節卡）
    // Render question cards for the current level
