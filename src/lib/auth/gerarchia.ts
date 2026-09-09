export const PROFILE_GERARCHIE = [
  "amministratore",
  "segnor",
  "capo_area",
  "responsabile",
  "operatore",
] as const;

export type ProfileGerarchia = (typeof PROFILE_GERARCHIE)[number];

export const PROFILE_POTERI = ["superadmin", "operatore"] as const;
export type ProfilePotere = (typeof PROFILE_POTERI)[number];

export const PROFILE_GERARCHIA_LABELS: Record<ProfileGerarchia, string> = {
  amministratore: "Amministratore",
  segnor: "Segnor",
  capo_area: "Capo Area",
  responsabile: "Responsabile",
  operatore: "Operatore",
};

export const PROFILE_POTERE_LABELS: Record<ProfilePotere, string> = {
  superadmin: "Super Admin",
  operatore: "Operatore",
};

/** Rank crescente = più in basso nella gerarchia. */
export const PROFILE_GERARCHIA_RANK: Record<ProfileGerarchia, number> = {
  amministratore: 1,
  segnor: 2,
  capo_area: 3,
  responsabile: 4,
  operatore: 5,
};

export const PROFILE_REPARTI_OPERATIVI = [
  "uffici",
  "commerciale",
  "produzione",
  "movimentazione",
  "pulizia_sanificazione",
  "magazzino",
] as const;

export type ProfileRepartoOperativo = (typeof PROFILE_REPARTI_OPERATIVI)[number];

export const PROFILE_REPARTO_LABELS: Record<ProfileRepartoOperativo, string> = {
  uffici: "Uffici",
  commerciale: "Commerciale",
  produzione: "Produzione",
  movimentazione: "Movimentazione",
  pulizia_sanificazione: "Pulizia e sanificazione",
  magazzino: "Magazzino",
};

export function parseProfileGerarchia(value: unknown): ProfileGerarchia {
  if (
    value === "amministratore" ||
    value === "segnor" ||
    value === "capo_area" ||
    value === "responsabile" ||
    value === "operatore"
  ) {
    return value;
  }
  return "operatore";
}

export function parseProfilePotere(value: unknown): ProfilePotere {
  return value === "superadmin" ? "superadmin" : "operatore";
}

export function parseProfileReparto(
  value: unknown
): ProfileRepartoOperativo | null {
  if (
    value === "uffici" ||
    value === "commerciale" ||
    value === "produzione" ||
    value === "movimentazione" ||
    value === "pulizia_sanificazione" ||
    value === "magazzino"
  ) {
    return value;
  }
  return null;
}

/** In fase Test il ruolo Super Admin non viene assegnato: lo switch deve restare possibile. */
export function roleCodeFromPotereGerarchia(
  potere: ProfilePotere,
  gerarchia: ProfileGerarchia
): "admin" | "manager" | "operator" {
  if (potere === "superadmin" || gerarchia === "amministratore") {
    return "admin";
  }
  if (gerarchia === "operatore") return "operator";
  return "manager";
}

export function canHaveSubordinates(gerarchia: ProfileGerarchia): boolean {
  return PROFILE_GERARCHIA_RANK[gerarchia] < PROFILE_GERARCHIA_RANK.operatore;
}

export function isSubordinateGerarchia(
  actor: ProfileGerarchia,
  target: ProfileGerarchia
): boolean {
  return PROFILE_GERARCHIA_RANK[target] > PROFILE_GERARCHIA_RANK[actor];
}
