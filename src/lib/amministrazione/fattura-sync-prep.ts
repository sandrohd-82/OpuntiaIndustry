import { importoRiga, type FatturaRiga } from "@/lib/amministrazione/fatture";
import {
  generateSkuProposal,
  type CatalogoAcquistoKind,
} from "@/lib/sku-generator";

/** @deprecated Ghost spedizione dismesso: le righe restano attive e solo evidenziate in UI. */
export type SyncGhostRiga = FatturaRiga & {
  ghostReason: "spedizione";
};

const SPEDIZIONE_RE =
  /\b(spedizion[ei]|spese?\s+di\s+spediz|costi?\s+(di\s+)?spediz|imballagg?[io]\s+(e\s+)?spediz|trasporto|porto\s+franco|spese?\s+trasporto|carriage|shipping|freight|packaging\s+(and\s+)?ship)\b/i;

export function isSpedizioneLikeDescrizione(descrizione: string): boolean {
  const d = (descrizione ?? "").trim();
  if (!d) return false;
  return SPEDIZIONE_RE.test(d);
}

export function rigaImportoAssoluto(r: {
  quantita: number;
  prezzoUnitario: number;
  scontoPercentuale?: number;
  importo?: number;
}): number {
  if (r.importo != null && Number.isFinite(r.importo)) {
    return Math.abs(Number(r.importo));
  }
  return Math.abs(
    importoRiga(
      Number(r.quantita) || 0,
      Math.abs(Number(r.prezzoUnitario) || 0),
      Number(r.scontoPercentuale) || 0
    )
  );
}

export function isZeroImportoRiga(r: {
  quantita: number;
  prezzoUnitario: number;
  scontoPercentuale?: number;
  importo?: number;
}): boolean {
  return rigaImportoAssoluto(r) < 0.005;
}

/**
 * Prep strutturale sync (Opzione A aggiornata):
 * - toglie solo righe a importo ~0
 * - NON sposta più le righe «spedizione-like» nel campo Spedizione
 *   (restano in elenco; UI le evidenzia in azzurro)
 */
export function prepareFatturaSyncStructural(input: {
  righe: FatturaRiga[];
  spedizioneExisting?: number;
}): {
  activeRighe: FatturaRiga[];
  ghostSpedizioneRighe: SyncGhostRiga[];
  spedizioneImporto: number;
  spedizioneIvaApplicata: boolean;
  removedZeroCount: number;
  possibileSpedizioneCount: number;
} {
  const active: FatturaRiga[] = [];
  let removedZeroCount = 0;
  let possibileSpedizioneCount = 0;

  for (const r of input.righe) {
    if (isZeroImportoRiga(r)) {
      removedZeroCount += 1;
      continue;
    }
    if (isSpedizioneLikeDescrizione(r.descrizione)) {
      possibileSpedizioneCount += 1;
    }
    active.push(r);
  }

  const existing = Math.max(0, Number(input.spedizioneExisting) || 0);
  const spedizioneImporto = Math.round(existing * 100) / 100;

  return {
    activeRighe: active,
    ghostSpedizioneRighe: [],
    spedizioneImporto,
    spedizioneIvaApplicata: spedizioneImporto > 0,
    removedZeroCount,
    possibileSpedizioneCount,
  };
}

export type NuovoArticoloSyncDraft = {
  /** Chiave riga (indice stringa). */
  rigaKey: string;
  descrizione: string;
  kind: CatalogoAcquistoKind;
  codice: string;
  nome: string;
};

export function buildNuovoArticoloDraft(input: {
  rigaKey: string;
  descrizione: string;
  suggestedCode?: string | null;
  suggestedKind?: CatalogoAcquistoKind | null;
}): NuovoArticoloSyncDraft {
  const kind =
    input.suggestedKind ??
    generateSkuProposal(input.descrizione || "articolo").kind;
  const sku = generateSkuProposal(input.descrizione || "articolo", kind);
  const codice =
    (input.suggestedCode ?? "").trim() &&
    /^(Sz|Pr|Mp|Ct)/i.test((input.suggestedCode ?? "").trim())
      ? (input.suggestedCode ?? "").trim()
      : sku.codice;
  return {
    rigaKey: input.rigaKey,
    descrizione: input.descrizione,
    kind,
    codice,
    nome: sku.nomeNormalizzato || input.descrizione.trim() || "Articolo",
  };
}
