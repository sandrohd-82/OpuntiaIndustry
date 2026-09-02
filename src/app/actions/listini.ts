"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";
import {
  GEO_CONTINENTE_LABEL,
  GEO_CONTINENTI,
  labelLingua,
  lingueDaNazioni,
  type GeoContinenteCodice,
  type GeoNazione,
} from "@/lib/ecosystem/geo-nazioni";
import {
  buildListinoCodice,
  buildListinoCodiceLocale,
  createListinoSchema,
  isValidTargaSconto,
  listinoCodiceSlug,
  listinoCondizioniSovrapposte,
  mapListino,
  nextTargaSconto,
  normalizeTargaSconto,
  mapListinoRiga,
  mapListinoRigaCondizione,
  parseListinoCodice,
  rigaListinoCompleta,
  updateListinoSchema,
  upsertListinoRigaCondizioneSchema,
  upsertListinoRigaSchema,
  type Listino,
  type ListinoDisponibilita,
  type ListinoRiga,
  type ListinoRigaCondizione,
} from "@/lib/ecosystem/listini";
import { queryListinoVoceVigente } from "@/lib/ecosystem/listino-vigente-query";
import type { ListinoVoceVigente } from "@/lib/ecosystem/listino-vigente";
import { createClient } from "@/lib/supabase/server";
import { verifyCurrentUserTotp } from "@/app/actions/totp";
import type {
  GeoNazioneRow,
  ListinoNazioneRow,
  ListinoRigaCondizioneRow,
  ListinoRigaRow,
  ListinoRow,
  ListinoStato,
  ProdottoProprioRow,
  StatoPubblicazioneCanale,
} from "@/types/database";

async function guardAmm() {
  return requireAreaAccess("amministrazione");
}

async function loadTargheScontoUsate(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string[]> {
  const { data } = await supabase
    .from("listini_righe_condizioni")
    .select("targa");
  return ((data ?? []) as { targa: string | null }[])
    .map((r) => String(r.targa ?? "").trim())
    .filter(Boolean);
}

export async function nextTargaScontoListinoAction(
  reserved: string[] = []
): Promise<
  { success: true; targa: string } | { success: false; error: string }
> {
  const batch = await allocateTargheScontoListinoAction(1, reserved);
  if (!batch.success) return batch;
  return { success: true, targa: batch.targhe[0] };
}

export async function allocateTargheScontoListinoAction(
  count: number,
  reserved: string[] = []
): Promise<
  { success: true; targhe: string[] } | { success: false; error: string }
> {
  await guardAmm();
  const n = Math.max(0, Math.floor(count));
  if (!n) return { success: true, targhe: [] };
  const supabase = await createClient();
  try {
    const used = [...(await loadTargheScontoUsate(supabase)), ...reserved];
    const targhe: string[] = [];
    for (let i = 0; i < n; i++) {
      const t = nextTargaSconto([...used, ...targhe]);
      targhe.push(t);
    }
    return { success: true, targhe };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Generazione targa sconto fallita",
    };
  }
}

function mapCondizioneWriteError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("listini_righe_condizioni_qty_a_check")) {
    return "Quantità a deve essere maggiore o uguale a quantità da. Uguali = sconto per un solo formato (es. 500 kg).";
  }
  if (m.includes("listini_righe_condizioni_targa_active_uidx")) {
    return "Targa sconto già usata. Lascia generare oppure scegline un’altra.";
  }
  if (m.includes("listini_righe_condizioni_attivo_uidx")) {
    return "Esiste già uno sconto attivo per la stessa confezione e Qty da.";
  }
  return message;
}

function resolveTargaSconto(
  raw: string | undefined,
  used: string[]
): { targa: string } | { error: string } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    try {
      return { targa: nextTargaSconto(used) };
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "Generazione targa sconto fallita",
      };
    }
  }
  const targa = normalizeTargaSconto(trimmed);
  if (!isValidTargaSconto(targa)) {
    return { error: "Targa sconto: Sc + 5 cifre (es. Sc00001)." };
  }
  if (used.map((u) => normalizeTargaSconto(u)).includes(targa)) {
    return { error: `Targa ${targa} già usata. Scegline un’altra o lascia generare.` };
  }
  return { targa };
}

function mapGeoNazione(row: GeoNazioneRow): GeoNazione {
  const c = GEO_CONTINENTI.includes(
    row.continente_codice as GeoContinenteCodice
  )
    ? (row.continente_codice as GeoContinenteCodice)
    : "europa";
  return {
    id: row.id,
    iso2: row.iso2,
    continenteCodice: c,
    nome: row.nome,
    lingueIso: Array.isArray(row.lingue_iso) ? row.lingue_iso : [],
  };
}

export async function listGeoCatalogAction(): Promise<
  | {
      success: true;
      continenti: Array<{ codice: GeoContinenteCodice; nome: string }>;
      nazioni: GeoNazione[];
    }
  | { success: false; error: string }
> {
  await guardAmm();
  const supabase = await createClient();
  const { data: nazioni, error } = await supabase
    .from("geo_nazioni")
    .select("*")
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    continenti: GEO_CONTINENTI.map((codice) => ({
      codice,
      nome: GEO_CONTINENTE_LABEL[codice],
    })),
    nazioni: ((nazioni ?? []) as GeoNazioneRow[]).map(mapGeoNazione),
  };
}

async function loadNazioniByListinoIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listinoIds: string[]
): Promise<Map<string, GeoNazione[]>> {
  const map = new Map<string, GeoNazione[]>();
  if (!listinoIds.length) return map;
  const { data: links } = await supabase
    .from("listini_nazioni")
    .select("*")
    .in("listino_id", listinoIds)
    .is("deleted_at", null);
  const rows = (links ?? []) as ListinoNazioneRow[];
  const nazioneIds = [...new Set(rows.map((r) => r.nazione_id))];
  if (!nazioneIds.length) return map;
  const { data: nazioni } = await supabase
    .from("geo_nazioni")
    .select("*")
    .in("id", nazioneIds)
    .is("deleted_at", null);
  const byId = new Map(
    ((nazioni ?? []) as GeoNazioneRow[]).map((n) => [n.id, mapGeoNazione(n)])
  );
  for (const r of rows) {
    const n = byId.get(r.nazione_id);
    if (!n) continue;
    const list = map.get(r.listino_id) ?? [];
    list.push(n);
    map.set(r.listino_id, list);
  }
  return map;
}

async function replaceListinoNazioni(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listinoId: string,
  nazioneIds: string[],
  userId: string
): Promise<string | null> {
  const unique = [...new Set(nazioneIds)];
  if (!unique.length) return "Seleziona almeno una nazione.";
  const { data: found, error: fErr } = await supabase
    .from("geo_nazioni")
    .select("id")
    .in("id", unique)
    .is("deleted_at", null);
  if (fErr) return fErr.message;
  if ((found ?? []).length !== unique.length) {
    return "Una o più nazioni non sono valide.";
  }

  const { data: existing, error: eErr } = await supabase
    .from("listini_nazioni")
    .select("id, nazione_id, deleted_at")
    .eq("listino_id", listinoId);
  if (eErr) return eErr.message;
  const rows = (existing ?? []) as Array<{
    id: string;
    nazione_id: string;
    deleted_at: string | null;
  }>;
  const now = new Date().toISOString();
  const wanted = new Set(unique);

  for (const r of rows) {
    if (!wanted.has(r.nazione_id) && r.deleted_at == null) {
      const { error } = await supabase
        .from("listini_nazioni")
        .update({
          deleted_at: now,
          deleted_by: userId,
          updated_by: userId,
        })
        .eq("id", r.id);
      if (error) return error.message;
    }
    if (wanted.has(r.nazione_id) && r.deleted_at != null) {
      const { error } = await supabase
        .from("listini_nazioni")
        .update({
          deleted_at: null,
          deleted_by: null,
          updated_by: userId,
        })
        .eq("id", r.id);
      if (error) return error.message;
    }
  }

  const have = new Set(rows.map((r) => r.nazione_id));
  const toInsert = unique.filter((id) => !have.has(id));
  if (toInsert.length) {
    const { error } = await supabase.from("listini_nazioni").insert(
      toInsert.map((nazione_id) => ({
        listino_id: listinoId,
        nazione_id,
        created_by: userId,
        updated_by: userId,
      }))
    );
    if (error) return error.message;
  }
  return null;
}

export async function listListiniAction(): Promise<
  | { success: true; items: Listino[]; isAdmin: boolean }
  | { success: false; error: string }
> {
  const { auth } = await guardAmm();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listini")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as ListinoRow[];
  const nazioniMap = await loadNazioniByListinoIds(
    supabase,
    rows.map((r) => r.id)
  );
  return {
    success: true,
    items: rows.map((r) =>
      mapListino(
        r,
        nazioniMap.get(r.listino_origine_id || r.id) ?? nazioniMap.get(r.id) ?? []
      )
    ),
    isAdmin: isAdminLikeProfile(auth.profile),
  };
}

export async function createListinoAction(input: unknown): Promise<
  { success: true; item: Listino } | { success: false; error: string }
> {
  const { auth } = await guardAmm();
  const parsed = createListinoSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }

  const slug = listinoCodiceSlug(parsed.data.codice);
  if (!slug) {
    return { success: false, error: "Inserisci il testo del codice dopo B2B-." };
  }
  const codice = buildListinoCodice(slug, parsed.data.versioneCodice ?? 1);

  const supabase = await createClient();
  const copyFromId = parsed.data.modelloId || parsed.data.sostituisceId || null;
  const { data, error } = await supabase
    .from("listini")
    .insert({
      codice,
      nome: parsed.data.nome,
      canale: "b2b",
      valido_dal: new Date().toISOString().slice(0, 10),
      valido_al: null,
      note: parsed.data.note,
      stato: "bozza",
      versione: 1,
      locale: "it",
      listino_origine_id: null,
      sostituisce_id: parsed.data.sostituisceId || null,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Inserimento fallito" };
  }

  const row = data as ListinoRow;
  const seedErr = await seedListinoProdotti(
    supabase,
    row.id,
    auth.userId,
    copyFromId
  );
  if (seedErr) return { success: false, error: seedErr };

  let nazioneIds = parsed.data.nazioneIds ?? [];
  if (!nazioneIds.length && copyFromId) {
    const fromMap = await loadNazioniByListinoIds(supabase, [copyFromId]);
    nazioneIds = (fromMap.get(copyFromId) ?? []).map((n) => n.id);
  }
  const nazErr = await replaceListinoNazioni(
    supabase,
    row.id,
    nazioneIds,
    auth.userId
  );
  if (nazErr) return { success: false, error: nazErr };

  const nazioniMap = await loadNazioniByListinoIds(supabase, [row.id]);
  await writeAuditLog({
    entity_type: "listini",
    entity_id: row.id,
    action: "create",
    actor_id: auth.userId,
    summary: copyFromId
      ? `Creato listino B2B ${row.codice} (bozza da modello)`
      : `Creato listino B2B ${row.codice} (bozza v1, voci vuote)`,
    payload: {
      sostituisce_id: parsed.data.sostituisceId || null,
      modello_id: copyFromId,
      nazione_ids: nazioneIds,
    },
  });
  return { success: true, item: mapListino(row, nazioniMap.get(row.id) ?? []) };
}

async function seedListinoProdotti(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listinoId: string,
  userId: string,
  copyFromId: string | null
): Promise<string | null> {
  const { data: prodotti, error: pErr } = await supabase
    .from("prodotti_propri")
    .select("id")
    .is("deleted_at", null);
  if (pErr) return pErr.message;
  const ids = ((prodotti ?? []) as { id: string }[]).map((p) => p.id);
  if (!ids.length) return "Nessun prodotto Agrinsicilia da caricare.";

  const copied = new Map<
    string,
    { prezzo: number; unita: string; disp: string; rigaId: string }
  >();
  if (copyFromId) {
    const { data: prev } = await supabase
      .from("listini_righe")
      .select("id, prodotto_id, prezzo, unita_misura, disponibilita")
      .eq("listino_id", copyFromId)
      .is("deleted_at", null);
    for (const r of (prev ?? []) as {
      id: string;
      prodotto_id: string;
      prezzo: number;
      unita_misura: string;
      disponibilita: string;
    }[]) {
      copied.set(r.prodotto_id, {
        prezzo: Number(r.prezzo),
        unita: r.unita_misura === "lt" ? "lt" : "kg",
        disp: r.disponibilita,
        rigaId: r.id,
      });
    }
  }

  const { data: existing } = await supabase
    .from("listini_righe")
    .select("prodotto_id")
    .eq("listino_id", listinoId)
    .is("deleted_at", null);
  const have = new Set(
    ((existing ?? []) as { prodotto_id: string }[]).map((r) => r.prodotto_id)
  );
  const missing = ids.filter((id) => !have.has(id));
  const toInsert = missing.map((prodotto_id) => {
    const c = copied.get(prodotto_id);
    return {
      listino_id: listinoId,
      prodotto_id,
      prezzo: c?.prezzo ?? 0,
      unita_misura: c?.unita ?? "kg",
      disponibilita: c?.disp ?? "in_produzione",
      created_by: userId,
      updated_by: userId,
    };
  });
  if (toInsert.length) {
    const { error } = await supabase.from("listini_righe").insert(toInsert);
    if (error) return error.message;
  }

  if (!copyFromId || !missing.length) return null;

  const { data: newRows, error: nErr } = await supabase
    .from("listini_righe")
    .select("id, prodotto_id")
    .eq("listino_id", listinoId)
    .in("prodotto_id", missing)
    .is("deleted_at", null);
  if (nErr) return nErr.message;

  const sourceRigaIds = missing
    .map((id) => copied.get(id)?.rigaId)
    .filter((id): id is string => Boolean(id));
  if (!sourceRigaIds.length) return null;

  const { data: conds, error: cErr } = await supabase
    .from("listini_righe_condizioni")
    .select(
      "listino_riga_id, qty_da, qty_a, imballaggio_voce_id, sconto_pct, kg_confezione, kg_standard, kg_forzato"
    )
    .in("listino_riga_id", sourceRigaIds)
    .is("deleted_at", null);
  if (cErr) return cErr.message;
  if (!conds?.length) return null;

  const newByProdotto = new Map(
    ((newRows ?? []) as { id: string; prodotto_id: string }[]).map((r) => [
      r.prodotto_id,
      r.id,
    ])
  );
  const sourceProdotto = new Map(
    [...copied.entries()].map(([prodottoId, v]) => [v.rigaId, prodottoId])
  );
  const condInsert = (
    conds as Array<{
      listino_riga_id: string;
      qty_da: number;
      qty_a: number | null;
      imballaggio_voce_id: string;
      sconto_pct: number;
      kg_confezione: number;
      kg_standard: number | null;
      kg_forzato: boolean;
    }>
  )
    .map((c) => {
      const prodottoId = sourceProdotto.get(c.listino_riga_id);
      const newRigaId = prodottoId ? newByProdotto.get(prodottoId) : null;
      if (!newRigaId) return null;
      return {
        listino_riga_id: newRigaId,
        qty_da: c.qty_da,
        qty_a: c.qty_a,
        imballaggio_voce_id: c.imballaggio_voce_id,
        sconto_pct: c.sconto_pct,
        kg_confezione: c.kg_confezione,
        kg_standard: c.kg_standard,
        kg_forzato: c.kg_forzato,
        created_by: userId,
        updated_by: userId,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  if (!condInsert.length) return null;
  const usedTarghe = await loadTargheScontoUsate(supabase);
  const pool = [...usedTarghe];
  const withTarga = condInsert.map((row) => {
    const targa = nextTargaSconto(pool);
    pool.push(targa);
    return { ...row, targa };
  });
  const { error: iErr } = await supabase
    .from("listini_righe_condizioni")
    .insert(withTarga);
  return iErr?.message ?? null;
}

async function generaVersioniLingua(
  supabase: Awaited<ReturnType<typeof createClient>>,
  master: ListinoRow,
  nazioni: GeoNazione[],
  userId: string
): Promise<string | null> {
  const lingue = lingueDaNazioni(nazioni).filter((l) => l && l !== "it");
  if (!lingue.length) return null;

  const parsed = parseListinoCodice(master.codice);
  const { data: existing } = await supabase
    .from("listini")
    .select("id, locale, codice")
    .eq("listino_origine_id", master.id)
    .is("deleted_at", null);
  const byLocale = new Map(
    ((existing ?? []) as Array<{ id: string; locale: string; codice: string }>).map(
      (r) => [r.locale, r]
    )
  );

  for (const locale of lingue) {
    let childId = byLocale.get(locale)?.id;
    if (!childId) {
      const codice = buildListinoCodiceLocale(
        parsed.slug || master.codice,
        locale,
        parsed.versione
      );
      const { data, error } = await supabase
        .from("listini")
        .insert({
          codice,
          nome: `${master.nome} (${labelLingua(locale)})`,
          canale: "b2b",
          valido_dal: new Date().toISOString().slice(0, 10),
          note: `Versione ${labelLingua(locale)} di ${master.codice}. Nomi prodotto restano in italiano fino alla compilazione traduzioni.`,
          stato: "bozza_traduzione",
          versione: 1,
          locale,
          listino_origine_id: master.id,
          created_by: userId,
          updated_by: userId,
        })
        .select("id")
        .single();
      if (error || !data) return error?.message ?? "Creazione versione lingua fallita";
      childId = (data as { id: string }).id;
      await writeAuditLog({
        entity_type: "listini",
        entity_id: childId,
        action: "create",
        actor_id: userId,
        summary: `Versione ${labelLingua(locale)} da ${master.codice}`,
        payload: { listino_origine_id: master.id, locale },
      });
    }

    await supabase
      .from("listini_righe")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
        updated_by: userId,
      })
      .eq("listino_id", childId)
      .is("deleted_at", null);

    const seedErr = await seedListinoProdotti(
      supabase,
      childId,
      userId,
      master.id
    );
    if (seedErr) return seedErr;
  }
  return null;
}

async function requireListinoBozza(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listinoId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("listini")
    .select("id, stato")
    .eq("id", listinoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Listino non trovato" };
  }
  if ((data as { stato: string }).stato !== "bozza") {
    return {
      ok: false,
      error:
        "Solo una bozza è modificabile. Riporta il listino in Bozza oppure creane uno nuovo.",
    };
  }
  return { ok: true };
}

export async function updateListinoAction(input: unknown): Promise<
  { success: true; item: Listino } | { success: false; error: string }
> {
  const { auth } = await guardAmm();
  const parsed = updateListinoSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const supabase = await createClient();
  const gate = await requireListinoBozza(supabase, parsed.data.id);
  if (!gate.ok) return { success: false, error: gate.error };

  const { data: current } = await supabase
    .from("listini")
    .select("codice")
    .eq("id", parsed.data.id)
    .maybeSingle();
  const slug = listinoCodiceSlug(parsed.data.codice);
  if (!slug) {
    return { success: false, error: "Inserisci il testo del codice dopo B2B-." };
  }
  const versioneCodice = parseListinoCodice(
    (current as { codice?: string } | null)?.codice ?? ""
  ).versione;
  const codice = buildListinoCodice(slug, versioneCodice);

  if (parsed.data.nazioneIds) {
    const nazErr = await replaceListinoNazioni(
      supabase,
      parsed.data.id,
      parsed.data.nazioneIds,
      auth.userId
    );
    if (nazErr) return { success: false, error: nazErr };
  }

  const { data, error } = await supabase
    .from("listini")
    .update({
      codice,
      nome: parsed.data.nome,
      note: parsed.data.note,
      updated_by: auth.userId,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Aggiornamento fallito" };
  }
  const row = data as ListinoRow;
  await writeAuditLog({
    entity_type: "listini",
    entity_id: row.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornata testata listino ${row.codice} (bozza)`,
    payload: {
      codice: row.codice,
      nome: row.nome,
      nazione_ids: parsed.data.nazioneIds ?? null,
    },
  });
  const nazioniMap = await loadNazioniByListinoIds(supabase, [row.id]);
  return { success: true, item: mapListino(row, nazioniMap.get(row.id) ?? []) };
}

export async function setListinoStatoAction(input: {
  id: string;
  stato: ListinoStato;
}): Promise<{ success: true } | { success: false; error: string }> {
  if (input.stato === "bozza") return riportaListinoInBozzaAction(input.id);
  if (input.stato === "in_revisione") return inviaListinoInRevisioneAction(input.id);
  return {
    success: false,
    error: "Usa le azioni di workflow (Listino completo / Approva / Obsoleto).",
  };
}

export async function inviaListinoInRevisioneAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guardAmm();
  const supabase = await createClient();
  const { data: head } = await supabase
    .from("listini")
    .select("id, stato, listino_origine_id, codice, nome, locale")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!head) return { success: false, error: "Listino non trovato" };
  if ((head as { listino_origine_id: string | null }).listino_origine_id) {
    return {
      success: false,
      error: "Le versioni in lingua non vanno In Revisione. Si lavora sul listino madre.",
    };
  }
  const gate = await requireListinoBozza(supabase, id);
  if (!gate.ok) return { success: false, error: gate.error };

  const seedErr = await seedListinoProdotti(supabase, id, auth.userId, null);
  if (seedErr) return { success: false, error: seedErr };

  const { data: rows, error: rErr } = await supabase
    .from("listini_righe")
    .select("prezzo, disponibilita, prodotto_id")
    .eq("listino_id", id)
    .is("deleted_at", null);
  if (rErr) return { success: false, error: rErr.message };
  const righe = (rows ?? []) as {
    prezzo: number;
    disponibilita: ListinoDisponibilita;
    prodotto_id: string;
  }[];
  const incomplete = righe.filter(
    (r) =>
      !rigaListinoCompleta({
        prezzo: Number(r.prezzo),
        disponibilita: r.disponibilita,
      })
  );
  if (incomplete.length) {
    return {
      success: false,
      error: `${incomplete.length} voci senza prezzo valido. Imposta il prezzo o dichiara fuori produzione / non disponibile.`,
    };
  }

  const { data: current } = await supabase
    .from("listini")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const master = current as ListinoRow | null;
  if (!master) return { success: false, error: "Listino non trovato" };

  const nazioniMap = await loadNazioniByListinoIds(supabase, [id]);
  const nazioni = nazioniMap.get(id) ?? [];
  if (!nazioni.length) {
    return {
      success: false,
      error: "Seleziona almeno una nazione coperta prima di completare il listino.",
    };
  }
  const lingErr = await generaVersioniLingua(
    supabase,
    master,
    nazioni,
    auth.userId
  );
  if (lingErr) return { success: false, error: lingErr };

  const { error } = await supabase
    .from("listini")
    .update({
      stato: "in_revisione",
      versione: Number(master.versione ?? 1) + 1,
      updated_by: auth.userId,
    })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "listini",
    entity_id: id,
    action: "status_change",
    actor_id: auth.userId,
    summary: `Listino ${master.codice}: bozza → in_revisione`,
    payload: {
      from: "bozza",
      to: "in_revisione",
      lingue: lingueDaNazioni(nazioni),
    },
  });
  return { success: true };
}

export async function riportaListinoInBozzaAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guardAmm();
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo un admin può riportare il listino in bozza." };
  }
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("listini")
    .select("stato, codice, versione")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!current) return { success: false, error: "Listino non trovato" };
  if ((current as { stato: string }).stato !== "in_revisione") {
    return { success: false, error: "Si può riportare in bozza solo un listino In Revisione." };
  }
  await supabase
    .from("listini_righe")
    .update({
      revisione_approvata: false,
      revisione_approvata_at: null,
      revisione_approvata_by: null,
      updated_by: auth.userId,
    })
    .eq("listino_id", id)
    .is("deleted_at", null);
  const { error } = await supabase
    .from("listini")
    .update({
      stato: "bozza",
      versione: Number((current as { versione: number }).versione) + 1,
      updated_by: auth.userId,
    })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "listini",
    entity_id: id,
    action: "status_change",
    actor_id: auth.userId,
    summary: `Listino ${(current as { codice: string }).codice}: in_revisione → bozza`,
    payload: { from: "in_revisione", to: "bozza" },
  });
  return { success: true };
}

export async function setListinoRigaRevisioneAction(input: {
  rigaId: string;
  approvata: boolean;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guardAmm();
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo un admin può spuntare le voci in revisione." };
  }
  const supabase = await createClient();
  const { data: riga } = await supabase
    .from("listini_righe")
    .select("id, listino_id")
    .eq("id", input.rigaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!riga) return { success: false, error: "Voce non trovata" };
  const { data: listino } = await supabase
    .from("listini")
    .select("stato")
    .eq("id", (riga as { listino_id: string }).listino_id)
    .maybeSingle();
  if ((listino as { stato?: string } | null)?.stato !== "in_revisione") {
    return { success: false, error: "Il check per voce vale solo In Revisione." };
  }
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("listini_righe")
    .update({
      revisione_approvata: input.approvata,
      revisione_approvata_at: input.approvata ? now : null,
      revisione_approvata_by: input.approvata ? auth.userId : null,
      updated_by: auth.userId,
    })
    .eq("id", input.rigaId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function approvaListinoInUsoAction(input: {
  id: string;
  otp: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guardAmm();
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo un admin può approvare e mettere In Uso." };
  }
  const otp = await verifyCurrentUserTotp(auth.userId, input.otp);
  if (!otp.ok) return { success: false, error: otp.error };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("listini")
    .select("id, stato, codice, versione, sostituisce_id")
    .eq("id", input.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!current) return { success: false, error: "Listino non trovato" };
  if ((current as { stato: string }).stato !== "in_revisione") {
    return { success: false, error: "Puoi mettere In Uso solo un listino In Revisione." };
  }

  const seedErr = await seedListinoProdotti(supabase, input.id, auth.userId, null);
  if (seedErr) return { success: false, error: seedErr };

  const { data: rows } = await supabase
    .from("listini_righe")
    .select("prezzo, disponibilita, revisione_approvata")
    .eq("listino_id", input.id)
    .is("deleted_at", null);
  const righe = (rows ?? []) as {
    prezzo: number;
    disponibilita: ListinoDisponibilita;
    revisione_approvata: boolean;
  }[];
  if (!righe.length) return { success: false, error: "Nessuna voce nel listino." };
  if (
    righe.some(
      (r) =>
        !rigaListinoCompleta({
          prezzo: Number(r.prezzo),
          disponibilita: r.disponibilita,
        })
    )
  ) {
    return { success: false, error: "Tutte le voci devono avere prezzo o dichiarazione." };
  }
  const missingCheck = righe.filter((r) => !r.revisione_approvata).length;
  if (missingCheck) {
    return {
      success: false,
      error: `Mancano ${missingCheck} check admin sulle voci. Spunta tutte le voci prima di approvare.`,
    };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("listini")
    .update({
      stato: "in_uso",
      valido_dal: now.slice(0, 10),
      valido_al: null,
      published_at: now,
      published_by: auth.userId,
      approved_at: now,
      approved_by: auth.userId,
      versione: Number((current as { versione: number }).versione) + 1,
      updated_by: auth.userId,
    })
    .eq("id", input.id);
  if (error) return { success: false, error: error.message };

  const { data: others } = await supabase
    .from("listini")
    .select("id, codice")
    .eq("stato", "in_uso")
    .eq("canale", "b2b")
    .is("listino_origine_id", null)
    .neq("id", input.id)
    .is("deleted_at", null);
  for (const o of (others ?? []) as { id: string; codice: string }[]) {
    await supabase
      .from("listini")
      .update({
        stato: "obsoleto",
        updated_by: auth.userId,
      })
      .eq("id", o.id);
    await writeAuditLog({
      entity_type: "listini",
      entity_id: o.id,
      action: "status_change",
      actor_id: auth.userId,
      summary: `Listino ${o.codice}: in_uso → obsoleto (sostituito)`,
      payload: { from: "in_uso", to: "obsoleto", sostituito_da: input.id },
    });
  }

  await writeAuditLog({
    entity_type: "listini",
    entity_id: input.id,
    action: "status_change",
    actor_id: auth.userId,
    summary: `Listino ${(current as { codice: string }).codice}: in_revisione → in_uso (OTP)`,
    payload: { from: "in_revisione", to: "in_uso", otp: true },
  });
  return { success: true };
}

export async function dichiaraListinoObsoletoAction(input: {
  id: string;
  creaSostituzione: boolean;
}): Promise<
  | { success: true; bozzaId?: string }
  | { success: false; error: string }
> {
  const { auth } = await guardAmm();
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo un admin può dichiarare obsoleto un listino." };
  }
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("listini")
    .select("*")
    .eq("id", input.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!current) return { success: false, error: "Listino non trovato" };
  const row = current as ListinoRow;
  if (row.stato !== "in_uso") {
    return { success: false, error: "Puoi dichiarare obsoleto solo un listino In Uso." };
  }

  await writeAuditLog({
    entity_type: "listini",
    entity_id: row.id,
    action: "status_change",
    actor_id: auth.userId,
    summary: `Richiesta sostituzione listino ${row.codice}: resta In Uso fino al nuovo In Uso`,
    payload: { crea_sostituzione: input.creaSostituzione },
  });

  if (!input.creaSostituzione) return { success: true };

  const parsedCodice = parseListinoCodice(row.codice);
  const created = await createListinoAction({
    codice: parsedCodice.slug || row.codice,
    nome: `${row.nome} (sostituzione)`,
    note: `Sostituisce ${row.codice}`,
    modelloId: row.id,
    sostituisceId: row.id,
    versioneCodice: parsedCodice.versione + 1,
  });
  if (!created.success) return created;
  return { success: true, bozzaId: created.item.id };
}

export async function listListinoRigheAction(
  listinoId: string
): Promise<
  { success: true; items: ListinoRiga[] } | { success: false; error: string }
> {
  await guardAmm();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listini_righe")
    .select("*")
    .eq("listino_id", listinoId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []) as ListinoRigaRow[];
  const prodottoIds = [...new Set(rows.map((r) => r.prodotto_id))];
  const prodotti = new Map<string, { codice: string; nome: string }>();
  if (prodottoIds.length) {
    const { data: ps } = await supabase
      .from("prodotti_propri")
      .select("id, codice, nome")
      .in("id", prodottoIds);
    for (const p of ps ?? []) {
      const row = p as { id: string; codice: string; nome: string };
      prodotti.set(row.id, { codice: row.codice, nome: row.nome });
    }
  }

  const condizioniByRiga = await loadCondizioniByRiga(
    supabase,
    rows.map((r) => r.id)
  );

  return {
    success: true,
    items: rows.map((r) =>
      mapListinoRiga(
        r,
        prodotti.get(r.prodotto_id),
        condizioniByRiga.get(r.id) ?? []
      )
    ),
  };
}

async function loadCondizioniByRiga(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rigaIds: string[]
): Promise<Map<string, ListinoRigaCondizione[]>> {
  const map = new Map<string, ListinoRigaCondizione[]>();
  if (!rigaIds.length) return map;
  const { data } = await supabase
    .from("listini_righe_condizioni")
    .select("*")
    .in("listino_riga_id", rigaIds)
    .is("deleted_at", null)
    .order("qty_da", { ascending: true });
  const rows = (data ?? []) as ListinoRigaCondizioneRow[];
  const imbIds = [...new Set(rows.map((r) => r.imballaggio_voce_id))];
  const imballaggi = new Map<string, { codice: string; nome: string }>();
  if (imbIds.length) {
    const { data: vs } = await supabase
      .from("imballaggi_voci")
      .select("id, codice, nome")
      .in("id", imbIds);
    for (const v of vs ?? []) {
      const row = v as { id: string; codice: string; nome: string };
      imballaggi.set(row.id, { codice: row.codice, nome: row.nome });
    }
  }
  for (const r of rows) {
    const list = map.get(r.listino_riga_id) ?? [];
    list.push(mapListinoRigaCondizione(r, imballaggi.get(r.imballaggio_voce_id)));
    map.set(r.listino_riga_id, list);
  }
  return map;
}

export async function upsertListinoRigaAction(input: unknown): Promise<
  { success: true; item: ListinoRiga } | { success: false; error: string }
> {
  const { auth } = await guardAmm();
  const parsed = upsertListinoRigaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }

  const supabase = await createClient();
  const gate = await requireListinoBozza(supabase, parsed.data.listinoId);
  if (!gate.ok) return { success: false, error: gate.error };

  const { data: existing } = await supabase
    .from("listini_righe")
    .select("id")
    .eq("listino_id", parsed.data.listinoId)
    .eq("prodotto_id", parsed.data.prodottoId)
    .is("deleted_at", null)
    .maybeSingle();

  let row: ListinoRigaRow | null = null;
  if (existing?.id) {
    const { data, error } = await supabase
      .from("listini_righe")
      .update({
        prezzo: parsed.data.prezzo,
        unita_misura: parsed.data.unitaMisura,
        disponibilita: parsed.data.disponibilita,
        revisione_approvata: false,
        revisione_approvata_at: null,
        revisione_approvata_by: null,
        iva_percentuale: parsed.data.ivaPercentuale,
        min_qty: parsed.data.minQty,
        sconto_max_pct: parsed.data.scontoMaxPct,
        updated_by: auth.userId,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Aggiornamento fallito" };
    }
    row = data as ListinoRigaRow;
  } else {
    const { data, error } = await supabase
      .from("listini_righe")
      .insert({
        listino_id: parsed.data.listinoId,
        prodotto_id: parsed.data.prodottoId,
        prezzo: parsed.data.prezzo,
        unita_misura: parsed.data.unitaMisura,
        disponibilita: parsed.data.disponibilita,
        iva_percentuale: parsed.data.ivaPercentuale,
        min_qty: parsed.data.minQty,
        sconto_max_pct: parsed.data.scontoMaxPct,
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("*")
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Inserimento fallito" };
    }
    row = data as ListinoRigaRow;
  }

  if (parsed.data.syncCondizioni) {
    const syncErr = await syncListinoRigaCondizioni(
      supabase,
      row.id,
      (row as { prodotto_id: string }).prodotto_id,
      parsed.data.condizioni ?? [],
      auth.userId
    );
    if (syncErr) return { success: false, error: syncErr };
  }

  await writeAuditLog({
    entity_type: "listini_righe",
    entity_id: row.id,
    action: existing?.id ? "update" : "create",
    actor_id: auth.userId,
    summary: `Riga listino prodotto ${parsed.data.prodottoId}`,
    payload: {
      prezzo: parsed.data.prezzo,
      unita_misura: parsed.data.unitaMisura,
      sync_condizioni: Boolean(parsed.data.syncCondizioni),
      condizioni: (parsed.data.condizioni ?? []).length,
    },
  });

  const condizioni = (await loadCondizioniByRiga(supabase, [row.id])).get(row.id);
  return { success: true, item: mapListinoRiga(row, undefined, condizioni) };
}

async function syncListinoRigaCondizioni(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listinoRigaId: string,
  prodottoId: string,
  condizioni: Array<{
    id?: string;
    qtyDa: number;
    qtyA?: number | null;
    imballaggioVoceId: string;
    scontoPct: number;
    kgConfezione: number;
    kgForzato?: boolean;
    targa?: string;
  }>,
  userId: string
): Promise<string | null> {
  const keepIds = new Set(
    condizioni.map((c) => c.id).filter((id): id is string => Boolean(id))
  );
  const { data: existingRows, error: eErr } = await supabase
    .from("listini_righe_condizioni")
    .select("id")
    .eq("listino_riga_id", listinoRigaId)
    .is("deleted_at", null);
  if (eErr) return eErr.message;

  const overlapInput = condizioni.map((c, i) => ({
    id: c.id ?? `tmp-${i}`,
    qtyDa: c.qtyDa,
    qtyA: c.qtyA ?? null,
    imb: c.imballaggioVoceId,
  }));
  for (let i = 0; i < overlapInput.length; i++) {
    const a = overlapInput[i];
    const sameImb = overlapInput.filter((x) => x.imb === a.imb);
    if (
      listinoCondizioniSovrapposte(
        sameImb.map((x) => ({ id: x.id, qtyDa: x.qtyDa, qtyA: x.qtyA })),
        { id: a.id, qtyDa: a.qtyDa, qtyA: a.qtyA }
      )
    ) {
      return "Due scaglioni si sovrappongono sulla stessa confezione.";
    }
  }

  const usedGlobal = await loadTargheScontoUsate(supabase);
  const { data: keepRows } = keepIds.size
    ? await supabase
        .from("listini_righe_condizioni")
        .select("id, targa")
        .in("id", [...keepIds])
    : { data: [] as { id: string; targa: string }[] };
  const keepTargaById = new Map(
    ((keepRows ?? []) as { id: string; targa: string }[]).map((r) => [
      r.id,
      normalizeTargaSconto(r.targa),
    ])
  );
  const usedForAlloc = usedGlobal.filter((t) => {
    const n = normalizeTargaSconto(t);
    return ![...keepTargaById.values()].includes(n);
  });
  const batchTarghe: string[] = [];
  const persistedIds = new Set<string>();

  for (const c of condizioni) {
    const { data: stdLink } = await supabase
      .from("imballaggi_voci_prodotti")
      .select("max_kg")
      .eq("voce_id", c.imballaggioVoceId)
      .eq("prodotto_id", prodottoId)
      .is("deleted_at", null)
      .maybeSingle();
    const kgStandard =
      stdLink && Number.isFinite(Number((stdLink as { max_kg: number }).max_kg))
        ? Number((stdLink as { max_kg: number }).max_kg)
        : null;
    if (
      kgStandard != null &&
      c.kgConfezione > kgStandard &&
      !c.kgForzato
    ) {
      return `I ${c.kgConfezione} superano lo standard (${kgStandard}). Adegua o forza la scelta, poi Salva sul prodotto.`;
    }

    const resolved = resolveTargaSconto(c.targa, [...usedForAlloc, ...batchTarghe]);
    if ("error" in resolved) return resolved.error;
    batchTarghe.push(resolved.targa);

    const payload = {
      qty_da: c.qtyDa,
      qty_a: c.qtyA ?? null,
      imballaggio_voce_id: c.imballaggioVoceId,
      sconto_pct: c.scontoPct,
      kg_confezione: c.kgConfezione,
      kg_standard: kgStandard,
      kg_forzato: Boolean(c.kgForzato),
      targa: resolved.targa,
      updated_by: userId,
    };
    if (c.id) {
      const { error } = await supabase
        .from("listini_righe_condizioni")
        .update(payload)
        .eq("id", c.id)
        .is("deleted_at", null);
      if (error) return mapCondizioneWriteError(error.message);
      persistedIds.add(c.id);
    } else {
      const { data: inserted, error } = await supabase
        .from("listini_righe_condizioni")
        .insert({
          ...payload,
          listino_riga_id: listinoRigaId,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error || !inserted) {
        return mapCondizioneWriteError(
          error?.message ?? "Inserimento sconto fallito"
        );
      }
      persistedIds.add((inserted as { id: string }).id);
    }
  }

  const now = new Date().toISOString();
  for (const r of (existingRows ?? []) as { id: string }[]) {
    if (persistedIds.has(r.id)) continue;
    const { error } = await supabase
      .from("listini_righe_condizioni")
      .update({
        deleted_at: now,
        deleted_by: userId,
        updated_by: userId,
      })
      .eq("id", r.id)
      .is("deleted_at", null);
    if (error) return mapCondizioneWriteError(error.message);
  }
  return null;
}

export async function softDeleteListinoRigaAction(
  _id: string
): Promise<{ success: true } | { success: false; error: string }> {
  void _id;
  return {
    success: false,
    error:
      "Le voci prodotto non si eliminano. Dichiara «fuori produzione» o «al momento non disponibile».",
  };
}

export async function upsertListinoRigaCondizioneAction(input: unknown): Promise<
  | { success: true; item: ListinoRigaCondizione }
  | { success: false; error: string }
> {
  const { auth } = await guardAmm();
  const parsed = upsertListinoRigaCondizioneSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }

  const supabase = await createClient();
  const { data: riga, error: rigaErr } = await supabase
    .from("listini_righe")
    .select("id, listino_id, prodotto_id")
    .eq("id", parsed.data.listinoRigaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (rigaErr || !riga) {
    return { success: false, error: rigaErr?.message ?? "Riga listino non trovata" };
  }
  const gate = await requireListinoBozza(
    supabase,
    (riga as { listino_id: string }).listino_id
  );
  if (!gate.ok) return { success: false, error: gate.error };

  const { data: stdLink } = await supabase
    .from("imballaggi_voci_prodotti")
    .select("max_kg")
    .eq("voce_id", parsed.data.imballaggioVoceId)
    .eq("prodotto_id", (riga as { prodotto_id: string }).prodotto_id)
    .is("deleted_at", null)
    .maybeSingle();
  const kgStandard =
    stdLink && Number.isFinite(Number((stdLink as { max_kg: number }).max_kg))
      ? Number((stdLink as { max_kg: number }).max_kg)
      : null;
  if (
    kgStandard != null &&
    parsed.data.kgConfezione > kgStandard &&
    !parsed.data.kgForzato
  ) {
    return {
      success: false,
      error: `I ${parsed.data.kgConfezione} superano lo standard (${kgStandard}). Adegua allo standard oppure forza la scelta.`,
    };
  }

  const { data: existingRows } = await supabase
    .from("listini_righe_condizioni")
    .select("*")
    .eq("listino_riga_id", parsed.data.listinoRigaId)
    .eq("imballaggio_voce_id", parsed.data.imballaggioVoceId)
    .is("deleted_at", null);
  const esistenti = ((existingRows ?? []) as ListinoRigaCondizioneRow[]).map(
    (r) => ({
      id: r.id,
      qtyDa: Number(r.qty_da),
      qtyA: r.qty_a == null ? null : Number(r.qty_a),
    })
  );
  if (
    listinoCondizioniSovrapposte(esistenti, {
      id: parsed.data.id,
      qtyDa: parsed.data.qtyDa,
      qtyA: parsed.data.qtyA ?? null,
    })
  ) {
    return {
      success: false,
      error:
        "Lo scaglione si sovrappone a un’altra condizione per la stessa confezione.",
    };
  }

  const usedTarghe = await loadTargheScontoUsate(supabase);
  let excludeTarga = "";
  if (parsed.data.id) {
    const { data: cur } = await supabase
      .from("listini_righe_condizioni")
      .select("targa")
      .eq("id", parsed.data.id)
      .maybeSingle();
    excludeTarga = normalizeTargaSconto(
      String((cur as { targa?: string } | null)?.targa ?? "")
    );
  }
  const usedExceptSelf = usedTarghe.filter(
    (t) => normalizeTargaSconto(t) !== excludeTarga
  );
  const targaResolved = resolveTargaSconto(parsed.data.targa, usedExceptSelf);
  if ("error" in targaResolved) {
    return { success: false, error: targaResolved.error };
  }

  let row: ListinoRigaCondizioneRow | null = null;
  if (parsed.data.id) {
    const { data, error } = await supabase
      .from("listini_righe_condizioni")
      .update({
        qty_da: parsed.data.qtyDa,
        qty_a: parsed.data.qtyA ?? null,
        imballaggio_voce_id: parsed.data.imballaggioVoceId,
        sconto_pct: parsed.data.scontoPct,
        kg_confezione: parsed.data.kgConfezione,
        kg_standard: kgStandard,
        kg_forzato: Boolean(parsed.data.kgForzato),
        targa: targaResolved.targa,
        updated_by: auth.userId,
      })
      .eq("id", parsed.data.id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error || !data) {
      return {
        success: false,
        error: mapCondizioneWriteError(
          error?.message ?? "Aggiornamento fallito"
        ),
      };
    }
    row = data as ListinoRigaCondizioneRow;
  } else {
    const { data, error } = await supabase
      .from("listini_righe_condizioni")
      .insert({
        listino_riga_id: parsed.data.listinoRigaId,
        qty_da: parsed.data.qtyDa,
        qty_a: parsed.data.qtyA ?? null,
        imballaggio_voce_id: parsed.data.imballaggioVoceId,
        sconto_pct: parsed.data.scontoPct,
        kg_confezione: parsed.data.kgConfezione,
        kg_standard: kgStandard,
        kg_forzato: Boolean(parsed.data.kgForzato),
        targa: targaResolved.targa,
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("*")
      .single();
    if (error || !data) {
      return {
        success: false,
        error: mapCondizioneWriteError(error?.message ?? "Inserimento fallito"),
      };
    }
    row = data as ListinoRigaCondizioneRow;
  }

  await writeAuditLog({
    entity_type: "listini_righe_condizioni",
    entity_id: row.id,
    action: parsed.data.id ? "update" : "create",
    actor_id: auth.userId,
    summary: `Condizione sconto listino ${parsed.data.scontoPct}%`,
    payload: {
      qty_da: parsed.data.qtyDa,
      qty_a: parsed.data.qtyA ?? null,
      imballaggio_voce_id: parsed.data.imballaggioVoceId,
      sconto_pct: parsed.data.scontoPct,
      kg_confezione: parsed.data.kgConfezione,
      kg_standard: kgStandard,
      kg_forzato: Boolean(parsed.data.kgForzato),
      targa: targaResolved.targa,
    },
  });

  const { data: imb } = await supabase
    .from("imballaggi_voci")
    .select("codice, nome")
    .eq("id", row.imballaggio_voce_id)
    .maybeSingle();
  return {
    success: true,
    item: mapListinoRigaCondizione(
      row,
      imb
        ? { codice: (imb as { codice: string; nome: string }).codice, nome: (imb as { codice: string; nome: string }).nome }
        : undefined
    ),
  };
}

export async function softDeleteListinoRigaCondizioneAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guardAmm();
  const supabase = await createClient();
  const { data: cond } = await supabase
    .from("listini_righe_condizioni")
    .select("listino_riga_id")
    .eq("id", id)
    .maybeSingle();
  if (!cond) return { success: false, error: "Condizione non trovata" };
  const { data: riga } = await supabase
    .from("listini_righe")
    .select("listino_id")
    .eq("id", (cond as { listino_riga_id: string }).listino_riga_id)
    .maybeSingle();
  if (!riga) return { success: false, error: "Riga listino non trovata" };
  const gate = await requireListinoBozza(
    supabase,
    (riga as { listino_id: string }).listino_id
  );
  if (!gate.ok) return { success: false, error: gate.error };

  const { error } = await supabase
    .from("listini_righe_condizioni")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "listini_righe_condizioni",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Rimossa condizione sconto listino (soft delete)",
  });
  return { success: true };
}

export type ProdottoCanale = {
  id: string;
  codice: string;
  nome: string;
  slugPubblico: string;
  nomePubblico: string;
  descrizionePubblica: string;
  unitaMisura: string;
  visibileB2b: boolean;
  visibileB2c: boolean;
  visibileWiki: boolean;
  statoPubblicazione: StatoPubblicazioneCanale;
};

export async function listProdottiCanaliAction(): Promise<
  { success: true; items: ProdottoCanale[] } | { success: false; error: string }
> {
  await guardAmm();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prodotti_propri")
    .select(
      "id, codice, nome, slug_pubblico, nome_pubblico, descrizione_pubblica, unita_misura, visibile_b2b, visibile_b2c, visibile_wiki, stato_pubblicazione"
    )
    .is("deleted_at", null)
    .order("codice", { ascending: true });
  if (error) return { success: false, error: error.message };

  return {
    success: true,
    items: ((data ?? []) as ProdottoProprioRow[]).map((r) => ({
      id: r.id,
      codice: r.codice,
      nome: r.nome,
      slugPubblico: r.slug_pubblico ?? "",
      nomePubblico: r.nome_pubblico ?? "",
      descrizionePubblica: r.descrizione_pubblica ?? "",
      unitaMisura: r.unita_misura ?? "kg",
      visibileB2b: Boolean(r.visibile_b2b),
      visibileB2c: Boolean(r.visibile_b2c),
      visibileWiki: Boolean(r.visibile_wiki),
      statoPubblicazione: r.stato_pubblicazione ?? "bozza",
    })),
  };
}

export async function updateProdottoCanaleAction(input: {
  id: string;
  slugPubblico: string;
  nomePubblico: string;
  descrizionePubblica: string;
  unitaMisura: string;
  visibileB2b: boolean;
  visibileB2c: boolean;
  visibileWiki: boolean;
  statoPubblicazione: StatoPubblicazioneCanale;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await guardAmm();
  const stati: StatoPubblicazioneCanale[] = [
    "bozza",
    "approvato",
    "pubblicato",
    "ritirato",
  ];
  if (!stati.includes(input.statoPubblicazione)) {
    return { success: false, error: "Stato pubblicazione non valido" };
  }

  const slug = input.slugPubblico.trim().toLowerCase();
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { success: false, error: "Slug: solo minuscole, numeri e -" };
  }
  if (input.statoPubblicazione === "pubblicato" && !slug) {
    return { success: false, error: "Per pubblicare serve uno slug URL" };
  }

  const supabase = await createClient();
  const patch: Record<string, unknown> = {
    slug_pubblico: slug || null,
    nome_pubblico: input.nomePubblico.trim(),
    descrizione_pubblica: input.descrizionePubblica.trim(),
    unita_misura: input.unitaMisura.trim() || "kg",
    visibile_b2b: input.visibileB2b,
    visibile_b2c: input.visibileB2c,
    visibile_wiki: input.visibileWiki,
    stato_pubblicazione: input.statoPubblicazione,
    updated_by: auth.userId,
  };
  if (input.statoPubblicazione === "pubblicato") {
    patch.published_at = new Date().toISOString();
    patch.published_by = auth.userId;
  }

  const { error } = await supabase
    .from("prodotti_propri")
    .update(patch)
    .eq("id", input.id);
  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "prodotti_propri",
    entity_id: input.id,
    action: "status_change",
    actor_id: auth.userId,
    summary: `Pubblicazione canali prodotto → ${input.statoPubblicazione}`,
    payload: {
      slug,
      visibile_b2b: input.visibileB2b,
      visibile_wiki: input.visibileWiki,
    },
  });
  return { success: true };
}

export type { ListinoVoceVigente };

export async function getListinoVoceVigenteAction(
  prodottoId: string
): Promise<
  | { success: true; voce: ListinoVoceVigente | null }
  | { success: false; error: string }
> {
  await guardAmm();
  const res = await queryListinoVoceVigente(prodottoId);
  if (res.error) return { success: false, error: res.error };
  return { success: true, voce: res.voce };
}
