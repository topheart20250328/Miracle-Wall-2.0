export class BottomFireEffect {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.firePixels = [];
        this.width = 0;
        this.height = 0;
        this.intensity = 0;
        this.animationId = null;
        this.paletteRGB = null;
        this.mediaPrefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    }

    init() {
        if (this.mediaPrefersReducedMotion?.matches) return;
        if (this.canvas) return; // Already initialized

        // Create canvas for the doom fire effect
        const canvas = document.createElement("canvas");
        canvas.id = "bottomFireCanvas";
        // Low resolution for performance and "blur" effect
        const w = 160;
        const h = 100;
        canvas.width = w;
        canvas.height = h;

        // Style to stretch it across the bottom
        Object.assign(canvas.style, {
            position: "fixed",
            bottom: "0",
            left: "0",
            width: "100%",
            height: "40vh", // Increased height for smoother fade
            pointerEvents: "none",
            zIndex: "-1", // Behind everything (Mist is 0, Wall is 1)
            opacity: "0.5", // Reduced opacity for better blending
            mixBlendMode: "screen",
            filter: "blur(12px)", // Increased blur
            maskImage: "linear-gradient(to top, rgba(0,0,0,1) 20%, rgba(0,0,0,0.8) 60%, rgba(0,0,0,0) 100%)", // Multi-stop gradient
            webkitMaskImage: "linear-gradient(to top, rgba(0,0,0,1) 20%, rgba(0,0,0,0.8) 60%, rgba(0,0,0,0) 100%)"
        });

        // Append to main to layer correctly between background and content
        const main = document.querySelector("main");
        if (main) {
            main.appendChild(canvas);
        } else {
            document.body.appendChild(canvas);
        }

        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.width = w;
        this.height = h;
        this.firePixels = new Array(w * h).fill(0);

        // Precompute palette
        this.initPalette();

        this.startLoop();
    }

    initPalette() {
        if (this.paletteRGB) return;
        // Modified palette: Low heat colors are now transparent/semi-transparent to avoid "black smoke" look
        this.paletteRGB = [
            [0, 0, 0, 0],
            [31, 7, 7, 0], [47, 15, 7, 0], [71, 15, 7, 0], // 1-3: Fully transparent (was dark red/black)
            [87, 23, 7, 20], [103, 31, 7, 50], [119, 31, 7, 80], [143, 39, 7, 110], // 4-7: Fading in
            [159, 47, 7, 150], [175, 63, 7, 190], [191, 71, 7, 220], [199, 71, 7, 255], // 8-11: Becoming opaque
            [223, 79, 7, 255], [223, 87, 7, 255], [223, 87, 7, 255], [215, 95, 7, 255],
            [215, 95, 7, 255], [215, 103, 15, 255], [207, 111, 15, 255], [207, 119, 15, 255], [207, 127, 15, 255], [207, 135, 23, 255], [199, 135, 23, 255], [199, 143, 23, 255],
            [199, 151, 31, 255], [191, 159, 31, 255], [191, 159, 31, 255], [191, 167, 39, 255], [191, 167, 39, 255], [191, 175, 47, 255], [183, 175, 47, 255], [183, 183, 47, 255],
            [183, 183, 55, 255], [207, 207, 111, 255], [223, 223, 159, 255], [239, 239, 199, 255], [255, 255, 255, 255], [255, 255, 255, 255]
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
        if (this.ctx && this.width && this.height) {
            this.ctx.clearRect(0, 0, this.width, this.height);
        }
        this.intensity = 0;
    }

    startLoop() {
        const { width, height, ctx } = this;
        let lastTime = 0;
        // Performance: Reduce FPS on mobile or if tab is hidden
        const isMobile = window.innerWidth < 768;
        const fps = isMobile ? 8 : 12;
        const interval = 1000 / fps;

        const update = (time) => {
            if (!this.canvas) return; // Ended
            this.animationId = requestAnimationFrame(update);

            // Skip if tab is hidden to save battery
            if (document.hidden) return;

            const delta = time - lastTime;
            if (delta < interval) return;

            lastTime = time - (delta % interval);

            // 1. Update Fire Source (Bottom Row) based on intensity
            const intensity = this.intensity;
            // User wants constant "max" color/source, so we use a fixed high value for source generation
            // But if intensity is 0, we turn off the source
            const sourceIntensity = intensity > 0.01 ? 0.85 : 0;

            for (let x = 0; x < width; x++) {
                const index = (height - 1) * width + x;
                // Randomize heat source
                if (Math.random() < sourceIntensity) {
                    this.firePixels[index] = 36; // Max heat
                } else {
                    this.firePixels[index] = Math.max(0, this.firePixels[index] - 1);
                }
            }

            // 2. Propagate Fire
            for (let x = 0; x < width; x++) {
                for (let y = 1; y < height; y++) {
                    const srcIndex = y * width + x;
                    const pixelHeat = this.firePixels[srcIndex];

                    if (pixelHeat === 0) {
                        this.firePixels[srcIndex - width] = 0;
                    } else {
                        // Dynamic decay based on intensity: Higher intensity = Lower decay chance = Taller fire
                        // Intensity 0.2 -> ~65% decay chance (Short fire)
                        // Intensity 1.0 -> ~5% decay chance (Tall fire)
                        const decayChance = 0.8 - (intensity * 0.75);
                        const decay = Math.random() < decayChance ? 1 : 0;

                        const dstIndex = srcIndex - width + (Math.random() > 0.5 ? 1 : 0); // Slight wind

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
                const color = paletteRGB[Math.min(36, heat)] || paletteRGB[0];
                const baseIdx = i * 4;
                data[baseIdx] = color[0];     // R
                data[baseIdx + 1] = color[1]; // G
                data[baseIdx + 2] = color[2]; // B
                data[baseIdx + 3] = color[3]; // A
            }

            ctx.putImageData(imgData, 0, 0);
        };

        update(0);
    }
}
