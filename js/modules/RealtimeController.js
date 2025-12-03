
import { supabase, isSupabaseConfigured, deviceId } from "../supabase-config.js";

let channel = null;
let callbacks = {
  onOnlineCountChange: () => {},
  onResonance: () => {},
  getHeat: () => 0, // Default getter
};
let state = {
  onlineCount: 0,
};
let isSubscribed = false;
let shouldTrack = false;

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
      callbacks.onResonance(payload.payload); // Pass the inner payload which contains heat
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        isSubscribed = true;
        if (shouldTrack) {
          await channel.track({
            online_at: new Date().toISOString(),
          });
        }
      }
    });
}

export async function setPresenceState(isEnabled) {
  shouldTrack = isEnabled;
  if (!channel) return;

  if (isSubscribed) {
    if (isEnabled) {
      await channel.track({
        online_at: new Date().toISOString(),
      });
    } else {
      await channel.untrack();
    }
  }
}

export async function triggerResonance() {
  if (!channel) return;
  
  // Get current local heat to share with others
  const currentHeat = callbacks.getHeat ? callbacks.getHeat() : 0;

  // Broadcast to others
  await channel.send({
    type: 'broadcast',
    event: 'resonance',
    payload: { 
      from: deviceId,
      heat: currentHeat 
    },
  });
}

export function getOnlineCount() {
  return state.onlineCount;
}
