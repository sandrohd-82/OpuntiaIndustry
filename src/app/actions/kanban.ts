"use server";

import { randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import type {
  KbAllegato,
  KbBachecaPayload,
  KbChecklist,
  KbCommento,
  KbEtichetta,
  KbLista,
  KbOperatore,
  KbScheda,
  KbStoricoRiga,
} from "@/lib/kanban/types";
import { dispatchNotifiche } from "@/lib/notifiche/dispatch";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const BUCKET = "kb-bacheche";
const MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

type Ok = { success: true };
type Err = { success: false; error: string };

async function gate() {
  const { auth } = await requireAreaAccess("promemorie-e-note");
  return auth;
}

function nomeDi(profile: {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}): string {
  const composto = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return composto || profile.full_name?.trim() || profile.email || "Operatore";
}

function nomeRiga(row: {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}): string {
  return nomeDi(row);
}

async function storico(
  bachecaId: string,
  schedaId: string | null,
  actorId: string,
  summary: string,
  action: "create" | "update" | "status_change" | "soft_delete" | "attachment_upload" | "attachment_remove"
) {
  const supabase = await createClient();
  await supabase.from("kb_storico").insert({
    bacheca_id: bachecaId,
    scheda_id: schedaId,
    actor_id: actorId,
    summary,
  });
  await writeAuditLog({
    entity_type: "kb_bacheche",
    entity_id: schedaId ?? bachecaId,
    action,
    actor_id: actorId,
    summary,
    payload: { bachecaId, schedaId },
  });
}

async function avvisa(input: {
  actorId: string;
  schedaId: string;
  bachecaId: string;
  title: string;
  body: string;
  extraIds?: string[];
  tipo?: "attivita" | "scadenza";
}) {
  const supabase = await createClient();
  const [seguaci, membri] = await Promise.all([
    supabase.from("kb_seguaci").select("user_id").eq("scheda_id", input.schedaId),
    supabase.from("kb_scheda_membri").select("user_id").eq("scheda_id", input.schedaId),
  ]);
  const ids = [
    ...(seguaci.data ?? []).map((r) => String(r.user_id)),
    ...(membri.data ?? []).map((r) => String(r.user_id)),
    ...(input.extraIds ?? []),
  ];
  const recipientIds = [...new Set(ids)].filter((id) => id && id !== input.actorId);
  if (!recipientIds.length) return;
  await dispatchNotifiche({
    actorId: input.actorId,
    recipientIds,
    tipo: input.tipo ?? "attivita",
    title: input.title,
    body: input.body,
    href: `/app/promemorie-e-note/bacheche/${input.bachecaId}?scheda=${input.schedaId}`,
    entityType: "kb_schede",
    entityId: input.schedaId,
    payload: {},
  });
}

function istantePromemoria(scadenza: string, anticipo: string): string | null {
  if (!anticipo) return null;
  const base = new Date(scadenza).getTime();
  if (!Number.isFinite(base)) return null;
  const delta =
    anticipo === "15m"
      ? 15 * 60 * 1000
      : anticipo === "1h"
        ? 60 * 60 * 1000
        : anticipo === "1d"
          ? 24 * 60 * 60 * 1000
          : anticipo === "2d"
            ? 2 * 24 * 60 * 60 * 1000
            : 0;
  return new Date(base - delta).toISOString();
}

async function syncPromemoria(schedaId: string, actorId: string) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  await supabase
    .from("kb_promemoria")
    .update({ deleted_at: now, deleted_by: actorId, updated_by: actorId })
    .eq("scheda_id", schedaId)
    .is("sent_at", null)
    .is("deleted_at", null);
  const { data: scheda } = await supabase
    .from("kb_schede")
    .select("scadenza_at, anticipo, scadenza_completata, archived_at, created_by")
    .eq("id", schedaId)
    .maybeSingle();
  if (!scheda?.scadenza_at || !scheda.anticipo || scheda.scadenza_completata || scheda.archived_at) {
    return;
  }
  const notifyAt = istantePromemoria(String(scheda.scadenza_at), String(scheda.anticipo));
  if (!notifyAt) return;
  const [membri, seguaci] = await Promise.all([
    supabase.from("kb_scheda_membri").select("user_id").eq("scheda_id", schedaId),
    supabase.from("kb_seguaci").select("user_id").eq("scheda_id", schedaId),
  ]);
  const ids = new Set<string>();
  if (scheda.created_by) ids.add(String(scheda.created_by));
  for (const row of membri.data ?? []) ids.add(String(row.user_id));
  for (const row of seguaci.data ?? []) ids.add(String(row.user_id));
  if (!ids.size) return;
  await supabase.from("kb_promemoria").insert(
    [...ids].map((destinatario_id) => ({
      scheda_id: schedaId,
      notify_at: notifyAt,
      destinatario_id,
      created_by: actorId,
      updated_by: actorId,
    }))
  );
}

async function operatori(): Promise<KbOperatore[]> {
  const service = createServiceClient();
  const { data } = await service
    .from("profiles")
    .select("id, full_name, first_name, last_name, email")
    .eq("is_active", true)
    .order("full_name", { ascending: true })
    .limit(200);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    nome: nomeRiga(row),
  }));
}

export async function listBachecheAction(): Promise<
  { success: true; aperte: { id: string; titolo: string; descrizione: string }[]; archiviate: { id: string; titolo: string }[] } | Err
> {
  await gate();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kb_bacheche")
    .select("id, titolo, descrizione, archived_at")
    .is("deleted_at", null)
    .is("purged_at", null)
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  const aperte = [];
  const archiviate = [];
  for (const row of data ?? []) {
    if (row.archived_at) archiviate.push({ id: String(row.id), titolo: String(row.titolo) });
    else {
      aperte.push({
        id: String(row.id),
        titolo: String(row.titolo),
        descrizione: String(row.descrizione ?? ""),
      });
    }
  }
  return { success: true, aperte, archiviate };
}

export async function creaBachecaAction(titolo: string): Promise<{ success: true; id: string } | Err> {
  const auth = await gate();
  const nome = titolo.trim();
  if (nome.length < 1 || nome.length > 160) {
    return { success: false, error: "Il titolo della bacheca è obbligatorio." };
  }
  const supabase = await createClient();
  const id = randomUUID();
  const inserted = await supabase.from("kb_bacheche").insert({
    id,
    titolo: nome,
    documento_stato: "approvato",
    created_by: auth.userId,
    updated_by: auth.userId,
  });
  if (inserted.error) return { success: false, error: inserted.error.message };
  const liste = ["Da fare", "In corso", "Fatto"].map((voce, index) => ({
    id: randomUUID(),
    bacheca_id: id,
    titolo: voce,
    sort_order: index,
    created_by: auth.userId,
    updated_by: auth.userId,
  }));
  const listeIns = await supabase.from("kb_liste").insert(liste);
  if (listeIns.error) return { success: false, error: listeIns.error.message };
  const etichette = [
    ["Urgente", "rosso"],
    ["Manutenzione", "arancio"],
    ["Lotto", "blu"],
    ["Sicurezza", "verde"],
  ].map(([etichetta, colore]) => ({
    bacheca_id: id,
    nome: etichetta,
    colore,
    created_by: auth.userId,
    updated_by: auth.userId,
  }));
  await supabase.from("kb_etichette").insert(etichette);
  await storico(id, null, auth.userId, `${nomeDi(auth.profile)} ha creato la bacheca «${nome}»`, "create");
  return { success: true, id };
}

export async function archiviaBachecaAction(id: string, ripristina = false): Promise<Ok | Err> {
  const auth = await gate();
  const supabase = await createClient();
  const now = new Date().toISOString();
  const updated = await supabase
    .from("kb_bacheche")
    .update({
      archived_at: ripristina ? null : now,
      documento_stato: ripristina ? "approvato" : "chiuso",
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (updated.error) return { success: false, error: updated.error.message };
  await storico(
    id,
    null,
    auth.userId,
    ripristina
      ? `${nomeDi(auth.profile)} ha riaperto la bacheca`
      : `${nomeDi(auth.profile)} ha archiviato la bacheca`,
    "status_change"
  );
  return { success: true };
}

export async function getBachecaAction(id: string): Promise<{ success: true; payload: KbBachecaPayload } | Err> {
  const auth = await gate();
  const supabase = await createClient();
  const { data: board, error } = await supabase
    .from("kb_bacheche")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .is("purged_at", null)
    .maybeSingle();
  if (error || !board) return { success: false, error: error?.message ?? "Bacheca non trovata." };
  const [listeRes, schedeRes, etichetteRes] = await Promise.all([
    supabase.from("kb_liste").select("*").eq("bacheca_id", id).is("deleted_at", null).is("purged_at", null).order("sort_order"),
    supabase.from("kb_schede").select("*").eq("bacheca_id", id).is("deleted_at", null).is("purged_at", null).order("sort_order"),
    supabase.from("kb_etichette").select("*").eq("bacheca_id", id).is("deleted_at", null).order("nome"),
  ]);
  if (listeRes.error) return { success: false, error: listeRes.error.message };
  if (schedeRes.error) return { success: false, error: schedeRes.error.message };
  const schedeIds = (schedeRes.data ?? []).map((row) => String(row.id));
  const [legami, membri, seguaci, checkRes] = await Promise.all([
    schedeIds.length
      ? supabase.from("kb_scheda_etichette").select("scheda_id, etichetta_id").in("scheda_id", schedeIds)
      : Promise.resolve({ data: [], error: null }),
    schedeIds.length
      ? supabase.from("kb_scheda_membri").select("scheda_id, user_id").in("scheda_id", schedeIds)
      : Promise.resolve({ data: [], error: null }),
    schedeIds.length
      ? supabase.from("kb_seguaci").select("scheda_id, user_id").in("scheda_id", schedeIds)
      : Promise.resolve({ data: [], error: null }),
    schedeIds.length
      ? supabase.from("kb_checklist").select("*").in("scheda_id", schedeIds).is("deleted_at", null).order("sort_order")
      : Promise.resolve({ data: [], error: null }),
  ]);
  const checkIds = (checkRes.data ?? []).map((row) => String(row.id));
  const vociRes = checkIds.length
    ? await supabase.from("kb_checklist_voci").select("*").in("checklist_id", checkIds).is("deleted_at", null).order("sort_order")
    : { data: [], error: null };
  const allegatiRes = schedeIds.length
    ? await supabase
        .from("kb_allegati")
        .select("id, scheda_id, file_name, content_type, byte_size")
        .in("scheda_id", schedeIds)
        .is("deleted_at", null)
    : { data: [], error: null };
  const service = createServiceClient();
  const copertine = new Map<string, string>();
  for (const row of schedeRes.data ?? []) {
    const path = String(row.copertina_path ?? "");
    if (!path) continue;
    const signed = await service.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (signed.data?.signedUrl) copertine.set(String(row.id), signed.data.signedUrl);
  }
  const etichetteDi = new Map<string, string[]>();
  for (const row of legami.data ?? []) {
    const key = String(row.scheda_id);
    const list = etichetteDi.get(key) ?? [];
    list.push(String(row.etichetta_id));
    etichetteDi.set(key, list);
  }
  const membriDi = new Map<string, string[]>();
  for (const row of membri.data ?? []) {
    const key = String(row.scheda_id);
    const list = membriDi.get(key) ?? [];
    list.push(String(row.user_id));
    membriDi.set(key, list);
  }
  const seguiti = new Set(
    (seguaci.data ?? [])
      .filter((row) => String(row.user_id) === auth.userId)
      .map((row) => String(row.scheda_id))
  );
  const voci = vociRes.data ?? [];
  const checklist: KbChecklist[] = (checkRes.data ?? []).map((row) => ({
    id: String(row.id),
    schedaId: String(row.scheda_id),
    titolo: String(row.titolo),
    sortOrder: Number(row.sort_order ?? 0),
    voci: voci
      .filter((voce) => String(voce.checklist_id) === String(row.id))
      .map((voce) => ({
        id: String(voce.id),
        checklistId: String(voce.checklist_id),
        testo: String(voce.testo),
        fatto: Boolean(voce.fatto),
        scadenzaAt: voce.scadenza_at ? String(voce.scadenza_at) : null,
        assegnatoId: voce.assegnato_id ? String(voce.assegnato_id) : null,
        sortOrder: Number(voce.sort_order ?? 0),
      })),
  }));
  const progress = new Map<string, { fatte: number; tot: number }>();
  for (const lista of checklist) {
    const current = progress.get(lista.schedaId) ?? { fatte: 0, tot: 0 };
    current.tot += lista.voci.length;
    current.fatte += lista.voci.filter((voce) => voce.fatto).length;
    progress.set(lista.schedaId, current);
  }
  const allegati: Record<string, KbAllegato[]> = {};
  for (const row of allegatiRes.data ?? []) {
    const key = String(row.scheda_id);
    const list = allegati[key] ?? [];
    list.push({
      id: String(row.id),
      fileName: String(row.file_name),
      contentType: String(row.content_type),
      byteSize: Number(row.byte_size),
    });
    allegati[key] = list;
  }
  const schede: KbScheda[] = (schedeRes.data ?? []).map((row) => {
    const sid = String(row.id);
    const prog = progress.get(sid) ?? { fatte: 0, tot: 0 };
    return {
      id: sid,
      listaId: String(row.lista_id),
      titolo: String(row.titolo),
      descrizione: String(row.descrizione ?? ""),
      isTemplate: Boolean(row.is_template),
      inizioAt: row.inizio_at ? String(row.inizio_at) : null,
      scadenzaAt: row.scadenza_at ? String(row.scadenza_at) : null,
      scadenzaCompletata: Boolean(row.scadenza_completata),
      anticipo: String(row.anticipo ?? ""),
      copertinaColore: String(row.copertina_colore ?? ""),
      copertinaUrl: copertine.get(sid) ?? "",
      sortOrder: Number(row.sort_order ?? 0),
      archivedAt: row.archived_at ? String(row.archived_at) : null,
      etichettaIds: etichetteDi.get(sid) ?? [],
      membroIds: membriDi.get(sid) ?? [],
      seguito: seguiti.has(sid),
      checkFatte: prog.fatte,
      checkTotali: prog.tot,
    };
  });
  const liste: KbLista[] = (listeRes.data ?? []).map((row) => ({
    id: String(row.id),
    titolo: String(row.titolo),
    sortOrder: Number(row.sort_order ?? 0),
    archivedAt: row.archived_at ? String(row.archived_at) : null,
  }));
  const etichette: KbEtichetta[] = (etichetteRes.data ?? []).map((row) => ({
    id: String(row.id),
    nome: String(row.nome),
    colore: String(row.colore),
  }));
  return {
    success: true,
    payload: {
      bacheca: {
        id: String(board.id),
        titolo: String(board.titolo),
        descrizione: String(board.descrizione ?? ""),
        etichetteEstese: Boolean(board.etichette_estese),
        archivedAt: board.archived_at ? String(board.archived_at) : null,
      },
      liste,
      schede,
      etichette,
      checklist,
      allegati,
      operatori: await operatori(),
      io: auth.userId,
    },
  };
}

export async function creaListaAction(bachecaId: string, titolo: string): Promise<Ok | Err> {
  const auth = await gate();
  const nome = titolo.trim();
  if (!nome) return { success: false, error: "Scrivi il nome della lista." };
  const supabase = await createClient();
  const { count } = await supabase
    .from("kb_liste")
    .select("id", { count: "exact", head: true })
    .eq("bacheca_id", bachecaId)
    .is("deleted_at", null);
  const inserted = await supabase.from("kb_liste").insert({
    bacheca_id: bachecaId,
    titolo: nome,
    sort_order: count ?? 0,
    created_by: auth.userId,
    updated_by: auth.userId,
  });
  if (inserted.error) return { success: false, error: inserted.error.message };
  await storico(bachecaId, null, auth.userId, `${nomeDi(auth.profile)} ha aggiunto la lista «${nome}»`, "create");
  return { success: true };
}

export async function rinominaListaAction(listaId: string, titolo: string): Promise<Ok | Err> {
  const auth = await gate();
  const nome = titolo.trim();
  if (!nome) return { success: false, error: "Il nome della lista è obbligatorio." };
  const supabase = await createClient();
  const { data } = await supabase.from("kb_liste").select("bacheca_id").eq("id", listaId).maybeSingle();
  const updated = await supabase
    .from("kb_liste")
    .update({ titolo: nome, updated_by: auth.userId })
    .eq("id", listaId);
  if (updated.error) return { success: false, error: updated.error.message };
  if (data?.bacheca_id) {
    await storico(String(data.bacheca_id), null, auth.userId, `${nomeDi(auth.profile)} ha rinominato una lista in «${nome}»`, "update");
  }
  return { success: true };
}

export async function salvaOrdineAction(input: {
  bachecaId: string;
  liste: string[];
  schede: { id: string; listaId: string }[];
  spostata?: { id: string; daLista: string; aLista: string };
}): Promise<Ok | Err> {
  const auth = await gate();
  const supabase = await createClient();
  for (let index = 0; index < input.liste.length; index += 1) {
    const updated = await supabase
      .from("kb_liste")
      .update({ sort_order: index, updated_by: auth.userId })
      .eq("id", input.liste[index])
      .eq("bacheca_id", input.bachecaId);
    if (updated.error) return { success: false, error: updated.error.message };
  }
  for (let index = 0; index < input.schede.length; index += 1) {
    const scheda = input.schede[index];
    const updated = await supabase
      .from("kb_schede")
      .update({
        lista_id: scheda.listaId,
        sort_order: index,
        updated_by: auth.userId,
      })
      .eq("id", scheda.id)
      .eq("bacheca_id", input.bachecaId);
    if (updated.error) return { success: false, error: updated.error.message };
  }
  if (input.spostata && input.spostata.daLista !== input.spostata.aLista) {
    const { data: nomi } = await supabase
      .from("kb_liste")
      .select("id, titolo")
      .in("id", [input.spostata.daLista, input.spostata.aLista]);
    const da = nomi?.find((row) => String(row.id) === input.spostata?.daLista);
    const a = nomi?.find((row) => String(row.id) === input.spostata?.aLista);
    const { data: scheda } = await supabase
      .from("kb_schede")
      .select("titolo")
      .eq("id", input.spostata.id)
      .maybeSingle();
    const summary = `${nomeDi(auth.profile)} ha spostato «${scheda?.titolo ?? "scheda"}» da ${da?.titolo ?? "lista"} a ${a?.titolo ?? "lista"}`;
    await storico(input.bachecaId, input.spostata.id, auth.userId, summary, "status_change");
    await avvisa({
      actorId: auth.userId,
      schedaId: input.spostata.id,
      bachecaId: input.bachecaId,
      title: "Scheda spostata",
      body: summary,
    });
  }
  return { success: true };
}

export async function archiviaListaAction(listaId: string, ripristina = false): Promise<Ok | Err> {
  const auth = await gate();
  const supabase = await createClient();
  const { data } = await supabase.from("kb_liste").select("bacheca_id, titolo").eq("id", listaId).maybeSingle();
  const updated = await supabase
    .from("kb_liste")
    .update({
      archived_at: ripristina ? null : new Date().toISOString(),
      updated_by: auth.userId,
    })
    .eq("id", listaId)
    .is("purged_at", null);
  if (updated.error) return { success: false, error: updated.error.message };
  if (data?.bacheca_id) {
    await storico(
      String(data.bacheca_id),
      null,
      auth.userId,
      `${nomeDi(auth.profile)} ha ${ripristina ? "ripristinato" : "archiviato"} la lista «${data.titolo}»`,
      "soft_delete"
    );
  }
  return { success: true };
}

export async function duplicaListaAction(listaId: string): Promise<Ok | Err> {
  const auth = await gate();
  const supabase = await createClient();
  const { data: lista } = await supabase.from("kb_liste").select("*").eq("id", listaId).maybeSingle();
  if (!lista) return { success: false, error: "Lista non trovata." };
  const nuovaLista = randomUUID();
  const inserted = await supabase.from("kb_liste").insert({
    id: nuovaLista,
    bacheca_id: lista.bacheca_id,
    titolo: `${lista.titolo} copia`,
    sort_order: Number(lista.sort_order ?? 0) + 1,
    created_by: auth.userId,
    updated_by: auth.userId,
  });
  if (inserted.error) return { success: false, error: inserted.error.message };
  const { data: schede } = await supabase
    .from("kb_schede")
    .select("*")
    .eq("lista_id", listaId)
    .is("deleted_at", null)
    .is("archived_at", null)
    .is("purged_at", null);
  for (const scheda of schede ?? []) {
    await copiaScheda(supabase, scheda, nuovaLista, String(lista.bacheca_id), auth.userId, `${scheda.titolo}`);
  }
  await storico(
    String(lista.bacheca_id),
    null,
    auth.userId,
    `${nomeDi(auth.profile)} ha duplicato la lista «${lista.titolo}»`,
    "create"
  );
  return { success: true };
}

async function copiaScheda(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scheda: Record<string, unknown>,
  listaId: string,
  bachecaId: string,
  actorId: string,
  titolo: string
) {
  const id = randomUUID();
  const inserted = await supabase.from("kb_schede").insert({
    id,
    bacheca_id: bachecaId,
    lista_id: listaId,
    titolo,
    descrizione: scheda.descrizione ?? "",
    is_template: false,
    template_id: scheda.id,
    anticipo: scheda.anticipo ?? "",
    copertina_colore: scheda.copertina_colore ?? "",
    sort_order: scheda.sort_order ?? 0,
    created_by: actorId,
    updated_by: actorId,
  });
  if (inserted.error) return;
  const { data: etichette } = await supabase
    .from("kb_scheda_etichette")
    .select("etichetta_id")
    .eq("scheda_id", scheda.id);
  if (etichette?.length) {
    await supabase.from("kb_scheda_etichette").insert(
      etichette.map((row) => ({
        scheda_id: id,
        etichetta_id: row.etichetta_id,
        created_by: actorId,
      }))
    );
  }
  const { data: liste } = await supabase
    .from("kb_checklist")
    .select("*")
    .eq("scheda_id", scheda.id)
    .is("deleted_at", null);
  for (const lista of liste ?? []) {
    const checklistId = randomUUID();
    await supabase.from("kb_checklist").insert({
      id: checklistId,
      scheda_id: id,
      titolo: lista.titolo,
      sort_order: lista.sort_order,
      created_by: actorId,
      updated_by: actorId,
    });
    const { data: voci } = await supabase
      .from("kb_checklist_voci")
      .select("*")
      .eq("checklist_id", lista.id)
      .is("deleted_at", null);
    if (voci?.length) {
      await supabase.from("kb_checklist_voci").insert(
        voci.map((voce) => ({
          checklist_id: checklistId,
          testo: voce.testo,
          fatto: false,
          scadenza_at: voce.scadenza_at,
          assegnato_id: voce.assegnato_id,
          sort_order: voce.sort_order,
          created_by: actorId,
          updated_by: actorId,
        }))
      );
    }
  }
}

export async function ordinaSchedeListaAction(
  listaId: string,
  modo: "scadenza" | "nome"
): Promise<Ok | Err> {
  const auth = await gate();
  const supabase = await createClient();
  const { data: lista } = await supabase.from("kb_liste").select("bacheca_id, titolo").eq("id", listaId).maybeSingle();
  const { data } = await supabase
    .from("kb_schede")
    .select("id, titolo, scadenza_at")
    .eq("lista_id", listaId)
    .is("archived_at", null)
    .is("deleted_at", null)
    .is("purged_at", null);
  const rows = [...(data ?? [])].sort((a, b) => {
    if (modo === "nome") return String(a.titolo).localeCompare(String(b.titolo), "it");
    const av = a.scadenza_at ? new Date(String(a.scadenza_at)).getTime() : Number.MAX_SAFE_INTEGER;
    const bv = b.scadenza_at ? new Date(String(b.scadenza_at)).getTime() : Number.MAX_SAFE_INTEGER;
    return av - bv;
  });
  for (let index = 0; index < rows.length; index += 1) {
    await supabase.from("kb_schede").update({ sort_order: index, updated_by: auth.userId }).eq("id", rows[index].id);
  }
  if (lista?.bacheca_id) {
    await storico(
      String(lista.bacheca_id),
      null,
      auth.userId,
      `${nomeDi(auth.profile)} ha ordinato «${lista.titolo}» per ${modo === "nome" ? "nome" : "scadenza"}`,
      "update"
    );
  }
  return { success: true };
}

export async function spostaTutteSchedeAction(daLista: string, aLista: string): Promise<Ok | Err> {
  const auth = await gate();
  if (daLista === aLista) return { success: true };
  const supabase = await createClient();
  const { data: origine } = await supabase.from("kb_liste").select("bacheca_id, titolo").eq("id", daLista).maybeSingle();
  const { count } = await supabase
    .from("kb_schede")
    .select("id", { count: "exact", head: true })
    .eq("lista_id", aLista)
    .is("deleted_at", null);
  const { data: schede } = await supabase
    .from("kb_schede")
    .select("id")
    .eq("lista_id", daLista)
    .is("archived_at", null)
    .is("deleted_at", null)
    .is("purged_at", null)
    .order("sort_order");
  let index = count ?? 0;
  for (const scheda of schede ?? []) {
    await supabase
      .from("kb_schede")
      .update({ lista_id: aLista, sort_order: index, updated_by: auth.userId })
      .eq("id", scheda.id);
    index += 1;
  }
  if (origine?.bacheca_id) {
    await storico(
      String(origine.bacheca_id),
      null,
      auth.userId,
      `${nomeDi(auth.profile)} ha spostato tutte le schede di «${origine.titolo}»`,
      "status_change"
    );
  }
  return { success: true };
}

export async function archiviaTutteSchedeAction(listaId: string): Promise<Ok | Err> {
  const auth = await gate();
  const supabase = await createClient();
  const { data: lista } = await supabase.from("kb_liste").select("bacheca_id, titolo").eq("id", listaId).maybeSingle();
  const updated = await supabase
    .from("kb_schede")
    .update({ archived_at: new Date().toISOString(), updated_by: auth.userId })
    .eq("lista_id", listaId)
    .is("archived_at", null)
    .is("deleted_at", null);
  if (updated.error) return { success: false, error: updated.error.message };
  if (lista?.bacheca_id) {
    await storico(
      String(lista.bacheca_id),
      null,
      auth.userId,
      `${nomeDi(auth.profile)} ha archiviato tutte le schede di «${lista.titolo}»`,
      "soft_delete"
    );
  }
  return { success: true };
}

export async function creaSchedaAction(listaId: string, titolo: string): Promise<{ success: true; id: string } | Err> {
  const auth = await gate();
  const nome = titolo.trim();
  if (!nome) return { success: false, error: "Scrivi il titolo della scheda." };
  const supabase = await createClient();
  const { data: lista } = await supabase.from("kb_liste").select("bacheca_id").eq("id", listaId).maybeSingle();
  if (!lista) return { success: false, error: "Lista non trovata." };
  const { count } = await supabase
    .from("kb_schede")
    .select("id", { count: "exact", head: true })
    .eq("lista_id", listaId)
    .is("deleted_at", null);
  const id = randomUUID();
  const inserted = await supabase.from("kb_schede").insert({
    id,
    bacheca_id: lista.bacheca_id,
    lista_id: listaId,
    titolo: nome,
    sort_order: count ?? 0,
    created_by: auth.userId,
    updated_by: auth.userId,
  });
  if (inserted.error) return { success: false, error: inserted.error.message };
  await storico(String(lista.bacheca_id), id, auth.userId, `${nomeDi(auth.profile)} ha creato «${nome}»`, "create");
  return { success: true, id };
}

export async function creaSchedeBulkAction(listaId: string, testo: string): Promise<Ok | Err> {
  const righe = testo
    .split(/\r?\n/)
    .map((riga) => riga.trim())
    .filter(Boolean)
    .slice(0, 40);
  if (!righe.length) return { success: false, error: "Incolla un titolo per riga." };
  for (const riga of righe) {
    const res = await creaSchedaAction(listaId, riga);
    if (!res.success) return res;
  }
  return { success: true };
}

export async function creaDaModelloAction(modelloId: string, listaId: string): Promise<{ success: true; id: string } | Err> {
  const auth = await gate();
  const supabase = await createClient();
  const { data: modello } = await supabase.from("kb_schede").select("*").eq("id", modelloId).maybeSingle();
  if (!modello) return { success: false, error: "Modello non trovato." };
  const { data: lista } = await supabase.from("kb_liste").select("bacheca_id").eq("id", listaId).maybeSingle();
  if (!lista) return { success: false, error: "Lista non trovata." };
  const id = randomUUID();
  await copiaScheda(supabase, modello, listaId, String(lista.bacheca_id), auth.userId, String(modello.titolo));
  const { data: creata } = await supabase
    .from("kb_schede")
    .select("id")
    .eq("template_id", modelloId)
    .eq("lista_id", listaId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  await storico(
    String(lista.bacheca_id),
    creata?.id ? String(creata.id) : null,
    auth.userId,
    `${nomeDi(auth.profile)} ha creato una scheda dal modello «${modello.titolo}»`,
    "create"
  );
  return { success: true, id: creata?.id ? String(creata.id) : id };
}

export async function aggiornaSchedaAction(input: {
  id: string;
  titolo?: string;
  descrizione?: string;
  listaId?: string;
  inizioAt?: string | null;
  scadenzaAt?: string | null;
  scadenzaCompletata?: boolean;
  anticipo?: string;
  copertinaColore?: string;
  isTemplate?: boolean;
  mentionIds?: string[];
}): Promise<Ok | Err> {
  const auth = await gate();
  const supabase = await createClient();
  const { data: prima } = await supabase
    .from("kb_schede")
    .select("bacheca_id, titolo, versione")
    .eq("id", input.id)
    .maybeSingle();
  if (!prima) return { success: false, error: "Scheda non trovata." };
  const patch: Record<string, unknown> = {
    updated_by: auth.userId,
    versione: Number(prima.versione ?? 1) + 1,
  };
  if (input.titolo != null) {
    const titolo = input.titolo.trim();
    if (!titolo) return { success: false, error: "Il titolo è obbligatorio." };
    patch.titolo = titolo;
  }
  if (input.descrizione != null) patch.descrizione = input.descrizione;
  if (input.listaId) patch.lista_id = input.listaId;
  if (input.inizioAt !== undefined) patch.inizio_at = input.inizioAt || null;
  if (input.scadenzaAt !== undefined) patch.scadenza_at = input.scadenzaAt || null;
  if (input.scadenzaCompletata != null) patch.scadenza_completata = input.scadenzaCompletata;
  if (input.anticipo != null) patch.anticipo = input.anticipo;
  if (input.copertinaColore != null) {
    patch.copertina_colore = input.copertinaColore;
    if (input.copertinaColore) patch.copertina_path = "";
  }
  if (input.isTemplate != null) patch.is_template = input.isTemplate;
  const updated = await supabase.from("kb_schede").update(patch).eq("id", input.id);
  if (updated.error) return { success: false, error: updated.error.message };
  await syncPromemoria(input.id, auth.userId);
  await storico(
    String(prima.bacheca_id),
    input.id,
    auth.userId,
    `${nomeDi(auth.profile)} ha aggiornato «${patch.titolo ?? prima.titolo}»`,
    "update"
  );
  if (input.scadenzaCompletata != null || input.listaId || input.mentionIds?.length) {
    await avvisa({
      actorId: auth.userId,
      schedaId: input.id,
      bachecaId: String(prima.bacheca_id),
      title: String(patch.titolo ?? prima.titolo),
      body: `${nomeDi(auth.profile)} ha aggiornato la scheda`,
      extraIds: input.mentionIds,
    });
  }
  return { success: true };
}

export async function archiviaSchedaAction(id: string, ripristina = false): Promise<Ok | Err> {
  const auth = await gate();
  const supabase = await createClient();
  const { data } = await supabase.from("kb_schede").select("bacheca_id, titolo").eq("id", id).maybeSingle();
  const updated = await supabase
    .from("kb_schede")
    .update({
      archived_at: ripristina ? null : new Date().toISOString(),
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("purged_at", null);
  if (updated.error) return { success: false, error: updated.error.message };
  if (data?.bacheca_id) {
    await storico(
      String(data.bacheca_id),
      id,
      auth.userId,
      `${nomeDi(auth.profile)} ha ${ripristina ? "ripristinato" : "archiviato"} «${data.titolo}»`,
      "soft_delete"
    );
  }
  return { success: true };
}

export async function purgaSchedaAction(id: string): Promise<Ok | Err> {
  const auth = await gate();
  const supabase = await createClient();
  const { data } = await supabase.from("kb_schede").select("bacheca_id, titolo, archived_at").eq("id", id).maybeSingle();
  if (!data?.archived_at) {
    return { success: false, error: "Si può togliere dall'archivio solo una scheda già archiviata." };
  }
  const updated = await supabase
    .from("kb_schede")
    .update({ purged_at: new Date().toISOString(), updated_by: auth.userId })
    .eq("id", id);
  if (updated.error) return { success: false, error: updated.error.message };
  await storico(
    String(data.bacheca_id),
    id,
    auth.userId,
    `${nomeDi(auth.profile)} ha tolto «${data.titolo}» dall'archivio visibile. La scheda resta registrata.`,
    "soft_delete"
  );
  return { success: true };
}

export async function salvaEtichettaAction(input: {
  bachecaId: string;
  id?: string;
  nome: string;
  colore: string;
}): Promise<Ok | Err> {
  const auth = await gate();
  const nome = input.nome.trim();
  if (!nome) return { success: false, error: "Il nome dell'etichetta è obbligatorio." };
  const supabase = await createClient();
  if (input.id) {
    const updated = await supabase
      .from("kb_etichette")
      .update({ nome, colore: input.colore, updated_by: auth.userId })
      .eq("id", input.id);
    if (updated.error) return { success: false, error: updated.error.message };
  } else {
    const inserted = await supabase.from("kb_etichette").insert({
      bacheca_id: input.bachecaId,
      nome,
      colore: input.colore,
      created_by: auth.userId,
      updated_by: auth.userId,
    });
    if (inserted.error) return { success: false, error: inserted.error.message };
  }
  return { success: true };
}

export async function toggleEtichettaSchedaAction(schedaId: string, etichettaId: string): Promise<Ok | Err> {
  const auth = await gate();
  const supabase = await createClient();
  const { data } = await supabase
    .from("kb_scheda_etichette")
    .select("scheda_id")
    .eq("scheda_id", schedaId)
    .eq("etichetta_id", etichettaId)
    .maybeSingle();
  if (data) {
    const removed = await supabase
      .from("kb_scheda_etichette")
      .delete()
      .eq("scheda_id", schedaId)
      .eq("etichetta_id", etichettaId);
    if (removed.error) return { success: false, error: removed.error.message };
  } else {
    const inserted = await supabase.from("kb_scheda_etichette").insert({
      scheda_id: schedaId,
      etichetta_id: etichettaId,
      created_by: auth.userId,
    });
    if (inserted.error) return { success: false, error: inserted.error.message };
  }
  return { success: true };
}

export async function toggleMembroAction(schedaId: string, userId: string): Promise<Ok | Err> {
  const auth = await gate();
  const supabase = await createClient();
  const { data: scheda } = await supabase.from("kb_schede").select("bacheca_id, titolo").eq("id", schedaId).maybeSingle();
  const { data } = await supabase
    .from("kb_scheda_membri")
    .select("user_id")
    .eq("scheda_id", schedaId)
    .eq("user_id", userId)
    .maybeSingle();
  if (data) {
    const removed = await supabase.from("kb_scheda_membri").delete().eq("scheda_id", schedaId).eq("user_id", userId);
    if (removed.error) return { success: false, error: removed.error.message };
  } else {
    const inserted = await supabase.from("kb_scheda_membri").insert({
      scheda_id: schedaId,
      user_id: userId,
      created_by: auth.userId,
    });
    if (inserted.error) return { success: false, error: inserted.error.message };
    if (scheda?.bacheca_id) {
      await avvisa({
        actorId: auth.userId,
        schedaId,
        bachecaId: String(scheda.bacheca_id),
        title: `Assegnazione: ${scheda.titolo}`,
        body: `${nomeDi(auth.profile)} ti ha assegnato la scheda`,
        extraIds: [userId],
      });
    }
  }
  await syncPromemoria(schedaId, auth.userId);
  return { success: true };
}

export async function toggleSeguiAction(schedaId: string): Promise<Ok | Err> {
  const auth = await gate();
  const supabase = await createClient();
  const { data } = await supabase
    .from("kb_seguaci")
    .select("user_id")
    .eq("scheda_id", schedaId)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (data) {
    const removed = await supabase.from("kb_seguaci").delete().eq("scheda_id", schedaId).eq("user_id", auth.userId);
    if (removed.error) return { success: false, error: removed.error.message };
  } else {
    const inserted = await supabase.from("kb_seguaci").insert({
      scheda_id: schedaId,
      user_id: auth.userId,
      created_by: auth.userId,
    });
    if (inserted.error) return { success: false, error: inserted.error.message };
  }
  await syncPromemoria(schedaId, auth.userId);
  return { success: true };
}

export async function toggleEtichetteEsteseAction(bachecaId: string, estese: boolean): Promise<Ok | Err> {
  const auth = await gate();
  const supabase = await createClient();
  const updated = await supabase
    .from("kb_bacheche")
    .update({ etichette_estese: estese, updated_by: auth.userId })
    .eq("id", bachecaId);
  if (updated.error) return { success: false, error: updated.error.message };
  return { success: true };
}

export async function creaChecklistAction(schedaId: string, titolo: string): Promise<Ok | Err> {
  const auth = await gate();
  const nome = titolo.trim() || "Checklist";
  const supabase = await createClient();
  const inserted = await supabase.from("kb_checklist").insert({
    scheda_id: schedaId,
    titolo: nome,
    created_by: auth.userId,
    updated_by: auth.userId,
  });
  if (inserted.error) return { success: false, error: inserted.error.message };
  return { success: true };
}

export async function aggiungiVoceAction(checklistId: string, testo: string): Promise<Ok | Err> {
  const auth = await gate();
  const nome = testo.trim();
  if (!nome) return { success: false, error: "Scrivi la voce." };
  const supabase = await createClient();
  const inserted = await supabase.from("kb_checklist_voci").insert({
    checklist_id: checklistId,
    testo: nome,
    created_by: auth.userId,
    updated_by: auth.userId,
  });
  if (inserted.error) return { success: false, error: inserted.error.message };
  return { success: true };
}

export async function aggiornaVoceAction(input: {
  id: string;
  testo?: string;
  fatto?: boolean;
  scadenzaAt?: string | null;
  assegnatoId?: string | null;
}): Promise<Ok | Err> {
  const auth = await gate();
  const supabase = await createClient();
  const patch: Record<string, unknown> = { updated_by: auth.userId };
  if (input.testo != null) patch.testo = input.testo.trim();
  if (input.fatto != null) patch.fatto = input.fatto;
  if (input.scadenzaAt !== undefined) patch.scadenza_at = input.scadenzaAt || null;
  if (input.assegnatoId !== undefined) patch.assegnato_id = input.assegnatoId || null;
  const updated = await supabase.from("kb_checklist_voci").update(patch).eq("id", input.id);
  if (updated.error) return { success: false, error: updated.error.message };
  return { success: true };
}

export async function commentaAction(input: {
  schedaId: string;
  testo: string;
  mentionIds: string[];
}): Promise<Ok | Err> {
  const auth = await gate();
  const testo = input.testo.trim();
  if (!testo) return { success: false, error: "Scrivi un commento." };
  const supabase = await createClient();
  const { data: scheda } = await supabase.from("kb_schede").select("bacheca_id, titolo").eq("id", input.schedaId).maybeSingle();
  if (!scheda) return { success: false, error: "Scheda non trovata." };
  const inserted = await supabase.from("kb_commenti").insert({
    scheda_id: input.schedaId,
    testo,
    created_by: auth.userId,
    updated_by: auth.userId,
  });
  if (inserted.error) return { success: false, error: inserted.error.message };
  const summary = `${nomeDi(auth.profile)} ha commentato «${scheda.titolo}»`;
  await storico(String(scheda.bacheca_id), input.schedaId, auth.userId, summary, "update");
  await avvisa({
    actorId: auth.userId,
    schedaId: input.schedaId,
    bachecaId: String(scheda.bacheca_id),
    title: `Commento: ${scheda.titolo}`,
    body: testo.slice(0, 180),
    extraIds: input.mentionIds,
  });
  return { success: true };
}

export async function reagisciAction(commentoId: string, emoji: string): Promise<Ok | Err> {
  const auth = await gate();
  if (!["👍", "✅", "👀", "❤️"].includes(emoji)) {
    return { success: false, error: "Reazione non prevista." };
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("kb_commento_reazioni")
    .select("id")
    .eq("commento_id", commentoId)
    .eq("user_id", auth.userId)
    .eq("emoji", emoji)
    .maybeSingle();
  if (data) {
    const removed = await supabase.from("kb_commento_reazioni").delete().eq("id", data.id);
    if (removed.error) return { success: false, error: removed.error.message };
  } else {
    const inserted = await supabase.from("kb_commento_reazioni").insert({
      commento_id: commentoId,
      user_id: auth.userId,
      emoji,
      created_by: auth.userId,
    });
    if (inserted.error) return { success: false, error: inserted.error.message };
  }
  return { success: true };
}

export async function dettaglioSchedaAction(schedaId: string): Promise<
  { success: true; commenti: KbCommento[]; storico: KbStoricoRiga[] } | Err
> {
  await gate();
  const supabase = await createClient();
  const [commentiRes, storicoRes, reazioniRes] = await Promise.all([
    supabase.from("kb_commenti").select("*").eq("scheda_id", schedaId).is("deleted_at", null).order("created_at"),
    supabase.from("kb_storico").select("*").eq("scheda_id", schedaId).order("created_at", { ascending: false }).limit(80),
    supabase.from("kb_commento_reazioni").select("commento_id, user_id, emoji"),
  ]);
  if (commentiRes.error) return { success: false, error: commentiRes.error.message };
  const ids = [...new Set((commentiRes.data ?? []).map((row) => String(row.created_by)).filter(Boolean))];
  const nomi = new Map<string, string>();
  if (ids.length) {
    const service = createServiceClient();
    const { data: profili } = await service
      .from("profiles")
      .select("id, full_name, first_name, last_name, email")
      .in("id", ids);
    for (const row of profili ?? []) nomi.set(String(row.id), nomeRiga(row));
  }
  const commenti: KbCommento[] = (commentiRes.data ?? []).map((row) => ({
    id: String(row.id),
    testo: String(row.testo),
    autore: nomi.get(String(row.created_by)) ?? "Operatore",
    createdAt: String(row.created_at),
    reazioni: (reazioniRes.data ?? [])
      .filter((reazione) => String(reazione.commento_id) === String(row.id))
      .map((reazione) => ({
        emoji: String(reazione.emoji),
        userId: String(reazione.user_id),
      })),
  }));
  const storicoRighe: KbStoricoRiga[] = (storicoRes.data ?? []).map((row) => ({
    id: String(row.id),
    summary: String(row.summary),
    createdAt: String(row.created_at),
  }));
  return { success: true, commenti, storico: storicoRighe };
}

async function leggiFile(file: File): Promise<{ bytes: Buffer; mime: string } | Err> {
  const mime = MIMES.includes(file.type) ? file.type : "";
  if (!mime) return { success: false, error: "Usa PDF, JPEG, PNG o WebP." };
  if (file.size > 15 * 1024 * 1024) return { success: false, error: "Il file supera 15 MB." };
  return { bytes: Buffer.from(await file.arrayBuffer()), mime };
}

export async function caricaAllegatoAction(formData: FormData): Promise<Ok | Err> {
  const auth = await gate();
  const schedaId = String(formData.get("schedaId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || !/^[0-9a-f-]{36}$/i.test(schedaId)) {
    return { success: false, error: "Allegato non valido." };
  }
  const letto = await leggiFile(file);
  if ("success" in letto) return letto;
  const supabase = await createClient();
  const { data: scheda } = await supabase.from("kb_schede").select("bacheca_id, titolo").eq("id", schedaId).maybeSingle();
  if (!scheda) return { success: false, error: "Scheda non trovata." };
  const id = randomUUID();
  const safe = file.name.replace(/[^\w.\- ()]+/gi, "_").slice(0, 80);
  const path = `${scheda.bacheca_id}/${schedaId}/${id}-${safe || "allegato"}`;
  const service = createServiceClient();
  const uploaded = await service.storage.from(BUCKET).upload(path, letto.bytes, {
    contentType: letto.mime,
    upsert: false,
  });
  if (uploaded.error) return { success: false, error: uploaded.error.message };
  const inserted = await supabase.from("kb_allegati").insert({
    id,
    scheda_id: schedaId,
    storage_path: path,
    file_name: file.name.slice(0, 180),
    content_type: letto.mime,
    byte_size: letto.bytes.length,
    created_by: auth.userId,
    updated_by: auth.userId,
  });
  if (inserted.error) return { success: false, error: inserted.error.message };
  await storico(
    String(scheda.bacheca_id),
    schedaId,
    auth.userId,
    `${nomeDi(auth.profile)} ha allegato «${file.name}» a «${scheda.titolo}»`,
    "attachment_upload"
  );
  return { success: true };
}

export async function apriAllegatoAction(id: string): Promise<{ success: true; url: string } | Err> {
  await gate();
  const supabase = await createClient();
  const { data } = await supabase.from("kb_allegati").select("storage_path").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!data?.storage_path) return { success: false, error: "Allegato non trovato." };
  const signed = await createServiceClient().storage.from(BUCKET).createSignedUrl(String(data.storage_path), 120);
  if (signed.error || !signed.data?.signedUrl) {
    return { success: false, error: signed.error?.message ?? "Apertura non riuscita." };
  }
  return { success: true, url: signed.data.signedUrl };
}

export async function togliAllegatoAction(id: string): Promise<Ok | Err> {
  const auth = await gate();
  const supabase = await createClient();
  const { data } = await supabase.from("kb_allegati").select("scheda_id, file_name").eq("id", id).maybeSingle();
  const updated = await supabase
    .from("kb_allegati")
    .update({ deleted_at: new Date().toISOString(), deleted_by: auth.userId, updated_by: auth.userId })
    .eq("id", id);
  if (updated.error) return { success: false, error: updated.error.message };
  if (data?.scheda_id) {
    const { data: scheda } = await supabase.from("kb_schede").select("bacheca_id").eq("id", data.scheda_id).maybeSingle();
    if (scheda?.bacheca_id) {
      await storico(
        String(scheda.bacheca_id),
        String(data.scheda_id),
        auth.userId,
        `${nomeDi(auth.profile)} ha tolto l'allegato «${data.file_name}»`,
        "attachment_remove"
      );
    }
  }
  return { success: true };
}

export async function caricaCopertinaAction(formData: FormData): Promise<Ok | Err> {
  const auth = await gate();
  const schedaId = String(formData.get("schedaId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File)) return { success: false, error: "Immagine non valida." };
  const letto = await leggiFile(file);
  if ("success" in letto) return letto;
  if (!letto.mime.startsWith("image/")) return { success: false, error: "La copertina è un'immagine." };
  const supabase = await createClient();
  const { data: scheda } = await supabase.from("kb_schede").select("bacheca_id").eq("id", schedaId).maybeSingle();
  if (!scheda) return { success: false, error: "Scheda non trovata." };
  const path = `${scheda.bacheca_id}/${schedaId}/copertina-${Date.now()}`;
  const uploaded = await createServiceClient().storage.from(BUCKET).upload(path, letto.bytes, {
    contentType: letto.mime,
    upsert: false,
  });
  if (uploaded.error) return { success: false, error: uploaded.error.message };
  const updated = await supabase
    .from("kb_schede")
    .update({
      copertina_path: path,
      copertina_colore: "",
      updated_by: auth.userId,
    })
    .eq("id", schedaId);
  if (updated.error) return { success: false, error: updated.error.message };
  return { success: true };
}
