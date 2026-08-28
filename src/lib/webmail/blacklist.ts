export function normalizeBlacklistEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidBlacklistEmail(email: string): boolean {
  const e = normalizeBlacklistEmail(email);
  return e.includes("@") && e.length >= 3 && e.length <= 320;
}
