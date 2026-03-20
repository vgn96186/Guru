/* global module, jest */
module.exports = {
  makeWorklet: jest.fn(),
  Worklets: {
    createRunInJsFn: jest.fn(),
  },
};
