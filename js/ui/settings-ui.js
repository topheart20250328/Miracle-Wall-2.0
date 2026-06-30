// Extracted from bible-challenge.html
// settings-ui.js

function openSettingsModal(from) {
            try { SFX.play('uiOpen'); } catch(_) {}
            const modal = document.getElementById('settingsModal');
            if (!modal) return;
            // If modal is nested under a hidden parent (like #gameScreen when we're on start menu), move it to body
            try { if (modal.parentElement !== document.body) document.body.appendChild(modal); } catch(_) {}
            // load existing prefs into UI
            let prefs = {};
            try { prefs = window.loadSettings ? window.loadSettings() : {}; } catch(_) {}
            const vol = (typeof prefs.volume === 'number') ? prefs.volume : 0.2;
            const volSlider = document.getElementById('volumeSlider');
            const volValue = document.getElementById('volumeValue');
            if (volSlider) volSlider.value = String(vol);
            if (volValue) volValue.textContent = Math.round(vol * 100) + '%';
            const toggle = document.getElementById('toggleTimeBar');
            // Migration: old key showTimeBar=true meant visible. New checkbox = hide.
            let hidePref = false; // default: not hidden
            if (typeof prefs.hideTimeBar === 'boolean') hidePref = prefs.hideTimeBar;
            else if (typeof prefs.showTimeBar === 'boolean') hidePref = !prefs.showTimeBar; // invert legacy
            if (toggle) toggle.checked = hidePref;
            const rmToggle = document.getElementById('forceReducedMotionToggle');
            if (rmToggle) rmToggle.checked = !!prefs.forceReducedMotion;
            // toggle developer command button visibility
            try {
                const devBtn = document.getElementById('openDevCommands');
                if (devBtn) {
                    if (from === 'game') { devBtn.style.display = 'none'; }
                    else { devBtn.style.display = ''; }
                }
            } catch(_) {}
            // show via modal manager
            try { openModal('settingsModal'); } catch(_) { modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false'); }
            // live preview volume while dragging
            if (volSlider) {
                volSlider.oninput = (e) => {
                    const v = Number(e.target.value || 0);
                    SFX.setVolume(v);
                    if (volValue) volValue.textContent = Math.round(v * 100) + '%';
                };
            }
        }
        function closeSettingsModal() {
            const modal = document.getElementById('settingsModal');
            if (!modal) return;
            try { closeModal('settingsModal'); } catch(_) { modal.classList.add('hidden'); modal.setAttribute('aria-hidden','true'); }
        }
        function saveSettingsFromModal() {
            try {
                const volSlider = document.getElementById('volumeSlider');
                const toggle = document.getElementById('toggleTimeBar');
                const rmToggle = document.getElementById('forceReducedMotionToggle');
                const v = volSlider ? Number(volSlider.value || 0) : 0.2;
                // New semantics: checked = hide
                const hide = toggle ? !!toggle.checked : false;
                const key = (window.__BC_CONSTS && window.__BC_CONSTS.STORAGE_KEY_SETTINGS) || 'bibleGameSettings';
                const saved = JSON.parse(localStorage.getItem(key) || '{}') || {};
                saved.volume = Math.max(0, Math.min(1, v));
                saved.hideTimeBar = !!hide;
                // keep legacy key for backwards UI until fully removed
                saved.showTimeBar = !hide;
                saved.forceReducedMotion = rmToggle ? !!rmToggle.checked : !!saved.forceReducedMotion;
                localStorage.setItem(key, JSON.stringify(saved));
                SFX.setVolume(saved.volume);
                try { applyReducedMotionSetting(); } catch(_) {}
                try { updateTimeRewardVisibility(); window.updateScoreRulesDisplay(); } catch(_) {}
                try { SFX.play('uiConfirm'); } catch(_) {}
                try { announce && announce(saved.forceReducedMotion ? '已啟用減少動畫效果' : '已關閉減少動畫效果'); } catch(_) {}
                closeSettingsModal();
            } catch(_) {
                closeSettingsModal();
            }
        }

        // Evaluate reduced motion (system OR explicit user override)
        function isReducedMotionPreferred() {
            let user = false;
            try {
                const prefs = window.loadSettings ? window.loadSettings() : {};
                user = !!prefs.forceReducedMotion;
            } catch(_) {}
            const system = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
            return user || system;
        }

        function applyReducedMotionSetting() {
            const reduce = isReducedMotionPreferred();
            document.documentElement.classList.toggle('reduced-motion', reduce);
            document.body.classList.toggle('reduced-motion', reduce);
        }