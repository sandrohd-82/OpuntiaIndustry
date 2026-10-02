import { writeAuditLog } from "@/lib/audit";
import {
  fetchIssuedDeliveryNotes,
  fetchReceivedDeliveryNotes,
  type FicDocumentNormalized,
} from "@/lib/fic";
import { createClient } from "@/lib/supabase/server";
import {
  importiDaDocumentoFic,
  pdfDaDocumentoFic,
  righeDaDocumentoFic,
  targaDdt,
  type RigaImportata,
} from "@/lib/fiscale/ddt";

type Sb = Awaited<ReturnType<typeof createClient>>;

type Direzione = "emesso" | "ricevuto";

type Esistente = {
  id: string;
  fic_id: number | null;
  numero_interno: string;
  versione: number;
  stato: string;
};

export type DdtSyncEsito = {
  emessi: number;
  ricevuti: number;
  aggiornati: number;
  creati: number;
  avviso: string;
};

function record(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function vatKey(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function numeroLibero(
  base: string,
  ficId: number,
  usati: Set<string>
): string {
  const pulito = base.trim() || `FIC-${ficId}`;
  if (!usati.has(pulito)) return pulito;
  const alt = `${pulito} · ${ficId}`;
  if (!usati.has(alt)) return alt;
  return `FIC-${ficId}`;
}

async function mappaAnagrafiche(
  supabase: Sb,
  direzione: Direzione,
  docs: FicDocumentNormalized[]
): Promise<Map<string, string>> {
  const table = direzione === "emesso" ? "clienti" : "fornitori";
  const { data } = await supabase
    .from(table)
    .select("id, partita_iva")
    .is("deleted_at", null);
  const byVat = new Map<string, string>();
  for (const row of data ?? []) {
    const key = vatKey(String(row.partita_iva ?? ""));
    if (key.length >= 8 && !byVat.has(key)) byVat.set(key, String(row.id));
  }
  const out = new Map<string, string>();
  for (const doc of docs) {
    const key = vatKey(doc.entityVat);
    const id = key ? byVat.get(key) : undefined;
    if (id) out.set(String(doc.ficId), id);
  }
  return out;
}

async function sostituisciRighe(
  supabase: Sb,
  ddtId: string,
  userId: string,
  righe: RigaImportata[]
): Promise<void> {
  const now = new Date().toISOString();
  const { error: delErr } = await supabase
    .from("ddt_righe")
    .update({ deleted_at: now, deleted_by: userId, updated_by: userId })
    .eq("ddt_id", ddtId)
    .is("deleted_at", null);
  if (delErr) throw new Error(delErr.message);
  if (righe.length === 0) return;
  const rows = righe.map((r, i) => ({
    ddt_id: ddtId,
    sort_order: i,
    codice: r.codice,
    descrizione: r.descrizione,
    quantita: r.quantita,
    prezzo_unitario: r.prezzoUnitario,
    sconto_percentuale: r.scontoPercentuale,
    iva_percentuale: r.ivaPercentuale,
    importo: r.importo,
    created_by: userId,
    updated_by: userId,
  }));
  const { error } = await supabase.from("ddt_righe").insert(rows);
  if (error) throw new Error(error.message);
}

async function importaDirezione(
  supabase: Sb,
  userId: string,
  direzione: Direzione,
  docs: FicDocumentNormalized[]
): Promise<{ creati: number; aggiornati: number }> {
  const { data, error } = await supabase
    .from("ddt_documenti")
    .select("id, fic_id, numero_interno, versione, stato")
    .eq("direzione", direzione)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);

  const esistenti = new Map<number, Esistente>();
  const usati = new Set<string>();
  for (const row of (data ?? []) as Esistente[]) {
    usati.add(row.numero_interno);
    if (row.fic_id) esistenti.set(Number(row.fic_id), row);
  }

  const anagrafiche = await mappaAnagrafiche(supabase, direzione, docs);
  let creati = 0;
  let aggiornati = 0;

  for (const doc of docs) {
    const raw = doc.raw;
    const righe = righeDaDocumentoFic(raw);
    const importi = importiDaDocumentoFic(raw, righe);
    const anagraficaId = anagrafiche.get(String(doc.ficId)) ?? null;
    const entity = record(raw.entity);
    const destinazione = [
      entity.address_street,
      entity.address_postal_code,
      entity.address_city,
      entity.address_province,
    ]
      .map((p) => String(p ?? "").trim())
      .filter(Boolean)
      .join(", ")
      .slice(0, 400);
    const causale = String(raw.visible_subject ?? raw.subject ?? "")
      .trim()
      .slice(0, 300);
    const note = String(raw.notes ?? "").trim().slice(0, 2000);
    const dataDoc = doc.date;
    if (!dataDoc) continue;

    const corrente = esistenti.get(doc.ficId);
    if (corrente?.stato === "annullato") continue;

    const comune = {
      numero_fic: doc.number,
      ragione_sociale: (doc.entityName || "Senza intestazione").slice(0, 300),
      partita_iva: doc.entityVat.slice(0, 32),
      data_documento: dataDoc,
      causale_trasporto: causale,
      destinazione,
      imponibile: importi.imponibile,
      imposta: importi.imposta,
      totale: importi.totale,
      note,
      pdf_url: pdfDaDocumentoFic(raw),
      raw_data: raw,
      updated_by: userId,
      cliente_id: direzione === "emesso" ? anagraficaId : null,
      fornitore_id: direzione === "ricevuto" ? anagraficaId : null,
    };

    if (corrente) {
      const locale = corrente.numero_interno.startsWith("Dt-");
      const { error: upErr } = await supabase
        .from("ddt_documenti")
        .update({
          ...(locale
            ? {
                numero_fic: doc.number,
                imponibile: importi.imponibile,
                imposta: importi.imposta,
                totale: importi.totale,
                pdf_url: pdfDaDocumentoFic(raw),
                raw_data: raw,
                updated_by: userId,
              }
            : comune),
          versione: (Number(corrente.versione) || 1) + 1,
        })
        .eq("id", corrente.id);
      if (upErr) throw new Error(upErr.message);
      await sostituisciRighe(supabase, corrente.id, userId, righe);
      aggiornati += 1;
      continue;
    }

    const numero = numeroLibero(doc.number || `FIC-${doc.ficId}`, doc.ficId, usati);
    usati.add(numero);
    const { data: inserted, error: insErr } = await supabase
      .from("ddt_documenti")
      .insert({
        ...comune,
        direzione,
        fic_id: doc.ficId,
        numero_interno: numero,
        stato: "registrato",
        versione: 1,
        created_by: userId,
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      throw new Error(insErr?.message ?? "Inserimento DDT non riuscito.");
    }
    await sostituisciRighe(supabase, String(inserted.id), userId, righe);
    creati += 1;
  }

  return { creati, aggiornati };
}

/** Scarica tutti i DDT da Fatture in Cloud e li allinea al registro locale. */
export async function importaDdtDaFattureInCloud(
  supabase: Sb,
  userId: string
): Promise<DdtSyncEsito> {
  const errori: string[] = [];
  let emessiOk = false;
  let ricevutiOk = false;
  let emessi: FicDocumentNormalized[] = [];
  let ricevuti: FicDocumentNormalized[] = [];
  try {
    emessi = await fetchIssuedDeliveryNotes(null);
    emessiOk = true;
  } catch (e) {
    errori.push(e instanceof Error ? e.message : "DDT emessi non letti.");
  }
  try {
    ricevuti = await fetchReceivedDeliveryNotes(null);
    ricevutiOk = true;
  } catch (e) {
    errori.push(e instanceof Error ? e.message : "DDT ricevuti non letti.");
  }
  if (!emessiOk && !ricevutiOk) {
    throw new Error(errori.join(" "));
  }
  const a = await importaDirezione(supabase, userId, "emesso", emessi);
  const b = await importaDirezione(supabase, userId, "ricevuto", ricevuti);
  const esito: DdtSyncEsito = {
    emessi: emessi.length,
    ricevuti: ricevuti.length,
    creati: a.creati + b.creati,
    aggiornati: a.aggiornati + b.aggiornati,
    avviso: errori.join(" "),
  };
  await writeAuditLog({
    entity_type: "ddt_documenti",
    entity_id: "sync",
    action: "update",
    actor_id: userId,
    summary: `Sync DDT FiC: ${esito.emessi} emessi, ${esito.ricevuti} ricevuti`,
    payload: esito,
  });
  return esito;
}

export async function prossimoNumeroDdt(
  supabase: Sb,
  dataDocumento: string,
  codiceTarga: string
): Promise<string> {
  const yy = dataDocumento.slice(2, 4);
  const targa = targaDdt(codiceTarga);
  const prefix = `Dt-${yy}-${targa}/`;
  const { data, error } = await supabase
    .from("ddt_documenti")
    .select("numero_interno")
    .eq("direzione", "emesso")
    .is("deleted_at", null)
    .like("numero_interno", `${prefix}%`);
  if (error) throw new Error(error.message);
  let max = 0;
  for (const row of data ?? []) {
    const n = Number(String(row.numero_interno ?? "").slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}
