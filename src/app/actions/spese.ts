"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { extractPdfText } from "@/lib/amministrazione/bank-pdf-parse";
import { roundMoney } from "@/lib/amministrazione/fatture";
import { requireAreaAccess } from "@/lib/areas/guard";
import { leggiTestoSpesa, leggiXmlSpesa } from "@/lib/fiscale/spese-lettura";
import { leggiScontrinoGemini, qualificaScontrino } from "@/lib/fiscale/spese-ocr";
import {
  SPESE_BUCKET,
  SPESE_MAX_BYTES,
  calcolaRigheScontrino,
  spesaRegistrazioneSchema,
  errorePeriodoPartecipante,
  partecipanteSpesaSchema,
  periodiPartecipanteSovrapposti,
  progettoSpesaSchema,
  type AnteprimaSpesa,
  type CategoriaSpesa,
  type PagamentoSpesa,
  type FatturaCercataView,
  type FatturaProgettoView,
  type OrigineFatturaProgetto,
  type PartecipanteProgettoView,
  type SoggettoPartecipanteOption,
  type SpesaDocumentoView,
  type SpesaRigaView,
  type SpesaProgettoView,
  type StatoProgettoSpesa,
  type StatoSpesa,
  type TipoCaricamentoSpesa,
  type TipoProgettoSpesa,
  type TipoSoggettoPartecipante,
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
  prezzi_iva_compresa?: boolean | null;
  priva_iva?: boolean | null;
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
    privaIva: Boolean(row.priva_iva),
    note: row.note ?? "",
    contabilizzatoAt: row.contabilizzato_at,
    prezziIvaCompresa: Boolean(row.prezzi_iva_compresa),
    righe: [],
  };
}

async function attachRighe(
  supabase: Awaited<ReturnType<typeof createClient>>,
  spese: SpesaDocumentoView[]
): Promise<SpesaDocumentoView[]> {
  const ids = spese.map((spesa) => spesa.id);
  if (!ids.length) return spese;
  const { data } = await supabase
    .from("spese_documenti_righe")
    .select(
      "documento_id, descrizione, quantita, prezzo_unitario, imponibile, aliquota_iva, imposta, totale, sort_order"
    )
    .in("documento_id", ids)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  const map = new Map<string, SpesaRigaView[]>();
  for (const raw of data ?? []) {
    const row = raw as {
      documento_id: string;
      descrizione: string;
      quantita: number | string | null;
      prezzo_unitario: number | string | null;
      imponibile: number | string;
      aliquota_iva: number | string;
      imposta: number | string;
      totale: number | string;
    };
    const list = map.get(row.documento_id) ?? [];
    list.push({
      descrizione: row.descrizione,
      quantita: num(row.quantita ?? 1) || 1,
      prezzoUnitario: num(row.prezzo_unitario ?? row.imponibile),
      imponibile: num(row.imponibile),
      aliquotaIva: num(row.aliquota_iva),
      imposta: num(row.imposta),
      totale: num(row.totale),
    });
    map.set(row.documento_id, list);
  }
  return spese.map((spesa) => ({
    ...spesa,
    righe: map.get(spesa.id) ?? [],
  }));
}

const DOC_SELECT =
  "id, tipo_caricamento, categoria, modalita_pagamento, esercente, partita_iva, data_documento, giustificazione, imponibile, aliquota_iva, imposta, totale, valuta, importo_valuta, cambio, nazione, flag_esterometro, tipo_autofattura, progetto_id, stato, versione, file_name, lettura_automatica, prezzi_iva_compresa, priva_iva, note, contabilizzato_at, storage_path";

export async function anteprimaSpesaAction(
  form: FormData
): Promise<{ success: true; anteprima: AnteprimaSpesa } | { success: false; error: string }> {
  await requireAreaAccess("area-fiscale");
  const letto = await fileDaForm(form);
  if (!letto.ok) return { success: false, error: letto.error };
  const kind = tipoFile(letto.file);
  const tipoRaw = campo(form, "tipoCaricamento");
  const tipo =
    tipoRaw === "xml" || tipoRaw === "fattura_estera" ? tipoRaw : "scontrino";
  const buffer = Buffer.from(await letto.file.arrayBuffer());
  try {
    if (kind === "xml") {
      return { success: true, anteprima: qualificaScontrino(leggiXmlSpesa(buffer), "xml") };
    }
    if (kind === "immagine") {
      const anteprima = await leggiScontrinoGemini({
        bytes: buffer,
        mime: mimeDi(letto.file),
        tipo,
      });
      return { success: true, anteprima };
    }
    const text = await extractPdfText(buffer);
    if (text.replace(/\s/g, "").length < 20) {
      const anteprima = await leggiScontrinoGemini({
        bytes: buffer,
        mime: "application/pdf",
        tipo,
      });
      return { success: true, anteprima };
    }
    return {
      success: true,
      anteprima: qualificaScontrino(leggiTestoSpesa(text), tipo),
    };
  } catch (err) {
    console.error("[spese anteprima]", err);
    return {
      success: true,
      anteprima: qualificaScontrino(
        {
          esercente: "",
          partitaIva: "",
          partitaIvaAcquirente: "",
          dataDocumento: "",
          imponibile: null,
          aliquotaIva: null,
          imposta: null,
          totale: null,
          nazione: "",
          valuta: "EUR",
          righe: [],
          lettura: "manuale",
          letturaJson: null,
          uscitaImporto: null,
          ivaDetraibile: false,
          valenzaFiscale: "commerciale",
          avviso: "Non sono riuscito a leggere il file. Compila i campi a mano.",
        },
        tipo
      ),
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
  let imponibile = numero(form, "imponibile");
  let aliquotaIva = numero(form, "aliquotaIva");
  let imposta = numero(form, "imposta");
  let totale = numero(form, "totale");
  let righe: unknown = [];
  if (tipo === "scontrino") {
    const rawRighe = campo(form, "righe");
    let parsedRighe: unknown;
    try {
      parsedRighe = rawRighe ? JSON.parse(rawRighe) : [];
    } catch {
      return { success: false, error: "Righe dello scontrino non valide." };
    }
    if (!Array.isArray(parsedRighe) || parsedRighe.length === 0) {
      return {
        success: false,
        error: "Aggiungi almeno una riga con descrizione, prezzo, numero e IVA.",
      };
    }
    const privaIva = campo(form, "privaIva") === "true";
    const bozza = parsedRighe.map((riga) => {
      const row = riga as {
        descrizione?: unknown;
        quantita?: unknown;
        prezzoUnitario?: unknown;
        imponibile?: unknown;
        aliquotaIva?: unknown;
      };
      const quantita = Number(row.quantita ?? 1);
      const prezzoUnitario = Number(
        row.prezzoUnitario ?? row.imponibile ?? 0
      );
      const aliquota = Number(row.aliquotaIva);
      return {
        descrizione: String(row.descrizione ?? ""),
        quantita: Number.isFinite(quantita) && quantita > 0 ? quantita : 1,
        prezzoUnitario: Number.isFinite(prezzoUnitario) ? prezzoUnitario : 0,
        aliquotaIva: privaIva ? 0 : aliquota,
      };
    });
    const prezziIvaCompresa =
      privaIva ? false : campo(form, "prezziIvaCompresa") === "true";
    const calc = calcolaRigheScontrino(bozza, prezziIvaCompresa);
    imponibile = calc.imponibile;
    aliquotaIva = calc.aliquotaIva;
    imposta = calc.imposta;
    totale = calc.totale;
    righe = calc.righe;
  }
  const parsed = spesaRegistrazioneSchema.safeParse({
    tipoCaricamento: tipo,
    categoria: campo(form, "categoria"),
    modalitaPagamento: campo(form, "modalitaPagamento"),
    esercente: campo(form, "esercente"),
    partitaIva: campo(form, "partitaIva"),
    dataDocumento: campo(form, "dataDocumento"),
    giustificazione: campo(form, "giustificazione"),
    imponibile,
    aliquotaIva,
    imposta,
    totale,
    valuta: campo(form, "valuta") || "EUR",
    importoValuta: numeroONull(form, "importoValuta"),
    cambio: numeroONull(form, "cambio"),
    nazione: campo(form, "nazione"),
    flagEsterometro: campo(form, "flagEsterometro") === "true",
    tipoAutofattura: campo(form, "tipoAutofattura"),
    progettoId: campo(form, "progettoId") || null,
    note: campo(form, "note"),
    letturaAutomatica: campo(form, "letturaAutomatica") === "true",
    prezziIvaCompresa:
      tipo === "scontrino" && campo(form, "privaIva") === "true"
        ? false
        : campo(form, "prezziIvaCompresa") === "true",
    privaIva: tipo === "scontrino" && campo(form, "privaIva") === "true",
    righe,
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
  let letturaJson: Record<string, unknown> | null = null;
  const rawJson = campo(form, "letturaJson");
  if (rawJson) {
    try {
      const parsedJson = JSON.parse(rawJson) as unknown;
      if (parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson)) {
        letturaJson = parsedJson as Record<string, unknown>;
      }
    } catch {
      letturaJson = null;
    }
  }
  const pivaAcquirente = String(letturaJson?.partitaIvaAcquirente ?? "").replace(/\D/g, "");
  const ivaDetraibile = input.tipoCaricamento === "xml";
  const valenzaFiscale = ivaDetraibile
    ? "fattura"
    : pivaAcquirente === "03031180841"
      ? "fiscale"
      : "commerciale";
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
      prezzi_iva_compresa: input.prezziIvaCompresa,
      priva_iva: input.privaIva,
      lettura_json: letturaJson,
      uscita_importo: roundMoney(input.totale),
      iva_detraibile: ivaDetraibile,
      valenza_fiscale: valenzaFiscale,
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

  if (input.tipoCaricamento === "scontrino") {
    const calc = calcolaRigheScontrino(input.righe, input.prezziIvaCompresa);
    const { error: righeErr } = await supabase.from("spese_documenti_righe").insert(
      calc.righe.map((riga, index) => ({
        documento_id: data.id,
        sort_order: index,
        descrizione: riga.descrizione,
        quantita: riga.quantita,
        prezzo_unitario: riga.prezzoUnitario,
        imponibile: riga.imponibile,
        aliquota_iva: riga.aliquotaIva,
        imposta: riga.imposta,
        totale: riga.totale,
        created_by: auth.userId,
        updated_by: auth.userId,
      }))
    );
    if (righeErr) {
      const now = new Date().toISOString();
      await supabase
        .from("spese_documenti")
        .update({
          deleted_at: now,
          deleted_by: auth.userId,
          updated_by: auth.userId,
        })
        .eq("id", data.id);
      await admin.storage.from(SPESE_BUCKET).remove([path]);
      return { success: false, error: righeErr.message };
    }
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
      uscita_importo: roundMoney(input.totale),
      iva_detraibile: ivaDetraibile,
      valenza_fiscale: valenzaFiscale,
      progetto_id: input.progettoId,
      stato: "registrato",
      righe: input.tipoCaricamento === "scontrino" ? input.righe.length : 0,
      prezzi_iva_compresa: input.prezziIvaCompresa,
      priva_iva: input.privaIva,
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
  return {
    success: true,
    spese: await attachRighe(
      supabase,
      rows.map((r) => vista(r, titoli))
    ),
  };
}

export type RicevutaRecenteSpesa = {
  id: string;
  salvataIl: string;
  dataDocumento: string;
  esercente: string;
  giustificazione: string;
  tipoCaricamento: TipoCaricamentoSpesa;
  totale: number;
  valuta: string;
  stato: StatoSpesa;
  privaIva: boolean;
};

/** Ricevute registrate negli ultimi 30 giorni, le più recenti per prime. */
export async function listRicevuteRecentiSpesaAction(): Promise<
  | { success: true; ricevute: RicevutaRecenteSpesa[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("area-fiscale");
  const supabase = await createClient();
  const dal = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("spese_documenti")
    .select(
      "id, created_at, data_documento, esercente, giustificazione, tipo_caricamento, totale, valuta, stato, priva_iva"
    )
    .is("deleted_at", null)
    .gte("created_at", dal)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { success: false, error: error.message };
  const ricevute: RicevutaRecenteSpesa[] = (data ?? []).map((row) => ({
    id: String(row.id),
    salvataIl: String(row.created_at ?? ""),
    dataDocumento: String(row.data_documento ?? "").slice(0, 10),
    esercente: String(row.esercente ?? ""),
    giustificazione: String(row.giustificazione ?? ""),
    tipoCaricamento: row.tipo_caricamento as TipoCaricamentoSpesa,
    totale: num(row.totale),
    valuta: String(row.valuta ?? "EUR"),
    stato: row.stato as StatoSpesa,
    privaIva: Boolean(row.priva_iva),
  }));
  return { success: true, ricevute };
}

export type CausaleSpesaUsata = {
  testo: string;
  usi: number;
};

/** Causali già scritte sugli scontrini ancora in archivio, le più usate per prime. */
export async function listCausaliSpesaAction(): Promise<
  | { success: true; causali: CausaleSpesaUsata[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("area-fiscale");
  const supabase = await createClient();
  const esatte = new Map<string, number>();
  const pagina = 1000;
  for (let da = 0; da < 8000; da += pagina) {
    const { data, error } = await supabase
      .from("spese_documenti")
      .select("giustificazione")
      .eq("tipo_caricamento", "scontrino")
      .is("deleted_at", null)
      .neq("giustificazione", "")
      .range(da, da + pagina - 1);
    if (error) return { success: false, error: error.message };
    const righe = data ?? [];
    for (const row of righe) {
      const testo = String(row.giustificazione ?? "").trim().replace(/\s+/g, " ");
      if (!testo) continue;
      esatte.set(testo, (esatte.get(testo) ?? 0) + 1);
    }
    if (righe.length < pagina) break;
  }
  const gruppi = new Map<string, CausaleSpesaUsata & { usiGrafia: number }>();
  for (const [testo, usi] of esatte) {
    const chiave = testo.toLocaleLowerCase("it-IT");
    const attuale = gruppi.get(chiave);
    if (!attuale) {
      gruppi.set(chiave, { testo, usi, usiGrafia: usi });
      continue;
    }
    attuale.usi += usi;
    if (usi > attuale.usiGrafia) {
      attuale.testo = testo;
      attuale.usiGrafia = usi;
    }
  }
  const causali = [...gruppi.values()]
    .map(({ testo, usi }) => ({ testo, usi }))
    .sort((a, b) => b.usi - a.usi || a.testo.localeCompare(b.testo, "it"));
  return { success: true, causali };
}

export type SuggerimentoEsercenteSpesa = {
  nome: string;
  usi: number;
  partitaIva: string;
  giustificazioni: { testo: string; usi: number }[];
};

/** Nomi già scritti sui documenti di quest'area, i più usati per primi. Non legge l'anagrafica fornitori. */
export async function suggerisciEsercentiSpesaAction(): Promise<
  | { success: true; voci: SuggerimentoEsercenteSpesa[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("area-fiscale");
  const supabase = await createClient();
  const conteggi = new Map<
    string,
    {
      nome: string;
      usi: number;
      iva: Map<string, number>;
      causali: Map<string, number>;
    }
  >();
  const pagina = 1000;
  for (let da = 0; da < 8000; da += pagina) {
    const { data, error } = await supabase
      .from("spese_documenti")
      .select("esercente, partita_iva, giustificazione")
      .is("deleted_at", null)
      .neq("esercente", "")
      .range(da, da + pagina - 1);
    if (error) return { success: false, error: error.message };
    const righe = data ?? [];
    for (const row of righe) {
      const nome = String(row.esercente ?? "").trim();
      if (!nome) continue;
      const attuale = conteggi.get(nome) ?? {
        nome,
        usi: 0,
        iva: new Map<string, number>(),
        causali: new Map<string, number>(),
      };
      attuale.usi += 1;
      const piva = String(row.partita_iva ?? "").trim();
      if (piva) attuale.iva.set(piva, (attuale.iva.get(piva) ?? 0) + 1);
      const causale = String(row.giustificazione ?? "").trim();
      if (causale) attuale.causali.set(causale, (attuale.causali.get(causale) ?? 0) + 1);
      conteggi.set(nome, attuale);
    }
    if (righe.length < pagina) break;
  }
  const voci = [...conteggi.values()]
    .map((voce) => {
      let partitaIva = "";
      let usiIva = 0;
      for (const [piva, n] of voce.iva) {
        if (n > usiIva) {
          partitaIva = piva;
          usiIva = n;
        }
      }
      const giustificazioni = [...voce.causali.entries()]
        .map(([testo, usi]) => ({ testo, usi }))
        .sort((a, b) => b.usi - a.usi || a.testo.localeCompare(b.testo, "it"));
      return { nome: voce.nome, usi: voce.usi, partitaIva, giustificazioni };
    })
    .sort((a, b) => b.usi - a.usi || a.nome.localeCompare(b.nome, "it"));
  return { success: true, voci };
}

type SpesaDb = Awaited<ReturnType<typeof createClient>>;

type PartecipanteRow = {
  id: string;
  soggetto_tipo: TipoSoggettoPartecipante;
  organigramma_persona_id: string | null;
  rubrica_contatto_id: string | null;
  cliente_id: string | null;
  cliente_possibile_id: string | null;
  etichetta: string;
  data_inizio: string;
  data_fine: string | null;
};

function idSoggettoRiga(
  row: Pick<
    PartecipanteRow,
    | "soggetto_tipo"
    | "organigramma_persona_id"
    | "rubrica_contatto_id"
    | "cliente_id"
    | "cliente_possibile_id"
  >
): string {
  if (row.soggetto_tipo === "operatore") return String(row.organigramma_persona_id ?? "");
  if (row.soggetto_tipo === "referente") return String(row.rubrica_contatto_id ?? "");
  if (row.soggetto_tipo === "cliente") return String(row.cliente_id ?? "");
  return String(row.cliente_possibile_id ?? "");
}

function colonneSoggetto(tipo: TipoSoggettoPartecipante, id: string) {
  return {
    organigramma_persona_id: tipo === "operatore" ? id : null,
    rubrica_contatto_id: tipo === "referente" ? id : null,
    cliente_id: tipo === "cliente" ? id : null,
    cliente_possibile_id: tipo === "cliente_possibile" ? id : null,
  };
}

async function etichettaSoggetto(
  tipo: TipoSoggettoPartecipante,
  id: string
): Promise<{ etichetta: string } | { error: string }> {
  const service = createServiceClient();
  if (tipo === "operatore") {
    const { data, error } = await service
      .from("organigramma_persone")
      .select("nome, cognome, in_forza")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data || data.in_forza === false) return { error: "Operatore non disponibile." };
    const etichetta = `${data.nome ?? ""} ${data.cognome ?? ""}`.trim();
    return { etichetta: etichetta.slice(0, 200) || "Operatore" };
  }
  if (tipo === "referente") {
    const { data, error } = await service
      .from("rubrica_contatti")
      .select("nome, cognome, rapporto")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data || data.rapporto !== "referente") return { error: "Referente non disponibile." };
    const etichetta = `${data.nome ?? ""} ${data.cognome ?? ""}`.trim();
    return { etichetta: etichetta.slice(0, 200) || "Referente" };
  }
  if (tipo === "cliente") {
    const { data, error } = await service
      .from("clienti")
      .select("ragione_sociale")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: "Cliente non disponibile." };
    return { etichetta: String(data.ragione_sociale).trim().slice(0, 200) };
  }
  const { data, error } = await service
    .from("clienti_possibili")
    .select("ragione_sociale, stato")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data || data.stato === "scartato" || data.stato === "convertito") {
    return { error: "Possibile cliente non disponibile." };
  }
  return { etichetta: String(data.ragione_sociale).trim().slice(0, 200) };
}

async function leggiPartecipanti(
  supabase: SpesaDb,
  progettoId: string
): Promise<PartecipanteProgettoView[]> {
  const { data, error } = await supabase
    .from("spese_progetti_partecipanti")
    .select(
      "id, soggetto_tipo, organigramma_persona_id, rubrica_contatto_id, cliente_id, cliente_possibile_id, etichetta, data_inizio, data_fine"
    )
    .eq("progetto_id", progettoId)
    .is("deleted_at", null)
    .order("data_inizio", { ascending: true });
  if (error || !data) return [];
  const rows = data as PartecipanteRow[];
  const service = createServiceClient();
  const vive = new Map<string, string>();
  const perTipo = (tipo: TipoSoggettoPartecipante) =>
    rows.filter((row) => row.soggetto_tipo === tipo).map((row) => idSoggettoRiga(row)).filter(Boolean);
  const [operatori, referenti, clienti, possibili] = await Promise.all([
    perTipo("operatore").length
      ? service
          .from("organigramma_persone")
          .select("id, nome, cognome")
          .in("id", perTipo("operatore"))
      : Promise.resolve({ data: [] as { id: string; nome: string; cognome: string }[] }),
    perTipo("referente").length
      ? service.from("rubrica_contatti").select("id, nome, cognome").in("id", perTipo("referente"))
      : Promise.resolve({ data: [] as { id: string; nome: string; cognome: string }[] }),
    perTipo("cliente").length
      ? service.from("clienti").select("id, ragione_sociale").in("id", perTipo("cliente"))
      : Promise.resolve({ data: [] as { id: string; ragione_sociale: string }[] }),
    perTipo("cliente_possibile").length
      ? service
          .from("clienti_possibili")
          .select("id, ragione_sociale")
          .in("id", perTipo("cliente_possibile"))
      : Promise.resolve({ data: [] as { id: string; ragione_sociale: string }[] }),
  ]);
  for (const row of operatori.data ?? []) {
    vive.set(`operatore:${row.id}`, `${row.nome ?? ""} ${row.cognome ?? ""}`.trim());
  }
  for (const row of referenti.data ?? []) {
    vive.set(`referente:${row.id}`, `${row.nome ?? ""} ${row.cognome ?? ""}`.trim());
  }
  for (const row of clienti.data ?? []) {
    vive.set(`cliente:${row.id}`, String(row.ragione_sociale ?? "").trim());
  }
  for (const row of possibili.data ?? []) {
    vive.set(`cliente_possibile:${row.id}`, String(row.ragione_sociale ?? "").trim());
  }
  return rows.map((row) => {
    const soggettoId = idSoggettoRiga(row);
    const viva = vive.get(`${row.soggetto_tipo}:${soggettoId}`);
    return {
      id: String(row.id),
      soggettoTipo: row.soggetto_tipo,
      soggettoId,
      etichetta: viva || String(row.etichetta),
      dataInizio: String(row.data_inizio).slice(0, 10),
      dataFine: row.data_fine ? String(row.data_fine).slice(0, 10) : null,
    };
  });
}

async function inserisciPartecipante(
  supabase: SpesaDb,
  userId: string,
  progetto: {
    id: string;
    data_inizio: string;
    data_fine: string | null;
    documento_stato: string;
  },
  raw: {
    soggettoTipo: TipoSoggettoPartecipante;
    soggettoId: string;
    dataInizio: string;
    dataFine: string | null;
  }
): Promise<{ success: true; id: string; etichetta: string } | { success: false; error: string }> {
  if (progetto.documento_stato !== "bozza") {
    return {
      success: false,
      error: "I partecipanti si modificano solo finché il progetto è in bozza.",
    };
  }
  const parsed = partecipanteSpesaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Partecipante non valido.",
    };
  }
  const periodo = errorePeriodoPartecipante(
    String(progetto.data_inizio).slice(0, 10),
    progetto.data_fine ? String(progetto.data_fine).slice(0, 10) : null,
    parsed.data.dataInizio,
    parsed.data.dataFine
  );
  if (periodo) return { success: false, error: periodo };
  const soggetto = await etichettaSoggetto(parsed.data.soggettoTipo, parsed.data.soggettoId);
  if ("error" in soggetto) return { success: false, error: soggetto.error };
  const { data: gia, error: giaErr } = await supabase
    .from("spese_progetti_partecipanti")
    .select(
      "data_inizio, data_fine, soggetto_tipo, organigramma_persona_id, rubrica_contatto_id, cliente_id, cliente_possibile_id"
    )
    .eq("progetto_id", progetto.id)
    .eq("soggetto_tipo", parsed.data.soggettoTipo)
    .is("deleted_at", null);
  if (giaErr) return { success: false, error: giaErr.message };
  const occupato = (gia ?? []).some((row) => {
    if (idSoggettoRiga(row as PartecipanteRow) !== parsed.data.soggettoId) return false;
    return periodiPartecipanteSovrapposti(
      String(row.data_inizio).slice(0, 10),
      row.data_fine ? String(row.data_fine).slice(0, 10) : null,
      parsed.data.dataInizio,
      parsed.data.dataFine
    );
  });
  if (occupato) {
    return { success: false, error: "Questo partecipante ha già un periodo che si sovrappone." };
  }
  const { data, error } = await supabase
    .from("spese_progetti_partecipanti")
    .insert({
      progetto_id: progetto.id,
      soggetto_tipo: parsed.data.soggettoTipo,
      ...colonneSoggetto(parsed.data.soggettoTipo, parsed.data.soggettoId),
      etichetta: soggetto.etichetta,
      data_inizio: parsed.data.dataInizio,
      data_fine: parsed.data.dataFine,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Collegamento non riuscito." };
  }
  return { success: true, id: String(data.id), etichetta: soggetto.etichetta };
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
  const presenti = new Map<string, number>();
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
    const { data: parti } = await supabase
      .from("spese_progetti_partecipanti")
      .select("progetto_id")
      .in("progetto_id", ids)
      .is("deleted_at", null);
    for (const row of parti ?? []) {
      const id = String(row.progetto_id ?? "");
      presenti.set(id, (presenti.get(id) ?? 0) + 1);
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
        conteggioPartecipanti: presenti.get(id) ?? 0,
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
      partecipanti: PartecipanteProgettoView[];
      fatture: FatturaProgettoView[];
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
  const collegate = await attachRighe(
    supabase,
    ((collegateRows ?? []) as DocRow[]).map((r) => vista(r, titoli))
  );
  const acc = new Map<CategoriaSpesa, number>();
  for (const s of collegate) {
    if (s.stato === "annullato") continue;
    acc.set(s.categoria, (acc.get(s.categoria) ?? 0) + s.totale);
  }
  return {
    success: true,
    collegate,
    partecipanti: await leggiPartecipanti(supabase, id),
    fatture: await leggiFattureProgetto(supabase, id),
    libere: await attachRighe(
      supabase,
      ((libereRows ?? []) as DocRow[]).map((r) => vista(r, new Map()))
    ),
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
  partecipanti?: {
    soggettoTipo: TipoSoggettoPartecipante;
    soggettoId: string;
    dataInizio: string;
    dataFine?: string | null;
  }[];
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const parsed = progettoSpesaSchema.safeParse({
    tipo: raw.tipo,
    titolo: raw.titolo,
    descrizione: raw.descrizione ?? "",
    dataInizio: raw.dataInizio,
    dataFine: raw.dataFine || null,
    partecipanti: (raw.partecipanti ?? []).map((persona) => ({
      soggettoTipo: persona.soggettoTipo,
      soggettoId: persona.soggettoId,
      dataInizio: persona.dataInizio,
      dataFine: persona.dataFine || null,
    })),
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
  const progettoId = String(data.id);
  for (const persona of parsed.data.partecipanti) {
    const messo = await inserisciPartecipante(
      supabase,
      auth.userId,
      {
        id: progettoId,
        data_inizio: parsed.data.dataInizio,
        data_fine: parsed.data.dataFine,
        documento_stato: "bozza",
      },
      persona
    );
    if (!messo.success) {
      const nowIso = new Date().toISOString();
      await supabase
        .from("spese_progetti_partecipanti")
        .update({
          deleted_at: nowIso,
          deleted_by: auth.userId,
          updated_by: auth.userId,
        })
        .eq("progetto_id", progettoId);
      await supabase
        .from("spese_progetti")
        .update({
          deleted_at: nowIso,
          deleted_by: auth.userId,
          updated_by: auth.userId,
        })
        .eq("id", progettoId);
      await writeAuditLog({
        entity_type: "spese_progetti",
        entity_id: progettoId,
        action: "delete",
        actor_id: auth.userId,
        summary: `Creazione annullata: ${parsed.data.titolo}`,
        payload: { motivo: messo.error },
      });
      return { success: false, error: messo.error };
    }
  }
  await writeAuditLog({
    entity_type: "spese_progetti",
    entity_id: progettoId,
    action: "create",
    actor_id: auth.userId,
    summary: `Progetto spesa creato: ${parsed.data.titolo}`,
    payload: {
      tipo: parsed.data.tipo,
      documento_stato: "bozza",
      partecipanti: parsed.data.partecipanti.length,
    },
  });
  return { success: true, id: progettoId };
}

export async function elencoSoggettiPartecipantiSpesaAction(): Promise<
  | { success: true; soggetti: SoggettoPartecipanteOption[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("area-fiscale");
  const service = createServiceClient();
  const [operatori, referenti, clienti, possibili] = await Promise.all([
    service
      .from("organigramma_persone")
      .select("id, nome, cognome")
      .is("deleted_at", null)
      .eq("in_forza", true)
      .order("cognome"),
    service
      .from("rubrica_contatti")
      .select("id, nome, cognome")
      .is("deleted_at", null)
      .eq("rapporto", "referente")
      .order("cognome"),
    service
      .from("clienti")
      .select("id, ragione_sociale")
      .is("deleted_at", null)
      .order("ragione_sociale"),
    service
      .from("clienti_possibili")
      .select("id, ragione_sociale, stato")
      .is("deleted_at", null)
      .not("stato", "in", "(scartato,convertito)")
      .order("ragione_sociale"),
  ]);
  const errore = operatori.error || referenti.error || clienti.error || possibili.error;
  if (errore) return { success: false, error: errore.message };
  const soggetti: SoggettoPartecipanteOption[] = [
    ...(operatori.data ?? []).map((row) => ({
      id: String(row.id),
      tipo: "operatore" as const,
      etichetta: `${row.nome ?? ""} ${row.cognome ?? ""}`.trim(),
    })),
    ...(referenti.data ?? []).map((row) => ({
      id: String(row.id),
      tipo: "referente" as const,
      etichetta: `${row.nome ?? ""} ${row.cognome ?? ""}`.trim(),
    })),
    ...(clienti.data ?? []).map((row) => ({
      id: String(row.id),
      tipo: "cliente" as const,
      etichetta: String(row.ragione_sociale ?? "").trim(),
    })),
    ...(possibili.data ?? []).map((row) => ({
      id: String(row.id),
      tipo: "cliente_possibile" as const,
      etichetta: String(row.ragione_sociale ?? "").trim(),
    })),
  ].filter((soggetto) => soggetto.etichetta.length > 0);
  return { success: true, soggetti };
}

export async function aggiungiPartecipanteProgettoAction(raw: {
  progettoId: string;
  soggettoTipo: TipoSoggettoPartecipante;
  soggettoId: string;
  dataInizio: string;
  dataFine?: string | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("area-fiscale");
  if (!raw.progettoId) return { success: false, error: "Progetto mancante." };
  const supabase = await createClient();
  const { data: progetto } = await supabase
    .from("spese_progetti")
    .select("id, titolo, data_inizio, data_fine, documento_stato, versione")
    .eq("id", raw.progettoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!progetto) return { success: false, error: "Progetto non trovato." };
  const messo = await inserisciPartecipante(
    supabase,
    auth.userId,
    {
      id: String(progetto.id),
      data_inizio: String(progetto.data_inizio),
      data_fine: progetto.data_fine ? String(progetto.data_fine) : null,
      documento_stato: String(progetto.documento_stato),
    },
    {
      soggettoTipo: raw.soggettoTipo,
      soggettoId: raw.soggettoId,
      dataInizio: raw.dataInizio,
      dataFine: raw.dataFine || null,
    }
  );
  if (!messo.success) return messo;
  await supabase
    .from("spese_progetti")
    .update({
      versione: Number(progetto.versione) + 1,
      updated_by: auth.userId,
    })
    .eq("id", progetto.id)
    .eq("documento_stato", "bozza");
  await writeAuditLog({
    entity_type: "spese_progetti",
    entity_id: String(progetto.id),
    action: "update",
    actor_id: auth.userId,
    summary: `Partecipante aggiunto a ${progetto.titolo}: ${messo.etichetta}`,
    payload: {
      partecipante_id: messo.id,
      soggetto_tipo: raw.soggettoTipo,
      soggetto_id: raw.soggettoId,
      data_inizio: raw.dataInizio,
      data_fine: raw.dataFine || null,
    },
  });
  return { success: true };
}

export async function rimuoviPartecipanteProgettoAction(input: {
  progettoId: string;
  partecipanteId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const supabase = await createClient();
  const { data: progetto } = await supabase
    .from("spese_progetti")
    .select("id, titolo, documento_stato, versione")
    .eq("id", input.progettoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!progetto) return { success: false, error: "Progetto non trovato." };
  if (progetto.documento_stato !== "bozza") {
    return {
      success: false,
      error: "I partecipanti si modificano solo finché il progetto è in bozza.",
    };
  }
  const { data: row } = await supabase
    .from("spese_progetti_partecipanti")
    .select("id, etichetta")
    .eq("id", input.partecipanteId)
    .eq("progetto_id", input.progettoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) return { success: false, error: "Partecipante non trovato." };
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("spese_progetti_partecipanti")
    .update({
      deleted_at: nowIso,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", row.id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await supabase
    .from("spese_progetti")
    .update({
      versione: Number(progetto.versione) + 1,
      updated_by: auth.userId,
    })
    .eq("id", progetto.id)
    .eq("documento_stato", "bozza");
  await writeAuditLog({
    entity_type: "spese_progetti",
    entity_id: String(progetto.id),
    action: "update",
    actor_id: auth.userId,
    summary: `Partecipante tolto da ${progetto.titolo}: ${row.etichetta}`,
    payload: { partecipante_id: row.id, etichetta: row.etichetta },
  });
  return { success: true };
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
): Promise<
  | { success: true; documenti: number; fattureLasciate: number }
  | { success: false; error: string }
> {
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
    return {
      success: false,
      error:
        "Non ci sono spese registrate da contabilizzare. Le fatture collegate restano nello stato SDI.",
    };
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
  const { data: fattureLink } = await supabase
    .from("spese_progetti_fatture")
    .select("id, origine, fattura_emessa_id, fattura_ricevuta_id")
    .eq("progetto_id", id)
    .is("deleted_at", null);
  const fattureLasciate = fattureLink ?? [];
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
      fatture_non_contabilizzate: fattureLasciate.map((row) => ({
        origine: row.origine,
        fattura_id: row.fattura_emessa_id ?? row.fattura_ricevuta_id,
      })),
    },
  });
  return {
    success: true,
    documenti: aperti.length,
    fattureLasciate: fattureLasciate.length,
  };
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
  const signed = await admin.storage.from(SPESE_BUCKET).createSignedUrl(String(data.storage_path), 600);
  if (signed.error || !signed.data?.signedUrl) {
    return { success: false, error: signed.error?.message ?? "Apertura file non riuscita." };
  }
  return { success: true, url: signed.data.signedUrl };
}

type DbSpese = Awaited<ReturnType<typeof createClient>>;

function primoTesto(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function euroFattura(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function testoRicercaFatture(raw: string): string {
  return raw
    .replace(/[%_,()"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function numeroEmessa(row: {
  numero_fattura?: string | null;
  numero_interno?: string | null;
  numero_documento_esterno?: string | null;
}): string {
  return (
    primoTesto(row.numero_fattura, row.numero_interno, row.numero_documento_esterno) ||
    "Senza numero"
  );
}

function numeroRicevuta(row: {
  numero_interno?: string | null;
  numero_documento_esterno?: string | null;
}): string {
  return primoTesto(row.numero_interno, row.numero_documento_esterno) || "Senza numero";
}

async function leggiFattureProgetto(
  supabase: DbSpese,
  progettoId: string
): Promise<FatturaProgettoView[]> {
  const { data, error } = await supabase
    .from("spese_progetti_fatture")
    .select(
      "id, origine, fattura_emessa_id, fattura_ricevuta_id, numero, controparte, data_documento, totale"
    )
    .eq("progetto_id", progettoId)
    .is("deleted_at", null)
    .order("data_documento", { ascending: false });
  if (error || !data) return [];
  const emesseIds = data
    .map((row) => row.fattura_emessa_id)
    .filter((id): id is string => Boolean(id));
  const ricevuteIds = data
    .map((row) => row.fattura_ricevuta_id)
    .filter((id): id is string => Boolean(id));
  const [emesse, ricevute] = await Promise.all([
    emesseIds.length > 0
      ? supabase
          .from("fatture_emesse")
          .select(
            "id, numero_fattura, numero_interno, numero_documento_esterno, cliente_ragione_sociale, data_emissione, totale"
          )
          .in("id", emesseIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ricevuteIds.length > 0
      ? supabase
          .from("fatture_ricevute")
          .select(
            "id, numero_interno, numero_documento_esterno, fornitore_ragione_sociale, data_emissione, totale"
          )
          .in("id", ricevuteIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);
  const emessaById = new Map(
    (emesse.data ?? []).map((row) => [String(row.id), row])
  );
  const ricevutaById = new Map(
    (ricevute.data ?? []).map((row) => [String(row.id), row])
  );
  return data.map((row) => {
    const emessa = row.fattura_emessa_id
      ? emessaById.get(String(row.fattura_emessa_id))
      : undefined;
    const ricevuta = row.fattura_ricevuta_id
      ? ricevutaById.get(String(row.fattura_ricevuta_id))
      : undefined;
    const origine = row.origine === "ricevuta" ? "ricevuta" : "emessa";
    if (emessa) {
      return {
        id: String(row.id),
        origine,
        fatturaId: String(row.fattura_emessa_id),
        numero: numeroEmessa(emessa),
        controparte: primoTesto(emessa.cliente_ragione_sociale) || String(row.controparte ?? ""),
        dataDocumento: String(emessa.data_emissione ?? row.data_documento ?? "").slice(0, 10),
        totale: euroFattura(emessa.totale ?? row.totale),
      };
    }
    if (ricevuta) {
      return {
        id: String(row.id),
        origine,
        fatturaId: String(row.fattura_ricevuta_id),
        numero: numeroRicevuta(ricevuta),
        controparte:
          primoTesto(ricevuta.fornitore_ragione_sociale) || String(row.controparte ?? ""),
        dataDocumento: String(ricevuta.data_emissione ?? row.data_documento ?? "").slice(0, 10),
        totale: euroFattura(ricevuta.totale ?? row.totale),
      };
    }
    return {
      id: String(row.id),
      origine,
      fatturaId: String(row.fattura_emessa_id ?? row.fattura_ricevuta_id ?? ""),
      numero: primoTesto(row.numero) || "Senza numero",
      controparte: String(row.controparte ?? ""),
      dataDocumento: row.data_documento ? String(row.data_documento).slice(0, 10) : "",
      totale: euroFattura(row.totale),
    };
  });
}

const cercaFattureSchema = z.object({
  progettoId: z.string().uuid(),
  query: z.string().trim().max(80).optional().default(""),
});

const collegaFattureSchema = z.object({
  progettoId: z.string().uuid(),
  voci: z
    .array(
      z.object({
        origine: z.enum(["emessa", "ricevuta"]),
        fatturaId: z.string().uuid(),
      })
    )
    .min(1)
    .max(40),
});

export async function cercaFattureProgettoAction(raw: {
  progettoId: string;
  query?: string;
}): Promise<
  { success: true; fatture: FatturaCercataView[] } | { success: false; error: string }
> {
  await requireAreaAccess("area-fiscale");
  const parsed = cercaFattureSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Ricerca non valida." };
  const supabase = await createClient();
  const { data: progetto } = await supabase
    .from("spese_progetti")
    .select("id")
    .eq("id", parsed.data.progettoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!progetto) return { success: false, error: "Progetto non trovato." };
  const testo = testoRicercaFatture(parsed.data.query);
  const like = testo ? `"%${testo}%"` : "";
  let emesseQuery = supabase
    .from("fatture_emesse")
    .select(
      "id, numero_fattura, numero_interno, numero_documento_esterno, cliente_ragione_sociale, data_emissione, totale"
    )
    .eq("tipo_documento", "fattura")
    .is("deleted_at", null)
    .order("data_emissione", { ascending: false })
    .limit(60);
  let ricevuteQuery = supabase
    .from("fatture_ricevute")
    .select(
      "id, numero_interno, numero_documento_esterno, fornitore_ragione_sociale, data_emissione, totale"
    )
    .is("deleted_at", null)
    .order("data_emissione", { ascending: false })
    .limit(60);
  if (like) {
    emesseQuery = emesseQuery.or(
      `numero_fattura.ilike.${like},numero_interno.ilike.${like},numero_documento_esterno.ilike.${like},cliente_ragione_sociale.ilike.${like}`
    );
    ricevuteQuery = ricevuteQuery.or(
      `numero_interno.ilike.${like},numero_documento_esterno.ilike.${like},fornitore_ragione_sociale.ilike.${like}`
    );
  }
  const [emesse, ricevute] = await Promise.all([emesseQuery, ricevuteQuery]);
  if (emesse.error) return { success: false, error: emesse.error.message };
  if (ricevute.error) return { success: false, error: ricevute.error.message };
  const emesseIds = (emesse.data ?? []).map((row) => String(row.id));
  const ricevuteIds = (ricevute.data ?? []).map((row) => String(row.id));
  const [linkEmesse, linkRicevute] = await Promise.all([
    emesseIds.length > 0
      ? supabase
          .from("spese_progetti_fatture")
          .select("progetto_id, fattura_emessa_id")
          .in("fattura_emessa_id", emesseIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as Array<{ progetto_id: string; fattura_emessa_id: string }> }),
    ricevuteIds.length > 0
      ? supabase
          .from("spese_progetti_fatture")
          .select("progetto_id, fattura_ricevuta_id")
          .in("fattura_ricevuta_id", ricevuteIds)
          .is("deleted_at", null)
      : Promise.resolve({
          data: [] as Array<{ progetto_id: string; fattura_ricevuta_id: string }>,
        }),
  ]);
  const progettoEmessa = new Map(
    (linkEmesse.data ?? []).map((row) => [
      String(row.fattura_emessa_id),
      String(row.progetto_id),
    ])
  );
  const progettoRicevuta = new Map(
    (linkRicevute.data ?? []).map((row) => [
      String(row.fattura_ricevuta_id),
      String(row.progetto_id),
    ])
  );
  const risultato: FatturaCercataView[] = [
    ...(emesse.data ?? []).map((row) => {
      const occupata = progettoEmessa.get(String(row.id));
      return {
        origine: "emessa" as const,
        fatturaId: String(row.id),
        numero: numeroEmessa(row),
        controparte: primoTesto(row.cliente_ragione_sociale),
        dataDocumento: String(row.data_emissione ?? "").slice(0, 10),
        totale: euroFattura(row.totale),
        giaCollegata: Boolean(occupata),
        stessoProgetto: occupata === parsed.data.progettoId,
      };
    }),
    ...(ricevute.data ?? []).map((row) => {
      const occupata = progettoRicevuta.get(String(row.id));
      return {
        origine: "ricevuta" as const,
        fatturaId: String(row.id),
        numero: numeroRicevuta(row),
        controparte: primoTesto(row.fornitore_ragione_sociale),
        dataDocumento: String(row.data_emissione ?? "").slice(0, 10),
        totale: euroFattura(row.totale),
        giaCollegata: Boolean(occupata),
        stessoProgetto: occupata === parsed.data.progettoId,
      };
    }),
  ];
  return { success: true, fatture: risultato };
}

export async function collegaFattureProgettoAction(raw: {
  progettoId: string;
  voci: { origine: OrigineFatturaProgetto; fatturaId: string }[];
}): Promise<{ success: true; collegate: number } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const parsed = collegaFattureSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Seleziona almeno una fattura." };
  }
  const supabase = await createClient();
  const { data: progetto } = await supabase
    .from("spese_progetti")
    .select("id, titolo, documento_stato, versione")
    .eq("id", parsed.data.progettoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!progetto) return { success: false, error: "Progetto non trovato." };
  if (progetto.documento_stato === "chiuso") {
    return { success: false, error: "Il progetto è chiuso." };
  }
  const viste = new Map<string, { origine: OrigineFatturaProgetto; fatturaId: string }>();
  for (const voce of parsed.data.voci) {
    viste.set(`${voce.origine}:${voce.fatturaId}`, voce);
  }
  const daCollegare = [...viste.values()];
  let collegate = 0;
  const inserite: { origine: OrigineFatturaProgetto; fatturaId: string; numero: string }[] =
    [];
  for (const voce of daCollegare) {
    const messa = await inserisciFatturaProgetto(supabase, auth.userId, String(progetto.id), voce);
    if (!messa.success) return messa;
    if (messa.inserita) {
      collegate += 1;
      inserite.push({
        origine: voce.origine,
        fatturaId: voce.fatturaId,
        numero: messa.numero,
      });
    }
  }
  if (collegate > 0) {
    await supabase
      .from("spese_progetti")
      .update({
        versione: Number(progetto.versione) + 1,
        updated_by: auth.userId,
      })
      .eq("id", progetto.id)
      .neq("documento_stato", "chiuso");
    await writeAuditLog({
      entity_type: "spese_progetti",
      entity_id: String(progetto.id),
      action: "update",
      actor_id: auth.userId,
      summary: `Fatture collegate a ${progetto.titolo}`,
      payload: { fatture: inserite },
    });
  }
  return { success: true, collegate };
}

async function inserisciFatturaProgetto(
  supabase: DbSpese,
  userId: string,
  progettoId: string,
  voce: { origine: OrigineFatturaProgetto; fatturaId: string }
): Promise<
  | { success: true; inserita: boolean; numero: string }
  | { success: false; error: string }
> {
  if (voce.origine === "emessa") {
    const { data: fattura } = await supabase
      .from("fatture_emesse")
      .select(
        "id, tipo_documento, numero_fattura, numero_interno, numero_documento_esterno, cliente_ragione_sociale, data_emissione, totale"
      )
      .eq("id", voce.fatturaId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!fattura || fattura.tipo_documento !== "fattura") {
      return { success: false, error: "Fattura emessa non trovata." };
    }
    const { data: occupata } = await supabase
      .from("spese_progetti_fatture")
      .select("id, progetto_id")
      .eq("fattura_emessa_id", voce.fatturaId)
      .is("deleted_at", null)
      .maybeSingle();
    if (occupata) {
      if (String(occupata.progetto_id) === progettoId) {
        return { success: true, inserita: false, numero: numeroEmessa(fattura) };
      }
      return {
        success: false,
        error: `La fattura ${numeroEmessa(fattura)} è già collegata a un altro progetto.`,
      };
    }
    const { error } = await supabase.from("spese_progetti_fatture").insert({
      progetto_id: progettoId,
      origine: "emessa",
      fattura_emessa_id: voce.fatturaId,
      numero: numeroEmessa(fattura),
      controparte: primoTesto(fattura.cliente_ragione_sociale),
      data_documento: fattura.data_emissione,
      totale: euroFattura(fattura.totale),
      created_by: userId,
      updated_by: userId,
    });
    if (error) {
      return { success: false, error: "Collegamento fattura non riuscito." };
    }
    return { success: true, inserita: true, numero: numeroEmessa(fattura) };
  }
  const { data: fattura } = await supabase
    .from("fatture_ricevute")
    .select(
      "id, numero_interno, numero_documento_esterno, fornitore_ragione_sociale, data_emissione, totale"
    )
    .eq("id", voce.fatturaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!fattura) return { success: false, error: "Fattura ricevuta non trovata." };
  const { data: occupata } = await supabase
    .from("spese_progetti_fatture")
    .select("id, progetto_id")
    .eq("fattura_ricevuta_id", voce.fatturaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (occupata) {
    if (String(occupata.progetto_id) === progettoId) {
      return { success: true, inserita: false, numero: numeroRicevuta(fattura) };
    }
    return {
      success: false,
      error: `La fattura ${numeroRicevuta(fattura)} è già collegata a un altro progetto.`,
    };
  }
  const { error } = await supabase.from("spese_progetti_fatture").insert({
    progetto_id: progettoId,
    origine: "ricevuta",
    fattura_ricevuta_id: voce.fatturaId,
    numero: numeroRicevuta(fattura),
    controparte: primoTesto(fattura.fornitore_ragione_sociale),
    data_documento: fattura.data_emissione,
    totale: euroFattura(fattura.totale),
    created_by: userId,
    updated_by: userId,
  });
  if (error) {
    return { success: false, error: "Collegamento fattura non riuscito." };
  }
  return { success: true, inserita: true, numero: numeroRicevuta(fattura) };
}

export async function scollegaFatturaProgettoAction(input: {
  progettoId: string;
  collegamentoId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const ids = z
    .object({
      progettoId: z.string().uuid(),
      collegamentoId: z.string().uuid(),
    })
    .safeParse(input);
  if (!ids.success) return { success: false, error: "Collegamento non valido." };
  const supabase = await createClient();
  const { data: progetto } = await supabase
    .from("spese_progetti")
    .select("id, titolo, documento_stato, versione")
    .eq("id", ids.data.progettoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!progetto) return { success: false, error: "Progetto non trovato." };
  if (progetto.documento_stato === "chiuso") {
    return { success: false, error: "Il progetto è chiuso." };
  }
  const { data: row } = await supabase
    .from("spese_progetti_fatture")
    .select("id, origine, numero, fattura_emessa_id, fattura_ricevuta_id")
    .eq("id", ids.data.collegamentoId)
    .eq("progetto_id", ids.data.progettoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) return { success: false, error: "Fattura non collegata a questo progetto." };
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("spese_progetti_fatture")
    .update({
      deleted_at: nowIso,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", row.id)
    .is("deleted_at", null);
  if (error) return { success: false, error: "Scollegamento non riuscito." };
  await supabase
    .from("spese_progetti")
    .update({
      versione: Number(progetto.versione) + 1,
      updated_by: auth.userId,
    })
    .eq("id", progetto.id)
    .neq("documento_stato", "chiuso");
  await writeAuditLog({
    entity_type: "spese_progetti",
    entity_id: String(progetto.id),
    action: "update",
    actor_id: auth.userId,
    summary: `Fattura scollegata da ${progetto.titolo}: ${row.numero}`,
    payload: {
      collegamento_id: row.id,
      origine: row.origine,
      fattura_id: row.fattura_emessa_id ?? row.fattura_ricevuta_id,
    },
  });
  return { success: true };
}
