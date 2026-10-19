"use server";

import { writeAuditLog } from "@/lib/audit";
import { getAuthContext } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveWebmailAccountVisibility } from "@/lib/webmail/account-access";

export type OpzioneMailProfessionale = {
  email: string;
  etichetta: string;
};

function normalizzaMail(email: string): string {
  return email.trim().toLowerCase();
}

async function opzioniDi(
  userId: string,
  auth: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>
): Promise<
  | { error: string }
  | { accesso: string; attuale: string; opzioni: OpzioneMailProfessionale[] }
> {
  const service = createServiceClient();
  const { data: profilo, error } = await service
    .from("profiles")
    .select("email, email_professionale")
    .eq("id", userId)
    .maybeSingle();
  if (error) return { error: error.message };
  const accesso = String(
    (profilo as { email?: string | null } | null)?.email ?? ""
  ).trim();
  const attuale = String(
    (profilo as { email_professionale?: string | null } | null)
      ?.email_professionale ?? ""
  ).trim();
  const vis = await resolveWebmailAccountVisibility(auth);
  const opzioni: OpzioneMailProfessionale[] = [];
  const viste = new Set<string>();
  function aggiungi(email: string, etichetta: string) {
    const pulita = email.trim();
    const chiave = normalizzaMail(pulita);
    if (!chiave.includes("@") || viste.has(chiave)) return;
    viste.add(chiave);
    opzioni.push({ email: pulita, etichetta });
  }
  if (accesso) aggiungi(accesso, "Mail di accesso");
  if (vis.mode === "all" || vis.ids.length > 0) {
    let query = service
      .from("webmail_accounts")
      .select("id, label, email_address")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (vis.mode === "granted") query = query.in("id", vis.ids);
    const caselle = await query;
    if (caselle.error) return { error: caselle.error.message };
    for (const row of caselle.data ?? []) {
      const email = String(
        (row as { email_address?: string }).email_address ?? ""
      );
      const label = String((row as { label?: string }).label ?? "").trim();
      aggiungi(email, label || "Casella aziendale");
    }
  }
  return { accesso, attuale, opzioni };
}

export async function opzioniMailProfessionaleAction(): Promise<
  | {
      success: true;
      impostata: boolean;
      attuale: string;
      opzioni: OpzioneMailProfessionale[];
    }
  | { success: false; error: string }
> {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified) {
    return { success: false, error: "Accesso negato." };
  }
  const letto = await opzioniDi(auth.userId, auth);
  if ("error" in letto) return { success: false, error: letto.error };
  return {
    success: true,
    impostata: letto.attuale.includes("@"),
    attuale: letto.attuale,
    opzioni: letto.opzioni,
  };
}

export async function impostaMailProfessionaleAction(
  email: string
): Promise<{ success: true; email: string } | { success: false; error: string }> {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified) {
    return { success: false, error: "Accesso negato." };
  }
  const scelta = email.trim();
  if (!scelta.includes("@")) {
    return { success: false, error: "Seleziona una mail." };
  }
  const letto = await opzioniDi(auth.userId, auth);
  if ("error" in letto) return { success: false, error: letto.error };
  const ammessa = letto.opzioni.find(
    (opzione) => normalizzaMail(opzione.email) === normalizzaMail(scelta)
  );
  if (!ammessa) {
    return {
      success: false,
      error: "Puoi scegliere solo una mail a cui hai accesso.",
    };
  }
  const service = createServiceClient();
  const { error } = await service
    .from("profiles")
    .update({ email_professionale: ammessa.email })
    .eq("id", auth.userId);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "profiles",
    entity_id: auth.userId,
    action: "update",
    actor_id: auth.actorUserId,
    summary: `Mail professionale impostata: ${ammessa.email}`,
    payload: { email_professionale: ammessa.email },
  });
  return { success: true, email: ammessa.email };
}
