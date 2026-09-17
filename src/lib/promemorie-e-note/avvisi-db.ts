import type { PnAvviso, PnAvvisoUnita } from "@/lib/promemorie-e-note/types";
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
  };
}

export async function loadAvvisiByOrigineIds(
  supabase: Supabase,
  origineTipo: "attivita" | "promemoria",
  ids: string[]
): Promise<Map<string, PnAvviso[]>> {
  const map = new Map<string, PnAvviso[]>();
  if (!ids.length) return map;
  const { data } = await supabase
    .from("pn_evento_avvisi")
    .select(
      "id, origine_id, offset_valore, offset_unita, notify_at, sent_at"
    )
    .eq("origine_tipo", origineTipo)
    .in("origine_id", ids)
    .is("deleted_at", null)
    .order("notify_at", { ascending: true });
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
  origineTipo: "attivita" | "promemoria";
  origineId: string;
  dueAt: string;
  avvisi: Array<{ offsetValore: number; offsetUnita: PnAvvisoUnita }>;
}): Promise<PnAvviso[]> {
  const wanted = dedupeAvvisi(input.avvisi).map((a) => ({
    ...a,
    notifyAt: computeNotifyAt(input.dueAt, a.offsetValore, a.offsetUnita),
  }));
  const { data: existing } = await input.supabase
    .from("pn_evento_avvisi")
    .select("id, offset_valore, offset_unita, notify_at, sent_at")
    .eq("origine_tipo", input.origineTipo)
    .eq("origine_id", input.origineId)
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
      await input.supabase
        .from("pn_evento_avvisi")
        .update({
          notify_at: w.notifyAt,
          sent_at: notifyChanged && new Date(w.notifyAt) > new Date() ? null : found.sent_at,
          sent_by: notifyChanged && new Date(w.notifyAt) > new Date() ? null : undefined,
          versione: 1,
          updated_by: input.userId,
        })
        .eq("id", found.id);
    } else {
      await input.supabase.from("pn_evento_avvisi").insert({
        origine_tipo: input.origineTipo,
        origine_id: input.origineId,
        offset_valore: w.offsetValore,
        offset_unita: w.offsetUnita,
        notify_at: w.notifyAt,
        created_by: input.userId,
        updated_by: input.userId,
      });
    }
  }
  const loaded = await loadAvvisiByOrigineIds(input.supabase, input.origineTipo, [
    input.origineId,
  ]);
  return loaded.get(input.origineId) ?? wanted;
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
