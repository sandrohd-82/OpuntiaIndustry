"use server";

import { loadIndirizzoRicezioneMerce } from "@/app/actions/anagrafica-extra";
import { requireOrdineProcessAccess } from "@/lib/auth/ordini-access";
import { writeAuditLog } from "@/lib/audit";
import { labelSede } from "@/lib/impostazioni/sedi";
import {
  parseEsecuzioneStato,
  scalettaEsitoSchema,
  tipoImpegnoDaNote,
  type ScalettaDettaglio,
  type ScalettaDettaglioRiga,
  type ScalettaImpegno,
  type ScalettaSenzaData,
} from "@/lib/amministrazione/scaletta-produzione";
import {
  archiviaImpegniGiaCompletati,
  findSchedaIdForEntity,
  loadLavorazioniPendenti,
  syncSchedaDopoEsito,
} from "@/lib/produzione/schede-ordini-store";
import { createClient } from "@/lib/supabase/server";
import { syncSchedaNotaByParent } from "@/lib/amministrazione/scheda-timeline-nota";
import { z } from "zod";

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  archivio: z.boolean().optional().default(false),
});

export async function listScalettaCalendarioAction(raw: unknown): Promise<
  | {
      success: true;
      impegni: ScalettaImpegno[];
      senzaData: ScalettaSenzaData[];
    }
  | { success: false; error: string }
> {
  const { auth } = await requireOrdineProcessAccess();
  const parsed = rangeSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Intervallo date non valido." };
  }
  const supabase = await createClient();
  const { from, to, archivio } = parsed.data;
  if (!archivio) {
    await archiviaImpegniGiaCompletati(supabase, auth.userId);
  }

  let q = supabase
    .from("produzione_calendario_impegni")
    .select(
      "id, data_giorno, ordine_id, campionatura_id, linea_codice, etichetta, note, esecuzione_stato, problema_note, archiviata_at"
    )
    .is("deleted_at", null)
    .gte("data_giorno", from)
    .lte("data_giorno", to)
    .order("data_giorno", { ascending: true });
  q = archivio ? q.not("archiviata_at", "is", null) : q.is("archiviata_at", null);
  const { data: rows, error } = await q;
  if (error) return { success: false, error: error.message };

  const ordineIds = [
    ...new Set(
      (rows ?? [])
        .map((r) => String(r.ordine_id ?? ""))
        .filter(Boolean)
    ),
  ];
  const campIds = [
    ...new Set(
      (rows ?? [])
        .map((r) => String(r.campionatura_id ?? ""))
        .filter(Boolean)
    ),
  ];

  const ordiniById = new Map<
    string,
    { numero: string; cliente: string; prodotto: string }
  >();
  const campById = new Map<
    string,
    { numero: string; cliente: string; prodotto: string }
  >();

  if (ordineIds.length) {
    const { data: ordini } = await supabase
      .from("ordini")
      .select("id, numero_interno, cliente_ragione_sociale")
      .in("id", ordineIds)
      .is("deleted_at", null);
    const { data: righe } = await supabase
      .from("ordini_righe")
      .select("ordine_id, prodotto_codice")
      .in("ordine_id", ordineIds)
      .order("sort_order", { ascending: true });
    const prodByOrd = new Map<string, string>();
    for (const r of righe ?? []) {
      const oid = String(r.ordine_id);
      if (!prodByOrd.has(oid) && r.prodotto_codice) {
        prodByOrd.set(oid, String(r.prodotto_codice));
      }
    }
    for (const o of ordini ?? []) {
      ordiniById.set(String(o.id), {
        numero: String(o.numero_interno ?? ""),
        cliente: String(o.cliente_ragione_sociale ?? ""),
        prodotto: prodByOrd.get(String(o.id)) ?? "",
      });
    }
  }

  if (campIds.length) {
    const { data: camps } = await supabase
      .from("campionature")
      .select("id, numero_interno, cliente_ragione_sociale")
      .in("id", campIds)
      .is("deleted_at", null);
    const { data: crighe } = await supabase
      .from("campionature_righe")
      .select("campionatura_id, prodotto_codice")
      .in("campionatura_id", campIds)
      .order("sort_order", { ascending: true });
    const prodByCamp = new Map<string, string>();
    for (const r of crighe ?? []) {
      const cid = String(r.campionatura_id);
      if (!prodByCamp.has(cid) && r.prodotto_codice) {
        prodByCamp.set(cid, String(r.prodotto_codice));
      }
    }
    for (const c of camps ?? []) {
      campById.set(String(c.id), {
        numero: String(c.numero_interno ?? ""),
        cliente: String(c.cliente_ragione_sociale ?? ""),
        prodotto: prodByCamp.get(String(c.id)) ?? "",
      });
    }
  }

  const mapped = (rows ?? []).map((r) => {
    const oid = r.ordine_id ? String(r.ordine_id) : "";
    const cid = r.campionatura_id ? String(r.campionatura_id) : "";
    const meta = oid
      ? ordiniById.get(oid)
      : cid
        ? campById.get(cid)
        : undefined;
    const etichetta = String(r.etichetta ?? "");
    return {
      id: String(r.id),
      dataGiorno: String(r.data_giorno),
      tipo: tipoImpegnoDaNote(String(r.note ?? "")),
      etichetta,
      numeroInterno: meta?.numero || etichetta.split(" · ")[0] || "—",
      cliente: meta?.cliente ?? "",
      prodotto: meta?.prodotto ?? "",
      entityType: (cid && !oid ? "campionatura" : "ordine") as
        | "ordine"
        | "campionatura",
      entityId: oid || cid,
      lineaCodice: r.linea_codice ? String(r.linea_codice) : null,
      esecuzioneStato: parseEsecuzioneStato(r.esecuzione_stato),
      problemaNote: String(r.problema_note ?? ""),
      confezionamentoBloccato: false,
      archiviata: Boolean(r.archiviata_at),
    };
  });

  const packOrd = [
    ...new Set(
      mapped
        .filter((i) => i.tipo === "confezionamento" && i.entityType === "ordine")
        .map((i) => i.entityId)
        .filter(Boolean)
    ),
  ];
  const packCamp = [
    ...new Set(
      mapped
        .filter(
          (i) => i.tipo === "confezionamento" && i.entityType === "campionatura"
        )
        .map((i) => i.entityId)
        .filter(Boolean)
    ),
  ];
  const blocked = new Set<string>();
  if (packOrd.length || packCamp.length) {
    const sibs: Array<{
      ordine_id?: string | null;
      campionatura_id?: string | null;
      note?: string | null;
      esecuzione_stato?: string | null;
    }> = [];
    if (packOrd.length) {
      const { data } = await supabase
        .from("produzione_calendario_impegni")
        .select("ordine_id, campionatura_id, note, esecuzione_stato")
        .is("deleted_at", null)
        .in("ordine_id", packOrd);
      sibs.push(...(data ?? []));
    }
    if (packCamp.length) {
      const { data } = await supabase
        .from("produzione_calendario_impegni")
        .select("ordine_id, campionatura_id, note, esecuzione_stato")
        .is("deleted_at", null)
        .in("campionatura_id", packCamp);
      sibs.push(...(data ?? []));
    }
    const openByKey = new Set<string>();
    for (const s of sibs ?? []) {
      const tipo = tipoImpegnoDaNote(String(s.note ?? ""));
      const stato = String(s.esecuzione_stato ?? "aperta");
      if (tipo !== "lavorazione" && tipo !== "trasformazione") continue;
      if (stato === "completata" || stato === "pronto_ritiro") continue;
      if (s.ordine_id) openByKey.add(`ordine:${s.ordine_id}`);
      if (s.campionatura_id) openByKey.add(`campionatura:${s.campionatura_id}`);
    }
    for (const i of mapped) {
      if (i.tipo !== "confezionamento") continue;
      if (openByKey.has(`${i.entityType}:${i.entityId}`)) {
        blocked.add(i.id);
      }
    }
  }

  const impegni: ScalettaImpegno[] = mapped.map((i) => ({
    ...i,
    confezionamentoBloccato: blocked.has(i.id),
  }));

  const { data: ordSenza } = await supabase
    .from("ordini")
    .select("id, numero_interno, cliente_ragione_sociale")
    .eq("stato", "in_scaletta")
    .is("deleted_at", null)
    .limit(80);
  const { data: campSenza } = await supabase
    .from("campionature")
    .select("id, numero_interno, cliente_ragione_sociale")
    .eq("stato", "processata")
    .is("deleted_at", null)
    .limit(80);

  const candOrd = (ordSenza ?? []).map((o) => String(o.id));
  const candCamp = (campSenza ?? []).map((c) => String(c.id));
  const linkedOrd = new Set<string>();
  const linkedCamp = new Set<string>();
  if (candOrd.length) {
    const { data: lo } = await supabase
      .from("produzione_calendario_impegni")
      .select("ordine_id")
      .in("ordine_id", candOrd)
      .is("deleted_at", null);
    for (const r of lo ?? []) {
      if (r.ordine_id) linkedOrd.add(String(r.ordine_id));
    }
  }
  if (candCamp.length) {
    const { data: lc } = await supabase
      .from("produzione_calendario_impegni")
      .select("campionatura_id")
      .in("campionatura_id", candCamp)
      .is("deleted_at", null);
    for (const r of lc ?? []) {
      if (r.campionatura_id) linkedCamp.add(String(r.campionatura_id));
    }
  }

  const senzaData: ScalettaSenzaData[] = [];
  for (const o of ordSenza ?? []) {
    if (linkedOrd.has(String(o.id))) continue;
    senzaData.push({
      entityType: "ordine",
      entityId: String(o.id),
      numeroInterno: String(o.numero_interno ?? ""),
      cliente: String(o.cliente_ragione_sociale ?? ""),
      prodotto: "",
    });
  }
  for (const c of campSenza ?? []) {
    if (linkedCamp.has(String(c.id))) continue;
    senzaData.push({
      entityType: "campionatura",
      entityId: String(c.id),
      numeroInterno: String(c.numero_interno ?? ""),
      cliente: String(c.cliente_ragione_sociale ?? ""),
      prodotto: "",
    });
  }

  return { success: true, impegni, senzaData };
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter(Boolean);
}

async function loadSedeLabel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sedeId: string | null | undefined
): Promise<{ id: string; label: string }> {
  if (!sedeId) return { id: "", label: "" };
  const { data } = await supabase
    .from("impostazioni_sedi")
    .select("id, nome, citta, indirizzo")
    .eq("id", sedeId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return { id: sedeId, label: "" };
  return {
    id: String(data.id),
    label: labelSede({
      nome: String(data.nome ?? ""),
      citta: String(data.citta ?? ""),
      indirizzo: String(data.indirizzo ?? ""),
    }),
  };
}

export async function getScalettaImpegnoDettaglioAction(
  impegnoId: string
): Promise<
  | { success: true; dettaglio: ScalettaDettaglio }
  | { success: false; error: string }
> {
  await requireOrdineProcessAccess();
  if (!z.string().uuid().safeParse(impegnoId).success) {
    return { success: false, error: "Impegno non valido." };
  }
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("produzione_calendario_impegni")
    .select(
      "id, data_giorno, ordine_id, campionatura_id, linea_codice, etichetta, note, esecuzione_stato, problema_note, esito_note, eseguita_at, problema_at"
    )
    .eq("id", impegnoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !row) {
    return { success: false, error: error?.message ?? "Riga non trovata." };
  }

  const oid = row.ordine_id ? String(row.ordine_id) : "";
  const cid = row.campionatura_id ? String(row.campionatura_id) : "";
  const tipo = tipoImpegnoDaNote(String(row.note ?? ""));
  const impegno = {
    id: String(row.id),
    dataGiorno: String(row.data_giorno),
    tipo,
    etichetta: String(row.etichetta ?? ""),
    lineaCodice: row.linea_codice ? String(row.linea_codice) : null,
    esecuzioneStato: parseEsecuzioneStato(row.esecuzione_stato),
    problemaNote: String(row.problema_note ?? ""),
    esitoNote: String(row.esito_note ?? ""),
    eseguitaAt: row.eseguita_at ? String(row.eseguita_at) : null,
    problemaAt: row.problema_at ? String(row.problema_at) : null,
  };

  const righe: ScalettaDettaglioRiga[] = [];
  let documento: ScalettaDettaglio["documento"];
  const processazione = {
    dataLavorazione: "",
    dataConfezionamento: "",
    giorniProduzione: [] as string[],
    pack: [] as string[],
    fonte: "",
    extra: [] as string[],
  };

  if (oid) {
    const { data: ord, error: oErr } = await supabase
      .from("ordini")
      .select(
        "id, numero_interno, cliente_ragione_sociale, stato, documento_stato, versione, data_ordine, data_consegna, note, urgente, usa_magazzino, tipo, giorni_produzione, capacita_snapshot, sede_partenza_id, destinatario, indirizzo_spedizione, cliente_id, cliente_possibile_id"
      )
      .eq("id", oid)
      .is("deleted_at", null)
      .maybeSingle();
    if (oErr || !ord) {
      return { success: false, error: oErr?.message ?? "Ordine non trovato." };
    }
    const { data: orighe } = await supabase
      .from("ordini_righe")
      .select(
        "prodotto_codice, prodotto_nome, quantita, unita_misura, lotto_codice"
      )
      .eq("ordine_id", oid)
      .order("sort_order", { ascending: true });
    for (const r of orighe ?? []) {
      righe.push({
        prodottoCodice: String(r.prodotto_codice ?? ""),
        prodottoNome: String(r.prodotto_nome ?? ""),
        quantita: Number(r.quantita ?? 0),
        unitaMisura: String(r.unita_misura ?? ""),
        lottoCodice: String(r.lotto_codice ?? ""),
        processo: "",
        conforme: null,
      });
    }
    const snap = asRecord(ord.capacita_snapshot);
    processazione.giorniProduzione = strList(ord.giorni_produzione).length
      ? strList(ord.giorni_produzione)
      : strList(snap.giorni_produzione);
    processazione.dataLavorazione = processazione.giorniProduzione[0] ?? "";
    processazione.fonte = String(
      snap.approvvigionamento ??
        (ord.usa_magazzino ? "magazzino" : "lavorazione")
    );
    const att = Array.isArray(snap.attivita) ? snap.attivita : [];
    for (const a of att) {
      const o = asRecord(a);
      const lab = [o.codice, o.titolo].filter(Boolean).join(" — ");
      if (lab) processazione.extra.push(String(lab));
    }
    const sede = await loadSedeLabel(
      supabase,
      ord.sede_partenza_id ? String(ord.sede_partenza_id) : null
    );
    let destOrdine = String(ord.destinatario ?? "").trim();
    let indirizzoOrdine = String(ord.indirizzo_spedizione ?? "").trim();
    if (!indirizzoOrdine) {
      const ricezione = await loadIndirizzoRicezioneMerce({
        ownerKind: ord.cliente_id ? "cliente" : "cliente_possibile",
        ownerId: ord.cliente_id
          ? String(ord.cliente_id)
          : ord.cliente_possibile_id
            ? String(ord.cliente_possibile_id)
            : null,
        ragioneSociale: String(ord.cliente_ragione_sociale ?? ""),
      });
      if (ricezione) {
        destOrdine = ricezione.destinatario || destOrdine;
        indirizzoOrdine = ricezione.indirizzo;
      }
    }
    documento = {
      entityType: "ordine",
      entityId: oid,
      numeroInterno: String(ord.numero_interno ?? ""),
      cliente: String(ord.cliente_ragione_sociale ?? ""),
      stato: String(ord.stato ?? ""),
      documentoStato: String(ord.documento_stato ?? ""),
      versione: Number(ord.versione ?? 1),
      dataDocumento: String(ord.data_ordine ?? ""),
      dataConsegna: ord.data_consegna ? String(ord.data_consegna) : null,
      destinatario: destOrdine,
      indirizzo: indirizzoOrdine,
      trackingUrl: "",
      note: String(ord.note ?? ""),
      urgente: Boolean(ord.urgente),
      usaMagazzino: Boolean(ord.usa_magazzino),
      tipo: String(ord.tipo ?? "vendita"),
      sedePartenzaId: sede.id,
      sedePartenzaLabel: sede.label,
    };
  } else if (cid) {
    const { data: camp, error: cErr } = await supabase
      .from("campionature")
      .select(
        "id, numero_interno, cliente_ragione_sociale, stato, documento_stato, versione, data_invio, destinatario, indirizzo_spedizione, tracking_url, note, data_lavorazione, data_confezionamento, produzione_snapshot, sede_partenza_id, cliente_id, cliente_possibile_id"
      )
      .eq("id", cid)
      .is("deleted_at", null)
      .maybeSingle();
    if (cErr || !camp) {
      return {
        success: false,
        error: cErr?.message ?? "Campionatura non trovata.",
      };
    }
    const snap = asRecord(camp.produzione_snapshot);
    const snapRighe = Array.isArray(snap.righe) ? snap.righe : [];
    const { data: crighe } = await supabase
      .from("campionature_righe")
      .select(
        "id, prodotto_codice, prodotto_nome, quantita, unita_misura, lotto_codice"
      )
      .eq("campionatura_id", cid)
      .order("sort_order", { ascending: true });
    for (const r of crighe ?? []) {
      const extra = snapRighe
        .map((x) => asRecord(x))
        .find((x) => String(x.rigaId ?? "") === String(r.id));
      const proc = [extra?.processoCodice, extra?.processoNome]
        .filter(Boolean)
        .join(" — ");
      righe.push({
        prodottoCodice: String(r.prodotto_codice ?? ""),
        prodottoNome: String(r.prodotto_nome ?? ""),
        quantita: Number(r.quantita ?? 0),
        unitaMisura: String(r.unita_misura ?? ""),
        lottoCodice: String(
          extra?.lottoInternoCodice ?? r.lotto_codice ?? ""
        ),
        processo: proc,
        conforme:
          typeof extra?.conforme === "boolean" ? extra.conforme : null,
      });
    }
    const pack = asRecord(snap.pack);
    const packIds = [
      pack.movimentazioneId,
      pack.confezioneId,
      pack.isolamentoId,
    ]
      .map((x) => String(x ?? "").trim())
      .filter(Boolean);
    if (packIds.length) {
      const { data: voci } = await supabase
        .from("imballaggi_voci")
        .select("id, codice, nome, stadio")
        .in("id", packIds)
        .is("deleted_at", null);
      processazione.pack = (voci ?? []).map((v) =>
        [v.stadio, v.codice, v.nome].filter(Boolean).join(" · ")
      );
    }
    processazione.dataLavorazione = String(
      camp.data_lavorazione ?? snap.data_lavorazione ?? ""
    );
    processazione.dataConfezionamento = String(
      camp.data_confezionamento ?? snap.data_confezionamento ?? ""
    );
    processazione.fonte = "magazzino";
    const sede = await loadSedeLabel(
      supabase,
      camp.sede_partenza_id ? String(camp.sede_partenza_id) : null
    );
    let destCamp = String(camp.destinatario ?? "").trim();
    let indirizzoCamp = String(camp.indirizzo_spedizione ?? "").trim();
    if (!indirizzoCamp) {
      const ricezione = await loadIndirizzoRicezioneMerce({
        ownerKind: camp.cliente_id ? "cliente" : "cliente_possibile",
        ownerId: camp.cliente_id
          ? String(camp.cliente_id)
          : camp.cliente_possibile_id
            ? String(camp.cliente_possibile_id)
            : null,
        ragioneSociale: String(camp.cliente_ragione_sociale ?? ""),
      });
      if (ricezione) {
        destCamp = ricezione.destinatario || destCamp;
        indirizzoCamp = ricezione.indirizzo;
      }
    }
    documento = {
      entityType: "campionatura",
      entityId: cid,
      numeroInterno: String(camp.numero_interno ?? ""),
      cliente: String(camp.cliente_ragione_sociale ?? ""),
      stato: String(camp.stato ?? ""),
      documentoStato: String(camp.documento_stato ?? ""),
      versione: Number(camp.versione ?? 1),
      dataDocumento: String(camp.data_invio ?? ""),
      dataConsegna: null,
      destinatario: destCamp,
      indirizzo: indirizzoCamp,
      trackingUrl: String(camp.tracking_url ?? ""),
      note: String(camp.note ?? ""),
      urgente: false,
      usaMagazzino: true,
      tipo: "campionatura",
      sedePartenzaId: sede.id,
      sedePartenzaLabel: sede.label,
    };
  } else {
    return { success: false, error: "Riga senza ordine o campionatura." };
  }

  const pendenti = await loadLavorazioniPendenti(supabase, {
    ordineId: oid || null,
    campionaturaId: cid || null,
  });
  const schedaId = await findSchedaIdForEntity(supabase, {
    ordineId: oid || null,
    campionaturaId: cid || null,
  });

  return {
    success: true,
    dettaglio: {
      impegno,
      documento,
      righe,
      processazione,
      schedaId,
      prerequisiti: {
        confezionamentoBloccato:
          tipo === "confezionamento" && pendenti.length > 0,
        pendenti,
      },
    },
  };
}

export async function registraScalettaEsitoAction(
  raw: unknown
): Promise<
  | { success: true; dettaglio: ScalettaDettaglio }
  | { success: false; error: string }
> {
  const { auth } = await requireOrdineProcessAccess();
  const parsed = scalettaEsitoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const d = parsed.data;
  if (d.modo === "problema" && d.nota.trim().length < 3) {
    return {
      success: false,
      error: "Descrivi il problema riscontrato (almeno 3 caratteri).",
    };
  }

  const supabase = await createClient();
  const { data: existing, error: readErr } = await supabase
    .from("produzione_calendario_impegni")
    .select("id, etichetta, note, esecuzione_stato, ordine_id, campionatura_id")
    .eq("id", d.impegnoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr || !existing) {
    return { success: false, error: readErr?.message ?? "Riga non trovata." };
  }

  const tipo = tipoImpegnoDaNote(String(existing.note ?? ""));
  if (d.modo === "pronto_ritiro" && tipo !== "confezionamento") {
    return {
      success: false,
      error: "Pronto per il ritiro è disponibile solo sul confezionamento.",
    };
  }
  if (
    tipo === "confezionamento" &&
    (d.modo === "completa" || d.modo === "pronto_ritiro")
  ) {
    const pendenti = await loadLavorazioniPendenti(supabase, {
      ordineId: existing.ordine_id ? String(existing.ordine_id) : null,
      campionaturaId: existing.campionatura_id
        ? String(existing.campionatura_id)
        : null,
    });
    if (pendenti.length > 0) {
      return {
        success: false,
        error:
          "Il confezionamento non si può chiudere prima di aver completato tutte le lavorazioni.",
      };
    }
  }

  let sedeId = d.sedePartenzaId ?? null;
  if (d.modo === "pronto_ritiro") {
    const table = existing.ordine_id ? "ordini" : "campionature";
    const parentId = String(existing.ordine_id || existing.campionatura_id);
    const { data: parent } = await supabase
      .from(table)
      .select("sede_partenza_id")
      .eq("id", parentId)
      .maybeSingle();
    sedeId = sedeId || (parent?.sede_partenza_id
      ? String(parent.sede_partenza_id)
      : null);
    if (!sedeId) {
      return {
        success: false,
        error:
          "Per «Pronto per il ritiro» indica il luogo di partenza (Impostazioni > Sedi).",
      };
    }
    const sede = await loadSedeLabel(supabase, sedeId);
    if (!sede.label) {
      return {
        success: false,
        error: "Sede di partenza non trovata. Configurala in Impostazioni > Sedi.",
      };
    }
    await supabase
      .from(table)
      .update({
        sede_partenza_id: sedeId,
        stato: "pronto_spedizione",
        updated_by: auth.userId,
      })
      .eq("id", parentId)
      .is("deleted_at", null);
    await syncSchedaNotaByParent({
      userId: auth.userId,
      ordineId: existing.ordine_id ? parentId : null,
      campionaturaId: existing.campionatura_id ? parentId : null,
    });
    await writeAuditLog({
      entity_type: table,
      entity_id: parentId,
      action: "status_change",
      actor_id: auth.userId,
      summary: `Pronto per il ritiro · partenza ${sede.label}`,
      payload: {
        stato_a: "pronto_spedizione",
        sede_partenza_id: sedeId,
        impegno_id: d.impegnoId,
      },
    });
  }

  const now = new Date().toISOString();
  const patch =
    d.modo === "problema"
      ? {
          esecuzione_stato: "problema",
          problema_note: d.nota.trim(),
          problema_at: now,
          problema_by: auth.userId,
          updated_by: auth.userId,
        }
      : {
          esecuzione_stato:
            d.modo === "pronto_ritiro" ? "pronto_ritiro" : "completata",
          esito_note:
            d.modo === "pronto_ritiro"
              ? d.nota.trim() || "Pronto per il ritiro"
              : d.nota.trim(),
          eseguita_at: now,
          eseguita_by: auth.userId,
          updated_by: auth.userId,
        };

  const { error: updErr } = await supabase
    .from("produzione_calendario_impegni")
    .update(patch)
    .eq("id", d.impegnoId)
    .is("deleted_at", null);
  if (updErr) return { success: false, error: updErr.message };

  await writeAuditLog({
    entity_type: "produzione_calendario_impegni",
    entity_id: d.impegnoId,
    action:
      d.modo === "problema"
        ? "scaletta_problema"
        : d.modo === "pronto_ritiro"
          ? "scaletta_pronto_ritiro"
          : "scaletta_completa",
    actor_id: auth.userId,
    summary:
      d.modo === "problema"
        ? `Problema in scaletta: ${existing.etichetta ?? d.impegnoId}`
        : d.modo === "pronto_ritiro"
          ? `Pronto per il ritiro: ${existing.etichetta ?? d.impegnoId}`
          : `Lavorazione completata: ${existing.etichetta ?? d.impegnoId}`,
    payload: {
      modo: d.modo,
      stato_da: existing.esecuzione_stato,
      stato_a:
        d.modo === "problema"
          ? "problema"
          : d.modo === "pronto_ritiro"
            ? "pronto_ritiro"
            : "completata",
      nota: d.nota.trim() || null,
      sede_partenza_id: sedeId,
      ordine_id: existing.ordine_id,
      campionatura_id: existing.campionatura_id,
    },
  });

  const det = await getScalettaImpegnoDettaglioAction(d.impegnoId);
  if (det.success) {
    await syncSchedaDopoEsito(supabase, {
      ordineId: existing.ordine_id ? String(existing.ordine_id) : null,
      campionaturaId: existing.campionatura_id
        ? String(existing.campionatura_id)
        : null,
      numero: det.dettaglio.documento.numeroInterno,
      cliente: det.dettaglio.documento.cliente,
      prodotto: det.dettaglio.righe[0]?.prodottoCodice ?? "",
      userId: auth.userId,
      impegnoId: d.impegnoId,
      etichetta: String(existing.etichetta ?? ""),
      tipo,
      modo: d.modo,
      nota: d.nota.trim(),
    });
    return getScalettaImpegnoDettaglioAction(d.impegnoId);
  }
  return det;
}
