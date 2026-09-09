export const PROFILE_STATI_OPERATIVI = [
  "test",
  "operativo",
  "sospeso",
  "bloccato",
] as const;

export type ProfileStatoOperativo = (typeof PROFILE_STATI_OPERATIVI)[number];

export const PROFILE_STATO_LABELS: Record<ProfileStatoOperativo, string> = {
  test: "Test",
  operativo: "Operativo",
  sospeso: "Sospeso",
  bloccato: "Bloccato",
};

export function parseProfileStatoOperativo(
  value: unknown
): ProfileStatoOperativo {
  if (
    value === "test" ||
    value === "sospeso" ||
    value === "bloccato" ||
    value === "operativo"
  ) {
    return value;
  }
  return "operativo";
}

export function profileStatoLoginMessage(stato: ProfileStatoOperativo): string {
  if (stato === "test") {
    return "Profilo in fase di test. Accesso solo tramite Super Admin.";
  }
  if (stato === "sospeso") {
    return "Profilo sospeso. Contatta il Super Admin.";
  }
  if (stato === "bloccato") {
    return "Profilo bloccato. Contatta il Super Admin.";
  }
  return "Accesso non consentito.";
}
