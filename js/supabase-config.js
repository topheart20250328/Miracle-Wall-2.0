import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const fallback = (typeof window !== "undefined" && window.__SUPABASE__) || {};

const SUPABASE_URL = fallback.url || "https://adjtpdrpivdbtztkoxxr.supabase.co";
const SUPABASE_ANON_KEY = fallback.anonKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkanRwZHJwaXZkYnR6dGtveHhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwMjA0MjIsImV4cCI6MjA3ODU5NjQyMn0.O6IkpD-mx4o9XEFIbpc0mkQlIacKvV_15RnSaLAK2b0";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
  },
});

export function isSupabaseConfigured() {
  return !SUPABASE_URL.includes("YOUR-PROJECT") && !SUPABASE_ANON_KEY.includes("YOUR_PUBLIC_ANON_KEY");
}
