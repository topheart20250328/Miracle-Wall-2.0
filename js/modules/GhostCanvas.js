
const STICKER_DIAMETER = 36;
const STICKER_RADIUS = STICKER_DIAMETER / 2;
const VIEWBOX_WIDTH = 3500;
const VIEWBOX_HEIGHT = 1779.31;

let canvas = null;
let ctx = null;
let svgElement = null;
let ghosts = new Map(); // Map<deviceId, {x, y, timestamp}>
let rafId = null;
let isVisible = true;

// Pre-render the ghost sticker to an offscreen canvas for performance
let ghostImage = null;

function createGhostImage() {
  const size = STICKER_DIAMETER * 2; // Draw at 2x resolution for sharpness
  const offscreen = document.createElement('canvas');
  offscreen.width = size;
  offscreen.height = size;
  const oCtx = offscreen.getContext('2d');

  // Draw a simple ghost sticker representation
  // Circle with semi-transparent fill
  const center = size / 2;
  const radius = (STICKER_RADIUS) * 2; // Scale up for the 2x resolution

  oCtx.beginPath();
  oCtx.arc(center, center, radius, 0, Math.PI * 2);
  oCtx.fillStyle = 'rgba(255, 255, 255, 0.4)'; // Semi-transparent white
  oCtx.fill();
  
  // Add a subtle border
  oCtx.lineWidth = 2;
  oCtx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  oCtx.stroke();

  // Add "..." text
  oCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  oCtx.font = 'bold 24px sans-serif';
  oCtx.textAlign = 'center';
  oCtx.textBaseline = 'middle';
  oCtx.fillText('...', center, center - 5);

  return offscreen;
}

export function initGhostCanvas(canvasEl, svgEl) {
  canvas = canvasEl;
  svgElement = svgEl;
  ctx = canvas.getContext('2d', { alpha: true });
  
  ghostImage = createGhostImage();

  // Handle resize
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Start loop
  startLoop();
}

function resizeCanvas() {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.scale(dpr, dpr);
}

export function updateGhosts(presenceState, currentDeviceId) {
  const newGhosts = new Map();
  
  for (const key in presenceState) {
    // Skip self
    if (key === currentDeviceId) continue;

    const presences = presenceState[key];
    // Use the latest presence entry for this device
    const presence = presences[0]; 
    
    if (presence && presence.typingLocation) {
      const { x, y } = presence.typingLocation;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        newGhosts.set(key, { x, y, timestamp: Date.now() });
      }
    }
  }
  
  ghosts = newGhosts;
}

export function getGhosts() {
  return ghosts;
}

function startLoop() {
  if (rafId) return;
  loop();
}

function loop() {
  rafId = requestAnimationFrame(loop);
  render();
}

function render() {
  if (!canvas || !ctx || !svgElement || ghosts.size === 0) {
    if (ctx) ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio||1), canvas.height / (window.devicePixelRatio||1));
    return;
  }

  // Clear canvas
  const width = canvas.width / (window.devicePixelRatio || 1);
  const height = canvas.height / (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, width, height);

  // Get SVG transform/position
  const rect = svgElement.getBoundingClientRect();
  
  // Calculate scale
  // The SVG preserves aspect ratio (xMidYMid meet).
  // We need to determine the actual rendered scale relative to the viewBox.
  // viewBox is 3500 x 1779.31
  
  // If the SVG is letterboxed, the rect might include the empty space if it's the <svg> element itself?
  // No, getBoundingClientRect on the <svg> element gives the size of the element box.
  // But the content inside is scaled based on viewBox.
  // We need to know the "content rect" inside the SVG.
  
  // However, usually <svg> fills its container.
  // Let's assume the scale is uniform.
  // We can derive the scale factor by comparing rect width to viewBox width?
  // Wait, if preserveAspectRatio is "meet", the content might not fill the rect width OR height.
  
  const scaleX = rect.width / VIEWBOX_WIDTH;
  const scaleY = rect.height / VIEWBOX_HEIGHT;
  const scale = Math.min(scaleX, scaleY); // "meet" uses the smaller scale

  // Calculate the offset of the content within the SVG rect
  // (xMidYMid means it's centered)
  const contentWidth = VIEWBOX_WIDTH * scale;
  const contentHeight = VIEWBOX_HEIGHT * scale;
  
  const offsetX = rect.left + (rect.width - contentWidth) / 2;
  const offsetY = rect.top + (rect.height - contentHeight) / 2;

  // Draw ghosts
  for (const ghost of ghosts.values()) {
    // Convert SVG coordinates to Screen coordinates
    const screenX = offsetX + ghost.x * scale;
    const screenY = offsetY + ghost.y * scale;

    // Check if visible on screen (culling)
    if (screenX < -50 || screenX > width + 50 || screenY < -50 || screenY > height + 50) {
      continue;
    }

    // Draw
    // We draw the pre-rendered image centered at screenX, screenY
    // The image is 2x size, so we draw it at 0.5 scale * current zoom scale?
    // No, the sticker size should scale with the zoom.
    // The sticker diameter in SVG units is STICKER_DIAMETER (36).
    // So on screen it is 36 * scale.
    
    const drawSize = STICKER_DIAMETER * scale;
    
    ctx.drawImage(
      ghostImage, 
      screenX - drawSize / 2, 
      screenY - drawSize / 2, 
      drawSize, 
      drawSize
    );
  }
}
