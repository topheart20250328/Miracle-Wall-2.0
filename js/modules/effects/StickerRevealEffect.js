/**
 * StickerRevealEffect.js
 * Handles the "reveal" visual effect when a sticker appears during playback.
 * Current implementation: A soft, luxurious gradient shockwave.
 */
export class StickerRevealEffect {
    constructor(ctx) {
        this.ctx = ctx; // { pixiLayer, pixiApp }
        this.activeRipples = [];
        this.activeMeteors = [];
        this.tickerAdded = false;
        this.glowTexture = null;
        this.coreTexture = null;
        
        this._update = this._update.bind(this);
    }

    /**
     * Create a soft radial gradient texture (Ring-like).
     */
    _getGlowTexture() {
        if (this.glowTexture) return this.glowTexture;

        const size = 128;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const centerX = size / 2;
        const centerY = size / 2;
        const radius = size / 2;

        // Create Radial Gradient
        // Inner: Transparent, Middle: Soft White Glow, Outer: Fade
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        
        // SOFT GLOW (No harsh ring)
        gradient.addColorStop(0, "rgba(255, 255, 255, 0)"); 
        gradient.addColorStop(0.35, "rgba(255, 255, 255, 0)"); 
        gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.1)"); 
        gradient.addColorStop(0.7, "rgba(255, 255, 255, 0.25)"); // Weak Peak
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)"); 

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        this.glowTexture = PIXI.Texture.from(canvas);
        return this.glowTexture;
    }

    /**
     * Create a solid core texture for Meteor head.
     */
    _getCoreTexture() {
        if (this.coreTexture) return this.coreTexture;

        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const centerX = size / 2;
        const centerY = size / 2;
        const radius = size / 2;

        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, "rgba(255, 255, 255, 1)"); 
        gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.5)");
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        this.coreTexture = PIXI.Texture.from(canvas);
        return this.coreTexture;
    }

    /**
     * Play the reveal effect at the given coordinates.
     * @param {number} x - World X coordinate of sticker center
     * @param {number} y - World Y coordinate of sticker center
     * @param {function} onImpactCallback - Function to call when meteor hits (reveals sticker)
     */
    play(x, y, onImpactCallback) {
        if (!this.ctx.pixiLayer || !this.ctx.pixiApp) {
            if (onImpactCallback) onImpactCallback();
            return;
        }

        // Check for Reduced Motion
        const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (prefersReduced) {
            if (onImpactCallback) onImpactCallback();
            this.spawnRipple(x, y);
            return;
        }

        // Spawn Meteor
        this.spawnMeteor(x, y, onImpactCallback);
        this._ensureTicker();
    }

    spawnMeteor(targetX, targetY, callback) {
        // 1. Calculate Start Position
        // Start high up above the viewport
        const spawnY = -200; 
        
        // Add some horizontal variance (not always straight down)
        const offsetX = (Math.random() - 0.5) * 600; 
        const spawnX = targetX + offsetX; 

        // 2. Create Container
        const meteor = new PIXI.Container();
        meteor.x = spawnX;
        meteor.y = spawnY;
        meteor.blendMode = PIXI.BLEND_MODES.ADD;

        // 3. Head (Bright Core)
        const head = new PIXI.Sprite(this._getCoreTexture());
        head.anchor.set(0.5);
        head.scale.set(0.8); 
        head.tint = 0xFFFFFF;
        meteor.addChild(head);

        // 4. Tail (Graphics)
        const tail = new PIXI.Graphics();
        tail.beginFill(0xFFFFFF, 0.6);
        // Draw a tapered teardrop / triangle tail pointing Left (since we rotate container)
        // 0,0 is head center. Tail goes to -X direction
        tail.moveTo(-10, -5);
        tail.lineTo(-150, 0); // Long tail
        tail.lineTo(-10, 5);
        tail.endFill();
        
        // Add a secondary wider, fainter tail for glow
        tail.beginFill(0xFFFFFF, 0.2);
        tail.moveTo(-5, -15);
        tail.lineTo(-120, 0);
        tail.lineTo(-5, 15);
        tail.endFill();

        meteor.addChildAt(tail, 0); // Draw behind head

        // 5. Physics Calculation
        const dx = targetX - spawnX;
        const dy = targetY - spawnY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Speed: 40px/frame
        const speed = 40; 
        
        // Rotate to face target
        const rotation = Math.atan2(dy, dx);
        meteor.rotation = rotation;

        // Store data
        meteor.userData = {
            targetX, 
            targetY,
            vx: (dx / distance) * speed,
            vy: (dy / distance) * speed,
            callback,
            distanceTraveled: 0,
            totalDistance: distance
        };

        this.ctx.pixiLayer.addChild(meteor);
        this.activeMeteors.push(meteor);
    }

    spawnRipple(x, y) {
        const texture = this._getGlowTexture();
        const ripple = new PIXI.Sprite(texture);
        
        ripple.anchor.set(0.5);
        ripple.x = x;
        ripple.y = y;
        ripple.blendMode = PIXI.BLEND_MODES.ADD; 
        
        ripple.scale.set(0.2);
        ripple.alpha = 1;
        
        ripple.userData = {
            life: 0,
            duration: 90, // frames (~1.5s)
            maxScale: 3.5 
        };

        this.ctx.pixiLayer.addChild(ripple);
        this.activeRipples.push(ripple);
    }
    
    spawnFlash(x, y) {
        // A single frame intense flash using Core Texture
        const texture = this._getCoreTexture();
        const flash = new PIXI.Sprite(texture);
        flash.anchor.set(0.5);
        flash.x = x;
        flash.y = y;
        flash.blendMode = PIXI.BLEND_MODES.ADD;
        flash.scale.set(3.0); 
        flash.alpha = 1; 
        
        flash.userData = {
            life: 0,
            duration: 15,
            type: 'flash'
        };
        
        this.ctx.pixiLayer.addChild(flash);
        this.activeRipples.push(flash); 
    }

    _ensureTicker() {
        if (!this.tickerAdded && this.ctx.pixiApp && this.ctx.pixiApp.ticker) {
            this.ctx.pixiApp.ticker.add(this._update);
            this.tickerAdded = true;
        }
    }

    _update(delta) {
        if (this.activeMeteors.length === 0 && this.activeRipples.length === 0) return;

        // 1. Update Meteors
        for (let i = this.activeMeteors.length - 1; i >= 0; i--) {
            const meteor = this.activeMeteors[i];
            const data = meteor.userData;

            meteor.x += data.vx * delta;
            meteor.y += data.vy * delta;
            
            const dx = meteor.x - data.targetX;
            const dy = meteor.y - data.targetY;
            const distSq = dx*dx + dy*dy;
            
            // IMPACT CHECK
            if (distSq < 2500) { // 50px radius
                // Force position
                meteor.x = data.targetX;
                meteor.y = data.targetY;

                // 1. Trigger Callback (Show Sticker)
                if (data.callback) data.callback();

                // 2. Spawn Burst Effects
                this.spawnRipple(data.targetX, data.targetY);
                this.spawnFlash(data.targetX, data.targetY);

                // 3. Destroy Meteor
                this.ctx.pixiLayer.removeChild(meteor);
                meteor.destroy({ children: true });
                this.activeMeteors.splice(i, 1);
            } 
            // Failsafe: if we went way too far (off screen bottom/past target)
            else if (meteor.y > data.targetY + 200) {
                 if (data.callback) data.callback(); // Ensure sticker shows
                 this.ctx.pixiLayer.removeChild(meteor);
                 meteor.destroy({ children: true });
                 this.activeMeteors.splice(i, 1);
            }
        }

        // 2. Update Ripples / Flashes
        for (let i = this.activeRipples.length - 1; i >= 0; i--) {
            const ripple = this.activeRipples[i];
            const data = ripple.userData;

            data.life += delta;
            
            const progress = Math.min(data.life / data.duration, 1);
            
            if (data.type === 'flash') {
                // Flash Logic
                ripple.alpha = 1 - progress;
                ripple.scale.set(3.0 + progress * 1.0); 
            } else {
                // Ripple Logic
                const ease = 1 - Math.pow(1 - progress, 3);
                const currentScale = 0.2 + (data.maxScale - 0.2) * ease;
                ripple.scale.set(currentScale);

                if (progress > 0.4) {
                    ripple.alpha = 1 - ((progress - 0.4) / 0.6);
                }
            }

            if (progress >= 1) {
                this.ctx.pixiLayer.removeChild(ripple);
                ripple.destroy();
                this.activeRipples.splice(i, 1);
            }
        }
    }
    
    // Cleanup if needed (unlikely for singleton)
    destroy() {
        if (this.tickerAdded && this.ctx.pixiApp) {
            this.ctx.pixiApp.ticker.remove(this._update);
        }
    }
}
