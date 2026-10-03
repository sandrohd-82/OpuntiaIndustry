import { createHash } from "node:crypto";
import {
  allegatoSembraFattura,
  chiaveFatturaMail,
  estraiDaTestoFattura,
  estraiDaXmlFattura,
  testoParlaDiFattura,
  unisciEstratto,
  xmlNelFile,
  type FatturaGiaNota,
} from "@/lib/amministrazione/fatture-mail-scan";
import { trimestreFromIsoDate } from "@/lib/amministrazione/trimestre-commerciale";
import type { createServiceClient } from "@/lib/supabase/server";

type Service = ReturnType<typeof createServiceClient>;

const BATCH = 20;
const MAX_DOWNLOAD = 8_000_000;

type MessaggioRow = {
  id: string;
  account_id: string;
  subject: string;
  body_text: string;
  from_address: string;
  from_name: string;
  received_at: string | null;
};

type AllegatoRow = {
  id: string;
  messaggio_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  is_inline: boolean;
  storage_bucket: string;
  storage_path: string;
};

function isoOggi(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function caricaFattureNote(
  supabase: Service,
  dal: string,
  al: string
): Promise<FatturaGiaNota[]> {
  const dalIso = dal;
  const alIso = al;

  const [ricevute, fic] = await Promise.all([
    supabase
      .from("fatture_ricevute")
      .select(
        "id, numero_documento_esterno, fornitore_id, totale, data_emissione"
      )
      .is("deleted_at", null)
      .gte("data_emissione", dalIso)
      .lte("data_emissione", alIso),
    supabase
      .from("fic_invoices")
      .select("id, number, entity_vat, amount_gross, date")
      .eq("type", "received")
      .is("deleted_at", null)
      .gte("date", dalIso)
      .lte("date", alIso),
  ]);

  const fornitoreIds = [
    ...new Set(
      ((ricevute.data ?? []) as { fornitore_id: string | null }[])
        .map((r) => r.fornitore_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const fornitori = fornitoreIds.length
    ? await supabase
        .from("fornitori")
        .select("id, partita_iva")
        .in("id", fornitoreIds)
    : { data: [] };
  const pivaDi = new Map(
    ((fornitori.data ?? []) as { id: string; partita_iva: string }[]).map(
      (f) => [f.id, f.partita_iva ?? ""]
    )
  );

  const note: FatturaGiaNota[] = [];
  for (const row of (ricevute.data ?? []) as {
    id: string;
    numero_documento_esterno: string;
    fornitore_id: string | null;
    totale: number | null;
    data_emissione: string;
  }[]) {
    note.push({
      id: row.id,
      numero: row.numero_documento_esterno ?? "",
      piva: row.fornitore_id ? (pivaDi.get(row.fornitore_id) ?? "") : "",
      totale: row.totale == null ? null : Number(row.totale),
      data: String(row.data_emissione ?? "").slice(0, 10),
      fonte: "registrata",
    });
  }
  for (const row of (fic.data ?? []) as {
    id: string;
    number: string;
    entity_vat: string;
    amount_gross: number | null;
    date: string | null;
  }[]) {
    note.push({
      id: row.id,
      numero: row.number ?? "",
      piva: row.entity_vat ?? "",
      totale: row.amount_gross == null ? null : Number(row.amount_gross),
      data: String(row.date ?? "").slice(0, 10),
      fonte: "sdi",
    });
  }
  return note;
}

async function shaAllegato(
  supabase: Service,
  allegato: AllegatoRow
): Promise<{ sha: string; xml: string | null } | null> {
  if (!allegato.storage_path) return null;
  if (allegato.size_bytes > MAX_DOWNLOAD) return null;
  const bucket = allegato.storage_bucket || "webmail-allegati";
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(allegato.storage_path);
  if (error || !data) return null;
  const bytes = Buffer.from(await data.arrayBuffer());
  const sha = createHash("sha256").update(bytes).digest("hex");
  const nome = allegato.filename.toLowerCase();
  const xml =
    nome.endsWith(".xml") || nome.endsWith(".p7m") || allegato.mime_type.includes("xml")
      ? xmlNelFile(bytes)
      : null;
  return { sha, xml };
}

async function segnaCopie(supabase: Service, chiave: string, principaleId: string) {
  if (!chiave) return;
  await supabase
    .from("fatture_mail_candidati")
    .update({ copia_di: principaleId, updated_at: new Date().toISOString() })
    .eq("chiave_fattura", chiave)
    .is("deleted_at", null)
    .is("copia_di", null)
    .neq("id", principaleId)
    .eq("stato", "da_valutare");
}

/** Anno solare da leggere. La prima passata copre tutto il 2026, non un solo trimestre. */
export function intervalloAnnoMailFatture(oggi = isoOggi()): {
  dal: string;
  al: string;
  anno: number;
} {
  const anno = Number(oggi.slice(0, 4));
  return { dal: `${anno}-01-01`, al: `${anno}-12-31`, anno };
}

/** Dopo la sync, e al primo ingresso: legge le mail dell'anno non ancora controllate. */
export async function scanFattureMailDopoSync(
  supabase: Service,
  options?: {
    preferMessageIds?: string[];
    backlog?: boolean;
    dal?: string;
    al?: string;
    limite?: number;
    maxAllegati?: number;
  }
): Promise<{ controllati: number; candidati: number; restano: boolean }> {
  const annoMail = intervalloAnnoMailFatture();
  const range = {
    dal: options?.dal ?? annoMail.dal,
    al: options?.al ?? annoMail.al,
  };
  const dal = `${range.dal}T00:00:00.000Z`;
  const al = `${range.al}T23:59:59.999Z`;
  const limite = Math.min(40, Math.max(1, options?.limite ?? BATCH));
  const maxAllegati = Math.min(12, Math.max(1, options?.maxAllegati ?? 8));

  const ids = new Set<string>();
  for (const id of options?.preferMessageIds ?? []) {
    if (id) ids.add(id);
  }
  if (options?.backlog !== false) {
    const { data, error } = await supabase.rpc(
      "fatture_mail_messaggi_da_controllare",
      { p_dal: dal, p_al: al, p_limit: limite }
    );
    if (error) {
      console.error("[fatture-mail] coda", error.message);
    } else {
      for (const row of (data ?? []) as { id: string }[]) ids.add(row.id);
    }
  }
  if (ids.size === 0) return { controllati: 0, candidati: 0, restano: false };

  const idList = [...ids].slice(0, 40);
  const { data: gia } = await supabase
    .from("fatture_mail_controlli")
    .select("messaggio_id")
    .in("messaggio_id", idList);
  const giaSet = new Set(
    ((gia ?? []) as { messaggio_id: string }[]).map((r) => r.messaggio_id)
  );
  const daFare = idList.filter((id) => !giaSet.has(id));
  if (daFare.length === 0) return { controllati: 0, candidati: 0, restano: false };

  const { data: messaggi } = await supabase
    .from("webmail_messaggi")
    .select(
      "id, account_id, subject, body_text, from_address, from_name, received_at, direction"
    )
    .in("id", daFare)
    .eq("direction", "inbound")
    .is("deleted_at", null);
  const rows = (messaggi ?? []) as (MessaggioRow & { direction: string })[];
  const accountIds = [...new Set(rows.map((r) => r.account_id))];
  const { data: accountRows } = accountIds.length
    ? await supabase
        .from("webmail_accounts")
        .select("id, email_address")
        .in("id", accountIds)
    : { data: [] };
  const casellaDi = new Map(
    ((accountRows ?? []) as { id: string; email_address: string }[]).map((a) => [
      a.id,
      a.email_address ?? "",
    ])
  );
  const { data: allegati } = await supabase
    .from("webmail_messaggi_allegati")
    .select(
      "id, messaggio_id, filename, mime_type, size_bytes, is_inline, storage_bucket, storage_path"
    )
    .in("messaggio_id", daFare)
    .is("deleted_at", null);
  const allegatiDi = new Map<string, AllegatoRow[]>();
  for (const a of (allegati ?? []) as AllegatoRow[]) {
    const list = allegatiDi.get(a.messaggio_id) ?? [];
    list.push(a);
    allegatiDi.set(a.messaggio_id, list);
  }

  let candidati = 0;
  let allegatiLetti = 0;
  const rinviati = new Set<string>();

  for (const msg of rows) {
    const testo = `${msg.subject ?? ""}\n${(msg.body_text ?? "").slice(0, 4000)}`;
    const utili = (allegatiDi.get(msg.id) ?? []).filter((a) =>
      allegatoSembraFattura({
        filename: a.filename ?? "",
        mimeType: a.mime_type ?? "",
        sizeBytes: Number(a.size_bytes) || 0,
        isInline: Boolean(a.is_inline),
      })
    );
    const parla =
      testoParlaDiFattura(testo) ||
      utili.some((a) => testoParlaDiFattura(a.filename ?? ""));
    if (!parla || utili.length === 0) {
      await supabase.from("fatture_mail_controlli").upsert({
        messaggio_id: msg.id,
        esito: "nessuna_fattura",
      });
      continue;
    }

    const giorno = (msg.received_at ?? "").slice(0, 10);
    const nelAnno = giorno >= range.dal && giorno <= range.al;
    if (!nelAnno) continue;
    if (allegatiLetti >= maxAllegati) {
      rinviati.add(msg.id);
      continue;
    }
    allegatiLetti += 1;
    const delMessaggio = trimestreFromIsoDate(giorno);

    for (const allegato of utili.slice(0, 2)) {
      const file = await shaAllegato(supabase, allegato);
      const xml = file?.xml ? estraiDaXmlFattura(file.xml) : null;
      const estratto = unisciEstratto(
        xml,
        estraiDaTestoFattura(
          `${testo}\n${allegato.filename ?? ""}\n${msg.from_name ?? ""}`
        )
      );
      const sha = file?.sha ?? "";
      const chiave = chiaveFatturaMail({
        piva: estratto.fornitorePiva,
        numero: estratto.numeroDocumento,
        totale: estratto.totale,
        sha256: sha,
      });
      const stessaChiave = chiave
        ? await supabase
            .from("fatture_mail_candidati")
            .select("id, stato, fattura_ricevuta_id")
            .eq("chiave_fattura", chiave)
            .is("deleted_at", null)
            .limit(1)
            .maybeSingle()
        : { data: null };
      const gemella = stessaChiave.data as {
        id: string;
        stato: string;
        fattura_ricevuta_id: string | null;
      } | null;
      const giaPerCopia =
        gemella &&
        (gemella.stato === "registrata" || gemella.stato === "gia_presente");
      const stato = giaPerCopia ? "gia_presente" : "da_valutare";
      const motivo = giaPerCopia ? "Copia cortesia della stessa fattura" : "";
      const fatturaId = giaPerCopia ? (gemella?.fattura_ricevuta_id ?? null) : null;
      const { error } = await supabase.from("fatture_mail_candidati").insert({
          account_id: msg.account_id,
          messaggio_id: msg.id,
          allegato_id: allegato.id,
          casella_email: casellaDi.get(msg.account_id) ?? "",
          anno: delMessaggio?.anno ?? annoMail.anno,
          trimestre: delMessaggio?.trim ?? 1,
          oggetto: msg.subject ?? "",
          data_mail: msg.received_at,
          mittente_email: msg.from_address ?? "",
          mittente_nome: msg.from_name ?? "",
          numero_documento: estratto.numeroDocumento,
          data_documento: estratto.dataDocumento || null,
          fornitore_ragione: estratto.fornitoreRagione || msg.from_name || "",
          fornitore_piva: estratto.fornitorePiva,
          totale: estratto.totale,
          file_name: allegato.filename ?? "",
          file_sha256: sha,
          chiave_fattura: chiave,
          stato,
          documento_stato: stato === "da_valutare" ? "Bozza" : "Chiuso",
          fattura_ricevuta_id: fatturaId,
          motivo_match: motivo,
          copia_di: giaPerCopia ? (gemella?.id ?? null) : null,
        });
      if (error) {
        if (!/duplicate|unique/i.test(error.message)) {
          console.error("[fatture-mail] candidato", error.message);
        }
        continue;
      }
      candidati += stato === "da_valutare" ? 1 : 0;
      if (chiave && stato === "da_valutare") {
        const { data: principale } = await supabase
          .from("fatture_mail_candidati")
          .select("id")
          .eq("chiave_fattura", chiave)
          .is("deleted_at", null)
          .is("copia_di", null)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        const principaleId = (principale as { id: string } | null)?.id;
        if (principaleId) await segnaCopie(supabase, chiave, principaleId);
      }
    }

    await supabase.from("fatture_mail_controlli").upsert({
      messaggio_id: msg.id,
      esito: "candidato",
    });
  }

  const visti = new Set(rows.map((r) => r.id));
  for (const id of daFare) {
    if (visti.has(id) || rinviati.has(id)) continue;
    await supabase.from("fatture_mail_controlli").upsert({
      messaggio_id: id,
      esito: "nessuna_fattura",
    });
  }

  return {
    controllati: daFare.length - rinviati.size,
    candidati,
    restano: rinviati.size > 0 || daFare.length >= limite,
  };
}
