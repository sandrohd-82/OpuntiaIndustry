"use server";

import { ficDocumentPath } from "@/lib/amministrazione/fic-document-xml";
import type { FatturaKind } from "@/lib/amministrazione/fatture";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getFicConfig } from "@/lib/fic";

/**
 * URL interni Opuntia per aprire foglio (da XML) o XML grezzo in nuova scheda.
 */
export async function getFicDocumentViewUrlsAction(input: {
  kind: FatturaKind;
  ficId: number;
}): Promise<
  | { success: true; foglioUrl: string; xmlUrl: string }
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

  return {
    success: true,
    foglioUrl: ficDocumentPath(input.kind, ficId, "foglio"),
    xmlUrl: ficDocumentPath(input.kind, ficId, "xml"),
  };
}
