// Timer Manager
// Handles game loops and timing intervals

(function() {
    let levelTimerId = null;
    let survivalTimerId = null;
    
    // Store configs so we can pause/resume
    let _levelCfg = null;
    let _survivalCfg = null;
    let _isPaused = false;

    window.GameTimer = {
        /**
         * Start the level timer (used for score/time reward updates)
         * @param {Function} callback - Function to call on each tick
         * @param {number} intervalMs - Tick interval in ms (default 100)
         */
        startLevel: (callback, intervalMs = 100) => {
            if (levelTimerId) clearInterval(levelTimerId);
            _levelCfg = { callback, intervalMs };
            if (typeof callback === 'function' && !_isPaused) {
                levelTimerId = setInterval(callback, intervalMs);
            }
        },

        /**
         * Stop the level timer
         */
        stopLevel: () => {
            if (levelTimerId) {
                clearInterval(levelTimerId);
                levelTimerId = null;
            }
            _levelCfg = null;
        },

        /**
         * Start the survival mode timer
         * @param {Function} callback - Function to call on each tick
         * @param {number} intervalMs - Tick interval in ms (default 1000)
         */
        startSurvival: (callback, intervalMs = 1000) => {
            if (survivalTimerId) clearInterval(survivalTimerId);
            _survivalCfg = { callback, intervalMs };
            if (typeof callback === 'function' && !_isPaused) {
                survivalTimerId = setInterval(callback, intervalMs);
            }
        },

        /**
         * Stop the survival mode timer
         */
        stopSurvival: () => {
            if (survivalTimerId) {
                clearInterval(survivalTimerId);
                survivalTimerId = null;
            }
            _survivalCfg = null;
        },

        /**
         * Stop all active timers
         */
        stopAll: () => {
            window.GameTimer.stopLevel();
            window.GameTimer.stopSurvival();
        },

        /**
         * Pause all active intervals without destroying their configurations (called on document hidden)
         */
        pauseAll: () => {
            _isPaused = true;
            if (levelTimerId) {
                clearInterval(levelTimerId);
                levelTimerId = null;
            }
            if (survivalTimerId) {
                clearInterval(survivalTimerId);
                survivalTimerId = null;
            }
        },

        /**
         * Resume previously paused intervals (called on document visible)
         */
        resumeAll: () => {
            _isPaused = false;
            // Only resume if they were previously configured
            if (_levelCfg && _levelCfg.callback && !levelTimerId) {
                levelTimerId = setInterval(_levelCfg.callback, _levelCfg.intervalMs);
            }
            if (_survivalCfg && _survivalCfg.callback && !survivalTimerId) {
                survivalTimerId = setInterval(_survivalCfg.callback, _survivalCfg.intervalMs);
            }
        }
    };
})();
