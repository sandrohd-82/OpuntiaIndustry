import { requireAnyAreaAccess } from "@/lib/areas/guard";
import type { RubricaAziendaTipo, RubricaContatto } from "@/lib/rubrica/types";

export async function guardRubricaAnagrafica() {
  return requireAnyAreaAccess([
    "amministrazione",
    "produzione",
    "commerciale",
  ]);
}

export const CONTATTO_SELECT =
  "id, nome, cognome, telefono, email, rapporto, azienda_tipo, azienda_id, azienda_label, mansione_id, mansione, note, indirizzo, cap, citta, provincia, nazione, created_at, updated_at";

export function mapContatto(r: Record<string, unknown>): RubricaContatto {
  return {
    id: String(r.id),
    nome: String(r.nome ?? ""),
    cognome: String(r.cognome ?? ""),
    telefono: String(r.telefono ?? ""),
    email: String(r.email ?? ""),
    rapporto: r.rapporto as RubricaContatto["rapporto"],
    aziendaTipo: r.azienda_tipo as RubricaAziendaTipo,
    aziendaId: r.azienda_id ? String(r.azienda_id) : null,
    aziendaLabel: String(r.azienda_label ?? ""),
    mansioneId: r.mansione_id ? String(r.mansione_id) : null,
    mansione: String(r.mansione ?? ""),
    note: String(r.note ?? ""),
    indirizzo: String(r.indirizzo ?? ""),
    cap: String(r.cap ?? ""),
    citta: String(r.citta ?? ""),
    provincia: String(r.provincia ?? ""),
    nazione: String(r.nazione ?? ""),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export type EntityReferentiTipo =
  | "cliente"
  | "fornitore"
  | "cliente_possibile";

export function junctionFor(tipo: EntityReferentiTipo) {
  if (tipo === "cliente") {
    return {
      table: "clienti_referenti" as const,
      fk: "cliente_id" as const,
      aziendaTipo: "cliente" as const,
    };
  }
  if (tipo === "fornitore") {
    return {
      table: "fornitori_referenti" as const,
      fk: "fornitore_id" as const,
      aziendaTipo: "fornitore" as const,
    };
  }
  return {
    table: "clienti_possibili_referenti" as const,
    fk: "cliente_possibile_id" as const,
    aziendaTipo: "cliente_possibile" as const,
  };
}
