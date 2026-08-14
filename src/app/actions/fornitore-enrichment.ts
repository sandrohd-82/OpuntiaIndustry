"use server";

import { findAnagraficaArchivioByVatAction } from "@/app/actions/anagrafiche-archivio";
import {
  enrichmentFromArchivio,
  enrichmentFromFicEntity,
  enrichmentFromFicFattura,
  enrichmentFromLocale,
  isValidVatOrTaxLookup,
  type FornitoreEnrichmentHit,
} from "@/lib/amministrazione/fornitore-enrichment";
import { normalizeVatKey } from "@/lib/amministrazione/fic-anagrafiche";
import { mapFornitoreRow } from "@/lib/amministrazione/fornitori";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  findFicEntityByVat,
  findFicEntityFromReceivedInvoices,
} from "@/lib/fic";
import { createClient } from "@/lib/supabase/server";
import type { FornitoreRow } from "@/types/database";

/**
 * Cascata lookup anagrafica fornitore (ISO):
 * 1) locale attivo → 2) archivio → 3) FiC supplier/client → 4) fatture ricevute FiC
 */
export async function lookupFornitoreEnrichmentAction(
  partitaIvaOrCf: string
): Promise<
  | { success: true; hit: FornitoreEnrichmentHit | null }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const raw = partitaIvaOrCf.trim();
  if (!raw) return { success: true, hit: null };
  if (!isValidVatOrTaxLookup(raw)) {
    return {
      success: false,
      error: "Inserisci una P. IVA (11 cifre) o un Codice Fiscale valido.",
    };
  }

  const vatKey = normalizeVatKey(raw);
  const supabase = await createClient();

  // 1) Locale (match su chiave normalizzata)
  const { data: locali, error: locErr } = await supabase
    .from("fornitori")
    .select("*")
    .is("deleted_at", null)
    .or(
      `partita_iva.eq.${raw.trim()},partita_iva.ilike.%${vatKey}%`
    )
    .limit(50);
  if (locErr) return { success: false, error: locErr.message };
  const localeHit = ((locali ?? []) as FornitoreRow[])
    .map(mapFornitoreRow)
    .find((f) => normalizeVatKey(f.partitaIva) === vatKey);
  if (localeHit) {
    return { success: true, hit: enrichmentFromLocale(localeHit) };
  }

  // 2) Archivio
  const arch = await findAnagraficaArchivioByVatAction("fornitore", raw);
  if (!arch.success) return { success: false, error: arch.error };
  if (arch.hit) {
    return {
      success: true,
      hit: enrichmentFromArchivio({
        draft: arch.hit.draft,
        archivioId: arch.hit.id,
        ragioneSociale: arch.hit.ragioneSociale,
      }),
    };
  }

  // 3) FiC entities
  try {
    const entity = await findFicEntityByVat(raw);
    if (entity) {
      return { success: true, hit: enrichmentFromFicEntity(entity) };
    }
  } catch (e) {
    // Non bloccare: prova fatture
    console.error("[lookupFornitoreEnrichment] FiC entity", e);
  }

  // 4) Fatture ricevute
  try {
    const fromInv = await findFicEntityFromReceivedInvoices(raw);
    if (fromInv) {
      return { success: true, hit: enrichmentFromFicFattura(fromInv) };
    }
  } catch (e) {
    console.error("[lookupFornitoreEnrichment] FiC fattura", e);
  }

  return { success: true, hit: null };
}
