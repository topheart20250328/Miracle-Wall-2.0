import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const fallback = (typeof window !== "undefined" && window.__SUPABASE__) || {};
const DEVICE_STORAGE_KEY = "wallDeviceId";

const SUPABASE_URL = fallback.url || "https://adjtpdrpivdbtztkoxxr.supabase.co";
const SUPABASE_ANON_KEY = fallback.anonKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkanRwZHJwaXZkYnR6dGtveHhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwMjA0MjIsImV4cCI6MjA3ODU5NjQyMn0.O6IkpD-mx4o9XEFIbpc0mkQlIacKvV_15RnSaLAK2b0";

function ensureDeviceId() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const storage = window.localStorage;
    if (!storage) {
      return createUuid();
    }
    let deviceId = storage.getItem(DEVICE_STORAGE_KEY);
    if (!deviceId) {
      deviceId = createUuid();
      storage.setItem(DEVICE_STORAGE_KEY, deviceId);
    }
    return deviceId;
  } catch (error) {
    console.warn("Unable to access localStorage for device binding", error);
    return createUuid();
  }
}

function createUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export const deviceId = ensureDeviceId();

if (typeof window !== "undefined") {
  window.__WALL_DEVICE_ID__ = deviceId;
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
  },
  global: {
    headers: deviceId ? { "x-device-id": deviceId } : {},
  },
});

export function isSupabaseConfigured() {
  return !SUPABASE_URL.includes("YOUR-PROJECT") && !SUPABASE_ANON_KEY.includes("YOUR_PUBLIC_ANON_KEY");
}

export function createSupabaseClient(options = {}) {
  const headers = {
    ...(deviceId ? { "x-device-id": deviceId } : {}),
    ...(options.headers ?? {}),
  };
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
    },
    global: {
      headers,
    },
  });
}
