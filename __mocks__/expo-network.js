module.exports = {
  __esModule: true,
  NetworkStateType: {
    NONE: 'NONE',
    UNKNOWN: 'UNKNOWN',
    WIFI: 'WIFI',
  },
  getNetworkStateAsync: jest.fn(async () => ({
    type: 'WIFI',
    isConnected: true,
    isInternetReachable: true,
  })),
  addNetworkStateListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
};
