"use server";

import { ficDocumentPath, toFicKind } from "@/lib/amministrazione/fic-document-xml";
import type { FatturaKind } from "@/lib/amministrazione/fatture";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  fetchFicDocumentOriginalUrl,
  getFicConfig,
} from "@/lib/fic";

/**
 * - foglioUrl: vista Opuntia (foglio da XML SDI)
 * - originalUrl: file originale su Fatture in Cloud (XML S3, PDF, ecc.)
 */
export async function getFicDocumentViewUrlsAction(input: {
  kind: FatturaKind;
  ficId: number;
}): Promise<
  | { success: true; foglioUrl: string; originalUrl: string; xmlUrl: string }
  | { success: false; error: string }
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
    const originalUrl = await fetchFicDocumentOriginalUrl({
      kind: toFicKind(input.kind),
      ficId,
    });
    const foglioUrl = ficDocumentPath(input.kind, ficId, "foglio");
    // xmlUrl = stesso file originale (compat); preferire originalUrl
    return {
      success: true,
      foglioUrl,
      originalUrl,
      xmlUrl: originalUrl,
    };
  } catch (e) {
    // Foglio interno può comunque funzionare se c'è XML in cache;
    // Apri file originale fallisce se FiC non ha allegato.
    const foglioUrl = ficDocumentPath(input.kind, ficId, "foglio");
    const xmlFallback = ficDocumentPath(input.kind, ficId, "xml");
    return {
      success: true,
      foglioUrl,
      originalUrl: xmlFallback,
      xmlUrl: xmlFallback,
    };
  }
}
