    // Lightweight client error logger
    (function(){
        if (window.__errorLogger) return;
        const KEY = 'bibleGameErrorLog';
        const MAX = 100;
        function load(){
            try { return JSON.parse(localStorage.getItem(KEY)||'[]')||[]; } catch(_) { return []; }
        }
        function save(arr){
            try { localStorage.setItem(KEY, JSON.stringify(arr.slice(-MAX))); } catch(_) {}
        }
        function push(entry){
            const arr = load();
            arr.push(entry);
            save(arr);
        }
        function formatError(ev){
            try {
                if (!ev) return { time: Date.now(), type:'unknown', message:'(no event)' };
                if (ev.reason) {
                    return { time: Date.now(), type:'unhandledrejection', message: String(ev.reason && ev.reason.message || ev.reason), stack: ev.reason && ev.reason.stack || null };
                }
                if (ev.error) {
                    return { time: Date.now(), type:'error', message: String(ev.error.message||ev.message), stack: ev.error.stack||null, source: ev.filename, line: ev.lineno, col: ev.colno };
                }
                return { time: Date.now(), type:'error', message: String(ev.message||'(error)') };
            } catch(e){ return { time: Date.now(), type:'internal', message:'formatError failed '+e }; }
        }
        window.__errorLogger = { load, push, clear(){ try { localStorage.removeItem(KEY); } catch(_) {} }, export(){ return JSON.stringify(load(), null, 2); } };
        window.addEventListener('error', (e)=>{ push(formatError(e)); });
        window.addEventListener('unhandledrejection', (e)=>{ push(formatError(e)); });
    })();
