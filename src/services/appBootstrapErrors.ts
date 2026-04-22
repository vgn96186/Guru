export function isSkippableOptionalStartupError(error: unknown): boolean {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : '';
  const normalized = `${name} ${message}`.toLowerCase();

  return (
    normalized.includes('loadbundlefromserverrequesterror') &&
    normalized.includes('could not load bundle')
  );
}
