/* global module, jest */
module.exports = {
  Asset: {
    loadAsync: jest.fn(),
    fromModule: jest.fn(() => ({ uri: 'mock-uri' })),
  },
};
