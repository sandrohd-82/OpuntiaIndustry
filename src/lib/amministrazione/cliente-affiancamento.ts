export type PersonaLinea = {
  id: string;
  userId: string | null;
  parentId: string | null;
  grado: "senior" | "professional" | "executive" | null;
  nome: string;
  /** Riga vera di organigramma. I profili senza scheda non possono ricevere l'azienda prima del login. */
  scheda: boolean;
};

export function personaAttore(
  persone: PersonaLinea[],
  userId: string
): PersonaLinea | null {
  const mine = persone.filter((p) => p.userId === userId);
  return (
    mine.find((p) => p.grado === "senior") ??
    mine.find((p) => p.grado === "professional") ??
    null
  );
}

function idsSottoalbero(actor: PersonaLinea, persone: PersonaLinea[]): Set<string> {
  const ids = new Set<string>([actor.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of persone) {
      if (p.parentId && ids.has(p.parentId) && !ids.has(p.id)) {
        ids.add(p.id);
        grew = true;
      }
    }
  }
  return ids;
}

export function aziendaNellaLinea(input: {
  actor: PersonaLinea;
  persone: PersonaLinea[];
  commercialeId: string | null;
  commercialePersonaId?: string | null;
}): boolean {
  const personaId = input.commercialePersonaId ?? null;
  if (personaId) {
    if (personaId === input.actor.id) return true;
    if (input.actor.grado !== "senior") return false;
    return idsSottoalbero(input.actor, input.persone).has(personaId);
  }
  if (!input.commercialeId || !input.actor.userId) {
    return input.actor.grado === "senior" && !input.commercialeId;
  }
  if (input.commercialeId === input.actor.userId) return true;
  if (input.actor.grado !== "senior") return false;
  const sotto = idsSottoalbero(input.actor, input.persone);
  return input.persone.some(
    (p) =>
      p.id !== input.actor.id &&
      sotto.has(p.id) &&
      p.userId === input.commercialeId
  );
}

/** Senior: Professional ed Executive della linea. Professional: solo i propri Executive. */
export function destinatariCessione(input: {
  actor: PersonaLinea;
  persone: PersonaLinea[];
}): PersonaLinea[] {
  if (input.actor.grado === "professional") {
    return input.persone.filter(
      (p) =>
        p.parentId === input.actor.id &&
        p.grado === "executive"
    );
  }
  if (input.actor.grado !== "senior") return [];
  const sotto = idsSottoalbero(input.actor, input.persone);
  return input.persone.filter(
    (p) =>
      p.id !== input.actor.id &&
      sotto.has(p.id) &&
      (p.grado === "professional" || p.grado === "executive")
  );
}

export function destinatariVisibili(input: {
  admin: boolean;
  actor: PersonaLinea | null;
  persone: PersonaLinea[];
  commercialeId: string | null;
  commercialePersonaId?: string | null;
}): PersonaLinea[] {
  const conGrado = (lista: PersonaLinea[]) =>
    lista.filter(
      (p) => p.grado === "professional" || p.grado === "executive"
    );
  if (input.admin) {
    return input.persone.filter(
      (p) =>
        p.grado === "senior" ||
        p.grado === "professional" ||
        p.grado === "executive"
    );
  }
  if (!input.actor) return [];
  if (!aziendaNellaLinea({
    actor: input.actor,
    persone: input.persone,
    commercialeId: input.commercialeId,
    commercialePersonaId: input.commercialePersonaId,
  })) {
    return [];
  }
  return conGrado(destinatariCessione({ actor: input.actor, persone: input.persone }));
}
