"use server";

import { ficDocumentPath, toFicKind } from "@/lib/amministrazione/fic-document-xml";
import type { FatturaKind } from "@/lib/amministrazione/fatture";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  fetchFicDocumentOriginalUrl,
  getFicConfig,
  hasFicIssuedEInvoiceXml,
} from "@/lib/fic";

export type FicDocumentViewUrls =
  | {
      success: true;
      /** Cosa apre “Apri fattura” */
      fatturaUrl: string;
      /** XML SDI / trasmissione AdE — null = nascondi bottone Apri XML */
      xmlUrl: string | null;
      /** @deprecated alias compat */
      foglioUrl: string;
      /** @deprecated alias compat */
      originalUrl: string;
    }
  | { success: false; error: string };

/**
 * Ricevute:
 * - fatturaUrl = foglio Opuntia da XML SDI
 * - xmlUrl = file originale FiC (allegato)
 *
 * Emesse / note credito:
 * - fatturaUrl = PDF/documento su Fatture in Cloud
 * - xmlUrl = XML trasmissione SDI se presente, altrimenti null
 */
export async function getFicDocumentViewUrlsAction(input: {
  kind: FatturaKind;
  ficId: number;
}): Promise<FicDocumentViewUrls> {
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

  const ficKind = toFicKind(input.kind);

  if (ficKind === "received") {
    const foglioUrl = ficDocumentPath(input.kind, ficId, "foglio");
    try {
      const originalUrl = await fetchFicDocumentOriginalUrl({
        kind: "received",
        ficId,
      });
      return {
        success: true,
        fatturaUrl: foglioUrl,
        xmlUrl: originalUrl,
        foglioUrl,
        originalUrl,
      };
    } catch {
      return {
        success: true,
        fatturaUrl: foglioUrl,
        xmlUrl: ficDocumentPath(input.kind, ficId, "xml"),
        foglioUrl,
        originalUrl: ficDocumentPath(input.kind, ficId, "xml"),
      };
    }
  }

  // Emessa / nota di credito: PDF FiC + XML SDI solo se disponibile
  try {
    const fatturaUrl = await fetchFicDocumentOriginalUrl({
      kind: "issued",
      ficId,
    });
    const hasXml = await hasFicIssuedEInvoiceXml(ficId);
    const xmlUrl = hasXml
      ? ficDocumentPath(input.kind, ficId, "xml")
      : null;
    return {
      success: true,
      fatturaUrl,
      xmlUrl,
      foglioUrl: fatturaUrl,
      originalUrl: fatturaUrl,
    };
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error
          ? e.message
          : "Documento non disponibile su Fatture in Cloud.",
    };
  }
}
