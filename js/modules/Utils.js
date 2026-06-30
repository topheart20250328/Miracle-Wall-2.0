
export const STATUS_TOAST_TIMEOUT = 2600;
export const STATUS_PLACEMENT_TIMEOUT = 4200;

export function clampNumber(value, min, max) {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function createUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function formatDateTime(value, formatter = null) {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    if (formatter) {
      return formatter.format(date);
    }
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
  } catch (error) {
    console.error("Failed to format date", error);
    return null;
  }
}

export function isStickerLocked(record, deviceId) {
  if (!record) {
    return false;
  }
  const createdAt = record.created_at ?? record.createdAt ?? null;
  if (!createdAt) {
    return false;
  }
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return false;
  }
  const ageMs = Date.now() - created.getTime();
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  return ageMs > twentyFourHoursMs;
}

export function resolveLockReason(record, deviceId) {
  if (!record) {
    return null;
  }
  const recordDeviceId = record.deviceId ?? record.device_id ?? null;
  const ownsRecord = !recordDeviceId || !deviceId || recordDeviceId === deviceId;
  if (record.isApproved && ownsRecord) {
    return "approved";
  }
  if (isStickerLocked(record, deviceId)) {
    return "time";
  }
  if (recordDeviceId && deviceId && recordDeviceId !== deviceId) {
    return "device";
  }
  return null;
}

/**
 * findSafeSpot - 尋找自動放置的安全座標
 * 使用蒙地卡羅法隨機採樣，尋找位於老鷹形狀內且不與現有貼紙重疊的位置。
 * 
 * @param {Array<SVGPathElement>} eaglePaths - 老鷹形狀的路徑陣列
 * @param {Map} stickersMap - 現有貼紙的 Map
 * @param {Object} viewBox - 畫布視窗資訊 {x, y, width, height}
 * @returns {Object|null} - 成功返回 {x, y}，失敗返回 null
 */
export function findSafeSpot(eaglePaths, stickersMap, viewBox) {
  if (!eaglePaths || eaglePaths.length === 0) return null;

  const MAX_ATTEMPTS = 150; // 嘗試次數
  const SAFE_DISTANCE = 40; // 貼紙直徑 36，留一點緩衝
  const SAFE_DISTANCE_SQ = SAFE_DISTANCE * SAFE_DISTANCE;

  // 1. 計算邊界框 (Bounding Box)
  // 為了效能，我們不需要精確到每條路徑，只要一個大的範圍即可
  // 假設 ViewBox 已經大致定義了老鷹的範圍，或者我們 hardcode 一個經驗值範圍
  // 根據專案經驗，老鷹大概在 0 ~ 3500, 0 ~ 1700
  // 但為了準確，最好還是遍歷一下 paths 的 bbox
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  
  // 如果傳入的 path 還沒有 bbox 緩存，計算一次
  for (const path of eaglePaths) {
      try {
          const bbox = path.getBBox();
          if (bbox.x < minX) minX = bbox.x;
          if (bbox.y < minY) minY = bbox.y;
          if (bbox.x + bbox.width > maxX) maxX = bbox.x + bbox.width;
          if (bbox.y + bbox.height > maxY) maxY = bbox.y + bbox.height;
      } catch (e) {
          // 在某些環境下 getBBox 可能失敗，回退到 ViewBox
          minX = viewBox.x;
          maxX = viewBox.width;
          minY = viewBox.y;
          maxY = viewBox.height;
          break;
      }
  }
  
  // 稍微內縮一點，避免貼在邊緣
  const padding = 20;
  minX += padding;
  maxX -= padding;
  minY += padding;
  maxY -= padding;

  // 2. 隨機採樣
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const randX = Math.random() * (maxX - minX) + minX;
      const randY = Math.random() * (maxY - minY) + minY;
      
      // 3. 形狀檢測 (Point in Fill)
      let inside = false;
      
      // Strict Check: Ensure ENTIRE sticker is inside by checking center + 4 equidistant points on circumference
      const pointsToCheck = [
        new DOMPoint(randX, randY), // Center
        new DOMPoint(randX + 16, randY), // Right (Radius ~18, safety 16)
        new DOMPoint(randX - 16, randY), // Left
        new DOMPoint(randX, randY + 16), // Bottom
        new DOMPoint(randX, randY - 16)  // Top
      ];

      // 只要在一條 path 內就算 inside (聯集)，但五個點必須全都在該 Path 內 (或任意 Valid Path 內?)
      // 簡單起見，要求五個點都必須在 *某個* Path 內 (可以是不同的 path, 但老鷹通常是單一圖形或緊密連接)
      // 嚴格一點: 五個點都要在 UNION of paths 內.
      
      const allPointsInside = pointsToCheck.every(pt => {
          for (const path of eaglePaths) {
               if (path.isPointInFill(pt)) return true;
          }
          return false;
      });

      if (!allPointsInside) continue;

      // 4. 碰撞檢測 (Collision Check)
      let collision = false;
      for (const sticker of stickersMap.values()) {
           if (typeof sticker.x !== 'number' || typeof sticker.y !== 'number') continue;
           
           const dx = randX - sticker.x;
           const dy = randY - sticker.y;
           const distSq = dx*dx + dy*dy;
           
           if (distSq < SAFE_DISTANCE_SQ) {
               collision = true;
               break;
           }
      }

      if (!collision) {
          return { x: randX, y: randY };
      }
  }

  return null;
}
