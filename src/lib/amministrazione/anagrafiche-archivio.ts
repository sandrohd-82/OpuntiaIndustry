import type { AnagraficaSyncDraft } from "@/lib/amministrazione/fic-anagrafiche";
import { normalizeVatKey } from "@/lib/amministrazione/fic-anagrafiche";
import { emptySede } from "@/lib/amministrazione/fornitori";
import type {
  ClienteArchivioRow,
  FornitoreArchivioRow,
} from "@/types/database";

export type ArchivioMotivo = "eliminata" | "scartata_sync" | "pulizia";

export type AnagraficaArchivioHit = {
  id: string;
  kind: "cliente" | "fornitore";
  partitaIva: string;
  ragioneSociale: string;
  ficEntityId: number | null;
  motivo: ArchivioMotivo;
  note: string;
  draft: AnagraficaSyncDraft;
};

function sedeFromSnap(
  snap: Record<string, unknown>,
  prefix: "sede_amm" | "sede_mag"
) {
  return {
    nazione: String(snap[`${prefix}_nazione`] ?? "Italia"),
    provincia: String(snap[`${prefix}_provincia`] ?? ""),
    citta: String(snap[`${prefix}_citta`] ?? ""),
    cap: String(snap[`${prefix}_cap`] ?? ""),
    indirizzo: String(snap[`${prefix}_indirizzo`] ?? ""),
  };
}

export function draftFromArchivioSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
  fallback?: { ragioneSociale?: string; partitaIva?: string }
): AnagraficaSyncDraft {
  const snap = snapshot ?? {};
  return {
    ragioneSociale: String(
      snap.ragione_sociale ?? fallback?.ragioneSociale ?? ""
    ),
    partitaIva: String(snap.partita_iva ?? fallback?.partitaIva ?? ""),
    email: String(snap.email ?? ""),
    pec: String(snap.pec ?? ""),
    sdiCode: String(snap.sdi_code ?? ""),
    telefono: String(snap.telefono ?? ""),
    sitoWeb: String(snap.sito_web ?? ""),
    sedeAmministrativa: sedeFromSnap(snap, "sede_amm"),
    sedeMagazzino: Object.keys(snap).some((k) => k.startsWith("sede_mag_"))
      ? sedeFromSnap(snap, "sede_mag")
      : emptySede(),
  };
}

export function mapClienteArchivioRow(
  row: ClienteArchivioRow
): AnagraficaArchivioHit {
  return {
    id: row.id,
    kind: "cliente",
    partitaIva: row.partita_iva,
    ragioneSociale: row.ragione_sociale,
    ficEntityId: row.fic_entity_id,
    motivo: row.motivo,
    note: row.note,
    draft: draftFromArchivioSnapshot(row.snapshot as Record<string, unknown>, {
      ragioneSociale: row.ragione_sociale,
      partitaIva: row.partita_iva,
    }),
  };
}

export function mapFornitoreArchivioRow(
  row: FornitoreArchivioRow
): AnagraficaArchivioHit {
  return {
    id: row.id,
    kind: "fornitore",
    partitaIva: row.partita_iva,
    ragioneSociale: row.ragione_sociale,
    ficEntityId: row.fic_entity_id,
    motivo: row.motivo,
    note: row.note,
    draft: draftFromArchivioSnapshot(row.snapshot as Record<string, unknown>, {
      ragioneSociale: row.ragione_sociale,
      partitaIva: row.partita_iva,
    }),
  };
}

export function draftToArchivioSnapshot(
  draft: AnagraficaSyncDraft
): Record<string, unknown> {
  return {
    ragione_sociale: draft.ragioneSociale,
    partita_iva: draft.partitaIva,
    email: draft.email,
    pec: draft.pec,
    sdi_code: draft.sdiCode,
    telefono: draft.telefono,
    sito_web: draft.sitoWeb,
    sede_amm_nazione: draft.sedeAmministrativa.nazione,
    sede_amm_provincia: draft.sedeAmministrativa.provincia,
    sede_amm_citta: draft.sedeAmministrativa.citta,
    sede_amm_cap: draft.sedeAmministrativa.cap,
    sede_amm_indirizzo: draft.sedeAmministrativa.indirizzo,
    sede_mag_nazione: draft.sedeMagazzino.nazione,
    sede_mag_provincia: draft.sedeMagazzino.provincia,
    sede_mag_citta: draft.sedeMagazzino.citta,
    sede_mag_cap: draft.sedeMagazzino.cap,
    sede_mag_indirizzo: draft.sedeMagazzino.indirizzo,
  };
}

export function vatKeysEqual(a: string, b: string): boolean {
  return normalizeVatKey(a) === normalizeVatKey(b) && normalizeVatKey(a) !== "";
}
