export const PROFILE_STATI_OPERATIVI = [
  "test",
  "pre_operativo",
  "operativo",
  "sospeso",
  "bloccato",
] as const;

export type ProfileStatoOperativo = (typeof PROFILE_STATI_OPERATIVI)[number];

export const PROFILE_STATO_LABELS: Record<ProfileStatoOperativo, string> = {
  test: "Test",
  pre_operativo: "Pre-operativo",
  operativo: "Operativo",
  sospeso: "Sospeso",
  bloccato: "Bloccato",
};

export function parseProfileStatoOperativo(
  value: unknown
): ProfileStatoOperativo {
  if (
    value === "test" ||
    value === "pre_operativo" ||
    value === "sospeso" ||
    value === "bloccato" ||
    value === "operativo"
  ) {
    return value;
  }
  return "operativo";
}

/** Login autonomo dell’operatore: solo dopo attivazione. */
export function isOperatorSelfLoginAllowed(
  stato: ProfileStatoOperativo
): boolean {
  return stato === "operativo";
}

/** Fase in cui il Super Admin configura menu e autorizzazioni. */
export function isConfigStato(stato: ProfileStatoOperativo): boolean {
  return stato === "test";
}

/** Test o pre-operativo: accesso solo tramite switch Super Admin. */
export function isSwitchOnlyStato(stato: ProfileStatoOperativo): boolean {
  return stato === "test" || stato === "pre_operativo";
}

export function profileStatoLoginMessage(stato: ProfileStatoOperativo): string {
  if (stato === "test") {
    return "Profilo in fase di test. Accesso solo tramite Super Admin.";
  }
  if (stato === "pre_operativo") {
    return "Profilo in pre-operativo. Non ancora abilitato. Accesso solo tramite Super Admin.";
  }
  if (stato === "sospeso") {
    return "Profilo sospeso. Contatta il Super Admin.";
  }
  if (stato === "bloccato") {
    return "Profilo bloccato. Contatta il Super Admin.";
  }
  return "Accesso non consentito.";
}
