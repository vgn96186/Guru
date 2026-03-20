export function isFileUri(path: string): boolean {
  return path.startsWith('file://');
}

export function toFileUri(path: string): string {
  return isFileUri(path) ? path : `file://${path}`;
}

export function stripFileUri(path: string): string {
  return isFileUri(path) ? path.slice('file://'.length) : path;
}
