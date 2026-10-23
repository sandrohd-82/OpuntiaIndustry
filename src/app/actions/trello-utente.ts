"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getPublicAppUrl } from "@/lib/auth/app-url";
import { getAuthContext } from "@/lib/auth/session";
import { caveauConfigurato, cifraPasswordCaveau } from "@/lib/amministrazione/caveau-siti-crypto";
import {
  credenzialiOAuth,
  getUserBoards,
  importBoard,
  listeBachecaTrello,
  rilevaSchedeTrelloNuove,
  profiloTrello,
  scambiaCodiceTrello,
  sfidaPkce,
  syncUserCard,
  urlAutorizzazioneTrello,
} from "@/lib/services/trello-user-service";
import { createServiceClient } from "@/lib/supabase/server";

const COOKIE_PKCE = "trello_oauth_pkce";

const ORIGINI = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://www.opuntiaindustry.com",
  "https://opuntiaindustry.com",
]);

function origineConsentita(origine: string): string | null {
  const pulita = origine.trim().replace(/\/+$/, "");
  if (ORIGINI.has(pulita) || pulita === getPublicAppUrl()) return pulita;
  return null;
}

async function gate() {
  const { auth } = await requireAreaAccess("promemorie-e-note");
  return auth;
}

export async function statoTrelloAction(): Promise<
  | { success: true; collegato: boolean; username: string; avatarUrl: string }
  | { success: false; error: string }
> {
  const auth = await gate();
  const service = createServiceClient();
  const { data, error } = await service
    .from("user_trello_credentials")
    .select("trello_username, trello_avatar_url, deleted_at")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  const row = data as {
    trello_username?: string;
    trello_avatar_url?: string;
    deleted_at?: string | null;
  } | null;
  if (!row || row.deleted_at) {
    return { success: true, collegato: false, username: "", avatarUrl: "" };
  }
  return {
    success: true,
    collegato: true,
    username: String(row.trello_username ?? ""),
    avatarUrl: String(row.trello_avatar_url ?? ""),
  };
}

export async function urlCollegamentoTrelloAction(
  origine: string
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  await gate();
  const cred = credenzialiOAuth();
  if (!cred) {
    return { success: false, error: "Mancano TRELLO_CLIENT_ID o TRELLO_CLIENT_SECRET sul server." };
  }
  if (!caveauConfigurato()) {
    return { success: false, error: "Manca CREDENTIALS_VAULT_KEY sul server." };
  }
  const base = origineConsentita(origine);
  if (!base) return { success: false, error: "Origine non consentita per il ritorno da Trello." };
  const { verifier, challenge } = sfidaPkce();
  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  const redirectUri = `${base}/trello/collega`;
  jar.set(COOKIE_PKCE, JSON.stringify({ state, verifier, redirectUri }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return {
    success: true,
    url: urlAutorizzazioneTrello({
      clientId: cred.clientId,
      redirectUri,
      challenge,
      state,
    }),
  };
}

export async function completaCollegamentoTrelloAction(
  code: string,
  state: string
): Promise<{ success: true; username: string } | { success: false; error: string }> {
  const auth = await gate();
  if (!caveauConfigurato()) {
    return { success: false, error: "Manca CREDENTIALS_VAULT_KEY sul server." };
  }
  const jar = await cookies();
  const grezzo = jar.get(COOKIE_PKCE)?.value ?? "";
  jar.delete(COOKIE_PKCE);
  let atteso: { state?: string; verifier?: string; redirectUri?: string } = {};
  try {
    atteso = JSON.parse(grezzo) as { state?: string; verifier?: string; redirectUri?: string };
  } catch {
    atteso = {};
  }
  const redirectOk = origineConsentita(
    String(atteso.redirectUri ?? "").replace(/\/trello\/collega$/, "")
  );
  if (!state || state !== atteso.state || !atteso.verifier || !redirectOk) {
    return { success: false, error: "Collegamento Trello scaduto. Riprova." };
  }
  const codice = code.trim();
  if (codice.length < 8 || codice.length > 2048 || /\s/.test(codice)) {
    return { success: false, error: "Autorizzazione Trello non valida." };
  }
  const scambio = await scambiaCodiceTrello({
    code: codice,
    verifier: atteso.verifier,
    redirectUri: `${redirectOk}/trello/collega`,
  });
  if (!scambio.ok) return { success: false, error: scambio.error };
  const profilo = await profiloTrello(scambio.valore.accessToken);
  if (!profilo.ok) return { success: false, error: profilo.error };

  const service = createServiceClient();
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + scambio.valore.expiresIn * 1000).toISOString();
  const salvato = await service.from("user_trello_credentials").upsert({
    user_id: auth.userId,
    trello_token: cifraPasswordCaveau(scambio.valore.accessToken),
    trello_refresh_token: cifraPasswordCaveau(scambio.valore.refreshToken),
    trello_access_expires_at: expires,
    trello_username: profilo.valore.username,
    trello_avatar_url: profilo.valore.avatarUrl,
    connected_at: now,
    created_by: auth.userId,
    updated_by: auth.userId,
    deleted_at: null,
    deleted_by: null,
  });
  if (salvato.error) return { success: false, error: salvato.error.message };
  await writeAuditLog({
    entity_type: "user_trello_credentials",
    entity_id: auth.userId,
    action: "update",
    actor_id: auth.actorUserId,
    summary: `Collegato account Trello @${profilo.valore.username}`,
    payload: { username: profilo.valore.username },
  });
  return { success: true, username: profilo.valore.username };
}

export async function scollegaTrelloAction(): Promise<
  { success: true } | { success: false; error: string }
> {
  const auth = await gate();
  const service = createServiceClient();
  const now = new Date().toISOString();
  const aggiornato = await service
    .from("user_trello_credentials")
    .update({
      trello_token: "",
      trello_refresh_token: "",
      trello_access_expires_at: null,
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("user_id", auth.userId)
    .select("user_id");
  if (aggiornato.error) return { success: false, error: aggiornato.error.message };
  if (!aggiornato.data?.length) return { success: true };
  await writeAuditLog({
    entity_type: "user_trello_credentials",
    entity_id: auth.userId,
    action: "soft_delete",
    actor_id: auth.actorUserId,
    summary: "Scollegato account Trello",
  });
  return { success: true };
}

export async function rilevaSchedeTrelloAction(): Promise<
  { success: true; nuove: number } | { success: false; error: string }
> {
  const auth = await getAuthContext();
  if (!auth?.isSecondFactorVerified) return { success: true, nuove: 0 };
  try {
    const nuove = await rilevaSchedeTrelloNuove(auth.userId);
    return { success: true, nuove };
  } catch {
    return { success: true, nuove: 0 };
  }
}

export async function bachecheTrelloAction(): Promise<
  | { success: true; bacheche: { id: string; nome: string }[] }
  | { success: false; error: string }
> {
  const auth = await gate();
  const res = await getUserBoards(auth.userId);
  if (!res.ok) return { success: false, error: res.error };
  return { success: true, bacheche: res.valore };
}

export async function listeTrelloAction(
  boardId: string
): Promise<
  | { success: true; liste: { id: string; nome: string }[] }
  | { success: false; error: string }
> {
  const auth = await gate();
  const res = await listeBachecaTrello(auth.userId, boardId);
  if (!res.ok) return { success: false, error: res.error };
  return { success: true, liste: res.valore };
}

export async function importaBachecaTrelloAction(
  boardId: string,
  listIds: string[]
): Promise<{ success: true; id: string; schede: number } | { success: false; error: string }> {
  const auth = await gate();
  const res = await importBoard(auth.userId, boardId, listIds);
  if (!res.ok) return { success: false, error: res.error };
  return { success: true, id: res.valore.id, schede: res.valore.schede };
}

export async function syncSchedaTrelloAction(
  schedaId: string
): Promise<{ success: true; creata: boolean } | { success: false; error: string }> {
  const auth = await gate();
  const res = await syncUserCard(auth.userId, schedaId);
  if (!res.ok) return { success: false, error: res.error };
  return { success: true, creata: res.valore.creata };
}
