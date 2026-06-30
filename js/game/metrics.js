// Game Metrics Module
// Tracks statistics for achievements and analysis
// Extracted from engine.js to separate concerns

(function() {
    function normalizeQuestionKey(raw) {
        if (raw == null) return '';
        return String(raw).replace(/\|/g, ':').trim();
    }

    function isHintedQuestionKey(key) {
        try {
            const gs = window.gameState;
            if (!gs || !gs.usedHints) return false;
            const normalized = normalizeQuestionKey(key);
            if (!normalized) return false;
            if (typeof gs.usedHints.has === 'function') {
                if (gs.usedHints.has(normalized)) return true;
                if (gs.usedHints.has(normalized.replace(/:/g, '|'))) return true;
            }
            const list = Array.isArray(gs.usedHints) ? gs.usedHints : Array.from(gs.usedHints || []);
            return list.some(v => normalizeQuestionKey(v) === normalized);
        } catch (_) {
            return false;
        }
    }

    // Initialize default metrics object
    function createEmptyMetrics() {
        return {
            mode: 'classic',
            startTime: Date.now(),
            speedEventStartTs: Date.now(),
            
            // Basic Counts
            totalQuestions: 0,
            answeredQuestions: 0,
            correctCount: 0,
            wrongCount: 0,
            hintsUsed: 0,
            
            // Streaks
            currentStreak: 0,
            longestStreak: 0,
            
            // Timing
            totalAnswerTimeMs: 0,
            fastestAnswerMs: 999999,
            slowestAnswerMs: 0,
            avgAnswerMs: 0,
            perQuestionTimes: [], // Array of { isCorrect, ms, ts }
            timeSamples: [],      // Detailed timing log
            firstTryCorrectCount: 0,
            firstTryAnswerTimes: [],
            _questionAttempts: Object.create(null),
            
            // Special Chains
            ultraFastCorrectChain: 0, // e.g. under 1.5s
            ultraFastCorrectMax: 0,
            firstFiveCorrect: 0,      // Count of correct answers in first 5 questions
            
            // Level / Progression
            levelPerfectFlags: [],
            levelsPerfectCount: 0,
            consecutivePerfectLevels: 0,
            maxConsecutivePerfect: 0,
            
            // Survival Specific
            survivalDuration: 0,
            rescueUsed: false,
            nearDeathRecoveries: 0,
            nearDeathActive: false,
            comebackFromLow: 0,
            
            // Flags
            noHint: true
        };
    }

    // Ensure global instance exists
    window.gameMetrics = createEmptyMetrics();

    // Reset metrics (called at start of game)
    window.resetGameMetrics = function(mode) {
        window.gameMetrics = createEmptyMetrics();
        window.gameMetrics.mode = mode || 'classic';
        try {
            if (window.__debugPerf || window.__BC_DEBUG_ENABLED) {
                console.log('[Metrics] Reset for mode:', mode);
            }
        } catch(_) {}
    };

    /**
     * Record an answer attempt
     * @param {boolean} isCorrect 
     * @param {number} ms Duration in milliseconds
     */
    window.recordAnswer = function(isCorrect, ms, questionKey) {
        if (!window.gameMetrics) window.gameMetrics = createEmptyMetrics();
        const m = window.gameMetrics;
        const now = Date.now();
        const key = (questionKey == null || questionKey === '') ? null : normalizeQuestionKey(questionKey);
        const hinted = key ? isHintedQuestionKey(key) : false;

        if (key) {
            if (!m._questionAttempts || typeof m._questionAttempts !== 'object') m._questionAttempts = Object.create(null);
            m._questionAttempts[key] = (m._questionAttempts[key] || 0) + 1;
        }

        m.answeredQuestions++;
        m.totalQuestions++; // Assuming total increments with answers for infinite modes, fixed modes set it upfront usually

        // Timing stats
        const validMs = Math.max(1, ms);
        m.totalAnswerTimeMs += validMs;
        m.perQuestionTimes.push({ isCorrect, ms: validMs, ts: now, qKey: key, hinted: !!hinted, attemptNo: key ? (m._questionAttempts[key] || 1) : undefined });
        
        if (isCorrect) {
            m.correctCount++;
            m.currentStreak++;
            if (m.currentStreak > m.longestStreak) m.longestStreak = m.currentStreak;

            if (key && m._questionAttempts && m._questionAttempts[key] === 1) {
                m.firstTryCorrectCount++;
                if (!Array.isArray(m.firstTryAnswerTimes)) m.firstTryAnswerTimes = [];
                m.firstTryAnswerTimes.push(validMs);
            }
            
            if (validMs < m.fastestAnswerMs) m.fastestAnswerMs = validMs;
            if (validMs > m.slowestAnswerMs) m.slowestAnswerMs = validMs;

            // Ultra Fast Chain: requires no-hint + <=1200ms
            if (!hinted && validMs <= 1200) {
                m.ultraFastCorrectChain++;
                if (m.ultraFastCorrectChain > m.ultraFastCorrectMax) m.ultraFastCorrectMax = m.ultraFastCorrectChain;
            } else {
                m.ultraFastCorrectChain = 0;
            }

            // First 5 check
            if (m.answeredQuestions <= 5) {
                m.firstFiveCorrect++;
            }

        } else {
            m.wrongCount++;
            m.currentStreak = 0;
            m.ultraFastCorrectChain = 0;
        }

        // derived
        m.avgAnswerMs = m.totalAnswerTimeMs / m.answeredQuestions;
        m.speedEventStartTs = now; // reset timer base
        
        // Log deep sample
        if (m.timeSamples) m.timeSamples.push({ t: now, ms: validMs, type: isCorrect ? 'correct' : 'wrong' });
    };

    /**
     * Record usage of a hint
     */
    window.recordHint = function() {
        if (!window.gameMetrics) window.gameMetrics = createEmptyMetrics();
        const m = window.gameMetrics;
        m.hintsUsed++;
        m.noHint = false;
    };

    /**
     * Record level completion status
     * @param {boolean} isPerfect 
     */
    window.recordLevelResult = function(isPerfect) {
        if (!window.gameMetrics) window.gameMetrics = createEmptyMetrics();
        const m = window.gameMetrics;
        
        m.levelPerfectFlags.push(isPerfect);
        if (isPerfect) {
            m.levelsPerfectCount++;
            m.consecutivePerfectLevels++;
            if (m.consecutivePerfectLevels > m.maxConsecutivePerfect) {
                m.maxConsecutivePerfect = m.consecutivePerfectLevels;
            }
        } else {
            m.consecutivePerfectLevels = 0;
        }
    };

    /**
     * Record an invalid/skipped speed segment
     */
    window.recordInvalidSpeedSegment = function() {
        if (!window.gameMetrics) return;
        const m = window.gameMetrics;
        const now = Date.now();
        // Fallback start time logic matching engine.js
        const startTs = m.speedEventStartTs || (window.gameState && (window.gameState.currentQuestionStartTime || window.gameState.levelStartTime)) || m.startTime || now;
        const ms = Math.max(1, now - startTs);
        
        // Log as invalid sample
        if (m.timeSamples) m.timeSamples.push({ t: now, ms: ms, type: 'invalid' });
        
        // Reset timer
        m.speedEventStartTs = now;
    };

    /**
     * Record stats for survival mode ticks or special events
     * @param {Object} data Partial updates
     */
    window.updateSurvivalMetrics = function(data) {
        if (!window.gameMetrics) window.gameMetrics = createEmptyMetrics();
        Object.assign(window.gameMetrics, data);
    };

    // Expose helpers globally
    window.MetricsManager = {
        reset: window.resetGameMetrics,
        recordAnswer: window.recordAnswer,
        recordHint: window.recordHint,
        recordLevelResult: window.recordLevelResult,
        recordInvalidSpeedSegment: window.recordInvalidSpeedSegment
    };

})();