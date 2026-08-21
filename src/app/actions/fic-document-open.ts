"use server";

import {
  ficDocumentPath,
  toFicKind,
} from "@/lib/amministrazione/fic-document-xml";
import type { FatturaKind } from "@/lib/amministrazione/fatture";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  fetchFicDocumentOriginalUrl,
  getFicConfig,
  hasFicIssuedEInvoiceXml,
} from "@/lib/fic";

function ensureFicConfig(): string | null {
  try {
    getFicConfig();
    return null;
  } catch (e) {
    return e instanceof Error
      ? e.message
      : "Configurazione Fatture in Cloud mancante.";
  }
}

function parseFicId(ficId: number): number | null {
  const n = Number(ficId);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Solo URL “Apri fattura” — nessuna chiamata se non serve (ricevute = path locale).
 */
export async function getFicFatturaOpenUrlAction(input: {
  kind: FatturaKind;
  ficId: number;
}): Promise<{ success: true; url: string } | { success: false; error: string }> {
  await requireAreaAccess("amministrazione");
  const cfgErr = ensureFicConfig();
  if (cfgErr) return { success: false, error: cfgErr };

  const ficId = parseFicId(input.ficId);
  if (ficId == null) {
    return {
      success: false,
      error: "Questa fattura non è collegata a un documento Fatture in Cloud.",
    };
  }

  const ficKind = toFicKind(input.kind);
  if (ficKind === "received") {
    return { success: true, url: ficDocumentPath(input.kind, ficId, "foglio") };
  }

  try {
    const url = await fetchFicDocumentOriginalUrl({
      kind: "issued",
      ficId,
    });
    return { success: true, url };
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

/**
 * Solo URL “Apri XML” — chiamata FiC solo al click.
 */
export async function getFicXmlOpenUrlAction(input: {
  kind: FatturaKind;
  ficId: number;
}): Promise<{ success: true; url: string } | { success: false; error: string }> {
  await requireAreaAccess("amministrazione");
  const cfgErr = ensureFicConfig();
  if (cfgErr) return { success: false, error: cfgErr };

  const ficId = parseFicId(input.ficId);
  if (ficId == null) {
    return {
      success: false,
      error: "Questa fattura non è collegata a un documento Fatture in Cloud.",
    };
  }

  const ficKind = toFicKind(input.kind);
  if (ficKind === "received") {
    try {
      const url = await fetchFicDocumentOriginalUrl({
        kind: "received",
        ficId,
      });
      return { success: true, url };
    } catch {
      return {
        success: true,
        url: ficDocumentPath(input.kind, ficId, "xml"),
      };
    }
  }

  try {
    const hasXml = await hasFicIssuedEInvoiceXml(ficId);
    if (!hasXml) {
      return {
        success: false,
        error: "XML di trasmissione SDI non disponibile per questo documento.",
      };
    }
    return {
      success: true,
      url: ficDocumentPath(input.kind, ficId, "xml"),
    };
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error
          ? e.message
          : "XML non disponibile su Fatture in Cloud.",
    };
  }
}

/** @deprecated preferire getFicFatturaOpenUrlAction / getFicXmlOpenUrlAction (lazy). */
export async function getFicDocumentViewUrlsAction(input: {
  kind: FatturaKind;
  ficId: number;
}): Promise<
  | {
      success: true;
      fatturaUrl: string;
      xmlUrl: string | null;
      foglioUrl: string;
      originalUrl: string;
    }
  | { success: false; error: string }
> {
  const fattura = await getFicFatturaOpenUrlAction(input);
  if (!fattura.success) return fattura;
  const xml = await getFicXmlOpenUrlAction(input);
  const xmlUrl = xml.success ? xml.url : null;
  return {
    success: true,
    fatturaUrl: fattura.url,
    xmlUrl,
    foglioUrl: fattura.url,
    originalUrl: xmlUrl ?? fattura.url,
  };
}
