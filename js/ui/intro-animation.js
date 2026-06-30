    /*
     * Internal Change Log (Recent Batch: Accessibility + Performance + Docs)
     * A11y (Option A):
     *  - Added aria-describedby descriptions to modals: customBooks, fullLeaderboard, clearLeaderboard, devCommand, confirmBack, settings.
     *  - Added explicit ESC hints to close buttons via aria-label ("(Esc)").
     *  - Added sr-only descriptive paragraphs for contextual guidance (e.g., instructions & consequences).
     * Performance (Option C):
     *  - Deferred leaderboard preview population using requestIdleCallback / timeout fallback.
     *  - Deferred verse marquee initialization similarly to reduce first meaningful paint contention.
     *  - Prior earlier changes: start menu intro waits for startup-intro-finished event; removed heavy filters / 3D; releases will-change after animation.
     * Documentation (Option G):
     *  - This change log plus structured comments in modal manager & reduced motion sections serve as internal developer notes.
     * Follow-ups (Open Todos):
     *  - Add color contrast audit annotations (grays on 50% white backgrounds & small text).
     *  - Implement focus return origin tracking for multi-layer modal interactions.
     *  - Provide command reference list inside devCommandModal (currently summarized in sr-only text only).
     */
    // Start screen intro animation orchestrator
    (function(){
        function playStartMenuIntro(force){
            try {
                const start = document.getElementById('startScreen');
                if (!start || start.classList.contains('hidden')) return;
                // Prevent double play unless forced
                if (start.__introPlayed && !force) return;
                start.__introPlayed = true;
                const reduced = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || (window.innerWidth < 640);
                const cards = [
                    document.getElementById('titleCard'),
                    document.getElementById('modeStepCard'),
                    document.getElementById('modeCard'),
                    document.getElementById('rangeCard'),
                    document.getElementById('scoringCard'),
                    document.getElementById('leaderboardSection')
                ].filter(Boolean);
                if (reduced){
                    // 直接顯示，不做 stagger / 動畫
                    cards.forEach(el => {
                        el.classList.remove('intro-play');
                        if (!el.classList.contains('start-intro-card')) el.classList.add('start-intro-card');
                        el.style.removeProperty('--intro-delay');
                        // 立即覆蓋樣式
                        el.style.opacity = '1';
                        el.style.transform = 'none';
                        el.style.filter = 'none';
                    });
                    return;
                }
                let delay = 0;
                const step = 180; // doubled to match longer animation duration
                cards.forEach((el, idx) => {
                    // reset class state to allow replay
                    el.classList.remove('intro-play');
                    // base opacity 0 already via CSS class; ensure class present
                    if (!el.classList.contains('start-intro-card')) el.classList.add('start-intro-card');
                    // stagger delay (slightly accelerate later)
                    const localDelay = delay;
                    el.style.setProperty('--intro-delay', localDelay + 'ms');
                    requestAnimationFrame(()=>{ el.classList.add('intro-play'); });
                    delay += step - Math.min(100, idx*24); // keep acceleration proportional
                });
            } catch(e){ /* ignore */ }
        }
        // Expose for other modules
        window.playStartMenuIntro = playStartMenuIntro;

        // 僅在片頭結束後才播放主選單卡片的浮現效果
        (function(){
            const start = () => { try { playStartMenuIntro(); } catch(_) {} };
            // 優先在淡出開始時啟動，縮短空白時間；若錯過則在完成時再補一次（無害）
            window.addEventListener('startup-intro-fadeout', start, { once: true });
            window.addEventListener('startup-intro-finished', start, { once: true });
        })();

        // Performance: drop will-change after intro animations complete
        window.addEventListener('load', () => {
            try {
                const targets = ['titleCard','modeStepCard','modeCard','rangeCard','scoringCard','leaderboardSection']
                    .map(id=>document.getElementById(id)).filter(Boolean);
                targets.forEach(el => {
                    el.addEventListener('animationend', (ev) => {
                        if (ev.animationName === 'startCardIn') {
                            try { el.style.willChange = 'auto'; } catch(_) {}
                        }
                    }, { once: true });
                });
            } catch(_) {}
        });

        // When returning to menu (e.g., after game end) we observe startScreen visibility toggles
        // Skip flag: set true before顯示主選單時若不希望播放 intro（例如結算返回）
        if (!window.__skipStartMenuIntroOnce) window.__skipStartMenuIntroOnce = false;
        const observer = new MutationObserver(()=>{
            const start = document.getElementById('startScreen');
            if (!start) return;
            if (!start.classList.contains('hidden')) {
                // 決定是否播放 intro：若 skip 旗標為 true，僅重置並清除旗標不播放動畫
                if (window.__skipStartMenuIntroOnce) {
                    start.__introPlayed = true; // 標記為已播放，避免後續立即觸發
                    window.__skipStartMenuIntroOnce = false;
                } else {
                    start.__introPlayed = false; // 允許播放
                    setTimeout(()=> playStartMenuIntro(true), 50);
                }
            }
        });
        document.addEventListener('DOMContentLoaded',()=>{
            const start = document.getElementById('startScreen');
            if (start) observer.observe(start, { attributes:true, attributeFilter:['class'] });
        });
    })();
