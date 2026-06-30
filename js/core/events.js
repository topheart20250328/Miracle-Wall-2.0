// 輕量級事件總線 (Event Bus)
// 用於將核心邏輯 (Engine/State) 與 UI 渲染徹底脫鉤
(function() {
    const events = {};

    window.bcEvents = {
        on: function(eventName, callback) {
            if (!events[eventName]) {
                events[eventName] = [];
            }
            events[eventName].push(callback);
        },
        off: function(eventName, callback) {
            if (!events[eventName]) return;
            events[eventName] = events[eventName].filter(cb => cb !== callback);
        },
        emit: function(eventName, data) {
            if (!events[eventName]) return;
            events[eventName].forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error(`[EventBus] Error in event '${eventName}' handler:`, e);
                }
            });
        },
        once: function(eventName, callback) {
            const wrapper = (data) => {
                this.off(eventName, wrapper);
                callback(data);
            };
            this.on(eventName, wrapper);
        }
    };
})();
