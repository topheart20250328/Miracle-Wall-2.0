        const SFX = (function(){
            let ctx = null, gain = null;
            let volume = 0.2; // default low volume
            function ensure(){
                if (ctx) return;
                try {
                    ctx = new (window.AudioContext || window.webkitAudioContext)();
                    gain = ctx.createGain();
                    gain.gain.value = volume;
                    gain.connect(ctx.destination);
                } catch(_) { /* audio unavailable */ }
            }
            function resume(){ 
                try { 
                    ensure(); 
                    if (ctx && ctx.state === 'suspended') {
                        ctx.resume(); 
                        // Play a silent oscillator to fully unlock iOS AudioContext
                        const o = ctx.createOscillator();
                        const g = ctx.createGain();
                        o.connect(g);
                        g.connect(gain);
                        g.gain.value = 0;
                        o.start(ctx.currentTime);
                        o.stop(ctx.currentTime + 0.001);
                    }
                } catch(_){} 
            }
            function setVolume(v){ try { ensure(); volume = Math.max(0, Math.min(1, Number(v)||0)); if (gain) gain.gain.value = volume; } catch(_){} }
            function envOsc({type='sine', freq=440, duration=0.12, attack=0.005, decay=0.08, detune=0, startAt=0}){
                ensure(); if (!ctx) return;
                const now = ctx.currentTime + (startAt||0);
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.type = type; o.frequency.value = freq; try { o.detune.value = detune; } catch(_){}
                o.connect(g); g.connect(gain);
                g.gain.setValueAtTime(0.0001, now);
                g.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + Math.max(0.001, attack));
                g.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(attack+decay, duration));
                o.start(now);
                o.stop(now + Math.max(attack+decay, duration) + 0.02);
            }
            function play(name){
                // small set: correct, wrong, uiOpen, uiClose, uiConfirm, comboUp
                if (!name) return;
                try {
                    if(!window.gameState) window.gameState={};
                    if(!gameState.__sfxFlags) gameState.__sfxFlags=new Set();
                    // 僅紀錄成就相關的事件
                    const trackable = ['correct','wrong','comboUp','streakBreak','hint','replayStart','survivalRescue'];
                    if(trackable.includes(name)) gameState.__sfxFlags.add(name);
                } catch(_) {}
                switch(name){
                    case 'correct':
                        // 輕快「叮」：短促高頻雙音
                        envOsc({type:'sine', freq: 1240, attack:0.004, decay:0.08});
                        envOsc({type:'triangle', freq: 1860, attack:0.004, decay:0.06, startAt:0.01, detune: +6});
                        break;
                    case 'wrong':
                        // 低沉「噔」：迅速下潛
                        ensure(); if (!ctx) return;
                        (function(){
                            const now = ctx.currentTime;
                            const o = ctx.createOscillator();
                            const g = ctx.createGain();
                            o.type = 'square'; o.frequency.setValueAtTime(260, now); o.frequency.exponentialRampToValueAtTime(120, now+0.18);
                            o.connect(g); g.connect(gain);
                            g.gain.setValueAtTime(0.001, now); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume*1.1), now+0.01);
                            g.gain.exponentialRampToValueAtTime(0.0001, now+0.22);
                            o.start(now); o.stop(now+0.25);
                        })();
                        break;
                    case 'uiOpen': envOsc({type:'triangle', freq: 520, attack:0.004, decay:0.08}); break;
                    case 'uiClose': envOsc({type:'triangle', freq: 380, attack:0.004, decay:0.06}); break;
                    case 'uiConfirm': envOsc({type:'sine', freq: 880, attack:0.004, decay:0.10}); break;
                    case 'comboUp':
                        envOsc({type:'sine', freq: 740, attack:0.004, decay:0.06});
                        envOsc({type:'sine', freq: 980, attack:0.004, decay:0.08, startAt:0.06});
                        break;
                    case 'levelComplete':
                        envOsc({type:'triangle', freq: 660, attack:0.005, decay:0.09});
                        envOsc({type:'sine', freq: 880, attack:0.003, decay:0.12, startAt:0.07});
                        envOsc({type:'sine', freq: 1320, attack:0.002, decay:0.10, startAt:0.14});
                        break;
                    case 'hint':
                        envOsc({type:'sine', freq: 520, attack:0.003, decay:0.06});
                        envOsc({type:'sine', freq: 400, attack:0.003, decay:0.08, startAt:0.05});
                        break;
                    case 'replayStart':
                        envOsc({type:'square', freq: 500, attack:0.004, decay:0.05});
                        envOsc({type:'square', freq: 750, attack:0.004, decay:0.06, startAt:0.05});
                        break;
                    case 'survivalRescue':
                        envOsc({type:'sawtooth', freq: 360, attack:0.004, decay:0.14});
                        envOsc({type:'triangle', freq: 540, attack:0.004, decay:0.10, startAt:0.10});
                        break;
                    case 'streakBreak':
                        ensure(); if (!ctx) break; (function(){
                            const now = ctx.currentTime;
                            const o = ctx.createOscillator();
                            const g = ctx.createGain();
                            o.type='sine'; o.frequency.setValueAtTime(620, now); o.frequency.exponentialRampToValueAtTime(180, now+0.35);
                            o.connect(g); g.connect(gain);
                            g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(volume*0.9, now+0.02); g.gain.exponentialRampToValueAtTime(0.0001, now+0.4);
                            o.start(now); o.stop(now+0.42);
                        })();
                        break;
                    default: break;
                }
            }
            return { resume, setVolume, play };
        })();

        // Automatically unlock iOS/mobile web audio on first user interaction
        const unlockAudio = () => {
            SFX.resume();
            document.removeEventListener('click', unlockAudio);
            document.removeEventListener('touchstart', unlockAudio);
            document.removeEventListener('keydown', unlockAudio);
        };
        document.addEventListener('click', unlockAudio, { once: true, passive: true });
        document.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
        document.addEventListener('keydown', unlockAudio, { once: true, passive: true });

        // Basic hashing + local signature for anti-cheat (timestamp + checksum)


// Extracted from engine.js
            (function restoreAudioAndTimeBarPrefs(){
                try {
                    const saved = (window.loadSettings ? window.loadSettings() : {});
                    let changed = false;
                    if (typeof saved.volume !== 'number') { saved.volume = 0.2; changed = true; }
                    SFX.setVolume(saved.volume);
                    if (typeof saved.showTimeBar === 'undefined') { saved.showTimeBar = true; changed = true; }
                    if (changed && window.saveSettings) window.saveSettings(saved);
                    try { updateTimeRewardVisibility(); } catch(_) {}
                } catch(_) {}
            })();

        window.SFX = window.SFX || SFX;