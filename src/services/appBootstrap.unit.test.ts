describe('appBootstrap lazy bundle guard', () => {
  test('treats Metro lazy bundle failures as skippable optional startup errors', async () => {
    const { isSkippableOptionalStartupError } =
      require('./appBootstrapErrors') as typeof import('./appBootstrapErrors');

    expect(
      isSkippableOptionalStartupError({
        name: 'LoadBundleFromServerRequestError',
        message: 'Could not load bundle',
      }),
    ).toBe(true);
  });

  test('does not swallow unrelated startup errors', async () => {
    const { isSkippableOptionalStartupError } =
      require('./appBootstrapErrors') as typeof import('./appBootstrapErrors');

    expect(isSkippableOptionalStartupError(new Error('disk full'))).toBe(false);
  });
});
