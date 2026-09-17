import type { PnAvviso, PnAvvisoUnita } from "@/lib/promemorie-e-note/types";
import { createServiceClient } from "@/lib/supabase/server";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export function computeNotifyAt(
  dueAtIso: string,
  valore: number,
  unita: PnAvvisoUnita
): string {
  const due = new Date(dueAtIso);
  const ms =
    unita === "minuti"
      ? valore * 60_000
      : unita === "ore"
        ? valore * 3_600_000
        : valore * 86_400_000;
  return new Date(due.getTime() - ms).toISOString();
}

export function mapAvvisoRow(r: Record<string, unknown>): PnAvviso {
  return {
    id: String(r.id),
    offsetValore: Number(r.offset_valore),
    offsetUnita: r.offset_unita as PnAvvisoUnita,
    notifyAt: r.notify_at ? String(r.notify_at) : undefined,
    sentAt: r.sent_at ? String(r.sent_at) : null,
    destinatarioId: r.destinatario_id ? String(r.destinatario_id) : undefined,
  };
}

export async function loadAvvisiByOrigineIds(
  supabase: Supabase,
  origineTipo: "attivita" | "promemoria",
  ids: string[],
  destinatarioId?: string
): Promise<Map<string, PnAvviso[]>> {
  const map = new Map<string, PnAvviso[]>();
  if (!ids.length) return map;
  let q = supabase
    .from("pn_evento_avvisi")
    .select(
      "id, origine_id, offset_valore, offset_unita, notify_at, sent_at, destinatario_id"
    )
    .eq("origine_tipo", origineTipo)
    .in("origine_id", ids)
    .is("deleted_at", null)
    .order("notify_at", { ascending: true });
  if (destinatarioId) {
    q = q.eq("destinatario_id", destinatarioId);
  }
  const { data } = await q;
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const oid = String(r.origine_id);
    const list = map.get(oid) ?? [];
    list.push(mapAvvisoRow(r));
    map.set(oid, list);
  }
  return map;
}

export async function persistEventoAvvisi(input: {
  supabase: Supabase;
  userId: string;
  destinatarioId?: string;
  origineTipo: "attivita" | "promemoria";
  origineId: string;
  dueAt: string;
  avvisi: Array<{ offsetValore: number; offsetUnita: PnAvvisoUnita }>;
}): Promise<PnAvviso[]> {
  const destinatarioId = input.destinatarioId || input.userId;
  const wanted = dedupeAvvisi(input.avvisi).map((a) => ({
    ...a,
    notifyAt: computeNotifyAt(input.dueAt, a.offsetValore, a.offsetUnita),
  }));
  const { data: existing } = await input.supabase
    .from("pn_evento_avvisi")
    .select("id, offset_valore, offset_unita, notify_at, sent_at, destinatario_id")
    .eq("origine_tipo", input.origineTipo)
    .eq("origine_id", input.origineId)
    .eq("destinatario_id", destinatarioId)
    .is("deleted_at", null);
  const open = (existing ?? []) as Array<{
    id: string;
    offset_valore: number;
    offset_unita: string;
    notify_at: string;
    sent_at: string | null;
  }>;
  const wantedKeys = new Set(
    wanted.map((a) => `${a.offsetValore}:${a.offsetUnita}`)
  );
  const now = new Date().toISOString();
  const toClose = open.filter(
    (r) => !wantedKeys.has(`${r.offset_valore}:${r.offset_unita}`)
  );
  if (toClose.length) {
    await input.supabase
      .from("pn_evento_avvisi")
      .update({
        deleted_at: now,
        deleted_by: input.userId,
        updated_by: input.userId,
      })
      .in(
        "id",
        toClose.map((r) => r.id)
      );
  }
  for (const w of wanted) {
    const key = `${w.offsetValore}:${w.offsetUnita}`;
    const found = open.find(
      (r) => `${r.offset_valore}:${r.offset_unita}` === key
    );
    if (found) {
      const notifyChanged = found.notify_at !== w.notifyAt;
      const resetSent =
        notifyChanged && new Date(w.notifyAt) > new Date();
      await input.supabase
        .from("pn_evento_avvisi")
        .update({
          notify_at: w.notifyAt,
          sent_at: resetSent ? null : found.sent_at,
          sent_by: resetSent ? null : undefined,
          versione: 1,
          updated_by: input.userId,
        })
        .eq("id", found.id)
        .eq("destinatario_id", destinatarioId);
    } else {
      await input.supabase.from("pn_evento_avvisi").insert({
        origine_tipo: input.origineTipo,
        origine_id: input.origineId,
        destinatario_id: destinatarioId,
        offset_valore: w.offsetValore,
        offset_unita: w.offsetUnita,
        notify_at: w.notifyAt,
        created_by: input.userId,
        updated_by: input.userId,
      });
    }
  }
  const loaded = await loadAvvisiByOrigineIds(
    input.supabase,
    input.origineTipo,
    [input.origineId],
    destinatarioId
  );
  return loaded.get(input.origineId) ?? wanted;
}

/** Aggiorna solo l’orario delle sveglie già scelte, senza toccare gli offset di altri operatori. */
export async function ricalcolaNotifyAtPerOrigine(input: {
  origineTipo: "attivita" | "promemoria";
  origineId: string;
  dueAt: string;
  actorId: string;
}): Promise<void> {
  const service = createServiceClient();
  const { data } = await service
    .from("pn_evento_avvisi")
    .select("id, offset_valore, offset_unita, notify_at, sent_at")
    .eq("origine_tipo", input.origineTipo)
    .eq("origine_id", input.origineId)
    .is("deleted_at", null);
  const now = new Date();
  for (const raw of data ?? []) {
    const r = raw as {
      id: string;
      offset_valore: number;
      offset_unita: PnAvvisoUnita;
      notify_at: string;
      sent_at: string | null;
    };
    const next = computeNotifyAt(
      input.dueAt,
      Number(r.offset_valore),
      r.offset_unita
    );
    if (next === r.notify_at) continue;
    const resetSent = new Date(next) > now;
    await service
      .from("pn_evento_avvisi")
      .update({
        notify_at: next,
        sent_at: resetSent ? null : r.sent_at,
        sent_by: resetSent ? null : undefined,
        updated_by: input.actorId,
      })
      .eq("id", r.id);
  }
}

function dedupeAvvisi(
  avvisi: Array<{ offsetValore: number; offsetUnita: PnAvvisoUnita }>
) {
  const seen = new Set<string>();
  const out: Array<{ offsetValore: number; offsetUnita: PnAvvisoUnita }> = [];
  for (const a of avvisi) {
    const key = `${a.offsetValore}:${a.offsetUnita}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      offsetValore: Number(a.offsetValore),
      offsetUnita: a.offsetUnita,
    });
  }
  return out;
}
