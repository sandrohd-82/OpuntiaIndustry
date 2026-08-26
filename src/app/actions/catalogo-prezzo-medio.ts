"use server";

import { requireAreaAccess } from "@/lib/areas/guard";
import {
  loadCatalogoPrezzoStorico,
  recalcCatalogoPrezzoMedioForCodici,
} from "@/lib/amministrazione/catalogo-prezzo-medio";
import type { ProdottoCondizioneStorico } from "@/lib/amministrazione/fatture-storico";

export async function listCatalogoPrezzoStoricoAction(
  codice: string
): Promise<
  | { success: true; items: ProdottoCondizioneStorico[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  try {
    const items = await loadCatalogoPrezzoStorico(codice);
    return { success: true, items };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Errore storico prezzi.",
    };
  }
}

export async function recalcCatalogoPrezzoMedioAction(
  codici: string[]
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  try {
    await recalcCatalogoPrezzoMedioForCodici(codici, auth.userId);
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Errore ricalcolo medio.",
    };
  }
}
