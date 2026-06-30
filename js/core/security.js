        function __hashString(str){
            // djb2
            let h = 5381;
            for (let i=0;i<str.length;i++){ h = ((h<<5)+h) + str.charCodeAt(i); h|=0; }
            return (h>>>0).toString(36);
        }
        function __getClientSalt(){
            try{
                const key = 'bibleChallenge.clientSalt';
                let s = localStorage.getItem(key);
                if (!s){ s = (__hashString(navigator.userAgent + '|' + Date.now()) + Math.random().toString(36).slice(2,6)).slice(0,12); localStorage.setItem(key, s); }
                return s;
            }catch(_){ return 'nosalt'; }
        }
        function __makeSignature(record){
            try{
                const ts = Date.now();
                const core = {
                    id: record.id,
                    score: record.score,
                    difficulty: record.difficulty,
                    totalQuestions: record.totalQuestions,
                    correctAnswers: record.correctAnswers,
                    totalMistakes: record.totalMistakes,
                    playMode: record.playMode,
                    date: record.date,
                    time: record.time
                };
                const payload = JSON.stringify(core) + '|' + ts + '|' + __getClientSalt();
                const hash = __hashString(payload);
                return { ts, hash };
            } catch(_){ return { ts: 0, hash: '' }; }
        }

        // Local-only verification: recompute hash using stored timestamp and current client salt
        function __verifySignature(record){
            try{
                if (!record || record.sig_ts == null || !record.sig_hash) return false;
                const core = {
                    id: record.id,
                    score: record.score,
                    difficulty: record.difficulty,
                    totalQuestions: record.totalQuestions,
                    correctAnswers: record.correctAnswers,
                    totalMistakes: record.totalMistakes,
                    playMode: record.playMode,
                    date: record.date,
                    time: record.time
                };
                const payload = JSON.stringify(core) + '|' + record.sig_ts + '|' + __getClientSalt();
                const expected = __hashString(payload);
                return expected === record.sig_hash;
            } catch(_){ return false; }
        }

