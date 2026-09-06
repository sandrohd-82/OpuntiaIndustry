"use server";

import { requireAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";
import {
  registroAccessiFilterSchema,
  type RegistroAccesso,
  type RegistroAccessoEsito,
  type RegistroAccessoEvento,
  type RegistroAccessoMetodo2fa,
} from "@/lib/amministrazione/registro-accessi";
import { createClient } from "@/lib/supabase/server";

type AccessoRow = {
  id: string;
  user_id: string | null;
  email: string;
  nome: string;
  evento: RegistroAccessoEvento;
  esito: RegistroAccessoEsito;
  occurred_at: string;
  ip: string | null;
  user_agent: string | null;
  metodo_2fa: RegistroAccessoMetodo2fa | null;
  note: string;
  created_at: string;
  created_by: string | null;
};

const PAGE_SIZE = 200;

function mapRow(r: AccessoRow): RegistroAccesso {
  return {
    id: r.id,
    userId: r.user_id,
    email: r.email,
    nome: r.nome,
    evento: r.evento,
    esito: r.esito,
    occurredAt: r.occurred_at,
    ip: r.ip,
    userAgent: r.user_agent,
    metodo2fa: r.metodo_2fa,
    note: r.note,
    createdAt: r.created_at,
    createdBy: r.created_by,
  };
}

export async function listRegistroAccessiAction(
  raw: unknown
): Promise<
  | { success: true; items: RegistroAccesso[]; hasMore: boolean }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!isAdminLikeProfile(auth.profile)) {
    return {
      success: false,
      error: "Solo l’amministratore può consultare il registro accessi.",
    };
  }
  const parsed = registroAccessiFilterSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Filtri non validi.",
    };
  }
  const supabase = await createClient();
  let q = supabase
    .from("registro_accessi")
    .select(
      "id, user_id, email, nome, evento, esito, occurred_at, ip, user_agent, metodo_2fa, note, created_at, created_by"
    )
    .is("deleted_at", null)
    .order("occurred_at", { ascending: false })
    .range(parsed.data.offset ?? 0, (parsed.data.offset ?? 0) + PAGE_SIZE);
  if (parsed.data.dateFrom) {
    q = q.gte("occurred_at", `${parsed.data.dateFrom}T00:00:00+02:00`);
  }
  if (parsed.data.dateTo) {
    q = q.lte("occurred_at", `${parsed.data.dateTo}T23:59:59.999+02:00`);
  }
  if (parsed.data.email) {
    q = q.ilike("email", `%${parsed.data.email}%`);
  }
  if (parsed.data.evento) {
    q = q.eq("evento", parsed.data.evento);
  }
  if (parsed.data.esito) {
    q = q.eq("esito", parsed.data.esito);
  }
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as AccessoRow[];
  const hasMore = rows.length > PAGE_SIZE;
  return {
    success: true,
    items: (hasMore ? rows.slice(0, PAGE_SIZE) : rows).map(mapRow),
    hasMore,
  };
}
