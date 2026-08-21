import type { FatturaKind } from "@/lib/amministrazione/fatture";
import { extractXmlFromRawSafe } from "@/lib/amministrazione/paper-invoice";
import {
  ficDocumentPath,
  parseFicKindParam,
  toFicKind,
} from "@/lib/amministrazione/fic-document-paths";
import {
  fetchFicDocumentXml,
  getFicConfig,
} from "@/lib/fic";
import { createClient } from "@/lib/supabase/server";

export { ficDocumentPath, parseFicKindParam, toFicKind };

async function loadCachedRaw(
  ficId: number,
  ficKind: "issued" | "received"
): Promise<Record<string, unknown> | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fic_invoices")
    .select("raw_data")
    .eq("fic_id", ficId)
    .eq("type", ficKind)
    .is("deleted_at", null)
    .maybeSingle();
  return (data?.raw_data ?? null) as Record<string, unknown> | null;
}

/** Recupera XML SDI (cache → API FiC / allegato S3). */
export async function resolveFicDocumentXml(input: {
  kind: FatturaKind;
  ficId: number;
}): Promise<{ xml: string; filename: string }> {
  getFicConfig();
  const ficId = Number(input.ficId);
  if (!Number.isFinite(ficId) || ficId <= 0) {
    throw new Error("ID documento Fatture in Cloud non valido.");
  }
  const ficKind = toFicKind(input.kind);

  const raw = await loadCachedRaw(ficId, ficKind);
  const fromCache = extractXmlFromRawSafe(raw);
  if (fromCache) {
    return { xml: fromCache, filename: `fattura-sdi-${ficId}.xml` };
  }

  return fetchFicDocumentXml({ kind: ficKind, ficId });
}
