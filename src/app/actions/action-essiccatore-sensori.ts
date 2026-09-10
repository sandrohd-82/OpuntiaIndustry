"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  ACTION_SENSORE_CATALOGO,
  catalogoSensoriPerEssiccatori,
  createSensoreInputSchema,
  moveSensoreInputSchema,
  renameSensoreInputSchema,
  softDeleteSensoreInputSchema,
  type ActionEssiccatoreSensore,
} from "@/lib/action/sensori";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { fraseConfermaSoftDelete } from "@/lib/soft-delete";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const COLS =
  "id, essiccatore_id, codice, nome, unita, x_pct, y_pct, valore_attuale";

type Row = {
  id: string;
  essiccatore_id: string;
  codice: string;
  nome: string;
  unita: string;
  x_pct: number | string;
  y_pct: number | string;
  valore_attuale: string;
};

function mapRow(row: Row): ActionEssiccatoreSensore {
  return {
    id: row.id,
    essiccatoreId: row.essiccatore_id,
    codice: row.codice,
    nome: row.nome,
    unita: row.unita ?? "",
    xPct: Number(row.x_pct),
    yPct: Number(row.y_pct),
    valoreAttuale: row.valore_attuale ?? "",
  };
}

function requireSettingSuperadmin(auth: {
  profile: Parameters<typeof isSuperadminProfile>[0];
  impersonating: boolean;
}) {
  if (!isSuperadminProfile(auth.profile) || auth.impersonating) {
    return "Solo il Super Admin, non in impersonazione, può posizionare i sensori.";
  }
  return null;
}

function nextCodice(existing: string[]): string {
  let max = 0;
  for (const c of existing) {
    const m = /^SEN-(\d+)$/i.exec(c.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `SEN-${String(max + 1).padStart(3, "0")}`;
}

export async function listActionEssiccatoreSensoriAction(): Promise<
  { success: true; items: ActionEssiccatoreSensore[] } | { success: false; error: string }
> {
  await requireAreaAccess("action");
  const service = createServiceClient();
  const needed = catalogoSensoriPerEssiccatori();
  const { data: existing } = await service
    .from("action_essiccatore_sensori")
    .select("essiccatore_id, codice")
    .in(
      "essiccatore_id",
      needed.map((n) => n.essiccatoreId)
    );
  const have = new Set(
    ((existing ?? []) as Array<{ essiccatore_id: string; codice: string }>).map(
      (r) => `${r.essiccatore_id}:${r.codice}`
    )
  );
  const missing = needed.filter(
    (n) => !have.has(`${n.essiccatoreId}:${n.codice}`)
  );
  if (missing.length > 0) {
    await service.from("action_essiccatore_sensori").insert(
      missing.map((n) => ({
        essiccatore_id: n.essiccatoreId,
        codice: n.codice,
        nome: n.nome,
        unita: n.unita,
        x_pct: n.xPct,
        y_pct: n.yPct,
      }))
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("action_essiccatore_sensori")
    .select(COLS)
    .is("deleted_at", null)
    .order("codice", { ascending: true });
  if (error) return { success: false, error: error.message };
  const rank = new Map<string, number>(
    ACTION_SENSORE_CATALOGO.map((s) => [s.codice, s.sort])
  );
  const items = ((data ?? []) as Row[])
    .map(mapRow)
    .sort(
      (a, b) =>
        (rank.get(a.codice) ?? 99) - (rank.get(b.codice) ?? 99) ||
        a.nome.localeCompare(b.nome, "it")
    );
  return { success: true, items };
}

export async function createActionEssiccatoreSensoreAction(
  raw: unknown
): Promise<
  | { success: true; item: ActionEssiccatoreSensore }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const denied = requireSettingSuperadmin(auth);
  if (denied) return { success: false, error: denied };
  const parsed = createSensoreInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const service = createServiceClient();
  const { data: rows, error: listErr } = await service
    .from("action_essiccatore_sensori")
    .select("codice")
    .eq("essiccatore_id", parsed.data.essiccatoreId)
    .is("deleted_at", null);
  if (listErr) return { success: false, error: listErr.message };
  const codice = nextCodice(
    ((rows ?? []) as Array<{ codice: string }>).map((r) => r.codice)
  );
  const { data, error } = await service
    .from("action_essiccatore_sensori")
    .insert({
      essiccatore_id: parsed.data.essiccatoreId,
      codice,
      nome: parsed.data.nome.trim(),
      unita: parsed.data.unita?.trim() ?? "",
      x_pct: 50,
      y_pct: 50,
      created_by: auth.actorUserId,
      updated_by: auth.actorUserId,
    })
    .select(COLS)
    .single();
  if (error) return { success: false, error: error.message };
  const item = mapRow(data as Row);
  await writeAuditLog({
    entity_type: "action_essiccatore_sensori",
    entity_id: item.id,
    action: "create",
    actor_id: auth.actorUserId,
    summary: `Bandiera sensore ${item.codice} su ${item.essiccatoreId}`,
    payload: {
      essiccatoreId: item.essiccatoreId,
      codice: item.codice,
      nome: item.nome,
    },
  });
  return { success: true, item };
}

export async function moveActionEssiccatoreSensoreAction(
  raw: unknown
): Promise<
  | { success: true; item: ActionEssiccatoreSensore }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const denied = requireSettingSuperadmin(auth);
  if (denied) return { success: false, error: denied };
  const parsed = moveSensoreInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Coordinate non valide.",
    };
  }
  const service = createServiceClient();
  const { data, error } = await service
    .from("action_essiccatore_sensori")
    .update({
      x_pct: parsed.data.xPct,
      y_pct: parsed.data.yPct,
      updated_by: auth.actorUserId,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .select(COLS)
    .single();
  if (error) return { success: false, error: error.message };
  const item = mapRow(data as Row);
  await writeAuditLog({
    entity_type: "action_essiccatore_sensori",
    entity_id: item.id,
    action: "update",
    actor_id: auth.actorUserId,
    summary: `Spostata bandiera ${item.codice} (${item.xPct.toFixed(1)}%, ${item.yPct.toFixed(1)}%)`,
    payload: { xPct: item.xPct, yPct: item.yPct },
  });
  return { success: true, item };
}

export async function renameActionEssiccatoreSensoreAction(
  raw: unknown
): Promise<
  | { success: true; item: ActionEssiccatoreSensore }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const denied = requireSettingSuperadmin(auth);
  if (denied) return { success: false, error: denied };
  const parsed = renameSensoreInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const service = createServiceClient();
  const { data, error } = await service
    .from("action_essiccatore_sensori")
    .update({
      nome: parsed.data.nome.trim(),
      unita: parsed.data.unita?.trim() ?? "",
      updated_by: auth.actorUserId,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .select(COLS)
    .single();
  if (error) return { success: false, error: error.message };
  const item = mapRow(data as Row);
  await writeAuditLog({
    entity_type: "action_essiccatore_sensori",
    entity_id: item.id,
    action: "update",
    actor_id: auth.actorUserId,
    summary: `Rinominata bandiera ${item.codice} → ${item.nome}`,
    payload: { nome: item.nome, unita: item.unita },
  });
  return { success: true, item };
}

export async function softDeleteActionEssiccatoreSensoreAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("action");
  const denied = requireSettingSuperadmin(auth);
  if (denied) return { success: false, error: denied };
  const parsed = softDeleteSensoreInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Conferma non valida." };
  }
  const service = createServiceClient();
  const { data: current, error: curErr } = await service
    .from("action_essiccatore_sensori")
    .select("id, codice")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (curErr || !current) {
    return { success: false, error: curErr?.message ?? "Sensore non trovato." };
  }
  const expected = fraseConfermaSoftDelete(String((current as { codice: string }).codice));
  if (parsed.data.confermaTestuale.trim() !== expected) {
    return { success: false, error: "Frase di conferma non corretta." };
  }
  const { error } = await service
    .from("action_essiccatore_sensori")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.actorUserId,
      updated_by: auth.actorUserId,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "action_essiccatore_sensori",
    entity_id: parsed.data.id,
    action: "soft_delete",
    actor_id: auth.actorUserId,
    summary: `Rimossa bandiera ${(current as { codice: string }).codice}`,
    payload: { codice: (current as { codice: string }).codice },
  });
  return { success: true };
}
