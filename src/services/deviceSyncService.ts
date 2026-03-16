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
  if (mqttUnavailable) {
    console.warn('[DeviceSync] MQTT module unavailable');
    return;
  }
  
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
    if (!mqtt) {
      console.warn('[DeviceSync] MQTT module not available');
      return;
    }
    if (client && currentRoomCode === code) return;

    const clientId = generateSecureId('guru');
    const nextClient = mqtt.connect(BROKER_URL, { 
      clientId,
      // Add connection timeout and keepalive
      connectTimeout: 10 * 1000,
      keepalive: 60,
      clean: true,
      // Reject unauthorized connections (basic auth not supported by public broker)
      // In production, use a private broker with authentication
    });
    
    const topic = await getRoomTopic(code);

    nextClient.on('connect', () => {
      isConnected = true;
      console.log('[DeviceSync] Connected to MQTT broker');
      nextClient.subscribe(topic, (err: any) => {
        if (err) {
          console.error('[DeviceSync] Failed to subscribe to topic:', err);
        } else {
          console.log('[DeviceSync] Subscribed to topic:', topic);
        }
      });
      
      // Flush outgoing queue
      while (outgoingQueue.length > 0) {
        const msg = outgoingQueue.shift();
        if (msg) sendSyncMessage(msg);
      }
    });

    nextClient.on('message', async (receivedTopic: string, message: any) => {
      if (receivedTopic !== topic) return;

      try {
        const decrypted = await decryptPayload(code, message.toString());
        if (!decrypted) {
          console.warn('[DeviceSync] Failed to decrypt message');
          return;
        }
        
        // Validate timestamp (with clock skew tolerance)
        if (decrypted.ts && Math.abs(Date.now() - decrypted.ts) > CLOCK_SKEW_TOLERANCE_MS) {
          console.warn('[DeviceSync] Message timestamp too old or from future, ignoring');
          return;
        }
        
        // Check for replay attacks
        if (decrypted.msgId && markAndCheckReplay(decrypted.msgId, decrypted.ts ?? Date.now())) {
          console.debug('[DeviceSync] Duplicate message detected, ignoring');
          return;
        }

        const msg = decrypted.payload as any;
        if (!msg?.type) {
          console.warn('[DeviceSync] Message missing type field');
          return;
        }
        
        // Validate message type
        const validTypes: string[] = [
          'LECTURE_STARTED', 'LECTURE_STOPPED', 'DOOMSCROLL_DETECTED',
          'NOTE_SAVED', 'BREAK_STARTED', 'LECTURE_RESUMED'
        ];
        if (!validTypes.includes(msg.type)) {
          console.warn('[DeviceSync] Unknown message type:', msg.type);
          return;
        }
        
        // Validate message structure based on type
        switch (msg.type) {
          case 'LECTURE_STARTED':
            if (typeof msg.subjectId !== 'number') {
              console.warn('[DeviceSync] LECTURE_STARTED missing subjectId');
              return;
            }
            break;
          case 'BREAK_STARTED':
            if (typeof msg.durationSeconds !== 'number') {
              console.warn('[DeviceSync] BREAK_STARTED missing durationSeconds');
              return;
            }
            break;
          case 'NOTE_SAVED':
            if (typeof msg.note !== 'string') {
              console.warn('[DeviceSync] NOTE_SAVED missing note string');
              return;
            }
            break;
        }
        
        for (const listener of subscribers.values()) {
          try {
            listener(msg as SyncMessage);
          } catch (err) {
            console.warn('[DeviceSync] subscriber callback failed:', err);
          }
        }
      } catch (err) {
        console.warn('[DeviceSync] Failed to process message:', err);
      }
    });

    nextClient.on('error', (err: any) => {
      isConnected = false;
      console.error('[DeviceSync] MQTT error:', err?.message ?? err);
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

    // Handle reconnection
    nextClient.on('reconnect', () => {
      console.log('[DeviceSync] MQTT reconnecting...');
    });

    client = nextClient;
    currentRoomCode = code;
    activeTopic = topic;
  })();

  try {
    await connectPromise;
  } catch (err) {
    console.error('[DeviceSync] Connection failed:', err);
    throw err;
  } finally {
    connectPromise = null;
    connectingRoomCode = null;
  }
}

export function connectToRoom(code: string, onMessage: (msg: SyncMessage) => void) {
  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    console.error('[DeviceSync] Invalid room code provided');
    return () => {};
  }
  
  // Validate room code format (4-6 uppercase alphanumeric)
  const cleanCode = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,6}$/.test(cleanCode)) {
    console.warn('[DeviceSync] Unusual room code format:', code);
  }
  
  const subscriberId = `sync_${nextSubscriberId++}`;
  subscribers.set(subscriberId, onMessage);
  
  ensureConnected(cleanCode).catch((err) => {
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
    } else {
      console.warn('[DeviceSync] Outgoing queue full, dropping message');
    }
    return;
  }
  
  const code = currentRoomCode;
  // Encrypt async, then publish
  encryptPayload(code, msg).then(envelope => {
    if (client && isConnected) {
      client.publish(activeTopic, envelope, (err: any) => {
        if (err) {
          console.warn('[DeviceSync] Publish failed:', err);
          // Re-queue for retry
          if (outgoingQueue.length < 50) {
            outgoingQueue.push(msg);
          }
        }
      });
    } else {
      // Connection lost, re-queue
      if (outgoingQueue.length < 50) {
        outgoingQueue.push(msg);
      }
    }
  }).catch(err => {
    console.warn('[DeviceSync] encrypt failed, dropping message:', err);
  });
}
