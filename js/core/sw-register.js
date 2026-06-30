// Service worker registration bootstrap
(function(){
    if (!('serviceWorker' in navigator)) return;

    // --- 降維打擊：判斷手機內建瀏覽器 WebViews (LINE, FB, IG) 並直接禁用 SW ---
    // In-App browsers 不支援 PWA 且快取機制異常，常引發死循環，直接註銷並停用。
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isWebView = !!window.__BC_DISABLE_SW || /Line|FBAN|FBAV|Instagram/i.test(ua);
    
    // 如果是內建瀏覽器，清除所有舊有的 Service Worker，並中止後續動作。
    if (isWebView || window.self !== window.top) {
        console.warn('[SW] In-App Browser detected. Disabling Service Worker completely to prevent refresh loops.');
        navigator.serviceWorker.getRegistrations().then((regs) => {
            for (let r of regs) {
                r.unregister().catch(()=>{});
            }
        }).catch(()=>{});
        return; 
    }

    // --- 正常瀏覽器 (Chrome, Safari 主程式) 才啟用 PWA 能力 ---
    // 改為 5 分鐘，確保開發更新更容易推播
    const UPDATE_THROTTLE_MS = 300000; 
    let lastUpdateCheckTs = Date.now();

    function tryActivateWaiting(reg){
        try { if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch(_) {}
    }

    function wireUpdateFound(reg){
        if (!reg) return;
        reg.addEventListener('updatefound', () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                    tryActivateWaiting(reg);
                }
            });
        });
    }

    window.addEventListener('load', function() {
        navigator.serviceWorker.register('sw.js', { scope: './' }).then((reg) => {
            
            // Controller change 不再使用原生 reload 觸發
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                document.documentElement.setAttribute('data-sw-controller-changed-at', String(Date.now()));
                window.dispatchEvent(new CustomEvent('bc:sw-controllerchange'));
            });

            wireUpdateFound(reg);
            tryActivateWaiting(reg);

            if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type:'ping-version' });
            }

            const throttledUpdate = () => {
                const now = Date.now();
                if (now - lastUpdateCheckTs > UPDATE_THROTTLE_MS) {
                    lastUpdateCheckTs = now;
                    reg.update().catch(()=>{});
                }
            };

            // 大幅減少主動 Update，避免每次回桌面又進入就狂刷
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') throttledUpdate();
            });
            window.addEventListener('online', throttledUpdate);

        }).catch(function(err){ 
            console.error('[SW] Registration failed:', err);
        });
    });
})();