"use server";

import { resolveAnagraficaTwins } from "@/lib/amministrazione/anagrafica-twins";
import {
  etichettaStatoSchedaAzienda,
  loadUltimoStatoSchede,
} from "@/lib/amministrazione/scheda-timeline-nota";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import {
  requireOrdineProcessAccess,
  requireOrdineReadAccess,
} from "@/lib/auth/ordini-access";
import {
  backfillSchedeDaScaletta,
  ensureSchedaOrdine,
  listSchedeByStato,
  loadSchedaDettaglio,
  loadSchedaSpedizione,
  trasferisciSchedeCompleteScadute,
} from "@/lib/produzione/schede-ordini-store";
import type { SchedaDettaglio, SchedaOrdine } from "@/lib/produzione/schede-ordini";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

export async function listSchedeOrdiniAction(
  vista: "aperte" | "complete" | "archivio"
): Promise<
  | { success: true; schede: SchedaOrdine[] }
  | { success: false; error: string }
> {
  const { auth } = await requireOrdineProcessAccess();
  const parsed = z.enum(["aperte", "complete", "archivio"]).safeParse(vista);
  if (!parsed.success) {
    return { success: false, error: "Vista schede non valida." };
  }
  const supabase = await createClient();
  try {
    await backfillSchedeDaScaletta(supabase, auth.userId);
    if (parsed.data !== "archivio") {
      await trasferisciSchedeCompleteScadute(supabase, auth.userId);
    }
    const stato =
      parsed.data === "aperte"
        ? "aperta"
        : parsed.data === "complete"
          ? "completa"
          : "archiviata";
    const schede = await listSchedeByStato(supabase, stato);
    return { success: true, schede };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Elenco schede non disponibile.",
    };
  }
}

export async function getSchedaOrdineDettaglioAction(
  schedaId: string
): Promise<
  | { success: true; dettaglio: SchedaDettaglio }
  | { success: false; error: string }
> {
  await requireOrdineReadAccess();
  if (!z.string().uuid().safeParse(schedaId).success) {
    return { success: false, error: "Scheda non valida." };
  }
  const supabase = await createClient();
  const det = await loadSchedaDettaglio(supabase, schedaId);
  if (!det) return { success: false, error: "Scheda non trovata." };
  const spedizione = await loadSchedaSpedizione(supabase, det.scheda);
  return { success: true, dettaglio: { ...det, spedizione } };
}

export async function openSchedaFromTimelineAction(input: {
  schedaId?: string | null;
  ordineId?: string | null;
  campionaturaId?: string | null;
}): Promise<{ success: true; schedaId: string } | { success: false; error: string }> {
  const { auth } = await requireOrdineReadAccess();
  if (input.schedaId && z.string().uuid().safeParse(input.schedaId).success) {
    return { success: true, schedaId: input.schedaId };
  }
  const ordineId = input.ordineId || null;
  const campionaturaId = input.campionaturaId || null;
  if (!ordineId && !campionaturaId) {
    return { success: false, error: "Scheda ordine non collegata." };
  }
  const service = createServiceClient();
  let numero = "SO";
  let cliente = "";
  const prodotto = "";
  if (ordineId) {
    const { data } = await service
      .from("ordini")
      .select("numero_interno, cliente_ragione_sociale")
      .eq("id", ordineId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return { success: false, error: "Ordine non trovato." };
    numero = String(data.numero_interno ?? "SO");
    cliente = String(data.cliente_ragione_sociale ?? "");
  } else if (campionaturaId) {
    const { data } = await service
      .from("campionature")
      .select("numero_interno, cliente_ragione_sociale")
      .eq("id", campionaturaId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return { success: false, error: "Campionatura non trovata." };
    numero = String(data.numero_interno ?? "SO");
    cliente = String(data.cliente_ragione_sociale ?? "");
  }
  const scheda = await ensureSchedaOrdine(service, {
    ordineId,
    campionaturaId,
    numero,
    cliente,
    prodotto,
    userId: auth.userId,
  });
  if (!scheda) return { success: false, error: "Scheda ordine non creata." };
  return { success: true, schedaId: scheda.id };
}

export type AziendaSchedaCardItem = {
  key: string;
  schedaId: string | null;
  ordineId?: string;
  campionaturaId?: string;
  numero: string;
  statoLabel: string;
  kind: "ordine" | "campionatura";
  statoDb?: string;
};

/** Schede ordine/campionatura visibili sulla scheda cliente o possibile cliente. */
export async function listAziendaSchedeCardAction(input: {
  ownerKind: "cliente" | "cliente_possibile";
  ownerId: string;
}): Promise<
  | { success: true; items: AziendaSchedaCardItem[] }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["amministrazione", "commerciale"]);
  if (!z.string().uuid().safeParse(input.ownerId).success) {
    return { success: false, error: "Scheda non valida." };
  }
  const service = createServiceClient();
  const twins = await resolveAnagraficaTwins(
    service,
    input.ownerKind,
    input.ownerId
  );
  const byCamp = new Map<string, AziendaSchedaCardItem>();
  const byOrd = new Map<string, AziendaSchedaCardItem>();

  async function loadCamps(col: "cliente_id" | "cliente_possibile_id", ids: string[]) {
    if (!ids.length) return;
    const { data } = await service
      .from("campionature")
      .select("id, numero_interno, stato")
      .in(col, ids)
      .is("deleted_at", null)
      .limit(200);
    for (const r of data ?? []) {
      const id = String(r.id);
      byCamp.set(id, {
        key: `camp:${id}`,
        schedaId: null,
        campionaturaId: id,
        numero: String(r.numero_interno ?? "").trim() || "Campionatura",
        statoLabel: String(r.stato ?? ""),
        statoDb: String(r.stato ?? ""),
        kind: "campionatura",
      });
    }
  }
  async function loadOrdini(col: "cliente_id" | "cliente_possibile_id", ids: string[]) {
    if (!ids.length) return;
    const { data } = await service
      .from("ordini")
      .select("id, numero_interno, stato, tipo")
      .in(col, ids)
      .is("deleted_at", null)
      .limit(200);
    for (const r of data ?? []) {
      const id = String(r.id);
      const isCamp = String(r.tipo ?? "") === "campionatura";
      byOrd.set(id, {
        key: `ord:${id}`,
        schedaId: null,
        ordineId: id,
        numero: String(r.numero_interno ?? "").trim() || "Ordine",
        statoLabel: String(r.stato ?? ""),
        statoDb: String(r.stato ?? ""),
        kind: isCamp ? "campionatura" : "ordine",
      });
    }
  }

  await loadCamps("cliente_id", twins.clienteIds);
  await loadCamps("cliente_possibile_id", twins.possibileIds);
  await loadOrdini("cliente_id", twins.clienteIds);
  await loadOrdini("cliente_possibile_id", twins.possibileIds);

  const nome = twins.ragioneSociale.trim();
  if (nome) {
    const [{ data: campsNome }, { data: ordNome }] = await Promise.all([
      service
        .from("campionature")
        .select("id, numero_interno, stato")
        .ilike("cliente_ragione_sociale", nome)
        .is("deleted_at", null)
        .limit(200),
      service
        .from("ordini")
        .select("id, numero_interno, stato, tipo")
        .ilike("cliente_ragione_sociale", nome)
        .is("deleted_at", null)
        .limit(200),
    ]);
    for (const r of campsNome ?? []) {
      const id = String(r.id);
      if (byCamp.has(id)) continue;
      byCamp.set(id, {
        key: `camp:${id}`,
        schedaId: null,
        campionaturaId: id,
        numero: String(r.numero_interno ?? "").trim() || "Campionatura",
        statoLabel: String(r.stato ?? ""),
        statoDb: String(r.stato ?? ""),
        kind: "campionatura",
      });
    }
    for (const r of ordNome ?? []) {
      const id = String(r.id);
      if (byOrd.has(id)) continue;
      const isCamp = String(r.tipo ?? "") === "campionatura";
      byOrd.set(id, {
        key: `ord:${id}`,
        schedaId: null,
        ordineId: id,
        numero: String(r.numero_interno ?? "").trim() || "Ordine",
        statoLabel: String(r.stato ?? ""),
        statoDb: String(r.stato ?? ""),
        kind: isCamp ? "campionatura" : "ordine",
      });
    }
  }

  const campIds = [...byCamp.keys()];
  const ordineIds = [...byOrd.keys()];
  if (campIds.length || ordineIds.length) {
    let schedeQ = service
      .from("produzione_schede_ordini")
      .select("id, ordine_id, campionatura_id, cliente")
      .is("deleted_at", null)
      .limit(400);
    if (campIds.length && ordineIds.length) {
      schedeQ = schedeQ.or(
        `ordine_id.in.(${ordineIds.join(",")}),campionatura_id.in.(${campIds.join(",")})`
      );
    } else if (ordineIds.length) {
      schedeQ = schedeQ.in("ordine_id", ordineIds);
    } else {
      schedeQ = schedeQ.in("campionatura_id", campIds);
    }
    const { data: schede } = await schedeQ;
    for (const s of schede ?? []) {
      if (s.campionatura_id && byCamp.has(String(s.campionatura_id))) {
        const row = byCamp.get(String(s.campionatura_id));
        if (row) row.schedaId = String(s.id);
      }
      if (s.ordine_id && byOrd.has(String(s.ordine_id))) {
        const row = byOrd.get(String(s.ordine_id));
        if (row) row.schedaId = String(s.id);
      }
    }
    if (nome) {
      const { data: schedeNome } = await service
        .from("produzione_schede_ordini")
        .select("id, ordine_id, campionatura_id, numero_scheda, cliente")
        .ilike("cliente", nome)
        .is("deleted_at", null)
        .limit(200);
      for (const s of schedeNome ?? []) {
        const campId = s.campionatura_id ? String(s.campionatura_id) : "";
        const ordId = s.ordine_id ? String(s.ordine_id) : "";
        if (campId && !byCamp.has(campId)) {
          byCamp.set(campId, {
            key: `camp:${campId}`,
            schedaId: String(s.id),
            campionaturaId: campId,
            numero: String(s.numero_scheda ?? "").trim() || "Campionatura",
            statoLabel: "Scheda ordine",
            kind: "campionatura",
          });
        } else if (campId && byCamp.get(campId)) {
          byCamp.get(campId)!.schedaId = String(s.id);
        }
        if (ordId && !byOrd.has(ordId) && !campId) {
          byOrd.set(ordId, {
            key: `ord:${ordId}`,
            schedaId: String(s.id),
            ordineId: ordId,
            numero: String(s.numero_scheda ?? "").trim() || "Ordine",
            statoLabel: "Scheda ordine",
            kind: "ordine",
          });
        } else if (ordId && byOrd.get(ordId)) {
          byOrd.get(ordId)!.schedaId = String(s.id);
        }
      }
    }
  }

  const items = [...byCamp.values(), ...byOrd.values()].sort((a, b) =>
    a.numero.localeCompare(b.numero, "it")
  );
  const extra = await loadUltimoStatoSchede({
    service,
    schedaIds: items.map((i) => i.schedaId || "").filter(Boolean),
    ordineIds: items.map((i) => i.ordineId || "").filter(Boolean),
    campionaturaIds: items.map((i) => i.campionaturaId || "").filter(Boolean),
  });
  for (const item of items) {
    const last = item.schedaId
      ? extra.lastByScheda.get(item.schedaId)
      : undefined;
    const ship = extra.shipByEntity.get(
      item.ordineId
        ? `ordine:${item.ordineId}`
        : item.campionaturaId
          ? `campionatura:${item.campionaturaId}`
          : ""
    );
    item.statoLabel = etichettaStatoSchedaAzienda({
      stato: item.statoDb || item.statoLabel,
      fromCampionatura: item.kind === "campionatura",
      lastEventTipo: last?.tipo,
      lastEventAt: last?.at,
      consegnataAt: item.schedaId
        ? extra.consegnaByScheda.get(item.schedaId)
        : undefined,
      shippingStatus: ship?.status,
      shippingAt: ship?.at,
    });
  }
  return { success: true, items };
}
