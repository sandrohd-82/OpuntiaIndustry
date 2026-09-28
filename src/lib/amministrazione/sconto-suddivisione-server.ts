import { writeAuditLog } from "@/lib/audit";
import { loadCommercialeOperatorContext } from "@/lib/auth/commerciale-lineage";
import { parseProfileGerarchia } from "@/lib/auth/gerarchia";
import { createServiceClient } from "@/lib/supabase/server";
import {
  loadClienteCommercialeId,
  loadScontoOperatoreCtx,
} from "@/lib/amministrazione/sconto-fuori-listino-server";
import {
  risolviSuddivisione,
  type GradoSuddivisione,
  type SuddivisioneRisolta,
} from "@/lib/amministrazione/sconto-suddivisione";

export async function gradoInseritoreSuddivisione(
  userId: string
): Promise<GradoSuddivisione> {
  const ctx = await loadScontoOperatoreCtx(userId);
  if (ctx.isSuperadmin) return "azienda";
  const service = createServiceClient();
  const { data } = await service
    .from("profiles")
    .select("gerarchia")
    .eq("id", userId)
    .maybeSingle();
  if (
    parseProfileGerarchia(
      (data as { gerarchia?: string } | null)?.gerarchia
    ) === "amministratore"
  ) {
    return "azienda";
  }
  if (ctx.isSenior) return "senior";
  return "sottoposto";
}

async function commercialeAssegnatoSenior(
  clienteId: string | null,
  inseritore: GradoSuddivisione
): Promise<boolean> {
  const commercialeId = await loadClienteCommercialeId(clienteId);
  if (!commercialeId) return inseritore === "senior";
  const ctx = await loadCommercialeOperatorContext(commercialeId);
  return ctx.grado === "senior";
}

export async function preparaSuddivisione(input: {
  actorId: string;
  clienteId: string | null;
  scontoPct: number;
  attiva: boolean;
  quotaAziendaPct: number;
  quotaCommercialePct: number;
}): Promise<{ ok: true; value: SuddivisioneRisolta } | { ok: false; error: string }> {
  const inseritore = await gradoInseritoreSuddivisione(input.actorId);
  const assegnatoSenior = await commercialeAssegnatoSenior(
    input.clienteId,
    inseritore
  );
  return risolviSuddivisione({
    scontoPct: input.scontoPct,
    attiva: input.attiva,
    quotaAziendaPct: input.quotaAziendaPct,
    quotaCommercialePct: input.quotaCommercialePct,
    inseritore,
    commercialeAssegnatoSenior: assegnatoSenior,
  });
}

export function colonneSuddivisione(value: SuddivisioneRisolta) {
  return {
    sconto_quota_azienda_pct: value.quotaAziendaPct,
    sconto_quota_commerciale_pct: value.quotaCommercialePct,
    sconto_suddivisione_attiva: value.attiva,
    sconto_suddivisione_stato: value.stato,
    sconto_suddivisione_approvatore: value.approvatore ?? "",
  };
}

export async function registraFirmaSuddivisione(input: {
  entityType: "ordine" | "preventivo_riga";
  entityId: string;
  ruolo: "commerciale_senior" | "azienda";
  esito: "approvato" | "rifiutato";
  actorId: string;
  summary: string;
}): Promise<string | null> {
  const service = createServiceClient();
  const { error } = await service.from("sconto_suddivisione_approvazioni").insert({
    entity_type: input.entityType,
    entity_id: input.entityId,
    ruolo: input.ruolo,
    esito: input.esito,
    decided_by: input.actorId,
    created_by: input.actorId,
    updated_by: input.actorId,
  });
  if (error) return error.message;
  await writeAuditLog({
    entity_type:
      input.entityType === "ordine" ? "ordini" : "preventivi_righe",
    entity_id: input.entityId,
    action: "update",
    actor_id: input.actorId,
    summary: input.summary,
    payload: { ruolo: input.ruolo, esito: input.esito },
  });
  return null;
}
