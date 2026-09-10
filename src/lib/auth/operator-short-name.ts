/** Nome operatore in menu: «Sandro I.» */
export function formatOperatorShortName(input: {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
}): string {
  const first = String(input.first_name ?? "").trim();
  const last = String(input.last_name ?? "").trim();
  if (first && last) {
    return `${first} ${last.charAt(0).toUpperCase()}.`;
  }
  if (first) return first;

  const parts = String(input.full_name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    const nome = parts[0];
    const iniziale = parts[parts.length - 1]?.charAt(0);
    if (nome && iniziale) return `${nome} ${iniziale.toUpperCase()}.`;
  }
  if (parts[0]) return parts[0];
  return String(input.email ?? "Operatore").trim() || "Operatore";
}
