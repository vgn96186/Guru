/* global module, jest */
module.exports = {
  loadModel: jest.fn(async () => ({ id: 'mock-model-id' })),
  generateText: jest.fn(async () => ({ text: 'mocked-response' })),
  streamText: jest.fn(async function* () {
    yield { text: 'mocked' };
  }),
  stopGeneration: jest.fn(),
  releaseModel: jest.fn(async () => {}),
  setupAiSdkPolyfills: jest.fn(),
};
