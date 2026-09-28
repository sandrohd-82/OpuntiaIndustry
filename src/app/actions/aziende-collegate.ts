"use server";

import { writeAuditLog } from "@/lib/audit";
import { assertAnagraficaPrivilege } from "@/lib/auth/anagrafica-privileges-server";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const collegaSchema = z
  .object({
    kind: z.enum(["cliente", "cliente_possibile"]),
    origineId: z.string().uuid(),
    altraId: z.string().uuid(),
    madreId: z.string().uuid(),
    inviaPreventivi: z.boolean(),
    fatturare: z.boolean(),
    inviaCampionature: z.boolean(),
    inviaProdotti: z.boolean(),
    tipologia: z.string().trim().min(1).max(500),
  })
  .superRefine((value, ctx) => {
    if (value.origineId === value.altraId) {
      ctx.addIssue({
        code: "custom",
        message: "Scegli un'azienda diversa da quella aperta.",
      });
    }
    if (value.madreId !== value.origineId && value.madreId !== value.altraId) {
      ctx.addIssue({
        code: "custom",
        message: "La madre deve essere una delle due aziende.",
      });
    }
  });

type SchedaLink = {
  id: string;
  ragione_sociale: string;
  is_privato: boolean | null;
  azienda_madre_id: string | null;
  created_by: string | null;
  commerciale_id: string | null;
};

export async function collegaAziendeEsistentiAction(
  input: z.input<typeof collegaSchema>
): Promise<{ success: true; figliaId: string; madreId: string } | { success: false; error: string }> {
  const parsed = collegaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati del collegamento non validi.",
    };
  }
  const data = parsed.data;
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const table = data.kind === "cliente" ? "clienti" : "clienti_possibili";
  const privilegeKind = data.kind === "cliente" ? "cliente" : "cliente_possibile";
  const figliaId = data.madreId === data.origineId ? data.altraId : data.origineId;

  const { data: rows, error: loadError } = await supabase
    .from(table)
    .select(
      "id, ragione_sociale, is_privato, azienda_madre_id, created_by, commerciale_id"
    )
    .in("id", [data.origineId, data.altraId])
    .is("deleted_at", null);

  if (loadError) {
    return { success: false, error: loadError.message };
  }
  const schede = (rows ?? []) as SchedaLink[];
  if (schede.length !== 2) {
    return { success: false, error: "Una delle due aziende non è più attiva." };
  }
  const madre = schede.find((row) => row.id === data.madreId);
  const figlia = schede.find((row) => row.id === figliaId);
  if (!madre || !figlia) {
    return { success: false, error: "Una delle due aziende non è più attiva." };
  }
  if (madre.is_privato || figlia.is_privato) {
    return {
      success: false,
      error: "Non si collega un privato sotto un'azienda.",
    };
  }
  if (madre.azienda_madre_id) {
    return {
      success: false,
      error: "L'azienda scelta come madre è già collegata a un'altra scheda.",
    };
  }
  if (figlia.azienda_madre_id) {
    return {
      success: false,
      error: "L'azienda da collegare è già sotto un'altra madre.",
    };
  }

  for (const scheda of [madre, figlia]) {
    const gate = await assertAnagraficaPrivilege({
      kind: privilegeKind,
      op: "update",
      createdBy: scheda.created_by,
      commercialeId: scheda.commerciale_id,
    });
    if (!gate.ok) return { success: false, error: gate.error };
  }

  const { count: figlieCount, error: figlieError } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("azienda_madre_id", figliaId)
    .is("deleted_at", null);
  if (figlieError) return { success: false, error: figlieError.message };
  if ((figlieCount ?? 0) > 0) {
    return {
      success: false,
      error: `${figlia.ragione_sociale} ha già aziende collegate e può restare solo madre.`,
    };
  }

  const { error: updateError } = await supabase
    .from(table)
    .update({
      azienda_madre_id: data.madreId,
      invia_preventivi: data.inviaPreventivi,
      fatturare: data.fatturare,
      invia_campionature: data.inviaCampionature,
      invia_prodotti: data.inviaProdotti,
      tipologia_rispetto_madre: data.tipologia,
      updated_by: auth.userId,
    })
    .eq("id", figliaId)
    .is("deleted_at", null);

  if (updateError) {
    return {
      success: false,
      error: updateError.message || "Collegamento non riuscito.",
    };
  }

  const payload = {
    azienda_madre_id: data.madreId,
    figlia_id: figliaId,
    madre_ragione_sociale: madre.ragione_sociale,
    figlia_ragione_sociale: figlia.ragione_sociale,
    invia_preventivi: data.inviaPreventivi,
    fatturare: data.fatturare,
    invia_campionature: data.inviaCampionature,
    invia_prodotti: data.inviaProdotti,
    tipologia_rispetto_madre: data.tipologia,
  };
  await writeAuditLog({
    entity_type: table,
    entity_id: figliaId,
    action: "update",
    actor_id: auth.userId,
    summary: `Collegata ${figlia.ragione_sociale} sotto ${madre.ragione_sociale}`,
    payload,
  });
  await writeAuditLog({
    entity_type: table,
    entity_id: data.madreId,
    action: "update",
    actor_id: auth.userId,
    summary: `Azienda madre di ${figlia.ragione_sociale}`,
    payload,
  });

  return { success: true, figliaId, madreId: data.madreId };
}
