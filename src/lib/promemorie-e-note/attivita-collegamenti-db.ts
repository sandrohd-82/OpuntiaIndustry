import { writeAuditLog } from "@/lib/audit";
import {
  collegamentiStillInText,
  mapCollegamentoRow,
  specForKind,
  type PnAttivitaCollegamento,
} from "@/lib/promemorie-e-note/mention-tokens";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function loadCollegamentiByAttivitaIds(
  supabase: Supabase,
  ids: string[]
): Promise<Map<string, PnAttivitaCollegamento[]>> {
  const map = new Map<string, PnAttivitaCollegamento[]>();
  if (!ids.length) return map;
  const { data } = await supabase
    .from("pn_attivita_collegamenti")
    .select("id, attivita_id, kind, entity_id, entity_label, token, meta")
    .in("attivita_id", ids)
    .is("deleted_at", null);
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const aid = String(r.attivita_id);
    const list = map.get(aid) ?? [];
    list.push(mapCollegamentoRow(r));
    map.set(aid, list);
  }
  return map;
}

export async function persistAttivitaCollegamenti(input: {
  supabase: Supabase;
  attivitaId: string;
  userId: string;
  descrizione: string;
  collegamenti: PnAttivitaCollegamento[];
}): Promise<PnAttivitaCollegamento[]> {
  const wanted = collegamentiStillInText(input.descrizione, input.collegamenti);
  const { data: existing } = await input.supabase
    .from("pn_attivita_collegamenti")
    .select("id, kind, entity_id")
    .eq("attivita_id", input.attivitaId)
    .is("deleted_at", null);
  const now = new Date().toISOString();
  const open = (existing ?? []) as Array<{
    id: string;
    kind: string;
    entity_id: string;
  }>;
  const wantedKeys = new Set(wanted.map((c) => `${c.kind}:${c.entityId}`));
  const toClose = open.filter(
    (r) => !wantedKeys.has(`${r.kind}:${r.entity_id}`)
  );
  if (toClose.length) {
    await input.supabase
      .from("pn_attivita_collegamenti")
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
  const openKeys = new Set(open.map((r) => `${r.kind}:${r.entity_id}`));
  const toInsert = wanted.filter(
    (c) => !openKeys.has(`${c.kind}:${c.entityId}`)
  );
  if (toInsert.length) {
    await input.supabase.from("pn_attivita_collegamenti").insert(
      toInsert.map((c) => ({
        attivita_id: input.attivitaId,
        kind: c.kind,
        entity_id: c.entityId,
        entity_label: c.entityLabel,
        token: c.token,
        meta: c.meta ?? {},
        created_by: input.userId,
        updated_by: input.userId,
      }))
    );
  }
  const loaded = await loadCollegamentiByAttivitaIds(input.supabase, [
    input.attivitaId,
  ]);
  return loaded.get(input.attivitaId) ?? wanted;
}

export async function persistAttivitaMentions(input: {
  supabase: Supabase;
  attivitaId: string;
  userId: string;
  userIds: string[];
}): Promise<string[]> {
  const ids = [...new Set(input.userIds.filter(Boolean))];
  const { data: existing } = await input.supabase
    .from("pn_attivita_mentions")
    .select("id, user_id")
    .eq("attivita_id", input.attivitaId)
    .is("deleted_at", null);
  const open = (existing ?? []) as Array<{ id: string; user_id: string }>;
  const wanted = new Set(ids);
  const now = new Date().toISOString();
  const toClose = open.filter((r) => !wanted.has(r.user_id));
  if (toClose.length) {
    await input.supabase
      .from("pn_attivita_mentions")
      .update({
        deleted_at: now,
        deleted_by: input.userId,
      })
      .in(
        "id",
        toClose.map((r) => r.id)
      );
  }
  const have = new Set(open.map((r) => r.user_id));
  const toInsert = ids.filter((id) => !have.has(id));
  if (toInsert.length) {
    await input.supabase.from("pn_attivita_mentions").insert(
      toInsert.map((user_id) => ({
        attivita_id: input.attivitaId,
        user_id,
        created_by: input.userId,
      }))
    );
  }
  return ids;
}

export async function auditCollegamentiChange(input: {
  attivitaId: string;
  userId: string;
  titolo: string;
  collegamenti: PnAttivitaCollegamento[];
  action: "create" | "update";
}) {
  await writeAuditLog({
    entity_type: "pn_attivita",
    entity_id: input.attivitaId,
    action: input.action,
    actor_id: input.userId,
    summary:
      input.action === "create"
        ? `Attività: ${input.titolo}`
        : `Attività aggiornata: ${input.titolo}`,
    payload: {
      collegamenti: input.collegamenti.map((c) => ({
        kind: c.kind,
        entity_id: c.entityId,
        token: c.token,
        prefix: specForKind(c.kind).prefix,
      })),
    },
  });
}
