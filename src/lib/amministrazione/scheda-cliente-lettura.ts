import { numeroFatturaVisibile } from "@/lib/amministrazione/numero-fattura";
import { fatturaEmessaPrenotataNonInviata } from "@/lib/amministrazione/fatture";
import { isFatturaProva } from "@/lib/amministrazione/prova-ordine";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { getAuthContext } from "@/lib/auth/session";
import {
  apriCronometroServer,
  includiTempiServer,
  tempiServerVisibili,
  type TempiServerScheda,
} from "@/lib/diagnostica/tempi-server-scheda";
import { resolveAnagraficaListVisibility } from "@/lib/auth/anagrafica-visibility";
import { loadCommercialeUserIds } from "@/lib/auth/commerciale-lineage";
import {
  ANAGRAFICA_DOCUMENTI_BUCKET,
  ANAGRAFICA_DOCUMENTO_STATI,
  ANAGRAFICA_DOCUMENTO_TIPI,
  ANAGRAFICA_DOCUMENTO_ORIGINI,
  type AnagraficaDocumento,
  type AnagraficaDocumentoOrigine,
  type AnagraficaDocumentoStato,
  type AnagraficaDocumentoTipo,
  type ClienteSchedaFatturaSlim,
  type ClienteSchedaOrdineSlim,
} from "@/lib/amministrazione/anagrafica-documenti";
import { labelStatoOrdine } from "@/lib/amministrazione/ordini";
import { createClient } from "@/lib/supabase/server";
import type { OrdineStato } from "@/types/database";
import { z } from "zod";

export const DOC_COLS =
  "id, cliente_id, tipo, titolo, note, storage_path, file_name, mime, file_size, versione, documento_stato, data_documento, data_scadenza, ricevuto_via, webmail_messaggio_id, collegamento_etichetta, collegamento_url, approved_by, approved_at, created_by, created_at";

export type DocRow = {
  id: string;
  cliente_id: string;
  tipo: string;
  titolo: string;
  note: string;
  storage_path: string;
  file_name: string;
  mime: string;
  file_size: number;
  versione: number;
  documento_stato: string;
  data_documento: string | null;
  data_scadenza: string | null;
  ricevuto_via: string;
  webmail_messaggio_id: string | null;
  collegamento_etichetta: string;
  collegamento_url: string;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
};

function asTipo(v: string): AnagraficaDocumentoTipo {
  return (ANAGRAFICA_DOCUMENTO_TIPI as readonly string[]).includes(v)
    ? (v as AnagraficaDocumentoTipo)
    : "altro";
}

function asStato(v: string): AnagraficaDocumentoStato {
  return (ANAGRAFICA_DOCUMENTO_STATI as readonly string[]).includes(v)
    ? (v as AnagraficaDocumentoStato)
    : "bozza";
}

function asOrigine(v: string): AnagraficaDocumentoOrigine {
  return (ANAGRAFICA_DOCUMENTO_ORIGINI as readonly string[]).includes(v)
    ? (v as AnagraficaDocumentoOrigine)
    : "non_specificato";
}

export function mapDoc(row: DocRow, url: string | null): AnagraficaDocumento {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    tipo: asTipo(row.tipo),
    titolo: row.titolo,
    note: row.note ?? "",
    storagePath: row.storage_path,
    fileName: row.file_name,
    mime: row.mime,
    fileSize: Number(row.file_size ?? 0),
    versione: Number(row.versione ?? 1),
    documentoStato: asStato(row.documento_stato),
    dataDocumento: row.data_documento ? String(row.data_documento).slice(0, 10) : null,
    dataScadenza: row.data_scadenza ? String(row.data_scadenza).slice(0, 10) : null,
    ricevutoVia: asOrigine(row.ricevuto_via),
    webmailMessaggioId: row.webmail_messaggio_id,
    collegamentoEtichetta: row.collegamento_etichetta ?? "",
    collegamentoUrl: row.collegamento_url ?? "",
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    url,
  };
}

export async function assertClienteVisibile(clienteId: string): Promise<
  | { ok: true; codiceTarga: string; ragioneSociale: string }
  | { ok: false; error: string }
> {
  await requireAnyAreaAccess(["amministrazione", "commerciale"]);
  if (!z.string().uuid().safeParse(clienteId).success) {
    return { ok: false, error: "Cliente non valido." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clienti")
    .select("id, codice_targa, ragione_sociale, created_by, commerciale_id")
    .eq("id", clienteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Cliente non trovato." };
  }
  const vis = await resolveAnagraficaListVisibility();
  if (vis.ownerIds) {
    const owners = [data.created_by, data.commerciale_id]
      .filter(Boolean)
      .map((id) => String(id));
    const inLineage = owners.some((id) => vis.ownerIds!.includes(id));
    const commercialIds = vis.includeAzienda
      ? await loadCommercialeUserIds()
      : new Set<string>();
    const isAzienda =
      vis.includeAzienda &&
      !owners.some((id) => commercialIds.has(id));
    if (!inLineage && !isAzienda) {
      return { ok: false, error: "Scheda non visibile." };
    }
  }
  return {
    ok: true,
    codiceTarga: String(data.codice_targa ?? ""),
    ragioneSociale: String(data.ragione_sociale ?? ""),
  };
}

export async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(ANAGRAFICA_DOCUMENTI_BUCKET)
    .createSignedUrls(unique, 60 * 60);
  (data ?? []).forEach((row, i) => {
    const path = unique[i];
    if (path && row?.signedUrl) map.set(path, row.signedUrl);
  });
  return map;
}

export async function leggiSchedaClienteCompleta(
  clienteId: string
): Promise<
  | {
      success: true;
      documenti: AnagraficaDocumento[];
      ordini: ClienteSchedaOrdineSlim[];
      fatture: ClienteSchedaFatturaSlim[];
      tempiServer?: TempiServerScheda;
    }
  | { success: false; error: string }
> {
  const orologio = apriCronometroServer();
  const inizioAccesso = performance.now();
  const gate = await assertClienteVisibile(clienteId);
  orologio.segna("accesso", inizioAccesso);
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
  const inizioQuery = performance.now();
  const [docsRes, ordRes, fatRes] = await Promise.all([
    supabase
      .from("anagrafica_documenti")
      .select(DOC_COLS)
      .eq("cliente_id", clienteId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("ordini")
      .select("id, numero_interno, data_ordine, stato, tipo, importo_euro")
      .eq("cliente_id", clienteId)
      .is("deleted_at", null)
      .order("data_ordine", { ascending: false })
      .limit(80),
    supabase
      .from("fatture_emesse")
      .select(
        "id, numero_interno, numero_fattura, data_emissione, totale, stato_pagamento, tipo_documento"
      )
      .eq("cliente_id", clienteId)
      .is("deleted_at", null)
      .order("data_emissione", { ascending: false })
      .limit(80),
  ]);
  orologio.segna(
    "query",
    inizioQuery,
    (docsRes.data?.length ?? 0) +
      (ordRes.data?.length ?? 0) +
      (fatRes.data?.length ?? 0)
  );
  if (docsRes.error) return { success: false, error: docsRes.error.message };
  if (ordRes.error) return { success: false, error: ordRes.error.message };
  if (fatRes.error) return { success: false, error: fatRes.error.message };

  const rows = (docsRes.data ?? []) as DocRow[];
  const inizioUrl = performance.now();
  const urls = await signedUrls(rows.map((r) => r.storage_path));
  orologio.segna(
    "url",
    inizioUrl,
    rows.filter((riga) => riga.storage_path).length
  );
  const auth = await getAuthContext();
  return {
    success: true,
    documenti: rows.map((r) => mapDoc(r, urls.get(r.storage_path) ?? null)),
    ordini: (ordRes.data ?? []).map((r) => ({
      id: String(r.id),
      numeroInterno: String(r.numero_interno ?? ""),
      dataOrdine: String(r.data_ordine ?? ""),
      stato: labelStatoOrdine(String(r.stato ?? "in_attesa") as OrdineStato),
      tipo: String(r.tipo ?? "vendita"),
      importoEuro: Number(r.importo_euro ?? 0),
    })),
    fatture: (fatRes.data ?? [])
      .filter((r) => !fatturaEmessaPrenotataNonInviata(r) && !isFatturaProva(r))
      .map((r) => ({
      id: String(r.id),
      numeroInterno: numeroFatturaVisibile({
        kind:
          String(r.tipo_documento ?? "") === "nota_credito"
            ? "nota_credito"
            : "emessa",
        numeroFattura: String(r.numero_fattura ?? ""),
        numeroInterno: String(r.numero_interno ?? ""),
      }),
      dataEmissione: String(r.data_emissione ?? ""),
      totale: Number(r.totale ?? 0),
      statoPagamento: String(r.stato_pagamento ?? ""),
      tipoDocumento: String(r.tipo_documento ?? "fattura"),
    })),
    ...includiTempiServer(tempiServerVisibili(auth), orologio.chiudi()),
  };
}
