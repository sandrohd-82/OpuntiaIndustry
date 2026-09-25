"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { resolveAnagraficaListVisibility } from "@/lib/auth/anagrafica-visibility";
import { loadCommercialeUserIds } from "@/lib/auth/commerciale-lineage";
import {
  ANAGRAFICA_DOCUMENTI_BUCKET,
  ANAGRAFICA_DOCUMENTI_MAX_BYTES,
  ANAGRAFICA_DOCUMENTO_STATI,
  ANAGRAFICA_DOCUMENTO_TIPI,
  anagraficaDocumentoMetaSchema,
  ANAGRAFICA_DOCUMENTO_ORIGINI,
  extFromMime,
  mimeFromFileName,
  optionalDateOrNull,
  type AnagraficaDocumento,
  type AnagraficaDocumentoOrigine,
  type AnagraficaDocumentoStato,
  type AnagraficaDocumentoTipo,
  type ClienteSchedaFatturaSlim,
  type ClienteSchedaOrdineSlim,
} from "@/lib/amministrazione/anagrafica-documenti";
import { collectAziendaEmailHints } from "@/app/actions/azienda-timeline";
import { labelStatoOrdine } from "@/lib/amministrazione/ordini";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { OrdineStato } from "@/types/database";
import { z } from "zod";

const DOC_COLS =
  "id, cliente_id, tipo, titolo, note, storage_path, file_name, mime, file_size, versione, documento_stato, data_documento, data_scadenza, ricevuto_via, webmail_messaggio_id, collegamento_etichetta, collegamento_url, approved_by, approved_at, created_by, created_at";

type DocRow = {
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

function mapDoc(row: DocRow, url: string | null): AnagraficaDocumento {
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

async function assertClienteVisibile(clienteId: string): Promise<
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

async function signedUrls(paths: string[]): Promise<Map<string, string>> {
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

export async function listAnagraficaDocumentiAction(
  clienteId: string
): Promise<
  | { success: true; items: AnagraficaDocumento[] }
  | { success: false; error: string }
> {
  const gate = await assertClienteVisibile(clienteId);
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("anagrafica_documenti")
    .select(DOC_COLS)
    .eq("cliente_id", clienteId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as DocRow[];
  const urls = await signedUrls(rows.map((r) => r.storage_path));
  return {
    success: true,
    items: rows.map((r) => mapDoc(r, urls.get(r.storage_path) ?? null)),
  };
}

export async function uploadAnagraficaDocumentoAction(
  formData: FormData
): Promise<
  | { success: true; item: AnagraficaDocumento }
  | { success: false; error: string }
> {
  const { auth } = await requireAnyAreaAccess([
    "amministrazione",
    "commerciale",
  ]);
  const parsed = anagraficaDocumentoMetaSchema.safeParse({
    clienteId: String(formData.get("clienteId") ?? ""),
    tipo: String(formData.get("tipo") ?? ""),
    titolo: String(formData.get("titolo") ?? ""),
    note: String(formData.get("note") ?? ""),
    dataDocumento: String(formData.get("dataDocumento") ?? ""),
    dataScadenza: String(formData.get("dataScadenza") ?? ""),
    ricevutoVia: String(formData.get("ricevutoVia") ?? "non_specificato"),
    webmailMessaggioId: String(formData.get("webmailMessaggioId") ?? ""),
    collegamentoEtichetta: String(formData.get("collegamentoEtichetta") ?? ""),
    collegamentoUrl: String(formData.get("collegamentoUrl") ?? ""),
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati documento non validi.",
    };
  }
  const gate = await assertClienteVisibile(parsed.data.clienteId);
  if (!gate.ok) return { success: false, error: gate.error };

  const ricevutoVia = parsed.data.ricevutoVia;
  const webmailId =
    ricevutoVia === "mail" && parsed.data.webmailMessaggioId
      ? parsed.data.webmailMessaggioId
      : "";
  if (webmailId) {
    const service = createServiceClient();
    const { data: mail } = await service
      .from("webmail_messaggi")
      .select("id")
      .eq("id", webmailId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!mail) {
      return {
        success: false,
        error:
          "Mail non trovata. Puoi lasciare solo l’oggetto o il riferimento testuale.",
      };
    }
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Seleziona un file." };
  }
  if (file.size > ANAGRAFICA_DOCUMENTI_MAX_BYTES) {
    return { success: false, error: "File troppo grande (max 20 MB)." };
  }
  const mime = mimeFromFileName(file.name, file.type);
  if (!mime) {
    return {
      success: false,
      error: "Formato ammesso: PDF, Word, JPG, PNG, WebP.",
    };
  }

  const id = crypto.randomUUID();
  const path = `${parsed.data.clienteId}/${id}/${crypto.randomUUID()}.${extFromMime(mime)}`;
  const supabase = await createClient();
  const { error: upErr } = await supabase.storage
    .from(ANAGRAFICA_DOCUMENTI_BUCKET)
    .upload(path, file, { contentType: mime, upsert: false });
  if (upErr) return { success: false, error: upErr.message };

  const { data, error } = await supabase
    .from("anagrafica_documenti")
    .insert({
      id,
      cliente_id: parsed.data.clienteId,
      tipo: parsed.data.tipo,
      titolo: parsed.data.titolo,
      note: parsed.data.note,
      data_documento: optionalDateOrNull(parsed.data.dataDocumento),
      data_scadenza: optionalDateOrNull(parsed.data.dataScadenza),
      ricevuto_via: ricevutoVia,
      webmail_messaggio_id: webmailId || null,
      collegamento_etichetta:
        ricevutoVia === "non_specificato"
          ? ""
          : parsed.data.collegamentoEtichetta,
      collegamento_url: ricevutoVia === "altro" ? parsed.data.collegamentoUrl : "",
      storage_path: path,
      file_name: file.name,
      mime,
      file_size: file.size,
      versione: 1,
      documento_stato: "bozza",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(DOC_COLS)
    .single();
  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? "Registrazione documento non riuscita.",
    };
  }
  await writeAuditLog({
    entity_type: "anagrafica_documenti",
    entity_id: id,
    action: "create",
    actor_id: auth.userId,
    summary: `Caricato ${parsed.data.tipo} «${parsed.data.titolo}» su ${gate.codiceTarga}`,
    payload: {
      cliente_id: parsed.data.clienteId,
      tipo: parsed.data.tipo,
      file_name: file.name,
      documento_stato: "bozza",
      data_documento: optionalDateOrNull(parsed.data.dataDocumento),
      data_scadenza: optionalDateOrNull(parsed.data.dataScadenza),
      ricevuto_via: ricevutoVia,
      webmail_messaggio_id: webmailId || null,
    },
  });
  const urls = await signedUrls([path]);
  return { success: true, item: mapDoc(data as DocRow, urls.get(path) ?? null) };
}

export type DocumentoClienteMailHint = {
  email: string;
  source: string;
};

export type DocumentoClienteMailHit = {
  id: string;
  subject: string;
  fromAddress: string;
  fromName: string;
  receivedAt: string | null;
  matchReason: string;
  casella: string;
  direction: "inbound" | "outbound";
};

function sanitizeMailToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[{}",()%_\\*]/g, "")
    .slice(0, 120);
}

function pushMailAddrParts(orParts: string[], addr: string) {
  const clean = sanitizeMailToken(addr);
  if (!clean) return;
  orParts.push(`from_address.ilike.%${clean}%`);
  orParts.push(`to_addresses.cs.{"${clean}"}`);
  orParts.push(`cc_addresses.cs.{"${clean}"}`);
}

export async function searchMailPerDocumentoClienteAction(
  clienteId: string,
  query: string
): Promise<
  | {
      success: true;
      items: DocumentoClienteMailHit[];
      searchable: boolean;
      hints: DocumentoClienteMailHint[];
      domains: string[];
    }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["amministrazione", "commerciale"]);
  const gate = await assertClienteVisibile(clienteId);
  if (!gate.ok) return { success: false, error: gate.error };

  const hints = await collectAziendaEmailHints("cliente", clienteId);
  const q = sanitizeMailToken(String(query ?? ""));
  const orParts: string[] = [];

  if (q) {
    pushMailAddrParts(orParts, q);
    orParts.push(`subject.ilike.%${q}%`);
  } else {
    for (const e of hints.emails.slice(0, 40)) {
      pushMailAddrParts(orParts, e.email);
    }
    for (const d of hints.domains.slice(0, 20)) {
      const dom = sanitizeMailToken(d);
      if (dom.includes(".")) orParts.push(`from_address.ilike.%@${dom}%`);
    }
  }
  orParts.push(`and(azienda_tipo.eq.cliente,azienda_id.eq.${clienteId})`);

  const service = createServiceClient();
  const { data, error } = await service
    .from("webmail_messaggi")
    .select(
      "id, subject, from_address, from_name, to_addresses, direction, received_at, sent_at, azienda_tipo, azienda_id, account_id"
    )
    .is("deleted_at", null)
    .neq("folder", "TRASH")
    .neq("folder", "JUNK")
    .or(orParts.join(","))
    .order("received_at", { ascending: false })
    .limit(60);
  if (error) return { success: false, error: error.message };

  const accountIds = [
    ...new Set(
      (data ?? [])
        .map((r) => String(r.account_id ?? ""))
        .filter(Boolean)
    ),
  ];
  const caselle = new Map<string, string>();
  if (accountIds.length > 0) {
    const { data: accounts } = await service
      .from("webmail_accounts")
      .select("id, label, email_address")
      .in("id", accountIds)
      .is("deleted_at", null);
    for (const a of accounts ?? []) {
      const label = String(a.label ?? "").trim();
      const email = String(a.email_address ?? "").trim();
      caselle.set(String(a.id), label && email ? `${label} · ${email}` : email || label);
    }
  }

  const emailSet = new Set(hints.emails.map((e) => e.email));
  const domainSet = new Set(hints.domains);
  const items: DocumentoClienteMailHit[] = (data ?? []).map((r) => {
    const from = String(r.from_address ?? "").trim().toLowerCase();
    const toList = Array.isArray(r.to_addresses)
      ? (r.to_addresses as string[]).map((x) => String(x).trim().toLowerCase())
      : [];
    const outbound = String(r.direction ?? "") === "outbound";
    const receivedAt =
      (outbound
        ? ((r.sent_at as string | null) ?? (r.received_at as string | null))
        : ((r.received_at as string | null) ?? (r.sent_at as string | null))) ??
      null;
    const fromDom = from.includes("@") ? from.slice(from.lastIndexOf("@") + 1) : "";
    let matchReason = "ricerca";
    if (q && (from.includes(q) || toList.some((t) => t.includes(q)))) {
      matchReason = outbound ? "destinatario cercato" : "indirizzo cercato";
    } else if (q && String(r.subject ?? "").toLowerCase().includes(q)) {
      matchReason = "oggetto";
    } else if (emailSet.has(from) || toList.some((t) => emailSet.has(t))) {
      matchReason = outbound ? "destinatario scheda" : "scheda / referente";
    } else if (fromDom && domainSet.has(fromDom)) {
      matchReason = `dominio @${fromDom}`;
    } else if (
      String(r.azienda_tipo ?? "") === "cliente" &&
      String(r.azienda_id ?? "") === clienteId
    ) {
      matchReason = "già collegata all’azienda";
    }
    return {
      id: String(r.id),
      subject: String(r.subject ?? "(senza oggetto)"),
      fromAddress: String(r.from_address ?? ""),
      fromName: String(r.from_name ?? ""),
      receivedAt,
      matchReason,
      casella: caselle.get(String(r.account_id ?? "")) ?? "Casella aziendale",
      direction: outbound ? "outbound" : "inbound",
    };
  });

  return {
    success: true,
    searchable: true,
    items,
    hints: hints.emails,
    domains: hints.domains,
  };
}

export async function approvaAnagraficaDocumentoAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAnyAreaAccess([
    "amministrazione",
    "commerciale",
  ]);
  if (!z.string().uuid().safeParse(id).success) {
    return { success: false, error: "Documento non valido." };
  }
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("anagrafica_documenti")
    .select("id, cliente_id, titolo, documento_stato")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!current) return { success: false, error: "Documento non trovato." };
  const gate = await assertClienteVisibile(String(current.cliente_id));
  if (!gate.ok) return { success: false, error: gate.error };
  if (String(current.documento_stato) === "chiuso") {
    return { success: false, error: "Documento già chiuso." };
  }
  const { error } = await supabase
    .from("anagrafica_documenti")
    .update({
      documento_stato: "approvato",
      approved_by: auth.userId,
      approved_at: new Date().toISOString(),
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "anagrafica_documenti",
    entity_id: id,
    action: "approve",
    actor_id: auth.userId,
    summary: `Approvato documento «${String(current.titolo)}» su ${gate.codiceTarga}`,
    payload: { documento_stato: "approvato" },
  });
  return { success: true };
}

export async function softDeleteAnagraficaDocumentoAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAnyAreaAccess([
    "amministrazione",
    "commerciale",
  ]);
  if (!z.string().uuid().safeParse(id).success) {
    return { success: false, error: "Documento non valido." };
  }
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("anagrafica_documenti")
    .select("id, cliente_id, titolo")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!current) return { success: false, error: "Documento non trovato." };
  const gate = await assertClienteVisibile(String(current.cliente_id));
  if (!gate.ok) return { success: false, error: gate.error };
  const { error } = await supabase
    .from("anagrafica_documenti")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      documento_stato: "chiuso",
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "anagrafica_documenti",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: `Archiviato documento «${String(current.titolo)}» su ${gate.codiceTarga}`,
    payload: { documento_stato: "chiuso" },
  });
  return { success: true };
}

export async function loadClienteSchedaCompletaAction(
  clienteId: string
): Promise<
  | {
      success: true;
      documenti: AnagraficaDocumento[];
      ordini: ClienteSchedaOrdineSlim[];
      fatture: ClienteSchedaFatturaSlim[];
    }
  | { success: false; error: string }
> {
  const gate = await assertClienteVisibile(clienteId);
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
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
        "id, numero_interno, data_emissione, totale, stato_pagamento, tipo_documento"
      )
      .eq("cliente_id", clienteId)
      .is("deleted_at", null)
      .order("data_emissione", { ascending: false })
      .limit(80),
  ]);
  if (docsRes.error) return { success: false, error: docsRes.error.message };
  if (ordRes.error) return { success: false, error: ordRes.error.message };
  if (fatRes.error) return { success: false, error: fatRes.error.message };

  const rows = (docsRes.data ?? []) as DocRow[];
  const urls = await signedUrls(rows.map((r) => r.storage_path));
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
    fatture: (fatRes.data ?? []).map((r) => ({
      id: String(r.id),
      numeroInterno: String(r.numero_interno ?? ""),
      dataEmissione: String(r.data_emissione ?? ""),
      totale: Number(r.totale ?? 0),
      statoPagamento: String(r.stato_pagamento ?? ""),
      tipoDocumento: String(r.tipo_documento ?? "fattura"),
    })),
  };
}
