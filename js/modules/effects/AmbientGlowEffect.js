/**
 * @file AmbientGlowEffect.js
 * @description Handles the Eagle ambient glow effect.
 * Supports both SVG (DOM) and PixiJS engines.
 */

const svgNS = "http://www.w3.org/2000/svg";

export class AmbientGlowEffect {
    constructor(ctx) {
        this.ctx = ctx; // { elements: { ambientLayer }, pixiLayer (bgLayer), pixiApp }
        this.svgState = {
            nodes: [],
            animation: null,
            currentCount: 0,
            resizeTimer: null,
            paused: false
        };
        this.pixiState = {
            particles: [],
            active: false,
            loopRunning: false,
            texture: null
        };
        
        this._updatePixi = this._updatePixi.bind(this);
    }

    init() {
        if (this.ctx.pixiLayer && this.ctx.pixiApp) {
            this._initPixi();
        } else {
            this._initSvg();
        }
    }

    destroy() {
        this._destroySvg();
        this._destroyPixi();
    }

    refresh(force = false) {
        if (this.ctx.pixiLayer && this.ctx.pixiApp) {
             this._initPixi(); // Pixi handles refresh by clearing/re-init
             return;
        }

        if (!this.ctx.elements.ambientLayer) {
            this.destroy();
            return;
        }

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            this.destroy();
            return;
        }

        if (!force) {
            const isCompactViewport = window.innerWidth < 768;
            const desiredCount = isCompactViewport ? 12 : 16; // Optimized counts
            if (this.svgState.currentCount === desiredCount) {
                return;
            }
        }
        this._initSvg();
    }
    
    setPaused(paused) {
        this.svgState.paused = paused;
        
        // SVG
        if (this.svgState.animation) {
             if (paused) this.svgState.animation.pause();
             else this.svgState.animation.play();
        }
        
        // Pixi ticker handled globally usually, but we could skip updates
    }

    scheduleRefresh() {
        if (!this.ctx.elements.ambientLayer && !this.ctx.pixiLayer) return;
        
        if (this.svgState.resizeTimer) {
             clearTimeout(this.svgState.resizeTimer);
        }
        this.svgState.resizeTimer = setTimeout(() => {
             this.svgState.resizeTimer = null;
             this.refresh();
        }, 260);
    }

    // --- SVG Implementation ---
    
    _initSvg() {
        if (!this.ctx.elements.ambientLayer) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            this._destroySvg();
            return;
        }
        if (!window.anime || typeof window.anime.timeline !== "function") {
            return;
        }
        
        this._destroySvg(); // Clean up old

        const pathNodes = Array.from(document.querySelectorAll("#eagleBody, #eagleTail"));
        const pathEntries = pathNodes
            .map((path) => {
                try {
                    const length = path.getTotalLength();
                    if (!Number.isFinite(length) || length <= 0) return null;
                    return { path, length };
                } catch (error) { return null; }
            })
            .filter(Boolean);

        if (!pathEntries.length) return;

        const combinedLength = pathEntries.reduce((sum, entry) => sum + entry.length, 0);
        if (!Number.isFinite(combinedLength) || combinedLength <= 0) return;

        const isCompactViewport = window.innerWidth < 768;
        const sparkCount = isCompactViewport ? 12 : 16;
        const averageSpacing = combinedLength / sparkCount;
        const jitterWindow = Math.min(averageSpacing * 0.6, 220);

        for (let i = 0; i < sparkCount; i += 1) {
            const offset = averageSpacing * i + (Math.random() - 0.5) * jitterWindow;
            const normalizedCombined = ((offset % combinedLength) + combinedLength) % combinedLength;

            let remaining = normalizedCombined;
            let targetEntry = pathEntries[0];
            for (const entry of pathEntries) {
                if (remaining <= entry.length) {
                    targetEntry = entry;
                    break;
                }
                remaining -= entry.length;
            }

            let point;
            try {
                point = targetEntry.path.getPointAtLength(Math.max(0, remaining));
            } catch (error) { continue; }
            
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;

            const jitterX = window.anime.random(-28, 28);
            const jitterY = window.anime.random(-26, 26);
            const maxRadius = window.anime.random(18, 36);
            const maxOpacity = window.anime.random(55, 88) / 100;
            const strokeWidth = window.anime.random(12, 26) / 10;

            const spark = document.createElementNS(svgNS, "circle");
            spark.classList.add("ambient-spark");
            spark.setAttribute("cx", (point.x + jitterX).toFixed(2));
            spark.setAttribute("cy", (point.y + jitterY).toFixed(2));
            spark.setAttribute("r", "0");
            spark.setAttribute("opacity", "0");
            spark.setAttribute("fill", "url(#eagleGlowGradient)");
            spark.setAttribute("stroke", "rgba(255, 228, 188, 0.6)");
            spark.setAttribute("stroke-width", strokeWidth.toFixed(2));
            spark.dataset.maxRadius = maxRadius.toFixed(2);
            spark.dataset.maxOpacity = maxOpacity.toFixed(2);
            
            this.ctx.elements.ambientLayer.appendChild(spark);
            this.svgState.nodes.push(spark);
        }

        this.svgState.currentCount = this.svgState.nodes.length;
        if (!this.svgState.currentCount) return;

        const startDelay = window.anime.random(0, 360);
        const timeline = window.anime.timeline({ loop: true, autoplay: !this.svgState.paused });
        timeline
            .add({
                targets: this.svgState.nodes,
                r: (el) => Number(el.dataset.maxRadius ?? 24),
                opacity: (el) => Number(el.dataset.maxOpacity ?? 0.7),
                translateY: -40,
                duration: 2200,
                easing: "easeOutSine",
                delay: window.anime.stagger(220, { start: startDelay }),
            })
            .add({
                targets: this.svgState.nodes,
                r: 0,
                opacity: 0,
                translateY: -80,
                duration: 2200,
                easing: "easeInSine",
                delay: window.anime.stagger(220, { direction: "reverse" }),
            });

        this.svgState.animation = timeline;
    }

    _destroySvg() {
        if (this.svgState.animation && typeof this.svgState.animation.pause === "function") {
            this.svgState.animation.pause();
        }
        this.svgState.animation = null;
        this.svgState.nodes.forEach((node) => {
            if (node?.isConnected) {
                node.remove();
            }
        });
        this.svgState.nodes = [];
        this.svgState.currentCount = 0;
        if (this.svgState.resizeTimer) {
            clearTimeout(this.svgState.resizeTimer);
            this.svgState.resizeTimer = null;
        }
    }

    // --- Pixi Implementation ---

    _initPixi() {
        if (!this.ctx.pixiLayer || !this.ctx.pixiApp) return;

        // Clear existing
        this.ctx.pixiLayer.removeChildren();
        this.pixiState.particles = [];

        const pathNodes = Array.from(document.querySelectorAll("#eagleBody, #eagleTail"));
        const pathEntries = pathNodes
            .map((path) => {
                try {
                    const length = path.getTotalLength();
                    if (!Number.isFinite(length) || length <= 0) return null;
                    return { path, length };
                } catch (error) { return null; }
            })
            .filter(Boolean);

        if (!pathEntries.length) return;

        const combinedLength = pathEntries.reduce((sum, entry) => sum + entry.length, 0);
        const isCompactViewport = window.innerWidth < 768;
        const sparkCount = isCompactViewport ? 15 : 25; 
        const averageSpacing = combinedLength / sparkCount;
        const jitterWindow = Math.min(averageSpacing * 0.8, 250);

        if (!this.pixiState.texture) {
            this.pixiState.texture = this._getCircleTexture(this.ctx.pixiApp);
        }

        for (let i = 0; i < sparkCount; i += 1) {
            const offset = averageSpacing * i + (Math.random() - 0.5) * jitterWindow;
            const normalizedCombined = ((offset % combinedLength) + combinedLength) % combinedLength;

            let remaining = normalizedCombined;
            let targetEntry = pathEntries[0];
            for (const entry of pathEntries) {
                if (remaining <= entry.length) {
                    targetEntry = entry;
                    break;
                }
                remaining -= entry.length;
            }

            let point;
            try {
                point = targetEntry.path.getPointAtLength(Math.max(0, remaining));
            } catch (error) { continue; }
            
            if (!point) continue;

            const jitterX = window.anime.random(-30, 30);
            const jitterY = window.anime.random(-30, 30);
            
            const maxRadius = window.anime.random(10, 25); 
            const maxOpacity = window.anime.random(30, 60) / 100; 
            
            const sprite = new PIXI.Sprite(this.pixiState.texture);
            sprite.anchor.set(0.5);
            sprite.x = point.x + jitterX;
            sprite.y = point.y + jitterY;
            sprite.width = 0; 
            sprite.height = 0;
            sprite.alpha = 0;
            sprite.tint = 0xFFE4BC; 
            
            this.ctx.pixiLayer.addChild(sprite);
            
            // Init particle state
            this.pixiState.particles.push({
                sprite,
                startX: sprite.x,
                startY: sprite.y,
                maxSize: maxRadius * 2,
                maxOpacity,
                drift: (Math.random() - 0.5) * 40,
                // Random start phase
                timer: Math.random() * 300, 
                duration: 180 + Math.random() * 120, // 3-5 seconds (at 60fps)
            });
        }

        if (!this.pixiState.loopRunning) {
            this.pixiState.loopRunning = true;
            this.ctx.pixiApp.ticker.add(this._updatePixi);
        }
    }

    _updatePixi(delta) {
        if (this.svgState.paused) return; // Respect global pause for glow

        for (const p of this.pixiState.particles) {
            p.timer += delta;
            
            // Cycle: Wait -> In -> Out -> Wait
            if (p.timer > p.duration) {
                // Reset
                p.timer = 0;
                p.duration = 180 + Math.random() * 120;
            }
            
            const progress = p.timer / p.duration;
            
            if (progress < 0.5) {
                // Fade In & Rise (0 -> 1)
                const t = progress * 2; 
                const ease = Math.sin(t * Math.PI / 2); // Ease out sine (sort of)
                
                p.sprite.width = p.maxSize * ease;
                p.sprite.height = p.maxSize * ease;
                p.sprite.alpha = p.maxOpacity * ease;
                p.sprite.x = p.startX + (p.drift * 0.5 * ease);
                p.sprite.y = p.startY - (30 * ease);
            } else {
                // Fade Out & Rise Further (1 -> 0)
                const t = (progress - 0.5) * 2;
                const ease = 1 - Math.cos(t * Math.PI / 2); // 0 to 1
                const invEase = 1 - ease; // 1 to 0
                
                p.sprite.width = p.maxSize * invEase;
                p.sprite.height = p.maxSize * invEase;
                p.sprite.alpha = p.maxOpacity * invEase;
                
                // Continue moving up (From -30 to -60)
                const yOffset = 30 + (30 * ease);
                p.sprite.y = p.startY - yOffset;
                
                // Continue drift
                const driftOffset = 0.5 + (0.5 * ease);
                p.sprite.x = p.startX + (p.drift * driftOffset);
            }
        }
    }
    
    _destroyPixi() {
        if (this.pixiState.loopRunning && this.ctx.pixiApp) {
             this.ctx.pixiApp.ticker.remove(this._updatePixi);
             this.pixiState.loopRunning = false;
        }
        if (this.pixiState.particles) {
            // Destroy sprites if needed, but usually removing children from layer is enough if we manage layers correctly.
            // But here we might want to be safe.
            this.pixiState.particles.forEach(p => {
                if (!p.sprite.destroyed) p.sprite.destroy();
            });
            this.pixiState.particles = [];
        }
    }

    _getCircleTexture(app) {
        if (!app) return null;
        // Create a soft gradient circle using Canvas
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
        
        return PIXI.Texture.from(canvas);
    }
}
