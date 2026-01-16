/**
 * StickerRevealEffect.js
 * Handles the "reveal" visual effect when a sticker appears during playback.
 * Current implementation: A soft, luxurious gradient shockwave.
 */
export class StickerRevealEffect {
    constructor(ctx) {
        this.ctx = ctx; // { pixiLayer, pixiApp }
        this.activeRipples = [];
        this.tickerAdded = false;
        this.glowTexture = null;
        
        this._update = this._update.bind(this);
    }

    /**
     * Create a soft radial gradient texture.
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
        // 0.0 - 0.4: Transparent center to keep sticker clear
        gradient.addColorStop(0, "rgba(255, 255, 255, 0)"); 
        gradient.addColorStop(0.35, "rgba(255, 255, 255, 0)"); 
        
        // 0.5 - 1.0: Very diffuse, weak light (max 0.3 opacity)
        gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.1)"); 
        gradient.addColorStop(0.7, "rgba(255, 255, 255, 0.25)"); // Weak Peak
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)"); 

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        this.glowTexture = PIXI.Texture.from(canvas);
        return this.glowTexture;
    }

    /**
     * Play the reveal effect at the given coordinates.
     * @param {number} x - World X coordinate of sticker center
     * @param {number} y - World Y coordinate of sticker center
     */
    play(x, y) {
        if (!this.ctx.pixiLayer || !this.ctx.pixiApp) return;

        const texture = this._getGlowTexture();
        const ripple = new PIXI.Sprite(texture);
        
        ripple.anchor.set(0.5);
        ripple.x = x;
        ripple.y = y;
        ripple.blendMode = PIXI.BLEND_MODES.ADD; // Additive blending for light effect
        
        // Initial state
        ripple.scale.set(0.1); // Start smaller to expand out
        ripple.alpha = 1;
        
        // We'll store life data on the object
        ripple.userData = {
            life: 0,
            duration: 90, // frames (approx 1.5s) - Even slower, more elegant
            maxScale: 3.5 // Expand further to look like a ripple
        };

        this.ctx.pixiLayer.addChild(ripple);
        this.activeRipples.push(ripple);

        this._ensureTicker();
    }

    _ensureTicker() {
        if (!this.tickerAdded && this.ctx.pixiApp && this.ctx.pixiApp.ticker) {
            this.ctx.pixiApp.ticker.add(this._update);
            this.tickerAdded = true;
        }
    }

    _update(delta) {
        if (this.activeRipples.length === 0) return;

        for (let i = this.activeRipples.length - 1; i >= 0; i--) {
            const ripple = this.activeRipples[i];
            const data = ripple.userData;

            data.life += delta;
            
            // Normalize progress (0 to 1)
            const progress = Math.min(data.life / data.duration, 1);
            
            // Easing: EaseOutCubic (1 - (1-x)^3) or similar
            // Simple ease out
            const ease = 1 - Math.pow(1 - progress, 3);

            // Animate Scale
            const currentScale = 0.5 + (data.maxScale - 0.5) * ease; // Start slightly visible
            ripple.scale.set(currentScale);

            // Animate Alpha (Fade out in last 50%)
            if (progress > 0.5) {
                ripple.alpha = 1 - ((progress - 0.5) / 0.5);
            }

            // Interactive burst rotation? No, simple ripple is elegant.

            if (progress >= 1) {
                // Done
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
