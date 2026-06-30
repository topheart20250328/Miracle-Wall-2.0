export class HolyFireEffect {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.firePixels = [];
        this.width = 0;
        this.height = 0;
        this.intensity = 0;
        this.displayIntensity = 0; // Lagging intensity for smooth rise
        this.animationId = null;
        this.paletteRGB = null;
        this.mediaPrefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    }

    init() {
        if (this.mediaPrefersReducedMotion?.matches) return;
        if (this.canvas) return; // Already initialized

        const canvas = document.createElement("canvas");
        canvas.id = "holyFireCanvas";
        const w = 160;
        const h = 100;
        canvas.width = w;
        canvas.height = h;

        Object.assign(canvas.style, {
            position: "fixed",
            bottom: "0",
            left: "0",
            width: "100%",
            height: "90vh", // Increased height to reach above eagle
            pointerEvents: "none",
            zIndex: "10", // Behind wall-stage (20)
            opacity: "0.8",
            mixBlendMode: "screen", // Additive blending
            filter: "blur(10px)",
            // Mask out the bottom 15% to keep UI clear
            maskImage: "linear-gradient(to top, rgba(0,0,0,1) 10%, rgba(0,0,0,0) 100%)",
            webkitMaskImage: "linear-gradient(to top, rgba(0,0,0,1) 10%, rgba(0,0,0,0) 100%)"
        });

        // Append to wall-section to be in the correct stacking context
        const container = document.querySelector(".wall-section") || document.body;
        container.appendChild(canvas);

        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.width = w;
        this.height = h;
        this.firePixels = new Array(w * h).fill(0);

        this.initPalette();
        this.startLoop();
    }

    initPalette() {
        if (this.paletteRGB) return;
        // Golden/Holy Fire Palette
        // Transparent -> GoldenRod -> Gold -> LightYellow -> White
        this.paletteRGB = [
            [0, 0, 0, 0],
            [184, 134, 11, 0], [184, 134, 11, 10], [218, 165, 32, 30], // Dark GoldenRod
            [218, 165, 32, 60], [255, 215, 0, 90], [255, 215, 0, 120], // Gold
            [255, 223, 0, 150], [255, 223, 0, 180], [255, 255, 0, 200], // Yellow
            [255, 255, 100, 220], [255, 255, 150, 230], [255, 255, 200, 240], // Light Yellow
            [255, 255, 220, 250], [255, 255, 240, 255], [255, 255, 255, 255], // White
            // Fill rest with white
            ...Array(21).fill([255, 255, 255, 255])
        ];
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.canvas) {
            this.canvas.remove();
            this.canvas = null;
            this.ctx = null;
        }
        this.firePixels = [];
    }

    setIntensity(val) {
        this.intensity = val;
    }

    reset() {
        if (this.firePixels && this.firePixels.length > 0) {
            this.firePixels.fill(0);
        }
        this.intensity = 0;
        this.displayIntensity = 0;
        if (this.ctx && this.width && this.height) {
            this.ctx.clearRect(0, 0, this.width, this.height);
        }
    }

    startLoop() {
        const { width, height, ctx } = this;
        let lastTime = 0;
        // Performance: Reduce FPS on mobile or if tab is hidden
        const isMobile = window.innerWidth < 768;
        const fps = isMobile ? 10 : 15;
        const interval = 1000 / fps;

        const update = (time) => {
            if (!this.canvas) return;
            this.animationId = requestAnimationFrame(update);

            // Skip if tab is hidden to save battery
            if (document.hidden) return;

            const delta = time - lastTime;
            if (delta < interval) return;
            lastTime = time - (delta % interval);

            // Smoothly interpolate display intensity towards target intensity
            // This prevents the fire from "jumping" up instantly
            const targetIntensity = this.intensity;
            const diff = targetIntensity - this.displayIntensity;
            if (Math.abs(diff) > 0.001) {
                this.displayIntensity += diff * 0.005; // Very slow ease-in for gradual rise
            } else {
                this.displayIntensity = targetIntensity;
            }

            // 1. Update Source based on intensity
            // Intensity 0 = No fire, Intensity 1 = Raging fire
            const intensity = this.displayIntensity;

            // Only generate source if intensity > 0
            if (intensity > 0.01) {
                for (let x = 0; x < width; x++) {
                    const index = (height - 1) * width + x;
                    // Source probability increases with intensity
                    // Cap visual density at ~40% (0.4 multiplier) to keep it looking like flames not a block
                    if (Math.random() < (intensity * 0.4)) {
                        // Scale max heat by intensity so low intensity = short fire
                        // Was fixed at 36, now 18 to 36 based on intensity
                        const maxHeat = 18 + (intensity * 18);
                        this.firePixels[index] = Math.floor(maxHeat);
                    } else {
                        this.firePixels[index] = Math.max(0, this.firePixels[index] - 2);
                    }
                }
            } else {
                // Extinguish source
                for (let x = 0; x < width; x++) {
                    const index = (height - 1) * width + x;
                    this.firePixels[index] = Math.max(0, this.firePixels[index] - 4);
                }
            }

            // 2. Propagate
            for (let x = 0; x < width; x++) {
                for (let y = 1; y < height; y++) {
                    const srcIndex = y * width + x;
                    const pixelHeat = this.firePixels[srcIndex];

                    if (pixelHeat === 0) {
                        this.firePixels[srcIndex - width] = 0;
                    } else {
                        // Decay logic
                        // Higher intensity = Less decay = Taller fire
                        // To reach top (height 100), we need very low decay at max intensity
                        // At intensity 1.0: decayChance = 0.55 - 0.53 = 0.02 (2% chance to decay)
                        const decayChance = 0.55 - (intensity * 0.53);
                        const decay = Math.random() < decayChance ? 1 : 0;
                        const dstIndex = srcIndex - width + (Math.random() > 0.5 ? 1 : -1); // More turbulent wind

                        if (dstIndex >= 0 && dstIndex < width * height) {
                            this.firePixels[dstIndex] = Math.max(0, pixelHeat - decay);
                        }
                    }
                }
            }

            // 3. Render
            const imgData = ctx.createImageData(width, height);
            const data = imgData.data;

            const paletteRGB = this.paletteRGB;

            for (let i = 0; i < this.firePixels.length; i++) {
                const heat = this.firePixels[i];
                // Map heat 0-36 to palette
                const color = paletteRGB[Math.min(36, heat)] || paletteRGB[0];
                const baseIdx = i * 4;
                data[baseIdx] = color[0];
                data[baseIdx + 1] = color[1];
                data[baseIdx + 2] = color[2];
                data[baseIdx + 3] = color[3];
            }

            ctx.putImageData(imgData, 0, 0);
        };

        update(0);
    }
}
