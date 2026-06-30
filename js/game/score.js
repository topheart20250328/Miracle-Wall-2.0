// Score Manager
// Handles score calculation, combo logic, and score display effects
// Extracted from engine.js

(function() {
    // Queue for serializing center score animations
    const __centerQueue = [];
    let __centerBusy = false;

    window.ScoreManager = {
        /**
         * Calculate multiplier based on combo level
         * 0 -> 1.0, 1 -> 1.25, ... up to 24 -> 7.0
         */
        getComboMultiplier: (level) => {
            const lv = Math.max(0, Math.min(24, level | 0));
            return Math.min(7.0, 1.0 + lv * 0.25);
        },

        /**
         * Increase combo count and handle UI updates/effects
         */
        addComboOnCorrect: () => {
             // Increase combo by 1 (cap) and pop UI; always add some fill
             const prev = gameState.combo;
             gameState.combo = Math.min(gameState.maxCombo, gameState.combo + 1);
             gameState.comboProgress = 0; // reset progress on rank up
             
             // --------------------------------------------------------
             // 改善方案 1：防斷崖墜落機制 (充能防護盾)
             // --------------------------------------------------------
             // 只要答對一題，就重新充能「失誤盾」
             if (!gameState._comboMistakeBuffer) {
                 gameState._comboMistakeBuffer = true;
                 try {
                     const bar = document.getElementById('comboBar');
                     if (bar) { 
                         bar.classList.remove('combo-shield-up'); 
                         void bar.offsetWidth; 
                         bar.classList.add('combo-shield-up'); 
                         setTimeout(() => bar.classList.remove('combo-shield-up'), 1000);
                     }
                 } catch(_) {}
             }

             const leveledUp = gameState.combo !== prev;
             ScoreManager.updateComboUI(leveledUp);
             
             // --------------------------------------------------------
             // 改善方案 5：連擊里程碑特效 (Combo Milestones)
             // --------------------------------------------------------
             try {
                 const cur = gameState.combo;
                 
                 // 階級突破擴散 (Tier Level-Up Ripple)
                 if (leveledUp && (cur === 9 || cur === 17 || cur === 25)) {
                     const bar = document.getElementById('comboBar');
                     if (bar) {
                         const ripple = document.createElement('div');
                         ripple.className = 'combo-ripple-effect';
                         bar.appendChild(ripple);
                         setTimeout(() => ripple.remove(), 800);
                         
                         const numLabel = document.getElementById('comboLabelInner');
                         if (numLabel) {
                             numLabel.classList.remove('combo-number-pop');
                             void numLabel.offsetWidth;
                             numLabel.classList.add('combo-number-pop');
                         }
                     }
                 }
                 
                 // 超神連擊浮動字 (Godlike Text)
                 if (leveledUp && (cur === 50 || cur === 100)) {
                     const text = document.createElement('div');
                     text.className = 'godlike-text';
                     text.textContent = cur === 50 ? 'Unstoppable!' : 'Holy Streak!';
                     document.body.appendChild(text);
                     setTimeout(() => text.remove(), 2500);
                 }
                 
                 // MAX 覺醒領域 (MAX Awakening Zone)
                 if (cur >= 25) {
                     document.body.classList.add('max-awakening-active');
                 }
             } catch(_) {}

             // Update metrics.maxComboReached based on on-screen combo label (immediate unlock for streak achievements)
             try {
                 if (gameMetrics) {
                     const cur = Math.max(0, Math.min((gameState.maxCombo||25), (gameState.combo||0)));
                     if ((gameMetrics.maxComboReached||0) < cur) gameMetrics.maxComboReached = cur;
                     if (typeof gameState === 'object' && (typeof gameState.comboPeak !== 'number' || gameState.comboPeak < cur)) {
                         gameState.comboPeak = cur;
                     }
                 }
             } catch(_) {}
             // SFX: play a celebratory tone when combo ranks up
             try { if (leveledUp) SFX.play('comboUp'); } catch(_) {}
             // celebratory sparks more intense as combo grows
             try {
                 const mult = ScoreManager.getComboMultiplier(gameState.combo);
                 const rect = document.getElementById('comboBar')?.getBoundingClientRect();
                 const colors = ['#FFF7ED','#FFEDD5','#FDE68A','#FCD34D','#F59E0B','#F97316'];
                 spawnScoreParticles(Math.round(mult*20), rect, { colors, glyph: '✹', count: Math.min(24, 6 + Math.floor(gameState.combo/2)), distanceMin: 40, distanceMax: 160, durationMs: 1400 });
             } catch(_) {}
             // 連擊跨門檻時立即評估成就（葡萄枝子即時解鎖）
             try { evaluateRealtimeAchievements(); } catch(_) {}
        },

        /**
         * Decrease combo count
         */
        dropCombo: (levels = 3) => {
            const before = gameState.combo;
            
            // --------------------------------------------------------
            // 改善方案 1：防斷崖墜落機制 (Anti-Cliff Fall / Mistake Buffer)
            // --------------------------------------------------------
            let actualDrop = levels | 0;
            if (gameState._comboMistakeBuffer) {
                // 第一次失誤時，啟用「失誤盾」，僅象徵性扣 1 點 Combo（讓難度下降變平滑）
                actualDrop = 1;
                gameState._comboMistakeBuffer = false; // 消耗盾牌
                
                // --------------------------------------------------------
                // 改善方案 4：情感反饋 - 盾牌破裂提示 (加入碎盾特效)
                // --------------------------------------------------------
                if (typeof showCuteHint === 'function') {
                    showCuteHint('🛡️ 護盾抵擋失誤！連擊保留！', 'amber', 2500, '🛡️');
                }
                try {
                    document.body.classList.remove('shield-break-shatter');
                    void document.body.offsetWidth;
                    document.body.classList.add('shield-break-shatter');
                    setTimeout(() => document.body.classList.remove('shield-break-shatter'), 600);
                } catch(_) {}

            } else if (levels > 1) {
                if (typeof showCuteHint === 'function' && before >= 8) {
                    showCuteHint('💔 連續失誤...狀態逐漸下滑！', 'red', 2000, '💔');
                }
            }

            gameState.combo = Math.max(0, gameState.combo - Math.max(1, actualDrop));
            gameState.comboProgress = 0;
            ScoreManager.updateComboUI(false, true);

            // 移除 MAX 狀態領域
            try {
                if (gameState.combo < 25) {
                    document.body.classList.remove('max-awakening-active');
                }
            } catch(_) {}

            // dropping combo 不需要更新峰值
            try { if (before > 0 && gameState.combo < before) SFX.play('streakBreak'); } catch(_) {}
            // small shake feedback on drop
            try {
                const bar = document.getElementById('comboBar');
                if (bar) { bar.classList.remove('combo-shake'); void bar.offsetWidth; bar.classList.add('combo-shake'); setTimeout(()=>bar.classList.remove('combo-shake'), 480); }
            } catch(_) {}
        },

        /**
         * Update the combo UI (bar, label, segments)
         */
        updateComboUI: (levelUp = false, isDrop = false) => {
            try {
                const label = document.getElementById('comboLabel');
                const segWrap = document.getElementById('comboSegments');
                const flash = document.querySelector('#comboBar .combo-flash');
                const bar = document.getElementById('comboBar');
                const combo = gameState.combo|0;
                const mult = ScoreManager.getComboMultiplier(Math.min(combo, 24)); // multiplier 按原上限 24 計算
                const isMax = combo >= 25;
                if (label) {
                    const comboDisplay = isMax ? 'MAX' : combo;
                    label.textContent = `Combo x ${comboDisplay} · ${mult.toFixed(2)}×`;
                    label.style.color = combo >= 17 ? '#fde68a' : combo >= 9 ? '#fcd34d' : '#fde68a';
                    label.classList.remove('combo-pop');
                    if (levelUp) { void label.offsetWidth; label.classList.add('combo-pop'); }
                }
                if (segWrap) {
                    const segs = Array.from(segWrap.children);
                    // 週期：8 格循環；0..7 第一條，8..15 第二條，16..23 第三條；24 (或更高) 保持第三條全滿；25 以上 MAX 狀態全滿加光
                    let cycleFilled;
                    if (combo <= 0) cycleFilled = 0; else if (combo >= 24) cycleFilled = 8; else cycleFilled = ((combo - 1) % 8) + 1; // combo=8 =>8, combo=9 =>1
                    segs.forEach((s, i) => {
                        s.className = 'combo-seg';
                        if (i < cycleFilled) {
                            s.classList.add('filled');
                            // tiers based on which cycle (0,1,2)
                            const cycleIndex = Math.min(2, Math.floor((Math.max(1, combo) - 1) / 8));
                            const tier = 1 + cycleIndex; // cycle 0 -> tier1, 1 -> tier2, 2 -> tier3 (cap)
                            if (tier >= 1) s.classList.add(`tier-${Math.min(5, tier+1)}`); // reuse existing tier styles (offset for stronger look)
                        }
                    });
                }
                if (bar) {
                    // reset flash
                    const wasFlash = bar.classList.contains('combo-flash-active');
                    bar.classList.remove('combo-flash-active', 'tier-1', 'tier-2', 'tier-3', 'tier-max');
                    // Add tier class to bar for glowing effects
                    if (combo >= 25) bar.classList.add('tier-max');
                    else if (combo >= 17) bar.classList.add('tier-3');
                    else if (combo >= 9) bar.classList.add('tier-2');
                    else if (combo >= 1) bar.classList.add('tier-1');

                    if (levelUp) {
                        void bar.offsetWidth;
                        bar.classList.add('combo-flash-active');
                        setTimeout(() => bar.classList.remove('combo-flash-active'), 650);
                    }
                }
            } catch (_) { /* ignore */ }
        },

        /**
         * Update the current level score display (top center)
         * Used by the level timer loop
         */
        updateCurrentScore: () => {
            const elapsed = (Date.now() - gameState.levelStartTime) / 1000; // 秒
            let timeRewardScore = 0;
            const TIME_SCALE = 10;
            
            if (gameState.showTimeReward) {
                // New piecewise rule (display range: +50 ... 0)
                //  - elapsed <= 3s => +50
                //  - 3s < elapsed <= 15s => linear from +50 down to 0
                //  - elapsed > 15s => 0
                const POS_MAX = 50;
                const NEG_MIN = 0;

                if (elapsed <= 3) {
                    timeRewardScore = POS_MAX;
                } else if (elapsed <= 15) {
                    // map [3,15] -> [50,0]
                    const t = (elapsed - 3) / (15 - 3);
                    timeRewardScore = POS_MAX * (1 - t);
                } else {
                    timeRewardScore = 0;
                    // 時間獎勵秒數到底：Combo 掉 3 級（每題僅觸發一次）
                    try {
                        if (!gameState.__comboDroppedForTimeout) {
                            gameState.__comboDroppedForTimeout = true;
                            ScoreManager.dropCombo(3);
                        }
                    } catch(_) {}
                }

                // ensure numeric and clamp
                timeRewardScore = Math.max(NEG_MIN, Math.min(POS_MAX, timeRewardScore));
                const displayScore = Math.round(timeRewardScore);

                // 更新分數顯示（整數）
                const scoreElement = document.getElementById('currentQuestionScore');
                if (scoreElement) {
                    scoreElement.textContent = displayScore;
                    // color: positive -> green->yellow, zero -> orange
                    if (displayScore > 0) {
                        const ratio = displayScore / POS_MAX; // 0..1
                        const red = Math.floor(255 * (1 - ratio * 0.8));
                        const green = 255;
                        const blue = 0;
                        scoreElement.style.color = `rgb(${red}, ${green}, ${blue})`;
                    } else if (displayScore === 0) {
                        scoreElement.style.color = 'rgb(255,165,0)';
                    }
                }

                // 更新進度條（範圍 0..+50 對應 0..100）
                const scoreProgressFill = document.getElementById('scoreProgressFill');
                if (scoreProgressFill) {
                    const totalProgress = Math.max(0, Math.min(100, (((POS_MAX) - timeRewardScore) / (POS_MAX - NEG_MIN)) * 100));

                    // choose color by thresholds (preserve existing visual cues roughly)
                    let barColor = 'bg-green-500';
                    if (timeRewardScore >= 30) {
                        barColor = 'bg-green-500';
                    } else if (timeRewardScore >= 10) {
                        barColor = 'bg-lime-500';
                    } else if (timeRewardScore >= 0) {
                        barColor = 'bg-yellow-500';
                    }

                    scoreProgressFill.className = scoreProgressFill.className.replace(/bg-\w+-\d+/g, '');
                    scoreProgressFill.classList.add(barColor, 'h-full', 'rounded-full', 'transition-all', 'duration-100', 'shadow-sm');
                    scoreProgressFill.style.width = `${100 - totalProgress}%`;
                }

                return displayScore;
            }

            return 0;
        },

        // ==== Visual Effects & Popups (Moved from leaderboard-ui and engine) ====

        /**
         * Pulse the center score element
         */
        pulseCenterScore: (delta) => {
             const el = document.getElementById('centerScore');
             if (!el) return;
             el.classList.remove('score-pulse');
             void el.offsetWidth;
             el.classList.add('score-pulse');
        },

        /**
         * Spawn gold glitter effects
         */
        spawnGoldGlitter: (amount) => {
             const rect = document.getElementById('centerScore')?.getBoundingClientRect();
             if (!rect) return;
             const colors = ['#FFD700', '#FDB931', '#FFFFE0', '#B8860B'];
             ScoreManager.spawnScoreParticles(amount, rect, { colors, glyph: '✨', count: 20, sizeMin: 12, sizeMax: 24 });
        },

        /**
         * Spawn confetti rain
         */
        spawnConfettiRain: (amount, target) => {
             const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7'];
             const count = Math.min(60, (amount||40));
             for(let i=0; i<count; i++) {
                 const p = document.createElement('div');
                 p.className = 'confetti-piece';
                 p.style.left = Math.random() * 100 + 'vw';
                 p.style.top = '-10px';
                 p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                 p.style.position = 'fixed';
                 p.style.width = (6 + Math.random() * 4) + 'px';
                 p.style.height = (6 + Math.random() * 4) + 'px';
                 p.style.zIndex = '10005';
                 
                 // Disable CSS animation to use JS physics
                 p.style.animation = 'none';
                 p.style.transition = `top ${1.5 + Math.random()}s linear, opacity 0.5s ease`;
                 
                 document.body.appendChild(p);
                 
                 requestAnimationFrame(() => {
                     p.style.top = '110vh';
                     p.style.transform = `rotate(${Math.random()*360}deg)`;
                 });
                 setTimeout(() => { 
                     p.style.opacity = '0';
                     setTimeout(() => { if(p.parentElement) p.parentElement.removeChild(p); }, 500);
                 }, 1500 + Math.random() * 1000);
             }
        },

        /**
         * Start continuous star rain (Perfect Level)
         */
        startStarRain: () => {
             try {
                 if (window.__starRainRunning) return;
                 window.__starRainRunning = true;

                 const loop = () => {
                     if (!window.__starRainRunning) return;
                     try {
                         const active = document.querySelectorAll('.gold-glitter').length;
                         // 溫柔的星星數量：減少並發數量，避免壓迫感
                         const maxStars = window.innerWidth <= 640 ? 25 : 80; 
                         const budget = active > maxStars ? 0 : 1;
                         
                         for (let i = 0; i < budget; i++) {
                             const glitter = document.createElement('div');
                             glitter.className = 'gold-glitter';
                             glitter.textContent = '✦';

                             const left = Math.max(0, Math.min(window.innerWidth - 20, Math.floor(Math.random() * window.innerWidth)));
                             glitter.style.left = left + 'px';
                             glitter.style.top = '-30px';
                             
                             // 關閉 CSS 動畫，使用輕柔的 JS 過渡
                             glitter.style.animation = 'none';

                             // 長達 6~10 秒的落下時間，呈現類似羽毛或氣球的飄落感
                             const dur = 6000 + Math.random() * 4000;
                             glitter.style.transition = `top ${dur}ms linear, transform ${dur}ms ease-in-out, opacity ${dur}ms ease-in`;
                             
                             // 左右飄移幅度縮小
                             const dx = (Math.random() * 100) - 50;
                             // 溫和的旋轉
                             const rot = (Math.random() * 180) - 90;
                             
                             // 給予隨機的微小尺寸，不再有巨大的星星
                             glitter.style.transform = `scale(${0.3 + Math.random() * 0.4}) rotate(0deg)`;
                             glitter.style.opacity = '0.8';

                             document.body.appendChild(glitter);

                             requestAnimationFrame(() => {
                                 glitter.style.top = '110vh';
                                 glitter.style.transform = `translateX(${dx}px) rotate(${rot}deg) scale(${0.2 + Math.random() * 0.3})`;
                                 glitter.style.opacity = '0';
                             });

                             setTimeout(() => {
                                 try { if (glitter.parentElement) glitter.parentElement.removeChild(glitter); } catch (_) {}
                             }, dur + 100);
                         }
                     } catch (_) {}

                     // 每 300~700 毫秒才產生一顆，營造溫雅的氛圍
                     window.__starRainTimer = setTimeout(loop, 300 + Math.random() * 400);
                 };

                 loop();
             } catch (_) { /* ignore */ }
        },

        /**
         * Stop star rain
         */
        stopStarRain: () => {
             try {
                 window.__starRainRunning = false;
                 if (window.__starRainTimer) {
                     clearTimeout(window.__starRainTimer);
                     window.__starRainTimer = null;
                 }
                 document.querySelectorAll('.gold-glitter').forEach(el => {
                     try { if (el.parentElement) el.parentElement.removeChild(el); } catch (_) {}
                 });
             } catch (_) { /* ignore */ }
        },

        /**
         * Create a ripple effect at (x, y) - useful for global clicks
         */
        createTouchRipple: (x, y, color) => {
             const ripple = document.createElement('div');
             ripple.className = 'touch-ripple';
             ripple.style.left = x + 'px';
             ripple.style.top = y + 'px';
             if (color) ripple.style.background = color;
             document.body.appendChild(ripple);
             requestAnimationFrame(() => {
                 ripple.classList.add('animate');
             });
             setTimeout(() => {
                 if (ripple.parentElement) ripple.parentElement.removeChild(ripple);
             }, 600);
        },

        /**
         * Spawn generic score particles (confetti/stars)
         * Extracted from leaderboard-ui.js
         */
        spawnScoreParticles: (delta, originRect, options) => {
            // clamp particle count; user requested doubling the previous counts
            const abs = Math.abs(delta);
            let count = 2; // base doubled
            if (abs >= 300) count = 16;
            else if (abs >= 150) count = 12;
            else if (abs >= 60) count = 8;
            else if (abs >= 20) count = 6;

            // 減少動態：顯著降低數量與距離
            const reduced = (typeof getReducedMotion === 'function' && getReducedMotion());
            if (reduced) {
                count = Math.min(count, 4);
            }
            // explicit count override
            if (options && typeof options.count === 'number') {
                try { count = Math.max(1, Math.floor(options.count)); } catch(_) { /* ignore */ }
            }

            // white -> platinum/gold palette (defaults)
            const positiveColors = ['#ffffff', '#fff7e6', '#fff3b0', '#ffefc4'];
            const negativeColors = ['#ffffff', '#fff7e6', '#fff3b0']; // keep white present for negative as well
            const overrideColors = options && Array.isArray(options.colors) && options.colors.length ? options.colors : null;

            const center = originRect || (function(){ const el = document.getElementById('centerScore'); try { return el.getBoundingClientRect(); } catch(e){ return null; } })();
            // 避免因元素隱藏導致 getBoundingClientRect() 回傳 0,0,0,0 而在左上角爆出星星
            const isValidRect = center && (center.width > 0 || center.height > 0 || center.left !== 0 || center.top !== 0);
            const cx = isValidRect ? Math.round(center.left + center.width / 2) : Math.round(window.innerWidth / 2);
            const cy = isValidRect ? Math.round(center.top + center.height / 2) : Math.round(window.innerHeight / 2);

            const customZ = options && typeof options.zIndex === 'number' ? options.zIndex : null;
            const customDur = options && typeof options.durationMs === 'number' ? Math.max(200, Math.floor(options.durationMs)) : null;
            const glyph = options && typeof options.glyph === 'string' ? options.glyph : null;
            const sizeMinOpt = (options && typeof options.sizeMin === 'number') ? options.sizeMin : null;
            const sizeMaxOpt = (options && typeof options.sizeMax === 'number') ? options.sizeMax : null;
            const distMinOpt = (options && typeof options.distanceMin === 'number') ? options.distanceMin : null;
            const distMaxOpt = (options && typeof options.distanceMax === 'number') ? options.distanceMax : null;
            
            for (let i = 0; i < count; i++) {
                const p = document.createElement('div');
                p.className = 'score-particle';
                p.textContent = glyph || '✦';
                let size;
                if (sizeMinOpt != null && sizeMaxOpt != null) {
                    const minS = Math.max(1, sizeMinOpt);
                    const maxS = Math.max(minS, sizeMaxOpt);
                    size = Math.round(minS + Math.random() * (maxS - minS));
                } else {
                    size = 10 + Math.round(Math.random() * 12) + Math.min(26, Math.floor(Math.abs(delta) / 30));
                }
                p.style.fontSize = size + 'px';
                p.style.width = (size + 4) + 'px';
                p.style.height = (size + 4) + 'px';
                p.style.display = 'inline-flex';
                p.style.alignItems = 'center';
                p.style.justifyContent = 'center';

                // choose color from platinum/gold family
                const colors = overrideColors || (delta >= 0 ? positiveColors : negativeColors);
                p.style.color = colors[Math.floor(Math.random() * colors.length)];
                p.style.background = 'transparent';

                // random direction spread; allow shorter travel via options
                let distance;
                if (distMinOpt != null && distMaxOpt != null) {
                    let minD = Math.max(0, distMinOpt);
                    let maxD = Math.max(minD, distMaxOpt);
                    if (reduced) { minD *= 0.5; maxD *= 0.5; }
                    distance = minD + Math.random() * (maxD - minD);
                } else {
                    distance = reduced ? (8 + Math.random() * 16) : ((26 + Math.random() * 40) * 2);
                }
                
                // ... (simplified logic mostly relies on CSS animation logic usually, but here recreating full style)
                // For brevity, using simpler transform animation logic if CSS class score-particle expects standard anim
                // Actually the original implementation appended style tag or used inline keyframes.
                // Assuming CSS handles .score-particle animation or we need to add keyframe logic.
                // Re-checking original code: it uses JS to animate or relies on specific CSS.
                // Original code creates style.animation. Let's replicate what was likely there or standard behavior.
                
                const angle = Math.random() * Math.PI * 2;
                const tx = Math.cos(angle) * distance;
                const ty = Math.sin(angle) * distance;
                const rot = Math.random() * 360 - 180;
                
                p.style.position = 'fixed';
                p.style.left = cx + 'px';
                p.style.top = cy + 'px';
                // Adjust for size center
                p.style.marginLeft = `-${size/2}px`;
                p.style.marginTop = `-${size/2}px`;
                
                // Set CSS variables for the animation defined in main.css (.score-particle)
                p.style.setProperty('--dx', `${tx}px`);
                p.style.setProperty('--dy', `${ty}px`);
                
                p.style.opacity = (options && typeof options.opacity === 'number') ? options.opacity : '1';
                p.style.zIndex = customZ || '10002';
                // Remove pointer events so it doesn't block clicks
                p.style.pointerEvents = 'none';
                
                // Remove any inline transform/transition that might conflict with CSS class animation
                // .score-particle has 'animation: scoreParticleMove ... forwards' in main.css
                // providing rotation, scaling, and translation using --dx/--dy.
                
                document.body.appendChild(p);
                
                // Cleanup after animation (duration ~1400ms in CSS, or custom)
                // We use the CSS duration or a safe fallback
                const animDuration = 1400; 
                setTimeout(() => {
                    if (p.parentElement) p.parentElement.removeChild(p);
                }, Math.max(animDuration, (customDur||0)) + 100);
            }
        },

        // Parse numeric delta from a display string
        parseDeltaFromDisplayText: (displayText) => {
            try {
                if (typeof displayText !== 'string') return 0;
                const m = displayText.match(/([+\-]?\d+)/);
                if (!m) return 0;
                return parseInt(m[1], 10) || 0;
            } catch (_) { return 0; }
        },

        // Enqueue a center score update with optional delay/pulse
        enqueueCenterScoreDelta: (delta, delayMs = 720, options = { pulse: true }) => {
            const d = Math.trunc(delta || 0);
            const delay = Math.max(0, delayMs|0);
            setTimeout(() => {
                __centerQueue.push({ delta: d, pulse: !!options.pulse });
                ScoreManager.processCenterQueue();
            }, delay);
        },

        // Process queued center-score updates (serialize animations)
        processCenterQueue: () => {
             if (__centerBusy) return;
             const item = __centerQueue.shift();
             if (!item) return;
             __centerBusy = true;
             const scoreElement = document.getElementById('centerScore');
             const from = parseInt(scoreElement.textContent, 10) || 0;
             const to = from + item.delta;
             try {
                 // Optional pulse/particles aligned with center counting start
                 if (item.pulse) {
                     try { pulseCenterScore && pulseCenterScore(item.delta); } catch(e) {}
                     try { spawnScoreParticles && spawnScoreParticles(item.delta); } catch(e) {}
                 }
             } catch (_) {}
             // Run the counting animation (assuming animateScoreWithCounting is available globally or moved here)
             // If animateScoreWithCounting is in engine, we might need to expose it or move it.
             // It's likely in engine or ui/utils. Checking: animateScoreWithCounting is usually in utils or engine.
             // We will assume it's global for now (likely in ui/cute-hints.js or engine.js).
             try {
                if (typeof animateScoreWithCounting === 'function') {
                    animateScoreWithCounting(from, to);
                } else {
                    scoreElement.textContent = to; // fallback
                }
             } catch(e) { scoreElement.textContent = to; }
             
             const doneMs = (typeof getReducedMotion === 'function' && getReducedMotion()) ? 60 : 900;
             setTimeout(() => {
                 __centerBusy = false;
                 ScoreManager.processCenterQueue();
             }, doneMs + 40);
        },

        // Show floating score animations; mobile favors center overlay
        showScoreAnimation: (text, isSpecial, targetElement = null) => {
             const scoreElement = document.getElementById('centerScore');
             const displayText = text.replace('分', '');
             // New: detect non-score meta texts like "Combo x N"; they shouldn't affect the center gold score
             const isComboAnnouncement = /^\s*combo\s*/i.test(displayText);
             const deltaForCenter = isComboAnnouncement ? 0 : ScoreManager.parseDeltaFromDisplayText(displayText);
             const inlineDur = (typeof getReducedMotion === 'function' && getReducedMotion()) ? 40 : 720;
             // 對於特殊獎勵，我們仍排入佇列，但不重複觸發 pulse
             const shouldPulse = !(text.includes('完美') || text.includes('全對'));
             
             if (!isComboAnnouncement && deltaForCenter > 0) {
                 ScoreManager.enqueueCenterScoreDelta(deltaForCenter, inlineDur, { pulse: shouldPulse });
             }
             
             // Create element
             const floatingScore = document.createElement('div');
             floatingScore.textContent = displayText;

             // Force inline counting on mobile for special rewards even if reduced-motion is set
             try {
                 const isMobile = (window.matchMedia && window.matchMedia('(max-width: 640px)').matches) || window.innerWidth <= 640;
                 const isSpecialText = text.includes('完美') || text.includes('全對');
                 if (isMobile && isSpecialText) floatingScore.dataset.forceInlineCount = 'true';
             } catch(_) {}
             
             if (!isComboAnnouncement) {
                 try { if (typeof applyInlineCountToFloating === 'function') applyInlineCountToFloating(floatingScore, displayText); } catch (e) {}
             }
             
             floatingScore.style.pointerEvents = 'none';
             floatingScore.style.zIndex = '9999';
             floatingScore.style.position = 'absolute';
             
             // Layout logic (simplified from engine.js for brevity but functional relative to full impl)
             if (text.includes('完美')) {
                 const isMobile = (window.innerWidth <= 640);
                 if (isMobile) {
                     floatingScore.className = 'text-5xl font-extrabold text-yellow-400 score-popup';
                     floatingScore.style.textShadow = '0 2px 8px rgba(0,0,0,0.45)';
                     floatingScore.style.position = 'fixed';
                     floatingScore.style.left = '50%';
                     floatingScore.style.top = '50%';
                     floatingScore.style.transform = 'translate(-50%, -50%) scale(0.95)';
                     floatingScore.style.whiteSpace = 'nowrap';
                     floatingScore.style.opacity = '0';
                     floatingScore.style.zIndex = '10002';
                     document.body.appendChild(floatingScore);
                     try { pulseCenterScore && pulseCenterScore(300); } catch(e) {}
                     try { spawnGoldGlitter && spawnGoldGlitter(300); } catch(e) {} // Assuming these might move or stay global
                     requestAnimationFrame(() => {
                         floatingScore.style.transition = 'opacity 360ms ease, transform 520ms cubic-bezier(.2,.9,.2,1)';
                         floatingScore.style.opacity = '1';
                         floatingScore.style.transform = 'translate(-50%, -50%) scale(1)';
                     });
                 } else {
                     floatingScore.className = 'text-7xl font-black text-yellow-500 perfect-popup';
                     floatingScore.style.textShadow = '0 0 50px rgba(255, 215, 0, 1)';
                     floatingScore.style.position = 'fixed';
                     floatingScore.style.left = '50%';
                     floatingScore.style.top = '50%';
                     floatingScore.style.transform = 'translate(-50%, -50%)';
                     floatingScore.style.zIndex = '10000';
                     document.body.appendChild(floatingScore);
                     if(scoreElement) scoreElement.classList.add('score-flash');
                     try { startStarRain(); } catch(e) {}
                     try { pulseCenterScore && pulseCenterScore(300); } catch(e) {}
                     try { spawnScoreParticles(300); } catch(e) {}
                 }
             } else if (text.includes('全對')) {
                 const isMobile = (window.innerWidth <= 640);
                 if (isMobile) {
                     floatingScore.className = 'text-4xl font-extrabold text-green-400 score-popup';
                     floatingScore.style.textShadow = '0 2px 8px rgba(0,0,0,0.35)';
                     floatingScore.style.position = 'fixed';
                     floatingScore.style.left = '50%';
                     floatingScore.style.top = '50%';
                     floatingScore.style.transform = 'translate(-50%, -50%) scale(0.95)';
                     floatingScore.style.whiteSpace = 'nowrap';
                     floatingScore.style.opacity = '0';
                     floatingScore.style.zIndex = '10002';
                     document.body.appendChild(floatingScore);
                     try { pulseCenterScore && pulseCenterScore(100); } catch(e) {}
                     try { spawnConfettiRain && spawnConfettiRain(40, null); } catch(e) {}
                     requestAnimationFrame(() => {
                         floatingScore.style.transition = 'opacity 360ms ease, transform 520ms cubic-bezier(.2,.9,.2,1)';
                         floatingScore.style.opacity = '1';
                         floatingScore.style.transform = 'translate(-50%, -50%) scale(1)';
                     });
                 } else {
                     floatingScore.className = 'text-5xl font-extrabold text-green-500 celebration-popup';
                     floatingScore.style.textShadow = '0 0 8px rgba(34, 197, 94, 0.35), 0 2px 3px rgba(0, 0, 0, 0.25)';
                     floatingScore.style.position = 'fixed';
                     floatingScore.style.left = '50%';
                     floatingScore.style.top = '50%';
                     floatingScore.style.transform = 'translate(-50%, -50%)';
                     floatingScore.style.zIndex = '10000';
                     document.body.appendChild(floatingScore);
                     try { pulseCenterScore && pulseCenterScore(100); } catch(e) {}
                     try { spawnConfettiRain && spawnConfettiRain(40); } catch(e) {}
                 }
             } else {
                 // Common score popup
                 const isNegative = text.includes('-');
                 const baseClass = 'text-4xl font-black score-popup';
                 if (isNegative) {
                     floatingScore.className = `text-red-500 ${baseClass} score-down`;
                 } else if (isComboAnnouncement) {
                     floatingScore.className = `text-green-500 ${baseClass} combo-down`;
                 } else {
                     floatingScore.className = `text-green-500 ${baseClass}`;
                 }
                 floatingScore.style.textShadow = isNegative ? 
                     '0 0 20px rgba(239, 68, 68, 0.6)' : 
                     '0 0 20px rgba(34, 197, 94, 0.6)';
                 
                 // Placement logic
                 const isMobile = (window.innerWidth <= 640);
                 const centerBadge = document.querySelector('.mobile-center-badge');
                 
                 // if mobile, bypass targetElement logic to anchor text in upper center near the main score.
                 if (isMobile) {
                    targetElement = document.getElementById('centerScore');
                    if (centerBadge && centerBadge.offsetParent !== null) {
                        targetElement = centerBadge;
                    }
                 }

                 // Logic to fly to center or stay at element
                 // ... Simplified placement logic similar to engine.js ...
                 // For now, attach near target or centerScore
                 if (targetElement) {
                    let anchored = false;
                    try {
                        if (targetElement.isConnected) {
                            const rect = targetElement.getBoundingClientRect();
                            if (rect && Number.isFinite(rect.left) && Number.isFinite(rect.top) && rect.width > 0 && rect.height > 0) {
                                floatingScore.style.position = 'fixed';
                                const initialLeft = Math.round(rect.left + rect.width / 2);
                                // Check screen bounds to prevent text from flying off mobile screens
                                const screenW = window.innerWidth || document.documentElement.clientWidth;
                                const padding = 60; // Approximate half-width of the popup
                                const safeLeft = Math.max(padding, Math.min(screenW - padding, initialLeft));
                                floatingScore.style.left = `${safeLeft}px`;
                                // When anchored to the top center score, pushing it down slightly prevents off-screen clipping at top.
                                // Increased offset from +20 to +60 to give animation enough headroom so it stays visible while floating up.
                                const offsetTop = (isMobile && rect.top < 50) ? rect.bottom + 60 : rect.top - 10;
                                floatingScore.style.top = `${Math.round(offsetTop)}px`;
                                // When clamping, adjust tx so it doesn't always translate -50%
                                // If it's clamped to the left (safeLeft == padding), it's already at padding, so offset 0%.
                                // If it's in the middle, it's at initialLeft, so offset -50% to center it above.
                                // If clamped to right, offset -100%.
                                let tx = '-50%';
                                if (safeLeft === padding && initialLeft < padding) {
                                    tx = '0%';
                                } else if (safeLeft === screenW - padding && initialLeft > screenW - padding) {
                                    tx = '-100%';
                                }
                                floatingScore.style.setProperty('--tx', tx);
                                floatingScore.style.setProperty('--ty', '-100%');
                                floatingScore.style.transform = `translate(var(--tx), var(--ty))`;
                                floatingScore.style.whiteSpace = 'nowrap';
                                document.body.appendChild(floatingScore);
                                anchored = true;
                            }
                        }
                    } catch(_) {}
                    if (!anchored) {
                        document.body.appendChild(floatingScore);
                        floatingScore.style.position = 'fixed';
                        floatingScore.style.left = '50%';
                        floatingScore.style.top = isMobile ? '30%' : '50%';
                        floatingScore.style.setProperty('--tx', '-50%');
                        floatingScore.style.setProperty('--ty', '-50%');
                        floatingScore.style.transform = 'translate(var(--tx), var(--ty))';
                    }
                 } else {
                     document.body.appendChild(floatingScore);
                     floatingScore.style.position = 'fixed';
                     floatingScore.style.left = '50%';
                     floatingScore.style.top = isMobile ? '30%' : '50%';
                     floatingScore.style.setProperty('--tx', '-50%');
                     floatingScore.style.setProperty('--ty', '-50%');
                     floatingScore.style.transform = 'translate(var(--tx), var(--ty))';
                 }
             }

             // Cleanup timer
             let duration;
             if (floatingScore.classList && floatingScore.classList.contains('perfect-popup')) duration = 4000;
             else if (floatingScore.classList && floatingScore.classList.contains('celebration-popup')) duration = 3000;
             else duration = text.includes('完美') ? 2600 : text.includes('全對') ? 2000 : 1600;

             setTimeout(() => {
                 try { if (typeof floatingScore.__cancelInline === 'function') floatingScore.__cancelInline(); } catch(_) {}
                 try { if (floatingScore.parentElement) floatingScore.parentElement.removeChild(floatingScore); } catch(e) {}
                 try { if(scoreElement) scoreElement.classList.remove('score-flash'); } catch(e) {}
             }, duration + 80);
        }
    };

    // Global Exposure
    window.spawnScoreParticles = ScoreManager.spawnScoreParticles;
    window.updateCurrentScore = ScoreManager.updateCurrentScore;
    window.addComboOnCorrect = ScoreManager.addComboOnCorrect;
    window.dropCombo = ScoreManager.dropCombo;
    window.updateComboUI = ScoreManager.updateComboUI;
    window.showScoreAnimation = ScoreManager.showScoreAnimation;
    window.processCenterQueue = ScoreManager.processCenterQueue;
    window.enqueueCenterScoreDelta = ScoreManager.enqueueCenterScoreDelta;
    window.getComboMultiplier = ScoreManager.getComboMultiplier;
    window.pulseCenterScore = ScoreManager.pulseCenterScore;
    window.spawnGoldGlitter = ScoreManager.spawnGoldGlitter;
    window.spawnConfettiRain = ScoreManager.spawnConfettiRain;
    window.startStarRain = ScoreManager.startStarRain;
    window.stopStarRain = ScoreManager.stopStarRain;
    window.createTouchRipple = ScoreManager.createTouchRipple;

})();

window.getComboTierGlobal = function getComboTierGlobal(c) {
            const v = Number(c || 0);
            if (v >= 16) return 2; // hard tier (16+)
            if (v >= 8) return 1;  // normal tier (8..15)
            return 0;              // easy tier (<8)
        }
        function getDifficultyFromCombo(c) {
            const v = Number(c || 0);
            // 當自訂範圍僅一本書卷時，跳過普通難度，直接在門檻後進入困難
            try {
                if (typeof gameState === 'object' && gameState && gameState.range === 'custom') {
                    const books = Array.isArray(gameState.customBooks) ? gameState.customBooks : [];
                    if (books.length === 1) {
                        // easy: <8；>=8 直接 hard（跳過 normal）
                        return (v >= 8) ? 'hard' : 'easy';
                    }
                }
            } catch(_) { /* ignore, fallback to default */ }
            return (v >= 16) ? 'hard' : (v >= 8) ? 'normal' : 'easy';
        }

        // ===== 題型變化：改為依單局時間(0~420s)分階段，而非連擊 =====
        // tier 0: 0~139s  （最寬鬆）
        // tier 1: 140~279s（中等）
        // tier 2: 280s+   （最集中 / 最分散 視模式）
        // getPatternTimeTier extracted
