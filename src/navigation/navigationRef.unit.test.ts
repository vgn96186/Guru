describe('navigationRef.ts', () => {
  let navigationRef: any;
  let createNavigationContainerRef: any;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('@react-navigation/native', () => ({
      createNavigationContainerRef: jest.fn(() => ({
        navigate: jest.fn(),
        isReady: jest.fn(() => true),
      })),
    }));

    navigationRef = require('./navigationRef').navigationRef;
    createNavigationContainerRef = require('@react-navigation/native').createNavigationContainerRef;
  });

  it('is a navigation container reference', () => {
    expect(navigationRef).toBeDefined();
    expect(createNavigationContainerRef).toHaveBeenCalled();
  });

  it('can check if it is ready', () => {
    expect(navigationRef.isReady()).toBe(true);
  });

  it('can navigate', () => {
    navigationRef.navigate('Home', { id: 1 });
    expect(navigationRef.navigate).toHaveBeenCalledWith('Home', { id: 1 });
  });
});
