import { randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/audit";
import {
  caveauConfigurato,
  cifraPasswordCaveau,
  decifraPasswordCaveau,
} from "@/lib/amministrazione/caveau-siti-crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const API = "https://api.trello.com/1";
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

type Esito<T> = { ok: true; valore: T } | { ok: false; error: string };

function idTrello(value: string): boolean {
  return /^[a-f0-9]{24}$/i.test(value);
}

function taglia(value: unknown, max: number, fallback: string): string {
  const testo = String(value ?? "").trim();
  const usato = testo || fallback;
  return usato.slice(0, max);
}

function chiaveApi(): string | null {
  const key = process.env.TRELLO_API_KEY?.trim() ?? "";
  return key || null;
}

async function tokenDi(userId: string): Promise<string | null> {
  if (!caveauConfigurato()) return null;
  const service = createServiceClient();
  const { data } = await service
    .from("user_trello_credentials")
    .select("trello_token, deleted_at")
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as { trello_token?: string; deleted_at?: string | null } | null;
  if (!row || row.deleted_at || !row.trello_token) return null;
  try {
    return decifraPasswordCaveau(row.trello_token);
  } catch {
    return null;
  }
}

async function chiama(
  token: string,
  method: "GET" | "POST" | "PUT",
  path: string,
  parametri: Record<string, string>
): Promise<Esito<unknown>> {
  const key = chiaveApi();
  if (!key) return { ok: false, error: "Manca TRELLO_API_KEY sul server." };
  const url = new URL(`${API}${path}`);
  url.searchParams.set("key", key);
  url.searchParams.set("token", token);
  for (const [nome, valore] of Object.entries(parametri)) {
    url.searchParams.set(nome, valore);
  }
  let response: Response;
  try {
    response = await fetch(url, { method, cache: "no-store" });
  } catch {
    return { ok: false, error: "Trello non risponde." };
  }
  if (!response.ok) {
    return { ok: false, error: `Trello ha risposto ${response.status}.` };
  }
  return { ok: true, valore: await response.json() };
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
  if (schede.length > 400) {
    return { ok: false, error: "La selezione supera 400 schede. Importa meno liste." };
  }

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
  if (righeSchede.length) {
    const schedeIns = await supabase.from("kb_schede").insert(righeSchede);
    if (schedeIns.error) return { ok: false, error: schedeIns.error.message };
  }
  if (pontiEtichette.length) {
    await supabase.from("kb_scheda_etichette").insert(pontiEtichette);
  }

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

  for (const checklist of board.checklists ?? []) {
    const schedaId = mappaSchede.get(String(checklist.idCard ?? ""));
    if (!schedaId) continue;
    const checklistId = randomUUID();
    const ins = await supabase.from("kb_checklist").insert({
      id: checklistId,
      scheda_id: schedaId,
      titolo: taglia(checklist.name, 160, "Checklist"),
      sort_order: 0,
      ...nowUser,
    });
    if (ins.error) continue;
    const voci = (checklist.checkItems ?? [])
      .filter((voce) => String(voce.name ?? "").trim())
      .sort((a, b) => Number(a.pos ?? 0) - Number(b.pos ?? 0))
      .map((voce, index) => ({
        checklist_id: checklistId,
        testo: taglia(voce.name, 400, "Voce"),
        fatto: voce.state === "complete",
        sort_order: index,
        ...nowUser,
      }));
    if (voci.length) await supabase.from("kb_checklist_voci").insert(voci);
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

  const linkIns = await service.from("kb_trello_collegamenti").insert(collegamenti);
  if (linkIns.error) return { ok: false, error: linkIns.error.message };

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
