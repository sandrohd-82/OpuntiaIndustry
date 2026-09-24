import { dispatchNotifiche } from "@/lib/notifiche/dispatch";
import {
  loadCommercialLineageUserIds,
  loadCommercialeOperatorContext,
  loadSuperadminUserIds,
} from "@/lib/auth/commerciale-lineage";
import { createServiceClient } from "@/lib/supabase/server";
import {
  fasciaScontoExtra,
  parseScontoExtraPct,
  puoInserireScontoFascia,
  requisitiApprovazioneSconto,
  scontoApprovazioneCompleta,
  type ScontoApprovazioneRuolo,
  type ScontoApprovazioneStato,
  type ScontoFascia,
} from "@/lib/amministrazione/sconto-fuori-listino";

const HREF_SCONTO = "/app/amministrazione/ordini";

export type ScontoOperatoreCtx = {
  isSuperadmin: boolean;
  isSenior: boolean;
  canOltre30: boolean;
};

export async function loadScontoOperatoreCtx(
  userId: string
): Promise<ScontoOperatoreCtx> {
  const [saIds, comm] = await Promise.all([
    loadSuperadminUserIds(),
    loadCommercialeOperatorContext(userId),
  ]);
  const isSuperadmin = saIds.has(userId);
  const isSenior = comm.grado === "senior";
  return {
    isSuperadmin,
    isSenior,
    canOltre30: isSuperadmin || isSenior,
  };
}

export async function loadClienteCommercialeId(
  clienteId: string | null | undefined
): Promise<string | null> {
  const id = String(clienteId ?? "").trim();
  if (!id) return null;
  const service = createServiceClient();
  const { data } = await service
    .from("clienti")
    .select("commerciale_id")
    .eq("id", id)
    .maybeSingle();
  const cid = String(
    (data as { commerciale_id?: string | null } | null)?.commerciale_id ?? ""
  ).trim();
  return cid || null;
}

export async function loadSeniorUserIds(): Promise<string[]> {
  const service = createServiceClient();
  const [{ data: profiles }, { data: persone }, supers] = await Promise.all([
    service
      .from("profiles")
      .select("id, commerciale_grado")
      .eq("commerciale_grado", "senior"),
    service
      .from("organigramma_persone")
      .select("user_id, commerciale_grado")
      .eq("commerciale_grado", "senior")
      .is("deleted_at", null)
      .not("user_id", "is", null),
    loadSuperadminUserIds(),
  ]);
  const ids = new Set<string>();
  for (const p of profiles ?? []) {
    const uid = String((p as { id?: string }).id ?? "");
    if (uid) ids.add(uid);
  }
  for (const p of persone ?? []) {
    const uid = String((p as { user_id?: string }).user_id ?? "");
    if (uid) ids.add(uid);
  }
  for (const s of supers) ids.delete(s);
  return [...ids];
}

export async function loadSeniorUserIdsForCliente(
  commercialeId: string | null
): Promise<string[]> {
  if (!commercialeId) return [];
  const seniors = await loadSeniorUserIds();
  const out: string[] = [];
  for (const sid of seniors) {
    const tree = await loadCommercialLineageUserIds(sid);
    if (tree.includes(commercialeId)) out.push(sid);
  }
  return out;
}

export function valutaScontoWizard(input: {
  scontoExtraPct: unknown;
  isSuperadmin: boolean;
  isSenior: boolean;
}):
  | { ok: true; pct: number; fascia: ScontoFascia }
  | { ok: false; error: string } {
  const pct = parseScontoExtraPct(input.scontoExtraPct);
  const fascia = fasciaScontoExtra(pct);
  if (
    !puoInserireScontoFascia({
      fascia,
      isSuperadmin: input.isSuperadmin,
      isSenior: input.isSenior,
    })
  ) {
    return {
      ok: false,
      error:
        "Sconto oltre il 30% riservato a commerciale Senior o Super Admin.",
    };
  }
  return { ok: true, pct, fascia };
}

type ApprovalRow = {
  ruolo: ScontoApprovazioneRuolo;
  esito: string;
  decided_by: string | null;
};

export async function loadApprovazioniSconto(
  ordineId: string
): Promise<ApprovalRow[]> {
  const service = createServiceClient();
  const { data } = await service
    .from("ordine_sconto_approvazioni")
    .select("ruolo, esito, decided_by")
    .eq("ordine_id", ordineId)
    .is("deleted_at", null);
  return ((data ?? []) as ApprovalRow[]).filter(
    (r) => r.esito === "approvato"
  );
}

export function tallyApprovazioni(rows: ApprovalRow[]): {
  seniorOk: boolean;
  superadminOk: number;
  saDecided: Set<string>;
} {
  let seniorOk = false;
  let superadminOk = 0;
  const saDecided = new Set<string>();
  for (const r of rows) {
    if (r.ruolo === "commerciale_senior") seniorOk = true;
    if (r.ruolo === "superadmin") {
      superadminOk += 1;
      if (r.decided_by) saDecided.add(r.decided_by);
    }
  }
  return { seniorOk, superadminOk, saDecided };
}

export function statoDaTally(input: {
  fascia: ScontoFascia;
  haSeniorLinea: boolean;
  superadminTotali: number;
  seniorOk: boolean;
  superadminOk: number;
}): ScontoApprovazioneStato {
  if (input.fascia === "nessuno" || input.fascia === "fino_10") {
    return "non_richiesta";
  }
  const done = scontoApprovazioneCompleta(input);
  return done ? "approvata" : "in_attesa";
}

export async function insertApprovazioneSconto(input: {
  ordineId: string;
  ruolo: ScontoApprovazioneRuolo;
  actorId: string;
}): Promise<string | null> {
  const service = createServiceClient();
  const { error } = await service.from("ordine_sconto_approvazioni").insert({
    ordine_id: input.ordineId,
    ruolo: input.ruolo,
    esito: "approvato",
    decided_by: input.actorId,
    created_by: input.actorId,
    updated_by: input.actorId,
  });
  if (error) {
    if (error.code === "23505") return null;
    return error.message;
  }
  return null;
}

export async function persistStatoSconto(input: {
  ordineId: string;
  stato: ScontoApprovazioneStato;
  actorId: string;
}): Promise<string | null> {
  const service = createServiceClient();
  const { error } = await service
    .from("ordini")
    .update({
      sconto_approvazione_stato: input.stato,
      updated_by: input.actorId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.ordineId)
    .is("deleted_at", null);
  return error?.message ?? null;
}

export async function recomputeScontoApprovazione(input: {
  ordineId: string;
  fascia: ScontoFascia;
  clienteId: string | null;
  actorId: string;
}): Promise<{ stato: ScontoApprovazioneStato; error?: string }> {
  const [saIds, commercialeId, rows] = await Promise.all([
    loadSuperadminUserIds(),
    loadClienteCommercialeId(input.clienteId),
    loadApprovazioniSconto(input.ordineId),
  ]);
  const seniorIds = await loadSeniorUserIdsForCliente(commercialeId);
  const tally = tallyApprovazioni(rows);
  const stato = statoDaTally({
    fascia: input.fascia,
    haSeniorLinea: seniorIds.length > 0,
    superadminTotali: saIds.size,
    seniorOk: tally.seniorOk,
    superadminOk: tally.superadminOk,
  });
  const err = await persistStatoSconto({
    ordineId: input.ordineId,
    stato,
    actorId: input.actorId,
  });
  return { stato, error: err ?? undefined };
}

export function remainingScontoApproverIds(input: {
  fascia: ScontoFascia;
  haSeniorLinea: boolean;
  superadminTotali: number;
  seniorOk: boolean;
  superadminOk: number;
  seniorIds: string[];
  saIds: string[];
  saDecided: Set<string>;
}): string[] {
  const req = requisitiApprovazioneSconto(input.fascia, {
    haSeniorLinea: input.haSeniorLinea,
    superadminTotali: input.superadminTotali,
  });
  const need = new Set<string>();
  if (input.fascia === "nessuno" || input.fascia === "fino_10") return [];
  if (req.seniorOrSuperadmin) {
    if (!input.seniorOk && input.superadminOk < 1) {
      for (const id of input.seniorIds) need.add(id);
      for (const id of input.saIds) need.add(id);
    }
    return [...need];
  }
  if (req.senior && !input.seniorOk) {
    for (const id of input.seniorIds) need.add(id);
  }
  if (input.superadminOk < req.superadmin) {
    for (const id of input.saIds) {
      if (!input.saDecided.has(id)) need.add(id);
    }
  }
  return [...need];
}

export async function notifyScontoDaApprovare(input: {
  ordineId: string;
  numeroInterno: string;
  cliente: string;
  pct: number;
  fascia: ScontoFascia;
  clienteId: string | null;
  actorId: string;
}): Promise<void> {
  const [saIds, commercialeId, rows] = await Promise.all([
    loadSuperadminUserIds(),
    loadClienteCommercialeId(input.clienteId),
    loadApprovazioniSconto(input.ordineId),
  ]);
  const seniorIds = await loadSeniorUserIdsForCliente(commercialeId);
  const tally = tallyApprovazioni(rows);
  const recipients = remainingScontoApproverIds({
    fascia: input.fascia,
    haSeniorLinea: seniorIds.length > 0,
    superadminTotali: saIds.size,
    seniorOk: tally.seniorOk,
    superadminOk: tally.superadminOk,
    seniorIds,
    saIds: [...saIds],
    saDecided: tally.saDecided,
  }).filter((id) => id !== input.actorId);
  if (!recipients.length) return;
  await dispatchNotifiche({
    actorId: input.actorId,
    includeActor: false,
    recipientIds: recipients,
    tipo: "sistema",
    title: "Sconto extra da approvare",
    body: `${input.numeroInterno} · ${input.pct.toLocaleString("it-IT")}% · ${input.cliente}`,
    href: HREF_SCONTO,
    entityType: "ordini",
    entityId: input.ordineId,
    payload: { fascia: input.fascia, sconto_extra_pct: input.pct },
  });
}

export async function autoFirmaScontoOnCreate(input: {
  ordineId: string;
  fascia: ScontoFascia;
  actorId: string;
  isSuperadmin: boolean;
}): Promise<void> {
  if (input.fascia === "nessuno" || input.fascia === "fino_10") return;
  if (input.isSuperadmin) {
    await insertApprovazioneSconto({
      ordineId: input.ordineId,
      ruolo: "superadmin",
      actorId: input.actorId,
    });
  }
}

export function ruoloApprovazionePossibile(input: {
  isSuperadmin: boolean;
  isSeniorLinea: boolean;
}): ScontoApprovazioneRuolo | null {
  if (input.isSuperadmin) return "superadmin";
  if (input.isSeniorLinea) return "commerciale_senior";
  return null;
}

export async function finalizeScontoOnCreate(input: {
  ordineId: string;
  fascia: ScontoFascia;
  pct: number;
  clienteId: string | null;
  numeroInterno: string;
  cliente: string;
  actorId: string;
  isSuperadmin: boolean;
}): Promise<void> {
  await autoFirmaScontoOnCreate({
    ordineId: input.ordineId,
    fascia: input.fascia,
    actorId: input.actorId,
    isSuperadmin: input.isSuperadmin,
  });
  const recomputed = await recomputeScontoApprovazione({
    ordineId: input.ordineId,
    fascia: input.fascia,
    clienteId: input.clienteId,
    actorId: input.actorId,
  });
  if (recomputed.stato === "in_attesa") {
    await notifyScontoDaApprovare({
      ordineId: input.ordineId,
      numeroInterno: input.numeroInterno,
      cliente: input.cliente,
      pct: input.pct,
      fascia: input.fascia,
      clienteId: input.clienteId,
      actorId: input.actorId,
    });
  }
}
