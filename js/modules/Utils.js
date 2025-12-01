
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
