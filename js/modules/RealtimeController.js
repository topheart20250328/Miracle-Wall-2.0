
import { supabase, isSupabaseConfigured, deviceId } from "../supabase-config.js";

let channel = null;
let callbacks = {
  onOnlineCountChange: () => {},
  onResonance: () => {},
};
let state = {
  onlineCount: 0,
};

export function initRealtimeController(controllerCallbacks) {
  callbacks = { ...callbacks, ...controllerCallbacks };

  if (!isSupabaseConfigured()) {
    console.warn("Supabase not configured, realtime features disabled.");
    return;
  }

  // Join a channel for presence and broadcast
  channel = supabase.channel('room:lobby', {
    config: {
      presence: {
        key: deviceId,
      },
    },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const newState = channel.presenceState();
      const count = Object.keys(newState).length;
      state.onlineCount = count;
      callbacks.onOnlineCountChange(count);
    })
    .on('broadcast', { event: 'resonance' }, (payload) => {
      callbacks.onResonance(payload);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          online_at: new Date().toISOString(),
        });
      }
    });
}

export async function triggerResonance() {
  if (!channel) return;
  
  // Broadcast to others
  await channel.send({
    type: 'broadcast',
    event: 'resonance',
    payload: { from: deviceId },
  });
}

export function getOnlineCount() {
  return state.onlineCount;
}
