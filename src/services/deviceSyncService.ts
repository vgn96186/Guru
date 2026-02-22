import { useState, useEffect } from 'react';
// Use the browser build of mqtt to avoid Node core polyfills
// @ts-ignore
import mqtt from 'mqtt/dist/mqtt';

const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const ROOM_PREFIX = 'neet_study/room/';

export type SyncMessage = 
  | { type: 'LECTURE_STARTED'; subjectId: number }
  | { type: 'LECTURE_STOPPED' }
  | { type: 'DOOMSCROLL_DETECTED' }
  | { type: 'NOTE_SAVED'; note: string }
  | { type: 'BREAK_STARTED'; durationSeconds: number }
  | { type: 'LECTURE_RESUMED' };

let client: mqtt.MqttClient | null = null;
let currentRoomCode: string | null = null;

export function connectToRoom(code: string, onMessage: (msg: SyncMessage) => void) {
  if (client) {
    client.end();
  }
  
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
  } else {
    console.warn('[Sync] Not connected to a room');
  }
}
