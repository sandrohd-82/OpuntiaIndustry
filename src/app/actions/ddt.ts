"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  createIssuedDocument,
  fetchFicVatTypes,
  getFicConfig,
  resolveFicVatId,
} from "@/lib/fic";
import {
  ddtEmissioneSchema,
  testoIndirizzo,
  totaliDdt,
  type DdtClienteOption,
  type DdtDocumentoView,
  type DdtRigaView,
} from "@/lib/fiscale/ddt";
import {
  importaDdtDaFattureInCloud,
  prossimoNumeroDdt,
  type DdtSyncEsito,
} from "@/lib/fiscale/ddt-sync";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const DOC_SELECT =
  "id, direzione, fic_id, numero_fic, numero_interno, ragione_sociale, partita_iva, data_documento, causale_trasporto, destinazione, imponibile, imposta, totale, stato, versione, note, pdf_url";

type DocRow = {
  id: string;
  direzione: "emesso" | "ricevuto";
  fic_id: number | null;
  numero_fic: string;
  numero_interno: string;
  ragione_sociale: string;
  partita_iva: string;
  data_documento: string;
  causale_trasporto: string;
  destinazione: string;
  imponibile: number | string;
  imposta: number | string;
  totale: number | string;
  stato: string;
  versione: number;
  note: string;
  pdf_url: string;
};

type RigaRow = {
  id: string;
  ddt_id: string;
  codice: string;
  descrizione: string;
  quantita: number | string;
  prezzo_unitario: number | string;
  sconto_percentuale: number | string;
  iva_percentuale: number | string;
  importo: number | string;
};

function n(value: number | string | null | undefined): number {
  const x = Number(value ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function vista(row: DocRow, righe: DdtRigaView[]): DdtDocumentoView {
  return {
    id: row.id,
    direzione: row.direzione,
    ficId: row.fic_id ? Number(row.fic_id) : null,
    numeroFic: row.numero_fic ?? "",
    numeroInterno: row.numero_interno,
    ragioneSociale: row.ragione_sociale,
    partitaIva: row.partita_iva ?? "",
    dataDocumento: String(row.data_documento).slice(0, 10),
    causale: row.causale_trasporto ?? "",
    destinazione: row.destinazione ?? "",
    imponibile: n(row.imponibile),
    imposta: n(row.imposta),
    totale: n(row.totale),
    stato: row.stato,
    versione: Number(row.versione) || 1,
    note: row.note ?? "",
    pdfUrl: row.pdf_url ?? "",
    righe,
  };
}

export async function listClientiDdtAction(): Promise<
  | { success: true; clienti: DdtClienteOption[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("area-fiscale");
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("clienti")
    .select(
      "id, ragione_sociale, codice_targa, partita_iva, sede_amm_indirizzo, sede_amm_cap, sede_amm_citta, sede_amm_provincia"
    )
    .is("deleted_at", null)
    .order("ragione_sociale", { ascending: true });
  if (error) return { success: false, error: error.message };
  const clienti: DdtClienteOption[] = (data ?? []).map((c) => ({
    id: String(c.id),
    ragioneSociale: String(c.ragione_sociale ?? ""),
    codiceTarga: String(c.codice_targa ?? ""),
    partitaIva: String(c.partita_iva ?? ""),
    destinazione: testoIndirizzo([
      c.sede_amm_indirizzo,
      c.sede_amm_cap,
      c.sede_amm_citta,
      c.sede_amm_provincia,
    ]),
  }));
  return { success: true, clienti };
}

export async function listDdtAction(
  direzione: "emesso" | "ricevuto"
): Promise<
  | { success: true; documenti: DdtDocumentoView[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("area-fiscale");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ddt_documenti")
    .select(DOC_SELECT)
    .eq("direzione", direzione)
    .is("deleted_at", null)
    .order("data_documento", { ascending: false })
    .limit(500);
  if (error) return { success: false, error: error.message };
  const docs = (data ?? []) as DocRow[];
  const ids = docs.map((d) => d.id);
  const righePerDoc = new Map<string, DdtRigaView[]>();
  if (ids.length > 0) {
    const { data: righe, error: righeErr } = await supabase
      .from("ddt_righe")
      .select(
        "id, ddt_id, codice, descrizione, quantita, prezzo_unitario, sconto_percentuale, iva_percentuale, importo, sort_order"
      )
      .in("ddt_id", ids)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true });
    if (righeErr) return { success: false, error: righeErr.message };
    for (const r of (righe ?? []) as RigaRow[]) {
      const list = righePerDoc.get(r.ddt_id) ?? [];
      list.push({
        id: r.id,
        codice: r.codice ?? "",
        descrizione: r.descrizione,
        quantita: n(r.quantita),
        prezzoUnitario: n(r.prezzo_unitario),
        scontoPercentuale: n(r.sconto_percentuale),
        ivaPercentuale: n(r.iva_percentuale),
        importo: n(r.importo),
      });
      righePerDoc.set(r.ddt_id, list);
    }
  }
  return {
    success: true,
    documenti: docs.map((d) => vista(d, righePerDoc.get(d.id) ?? [])),
  };
}

export async function syncDdtAction(): Promise<
  | { success: true; esito: DdtSyncEsito }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("area-fiscale");
  try {
    getFicConfig();
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Configurazione Fatture in Cloud mancante.",
    };
  }
  try {
    const supabase = await createClient();
    const esito = await importaDdtDaFattureInCloud(supabase, auth.userId);
    return { success: true, esito };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Sincronizzazione DDT non riuscita.",
    };
  }
}

export async function creaDdtAction(
  raw: unknown
): Promise<
  | {
      success: true;
      id: string;
      numeroInterno: string;
      numeroFic: string;
      ficId: number;
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const parsedZod = ddtEmissioneSchema.safeParse(raw);
  if (!parsedZod.success) {
    return {
      success: false,
      error: parsedZod.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const parsed = parsedZod.data;
  try {
    getFicConfig();
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Configurazione Fatture in Cloud mancante.",
    };
  }

  const service = createServiceClient();
  const { data: cliente, error: clienteErr } = await service
    .from("clienti")
    .select(
      "id, ragione_sociale, codice_targa, partita_iva, codice_fiscale, is_privato, sede_amm_indirizzo, sede_amm_cap, sede_amm_citta, sede_amm_provincia, sede_amm_nazione, sdi_code, pec, email"
    )
    .eq("id", parsed.clienteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (clienteErr || !cliente) {
    return { success: false, error: clienteErr?.message ?? "Cliente non trovato." };
  }
  if (!cliente.is_privato && !String(cliente.partita_iva ?? "").trim()) {
    return { success: false, error: "Il cliente non ha la partita IVA." };
  }

  const supabase = await createClient();
  let numeroInterno: string;
  try {
    numeroInterno = await prossimoNumeroDdt(
      supabase,
      parsed.dataDocumento,
      String(cliente.codice_targa ?? "")
    );
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Impossibile assegnare il numero DDT.",
    };
  }

  let vatTypes: Awaited<ReturnType<typeof fetchFicVatTypes>> = [];
  try {
    vatTypes = await fetchFicVatTypes();
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error
          ? `Aliquote IVA FiC: ${e.message}`
          : "Impossibile leggere le aliquote IVA da Fatture in Cloud.",
    };
  }

  const totals = totaliDdt(parsed.righe);
  const entity: Record<string, unknown> = {
    name: cliente.ragione_sociale,
    vat_number: cliente.is_privato ? "" : cliente.partita_iva ?? "",
    tax_code: cliente.codice_fiscale ?? "",
    address_street: cliente.sede_amm_indirizzo ?? "",
    address_postal_code: cliente.sede_amm_cap ?? "",
    address_city: cliente.sede_amm_citta ?? "",
    address_province: cliente.sede_amm_provincia ?? "",
    country: cliente.sede_amm_nazione || "Italia",
  };
  if (String(cliente.sdi_code ?? "").trim()) entity.ei_code = String(cliente.sdi_code).trim();
  if (String(cliente.pec ?? "").trim()) entity.certified_email = String(cliente.pec).trim();
  if (String(cliente.email ?? "").trim()) entity.email = String(cliente.email).trim();

  const notes = [parsed.causale, parsed.destinazione, parsed.note]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");

  const payload: Record<string, unknown> = {
    type: "delivery_note",
    entity,
    date: parsed.dataDocumento,
    subject: `DDT ${numeroInterno}`,
    visible_subject: parsed.causale,
    currency: { id: "EUR", exchange_rate: "1.00000", symbol: "€" },
    language: { code: "it", name: "Italiano" },
    e_invoice: false,
    show_payments: false,
    items_list: parsed.righe.map((r) => ({
      code: r.codice,
      name: r.descrizione,
      net_price: r.prezzoUnitario,
      discount: r.scontoPercentuale,
      qty: r.quantita,
      vat: { id: resolveFicVatId(vatTypes, r.ivaPercentuale) },
    })),
    payments_list: [
      {
        amount: totals.totale,
        due_date: parsed.dataDocumento,
        status: "not_paid",
      },
    ],
    ...(notes ? { notes } : {}),
  };

  let created: Awaited<ReturnType<typeof createIssuedDocument>>;
  try {
    created = await createIssuedDocument(payload);
  } catch (e) {
    await writeAuditLog({
      entity_type: "ddt_documenti",
      entity_id: numeroInterno,
      action: "update",
      actor_id: auth.userId,
      summary: `Errore creazione DDT su Fatture in Cloud ${numeroInterno}`,
      payload: { error: e instanceof Error ? e.message : String(e) },
    });
    return {
      success: false,
      error:
        e instanceof Error
          ? e.message
          : "Creazione DDT su Fatture in Cloud non riuscita.",
    };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("ddt_documenti")
    .insert({
      direzione: "emesso",
      fic_id: created.ficId,
      numero_fic: created.number,
      numero_interno: numeroInterno,
      cliente_id: cliente.id,
      ragione_sociale: String(cliente.ragione_sociale ?? ""),
      partita_iva: String(cliente.partita_iva ?? ""),
      data_documento: parsed.dataDocumento,
      causale_trasporto: parsed.causale,
      destinazione: parsed.destinazione,
      imponibile: totals.imponibile,
      imposta: totals.imposta,
      totale: totals.totale,
      stato: "registrato",
      versione: 1,
      note: parsed.note,
      pdf_url: created.pdfUrl,
      raw_data: created.raw,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    return {
      success: false,
      error:
        insErr?.message ??
        `DDT creato su Fatture in Cloud (${created.number}) ma non salvato in locale.`,
    };
  }

  const { error: righeErr } = await supabase.from("ddt_righe").insert(
    parsed.righe.map((r, i) => {
      const base =
        r.quantita * r.prezzoUnitario * (1 - (r.scontoPercentuale || 0) / 100);
      return {
        ddt_id: inserted.id,
        sort_order: i,
        codice: r.codice,
        descrizione: r.descrizione,
        quantita: r.quantita,
        prezzo_unitario: r.prezzoUnitario,
        sconto_percentuale: r.scontoPercentuale,
        iva_percentuale: r.ivaPercentuale,
        importo: Math.round((base + Number.EPSILON) * 100) / 100,
        created_by: auth.userId,
        updated_by: auth.userId,
      };
    })
  );
  if (righeErr) {
    return { success: false, error: righeErr.message };
  }

  await writeAuditLog({
    entity_type: "ddt_documenti",
    entity_id: String(inserted.id),
    action: "create",
    actor_id: auth.userId,
    summary: `DDT ${numeroInterno} registrato su Fatture in Cloud`,
    payload: {
      numeroInterno,
      numeroFic: created.number,
      ficId: created.ficId,
      clienteId: cliente.id,
      totale: totals.totale,
    },
  });

  return {
    success: true,
    id: String(inserted.id),
    numeroInterno,
    numeroFic: created.number,
    ficId: created.ficId,
  };
}
