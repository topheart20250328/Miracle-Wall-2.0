/**
 * @file MistEffect.js
 * @description Handles the "Celebration Mist" effect (soft, large particles for atmosphere).
 * Canvas-based.
 */

export class MistEffect {
    constructor(ctx) {
        this.ctx = ctx; // { fireState (for intensity reference) }
        this.state = {
            canvas: null,
            ctx: null,
            particles: [],
            width: 0,
            height: 0,
            lastTime: 0,
            active: false,
            spawnTimer: 0,
            animationId: null,
            paused: false
        };
        this._loop = this._loop.bind(this);
        this._resize = this._resize.bind(this);
    }

    init() {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        const canvas = document.createElement("canvas");
        canvas.id = "celebrationMistCanvas";
        Object.assign(canvas.style, {
            position: "fixed",
            inset: "0",
            pointerEvents: "none",
            zIndex: "0", // Above Fire (-1), Below Wall (1)
            mixBlendMode: "screen",
            opacity: "0.8"
        });
        
        // Append to main to layer correctly
        const main = document.querySelector("main");
        if (main) {
            main.appendChild(canvas);
        } else {
            document.body.appendChild(canvas);
        }

        this.state.canvas = canvas;
        this.state.ctx = canvas.getContext("2d");
        
        window.addEventListener("resize", this._resize);
        this._resize();
        
        this.state.active = true;
        this.state.lastTime = performance.now();
        this._loop(this.state.lastTime);
    }

    destroy() {
        if (this.state.animationId) {
            cancelAnimationFrame(this.state.animationId);
            this.state.animationId = null;
        }
        window.removeEventListener("resize", this._resize);
        if (this.state.canvas && this.state.canvas.isConnected) {
            this.state.canvas.remove();
        }
        this.state.canvas = null;
        this.state.ctx = null;
        this.state.particles = [];
        this.state.active = false;
    }
    
    setPaused(paused) {
        this.state.paused = paused;
    }

    reset() {
        if (this.state.ctx && this.state.width && this.state.height) {
            this.state.ctx.clearRect(0, 0, this.state.width, this.state.height);
        }
        this.state.particles = [];
        this.state.spawnTimer = 0;
    }

    _resize() {
        if (!this.state.canvas) return;
        this.state.width = window.innerWidth;
        this.state.height = window.innerHeight;
        this.state.canvas.width = this.state.width;
        this.state.canvas.height = this.state.height;
    }

    _loop(time) {
        this.state.animationId = requestAnimationFrame(this._loop);
        
        if (!this.state.active) return;
        if (document.hidden || this.state.paused) {
             this.state.lastTime = time; // Keep time sync but skip logic
             return;
        }

        const dt = (time - this.state.lastTime) / 1000;
        this.state.lastTime = time;
        if (dt > 0.1) return; // Skip large delta jumps

        const { ctx, width, height, particles } = this.state;
        
        ctx.clearRect(0, 0, width, height);
        
        // 1. Spawn Logic
        // We need access to fireState.intensity or allow it to be passed in.
        // For loose coupling, let's assume getIntensity() is available or passed in context
        // But context only has fireState object reference.
        const intensity = this.ctx.fireState ? this.ctx.fireState.intensity : 0;

        if (this.state.spawnTimer === undefined) this.state.spawnTimer = 0;
        this.state.spawnTimer += dt;

        if (intensity > 0.5) {
            const baseInterval = 1.0; 
            const spawnRate = (intensity - 0.5) * 2; // 0 to 1
            const currentInterval = baseInterval / Math.max(0.1, spawnRate);
            
            if (this.state.spawnTimer > currentInterval) {
                this.state.spawnTimer = 0;
                this._spawnParticle(width, height);
            }
        }

        // 2. Update & Render
        for (let i = particles.length - 1; i >= 0; i--) {
            this._updateParticle(particles[i], dt);
            if (particles[i].life >= particles[i].maxLife) {
                particles.splice(i, 1);
                continue;
            }
            this._drawParticle(ctx, particles[i]);
        }
    }

    _spawnParticle(width, height) {
        const x = Math.random() * width;
        const y = Math.random() * (height * 0.7); 
        
        const hue = 30 + Math.random() * 25; // 30-55
        const sat = 80 + Math.random() * 20; 
        const light = 70 + Math.random() * 30; 
        
        const mainColor = `hsla(${hue}, ${sat}%, ${light}%,`;
        const coreColor = `hsla(${hue}, ${sat}%, 95%,`; 
        
        this.state.particles.push({
            x, y,
            size: 0, 
            maxSize: 100 + Math.random() * 150, 
            life: 0,
            maxLife: 6 + Math.random() * 4, 
            mainColor,
            coreColor,
            vx: (Math.random() - 0.5) * 6, 
            vy: -5 - Math.random() * 10 
        });
    }

    _updateParticle(p, dt) {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
    }

    _drawParticle(ctx, p) {
        const progress = p.life / p.maxLife;
        const sizeProgress = 1 - Math.pow(1 - progress, 3);
        const currentSize = p.maxSize * sizeProgress;
        
        let alpha = 0;
        const fadeInDuration = 0.25; 
        
        if (progress < fadeInDuration) {
            const t = progress / fadeInDuration;
            alpha = t * t; 
        } else {
            alpha = 1 - ((progress - fadeInDuration) / (1 - fadeInDuration));
        }
        alpha *= 0.75; 

        if (alpha <= 0) return;

        try {
            const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, currentSize);
            gradient.addColorStop(0, p.coreColor + alpha + ")");
            gradient.addColorStop(0.25, p.mainColor + (alpha * 0.8) + ")");
            gradient.addColorStop(0.6, p.mainColor + (alpha * 0.2) + ")");
            gradient.addColorStop(1, p.mainColor + "0)"); 
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
            ctx.fill();
        } catch (e) {
            // Context might be lost or invalid params
        }
    }
}
