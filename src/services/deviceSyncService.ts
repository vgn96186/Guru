export type SyncMessage =
  | { type: 'LECTURE_STARTED'; subjectId: number }
  | { type: 'LECTURE_STOPPED' }
  | { type: 'DOOMSCROLL_DETECTED' }
  | { type: 'NOTE_SAVED'; note: string }
  | { type: 'BREAK_STARTED'; durationSeconds: number }
  | { type: 'LECTURE_RESUMED' };

const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const ROOM_PREFIX = 'neet_study/room/';

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

export function connectToRoom(code: string, onMessage: (msg: SyncMessage) => void) {
  if (client) {
    client.end();
  }

  getMqtt().then((mqtt) => {
    if (!mqtt) return;

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
          const payload = JSON.parse(message.toString()) as SyncMessage;
          onMessage(payload);
        } catch {
          // ignore malformed messages
        }
      }
    });

    client.on('error', () => {
      // silently handle connection errors
    });
  });

  return () => {
    if (client) {
      client.end();
      client = null;
      currentRoomCode = null;
    }
  };
}

export function sendSyncMessage(msg: SyncMessage) {
  if (client && currentRoomCode) {
    const topic = ROOM_PREFIX + currentRoomCode;
    client.publish(topic, JSON.stringify(msg));
  }
}
