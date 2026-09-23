import { resolveAnagraficaTwins } from "@/lib/amministrazione/anagrafica-twins";
import {
  cicloStatoCampionatura,
  cicloStatoOrdine,
} from "@/lib/amministrazione/ciclo-stato-ordine";
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

  const statoLabel = labelStatoSchedaTimeline({
    stato: input.stato,
    fromCampionaturaTable: Boolean(input.fromCampionaturaTable),
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
