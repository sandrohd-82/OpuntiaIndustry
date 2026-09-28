export type PersonaLinea = {
  id: string;
  userId: string | null;
  parentId: string | null;
  grado: "senior" | "professional" | "executive" | null;
  nome: string;
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
}): boolean {
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
        p.grado === "executive" &&
        Boolean(p.userId)
    );
  }
  if (input.actor.grado !== "senior") return [];
  const sotto = idsSottoalbero(input.actor, input.persone);
  return input.persone.filter(
    (p) =>
      p.id !== input.actor.id &&
      sotto.has(p.id) &&
      (p.grado === "professional" || p.grado === "executive") &&
      Boolean(p.userId)
  );
}

export function destinatariVisibili(input: {
  admin: boolean;
  actor: PersonaLinea | null;
  persone: PersonaLinea[];
  commercialeId: string | null;
}): PersonaLinea[] {
  const conUtente = (lista: PersonaLinea[]) =>
    lista.filter(
      (p) =>
        Boolean(p.userId) &&
        (p.grado === "professional" || p.grado === "executive")
    );
  if (input.admin) {
    return conUtente(input.persone);
  }
  if (!input.actor) return [];
  if (!aziendaNellaLinea({
    actor: input.actor,
    persone: input.persone,
    commercialeId: input.commercialeId,
  })) {
    return [];
  }
  return conUtente(destinatariCessione({ actor: input.actor, persone: input.persone }));
}
