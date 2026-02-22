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

async function getMqtt() {
  if (mqttModule) return mqttModule;
  try {
    // @ts-ignore - lazy load to avoid crashing the bundle if polyfills are missing
    mqttModule = require('mqtt/dist/mqtt');
    return mqttModule;
  } catch (e) {
    console.warn('[Sync] MQTT not available:', e);
    return null;
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
      console.log('[Sync] Connected to room:', code);
      client?.subscribe(topic, (err: any) => {
        if (err) console.error('[Sync] Subscribe error', err);
      });
    });

    client.on('message', (receivedTopic: string, message: any) => {
      if (receivedTopic === topic) {
        try {
          const payload = JSON.parse(message.toString()) as SyncMessage;
          onMessage(payload);
        } catch (e) {
          console.error('[Sync] Parse error', e);
        }
      }
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
