"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";
import {
  calcolaBilancioMassa,
  foglioConteggioInputSchema,
  postoLavoroInputSchema,
  slugPosto,
  type FoglioConteggio,
  type ProduzioneArea,
  type ProduzionePostoLavoro,
} from "@/lib/produzione/aree-posti";
import { listMacchinariByAreaIdsAction } from "@/app/actions/produzione-macchinari";
import type { ProduzioneMacchinario } from "@/lib/produzione/macchinari";
import { createClient } from "@/lib/supabase/server";

type AreaRow = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string;
  richiede_bilancio_massa: boolean;
  attivo: boolean;
  sort_order: number;
  versione: number;
  documento_stato: ProduzioneArea["documentoStato"];
  note: string;
  mostra_in_menu?: boolean;
  has_camera?: boolean;
  camera_ip?: string | null;
  camera_rtsp_path?: string | null;
};

type PostoRow = {
  id: string;
  area_id: string;
  codice: string;
  nome: string;
  descrizione: string;
  attivo: boolean;
  sort_order: number;
  note: string;
  has_camera?: boolean;
  camera_ip?: string | null;
  camera_rtsp_path?: string | null;
};

function mapPosto(row: PostoRow): ProduzionePostoLavoro {
  return {
    id: row.id,
    areaId: row.area_id,
    codice: row.codice,
    nome: row.nome,
    descrizione: row.descrizione ?? "",
    attivo: Boolean(row.attivo),
    sortOrder: row.sort_order ?? 0,
    note: row.note ?? "",
    hasCamera: Boolean(row.has_camera),
    cameraIp: row.camera_ip ?? null,
    cameraRtspPath: row.camera_rtsp_path || "/live/ch0",
  };
}

function mapArea(
  row: AreaRow,
  posti: ProduzionePostoLavoro[],
  macchinari: ProduzioneMacchinario[]
): ProduzioneArea {
  return {
    id: row.id,
    codice: row.codice,
    nome: row.nome,
    descrizione: row.descrizione ?? "",
    richiedeBilancioMassa: Boolean(row.richiede_bilancio_massa),
    attivo: Boolean(row.attivo),
    sortOrder: row.sort_order ?? 0,
    versione: row.versione ?? 1,
    documentoStato: row.documento_stato,
    note: row.note ?? "",
    mostraInMenu: row.mostra_in_menu !== false,
    hasCamera: Boolean(row.has_camera),
    cameraIp: row.camera_ip ?? null,
    cameraRtspPath: row.camera_rtsp_path || "/live/ch0",
    posti,
    macchinari,
  };
}

export async function listProduzioneAreeAction(): Promise<
  | { success: true; items: ProduzioneArea[]; isAdmin: boolean }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data: aree, error } = await supabase
    .from("produzione_aree")
    .select(
      "id, codice, nome, descrizione, richiede_bilancio_massa, attivo, sort_order, versione, documento_stato, note, mostra_in_menu, has_camera, camera_ip, camera_rtsp_path"
    )
    .is("deleted_at", null)
    .eq("attivo", true)
    .order("sort_order", { ascending: true });
  if (error) return { success: false, error: error.message };

  const ids = ((aree ?? []) as AreaRow[]).map((a) => a.id);
  const postiByArea = new Map<string, ProduzionePostoLavoro[]>();
  if (ids.length) {
    const { data: posti, error: pErr } = await supabase
      .from("produzione_posti_lavoro")
      .select("id, area_id, codice, nome, descrizione, attivo, sort_order, note, has_camera, camera_ip, camera_rtsp_path")
      .is("deleted_at", null)
      .in("area_id", ids)
      .order("sort_order", { ascending: true });
    if (pErr) return { success: false, error: pErr.message };
    for (const p of (posti ?? []) as PostoRow[]) {
      const list = postiByArea.get(p.area_id) ?? [];
      list.push(mapPosto(p));
      postiByArea.set(p.area_id, list);
    }
  }

  const macRes = await listMacchinariByAreaIdsAction(ids);
  if (!macRes.success) return macRes;
  const macByArea = new Map<string, ProduzioneMacchinario[]>();
  for (const m of macRes.items) {
    const list = macByArea.get(m.areaId) ?? [];
    list.push(m);
    macByArea.set(m.areaId, list);
  }

  return {
    success: true,
    isAdmin: isAdminLikeProfile(auth.profile),
    items: ((aree ?? []) as AreaRow[]).map((a) =>
      mapArea(a, postiByArea.get(a.id) ?? [], macByArea.get(a.id) ?? [])
    ),
  };
}

export async function createPostoLavoroAction(
  raw: unknown
): Promise<
  { success: true; item: ProduzionePostoLavoro } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = postoLavoroInputSchema.safeParse({
    ...(raw as object),
    codice: slugPosto(String((raw as { codice?: string })?.codice ?? "")),
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_posti_lavoro")
    .insert({
      area_id: v.areaId,
      codice: v.codice.toLowerCase(),
      nome: v.nome.trim(),
      descrizione: v.descrizione ?? "",
      attivo: v.attivo ?? true,
      sort_order: v.sortOrder ?? 100,
      note: v.note ?? "",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id, area_id, codice, nome, descrizione, attivo, sort_order, note")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Salvataggio fallito" };
  }
  const item = mapPosto(data as PostoRow);
  await writeAuditLog({
    entity_type: "produzione_posti_lavoro",
    entity_id: item.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creato posto lavoro ${item.codice}`,
    payload: { area_id: item.areaId, codice: item.codice, nome: item.nome },
  });
  return { success: true, item };
}

export async function updatePostoLavoroAction(
  id: string,
  raw: unknown
): Promise<
  { success: true; item: ProduzionePostoLavoro } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = postoLavoroInputSchema.safeParse({
    ...(raw as object),
    codice: slugPosto(String((raw as { codice?: string })?.codice ?? "")),
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_posti_lavoro")
    .update({
      codice: v.codice.toLowerCase(),
      nome: v.nome.trim(),
      descrizione: v.descrizione ?? "",
      attivo: v.attivo ?? true,
      sort_order: v.sortOrder ?? 100,
      note: v.note ?? "",
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, area_id, codice, nome, descrizione, attivo, sort_order, note")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Aggiornamento fallito" };
  }
  const item = mapPosto(data as PostoRow);
  await writeAuditLog({
    entity_type: "produzione_posti_lavoro",
    entity_id: item.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornato posto lavoro ${item.codice}`,
    payload: { nome: item.nome },
  });
  return { success: true, item };
}

export async function softDeletePostoLavoroAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { error } = await supabase
    .from("produzione_posti_lavoro")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await writeAuditLog({
    entity_type: "produzione_posti_lavoro",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Soft delete posto lavoro",
  });
  return { success: true };
}

export async function upsertFoglioLavorazioneAction(input: {
  id: string;
  codice: string;
  descrizione: string;
  prodotto: string;
  stato: "aperto" | "chiuso";
  startedAt: string;
  expectedEndAt: string;
  closedAt?: string | null;
  note?: string;
  motivo: "magazzino" | "ordine";
  ordineId?: string | null;
  ordineLabel?: string | null;
  lottoId?: string | null;
  lottoLabel?: string | null;
  codiceProdottoUscita?: string | null;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("produzione");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.id
    )
  ) {
    return { success: false, error: "Identificativo foglio non valido" };
  }
  const supabase = await createClient();
  const row = {
    id: input.id,
    codice: input.codice,
    descrizione: input.descrizione,
    prodotto: input.prodotto,
    stato: input.stato,
    started_at: input.startedAt,
    expected_end_at: input.expectedEndAt,
    closed_at: input.closedAt ?? null,
    closed_by: input.stato === "chiuso" ? auth.userId : null,
    note: input.note ?? "",
    motivo: input.motivo,
    ordine_id: input.ordineId ?? null,
    ordine_label: input.ordineLabel ?? null,
    lotto_id: input.lottoId ?? null,
    lotto_label: input.lottoLabel ?? null,
    codice_prodotto_uscita: input.codiceProdottoUscita ?? null,
    documento_stato: input.stato === "chiuso" ? "chiuso" : "bozza",
    updated_by: auth.userId,
  };
  const { data: existing } = await supabase
    .from("produzione_fogli_lavorazione")
    .select("id")
    .eq("id", input.id)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from("produzione_fogli_lavorazione")
      .update(row)
      .eq("id", input.id);
    if (error) return { success: false, error: error.message };
    if (input.stato === "chiuso") {
      await writeAuditLog({
        entity_type: "produzione_fogli_lavorazione",
        entity_id: input.id,
        action: "close",
        actor_id: auth.userId,
        summary: `Chiuso foglio ${input.codice}`,
      });
    }
  } else {
    const { error } = await supabase.from("produzione_fogli_lavorazione").insert({
      ...row,
      created_by: auth.userId,
    });
    if (error) return { success: false, error: error.message };
    await writeAuditLog({
      entity_type: "produzione_fogli_lavorazione",
      entity_id: input.id,
      action: "create",
      actor_id: auth.userId,
      summary: `Creato foglio ${input.codice}`,
    });
  }
  return { success: true, id: input.id };
}

export async function getFoglioConteggioAction(
  foglioId: string,
  areaId: string
): Promise<
  { success: true; item: FoglioConteggio | null } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_foglio_conteggi")
    .select("*")
    .eq("foglio_id", foglioId)
    .eq("area_id", areaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: true, item: null };
  const r = data as {
    id: string;
    foglio_id: string;
    area_id: string;
    kg_versati: number;
    kg_essiccatori: number;
    kg_non_conformi: number;
    esito_bilancio: FoglioConteggio["esitoBilancio"];
    delta_kg: number;
    note_nc: string;
    esito_nc: string;
    approved_at: string | null;
    approved_by: string | null;
  };
  return {
    success: true,
    item: {
      id: r.id,
      foglioId: r.foglio_id,
      areaId: r.area_id,
      kgVersati: Number(r.kg_versati),
      kgEssiccatori: Number(r.kg_essiccatori),
      kgNonConformi: Number(r.kg_non_conformi),
      esitoBilancio: r.esito_bilancio,
      deltaKg: Number(r.delta_kg),
      noteNc: r.note_nc ?? "",
      esitoNc: r.esito_nc ?? "",
      approvedAt: r.approved_at,
      approvedBy: r.approved_by,
    },
  };
}

export async function upsertFoglioConteggioAction(raw: unknown): Promise<
  { success: true; item: FoglioConteggio } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = foglioConteggioInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi",
    };
  }
  const v = parsed.data;
  const { esito, deltaKg } = calcolaBilancioMassa(v);
  const supabase = await createClient();

  const { data: foglio } = await supabase
    .from("produzione_fogli_lavorazione")
    .select("id, stato")
    .eq("id", v.foglioId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!foglio) {
    return { success: false, error: "Foglio non trovato su database. Salva prima il foglio." };
  }
  if ((foglio as { stato: string }).stato === "chiuso") {
    return { success: false, error: "Il foglio è chiuso: i conteggi non si modificano." };
  }

  const payload = {
    foglio_id: v.foglioId,
    area_id: v.areaId,
    kg_versati: v.kgVersati,
    kg_essiccatori: v.kgEssiccatori,
    kg_non_conformi: v.kgNonConformi,
    esito_bilancio: esito,
    delta_kg: deltaKg,
    note_nc: v.noteNc ?? "",
    esito_nc: v.esitoNc ?? "",
    approved_at: esito === "ok" ? new Date().toISOString() : null,
    approved_by: esito === "ok" ? auth.userId : null,
    updated_by: auth.userId,
  };

  const existing = await getFoglioConteggioAction(v.foglioId, v.areaId);
  if (!existing.success) return existing;

  let id = existing.item?.id;
  if (id) {
    const { error } = await supabase
      .from("produzione_foglio_conteggi")
      .update(payload)
      .eq("id", id);
    if (error) return { success: false, error: error.message };
  } else {
    const { data, error } = await supabase
      .from("produzione_foglio_conteggi")
      .insert({ ...payload, created_by: auth.userId })
      .select("id")
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Salvataggio conteggio fallito" };
    }
    id = (data as { id: string }).id;
  }

  await writeAuditLog({
    entity_type: "produzione_foglio_conteggi",
    entity_id: id,
    action: existing.item ? "update" : "create",
    actor_id: auth.userId,
    summary: `Bilancio massa foglio ${v.foglioId.slice(0, 8)}: ${esito}`,
    payload: {
      kg_versati: v.kgVersati,
      kg_essiccatori: v.kgEssiccatori,
      kg_non_conformi: v.kgNonConformi,
      esito,
      delta_kg: deltaKg,
    },
  });

  const loaded = await getFoglioConteggioAction(v.foglioId, v.areaId);
  if (!loaded.success || !loaded.item) {
    return { success: false, error: "Conteggio salvato ma non ricaricato" };
  }
  return { success: true, item: loaded.item };
}

export async function canCloseFoglioAction(
  foglioId: string
): Promise<
  { success: true; ok: boolean; error?: string } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data: aree, error } = await supabase
    .from("produzione_aree")
    .select("id, nome")
    .eq("richiede_bilancio_massa", true)
    .eq("attivo", true)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  for (const a of (aree ?? []) as { id: string; nome: string }[]) {
    const c = await getFoglioConteggioAction(foglioId, a.id);
    if (!c.success) return c;
    if (!c.item || c.item.esitoBilancio !== "ok") {
      return {
        success: true,
        ok: false,
        error: `Bilancio ${a.nome} non in equilibrio: kg versati deve uguagliare essiccatori + non conformi.`,
      };
    }
  }
  return { success: true, ok: true };
}
