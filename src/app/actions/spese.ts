"use server";

import { writeAuditLog } from "@/lib/audit";
import { extractPdfText } from "@/lib/amministrazione/bank-pdf-parse";
import { roundMoney } from "@/lib/amministrazione/fatture";
import { requireAreaAccess } from "@/lib/areas/guard";
import { leggiTestoSpesa, leggiXmlSpesa } from "@/lib/fiscale/spese-lettura";
import {
  SPESE_BUCKET,
  SPESE_MAX_BYTES,
  spesaRegistrazioneSchema,
  progettoSpesaSchema,
  type AnteprimaSpesa,
  type CategoriaSpesa,
  type PagamentoSpesa,
  type SpesaDocumentoView,
  type SpesaProgettoView,
  type StatoProgettoSpesa,
  type StatoSpesa,
  type TipoCaricamentoSpesa,
  type TipoProgettoSpesa,
} from "@/lib/fiscale/spese";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type DocRow = {
  id: string;
  tipo_caricamento: TipoCaricamentoSpesa;
  categoria: CategoriaSpesa;
  modalita_pagamento: PagamentoSpesa;
  esercente: string;
  partita_iva: string;
  data_documento: string;
  giustificazione: string;
  imponibile: number | string;
  aliquota_iva: number | string;
  imposta: number | string;
  totale: number | string;
  valuta: string;
  importo_valuta: number | string | null;
  cambio: number | string | null;
  nazione: string;
  flag_esterometro: boolean;
  tipo_autofattura: "" | "TD17" | "TD18";
  progetto_id: string | null;
  stato: StatoSpesa;
  versione: number;
  file_name: string;
  lettura_automatica: boolean;
  note: string;
  contabilizzato_at: string | null;
  storage_path?: string;
};

function num(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function campo(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function numero(form: FormData, key: string): number {
  const raw = campo(form, key).replace(/\s/g, "").replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : Number.NaN;
}

function numeroONull(form: FormData, key: string): number | null {
  if (!campo(form, key)) return null;
  const n = numero(form, key);
  return Number.isFinite(n) ? n : null;
}

function extDaNome(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  return m ? `.${m[1].toLowerCase()}` : "";
}

function mimeDi(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".xml")) return "application/xml";
  if (name.endsWith(".p7m")) return "application/pkcs7-mime";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return file.type || "application/octet-stream";
}

function tipoFile(file: File): "pdf" | "xml" | "immagine" | "altro" {
  const name = file.name.toLowerCase();
  const mime = mimeDi(file);
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    name.endsWith(".xml") ||
    name.endsWith(".p7m") ||
    mime.includes("xml") ||
    mime.includes("pkcs7")
  ) {
    return "xml";
  }
  if (mime.startsWith("image/")) return "immagine";
  return "altro";
}

async function fileDaForm(
  form: FormData
): Promise<{ ok: true; file: File } | { ok: false; error: string }> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Seleziona un file." };
  }
  if (file.size > SPESE_MAX_BYTES) {
    return { ok: false, error: "Il file supera 8 MB." };
  }
  if (tipoFile(file) === "altro") {
    return {
      ok: false,
      error: "Formato non ammesso. Usa foto, PDF, XML o XML.P7M.",
    };
  }
  return { ok: true, file };
}

function vista(row: DocRow, titoli: Map<string, string>): SpesaDocumentoView {
  return {
    id: row.id,
    tipoCaricamento: row.tipo_caricamento,
    categoria: row.categoria,
    modalitaPagamento: row.modalita_pagamento,
    esercente: row.esercente,
    partitaIva: row.partita_iva ?? "",
    dataDocumento: String(row.data_documento).slice(0, 10),
    giustificazione: row.giustificazione ?? "",
    imponibile: num(row.imponibile),
    aliquotaIva: num(row.aliquota_iva),
    imposta: num(row.imposta),
    totale: num(row.totale),
    valuta: row.valuta,
    importoValuta: row.importo_valuta == null ? null : num(row.importo_valuta),
    cambio: row.cambio == null ? null : num(row.cambio),
    nazione: row.nazione ?? "",
    flagEsterometro: Boolean(row.flag_esterometro),
    tipoAutofattura: row.tipo_autofattura ?? "",
    progettoId: row.progetto_id,
    progettoTitolo: row.progetto_id ? (titoli.get(row.progetto_id) ?? null) : null,
    stato: row.stato,
    versione: row.versione,
    fileName: row.file_name,
    letturaAutomatica: Boolean(row.lettura_automatica),
    note: row.note ?? "",
    contabilizzatoAt: row.contabilizzato_at,
  };
}

const DOC_SELECT =
  "id, tipo_caricamento, categoria, modalita_pagamento, esercente, partita_iva, data_documento, giustificazione, imponibile, aliquota_iva, imposta, totale, valuta, importo_valuta, cambio, nazione, flag_esterometro, tipo_autofattura, progetto_id, stato, versione, file_name, lettura_automatica, note, contabilizzato_at, storage_path";

export async function anteprimaSpesaAction(
  form: FormData
): Promise<{ success: true; anteprima: AnteprimaSpesa } | { success: false; error: string }> {
  await requireAreaAccess("area-fiscale");
  const letto = await fileDaForm(form);
  if (!letto.ok) return { success: false, error: letto.error };
  const kind = tipoFile(letto.file);
  if (kind === "immagine") {
    return {
      success: true,
      anteprima: {
        esercente: "",
        partitaIva: "",
        dataDocumento: "",
        imponibile: null,
        aliquotaIva: null,
        imposta: null,
        totale: null,
        nazione: "",
        valuta: "EUR",
        lettura: "manuale",
        avviso:
          "Sulla foto non c'è lettura automatica. Compila i campi, poi conferma.",
      },
    };
  }
  const buffer = Buffer.from(await letto.file.arrayBuffer());
  try {
    if (kind === "xml") {
      return { success: true, anteprima: leggiXmlSpesa(buffer) };
    }
    const text = await extractPdfText(buffer);
    return { success: true, anteprima: leggiTestoSpesa(text) };
  } catch (err) {
    console.error("[spese anteprima]", err);
    return {
      success: true,
      anteprima: {
        esercente: "",
        partitaIva: "",
        dataDocumento: "",
        imponibile: null,
        aliquotaIva: null,
        imposta: null,
        totale: null,
        nazione: "",
        valuta: "EUR",
        lettura: "manuale",
        avviso: "Non sono riuscito a leggere il file. Compila i campi a mano.",
      },
    };
  }
}

export async function registraSpesaAction(
  form: FormData
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const letto = await fileDaForm(form);
  if (!letto.ok) return { success: false, error: letto.error };
  const tipo = campo(form, "tipoCaricamento");
  const parsed = spesaRegistrazioneSchema.safeParse({
    tipoCaricamento: tipo,
    categoria: campo(form, "categoria"),
    modalitaPagamento: campo(form, "modalitaPagamento"),
    esercente: campo(form, "esercente"),
    partitaIva: campo(form, "partitaIva"),
    dataDocumento: campo(form, "dataDocumento"),
    giustificazione: campo(form, "giustificazione"),
    imponibile: numero(form, "imponibile"),
    aliquotaIva: numero(form, "aliquotaIva"),
    imposta: numero(form, "imposta"),
    totale: numero(form, "totale"),
    valuta: campo(form, "valuta") || "EUR",
    importoValuta: numeroONull(form, "importoValuta"),
    cambio: numeroONull(form, "cambio"),
    nazione: campo(form, "nazione"),
    flagEsterometro: campo(form, "flagEsterometro") === "true",
    tipoAutofattura: campo(form, "tipoAutofattura"),
    progettoId: campo(form, "progettoId") || null,
    note: campo(form, "note"),
    letturaAutomatica: campo(form, "letturaAutomatica") === "true",
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const input = parsed.data;
  if (tipo === "xml" && tipoFile(letto.file) !== "xml") {
    return { success: false, error: "Per la fattura elettronica carica un XML o un P7M." };
  }
  const supabase = await createClient();
  if (input.progettoId) {
    const { data: progetto } = await supabase
      .from("spese_progetti")
      .select("id, documento_stato")
      .eq("id", input.progettoId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!progetto) return { success: false, error: "Progetto non trovato." };
    if (progetto.documento_stato === "chiuso") {
      return { success: false, error: "Il progetto è chiuso." };
    }
  }

  const admin = createServiceClient();
  const ext = extDaNome(letto.file.name);
  const path = `${auth.userId}/${crypto.randomUUID()}${ext}`;
  const bytes = Buffer.from(await letto.file.arrayBuffer());
  const mime = mimeDi(letto.file);
  let upload = await admin.storage.from(SPESE_BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (upload.error) {
    upload = await admin.storage.from(SPESE_BUCKET).upload(path, bytes, {
      contentType: "application/octet-stream",
      upsert: false,
    });
  }
  if (upload.error) {
    return { success: false, error: `Caricamento file: ${upload.error.message}` };
  }

  const estero = input.tipoCaricamento === "fattura_estera";
  const { data, error } = await supabase
    .from("spese_documenti")
    .insert({
      tipo_caricamento: input.tipoCaricamento,
      categoria: input.categoria,
      modalita_pagamento: input.modalitaPagamento,
      esercente: input.esercente,
      partita_iva: input.partitaIva,
      data_documento: input.dataDocumento,
      giustificazione: input.giustificazione,
      imponibile: roundMoney(input.imponibile),
      aliquota_iva: roundMoney(input.aliquotaIva),
      imposta: roundMoney(input.imposta),
      totale: roundMoney(input.totale),
      valuta: estero ? input.valuta : "EUR",
      importo_valuta: estero ? input.importoValuta : null,
      cambio: estero ? input.cambio : null,
      nazione: estero ? input.nazione : input.nazione,
      flag_esterometro: estero ? input.flagEsterometro : false,
      tipo_autofattura: estero ? input.tipoAutofattura : "",
      progetto_id: input.progettoId,
      stato: "registrato",
      versione: 1,
      storage_path: path,
      file_name: letto.file.name || `spesa${ext}`,
      mime,
      lettura_automatica: input.letturaAutomatica,
      note: input.note,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    await admin.storage.from(SPESE_BUCKET).remove([path]);
    return { success: false, error: error?.message ?? "Registrazione non riuscita." };
  }

  await writeAuditLog({
    entity_type: "spese_documenti",
    entity_id: data.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Spesa registrata: ${input.esercente}`,
    payload: {
      tipo_caricamento: input.tipoCaricamento,
      categoria: input.categoria,
      totale: roundMoney(input.totale),
      progetto_id: input.progettoId,
      stato: "registrato",
    },
  });
  return { success: true, id: String(data.id) };
}

export async function listSpeseAction(raw: {
  stato?: StatoSpesa | "";
  categoria?: CategoriaSpesa | "";
  tipo?: TipoCaricamentoSpesa | "";
  soloLibere?: boolean;
  testo?: string;
}): Promise<
  | { success: true; spese: SpesaDocumentoView[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("area-fiscale");
  const supabase = await createClient();
  let q = supabase
    .from("spese_documenti")
    .select(DOC_SELECT)
    .is("deleted_at", null)
    .order("data_documento", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(400);
  if (raw.stato) q = q.eq("stato", raw.stato);
  if (raw.categoria) q = q.eq("categoria", raw.categoria);
  if (raw.tipo) q = q.eq("tipo_caricamento", raw.tipo);
  if (raw.soloLibere) q = q.is("progetto_id", null);
  const testo = raw.testo?.trim();
  if (testo) q = q.ilike("esercente", `%${testo.replace(/[%_]/g, "")}%`);
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as DocRow[];
  const ids = [...new Set(rows.map((r) => r.progetto_id).filter((id): id is string => Boolean(id)))];
  const titoli = new Map<string, string>();
  if (ids.length) {
    const { data: progetti } = await supabase
      .from("spese_progetti")
      .select("id, titolo")
      .in("id", ids);
    for (const p of progetti ?? []) titoli.set(String(p.id), String(p.titolo ?? ""));
  }
  return { success: true, spese: rows.map((r) => vista(r, titoli)) };
}

export async function listProgettiSpesaAction(): Promise<
  | { success: true; progetti: SpesaProgettoView[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("area-fiscale");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spese_progetti")
    .select("id, tipo, titolo, descrizione, data_inizio, data_fine, documento_stato, versione")
    .is("deleted_at", null)
    .order("data_inizio", { ascending: false });
  if (error) return { success: false, error: error.message };
  const progetti = data ?? [];
  const ids = progetti.map((p) => String(p.id));
  const somme = new Map<string, { n: number; totale: number }>();
  if (ids.length) {
    const { data: docs } = await supabase
      .from("spese_documenti")
      .select("progetto_id, totale, stato")
      .in("progetto_id", ids)
      .is("deleted_at", null)
      .neq("stato", "annullato");
    for (const d of docs ?? []) {
      const id = String(d.progetto_id ?? "");
      const cur = somme.get(id) ?? { n: 0, totale: 0 };
      cur.n += 1;
      cur.totale += num(d.totale as number | string);
      somme.set(id, cur);
    }
  }
  return {
    success: true,
    progetti: progetti.map((p) => {
      const id = String(p.id);
      const sum = somme.get(id);
      return {
        id,
        tipo: p.tipo as TipoProgettoSpesa,
        titolo: String(p.titolo ?? ""),
        descrizione: String(p.descrizione ?? ""),
        dataInizio: String(p.data_inizio).slice(0, 10),
        dataFine: p.data_fine ? String(p.data_fine).slice(0, 10) : null,
        documentoStato: p.documento_stato as StatoProgettoSpesa,
        versione: Number(p.versione) || 1,
        conteggioDocumenti: sum?.n ?? 0,
        totale: roundMoney(sum?.totale ?? 0),
      };
    }),
  };
}

export async function dettaglioProgettoSpesaAction(id: string): Promise<
  | {
      success: true;
      collegate: SpesaDocumentoView[];
      libere: SpesaDocumentoView[];
      totaliCategoria: { categoria: CategoriaSpesa; totale: number }[];
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("area-fiscale");
  if (!id) return { success: false, error: "Progetto mancante." };
  const supabase = await createClient();
  const { data: progetto } = await supabase
    .from("spese_progetti")
    .select("id, titolo")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!progetto) return { success: false, error: "Progetto non trovato." };
  const { data: collegateRows, error } = await supabase
    .from("spese_documenti")
    .select(DOC_SELECT)
    .eq("progetto_id", id)
    .is("deleted_at", null)
    .order("data_documento", { ascending: true });
  if (error) return { success: false, error: error.message };
  const { data: libereRows, error: libErr } = await supabase
    .from("spese_documenti")
    .select(DOC_SELECT)
    .is("progetto_id", null)
    .eq("stato", "registrato")
    .is("deleted_at", null)
    .order("data_documento", { ascending: false })
    .limit(200);
  if (libErr) return { success: false, error: libErr.message };
  const titoli = new Map<string, string>([[id, String(progetto.titolo ?? "")]]);
  const collegate = ((collegateRows ?? []) as DocRow[]).map((r) => vista(r, titoli));
  const acc = new Map<CategoriaSpesa, number>();
  for (const s of collegate) {
    if (s.stato === "annullato") continue;
    acc.set(s.categoria, (acc.get(s.categoria) ?? 0) + s.totale);
  }
  return {
    success: true,
    collegate,
    libere: ((libereRows ?? []) as DocRow[]).map((r) => vista(r, new Map())),
    totaliCategoria: [...acc.entries()].map(([categoria, totale]) => ({
      categoria,
      totale: roundMoney(totale),
    })),
  };
}

export async function creaProgettoSpesaAction(raw: {
  tipo: TipoProgettoSpesa;
  titolo: string;
  descrizione?: string;
  dataInizio: string;
  dataFine?: string | null;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const parsed = progettoSpesaSchema.safeParse({
    tipo: raw.tipo,
    titolo: raw.titolo,
    descrizione: raw.descrizione ?? "",
    dataInizio: raw.dataInizio,
    dataFine: raw.dataFine || null,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spese_progetti")
    .insert({
      tipo: parsed.data.tipo,
      titolo: parsed.data.titolo,
      descrizione: parsed.data.descrizione,
      data_inizio: parsed.data.dataInizio,
      data_fine: parsed.data.dataFine,
      documento_stato: "bozza",
      versione: 1,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { success: false, error: error?.message ?? "Creazione non riuscita." };
  await writeAuditLog({
    entity_type: "spese_progetti",
    entity_id: data.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Progetto spesa creato: ${parsed.data.titolo}`,
    payload: { tipo: parsed.data.tipo, documento_stato: "bozza" },
  });
  return { success: true, id: String(data.id) };
}

export async function approvaProgettoSpesaAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("spese_progetti")
    .select("id, titolo, documento_stato, versione")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) return { success: false, error: "Progetto non trovato." };
  if (row.documento_stato !== "bozza") {
    return { success: false, error: "Si approva solo un progetto in bozza." };
  }
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("spese_progetti")
    .update({
      documento_stato: "approvato",
      versione: Number(row.versione) + 1,
      approved_by: auth.userId,
      approved_at: nowIso,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "spese_progetti",
    entity_id: id,
    action: "status_change",
    actor_id: auth.userId,
    summary: `Progetto spesa approvato: ${row.titolo}`,
    payload: { da: "bozza", a: "approvato" },
  });
  return { success: true };
}

export async function collegaSpeseProgettoAction(input: {
  progettoId: string;
  spesaIds: string[];
  aggancia: boolean;
}): Promise<{ success: true; aggiornate: number } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const ids = [...new Set(input.spesaIds.filter(Boolean))];
  if (!input.progettoId || ids.length === 0) {
    return { success: false, error: "Seleziona almeno una spesa." };
  }
  const supabase = await createClient();
  const { data: progetto } = await supabase
    .from("spese_progetti")
    .select("id, titolo, documento_stato")
    .eq("id", input.progettoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!progetto) return { success: false, error: "Progetto non trovato." };
  if (progetto.documento_stato === "chiuso") {
    return { success: false, error: "Il progetto è chiuso." };
  }
  const { data: docs, error } = await supabase
    .from("spese_documenti")
    .select("id, stato, progetto_id, versione, esercente")
    .in("id", ids)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  const utili = (docs ?? []).filter((d) => d.stato === "registrato");
  if (utili.length === 0) {
    return { success: false, error: "Solo le spese registrate si possono agganciare o sganciare." };
  }
  let aggiornate = 0;
  for (const doc of utili) {
    const { error: upErr } = await supabase
      .from("spese_documenti")
      .update({
        progetto_id: input.aggancia ? input.progettoId : null,
        versione: Number(doc.versione) + 1,
        updated_by: auth.userId,
      })
      .eq("id", doc.id)
      .eq("stato", "registrato")
      .is("deleted_at", null);
    if (upErr) return { success: false, error: upErr.message };
    aggiornate += 1;
  }
  await writeAuditLog({
    entity_type: "spese_progetti",
    entity_id: input.progettoId,
    action: "update",
    actor_id: auth.userId,
    summary: input.aggancia
      ? `Spese agganciate a ${progetto.titolo}`
      : `Spese sganciate da ${progetto.titolo}`,
    payload: { spesa_ids: utili.map((d) => d.id), aggancia: input.aggancia },
  });
  return { success: true, aggiornate };
}

export async function contabilizzaSpesaAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("spese_documenti")
    .select("id, stato, progetto_id, versione, esercente, totale, modalita_pagamento")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) return { success: false, error: "Spesa non trovata." };
  if (row.progetto_id) {
    return {
      success: false,
      error: "Questa spesa è in un progetto. Invia in contabilità il pacchetto approvato.",
    };
  }
  if (row.stato !== "registrato") {
    return { success: false, error: "Si contabilizza solo una spesa registrata." };
  }
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("spese_documenti")
    .update({
      stato: "contabilizzato",
      versione: Number(row.versione) + 1,
      contabilizzato_at: nowIso,
      contabilizzato_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .eq("stato", "registrato")
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "spese_documenti",
    entity_id: id,
    action: "status_change",
    actor_id: auth.userId,
    summary: `Spesa contabilizzata: ${row.esercente}`,
    payload: {
      da: "registrato",
      a: "contabilizzato",
      modalita_pagamento: row.modalita_pagamento,
      totale: num(row.totale as number | string),
    },
  });
  return { success: true };
}

export async function contabilizzaProgettoSpesaAction(
  id: string
): Promise<{ success: true; documenti: number } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const supabase = await createClient();
  const { data: progetto } = await supabase
    .from("spese_progetti")
    .select("id, titolo, documento_stato, versione")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!progetto) return { success: false, error: "Progetto non trovato." };
  if (progetto.documento_stato !== "approvato") {
    return { success: false, error: "Approva il progetto prima di inviarlo in contabilità." };
  }
  const { data: docs, error } = await supabase
    .from("spese_documenti")
    .select("id, stato, versione")
    .eq("progetto_id", id)
    .eq("stato", "registrato")
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  const aperti = docs ?? [];
  if (aperti.length === 0) {
    return { success: false, error: "Non ci sono spese registrate da contabilizzare." };
  }
  const nowIso = new Date().toISOString();
  for (const doc of aperti) {
    const { error: upErr } = await supabase
      .from("spese_documenti")
      .update({
        stato: "contabilizzato",
        versione: Number(doc.versione) + 1,
        contabilizzato_at: nowIso,
        contabilizzato_by: auth.userId,
        updated_by: auth.userId,
      })
      .eq("id", doc.id)
      .eq("stato", "registrato");
    if (upErr) return { success: false, error: upErr.message };
  }
  const { error: prErr } = await supabase
    .from("spese_progetti")
    .update({
      documento_stato: "chiuso",
      versione: Number(progetto.versione) + 1,
      updated_by: auth.userId,
    })
    .eq("id", id);
  if (prErr) return { success: false, error: prErr.message };
  await writeAuditLog({
    entity_type: "spese_progetti",
    entity_id: id,
    action: "status_change",
    actor_id: auth.userId,
    summary: `Pacchetto contabilizzato: ${progetto.titolo}`,
    payload: {
      documenti: aperti.map((d) => d.id),
      da: "approvato",
      a: "chiuso",
    },
  });
  return { success: true, documenti: aperti.length };
}

export async function annullaSpesaAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("spese_documenti")
    .select("id, stato, versione, esercente")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) return { success: false, error: "Spesa non trovata." };
  if (row.stato === "contabilizzato") {
    return { success: false, error: "Una spesa contabilizzata non si annulla da qui." };
  }
  if (row.stato === "annullato") return { success: true };
  const { error } = await supabase
    .from("spese_documenti")
    .update({
      stato: "annullato",
      versione: Number(row.versione) + 1,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "spese_documenti",
    entity_id: id,
    action: "status_change",
    actor_id: auth.userId,
    summary: `Spesa annullata: ${row.esercente}`,
    payload: { da: row.stato, a: "annullato" },
  });
  return { success: true };
}

export async function urlAllegatoSpesaAction(
  id: string
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  await requireAreaAccess("area-fiscale");
  const supabase = await createClient();
  const { data } = await supabase
    .from("spese_documenti")
    .select("storage_path")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data?.storage_path) return { success: false, error: "File non trovato." };
  const admin = createServiceClient();
  const signed = await admin.storage.from(SPESE_BUCKET).createSignedUrl(String(data.storage_path), 120);
  if (signed.error || !signed.data?.signedUrl) {
    return { success: false, error: signed.error?.message ?? "Apertura file non riuscita." };
  }
  return { success: true, url: signed.data.signedUrl };
}
