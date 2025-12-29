
import { supabase, isSupabaseConfigured, deviceId } from "../supabase-config.js";

let channel = null;
let callbacks = {
  onOnlineCountChange: () => {},
  onResonance: () => {},
  onPresenceChange: () => {},
  getHeat: () => 0, // Default getter
};
let state = {
  onlineCount: 0,
  presenceData: {},
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
      callbacks.onPresenceChange(newState);
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
            ...state.presenceData,
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
        ...state.presenceData,
      });
    } else {
      await channel.untrack();
    }
  }
}

export async function updatePresence(data) {
  if (!channel || !isSubscribed || !shouldTrack) {
    // Update local state even if not tracking yet, so it's ready when we do
    state.presenceData = { ...state.presenceData, ...data };
    return;
  }
  
  state.presenceData = { ...state.presenceData, ...data };
  
  await channel.track({
    online_at: new Date().toISOString(),
    ...state.presenceData,
  });
}

let lastTriggerTime = 0;
const TRIGGER_THROTTLE_MS = 100; // Max 10 messages per second

export async function triggerResonance() {
  if (!channel) return;
  
  const now = Date.now();
  if (now - lastTriggerTime < TRIGGER_THROTTLE_MS) {
    return;
  }
  lastTriggerTime = now;
  
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
