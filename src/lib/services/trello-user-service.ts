import { createHash, randomBytes, randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/audit";
import {
  caveauConfigurato,
  cifraPasswordCaveau,
  decifraPasswordCaveau,
} from "@/lib/amministrazione/caveau-siti-crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const API = "https://api.trello.com/1";
const TOKEN_URL = "https://auth.atlassian.com/oauth/token";
export const TRELLO_OAUTH_SCOPES =
  "read:board:trello write:board:trello read:member:trello offline_access";

export type TokenOAuth = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

type Esito<T> = { ok: true; valore: T } | { ok: false; error: string };

function base64Url(value: Buffer): string {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function credenzialiOAuth():
  | { clientId: string; clientSecret: string }
  | null {
  const clientId = process.env.TRELLO_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.TRELLO_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function sfidaPkce(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function urlAutorizzazioneTrello(input: {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}): string {
  const url = new URL("https://auth.atlassian.com/authorize");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("scope", TRELLO_OAUTH_SCOPES);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function scambia(
  corpo: Record<string, string>
): Promise<Esito<TokenOAuth>> {
  const cred = credenzialiOAuth();
  if (!cred) {
    return { ok: false, error: "Mancano TRELLO_CLIENT_ID o TRELLO_CLIENT_SECRET sul server." };
  }
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: cred.clientId, client_secret: cred.clientSecret, ...corpo }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Trello non risponde." };
  }
  if (!response.ok) return { ok: false, error: "Trello ha rifiutato il collegamento." };
  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!json.access_token || !json.refresh_token) {
    return { ok: false, error: "Trello non ha restituito i token." };
  }
  return {
    ok: true,
    valore: {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresIn: Number(json.expires_in ?? 3600),
    },
  };
}

export function scambiaCodiceTrello(input: {
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<Esito<TokenOAuth>> {
  return scambia({
    grant_type: "authorization_code",
    code: input.code,
    code_verifier: input.verifier,
    redirect_uri: input.redirectUri,
  });
}

function rinnovaToken(refreshToken: string): Promise<Esito<TokenOAuth>> {
  return scambia({ grant_type: "refresh_token", refresh_token: refreshToken });
}
const COLORI: Record<string, string> = {
  green: "verde",
  yellow: "giallo",
  orange: "arancio",
  red: "rosso",
  purple: "viola",
  blue: "blu",
  sky: "azzurro",
  lime: "verde",
  pink: "rosa",
  black: "grigio",
};

export type TrelloBachecaRemota = { id: string; nome: string };
export type TrelloListaRemota = { id: string; nome: string };

async function inserisciABlocchi(
  client: { from: (table: string) => { insert: (rows: Record<string, unknown>[]) => PromiseLike<{ error: { message: string } | null }> } },
  tabella: string,
  righe: Record<string, unknown>[]
): Promise<string | null> {
  for (let i = 0; i < righe.length; i += 200) {
    const blocco = righe.slice(i, i + 200);
    if (!blocco.length) continue;
    const scritto = await client.from(tabella).insert(blocco);
    if (scritto.error) return scritto.error.message;
  }
  return null;
}

function idTrello(value: string): boolean {
  return /^[a-f0-9]{24}$/i.test(value);
}

function taglia(value: unknown, max: number, fallback: string): string {
  const testo = String(value ?? "").trim();
  const usato = testo || fallback;
  return usato.slice(0, max);
}

async function salvaToken(userId: string, token: TokenOAuth): Promise<void> {
  const service = createServiceClient();
  const expires = new Date(Date.now() + token.expiresIn * 1000).toISOString();
  await service
    .from("user_trello_credentials")
    .update({
      trello_token: cifraPasswordCaveau(token.accessToken),
      trello_refresh_token: cifraPasswordCaveau(token.refreshToken),
      trello_access_expires_at: expires,
      updated_by: userId,
    })
    .eq("user_id", userId)
    .is("deleted_at", null);
}

async function tokenDi(userId: string): Promise<string | null> {
  if (!caveauConfigurato()) return null;
  const service = createServiceClient();
  const { data } = await service
    .from("user_trello_credentials")
    .select("trello_token, trello_refresh_token, trello_access_expires_at, deleted_at")
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as {
    trello_token?: string;
    trello_refresh_token?: string;
    trello_access_expires_at?: string | null;
    deleted_at?: string | null;
  } | null;
  if (!row || row.deleted_at || !row.trello_token) return null;
  let access: string;
  try {
    access = decifraPasswordCaveau(row.trello_token);
  } catch {
    return null;
  }
  const scadenza = row.trello_access_expires_at
    ? new Date(row.trello_access_expires_at).getTime()
    : 0;
  if (scadenza - Date.now() > 120_000) return access;
  if (!row.trello_refresh_token) return null;
  let refresh: string;
  try {
    refresh = decifraPasswordCaveau(row.trello_refresh_token);
  } catch {
    return null;
  }
  const rinnovato = await rinnovaToken(refresh);
  if (!rinnovato.ok) return null;
  await salvaToken(userId, rinnovato.valore);
  return rinnovato.valore.accessToken;
}

async function chiama(
  token: string,
  method: "GET" | "POST" | "PUT",
  path: string,
  parametri: Record<string, string>
): Promise<Esito<unknown>> {
  const url = new URL(`${API}${path}`);
  for (const [nome, valore] of Object.entries(parametri)) {
    if (valore) url.searchParams.set(nome, valore);
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Trello non risponde." };
  }
  if (!response.ok) {
    return { ok: false, error: `Trello ha risposto ${response.status}.` };
  }
  return { ok: true, valore: await response.json() };
}

export async function profiloTrello(
  accessToken: string
): Promise<Esito<{ username: string; avatarUrl: string }>> {
  const res = await chiama(accessToken, "GET", "/members/me", {
    fields: "username,avatarUrl,avatarHash",
  });
  if (!res.ok) return res;
  const profilo = res.valore as {
    id?: string;
    username?: string;
    avatarUrl?: string | null;
    avatarHash?: string | null;
  };
  const username = String(profilo.username ?? "").trim().slice(0, 80);
  if (!username) return { ok: false, error: "Profilo Trello senza username." };
  let avatar = String(profilo.avatarUrl ?? "").trim();
  if (!avatar.startsWith("https://") && profilo.avatarHash && profilo.id) {
    avatar = `https://trello-members.s3.amazonaws.com/${profilo.id}/${profilo.avatarHash}/170.png`;
  }
  if (!avatar.startsWith("https://")) avatar = "";
  return { ok: true, valore: { username, avatarUrl: avatar } };
}

export async function getUserBoards(userId: string): Promise<Esito<TrelloBachecaRemota[]>> {
  const token = await tokenDi(userId);
  if (!token) return { ok: false, error: "Account Trello non collegato." };
  const res = await chiama(token, "GET", "/members/me/boards", {
    filter: "open",
    fields: "name",
  });
  if (!res.ok) return res;
  const rows = Array.isArray(res.valore) ? res.valore : [];
  return {
    ok: true,
    valore: rows
      .map((row) => ({
        id: String((row as { id?: string }).id ?? ""),
        nome: taglia((row as { name?: string }).name, 160, "Bacheca"),
      }))
      .filter((row) => idTrello(row.id)),
  };
}

export async function listeBachecaTrello(
  userId: string,
  boardId: string
): Promise<Esito<TrelloListaRemota[]>> {
  if (!idTrello(boardId)) return { ok: false, error: "Bacheca non valida." };
  const token = await tokenDi(userId);
  if (!token) return { ok: false, error: "Account Trello non collegato." };
  const res = await chiama(token, "GET", `/boards/${boardId}/lists`, {
    filter: "open",
    fields: "name,pos",
  });
  if (!res.ok) return res;
  const rows = Array.isArray(res.valore) ? res.valore : [];
  return {
    ok: true,
    valore: rows
      .map((row) => ({
        id: String((row as { id?: string }).id ?? ""),
        nome: taglia((row as { name?: string }).name, 160, "Lista"),
        pos: Number((row as { pos?: number }).pos ?? 0),
      }))
      .filter((row) => idTrello(row.id))
      .sort((a, b) => a.pos - b.pos)
      .map(({ id, nome }) => ({ id, nome })),
  };
}

type SchedaTrello = {
  id: string;
  name?: string;
  desc?: string;
  due?: string | null;
  dueComplete?: boolean;
  idList?: string;
  pos?: number;
  labels?: ({ id?: string } | string)[];
  closed?: boolean;
};

type ChecklistTrello = {
  id?: string;
  name?: string;
  idCard?: string;
  checkItems?: { name?: string; state?: string; pos?: number }[];
};

export async function importBoard(
  userId: string,
  boardId: string,
  listIds: string[]
): Promise<Esito<{ id: string; schede: number }>> {
  if (!idTrello(boardId)) return { ok: false, error: "Bacheca non valida." };
  const scelte = [...new Set(listIds.filter(idTrello))];
  if (!scelte.length) return { ok: false, error: "Seleziona almeno una lista." };
  if (scelte.length > 40) return { ok: false, error: "Puoi importare al massimo 40 liste." };
  const token = await tokenDi(userId);
  if (!token) return { ok: false, error: "Account Trello non collegato." };

  const service = createServiceClient();
  const gia = await service
    .from("kb_trello_collegamenti")
    .select("entita_id")
    .eq("user_id", userId)
    .eq("entita", "bacheca")
    .eq("trello_id", boardId)
    .is("deleted_at", null)
    .maybeSingle();
  if (gia.data) {
    return { ok: false, error: "Questa bacheca Trello è già stata importata." };
  }

  const remoto = await chiama(token, "GET", `/boards/${boardId}`, {
    fields: "name,desc",
    lists: "open",
    list_fields: "name,pos",
    cards: "open",
    card_fields: "name,desc,due,dueComplete,idList,pos,labels,closed",
    labels: "all",
    label_fields: "name,color",
    checklists: "all",
    checklist_fields: "name,idCard",
    checkItem_fields: "name,state,pos",
  });
  if (!remoto.ok) return remoto;
  const board = remoto.valore as {
    name?: string;
    desc?: string;
    lists?: { id?: string; name?: string; pos?: number; closed?: boolean }[];
    cards?: SchedaTrello[];
    labels?: { id?: string; name?: string; color?: string }[];
    checklists?: ChecklistTrello[];
  };

  const liste = (board.lists ?? [])
    .filter((lista) => !lista.closed && scelte.includes(String(lista.id ?? "")))
    .sort((a, b) => Number(a.pos ?? 0) - Number(b.pos ?? 0));
  if (!liste.length) return { ok: false, error: "Nessuna delle liste scelte è ancora aperta su Trello." };

  const listaIds = new Set(liste.map((lista) => String(lista.id)));
  const schede = (board.cards ?? [])
    .filter((card) => !card.closed && listaIds.has(String(card.idList ?? "")) && idTrello(String(card.id ?? "")))
    .sort((a, b) => Number(a.pos ?? 0) - Number(b.pos ?? 0));

  const supabase = await createClient();
  const bachecaId = randomUUID();
  const nowUser = { created_by: userId, updated_by: userId };
  const creata = await supabase.from("kb_bacheche").insert({
    id: bachecaId,
    titolo: taglia(board.name, 160, "Bacheca Trello"),
    descrizione: taglia(board.desc, 4000, ""),
    documento_stato: "approvato",
    ...nowUser,
  });
  if (creata.error) return { ok: false, error: creata.error.message };

  const mappaListe = new Map<string, string>();
  const righeListe = liste.map((lista, index) => {
    const id = randomUUID();
    mappaListe.set(String(lista.id), id);
    return {
      id,
      bacheca_id: bachecaId,
      titolo: taglia(lista.name, 160, "Lista"),
      sort_order: index,
      ...nowUser,
    };
  });
  const listeIns = await supabase.from("kb_liste").insert(righeListe);
  if (listeIns.error) return { ok: false, error: listeIns.error.message };

  const mappaEtichette = new Map<string, string>();
  const etichetteRemote = (board.labels ?? []).filter((etichetta) => idTrello(String(etichetta.id ?? "")));
  if (etichetteRemote.length) {
    const righeEtichette = etichetteRemote.map((etichetta) => {
      const id = randomUUID();
      mappaEtichette.set(String(etichetta.id), id);
      const nome = taglia(etichetta.name, 40, "");
      return {
        id,
        bacheca_id: bachecaId,
        nome: nome || taglia(COLORI[String(etichetta.color ?? "")] ?? "Etichetta", 40, "Etichetta"),
        colore: COLORI[String(etichetta.color ?? "")] ?? "grigio",
        ...nowUser,
      };
    });
    const etichetteIns = await supabase.from("kb_etichette").insert(righeEtichette);
    if (etichetteIns.error) return { ok: false, error: etichetteIns.error.message };
  }

  const mappaSchede = new Map<string, string>();
  const pontiEtichette: { scheda_id: string; etichetta_id: string; created_by: string }[] = [];
  const righeSchede = schede.map((card, index) => {
    const id = randomUUID();
    const trelloId = String(card.id);
    mappaSchede.set(trelloId, id);
    const listaId = mappaListe.get(String(card.idList ?? ""));
    const scadenza = card.due ? new Date(card.due) : null;
    for (const etichetta of card.labels ?? []) {
      const trelloEtichetta = typeof etichetta === "string" ? etichetta : String(etichetta.id ?? "");
      const locale = mappaEtichette.get(trelloEtichetta);
      if (locale) pontiEtichette.push({ scheda_id: id, etichetta_id: locale, created_by: userId });
    }
    return {
      id,
      bacheca_id: bachecaId,
      lista_id: listaId,
      titolo: taglia(card.name, 240, "Scheda"),
      descrizione: taglia(card.desc, 8000, ""),
      scadenza_at: scadenza && !Number.isNaN(scadenza.getTime()) ? scadenza.toISOString() : null,
      scadenza_completata: Boolean(card.dueComplete),
      sort_order: index,
      documento_stato: "approvato",
      ...nowUser,
    };
  });
  const erroreSchede = await inserisciABlocchi(supabase, "kb_schede", righeSchede);
  if (erroreSchede) return { ok: false, error: erroreSchede };
  const errorePonti = await inserisciABlocchi(supabase, "kb_scheda_etichette", pontiEtichette);
  if (errorePonti) return { ok: false, error: errorePonti };

  const collegamenti: {
    user_id: string;
    entita: string;
    entita_id: string;
    trello_id: string;
    trello_board_id: string;
    created_by: string;
    updated_by: string;
  }[] = [
    {
      user_id: userId,
      entita: "bacheca",
      entita_id: bachecaId,
      trello_id: boardId,
      trello_board_id: boardId,
      created_by: userId,
      updated_by: userId,
    },
  ];
  for (const [trelloId, entitaId] of mappaListe) {
    collegamenti.push({
      user_id: userId,
      entita: "lista",
      entita_id: entitaId,
      trello_id: trelloId,
      trello_board_id: boardId,
      created_by: userId,
      updated_by: userId,
    });
  }
  for (const [trelloId, entitaId] of mappaEtichette) {
    collegamenti.push({
      user_id: userId,
      entita: "etichetta",
      entita_id: entitaId,
      trello_id: trelloId,
      trello_board_id: boardId,
      created_by: userId,
      updated_by: userId,
    });
  }
  for (const [trelloId, entitaId] of mappaSchede) {
    collegamenti.push({
      user_id: userId,
      entita: "scheda",
      entita_id: entitaId,
      trello_id: trelloId,
      trello_board_id: boardId,
      created_by: userId,
      updated_by: userId,
    });
  }

  const righeChecklist: Record<string, unknown>[] = [];
  const righeVoci: Record<string, unknown>[] = [];
  for (const checklist of board.checklists ?? []) {
    const schedaId = mappaSchede.get(String(checklist.idCard ?? ""));
    if (!schedaId) continue;
    const checklistId = randomUUID();
    righeChecklist.push({
      id: checklistId,
      scheda_id: schedaId,
      titolo: taglia(checklist.name, 160, "Checklist"),
      sort_order: 0,
      ...nowUser,
    });
    for (const [index, voce] of (checklist.checkItems ?? [])
      .filter((item) => String(item.name ?? "").trim())
      .sort((a, b) => Number(a.pos ?? 0) - Number(b.pos ?? 0))
      .entries()) {
      righeVoci.push({
        checklist_id: checklistId,
        testo: taglia(voce.name, 400, "Voce"),
        fatto: voce.state === "complete",
        sort_order: index,
        ...nowUser,
      });
    }
    if (idTrello(String(checklist.id ?? ""))) {
      collegamenti.push({
        user_id: userId,
        entita: "checklist",
        entita_id: checklistId,
        trello_id: String(checklist.id),
        trello_board_id: boardId,
        created_by: userId,
        updated_by: userId,
      });
    }
  }
  const erroreChecklist = await inserisciABlocchi(supabase, "kb_checklist", righeChecklist);
  if (erroreChecklist) return { ok: false, error: erroreChecklist };
  const erroreVoci = await inserisciABlocchi(supabase, "kb_checklist_voci", righeVoci);
  if (erroreVoci) return { ok: false, error: erroreVoci };

  const erroreLink = await inserisciABlocchi(service, "kb_trello_collegamenti", collegamenti);
  if (erroreLink) return { ok: false, error: erroreLink };

  const titolo = taglia(board.name, 160, "Bacheca Trello");
  await supabase.from("kb_storico").insert({
    bacheca_id: bachecaId,
    actor_id: userId,
    summary: `Importata da Trello la bacheca «${titolo}» con ${schede.length} schede`,
  });
  await writeAuditLog({
    entity_type: "kb_bacheche",
    entity_id: bachecaId,
    action: "create",
    actor_id: userId,
    summary: `Importata bacheca Trello «${titolo}»`,
    payload: { trello_board_id: boardId, schede: schede.length, liste: liste.length },
  });
  return { ok: true, valore: { id: bachecaId, schede: schede.length } };
}

export async function syncUserCard(
  userId: string,
  schedaId: string
): Promise<Esito<{ creata: boolean }>> {
  const token = await tokenDi(userId);
  if (!token) return { ok: false, error: "Account Trello non collegato." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kb_schede")
    .select("id, titolo, descrizione, lista_id, scadenza_at, bacheca_id, deleted_at")
    .eq("id", schedaId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  const scheda = data as {
    id: string;
    titolo: string;
    descrizione: string;
    lista_id: string;
    scadenza_at: string | null;
    bacheca_id: string;
    deleted_at: string | null;
  } | null;
  if (!scheda || scheda.deleted_at) return { ok: false, error: "Scheda non trovata." };

  const service = createServiceClient();
  const [schedaLink, listaLink] = await Promise.all([
    service
      .from("kb_trello_collegamenti")
      .select("trello_id, trello_board_id")
      .eq("user_id", userId)
      .eq("entita", "scheda")
      .eq("entita_id", scheda.id)
      .is("deleted_at", null)
      .maybeSingle(),
    service
      .from("kb_trello_collegamenti")
      .select("trello_id, trello_board_id")
      .eq("user_id", userId)
      .eq("entita", "lista")
      .eq("entita_id", scheda.lista_id)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);
  const cardId = String((schedaLink.data as { trello_id?: string } | null)?.trello_id ?? "");
  const listId = String((listaLink.data as { trello_id?: string } | null)?.trello_id ?? "");
  const boardId = String(
    (schedaLink.data as { trello_board_id?: string } | null)?.trello_board_id ??
      (listaLink.data as { trello_board_id?: string } | null)?.trello_board_id ??
      ""
  );
  const campi: Record<string, string> = {
    name: taglia(scheda.titolo, 240, "Scheda"),
    desc: taglia(scheda.descrizione, 8000, ""),
  };
  if (scheda.scadenza_at) campi.due = scheda.scadenza_at;
  if (idTrello(listId)) campi.idList = listId;

  if (idTrello(cardId)) {
    const aggiornata = await chiama(token, "PUT", `/cards/${cardId}`, campi);
    if (!aggiornata.ok) return aggiornata;
    await writeAuditLog({
      entity_type: "kb_schede",
      entity_id: scheda.id,
      action: "update",
      actor_id: userId,
      summary: `Scheda «${campi.name}» aggiornata su Trello`,
      payload: { bachecaId: scheda.bacheca_id },
    });
    return { ok: true, valore: { creata: false } };
  }

  if (!idTrello(listId)) {
    return {
      ok: false,
      error: "Questa lista non è collegata a Trello. Importa la bacheca e scegli una lista importata.",
    };
  }
  const creata = await chiama(token, "POST", "/cards", campi);
  if (!creata.ok) return creata;
  const nuovoId = String((creata.valore as { id?: string }).id ?? "");
  if (!idTrello(nuovoId)) return { ok: false, error: "Trello non ha restituito la scheda." };
  const insert = await service.from("kb_trello_collegamenti").insert({
    user_id: userId,
    entita: "scheda",
    entita_id: scheda.id,
    trello_id: nuovoId,
    trello_board_id: boardId,
    created_by: userId,
    updated_by: userId,
  });
  if (insert.error) return { ok: false, error: insert.error.message };
  await writeAuditLog({
    entity_type: "kb_schede",
    entity_id: scheda.id,
    action: "create",
    actor_id: userId,
    summary: `Scheda «${campi.name}» creata su Trello`,
    payload: { bachecaId: scheda.bacheca_id },
  });
  return { ok: true, valore: { creata: true } };
}
