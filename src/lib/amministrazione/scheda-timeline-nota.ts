import { resolveAnagraficaTwins } from "@/lib/amministrazione/anagrafica-twins";
import {
  cicloStatoCampionatura,
  cicloStatoOrdine,
} from "@/lib/amministrazione/ciclo-stato-ordine";
import {
  SCHEDA_EVENTO_LABEL,
  type SchedaEventoTipo,
} from "@/lib/produzione/schede-ordini";
import { ensureSchedaOrdine } from "@/lib/produzione/schede-ordini-store";
import { createServiceClient } from "@/lib/supabase/server";
import type { CampionaturaStatoDb, OrdineStato } from "@/types/database";

export const SCHEDA_ORDINE_NOTA_TITOLO = "Scheda ordine creata";

export function isSchedaOrdineNotaTitolo(titolo: string): boolean {
  return titolo.trim().toLowerCase() === SCHEDA_ORDINE_NOTA_TITOLO.toLowerCase();
}

export function labelStatoSchedaTimeline(input: {
  stato: string;
  fromCampionaturaTable: boolean;
}): string {
  if (input.fromCampionaturaTable) {
    return cicloStatoCampionatura(input.stato as CampionaturaStatoDb).label;
  }
  return cicloStatoOrdine(input.stato as OrdineStato).label;
}

export function formatDataIt(raw?: string | null): string {
  if (!raw) return "--/--/----";
  const iso = raw.length === 10 ? `${raw}T12:00:00` : raw;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--/--/----";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function isStatoConsegnato(stato?: string | null): boolean {
  const s = String(stato ?? "").trim().toLowerCase();
  return (
    s === "consegnata" ||
    s === "consegnato" ||
    s === "evaso" ||
    s === "chiuso"
  );
}

/** Testo dopo «Stato:» sulla timeline azienda (ultimo stato registrato). */
export function etichettaStatoSchedaAzienda(input: {
  stato?: string | null;
  fromCampionatura?: boolean;
  lastEventTipo?: string | null;
  lastEventAt?: string | null;
  consegnataAt?: string | null;
  shippingStatus?: string | null;
  shippingAt?: string | null;
}): string {
  const lastTipo = String(input.lastEventTipo ?? "").trim().toLowerCase();
  const shipping = String(input.shippingStatus ?? "").trim().toLowerCase();
  const consegnato =
    isStatoConsegnato(input.stato) ||
    lastTipo === "consegnata" ||
    lastTipo === "consegnato" ||
    lastTipo === "chiuso" ||
    shipping === "consegnato";
  if (consegnato) {
    const when =
      input.consegnataAt ||
      (lastTipo === "consegnata" || lastTipo === "chiuso"
        ? input.lastEventAt
        : null) ||
      (shipping === "consegnato" ? input.shippingAt : null);
    return `Consegnato in data ${formatDataIt(when)}`;
  }
  if (lastTipo && lastTipo in SCHEDA_EVENTO_LABEL) {
    return SCHEDA_EVENTO_LABEL[lastTipo as SchedaEventoTipo];
  }
  return (
    labelStatoSchedaTimeline({
      stato: String(input.stato ?? ""),
      fromCampionaturaTable: Boolean(input.fromCampionatura),
    }) || "—"
  );
}

export async function loadUltimoStatoSchede(input: {
  service: ReturnType<typeof createServiceClient>;
  schedaIds: string[];
  ordineIds: string[];
  campionaturaIds: string[];
}): Promise<{
  lastByScheda: Map<string, { tipo: string; at: string }>;
  consegnaByScheda: Map<string, string>;
  shipByEntity: Map<string, { status: string; at: string | null }>;
}> {
  const lastByScheda = new Map<string, { tipo: string; at: string }>();
  const consegnaByScheda = new Map<string, string>();
  const shipByEntity = new Map<string, { status: string; at: string | null }>();
  const schedaIds = [...new Set(input.schedaIds.filter(Boolean))];
  if (schedaIds.length) {
    const { data } = await input.service
      .from("produzione_schede_timeline")
      .select("scheda_id, evento_at, evento_tipo")
      .in("scheda_id", schedaIds)
      .order("evento_at", { ascending: false })
      .limit(1200);
    for (const row of data ?? []) {
      const sid = String(row.scheda_id);
      const tipo = String(row.evento_tipo ?? "");
      const at = String(row.evento_at ?? "");
      if (!lastByScheda.has(sid) && tipo && tipo !== "nota") {
        lastByScheda.set(sid, { tipo, at });
      }
      if (
        (tipo === "consegnata" || tipo === "chiuso") &&
        at &&
        !consegnaByScheda.has(sid)
      ) {
        consegnaByScheda.set(sid, at);
      }
    }
  }
  const entityKeys: Array<{ type: string; id: string }> = [
    ...input.ordineIds.map((id) => ({ type: "ordine", id })),
    ...input.campionaturaIds.map((id) => ({ type: "campionatura", id })),
  ].filter((k) => k.id);
  if (entityKeys.length) {
    const ids = [...new Set(entityKeys.map((k) => k.id))];
    const { data } = await input.service
      .from("shipping_trackings")
      .select(
        "entity_type, entity_id, current_status, last_checked_at, updated_at"
      )
      .in("entity_id", ids)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(400);
    for (const row of data ?? []) {
      const key = `${row.entity_type}:${row.entity_id}`;
      if (shipByEntity.has(key)) continue;
      shipByEntity.set(key, {
        status: String(row.current_status ?? ""),
        at:
          (row.last_checked_at as string | null) ||
          (row.updated_at as string | null) ||
          null,
      });
    }
  }
  return { lastByScheda, consegnaByScheda, shipByEntity };
}

export function testoNotaSchedaOrdine(input: {
  numero: string;
  statoLabel: string;
  prodotto?: string;
}): string {
  const bits = [
    input.numero.trim(),
    `Stato: ${input.statoLabel}`,
    input.prodotto?.trim() ? `Prodotto: ${input.prodotto.trim()}` : "",
  ].filter(Boolean);
  return bits.join("\n");
}

export async function syncSchedaOrdineAziendaNota(input: {
  userId: string;
  ordineId?: string | null;
  campionaturaId?: string | null;
  numero: string;
  clienteLabel: string;
  prodotto?: string;
  stato: string;
  fromCampionaturaTable?: boolean;
  clienteId?: string | null;
  possibileClienteId?: string | null;
}): Promise<void> {
  const ordineId = input.ordineId || null;
  const campionaturaId = input.campionaturaId || null;
  if (!ordineId && !campionaturaId) return;

  const service = createServiceClient();
  let clienteId = input.clienteId || null;
  let possibileClienteId = input.possibileClienteId || null;
  if (clienteId || possibileClienteId) {
    const twins = await resolveAnagraficaTwins(
      service,
      clienteId ? "cliente" : "cliente_possibile",
      clienteId || possibileClienteId || ""
    );
    if (!clienteId && twins.clienteIds[0]) clienteId = twins.clienteIds[0];
    if (!possibileClienteId && twins.possibileIds[0]) {
      possibileClienteId = twins.possibileIds[0];
    }
  }

  const aziendaTipo = clienteId
    ? "cliente"
    : possibileClienteId
      ? "cliente_possibile"
      : null;
  const aziendaId = clienteId || possibileClienteId || null;
  if (!aziendaTipo || !aziendaId) return;
  const scheda = await ensureSchedaOrdine(service, {
    ordineId,
    campionaturaId,
    numero: input.numero,
    cliente: input.clienteLabel,
    prodotto: input.prodotto ?? "",
    userId: input.userId,
  });

  const extra = scheda?.id
    ? await loadUltimoStatoSchede({
        service,
        schedaIds: [scheda.id],
        ordineIds: ordineId ? [ordineId] : [],
        campionaturaIds: campionaturaId ? [campionaturaId] : [],
      })
    : null;
  const last = scheda?.id ? extra?.lastByScheda.get(scheda.id) : undefined;
  const ship = extra?.shipByEntity.get(
    ordineId
      ? `ordine:${ordineId}`
      : campionaturaId
        ? `campionatura:${campionaturaId}`
        : ""
  );
  const statoLabel = etichettaStatoSchedaAzienda({
    stato: input.stato,
    fromCampionatura: Boolean(input.fromCampionaturaTable),
    lastEventTipo: last?.tipo,
    lastEventAt: last?.at,
    consegnataAt: scheda?.id
      ? extra?.consegnaByScheda.get(scheda.id)
      : undefined,
    shippingStatus: ship?.status,
    shippingAt: ship?.at,
  });
  const body = testoNotaSchedaOrdine({
    numero: input.numero,
    statoLabel,
    prodotto: input.prodotto,
  });

  let existing: { id: string; versione: number } | null = null;
  if (scheda?.id) {
    const { data } = await service
      .from("pn_note")
      .select("id, versione")
      .eq("linked_scheda_id", scheda.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (data) existing = { id: String(data.id), versione: Number(data.versione ?? 1) };
  }
  if (!existing && ordineId) {
    const { data } = await service
      .from("pn_note")
      .select("id, versione")
      .eq("linked_ordine_id", ordineId)
      .eq("titolo", SCHEDA_ORDINE_NOTA_TITOLO)
      .is("deleted_at", null)
      .maybeSingle();
    if (data) existing = { id: String(data.id), versione: Number(data.versione ?? 1) };
  }
  if (!existing && campionaturaId) {
    const { data } = await service
      .from("pn_note")
      .select("id, versione, titolo")
      .eq("linked_campionatura_id", campionaturaId)
      .eq("titolo", SCHEDA_ORDINE_NOTA_TITOLO)
      .is("deleted_at", null)
      .maybeSingle();
    if (data) existing = { id: String(data.id), versione: Number(data.versione ?? 1) };
  }

  const patch = {
    titolo: SCHEDA_ORDINE_NOTA_TITOLO,
    body,
    body_rich: body,
    entity_type: aziendaTipo,
    entity_id: aziendaId,
    entity_label: input.clienteLabel,
    linked_ordine_id: ordineId,
    linked_campionatura_id: campionaturaId,
    linked_scheda_id: scheda?.id ?? null,
    updated_by: input.userId,
    versione: existing ? existing.versione + 1 : 1,
  };

  if (existing) {
    await service.from("pn_note").update(patch).eq("id", existing.id).is("deleted_at", null);
    return;
  }

  await service.from("pn_note").insert({
    ...patch,
    colore: input.fromCampionaturaTable || !ordineId ? "verde" : "blu",
    created_by: input.userId,
  });
}

/** Aggiorna la nota unica dopo un cambio stato (stesso record). */
export async function syncSchedaNotaByParent(input: {
  userId: string;
  ordineId?: string | null;
  campionaturaId?: string | null;
}): Promise<void> {
  const service = createServiceClient();
  if (input.ordineId) {
    const { data } = await service
      .from("ordini")
      .select(
        "id, numero_interno, stato, tipo, cliente_id, cliente_possibile_id, cliente_ragione_sociale"
      )
      .eq("id", input.ordineId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return;
    await syncSchedaOrdineAziendaNota({
      userId: input.userId,
      ordineId: String(data.id),
      numero: String(data.numero_interno ?? ""),
      clienteLabel: String(data.cliente_ragione_sociale ?? ""),
      stato: String(data.stato ?? ""),
      fromCampionaturaTable: false,
      clienteId: data.cliente_id ? String(data.cliente_id) : null,
      possibileClienteId: data.cliente_possibile_id
        ? String(data.cliente_possibile_id)
        : null,
    });
    return;
  }
  if (input.campionaturaId) {
    const { data } = await service
      .from("campionature")
      .select(
        "id, numero_interno, stato, cliente_id, cliente_possibile_id, cliente_ragione_sociale"
      )
      .eq("id", input.campionaturaId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return;
    await syncSchedaOrdineAziendaNota({
      userId: input.userId,
      campionaturaId: String(data.id),
      numero: String(data.numero_interno ?? ""),
      clienteLabel: String(data.cliente_ragione_sociale ?? ""),
      stato: String(data.stato ?? ""),
      fromCampionaturaTable: true,
      clienteId: data.cliente_id ? String(data.cliente_id) : null,
      possibileClienteId: data.cliente_possibile_id
        ? String(data.cliente_possibile_id)
        : null,
    });
  }
}
