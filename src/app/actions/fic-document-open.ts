"use server";

import type { FatturaKind } from "@/lib/amministrazione/fatture";
import { requireAreaAccess } from "@/lib/areas/guard";
import { fetchFicDocumentPdfUrl, getFicConfig } from "@/lib/fic";

function toFicKind(kind: FatturaKind): "issued" | "received" {
  return kind === "ricevuta" ? "received" : "issued";
}

export async function openFicInvoiceUrlAction(input: {
  kind: FatturaKind;
  ficId: number;
}): Promise<
  { success: true; url: string } | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  try {
    getFicConfig();
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error
          ? e.message
          : "Configurazione Fatture in Cloud mancante.",
    };
  }

  const ficId = Number(input.ficId);
  if (!Number.isFinite(ficId) || ficId <= 0) {
    return {
      success: false,
      error: "Questa fattura non è collegata a un documento Fatture in Cloud.",
    };
  }

  try {
    const url = await fetchFicDocumentPdfUrl({
      kind: toFicKind(input.kind),
      ficId,
    });
    return { success: true, url };
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error
          ? e.message
          : "Impossibile aprire la fattura su Fatture in Cloud.",
    };
  }
}
