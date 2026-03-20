import { dbEvents, notifyDbUpdate, DB_EVENT_KEYS } from './databaseEvents';

describe('databaseEvents', () => {
  it('emits a LECTURE_SAVED event', (done) => {
    const testPayload = { id: 'test-id' };
    dbEvents.once(DB_EVENT_KEYS.LECTURE_SAVED, (payload) => {
      expect(payload).toEqual(testPayload);
      done();
    });
    notifyDbUpdate(DB_EVENT_KEYS.LECTURE_SAVED, testPayload);
  });

  it('emits a TRANSCRIPT_RECOVERED event', (done) => {
    const testPayload = { transcript: 'recovered content' };
    dbEvents.once(DB_EVENT_KEYS.TRANSCRIPT_RECOVERED, (payload) => {
      expect(payload).toEqual(testPayload);
      done();
    });
    notifyDbUpdate(DB_EVENT_KEYS.TRANSCRIPT_RECOVERED, testPayload);
  });

  it('emits a RECORDING_RECOVERED event', (done) => {
    const testPayload = { recordingPath: 'path/to/recording' };
    dbEvents.once(DB_EVENT_KEYS.RECORDING_RECOVERED, (payload) => {
      expect(payload).toEqual(testPayload);
      done();
    });
    notifyDbUpdate(DB_EVENT_KEYS.RECORDING_RECOVERED, testPayload);
  });

  it('emits a PROGRESS_UPDATED event', (done) => {
    const testPayload = { topicId: 'topic123' };
    dbEvents.once(DB_EVENT_KEYS.PROGRESS_UPDATED, (payload) => {
      expect(payload).toEqual(testPayload);
      done();
    });
    notifyDbUpdate(DB_EVENT_KEYS.PROGRESS_UPDATED, testPayload);
  });

  it('emits a PROFILE_UPDATED event', (done) => {
    const testPayload = { profileId: 'profile123' };
    dbEvents.once(DB_EVENT_KEYS.PROFILE_UPDATED, (payload) => {
      expect(payload).toEqual(testPayload);
      done();
    });
    notifyDbUpdate(DB_EVENT_KEYS.PROFILE_UPDATED, testPayload);
  });

  it('handles events without payloads', (done) => {
    dbEvents.once('ANY_EVENT', (payload) => {
      expect(payload).toBeUndefined();
      done();
    });
    notifyDbUpdate('ANY_EVENT');
  });

  it('handles events not in DB_EVENT_KEYS', (done) => {
    const testPayload = { data: 'some-data' };
    dbEvents.once('CUSTOM_EVENT', (payload) => {
      expect(payload).toEqual(testPayload);
      done();
    });
    notifyDbUpdate('CUSTOM_EVENT', testPayload);
  });
});
