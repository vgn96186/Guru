export type SyncMessage =
  | { type: 'LECTURE_STARTED'; subjectId: number }
  | { type: 'LECTURE_STOPPED' }
  | { type: 'DOOMSCROLL_DETECTED' }
  | { type: 'NOTE_SAVED'; note: string }
  | { type: 'BREAK_STARTED'; durationSeconds: number }
  | { type: 'LECTURE_RESUMED' };

const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const ROOM_PREFIX = 'neet_study/room/';

// Simple HMAC-like message signing using the room code as shared secret.
// This does NOT replace proper auth but prevents trivial injection on a public broker.
function signPayload(json: string, secret: string): string {
  let hash = 0;
  const combined = json + ':' + secret;
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) - hash + combined.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

let client: any = null;
let currentRoomCode: string | null = null;
let mqttModule: any = null;
let mqttUnavailable = false;

async function getMqtt() {
  if (mqttModule) return mqttModule;
  if (mqttUnavailable) return null;
  try {
    // @ts-ignore - lazy load to avoid crashing the bundle if polyfills are missing
    mqttModule = require('mqtt/dist/mqtt');
    return mqttModule;
  } catch {
    mqttUnavailable = true;
    return null;
  }
}

/** Returns true if the MQTT module is loadable and sync is available */
export function isSyncAvailable(): boolean {
  if (mqttModule) return true;
  if (mqttUnavailable) return false;
  try {
    // @ts-ignore
    require('mqtt/dist/mqtt');
    return true;
  } catch {
    return false;
  }
}

let connectPromise: Promise<void> | null = null;

export function connectToRoom(code: string, onMessage: (msg: SyncMessage) => void) {
  // Cancel any in-flight connection first
  if (client) {
    try { client.end(true); } catch {}
    client = null;
  }

  let cancelled = false;

  connectPromise = getMqtt().then((mqtt) => {
    if (!mqtt || cancelled) return;

    const clientId = 'neet_' + Math.random().toString(16).slice(2, 8);
    client = mqtt.connect(BROKER_URL, { clientId });
    currentRoomCode = code;

    const topic = ROOM_PREFIX + code;

    client.on('connect', () => {
      client?.subscribe(topic);
    });

    client.on('message', (receivedTopic: string, message: any) => {
      if (receivedTopic === topic) {
        try {
          const raw = JSON.parse(message.toString());
          const { _sig, ...payload } = raw;
          // Verify signature to reject injected messages
          if (_sig !== signPayload(JSON.stringify(payload), code)) return;
          onMessage(payload as SyncMessage);
        } catch {
          // ignore malformed messages
        }
      }
    });

    client.on('error', (err: any) => {
      console.warn('[DeviceSync] MQTT error:', err?.message ?? err);
    });

    client.on('offline', () => {
      console.warn('[DeviceSync] MQTT went offline');
    });

    client.on('close', () => {
      console.log('[DeviceSync] MQTT connection closed');
    });
  });

  return () => {
    cancelled = true;
    if (client) {
      try { client.end(true); } catch {}
      client = null;
      currentRoomCode = null;
    }
  };
}

export function sendSyncMessage(msg: SyncMessage) {
  if (client && currentRoomCode) {
    const topic = ROOM_PREFIX + currentRoomCode;
    const json = JSON.stringify(msg);
    const signed = { ...msg, _sig: signPayload(json, currentRoomCode) };
    client.publish(topic, JSON.stringify(signed));
  }
}
