export function isQuizImageHttpUrl(url: string | null | undefined): boolean {
  const t = url?.trim();
  if (!t) return false;
  return /^https?:\/\//i.test(t);
}
