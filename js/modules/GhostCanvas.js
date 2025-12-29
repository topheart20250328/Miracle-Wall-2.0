
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

export function updateGhostDirectly(deviceId, x, y, timestamp) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    // If invalid coordinates (or null), remove ghost
    ghosts.delete(deviceId);
    return;
  }

  const existing = ghosts.get(deviceId);
  // Only update if timestamp is newer or equal
  if (!existing || timestamp >= existing.timestamp) {
    ghosts.set(deviceId, { x, y, timestamp });
  }
}

export function syncGhosts(presenceState, currentDeviceId) {
  // 1. Identify active ghosts from presence
  const activeDeviceIds = new Set();

  for (const key in presenceState) {
    if (key === currentDeviceId) continue;

    const presences = presenceState[key];
    const presence = presences[0]; 
    
    if (presence && presence.typingLocation) {
      const { x, y, timestamp } = presence.typingLocation;
      
      if (Number.isFinite(x) && Number.isFinite(y)) {
        activeDeviceIds.add(key);
        
        // Update ghost if presence data is newer than what we have (from broadcast)
        // If presence doesn't have timestamp (legacy), assume it's current but give it low priority?
        // We added timestamp to presence payload, so it should be there.
        // If not, use Date.now() but be careful not to overwrite newer broadcasts.
        const ts = timestamp || 0; 
        
        const existing = ghosts.get(key);
        if (!existing || ts >= existing.timestamp) {
           ghosts.set(key, { x, y, timestamp: ts || Date.now() });
        }
      }
    }
  }
  
  // 2. Remove ghosts that are no longer in presence
  // BUT: Be careful. Presence might be slightly delayed.
  // If we received a broadcast "I'm here" 10ms ago, but presence sync (generated 100ms ago) says "Not here",
  // we shouldn't delete it.
  // However, usually presence is the authority for "who is online".
  // If a user disconnects, they disappear from presence.
  // If we keep them because of an old broadcast, they might stick around forever.
  
  // Strategy:
  // If a device is NOT in presenceState, we should probably remove it, 
  // UNLESS it was updated very recently via broadcast (e.g. < 2 seconds ago).
  // This handles the "joined but presence not synced yet" case.
  
  const now = Date.now();
  for (const [deviceId, ghost] of ghosts.entries()) {
    if (!activeDeviceIds.has(deviceId)) {
      // If the ghost was updated more than 5 seconds ago and is not in presence, kill it.
      // 5 seconds is generous for presence sync.
      if (now - ghost.timestamp > 5000) {
        ghosts.delete(deviceId);
      }
    }
  }
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
