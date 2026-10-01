"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { dispatchNotifiche } from "@/lib/notifiche/dispatch";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const schema = z.object({
  entity: z.enum(["preventivo", "ordine"]),
  id: z.string().uuid(),
  esito: z.enum(["accettata", "rifiutata"]),
  nota: z.string().trim().max(1000).optional().default(""),
});

export async function rispondiAccettazioneSeniorAction(
  raw: z.input<typeof schema>
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAnyAreaAccess(["amministrazione", "commerciale"]);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Dati non validi." };
  }
  const { entity, id, esito, nota } = parsed.data;
  if (esito === "rifiutata" && nota.trim().length < 3) {
    return {
      success: false,
      error: "Scrivi perché rifiuti: almeno 3 caratteri.",
    };
  }
  const table = entity === "preventivo" ? "preventivi" : "ordini";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table)
    .select(
      "id, numero_interno, created_by, accettazione_senior_stato, accettazione_senior_user_id"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Documento non trovato." };
  }
  const row = data as {
    id: string;
    numero_interno?: string | null;
    created_by?: string | null;
    accettazione_senior_stato?: string | null;
    accettazione_senior_user_id?: string | null;
  };
  if (row.accettazione_senior_stato !== "in_attesa") {
    return { success: false, error: "Questo documento non è in attesa del senior." };
  }
  const seniorId = row.accettazione_senior_user_id
    ? String(row.accettazione_senior_user_id)
    : "";
  const puo =
    isSuperadminProfile(auth.profile) || (seniorId && seniorId === auth.userId);
  if (!puo) {
    return {
      success: false,
      error: "Solo il senior che ha affiancato, o un Super Admin, può rispondere.",
    };
  }
  const now = new Date().toISOString();
  const { error: upErr } = await supabase
    .from(table)
    .update({
      accettazione_senior_stato: esito,
      accettazione_senior_by: auth.userId,
      accettazione_senior_at: now,
      accettazione_senior_nota: esito === "rifiutata" ? nota.trim() : "",
      updated_by: auth.userId,
      updated_at: now,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (upErr) return { success: false, error: upErr.message };
  const numero = String(row.numero_interno ?? "").trim() || "documento";
  const cosa = entity === "preventivo" ? "Preventivo" : "Ordine";
  await writeAuditLog({
    entity_type: table,
    entity_id: id,
    action: "status_change",
    actor_id: auth.userId,
    summary:
      esito === "accettata"
        ? `${cosa} ${numero} accettato dal senior dell'affiancamento.`
        : `${cosa} ${numero} rifiutato dal senior: ${nota.trim()}`,
    payload: {
      modalita: "accettazione_senior",
      esito,
      nota: esito === "rifiutata" ? nota.trim() : "",
    },
  });
  const destinatario = row.created_by ? String(row.created_by) : "";
  if (destinatario && destinatario !== auth.userId) {
    await dispatchNotifiche({
      actorId: auth.userId,
      recipientIds: [destinatario],
      tipo: "attivita",
      title:
        esito === "accettata"
          ? `${cosa} ${numero} accettato`
          : `${cosa} ${numero} da correggere`,
      body:
        esito === "accettata"
          ? `Il senior ha accettato. Puoi inviare il preventivo o portare l'ordine in produzione.`
          : `Il senior ha rifiutato: ${nota.trim()}`,
      href:
        entity === "preventivo"
          ? "/app/amministrazione/ordini/preventivi"
          : "/app/amministrazione/ordini/elenco",
      entityType: table,
      entityId: id,
      payload: { compito: "accettazione_senior", esito },
    });
  }
  return { success: true };
}
