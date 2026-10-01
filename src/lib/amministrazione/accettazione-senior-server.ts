import { dispatchNotifiche } from "@/lib/notifiche/dispatch";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { createServiceClient } from "@/lib/supabase/server";
import type { AccettazioneSeniorStato } from "@/lib/amministrazione/accettazione-senior";
import type { Profile } from "@/types/database";

export type DecisioneAccettazioneSenior = {
  stato: AccettazioneSeniorStato;
  seniorUserId: string | null;
};

export async function decisioneAccettazioneSenior(opts: {
  clienteId?: string | null;
  possibileClienteId?: string | null;
  actorId: string;
  actorProfile: Profile;
}): Promise<DecisioneAccettazioneSenior> {
  const clienteId = opts.clienteId?.trim() || null;
  const possibileId = opts.possibileClienteId?.trim() || null;
  if (!clienteId && !possibileId) {
    return { stato: "non_richiesta", seniorUserId: null };
  }
  const service = createServiceClient();
  const table = clienteId ? "clienti" : "clienti_possibili";
  const id = clienteId ?? possibileId;
  const { data } = await service
    .from(table)
    .select("commerciale_id, affiancato_id, affiancato_by")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const row = data as {
    commerciale_id?: string | null;
    affiancato_id?: string | null;
    affiancato_by?: string | null;
  } | null;
  const affiancato = row?.affiancato_id ? String(row.affiancato_id) : "";
  if (!affiancato) {
    return { stato: "non_richiesta", seniorUserId: null };
  }
  const senior =
    (row?.commerciale_id ? String(row.commerciale_id) : "") ||
    (row?.affiancato_by ? String(row.affiancato_by) : "") ||
    null;
  if (isSuperadminProfile(opts.actorProfile) || (senior && senior === opts.actorId)) {
    return { stato: "non_richiesta", seniorUserId: senior };
  }
  return { stato: "in_attesa", seniorUserId: senior };
}

export function colonneAccettazioneSenior(
  decisione: DecisioneAccettazioneSenior
): {
  accettazione_senior_stato: AccettazioneSeniorStato;
  accettazione_senior_user_id: string | null;
  accettazione_senior_by: null;
  accettazione_senior_at: null;
  accettazione_senior_nota: string;
} {
  if (decisione.stato !== "in_attesa") {
    return {
      accettazione_senior_stato: "non_richiesta",
      accettazione_senior_user_id: null,
      accettazione_senior_by: null,
      accettazione_senior_at: null,
      accettazione_senior_nota: "",
    };
  }
  return {
    accettazione_senior_stato: "in_attesa",
    accettazione_senior_user_id: decisione.seniorUserId,
    accettazione_senior_by: null,
    accettazione_senior_at: null,
    accettazione_senior_nota: "",
  };
}

export async function notificaAccettazioneSenior(opts: {
  actorId: string;
  seniorUserId: string | null;
  title: string;
  body: string;
  href: string;
  entityType: string;
  entityId: string;
}): Promise<void> {
  if (!opts.seniorUserId) return;
  await dispatchNotifiche({
    actorId: opts.actorId,
    recipientIds: [opts.seniorUserId],
    tipo: "attivita",
    title: opts.title,
    body: opts.body,
    href: opts.href,
    entityType: opts.entityType,
    entityId: opts.entityId,
    payload: { priorita: "urgente", compito: "accettazione_senior" },
  });
}
