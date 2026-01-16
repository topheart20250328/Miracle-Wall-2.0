/**
 * @file FireEffect.js
 * @description Handles the fire effects (Eagle body fire, particles).
 * Supports both SVG (DOM) and PixiJS engines.
 */

const svgNS = "http://www.w3.org/2000/svg";

// Helper function to create circular texture
function getCircleTexture(app) {
    if (!app) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(16, 16, 8, 0, Math.PI * 2); // Radius 8 with blur space
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    return PIXI.Texture.from(canvas);
}

export class FireEffect {
    constructor(ctx) {
        this.ctx = ctx; // { svgLayer, pixiLayer (should be bgLayer), pixiApp, elements }
        this.svgState = {
            active: false,
            paused: false,
            intensity: 0,
            spawnPoints: [],
            center: { x: 0, y: 0 },
            fireGroup: null
        };
        this.pixiState = {
            active: false,
            particles: [],
            intensity: 0,
            texture: null,
            spawnPoints: [],
            center: {x: 0, y: 0},
            spawnTimer: 0,
            loopRunning: false
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

    setIntensity(intensity) {
        const val = Math.max(0, Math.min(1, intensity));
        this.svgState.intensity = val;
        this.pixiState.intensity = val;
    }

    setPaused(paused) {
        this.svgState.paused = paused;
        // Pixi ticker continues but we skip spawn/update logic if paused to save CPU
    }

    reset() {
        this.setIntensity(0);
        // Clear SVG
        if (this.svgState.fireGroup) {
            this.svgState.fireGroup.innerHTML = '';
        }
        // Clear Pixi
        if (this.pixiState.particles) {
            this.pixiState.particles.forEach(p => p.sprite.destroy());
            this.pixiState.particles = [];
        }
    }

    _initSvg() {
        if (!this.ctx.elements.ambientLayer) return;
        if (!window.anime || typeof window.anime.timeline !== "function") return;

        // Verify paths exist in DOM (Eagle shape)
        const pathNodes = Array.from(document.querySelectorAll("#eagleBody, #eagleTail"));
        if (!pathNodes.length) return;

        // Pre-calculate spawn points
        const spawnPoints = [];
        const sampleResolution = 3;
        
        pathNodes.forEach(path => {
            try {
                const length = path.getTotalLength();
                if (!Number.isFinite(length) || length <= 0) return;
                
                const steps = Math.floor(length / sampleResolution);
                for (let i = 0; i <= steps; i++) {
                    const point = path.getPointAtLength(i * sampleResolution);
                    spawnPoints.push({ x: point.x, y: point.y });
                }
            } catch (e) { /* ignore */ }
        });

        if (spawnPoints.length === 0) return;
        this.svgState.spawnPoints = spawnPoints;

        // Calculate center
        let totalX = 0, totalY = 0;
        spawnPoints.forEach(p => { totalX += p.x; totalY += p.y; });
        this.svgState.center = { x: totalX / spawnPoints.length, y: totalY / spawnPoints.length };

        // Create Group
        let fireGroup = document.getElementById("fireGroup");
        if (!fireGroup) {
            fireGroup = document.createElementNS(svgNS, "g");
            fireGroup.id = "fireGroup";
            const stickersLayer = this.ctx.elements.stickersLayer;
            if (stickersLayer && stickersLayer.parentNode) {
                stickersLayer.parentNode.insertBefore(fireGroup, stickersLayer);
            } else {
                this.ctx.elements.ambientLayer.appendChild(fireGroup);
            }
        }
        this.svgState.fireGroup = fireGroup;
        this.svgState.active = true;

        this._startSvgLoop();
    }

    _startSvgLoop() {
        const isMobile = window.innerWidth < 768;
        
        const loop = () => {
             if (!this.svgState.active) return;
             // Check visual pause (e.g. tab hidden)
             if (this.svgState.paused) {
                 setTimeout(loop, 1000);
                 return;
             }

             const intensity = this.svgState.intensity;
             if (intensity <= 0.01) {
                 setTimeout(loop, 500);
                 return;
             }

             let delayBase = isMobile ? 350 : 300; 
             let delayMin = isMobile ? 150 : 100;
             const delay = delayBase - (intensity * (delayBase - delayMin));
             
             let maxBatch = isMobile ? 2 : 2; 
             const batchSize = 1 + Math.floor(intensity * (maxBatch - 1));

             for (let i = 0; i < batchSize; i++) {
                 this._spawnSvgParticle(isMobile);
             }

             setTimeout(loop, delay);
        };
        loop();
    }

    _spawnSvgParticle(isMobile) {
        try {
            const { spawnPoints, center, fireGroup, intensity } = this.svgState;
            const point = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
            if (!point) return;
        
            const particle = document.createElementNS(svgNS, "circle");
            particle.classList.add("fire-particle");
            particle.style.mixBlendMode = "screen";
            
            const jitter = 15 + (intensity * 25);
            const startX = point.x + (Math.random() - 0.5) * jitter;
            const startY = point.y + (Math.random() - 0.5) * jitter;
        
            particle.setAttribute("cx", startX.toFixed(2));
            particle.setAttribute("cy", startY.toFixed(2));
            
            const mobileScale = isMobile ? 1.5 : 1;
            const baseSize = (2 + (intensity * 4)) * mobileScale; 
            const size = baseSize * (0.8 + Math.random() * 0.4); 
            particle.setAttribute("r", size.toFixed(2));
        
            const startHue = 40 + Math.random() * 15; 
            particle.style.fill = `hsl(${startHue}, 100%, 80%)`;
            particle.style.opacity = 0;
        
            fireGroup.appendChild(particle);
        
            const duration = 2500 + Math.random() * 2000; 
            
            const dx = startX - center.x;
            const dy = startY - center.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            let dirX = dx / dist;
            let dirY = dy / dist;
        
            dirY -= 0.8; 
        
            const newDist = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
            dirX /= newDist;
            dirY /= newDist;
        
            const speed = 15 + (intensity * 25) + (Math.random() * 10);
            
            const travelX = dirX * speed;
            const travelY = dirY * speed;
        
            window.anime({
              targets: particle,
              opacity: [
                { value: 0, duration: 0 },
                { value: 0.9, duration: duration * 0.15 }, 
                { value: 0, duration: duration * 0.85, easing: 'easeInQuad' } 
              ],
              translateY: travelY,
              translateX: travelX,
              scale: [
                { value: 0.3, duration: 0 },
                { value: 1.4, duration: duration * 0.4, easing: 'easeOutQuad' }, 
                { value: 0, duration: duration * 0.6, easing: 'easeInQuad' } 
              ],
              easing: 'easeOutQuad',
              duration: duration,
              complete: () => {
                if (particle.isConnected) particle.remove();
              }
            });
          } catch (err) { }
    }

    _initPixi() {
        if (!this.ctx.pixiLayer || !this.ctx.pixiApp) return;

        // Verify paths exist in DOM (Eagle shape) for geometry
        const pathNodes = Array.from(document.querySelectorAll("#eagleBody, #eagleTail"));
        if (!pathNodes.length) return;

        this.pixiState.spawnPoints = [];
        const sampleResolution = 3; 
        
        pathNodes.forEach(path => {
            try {
                const length = path.getTotalLength();
                if (!Number.isFinite(length) || length <= 0) return;
                
                const steps = Math.floor(length / sampleResolution);
                for (let i = 0; i <= steps; i++) {
                    const point = path.getPointAtLength(i * sampleResolution);
                    this.pixiState.spawnPoints.push({ x: point.x, y: point.y });
                }
            } catch (e) { /* ignore */ }
        });

        if (this.pixiState.spawnPoints.length === 0) return;

        let totalX = 0, totalY = 0;
        this.pixiState.spawnPoints.forEach(p => { totalX += p.x; totalY += p.y; });
        this.pixiState.center = { x: totalX / this.pixiState.spawnPoints.length, y: totalY / this.pixiState.spawnPoints.length };

        this.pixiState.active = true;
        
        if (!this.pixiState.texture) {
            this.pixiState.texture = getCircleTexture(this.ctx.pixiApp);
        }

        if (!this.pixiState.loopRunning) {
            this.pixiState.loopRunning = true;
            this.ctx.pixiApp.ticker.add(this._updatePixi);
        }
    }

    _updatePixi(delta) { // delta is usually ~1.0 at 60fps
        if (!this.pixiState.active) return;
        if (this.svgState.paused) return; // Paused

        const intensity = this.pixiState.intensity;
        const isMobile = window.innerWidth < 768;
        
        // 1. Spawn Logic
        if (intensity > 0.01) {
            let delayBase = isMobile ? 20 : 15;
            const spawnDelay = Math.max(2, delayBase - (intensity * (delayBase - 5)));
            
            this.pixiState.spawnTimer += delta;
            
            if (this.pixiState.spawnTimer >= spawnDelay) {
                this.pixiState.spawnTimer = 0;
                
                let maxBatch = isMobile ? 1 : 2; 
                const batchSize = 1 + Math.floor(intensity * (maxBatch - 1));
                
                for (let i = 0; i < batchSize; i++) {
                    this._spawnPixiParticle(intensity, isMobile);
                }
            }
        }

        // 2. Update Particles
        for (let i = this.pixiState.particles.length - 1; i >= 0; i--) {
            const p = this.pixiState.particles[i];
            p.life += delta;
            
            const progress = p.life / p.maxLife;
            
            if (progress >= 1) {
                p.sprite.destroy();
                this.pixiState.particles.splice(i, 1);
                continue;
            }
            
            p.sprite.x += p.vx * delta;
            p.sprite.y += p.vy * delta;
            
            if (progress < 0.15) {
                p.sprite.alpha = (progress / 0.15) * 0.9;
            } else {
                p.sprite.alpha = (1 - ((progress - 0.15) / 0.85)) * 0.9;
            }
            
            let scale = 0;
            if (progress < 0.4) {
                const t = progress / 0.4;
                const ease = 1 - (1 - t) * (1 - t);
                scale = p.baseSize * (0.3 + (ease * 1.1));
            } else {
                const t = (progress - 0.4) / 0.6;
                const ease = t * t;
                scale = p.baseSize * (1.4 * (1 - ease));
            }
            
            p.sprite.width = scale;
            p.sprite.height = scale;
        }
    }

    _spawnPixiParticle(intensity, isMobile) {
        const point = this.pixiState.spawnPoints[Math.floor(Math.random() * this.pixiState.spawnPoints.length)];
        if (!point) return;

        const sprite = new PIXI.Sprite(this.pixiState.texture);
        sprite.anchor.set(0.5);
        
        const jitter = 15 + (intensity * 25);
        const startX = point.x + (Math.random() - 0.5) * jitter;
        const startY = point.y + (Math.random() - 0.5) * jitter;
        
        sprite.x = startX;
        sprite.y = startY;
        
        const mobileScale = isMobile ? 1.5 : 1;
        const baseSize = (2 + (intensity * 4)) * mobileScale; 
        const size = baseSize * (0.8 + Math.random() * 0.4); 
        
        sprite.width = size * 0.3; 
        sprite.height = size * 0.3;
        
        const colors = [0xFFD700, 0xFFA500, 0xFF8C00, 0xFF4500];
        sprite.tint = colors[Math.floor(Math.random() * colors.length)];
        sprite.alpha = 0;
        sprite.blendMode = PIXI.BLEND_MODES.SCREEN;

        this.ctx.pixiLayer.addChild(sprite); 

        const maxLife = 150 + Math.random() * 120;
        
        const dx = startX - this.pixiState.center.x;
        const dy = startY - this.pixiState.center.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        let dirX = dx / dist;
        let dirY = dy / dist;
        dirY -= 0.8; 
        const newDist = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
        dirX /= newDist;
        dirY /= newDist;

        const totalDist = 15 + (intensity * 25) + (Math.random() * 10);
        const vx = (dirX * totalDist) / maxLife;
        const vy = (dirY * totalDist) / maxLife;

        this.pixiState.particles.push({
            sprite,
            vx, vy,
            life: 0,
            maxLife,
            baseSize: size
        });
    }

    destroy() {
        this.reset();
        if (this.pixiState.loopRunning && this.ctx.pixiApp) {
             this.ctx.pixiApp.ticker.remove(this._updatePixi);
             this.pixiState.loopRunning = false;
        }
    }
}
