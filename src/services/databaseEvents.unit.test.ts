import { dbEvents, notifyDbUpdate, DB_EVENT_KEYS } from './databaseEvents';

describe('databaseEvents', () => {
  it('emits a LECTURE_SAVED event', async () => {
    const testPayload = { id: 'test-id' };
    const received = new Promise((resolve) => {
      dbEvents.once(DB_EVENT_KEYS.LECTURE_SAVED, resolve);
    });
    notifyDbUpdate(DB_EVENT_KEYS.LECTURE_SAVED, testPayload);
    await expect(received).resolves.toEqual(testPayload);
  });

  it('emits a TRANSCRIPT_RECOVERED event', async () => {
    const testPayload = { transcript: 'recovered content' };
    const received = new Promise((resolve) => {
      dbEvents.once(DB_EVENT_KEYS.TRANSCRIPT_RECOVERED, resolve);
    });
    notifyDbUpdate(DB_EVENT_KEYS.TRANSCRIPT_RECOVERED, testPayload);
    await expect(received).resolves.toEqual(testPayload);
  });

  it('emits a RECORDING_RECOVERED event', async () => {
    const testPayload = { recordingPath: 'path/to/recording' };
    const received = new Promise((resolve) => {
      dbEvents.once(DB_EVENT_KEYS.RECORDING_RECOVERED, resolve);
    });
    notifyDbUpdate(DB_EVENT_KEYS.RECORDING_RECOVERED, testPayload);
    await expect(received).resolves.toEqual(testPayload);
  });

  it('emits a PROGRESS_UPDATED event', async () => {
    const testPayload = { topicId: 'topic123' };
    const received = new Promise((resolve) => {
      dbEvents.once(DB_EVENT_KEYS.PROGRESS_UPDATED, resolve);
    });
    notifyDbUpdate(DB_EVENT_KEYS.PROGRESS_UPDATED, testPayload);
    await expect(received).resolves.toEqual(testPayload);
  });

  it('emits a PROFILE_UPDATED event', async () => {
    const testPayload = { profileId: 'profile123' };
    const received = new Promise((resolve) => {
      dbEvents.once(DB_EVENT_KEYS.PROFILE_UPDATED, resolve);
    });
    notifyDbUpdate(DB_EVENT_KEYS.PROFILE_UPDATED, testPayload);
    await expect(received).resolves.toEqual(testPayload);
  });

  it('handles events without payloads', async () => {
    const received = new Promise((resolve) => {
      dbEvents.once('ANY_EVENT', resolve);
    });
    notifyDbUpdate('ANY_EVENT');
    await expect(received).resolves.toBeUndefined();
  });

  it('handles events not in DB_EVENT_KEYS', async () => {
    const testPayload = { data: 'some-data' };
    const received = new Promise((resolve) => {
      dbEvents.once('CUSTOM_EVENT', resolve);
    });
    notifyDbUpdate('CUSTOM_EVENT', testPayload);
    await expect(received).resolves.toEqual(testPayload);
  });
});
