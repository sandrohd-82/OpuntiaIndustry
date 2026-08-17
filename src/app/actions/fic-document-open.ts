"use server";

import type { FatturaKind } from "@/lib/amministrazione/fatture";
import { extractXmlFromRawSafe } from "@/lib/amministrazione/paper-invoice";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  fetchFicDocumentPdfUrl,
  fetchFicDocumentXml,
  getFicConfig,
} from "@/lib/fic";
import { createClient } from "@/lib/supabase/server";

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

export async function openFicInvoiceXmlAction(input: {
  kind: FatturaKind;
  ficId: number;
}): Promise<
  | { success: true; mode: "content"; xml: string; filename: string }
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

  const ficKind = toFicKind(input.kind);

  // Ricevute: prova prima la cache locale (raw_data sync)
  if (ficKind === "received") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("fic_invoices")
      .select("raw_data")
      .eq("fic_id", ficId)
      .eq("type", "received")
      .is("deleted_at", null)
      .maybeSingle();
    const raw = (data?.raw_data ?? null) as Record<string, unknown> | null;
    const fromCache = extractXmlFromRawSafe(raw);
    if (fromCache) {
      return {
        success: true,
        mode: "content",
        xml: fromCache,
        filename: `fattura-ricevuta-${ficId}.xml`,
      };
    }
  }

  try {
    const { xml, filename } = await fetchFicDocumentXml({
      kind: ficKind,
      ficId,
    });
    return { success: true, mode: "content", xml, filename };
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error
          ? e.message
          : "Impossibile aprire l'XML su Fatture in Cloud.",
    };
  }
}
