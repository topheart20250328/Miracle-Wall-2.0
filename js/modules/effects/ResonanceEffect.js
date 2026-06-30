export class ResonanceEffect {
    constructor(dependencies) {
        this.getHolyFireEffect = dependencies.getHolyFireEffect;
        this.canvas = null;
        this.ctx = null;
        this.particles = [];
        this.heat = 0;
        this.width = 0;
        this.height = 0;
        this.lastTime = 0;
        this.onlineCount = 1;
        this.animationId = null;

        this.HEAT_CONFIG = {
            baseDecay: 5,        // 基礎衰減：每秒降 5%
            decayPerPerson: 0.3, // 人數加成：每人每秒多降 0.3%
            gain: 0.5,           // 點擊增益：每下增加 0.5%
            maxHeat: 100
        };

        this.mediaPrefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    }

    init() {
        if (this.mediaPrefersReducedMotion?.matches) return;
        if (this.canvas) return;

        const canvas = document.createElement("canvas");
        canvas.id = "resonanceCanvas";
        canvas.style.position = "fixed";
        canvas.style.inset = "0";
        canvas.style.pointerEvents = "none";
        canvas.style.zIndex = "850"; // Below playback overlay (900) but above wall

        // Append to wall-section to share stacking context with playbackOverlay
        const container = document.querySelector(".wall-section") || document.body;
        container.appendChild(canvas);

        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");

        const resize = () => {
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            canvas.width = this.width;
            canvas.height = this.height;
        };

        window.addEventListener("resize", resize);
        resize();

        this.startLoop();
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
        this.particles = [];
    }

    updateOnlineCount(count) {
        this.onlineCount = Math.max(1, count);
    }

    getHeat() {
        return this.heat;
    }

    trigger(remoteHeat = null) {
        // Sync: If remote heat is higher, catch up immediately
        if (remoteHeat !== null && typeof remoteHeat === "number") {
            if (remoteHeat > this.heat) {
                this.heat = remoteHeat;
            }
        }

        // Add heat on click
        this.heat = Math.min(this.HEAT_CONFIG.maxHeat, this.heat + this.HEAT_CONFIG.gain);

        // Performance Protection
        const currentParticles = this.particles.length;
        if (currentParticles > 500) return; // Hard cap

        // Add particles
        let count = 1;
        // Throttle count if heavy load
        if (currentParticles > 300) count = Math.max(1, Math.floor(count / 2));

        for (let i = 0; i < count; i++) {
            const baseSize = 10 + (this.heat / 20);
            const size = baseSize + Math.random() * 10;

            const x = (5 + Math.random() * 90) * this.width / 100;
            const y = this.height + 40;

            const color = this.getHeatColor(this.heat);

            this.particles.push({
                x,
                y,
                size,
                color,
                vx: (Math.random() - 0.5) * 1.0,
                vy: -(2 + Math.random() * 2 + (this.heat / 25)),
                life: 1,
                decay: 0.005 + Math.random() * 0.01
            });
        }
    }

    getHeatColor(heat) {
        // Interpolate between Red (#ff5d5d) and Soft Warm Yellow (#ffeeb4)
        const h = Math.max(0, Math.min(100, heat));
        const t = h / 100; // 0.0 to 1.0

        // Non-linear interpolation
        const easeT = t * t;

        const baseR = 255;
        const baseG = 93 + (238 - 93) * easeT;
        const baseB = 93 + (180 - 93) * easeT;

        const jitter = (Math.random() - 0.5) * 40;
        const r = Math.min(255, Math.max(180, baseR + jitter));
        const g = Math.min(255, Math.max(0, baseG + jitter));
        const b = Math.min(255, Math.max(0, baseB + jitter));

        return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    }

    startLoop() {
        const loop = (time) => {
            if (!this.canvas) return;
            this.animationId = requestAnimationFrame(loop);

            if (document.hidden) return;

            const dt = (time - this.lastTime) / 1000;
            this.lastTime = time;

            if (dt > 0.1) return; // Skip large jumps

            // 1. Decay Heat
            const currentDecay = Math.max(
                this.HEAT_CONFIG.baseDecay,
                this.onlineCount * this.HEAT_CONFIG.decayPerPerson
            );

            // Default minimum heat
            const minHeat = 1.2;

            if (this.heat > minHeat) {
                this.heat = Math.max(minHeat, this.heat - (currentDecay * dt));
            } else if (this.heat < minHeat) {
                this.heat = Math.min(minHeat, this.heat + (dt * 2));
            }

            // Sync Holy Fire intensity
            if (this.getHolyFireEffect) {
                this.getHolyFireEffect().setIntensity(this.heat / 100);
            }

            // 2. Render Particles
            const ctx = this.ctx;
            ctx.clearRect(0, 0, this.width, this.height);

            // Random Sparkles at High Heat (>80%)
            if (this.heat > 80) {
                const spawnChance = (this.heat - 80) / 200;
                if (Math.random() < spawnChance) {
                    const x = Math.random() * this.width;
                    const y = Math.random() * this.height * 0.8;
                    const size = 2 + Math.random() * 4;

                    this.particles.push({
                        type: 'sparkle',
                        x, y, size,
                        life: 0,
                        maxLife: 1,
                        state: 'in',
                        decay: 0.01 + Math.random() * 0.01,
                        color: `rgba(255, 255, ${200 + Math.random() * 55}, 1)`
                    });
                }
            }

            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];

                if (p.type === 'sparkle') {
                    if (p.state === 'in') {
                        p.life += p.decay;
                        if (p.life >= p.maxLife) {
                            p.life = p.maxLife;
                            p.state = 'out';
                        }
                    } else {
                        p.life -= p.decay;
                        if (p.life <= 0) {
                            this.particles.splice(i, 1);
                            continue;
                        }
                    }

                    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
                    ctx.fillStyle = p.color;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(Date.now() * 0.001);

                    ctx.beginPath();
                    const s = p.size * (0.5 + p.life * 0.5);
                    ctx.moveTo(0, -s * 2);
                    ctx.quadraticCurveTo(s * 0.2, -s * 0.2, s * 2, 0);
                    ctx.quadraticCurveTo(s * 0.2, s * 0.2, 0, s * 2);
                    ctx.quadraticCurveTo(-s * 0.2, s * 0.2, -s * 2, 0);
                    ctx.quadraticCurveTo(-s * 0.2, -s * 0.2, 0, -s * 2);
                    ctx.fill();
                    ctx.restore();
                    continue;
                }

                // Generic decay (Hearts)
                p.life -= p.decay;
                if (p.life <= 0) {
                    this.particles.splice(i, 1);
                    continue;
                }

                p.x += p.vx;
                p.y += p.vy;

                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;

                const size = p.size * p.life;
                ctx.save();
                ctx.translate(p.x, p.y);

                // Draw Heart
                ctx.beginPath();
                const topCurveHeight = size * 0.3;
                ctx.moveTo(0, topCurveHeight);
                ctx.bezierCurveTo(0, 0, -size / 2, 0, -size / 2, topCurveHeight);
                ctx.bezierCurveTo(-size / 2, size / 2, 0, size * 0.8, 0, size);
                ctx.bezierCurveTo(0, size * 0.8, size / 2, size / 2, size / 2, topCurveHeight);
                ctx.bezierCurveTo(size / 2, 0, 0, 0, 0, topCurveHeight);
                ctx.fill();

                if (this.heat > 50) {
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = "rgba(255, 200, 100, 0.5)";
                    ctx.fill();
                    ctx.shadowBlur = 0; // Reset
                }

                ctx.restore();
            }
        };
        requestAnimationFrame(loop);
    }
}
