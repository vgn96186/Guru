export type SyncMessage =
  | { type: 'LECTURE_STARTED'; subjectId: number }
  | { type: 'LECTURE_STOPPED' }
  | { type: 'DOOMSCROLL_DETECTED' }
  | { type: 'NOTE_SAVED'; note: string }
  | { type: 'BREAK_STARTED'; durationSeconds: number }
  | { type: 'LECTURE_RESUMED' };

import { encryptPayload, decryptPayload, clearKeyCache } from './syncCrypto';

const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
// v2 prefix: incompatible with old un-encrypted v1 clients
const ROOM_PREFIX = 'guru/v2/room/';

let client: any = null;
let currentRoomCode: string | null = null;
let mqttModule: any = null;
let mqttUnavailable = false;
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_RECENT_MESSAGE_IDS = 300;
const seenMessageIds = new Map<string, number>();
const subscribers = new Map<string, (msg: SyncMessage) => void>();
let nextSubscriberId = 0;
const outgoingQueue: SyncMessage[] = [];
let isConnected = false;

function markAndCheckReplay(msgId: string, ts: number): boolean {
  const now = Date.now();
  for (const [existingId, existingTs] of seenMessageIds.entries()) {
    if (now - existingTs > CLOCK_SKEW_TOLERANCE_MS) {
      seenMessageIds.delete(existingId);
    }
  }

  if (seenMessageIds.has(msgId)) return true;
  seenMessageIds.set(msgId, ts);

  if (seenMessageIds.size > MAX_RECENT_MESSAGE_IDS) {
    const oldestKey = seenMessageIds.keys().next().value;
    if (oldestKey) seenMessageIds.delete(oldestKey);
  }

  return false;
}

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
let activeTopic: string | null = null;
let connectingRoomCode: string | null = null;

function closeClient(): void {
  if (client) {
    try {
      client.end(true);
    } catch (error) {
      console.warn('[DeviceSyncService] Failed to end MQTT client:', error);
    }
  }
  client = null;
  currentRoomCode = null;
  activeTopic = null;
  connectPromise = null;
  connectingRoomCode = null;
  seenMessageIds.clear();
}

async function getRoomTopic(code: string): Promise<string> {
  const cleanCode = code.trim().toUpperCase();
  const raw = new TextEncoder().encode(cleanCode + '::topic-v2');
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', raw);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return ROOM_PREFIX + hashHex.slice(0, 16);
}

function generateSecureId(prefix: string): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(4));
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return prefix + '_' + hex;
}

async function ensureConnected(code: string): Promise<void> {
  if (mqttUnavailable) return;
  if (client && currentRoomCode === code) return;
  if (connectPromise && (currentRoomCode === code || connectingRoomCode === code)) {
    await connectPromise;
    return;
  }

  if (currentRoomCode !== code) {
    clearKeyCache();
    closeClient();
  }

  connectingRoomCode = code;
  connectPromise = (async () => {
    const mqtt = await getMqtt();
    if (!mqtt) return;
    if (client && currentRoomCode === code) return;

    const clientId = generateSecureId('guru');
    const nextClient = mqtt.connect(BROKER_URL, { clientId });
    const topic = await getRoomTopic(code);

    nextClient.on('connect', () => {
      isConnected = true;
      nextClient.subscribe(topic);
      while (outgoingQueue.length > 0) {
        const msg = outgoingQueue.shift();
        if (msg) sendSyncMessage(msg);
      }
    });

    nextClient.on('message', (receivedTopic: string, message: any) => {
      if (receivedTopic !== topic) return;

      decryptPayload(code, message.toString()).then(decrypted => {
        if (!decrypted) return;
        if (decrypted.ts && Math.abs(Date.now() - decrypted.ts) > CLOCK_SKEW_TOLERANCE_MS) {
          return;
        }
        if (decrypted.msgId && markAndCheckReplay(decrypted.msgId, decrypted.ts ?? Date.now())) {
          return;
        }

        const msg = decrypted.payload as any;
        if (!msg?.type) return;
        for (const listener of subscribers.values()) {
          try {
            listener(msg as SyncMessage);
          } catch (err) {
            console.warn('[DeviceSync] subscriber callback failed:', err);
          }
        }
      }).catch((err) => {
        if (__DEV__) console.debug('[DeviceSync] Failed to decrypt or process message:', err);
      });
    });

    nextClient.on('error', (err: any) => {
      isConnected = false;
      console.warn('[DeviceSync] MQTT error:', err?.message ?? err);
    });

    nextClient.on('offline', () => {
      isConnected = false;
      console.warn('[DeviceSync] MQTT went offline');
    });

    nextClient.on('close', () => {
      isConnected = false;
      if (client === nextClient) {
        client = null;
      }
      console.log('[DeviceSync] MQTT connection closed');
    });

    client = nextClient;
    currentRoomCode = code;
    activeTopic = topic;
  })();

  try {
    await connectPromise;
  } finally {
    connectPromise = null;
    connectingRoomCode = null;
  }
}

export function connectToRoom(code: string, onMessage: (msg: SyncMessage) => void) {
  const subscriberId = `sync_${nextSubscriberId++}`;
  subscribers.set(subscriberId, onMessage);
  ensureConnected(code).catch((err) => {
    console.warn('[DeviceSync] Failed to connect:', err);
  });

  return () => {
    subscribers.delete(subscriberId);
    if (subscribers.size === 0) {
      clearKeyCache();
      closeClient();
      isConnected = false;
    }
  };
}

export function sendSyncMessage(msg: SyncMessage) {
  if (!isConnected || !client || !currentRoomCode || !activeTopic) {
    if (outgoingQueue.length < 50) {
      outgoingQueue.push(msg);
    }
    return;
  }
  const code = currentRoomCode;
  // Encrypt async, then publish
  encryptPayload(code, msg).then(envelope => {
    if (client && isConnected) {
      client.publish(activeTopic, envelope);
    } else {
      outgoingQueue.push(msg);
    }
  }).catch(err => {
    console.warn('[DeviceSync] encrypt failed, dropping message:', err);
  });
}
