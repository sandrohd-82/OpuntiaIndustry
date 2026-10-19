"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getPublicAppUrl } from "@/lib/auth/app-url";
import { caveauConfigurato, cifraPasswordCaveau } from "@/lib/amministrazione/caveau-siti-crypto";
import {
  getUserBoards,
  importBoard,
  listeBachecaTrello,
  syncUserCard,
} from "@/lib/services/trello-user-service";
import { createServiceClient } from "@/lib/supabase/server";

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
  const key = process.env.TRELLO_API_KEY?.trim() ?? "";
  if (!key) return { success: false, error: "Manca TRELLO_API_KEY sul server." };
  if (!caveauConfigurato()) {
    return { success: false, error: "Manca CREDENTIALS_VAULT_KEY sul server." };
  }
  const base = origineConsentita(origine);
  if (!base) return { success: false, error: "Origine non consentita per il ritorno da Trello." };
  const url = new URL("https://trello.com/1/authorize");
  url.searchParams.set("expiration", "never");
  url.searchParams.set("name", "OpuntiaIndustry");
  url.searchParams.set("scope", "read,write");
  url.searchParams.set("callback_method", "fragment");
  url.searchParams.set("return_url", `${base}/trello/collega`);
  url.searchParams.set("key", key);
  return { success: true, url: url.toString() };
}

export async function salvaTokenTrelloAction(
  token: string
): Promise<{ success: true; username: string } | { success: false; error: string }> {
  const auth = await gate();
  const valore = token.trim();
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(valore)) {
    return { success: false, error: "Token Trello non valido." };
  }
  if (!caveauConfigurato()) {
    return { success: false, error: "Manca CREDENTIALS_VAULT_KEY sul server." };
  }
  const key = process.env.TRELLO_API_KEY?.trim() ?? "";
  if (!key) return { success: false, error: "Manca TRELLO_API_KEY sul server." };

  const profiloUrl = new URL("https://api.trello.com/1/members/me");
  profiloUrl.searchParams.set("key", key);
  profiloUrl.searchParams.set("token", valore);
  profiloUrl.searchParams.set("fields", "username,avatarUrl,avatarHash");
  let response: Response;
  try {
    response = await fetch(profiloUrl, { cache: "no-store" });
  } catch {
    return { success: false, error: "Trello non risponde." };
  }
  if (!response.ok) return { success: false, error: "Trello ha rifiutato il collegamento." };
  const profilo = (await response.json()) as {
    username?: string;
    avatarUrl?: string | null;
    avatarHash?: string | null;
    id?: string;
  };
  const username = String(profilo.username ?? "").trim().slice(0, 80);
  if (!username) return { success: false, error: "Profilo Trello senza username." };
  let avatar = String(profilo.avatarUrl ?? "").trim();
  if (!avatar.startsWith("https://") && profilo.avatarHash && profilo.id) {
    avatar = `https://trello-members.s3.amazonaws.com/${profilo.id}/${profilo.avatarHash}/170.png`;
  }
  if (!avatar.startsWith("https://")) avatar = "";

  const service = createServiceClient();
  const cifrato = cifraPasswordCaveau(valore);
  const now = new Date().toISOString();
  const salvato = await service.from("user_trello_credentials").upsert({
    user_id: auth.userId,
    trello_token: cifrato,
    trello_username: username,
    trello_avatar_url: avatar,
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
    summary: `Collegato account Trello @${username}`,
    payload: { username },
  });
  return { success: true, username };
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
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("user_id", auth.userId);
  if (aggiornato.error) return { success: false, error: aggiornato.error.message };
  await writeAuditLog({
    entity_type: "user_trello_credentials",
    entity_id: auth.userId,
    action: "soft_delete",
    actor_id: auth.actorUserId,
    summary: "Scollegato account Trello",
  });
  return { success: true };
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
