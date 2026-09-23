import { createClient } from "@/lib/supabase/server";
import { tipoImpegnoDaNote } from "@/lib/amministrazione/scaletta-produzione";
import {
  isImpegnoChiuso,
  isLavorazionePrerequisito,
  parseSchedaEvento,
  parseSchedaStato,
  SCHEDA_COMPLETE_GIORNI,
  type SchedaEventoTipo,
  type SchedaOrdine,
  type SchedaPrerequisito,
  type SchedaTimelineItem,
} from "@/lib/produzione/schede-ordini";

type Db = Awaited<ReturnType<typeof createClient>>;

const SCHEDA_COLS =
  "id, ordine_id, campionatura_id, numero_scheda, cliente, prodotto, entity_tipo, scheda_stato, documento_stato, versione, aperta_at, completata_at, archiviata_at";

export function mapSchedaRow(
  r: Record<string, unknown>,
  extra?: { ultimoTitolo?: string; ultimoAt?: string | null }
): SchedaOrdine {
  return {
    id: String(r.id),
    ordineId: r.ordine_id ? String(r.ordine_id) : null,
    campionaturaId: r.campionatura_id ? String(r.campionatura_id) : null,
    numeroScheda: String(r.numero_scheda ?? ""),
    cliente: String(r.cliente ?? ""),
    prodotto: String(r.prodotto ?? ""),
    entityTipo: r.entity_tipo === "campionatura" ? "campionatura" : "ordine",
    schedaStato: parseSchedaStato(r.scheda_stato),
    documentoStato: String(r.documento_stato ?? "approvato"),
    versione: Number(r.versione ?? 1),
    apertaAt: String(r.aperta_at ?? r.created_at ?? ""),
    completataAt: r.completata_at ? String(r.completata_at) : null,
    archiviataAt: r.archiviata_at ? String(r.archiviata_at) : null,
    ultimoTitolo: extra?.ultimoTitolo ?? "",
    ultimoAt: extra?.ultimoAt ?? null,
  };
}

export async function loadLavorazioniPendenti(
  supabase: Db,
  opts: { ordineId?: string | null; campionaturaId?: string | null }
): Promise<SchedaPrerequisito[]> {
  let q = supabase
    .from("produzione_calendario_impegni")
    .select("id, etichetta, note, esecuzione_stato")
    .is("deleted_at", null);
  if (opts.ordineId) q = q.eq("ordine_id", opts.ordineId);
  else if (opts.campionaturaId) q = q.eq("campionatura_id", opts.campionaturaId);
  else return [];
  const { data } = await q;
  return (data ?? [])
    .map((r) => ({
      id: String(r.id),
      etichetta: String(r.etichetta ?? ""),
      tipo: tipoImpegnoDaNote(String(r.note ?? "")),
      stato: String(r.esecuzione_stato ?? "aperta"),
    }))
    .filter(
      (r) => isLavorazionePrerequisito(r.tipo) && !isImpegnoChiuso(r.stato)
    );
}

export async function appendSchedaTimeline(
  supabase: Db,
  input: {
    schedaId: string;
    eventoTipo: SchedaEventoTipo;
    titolo: string;
    dettaglio?: string;
    impegnoId?: string | null;
    actorId: string;
    eventoAt?: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  await supabase.from("produzione_schede_timeline").insert({
    scheda_id: input.schedaId,
    evento_tipo: input.eventoTipo,
    titolo: input.titolo,
    dettaglio: input.dettaglio ?? "",
    impegno_id: input.impegnoId ?? null,
    actor_id: input.actorId,
    evento_at: input.eventoAt ?? new Date().toISOString(),
    payload: input.payload ?? {},
    created_by: input.actorId,
    updated_by: input.actorId,
  });
}

async function seedTimelineFromAudit(
  supabase: Db,
  schedaId: string,
  entityType: "ordini" | "campionature",
  entityId: string,
  actorId: string
) {
  const { data } = await supabase
    .from("audit_log")
    .select("action, summary, created_at, actor_id, payload")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true })
    .limit(80);
  for (const row of data ?? []) {
    const action = String(row.action ?? "");
    const tipo: SchedaEventoTipo =
      action.includes("scaletta")
        ? "scaletta"
        : action.includes("problema")
          ? "problema"
          : action.includes("pronto")
            ? "pronto_ritiro"
            : action === "create"
              ? "aperta"
              : "nota";
    await appendSchedaTimeline(supabase, {
      schedaId,
      eventoTipo: tipo,
      titolo: String(row.summary ?? action),
      dettaglio: action,
      actorId: row.actor_id ? String(row.actor_id) : actorId,
      eventoAt: row.created_at ? String(row.created_at) : undefined,
      payload: (row.payload ?? {}) as Record<string, unknown>,
    });
  }
}

export async function ensureSchedaOrdine(
  supabase: Db,
  input: {
    ordineId?: string | null;
    campionaturaId?: string | null;
    numero: string;
    cliente: string;
    prodotto: string;
    userId: string;
  }
): Promise<SchedaOrdine | null> {
  const ordineId = input.ordineId || null;
  const campionaturaId = input.campionaturaId || null;
  if (!ordineId && !campionaturaId) return null;

  let existingQ = supabase
    .from("produzione_schede_ordini")
    .select(SCHEDA_COLS)
    .is("deleted_at", null);
  existingQ = ordineId
    ? existingQ.eq("ordine_id", ordineId)
    : existingQ.eq("campionatura_id", campionaturaId);
  const { data: existing } = await existingQ.maybeSingle();
  if (existing) {
    return mapSchedaRow(existing as Record<string, unknown>);
  }

  const row = {
    ordine_id: ordineId,
    campionatura_id: campionaturaId,
    numero_scheda: input.numero.trim() || "SO",
    cliente: input.cliente,
    prodotto: input.prodotto,
    entity_tipo: campionaturaId ? "campionatura" : "ordine",
    scheda_stato: "aperta",
    documento_stato: "approvato",
    versione: 1,
    created_by: input.userId,
    updated_by: input.userId,
  };
  const { data, error } = await supabase
    .from("produzione_schede_ordini")
    .insert(row)
    .select(SCHEDA_COLS)
    .maybeSingle();
  if (error || !data) {
    const { data: again } = await existingQ.maybeSingle();
    return again ? mapSchedaRow(again as Record<string, unknown>) : null;
  }
  const scheda = mapSchedaRow(data as Record<string, unknown>);
  await appendSchedaTimeline(supabase, {
    schedaId: scheda.id,
    eventoTipo: "aperta",
    titolo: `Scheda aperta · ${scheda.numeroScheda}`,
    dettaglio: campionaturaId ? "Campionatura" : "Ordine",
    actorId: input.userId,
  });
  await seedTimelineFromAudit(
    supabase,
    scheda.id,
    campionaturaId ? "campionature" : "ordini",
    campionaturaId || ordineId || "",
    input.userId
  );
  return scheda;
}

export async function archiveScalettaImpegno(
  supabase: Db,
  impegnoId: string,
  userId: string
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("produzione_calendario_impegni")
    .update({
      archiviata_at: now,
      archiviata_by: userId,
      updated_by: userId,
    })
    .eq("id", impegnoId)
    .is("deleted_at", null)
    .is("archiviata_at", null);
}

export async function archiviaImpegniGiaCompletati(
  supabase: Db,
  userId: string
): Promise<void> {
  const { data } = await supabase
    .from("produzione_calendario_impegni")
    .select("id, note, esecuzione_stato")
    .is("deleted_at", null)
    .is("archiviata_at", null)
    .in("esecuzione_stato", ["completata", "pronto_ritiro"])
    .limit(400);
  const ids = (data ?? [])
    .filter((r) => {
      const tipo = tipoImpegnoDaNote(String(r.note ?? ""));
      return (
        isLavorazionePrerequisito(tipo) ||
        tipo === "attivita" ||
        tipo === "confezionamento" ||
        tipo === "altro"
      );
    })
    .map((r) => String(r.id));
  if (!ids.length) return;
  const now = new Date().toISOString();
  await supabase
    .from("produzione_calendario_impegni")
    .update({
      archiviata_at: now,
      archiviata_by: userId,
      updated_by: userId,
    })
    .in("id", ids)
    .is("archiviata_at", null);
}

export async function syncSchedaDopoEsito(
  supabase: Db,
  input: {
    ordineId?: string | null;
    campionaturaId?: string | null;
    numero: string;
    cliente: string;
    prodotto: string;
    userId: string;
    impegnoId: string;
    etichetta: string;
    tipo: string;
    modo: "completa" | "problema" | "pronto_ritiro";
    nota: string;
  }
): Promise<SchedaOrdine | null> {
  const scheda = await ensureSchedaOrdine(supabase, {
    ordineId: input.ordineId,
    campionaturaId: input.campionaturaId,
    numero: input.numero,
    cliente: input.cliente,
    prodotto: input.prodotto,
    userId: input.userId,
  });
  if (!scheda) return null;

  const eventoTipo: SchedaEventoTipo =
    input.modo === "problema"
      ? "problema"
      : input.modo === "pronto_ritiro"
        ? "pronto_ritiro"
        : input.tipo === "confezionamento"
          ? "confezionamento"
          : input.tipo === "trasformazione"
            ? "trasformazione"
            : input.tipo === "attivita"
              ? "attivita"
              : "lavorazione";

  await appendSchedaTimeline(supabase, {
    schedaId: scheda.id,
    eventoTipo,
    titolo:
      input.modo === "problema"
        ? `Problema · ${input.etichetta}`
        : input.modo === "pronto_ritiro"
          ? `Pronto per il ritiro · ${input.etichetta}`
          : `${input.etichetta} completata`,
    dettaglio: input.nota,
    impegnoId: input.impegnoId,
    actorId: input.userId,
    payload: { modo: input.modo, tipo: input.tipo },
  });

  if (input.modo !== "problema") {
    await archiveScalettaImpegno(supabase, input.impegnoId, input.userId);
  }

  let restQ = supabase
    .from("produzione_calendario_impegni")
    .select("id, note, esecuzione_stato")
    .is("deleted_at", null);
  restQ = input.ordineId
    ? restQ.eq("ordine_id", input.ordineId)
    : restQ.eq("campionatura_id", input.campionaturaId);
  const { data: rest } = await restQ;
  const aperti = (rest ?? []).filter(
    (r) => !isImpegnoChiuso(String(r.esecuzione_stato ?? "aperta"))
  );
  if (aperti.length === 0 && scheda.schedaStato === "aperta") {
    const now = new Date().toISOString();
    await supabase
      .from("produzione_schede_ordini")
      .update({
        scheda_stato: "completa",
        documento_stato: "approvato",
        completata_at: now,
        completata_by: input.userId,
        updated_by: input.userId,
        versione: scheda.versione + 1,
      })
      .eq("id", scheda.id)
      .is("deleted_at", null);
    await appendSchedaTimeline(supabase, {
      schedaId: scheda.id,
      eventoTipo: "completa",
      titolo: `Scheda completata · ${scheda.numeroScheda}`,
      dettaglio: "Tutte le lavorazioni e il confezionamento sono chiusi.",
      actorId: input.userId,
    });
    return { ...scheda, schedaStato: "completa", completataAt: now };
  }
  return scheda;
}

export async function trasferisciSchedeCompleteScadute(
  supabase: Db,
  userId: string
): Promise<number> {
  const limite = new Date(
    Date.now() - SCHEDA_COMPLETE_GIORNI * 86_400_000
  ).toISOString();
  const { data } = await supabase
    .from("produzione_schede_ordini")
    .select("id, numero_scheda, versione")
    .eq("scheda_stato", "completa")
    .is("deleted_at", null)
    .lt("completata_at", limite)
    .limit(200);
  if (!data?.length) return 0;
  const now = new Date().toISOString();
  for (const row of data) {
    await supabase
      .from("produzione_schede_ordini")
      .update({
        scheda_stato: "archiviata",
        documento_stato: "chiuso",
        archiviata_at: now,
        archiviata_by: userId,
        updated_by: userId,
        versione: Number(row.versione ?? 1) + 1,
      })
      .eq("id", row.id);
    await appendSchedaTimeline(supabase, {
      schedaId: String(row.id),
      eventoTipo: "archivio",
      titolo: `Trasferita in archivio · ${String(row.numero_scheda ?? "")}`,
      dettaglio: `Complete da più di ${SCHEDA_COMPLETE_GIORNI} giorni.`,
      actorId: userId,
    });
  }
  return data.length;
}

export async function backfillSchedeDaScaletta(
  supabase: Db,
  userId: string
): Promise<void> {
  const { data: ords } = await supabase
    .from("ordini")
    .select("id, numero_interno, cliente_ragione_sociale")
    .eq("stato", "in_scaletta")
    .is("deleted_at", null)
    .limit(80);
  for (const o of ords ?? []) {
    const { data: riga } = await supabase
      .from("ordini_righe")
      .select("prodotto_codice")
      .eq("ordine_id", o.id)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    await ensureSchedaOrdine(supabase, {
      ordineId: String(o.id),
      numero: String(o.numero_interno ?? ""),
      cliente: String(o.cliente_ragione_sociale ?? ""),
      prodotto: String(riga?.prodotto_codice ?? ""),
      userId,
    });
  }
  const { data: camps } = await supabase
    .from("campionature")
    .select("id, numero_interno, cliente_ragione_sociale")
    .eq("stato", "processata")
    .is("deleted_at", null)
    .limit(80);
  for (const c of camps ?? []) {
    const { data: riga } = await supabase
      .from("campionature_righe")
      .select("prodotto_codice")
      .eq("campionatura_id", c.id)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    await ensureSchedaOrdine(supabase, {
      campionaturaId: String(c.id),
      numero: String(c.numero_interno ?? ""),
      cliente: String(c.cliente_ragione_sociale ?? ""),
      prodotto: String(riga?.prodotto_codice ?? ""),
      userId,
    });
  }
}

export async function listSchedeByStato(
  supabase: Db,
  stato: "aperta" | "completa" | "archiviata"
): Promise<SchedaOrdine[]> {
  const { data, error } = await supabase
    .from("produzione_schede_ordini")
    .select(SCHEDA_COLS)
    .eq("scheda_stato", stato)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(400);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((r) => String(r.id));
  const lastBy = new Map<string, { titolo: string; at: string }>();
  if (ids.length) {
    const { data: evs } = await supabase
      .from("produzione_schede_timeline")
      .select("scheda_id, titolo, evento_at")
      .in("scheda_id", ids)
      .order("evento_at", { ascending: false });
    for (const e of evs ?? []) {
      const sid = String(e.scheda_id);
      if (!lastBy.has(sid)) {
        lastBy.set(sid, {
          titolo: String(e.titolo ?? ""),
          at: String(e.evento_at ?? ""),
        });
      }
    }
  }
  return (data ?? []).map((r) => {
    const last = lastBy.get(String(r.id));
    return mapSchedaRow(r as Record<string, unknown>, {
      ultimoTitolo: last?.titolo ?? "",
      ultimoAt: last?.at ?? null,
    });
  });
}

export async function loadSchedaDettaglio(
  supabase: Db,
  schedaId: string
): Promise<{ scheda: SchedaOrdine; timeline: SchedaTimelineItem[] } | null> {
  const { data, error } = await supabase
    .from("produzione_schede_ordini")
    .select(SCHEDA_COLS)
    .eq("id", schedaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const { data: evs } = await supabase
    .from("produzione_schede_timeline")
    .select("id, evento_at, evento_tipo, titolo, dettaglio, actor_id, impegno_id")
    .eq("scheda_id", schedaId)
    .order("evento_at", { ascending: true });
  const actorIds = [
    ...new Set(
      (evs ?? []).map((e) => String(e.actor_id ?? "")).filter(Boolean)
    ),
  ];
  const labels = new Map<string, string>();
  if (actorIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, first_name, last_name, email")
      .in("id", actorIds);
    for (const p of profs ?? []) {
      const name =
        String(p.full_name ?? "").trim() ||
        `${String(p.first_name ?? "")} ${String(p.last_name ?? "")}`.trim() ||
        String(p.email ?? "") ||
        "Operatore";
      labels.set(String(p.id), name);
    }
  }
  return {
    scheda: mapSchedaRow(data as Record<string, unknown>),
    timeline: (evs ?? []).map((e) => ({
      id: String(e.id),
      eventoAt: String(e.evento_at ?? ""),
      eventoTipo: parseSchedaEvento(e.evento_tipo),
      titolo: String(e.titolo ?? ""),
      dettaglio: String(e.dettaglio ?? ""),
      actorLabel: e.actor_id
        ? (labels.get(String(e.actor_id)) ?? "Operatore")
        : "Sistema",
      impegnoId: e.impegno_id ? String(e.impegno_id) : null,
    })),
  };
}

export async function findSchedaIdForEntity(
  supabase: Db,
  opts: { ordineId?: string | null; campionaturaId?: string | null }
): Promise<string | null> {
  let q = supabase
    .from("produzione_schede_ordini")
    .select("id")
    .is("deleted_at", null);
  if (opts.ordineId) q = q.eq("ordine_id", opts.ordineId);
  else if (opts.campionaturaId) q = q.eq("campionatura_id", opts.campionaturaId);
  else return null;
  const { data } = await q.maybeSingle();
  return data?.id ? String(data.id) : null;
}
