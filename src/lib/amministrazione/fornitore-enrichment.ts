import {
  draftFromFicEntity,
  draftFromFornitore,
  normalizeVatKey,
  type AnagraficaSyncDraft,
} from "@/lib/amministrazione/fic-anagrafiche";
import type { Fornitore } from "@/lib/amministrazione/fornitori";
import type { FicEntityNormalized } from "@/lib/fic";

export type AnagraficaFonte =
  | "manuale"
  | "locale"
  | "archivio"
  | "fic_supplier"
  | "fic_client"
  | "fic_fattura";

export type FornitoreEnrichmentHit = {
  fonte: AnagraficaFonte;
  labelFonte: string;
  draft: AnagraficaSyncDraft;
  /** Se già in anagrafica attiva. */
  existingId: string | null;
  existingCodiceTarga: string | null;
  archivioId: string | null;
  ficEntityId: number | null;
  requiresVerification: boolean;
  message: string;
};

export function labelAnagraficaFonte(fonte: AnagraficaFonte): string {
  switch (fonte) {
    case "manuale":
      return "Inserimento manuale";
    case "locale":
      return "Anagrafica locale";
    case "archivio":
      return "Archivio gestionale";
    case "fic_supplier":
      return "Fatture in Cloud (fornitore)";
    case "fic_client":
      return "Fatture in Cloud (cliente)";
    case "fic_fattura":
      return "Fatture in Cloud (fattura ricevuta)";
    default:
      return fonte;
  }
}

export function enrichmentFromLocale(f: Fornitore): FornitoreEnrichmentHit {
  return {
    fonte: "locale",
    labelFonte: labelAnagraficaFonte("locale"),
    draft: draftFromFornitore(f),
    existingId: f.id,
    existingCodiceTarga: f.codiceTarga,
    archivioId: null,
    ficEntityId: null,
    requiresVerification: false,
    message: `P. IVA già presente: ${f.codiceTarga} — ${f.ragioneSociale}. Non creare un duplicato.`,
  };
}

export function enrichmentFromArchivio(input: {
  draft: AnagraficaSyncDraft;
  archivioId: string;
  ragioneSociale: string;
}): FornitoreEnrichmentHit {
  return {
    fonte: "archivio",
    labelFonte: labelAnagraficaFonte("archivio"),
    draft: input.draft,
    existingId: null,
    existingCodiceTarga: null,
    archivioId: input.archivioId,
    ficEntityId: null,
    requiresVerification: true,
    message: `Trovata in archivio (scartata/eliminata): ${input.ragioneSociale}. Dati riproposti — verifica e salva (ripesca).`,
  };
}

export function enrichmentFromFicEntity(
  entity: FicEntityNormalized
): FornitoreEnrichmentHit {
  const fonte: AnagraficaFonte =
    entity.kind === "supplier" ? "fic_supplier" : "fic_client";
  return {
    fonte,
    labelFonte: labelAnagraficaFonte(fonte),
    draft: draftFromFicEntity(entity),
    existingId: null,
    existingCodiceTarga: null,
    archivioId: null,
    ficEntityId: entity.ficId,
    requiresVerification: true,
    message: `Dati da ${labelAnagraficaFonte(fonte)}. Controlla sede, PEC e SDI; completa i contatti interni prima di confermare.`,
  };
}

export function enrichmentFromFicFattura(
  entity: FicEntityNormalized
): FornitoreEnrichmentHit {
  return {
    fonte: "fic_fattura",
    labelFonte: labelAnagraficaFonte("fic_fattura"),
    draft: draftFromFicEntity(entity),
    existingId: null,
    existingCodiceTarga: null,
    archivioId: null,
    ficEntityId: entity.ficId || null,
    requiresVerification: true,
    message:
      "Dati ricavati da una fattura ricevuta su Fatture in Cloud. Verifica e completa prima di salvare.",
  };
}

export function isValidVatOrTaxLookup(value: string): boolean {
  const key = normalizeVatKey(value);
  // P.IVA IT 11 cifre oppure CF 16 alfanumerici (tolleranza 8–16)
  if (/^\d{11}$/.test(key)) return true;
  if (/^[A-Z0-9]{8,16}$/.test(key)) return true;
  return false;
}
