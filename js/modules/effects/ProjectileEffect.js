/**
 * @file ProjectileEffect.js
 * @description Handles the "Sticker Arrival" effect (Projectile/Beam flight).
 * Supports both SVG and PixiJS engines.
 */

const svgNS = "http://www.w3.org/2000/svg";

export class ProjectileEffect {
    /**
     * @param {Object} context
     * @param {HTMLElement} context.svgLayer - The SVG group for effects
     * @param {PIXI.Container} [context.pixiLayer] - The Pixi container for effects
     * @param {Object} [context.pixiApp] - The Pixi App instance
     */
    constructor(context) {
        this.ctx = context;
    }

    play(screenX, screenY, targetX, targetY, onComplete) {
        if (this.ctx.pixiLayer) {
            this._playPixi(screenX, screenY, targetX, targetY, onComplete);
        } else if (this.ctx.svgLayer) {
            this._playSvg(screenX, screenY, targetX, targetY, onComplete);
        } else {
            if (onComplete) onComplete();
        }
    }

    _playSvg(screenX, screenY, targetX, targetY, onComplete) {
        const svgLayer = this.ctx.svgLayer;
        const svg = svgLayer.ownerSVGElement;
        
        if (!svg) {
            if (onComplete) onComplete();
            return;
        }

        // 1. Determine Start Position (Top-Left SUPER FAR off-screen)
        const startScreenX = -window.innerWidth * 0.4 + (Math.random() * 100); 
        const startScreenY = -window.innerHeight * 0.4 + (Math.random() * 100);

        // Convert Start Screen coords to SVG coords
        let pt = svg.createSVGPoint();
        pt.x = startScreenX;
        pt.y = startScreenY;
        const ctm = svg.getScreenCTM();
        if (ctm) {
            pt = pt.matrixTransform(ctm.inverse());
        }
        const startX = pt.x;
        const startY = pt.y;

        // Calculate angle
        const angle = Math.atan2(targetY - startY, targetX - startX) * 180 / Math.PI;
        
        // Ensure gradient exists
        this._ensureSvgGradient(svg);

        // Create Wrapper Group (for position)
        const wrapper = document.createElementNS(svgNS, "g");
        wrapper.style.pointerEvents = "none";
        wrapper.style.mixBlendMode = "screen";
        svgLayer.appendChild(wrapper);

        // Create Inner Group (for rotation)
        const inner = document.createElementNS(svgNS, "g");
        inner.setAttribute("transform", `rotate(${angle})`);
        wrapper.appendChild(inner);

        // Beam - Outer Glow (Gradient Tail)
        const glowBeam = document.createElementNS(svgNS, "line");
        glowBeam.setAttribute("x1", "-120"); // Long tail
        glowBeam.setAttribute("y1", "0");
        glowBeam.setAttribute("x2", "0");
        glowBeam.setAttribute("y2", "0");
        glowBeam.setAttribute("stroke", "url(#projectileBeamGradient)");
        glowBeam.setAttribute("stroke-width", "12");
        glowBeam.setAttribute("stroke-linecap", "round");

        // Beam - Core (Solid Bright)
        const coreBeam = document.createElementNS(svgNS, "line");
        coreBeam.setAttribute("x1", "-40"); 
        coreBeam.setAttribute("y1", "0");
        coreBeam.setAttribute("x2", "0");
        coreBeam.setAttribute("y2", "0");
        coreBeam.setAttribute("stroke", "#ffffff");
        coreBeam.setAttribute("stroke-width", "3");
        coreBeam.setAttribute("stroke-opacity", "0.9");
        coreBeam.setAttribute("stroke-linecap", "round");
        
        // Tip (Small glowing point)
        const tip = document.createElementNS(svgNS, "circle");
        tip.setAttribute("cx", "0");
        tip.setAttribute("cy", "0");
        tip.setAttribute("r", "4");
        tip.setAttribute("fill", "#ffffff");
        tip.setAttribute("stroke", "none");
        tip.setAttribute("opacity", "1"); 

        inner.appendChild(glowBeam);
        inner.appendChild(coreBeam);
        inner.appendChild(tip);

        if (window.anime) {
            window.anime({
                targets: wrapper,
                translateX: [startX, targetX],
                translateY: [startY, targetY],
                easing: 'easeInQuad',
                duration: 750, 
                complete: () => {
                    if (wrapper.isConnected) wrapper.remove();
                    if (onComplete) onComplete();
                }
            });
        } else {
            if (wrapper.isConnected) wrapper.remove();
            if (onComplete) onComplete();
        }
    }

    _ensureSvgGradient(svg) {
        let defs = svg.querySelector("defs");
        if (!defs) {
            defs = document.createElementNS(svgNS, "defs");
            svg.insertBefore(defs, svg.firstChild);
        }
        const id = "projectileBeamGradient";
        if (document.getElementById(id)) return;
        
        const grad = document.createElementNS(svgNS, "linearGradient");
        grad.id = id;
        grad.setAttribute("x1", "0%");
        grad.setAttribute("y1", "0%");
        grad.setAttribute("x2", "100%");
        grad.setAttribute("y2", "0%"); 
        
        const stop1 = document.createElementNS(svgNS, "stop");
        stop1.setAttribute("offset", "0%");
        stop1.setAttribute("stop-color", "#ffffff");
        stop1.setAttribute("stop-opacity", "0");
        
        const stop2 = document.createElementNS(svgNS, "stop");
        stop2.setAttribute("offset", "100%");
        stop2.setAttribute("stop-color", "#ffffff");
        stop2.setAttribute("stop-opacity", "1");
        
        grad.appendChild(stop1);
        grad.appendChild(stop2);
        defs.appendChild(grad);
    }

    _playPixi(screenX, screenY, targetX, targetY, onComplete) {
        const layer = this.ctx.pixiLayer;
        
        // 1. Determine Start Position
        const startScreenX = -window.innerWidth * 0.4 + (Math.random() * 100); 
        const startScreenY = -window.innerHeight * 0.4 + (Math.random() * 100);

        let startX = startScreenX;
        let startY = startScreenY;
        
        if (layer.parent) {
            const worldStart = layer.parent.toLocal({x: startScreenX, y: startScreenY});
            startX = worldStart.x;
            startY = worldStart.y;
        }

        const container = new PIXI.Container();
        container.x = startX;
        container.y = startY;
        container.rotation = Math.atan2(targetY - startY, targetX - startX);
        
        // Beam - Outer Glow
        const beamLength = 60;
        const beam = new PIXI.Graphics();
        beam.beginFill(0xFFFFFF);
        beam.drawRect(-beamLength, -3, beamLength, 6);
        beam.endFill();
        beam.alpha = 0.4;
        
        // Beam - Core
        const core = new PIXI.Graphics();
        core.beginFill(0xFFFFFF);
        core.drawRect(-25, -1, 25, 2);
        core.endFill();
        core.alpha = 0.9;
        
        // Tip
        const tip = new PIXI.Graphics();
        tip.beginFill(0xFFFFFF);
        tip.drawCircle(0, 0, 2.5);
        tip.endFill();
        
        container.addChild(beam, core, tip);
        
        beam.blendMode = PIXI.BLEND_MODES.SCREEN;
        core.blendMode = PIXI.BLEND_MODES.SCREEN;
        
        layer.addChild(container);
        
        if (window.anime) {
            const timeline = window.anime.timeline({
                easing: 'easeInQuad',
                complete: () => {
                    container.destroy({ children: true });
                    if (onComplete) onComplete();
                }
            });
            
            timeline.add({
                targets: container,
                x: targetX,
                y: targetY,
                duration: 750
            });
        } else {
             container.destroy({ children: true });
             if (onComplete) onComplete();
        }
    }
}
