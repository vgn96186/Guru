/* global module, jest */
module.exports = {
  initWhisper: jest.fn(),
  initWhisperVad: jest.fn(),
  AudioPcmStreamAdapter: jest.fn(),
  RealtimeTranscriber: jest.fn().mockImplementation(function () {
    this.start = jest.fn();
    this.stop = jest.fn();
  }),
};
