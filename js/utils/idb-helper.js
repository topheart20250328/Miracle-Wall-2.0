// IndexedDB Helper for storing large verse data
const IDB_CONFIG = { name: 'BibleChallengeDB_v2', version: 1, store: 'verses' };

const ua = navigator.userAgent || navigator.vendor || window.opera;
const isWebView = /Line|FBAN|FBAV|Instagram/i.test(ua);

const IDBHelper = {
    open: () => new Promise((resolve, reject) => {
        if (isWebView) return reject(new Error('IDB disabled in WebView to prevent Jetsam OOM crashes.'));
        const req = indexedDB.open(IDB_CONFIG.name, IDB_CONFIG.version);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_CONFIG.store)) {
                db.createObjectStore(IDB_CONFIG.store);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    }),
    get: (key) => new Promise(async (resolve, reject) => {
        try {
            const db = await IDBHelper.open();
            const tx = db.transaction(IDB_CONFIG.store, 'readonly');
            const req = tx.objectStore(IDB_CONFIG.store).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        } catch (e) { reject(e); }
    }),
    set: (key, val) => new Promise(async (resolve, reject) => {
        try {
            const db = await IDBHelper.open();
            const tx = db.transaction(IDB_CONFIG.store, 'readwrite');
            const req = tx.objectStore(IDB_CONFIG.store).put(val, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        } catch (e) { reject(e); }
    })
};

// 暴露給全域使用
window.IDBHelper = IDBHelper;
