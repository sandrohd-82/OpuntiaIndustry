import { nextSequentialCodiceTarga } from "@/lib/amministrazione/codice-targa";
import {
  calcolaTotaliFattura,
  importoRiga,
  roundMoney,
  scartoTotaleFic,
  type FatturaKind,
  type FatturaRiga,
} from "@/lib/amministrazione/fatture";
import {
  companyNamesMatch,
  normalizeVatKey,
} from "@/lib/amministrazione/fic-anagrafiche";
import type { FatturaSyncQueueItem } from "@/lib/amministrazione/fatture-sync";
import { buildNumeroInternoFattura } from "@/lib/amministrazione/fatture";
import { writeAuditLog } from "@/lib/audit";
import type { FattureSyncAnagraficaCreata } from "@/lib/amministrazione/fatture-sync-keep";
import type {
  ClienteInsert,
  ClienteRow,
  FornitoreInsert,
  FornitoreRow,
} from "@/types/database";

function asSb(client: unknown): {
  from: (t: string) => unknown;
} {
  return client as { from: (t: string) => unknown };
}

const emptySede = {
  nazione: "",
  provincia: "",
  citta: "",
  cap: "",
  indirizzo: "",
};

export type AnagraficaRisolta = {
  id: string;
  ragioneSociale: string;
  codiceTarga: string;
  partitaIva: string;
  created: boolean;
};

async function nextSeqFatturaWithClient(
  supabase: ReturnType<typeof asSb>,
  kind: FatturaKind,
  anagraficaId: string,
  codiceTarga: string
): Promise<number> {
  const table = kind === "ricevuta" ? "fatture_ricevute" : "fatture_emesse";
  const idCol = kind === "ricevuta" ? "fornitore_id" : "cliente_id";
  const prefix = kind === "nota_credito" ? "Nc" : "Ft";
  const { data, error } = await (
    supabase.from(table) as unknown as {
      select: (cols: string) => {
        is: (c: string, v: null) => Promise<{
          data: Array<Record<string, unknown>> | null;
          error: { message: string } | null;
        }>;
      };
    }
  )
    .select(`numero_interno, ${idCol}`)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);

  const targa = codiceTarga.trim().toUpperCase();
  const re = new RegExp(
    `^${prefix}-\\d{2}-${targa.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(\\d+)$`,
    "i"
  );
  let countById = 0;
  let maxParsed = 0;
  for (const row of data ?? []) {
    if (row[idCol] === anagraficaId) {
      const num = String(row.numero_interno ?? "");
      if (kind === "nota_credito") {
        if (num.toUpperCase().startsWith("NC-")) countById += 1;
      } else if (kind === "emessa") {
        if (num.toUpperCase().startsWith("FT-")) countById += 1;
      } else {
        countById += 1;
      }
    }
    const m = String(row.numero_interno ?? "").match(re);
    if (m) maxParsed = Math.max(maxParsed, Number(m[1]));
  }
  return Math.max(countById, maxParsed) + 1;
}

function vatOrCfMatch(
  vat: string,
  rowVat: string | null | undefined,
  rowCf: string | null | undefined
): boolean {
  if (!vat) return false;
  return normalizeVatKey(rowVat ?? "") === vat || normalizeVatKey(rowCf ?? "") === vat;
}

export async function ensureAnagraficaDaFic(input: {
  supabase: unknown;
  userId: string;
  tipo: "fornitore" | "cliente";
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale?: string;
  draft?: {
    email?: string;
    pec?: string;
    sdiCode?: string;
    telefono?: string;
    sitoWeb?: string;
    sedeAmministrativa?: typeof emptySede;
    sedeMagazzino?: typeof emptySede;
  };
}): Promise<AnagraficaRisolta | { error: string }> {
  const supabase = asSb(input.supabase);
  const nome = input.ragioneSociale.trim();
  const vat = normalizeVatKey(input.partitaIva);
  const cf = normalizeVatKey(input.codiceFiscale || input.partitaIva);
  if (!nome) return { error: "Ragione sociale mancante." };
  if (!vat) {
    return { error: "Partita IVA mancante: non creo anagrafiche senza P.IVA." };
  }

  const table = input.tipo === "fornitore" ? "fornitori" : "clienti";
  const { data, error } = await (
    supabase.from(table) as unknown as {
      select: (cols: string) => {
        is: (c: string, v: null) => Promise<{
          data: Array<Record<string, unknown>> | null;
          error: { message: string } | null;
        }>;
      };
    }
  )
    .select("*")
    .is("deleted_at", null);
  if (error) return { error: error.message };

  const rows = data ?? [];
  const byVat = rows.find((r) =>
    vatOrCfMatch(vat, String(r.partita_iva ?? ""), String(r.codice_fiscale ?? ""))
  );
  if (byVat) {
    return {
      id: String(byVat.id),
      ragioneSociale: String(byVat.ragione_sociale ?? nome),
      codiceTarga: String(byVat.codice_targa ?? ""),
      partitaIva: String(byVat.partita_iva ?? input.partitaIva),
      created: false,
    };
  }

  const nameHit = rows.find((r) =>
    companyNamesMatch(nome, String(r.ragione_sociale ?? ""))
  );
  if (nameHit) {
    const hitVat = normalizeVatKey(String(nameHit.partita_iva ?? ""));
    if (hitVat && hitVat !== vat) {
      return {
        error: `Ragione sociale già usata da ${String(nameHit.codice_targa)} con P.IVA diversa: non creo doppioni.`,
      };
    }
    return {
      id: String(nameHit.id),
      ragioneSociale: String(nameHit.ragione_sociale ?? nome),
      codiceTarga: String(nameHit.codice_targa ?? ""),
      partitaIva: String(nameHit.partita_iva ?? input.partitaIva),
      created: false,
    };
  }

  const used = rows
    .map((r) => String(r.codice_targa ?? "").trim().toUpperCase())
    .filter(Boolean);
  const prefix = input.tipo === "fornitore" ? "F" : "C";
  const codiceTarga = nextSequentialCodiceTarga(prefix, used);
  const sedeA = input.draft?.sedeAmministrativa ?? emptySede;
  const sedeM = input.draft?.sedeMagazzino ?? emptySede;
  const pivaStore = input.partitaIva.trim() || vat;
  const cfStore = (input.codiceFiscale || input.partitaIva || vat).trim() || vat;

  if (input.tipo === "fornitore") {
    const insert: FornitoreInsert = {
      codice_targa: codiceTarga,
      ragione_sociale: nome,
      partita_iva: pivaStore,
      codice_fiscale: cfStore,
      email: input.draft?.email ?? "",
      pec: input.draft?.pec ?? "",
      sdi_code: input.draft?.sdiCode ?? "",
      telefono: input.draft?.telefono ?? "",
      sito_web: input.draft?.sitoWeb ?? "",
      sede_amm_nazione: sedeA.nazione,
      sede_amm_provincia: sedeA.provincia,
      sede_amm_citta: sedeA.citta,
      sede_amm_cap: sedeA.cap,
      sede_amm_indirizzo: sedeA.indirizzo,
      sede_mag_nazione: sedeM.nazione,
      sede_mag_provincia: sedeM.provincia,
      sede_mag_citta: sedeM.citta,
      sede_mag_cap: sedeM.cap,
      sede_mag_indirizzo: sedeM.indirizzo,
      tipologie: [],
      servizi_offerti: [],
      prodotti_fornitore: [],
      prodotti_acquistati: [],
      anagrafica_fonte: "fic_fattura",
      created_by: input.userId,
      updated_by: input.userId,
    };
    const { data: row, error: insErr } = await (
      supabase.from("fornitori") as unknown as {
        insert: (v: FornitoreInsert) => {
          select: (c: string) => {
            single: () => Promise<{
              data: FornitoreRow | null;
              error: { message: string; code?: string } | null;
            }>;
          };
        };
      }
    )
      .insert(insert)
      .select("*")
      .single();
    if (insErr || !row) {
      return { error: insErr?.message ?? "Creazione fornitore non riuscita." };
    }
    await writeAuditLog({
      entity_type: "fornitori",
      entity_id: row.id,
      action: "create_sync_fic",
      actor_id: input.userId,
      summary: `Creato fornitore ${row.codice_targa} da sync fatture (P.IVA)`,
      payload: {
        codice_targa: row.codice_targa,
        ragione_sociale: row.ragione_sociale,
        partita_iva: row.partita_iva,
      },
    });
    return {
      id: row.id,
      ragioneSociale: row.ragione_sociale,
      codiceTarga: row.codice_targa,
      partitaIva: row.partita_iva,
      created: true,
    };
  }

  const insert: ClienteInsert = {
    codice_targa: codiceTarga,
    ragione_sociale: nome,
    partita_iva: pivaStore,
    codice_fiscale: cfStore,
    is_privato: false,
    email: input.draft?.email ?? "",
    pec: input.draft?.pec ?? "",
    sdi_code: input.draft?.sdiCode ?? "",
    telefono: input.draft?.telefono ?? "",
    sito_web: input.draft?.sitoWeb ?? "",
    sede_amm_nazione: sedeA.nazione,
    sede_amm_provincia: sedeA.provincia,
    sede_amm_citta: sedeA.citta,
    sede_amm_cap: sedeA.cap,
    sede_amm_indirizzo: sedeA.indirizzo,
    sede_mag_nazione: sedeM.nazione,
    sede_mag_provincia: sedeM.provincia,
    sede_mag_citta: sedeM.citta,
    sede_mag_cap: sedeM.cap,
    sede_mag_indirizzo: sedeM.indirizzo,
    prodotti_acquistati: [],
    created_by: input.userId,
    updated_by: input.userId,
  };
  const { data: row, error: insErr } = await (
    supabase.from("clienti") as unknown as {
      insert: (v: ClienteInsert) => {
        select: (c: string) => {
          single: () => Promise<{
            data: ClienteRow | null;
            error: { message: string } | null;
          }>;
        };
      };
    }
  )
    .insert(insert)
    .select("*")
    .single();
  if (insErr || !row) {
    return { error: insErr?.message ?? "Creazione cliente non riuscita." };
  }
  await writeAuditLog({
    entity_type: "clienti",
    entity_id: row.id,
    action: "create_sync_fic",
    actor_id: input.userId,
    summary: `Creato cliente ${row.codice_targa} da sync fatture (P.IVA)`,
    payload: {
      codice_targa: row.codice_targa,
      ragione_sociale: row.ragione_sociale,
      partita_iva: row.partita_iva,
    },
  });
  return {
    id: row.id,
    ragioneSociale: row.ragione_sociale,
    codiceTarga: row.codice_targa,
    partitaIva: row.partita_iva ?? pivaStore,
    created: true,
  };
}

function righeVeloce(item: FatturaSyncQueueItem, xmlTotale: number): FatturaRiga[] {
  const base: FatturaRiga[] =
    item.righe.length > 0
      ? item.righe.map((r) => ({
          ...r,
          prodottoId: null,
          codice: r.codice?.trim() || "—",
          descrizione: r.descrizione?.trim() || "Voce XML",
        }))
      : [
          {
            prodottoId: null,
            codice: "XML",
            descrizione: item.numeroEsterno
              ? `Documento ${item.numeroEsterno}`
              : "Documento FiC",
            quantita: 1,
            unitaMisura: "NR",
            prezzoUnitario: xmlTotale || item.imponibile || 0,
            scontoPercentuale: 0,
            ivaPercentuale: item.ivaPercentuale || 22,
            importo: xmlTotale || item.imponibile || 0,
          },
        ];

  const totals = calcolaTotaliFattura({
    righe: base,
    spedizione: item.spedizione,
    spedizioneIvaApplicata: item.spedizioneIvaApplicata,
    spedizioneIvaPercentuale: item.spedizioneIvaPercentuale ?? 22,
    notaCredito: item.kind === "nota_credito",
    ivaPercentuale: item.ivaPercentuale || 22,
    ivaPerRiga: item.kind === "ricevuta",
  });

  if (item.kind === "ricevuta") return base;

  const delta = roundMoney(xmlTotale - totals.totale);
  if (Math.abs(delta) <= 0.01) return base;
  const allinea: FatturaRiga = {
    prodottoId: null,
    codice: "XML",
    descrizione: "Allineamento totale XML Fatture in Cloud",
    quantita: item.kind === "nota_credito" ? (delta >= 0 ? 1 : -1) : 1,
    unitaMisura: "NR",
    prezzoUnitario: Math.abs(delta),
    scontoPercentuale: 0,
    ivaPercentuale: 0,
    importo: importoRiga(
      item.kind === "nota_credito" ? (delta >= 0 ? 1 : -1) : 1,
      Math.abs(delta),
      0
    ),
  };
  return [...base, allinea];
}

export async function registraFatturaVeloce(input: {
  supabase: unknown;
  userId: string;
  item: FatturaSyncQueueItem;
  anagrafica: AnagraficaRisolta;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = asSb(input.supabase);
  const item = input.item;
  const xmlTotale = roundMoney(Math.abs(Number(item.amountGross || item.totale) || 0));
  const righe = righeVeloce(item, xmlTotale);
  const totals = calcolaTotaliFattura({
    righe,
    spedizione: item.spedizione,
    spedizioneIvaApplicata: item.spedizioneIvaApplicata,
    spedizioneIvaPercentuale: item.spedizioneIvaPercentuale ?? 22,
    notaCredito: item.kind === "nota_credito",
    ivaPercentuale: item.ivaPercentuale || 22,
    ivaPerRiga: item.kind === "ricevuta",
  });

  if (item.kind === "nota_credito" && !item.linkedFattura?.fatturaId) {
    return {
      ok: false,
      error: "Nota di credito senza fattura collegata già registrata.",
    };
  }

  try {
    const seq = await nextSeqFatturaWithClient(
      supabase,
      item.kind,
      input.anagrafica.id,
      input.anagrafica.codiceTarga
    );
    const numeroInterno = buildNumeroInternoFattura({
      dataEmissione: item.dataEmissione,
      codiceTarga: input.anagrafica.codiceTarga,
      seq,
      kind: item.kind,
    });

    if (item.kind === "emessa" || item.kind === "nota_credito") {
      const { data, error } = await (
        supabase.from("fatture_emesse") as unknown as {
          insert: (v: Record<string, unknown>) => {
            select: (c: string) => {
              single: () => Promise<{
                data: { id: string } | null;
                error: { message: string } | null;
              }>;
            };
          };
        }
      )
        .insert({
          numero_interno: numeroInterno,
          cliente_id: input.anagrafica.id,
          cliente_ragione_sociale: input.anagrafica.ragioneSociale,
          cliente_codice_targa: input.anagrafica.codiceTarga,
          data_emissione: item.dataEmissione,
          numero_documento_esterno: item.numeroEsterno,
          fic_id: item.ficId,
          spedizione: item.spedizione,
          spedizione_iva_applicata: item.spedizioneIvaApplicata,
          spedizione_iva_percentuale: item.spedizioneIvaPercentuale ?? 22,
          spedizione_sottrai_incassi: item.kind !== "nota_credito",
          imponibile: totals.imponibile,
          iva_percentuale: totals.ivaPercentualePrevalente ?? item.ivaPercentuale,
          imposta: totals.imposta,
          totale: totals.totale,
          stato_pagamento: item.statoPagamento,
          documento_stato: "registrata",
          note: "Registrazione veloce FiC: totale allineato XML, senza catalogo magazzino.",
          tipo_documento: item.kind === "nota_credito" ? "nota_credito" : "fattura",
          fattura_collegata_id: item.linkedFattura?.fatturaId ?? null,
          riferimento_fattura_esterno: item.riferimentoFatturaEsterno || "",
          origine: "sync_fic",
          created_by: input.userId,
          updated_by: input.userId,
        })
        .select("id")
        .single();
      if (error || !data) {
        return { ok: false, error: error?.message ?? "Salvataggio emessa fallito." };
      }
      const { error: righeErr } = await (
        supabase.from("fatture_emesse_righe") as unknown as {
          insert: (v: Record<string, unknown>[]) => Promise<{
            error: { message: string } | null;
          }>;
        }
      ).insert(
        righe.map((r, i) => ({
          fattura_id: data.id,
          prodotto_id: null,
          codice: r.codice,
          descrizione: r.descrizione,
          quantita: r.quantita,
          prezzo_unitario: r.prezzoUnitario,
          sconto_percentuale: r.scontoPercentuale,
          importo: r.importo,
          sort_order: i,
          created_by: input.userId,
          updated_by: input.userId,
        }))
      );
      if (righeErr) {
        await (
          supabase.from("fatture_emesse") as unknown as {
            update: (v: Record<string, unknown>) => {
              eq: (c: string, v: string) => Promise<unknown>;
            };
          }
        )
          .update({
            deleted_at: new Date().toISOString(),
            deleted_by: input.userId,
            updated_by: input.userId,
          })
          .eq("id", data.id);
        return { ok: false, error: `Righe: ${righeErr.message}` };
      }
      await writeAuditLog({
        entity_type: "fatture_emesse",
        entity_id: data.id,
        action: "create_sync_veloce",
        actor_id: input.userId,
        summary: `Registrata ${numeroInterno} (veloce, no catalogo)`,
        payload: {
          fic_id: item.ficId,
          totale: totals.totale,
          totale_xml: xmlTotale,
          skip_catalogo: true,
        },
      });
      return { ok: true, id: data.id };
    }

    const totaleDocumento = xmlTotale > 0 ? xmlTotale : totals.totale;
    const scarto = scartoTotaleFic(totaleDocumento, xmlTotale);
    const { data, error } = await (
      supabase.from("fatture_ricevute") as unknown as {
        insert: (v: Record<string, unknown>) => {
          select: (c: string) => {
            single: () => Promise<{
              data: { id: string } | null;
              error: { message: string } | null;
            }>;
          };
        };
      }
    )
      .insert({
        numero_interno: numeroInterno,
        fornitore_id: input.anagrafica.id,
        fornitore_ragione_sociale: input.anagrafica.ragioneSociale,
        fornitore_codice_targa: input.anagrafica.codiceTarga,
        data_emissione: item.dataEmissione,
        numero_documento_esterno: item.numeroEsterno,
        fic_id: item.ficId,
        spedizione: item.spedizione,
        spedizione_iva_applicata: item.spedizioneIvaApplicata,
        spedizione_iva_percentuale: item.spedizioneIvaPercentuale ?? 22,
        imponibile: totals.imponibile,
        iva_percentuale: totals.ivaPercentualePrevalente ?? item.ivaPercentuale,
        imposta: totals.imposta,
        totale: totaleDocumento,
        totale_fic: xmlTotale,
        totale_scarto: scarto.haRiferimento ? scarto.scarto : 0,
        stato_pagamento: item.statoPagamento,
        natura_documento: "saldo",
        documento_stato: "registrata",
        note: "Registrazione veloce FiC: totale allineato XML, senza catalogo magazzino.",
        totale_manuale: true,
        totale_forzato_at: new Date().toISOString(),
        totale_forzato_by: input.userId,
        created_by: input.userId,
        updated_by: input.userId,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, error: error?.message ?? "Salvataggio ricevuta fallito." };
    }
    const { error: righeErr } = await (
      supabase.from("fatture_ricevute_righe") as unknown as {
        insert: (v: Record<string, unknown>[]) => Promise<{
          error: { message: string } | null;
        }>;
      }
    ).insert(
      righe.map((r, i) => ({
        fattura_id: data.id,
        prodotto_id: null,
        codice: r.codice,
        descrizione: r.descrizione,
        quantita: r.quantita,
        unita_misura: r.unitaMisura || "NR",
        prezzo_unitario: r.prezzoUnitario,
        sconto_percentuale: r.scontoPercentuale,
        iva_percentuale: r.ivaPercentuale ?? item.ivaPercentuale ?? 22,
        importo: r.importo,
        sort_order: i,
        created_by: input.userId,
        updated_by: input.userId,
      }))
    );
    if (righeErr) {
      await (
        supabase.from("fatture_ricevute") as unknown as {
          update: (v: Record<string, unknown>) => {
            eq: (c: string, v: string) => Promise<unknown>;
          };
        }
      )
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: input.userId,
          updated_by: input.userId,
        })
        .eq("id", data.id);
      return { ok: false, error: `Righe: ${righeErr.message}` };
    }
    await writeAuditLog({
      entity_type: "fatture_ricevute",
      entity_id: data.id,
      action: "create_sync_veloce",
      actor_id: input.userId,
      summary: `Registrata ${numeroInterno} (veloce, no catalogo)`,
      payload: {
        fic_id: item.ficId,
        totale: totaleDocumento,
        totale_xml: xmlTotale,
        skip_catalogo: true,
      },
    });
    return { ok: true, id: data.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Registrazione veloce fallita.",
    };
  }
}

export function toAnagraficaCreata(
  tipo: "fornitore" | "cliente",
  a: AnagraficaRisolta
): FattureSyncAnagraficaCreata {
  return {
    tipo,
    ragioneSociale: a.ragioneSociale,
    partitaIva: a.partitaIva,
    codiceTarga: a.codiceTarga,
  };
}

