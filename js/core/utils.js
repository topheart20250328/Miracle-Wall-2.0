

// Extracted from engine.js
                        function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

                        function randInt(min,max){ return Math.floor(Math.random() * (max - min + 1)) + min; }

    function __shuffleInPlace(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

                        function genName(){
                            // 60% 直接使用可愛名單，40% 自行組合 1~3 個音節
                            if (Math.random() < 0.6) return pick(cuteBase);
                            const len = Math.min(4, Math.max(1, Math.floor(Math.random()*3)+1));
                            let out = '';
                            for (let i=0;i<len;i++) out += pick(syllables);
                            return out.slice(0,4);
                        }

                        function uniqueName(){
                            let tries = 0;
                            while (tries++ < 400) {
                                const name = genName();
                                if (name && name.length >= 1 && name.length <= 4 && !existingNames.has(name) && !batchNames.has(name)) { batchNames.add(name); return name; }
                            }
                            // Fallback: 玩家 + 編號（不超過 4 個字）
                            let idx = 1;
                            let name = '';
                            while (!name || existingNames.has(name) || batchNames.has(name)) { name = `玩${idx}`; idx++; if (idx>9999) break; }
                            batchNames.add(name); return name;
                        }