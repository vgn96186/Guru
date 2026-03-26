export function isFileUri(path: string): boolean {
  return path.startsWith('file://');
}

export function toFileUri(path: string): string {
  if (isFileUri(path) || path.startsWith('content://')) return path;
  return `file://${path}`;
}

export function stripFileUri(path: string): string {
  return isFileUri(path) ? path.slice('file://'.length) : path;
}
