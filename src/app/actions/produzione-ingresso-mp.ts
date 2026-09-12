"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { nextSequentialCodiceTarga } from "@/lib/amministrazione/codice-targa";
import {
  composeLottoIngressoMp,
  foglioIngressoSaveSchema,
  isValidLottoIngressoMp,
  MEZZO_FOTO_KINDS,
  nextSeqFromLotti,
  nuovoAutistaSchema,
  nuovoFornitoreRapidoSchema,
  nuovoMezzoSchema,
  prefixLottoDaData,
  type ConfezionamentoMp,
  type ConfezioneRiga,
  type FoglioIngressoMp,
  type IngressoMpStato,
  type MezzoFotoKind,
  type MezzoIngresso,
  type QuantitaTipoIngresso,
} from "@/lib/produzione/fogli-ingresso-mp";
import { normalizeTipologie } from "@/lib/amministrazione/catalogo-offerta";
import { createClient } from "@/lib/supabase/server";
import type { FornitoreTipologia } from "@/types/database";

const BUCKET = "produzione-ingresso-mp";

type FoglioRow = {
  id: string;
  codice: string;
  lotto_codice: string | null;
  versione: number;
  documento_stato: IngressoMpStato;
  fornitore_id: string;
  materia_prima_id: string;
  is_bio: boolean;
  quantita: number | string;
  quantita_unita: string;
  quantita_tipo: QuantitaTipoIngresso;
  ddt_produttore: string;
  ddt_file_path: string | null;
  ddt_file_name: string | null;
  arrivato_at: string;
  mezzo_id: string | null;
  autista_contatto_id: string | null;
  scarico_mezzo: string;
  operatore_muletto_id: string | null;
  confirmed_at: string | null;
  closed_at: string | null;
  note: string;
  created_at: string;
};

function mapFoglio(
  r: FoglioRow,
  extra: {
    fornitoreLabel: string;
    fornitoreTarga: string;
    fornitoreBio: boolean;
    materiaPrimaLabel: string;
    mezzoTarga: string | null;
    autistaLabel: string | null;
    operatoreLabel: string | null;
    confezioni: ConfezioneRiga[];
  }
): FoglioIngressoMp {
  return {
    id: r.id,
    codice: r.codice,
    lottoCodice: r.lotto_codice,
    versione: r.versione,
    documentoStato: r.documento_stato,
    fornitoreId: r.fornitore_id,
    fornitoreLabel: extra.fornitoreLabel,
    fornitoreTarga: extra.fornitoreTarga,
    fornitoreBio: extra.fornitoreBio,
    materiaPrimaId: r.materia_prima_id,
    materiaPrimaLabel: extra.materiaPrimaLabel,
    isBio: r.is_bio,
    quantita: Number(r.quantita) || 0,
    quantitaUnita: r.quantita_unita,
    quantitaTipo: r.quantita_tipo,
    ddtProduttore: r.ddt_produttore ?? "",
    ddtFilePath: r.ddt_file_path,
    ddtFileName: r.ddt_file_name,
    arrivatoAt: r.arrivato_at,
    mezzoId: r.mezzo_id,
    mezzoTarga: extra.mezzoTarga,
    autistaContattoId: r.autista_contatto_id,
    autistaLabel: extra.autistaLabel,
    scaricoMezzo: r.scarico_mezzo,
    operatoreMulettoId: r.operatore_muletto_id,
    operatoreMulettoLabel: extra.operatoreLabel,
    confirmedAt: r.confirmed_at,
    closedAt: r.closed_at,
    note: r.note ?? "",
    confezioni: extra.confezioni,
    createdAt: r.created_at,
  };
}

async function hydrateFogli(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: FoglioRow[]
): Promise<FoglioIngressoMp[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const fornIds = [...new Set(rows.map((r) => r.fornitore_id))];
  const mpIds = [...new Set(rows.map((r) => r.materia_prima_id))];
  const mezzoIds = [
    ...new Set(rows.map((r) => r.mezzo_id).filter((x): x is string => Boolean(x))),
  ];
  const autistaIds = [
    ...new Set(
      rows.map((r) => r.autista_contatto_id).filter((x): x is string => Boolean(x))
    ),
  ];
  const opIds = [
    ...new Set(
      rows.map((r) => r.operatore_muletto_id).filter((x): x is string => Boolean(x))
    ),
  ];

  const [forn, mp, mezzi, autisti, ops, confs] = await Promise.all([
    supabase
      .from("fornitori")
      .select("id, codice_targa, ragione_sociale, bio_certificato_path")
      .in("id", fornIds),
    supabase.from("materie_prime").select("id, codice, nome").in("id", mpIds),
    mezzoIds.length
      ? supabase.from("produzione_mezzi").select("id, targa").in("id", mezzoIds)
      : Promise.resolve({ data: [] }),
    autistaIds.length
      ? supabase
          .from("rubrica_contatti")
          .select("id, nome, cognome")
          .in("id", autistaIds)
      : Promise.resolve({ data: [] }),
    opIds.length
      ? supabase
          .from("organigramma_persone")
          .select("id, nome, cognome")
          .in("id", opIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("produzione_fogli_ingresso_confezioni")
      .select("id, foglio_id, confezionamento_id, quantita_confezioni, peso_kg")
      .in("foglio_id", ids)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
  ]);

  const fornMap = new Map(
    ((forn.data ?? []) as Array<{
      id: string;
      codice_targa: string;
      ragione_sociale: string;
      bio_certificato_path: string | null;
    }>).map((f) => [f.id, f])
  );
  const mpMap = new Map(
    ((mp.data ?? []) as Array<{ id: string; codice: string; nome: string }>).map(
      (m) => [m.id, m]
    )
  );
  const mezzoMap = new Map(
    ((mezzi.data ?? []) as Array<{ id: string; targa: string }>).map((m) => [
      m.id,
      m.targa,
    ])
  );
  const autMap = new Map(
    ((autisti.data ?? []) as Array<{ id: string; nome: string; cognome: string }>).map(
      (a) => [a.id, `${a.nome} ${a.cognome}`.trim()]
    )
  );
  const opMap = new Map(
    ((ops.data ?? []) as Array<{ id: string; nome: string; cognome: string }>).map(
      (a) => [a.id, `${a.nome} ${a.cognome}`.trim()]
    )
  );
  const confBy = new Map<string, ConfezioneRiga[]>();
  for (const c of (confs.data ?? []) as Array<{
    id: string;
    foglio_id: string;
    confezionamento_id: string;
    quantita_confezioni: number;
    peso_kg: number | null;
  }>) {
    const list = confBy.get(c.foglio_id) ?? [];
    list.push({
      id: c.id,
      confezionamentoId: c.confezionamento_id,
      quantitaConfezioni: c.quantita_confezioni,
      pesoKg: c.peso_kg != null ? Number(c.peso_kg) : null,
    });
    confBy.set(c.foglio_id, list);
  }

  return rows.map((r) => {
    const f = fornMap.get(r.fornitore_id);
    const m = mpMap.get(r.materia_prima_id);
    return mapFoglio(r, {
      fornitoreLabel: f ? `${f.codice_targa} — ${f.ragione_sociale}` : "—",
      fornitoreTarga: f?.codice_targa ?? "",
      fornitoreBio: Boolean(f?.bio_certificato_path),
      materiaPrimaLabel: m ? `${m.codice} — ${m.nome}` : "—",
      mezzoTarga: r.mezzo_id ? mezzoMap.get(r.mezzo_id) ?? null : null,
      autistaLabel: r.autista_contatto_id
        ? autMap.get(r.autista_contatto_id) ?? null
        : null,
      operatoreLabel: r.operatore_muletto_id
        ? opMap.get(r.operatore_muletto_id) ?? null
        : null,
      confezioni: confBy.get(r.id) ?? [],
    });
  });
}

export async function listConfezionamentiMpAction(): Promise<
  | { success: true; items: ConfezionamentoMp[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_confezionamenti_mp")
    .select("id, codice, nome, label_numero, media_peso_kg, conteggio_pesate")
    .is("deleted_at", null)
    .eq("attivo", true)
    .order("sort_order", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as Array<{
      id: string;
      codice: string;
      nome: string;
      label_numero: string;
      media_peso_kg: number | null;
      conteggio_pesate: number;
    }>).map((r) => ({
      id: r.id,
      codice: r.codice,
      nome: r.nome,
      labelNumero: r.label_numero,
      mediaPesoKg: r.media_peso_kg != null ? Number(r.media_peso_kg) : null,
      conteggioPesate: r.conteggio_pesate,
    })),
  };
}

export async function listFornitoriIngressoAction(): Promise<
  | {
      success: true;
      items: Array<{
        id: string;
        label: string;
        targa: string;
        isBio: boolean;
        tipologie: FornitoreTipologia[];
      }>;
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fornitori")
    .select("id, codice_targa, ragione_sociale, bio_certificato_path, tipologie")
    .is("deleted_at", null)
    .order("codice_targa", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as Array<{
      id: string;
      codice_targa: string;
      ragione_sociale: string;
      bio_certificato_path: string | null;
      tipologie: FornitoreTipologia[] | null;
    }>).map((r) => ({
      id: r.id,
      label: `${r.codice_targa} — ${r.ragione_sociale}`,
      targa: r.codice_targa,
      isBio: Boolean(r.bio_certificato_path?.trim()),
      tipologie: normalizeTipologie(r.tipologie),
    })),
  };
}

export async function listMateriePrimeIngressoAction(): Promise<
  | {
      success: true;
      items: Array<{ id: string; label: string; isBio: boolean }>;
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materie_prime")
    .select("id, codice, nome, is_bio")
    .is("deleted_at", null)
    .order("codice", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as Array<{
      id: string;
      codice: string;
      nome: string;
      is_bio: boolean;
    }>).map((r) => ({
      id: r.id,
      label: `${r.codice} — ${r.nome}`,
      isBio: Boolean(r.is_bio),
    })),
  };
}

export async function listAutistiIngressoAction(
  fornitoreId: string
): Promise<
  | { success: true; items: Array<{ id: string; label: string }> }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  if (!fornitoreId) return { success: true, items: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rubrica_contatti")
    .select("id, nome, cognome")
    .eq("azienda_tipo", "fornitore")
    .eq("azienda_id", fornitoreId)
    .is("deleted_at", null)
    .order("cognome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as Array<{ id: string; nome: string; cognome: string }>).map(
      (r) => ({ id: r.id, label: `${r.nome} ${r.cognome}`.trim() })
    ),
  };
}

export async function listMezziIngressoAction(): Promise<
  { success: true; items: MezzoIngresso[] } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_mezzi")
    .select("id, targa, fornitore_id, azienda_nome")
    .is("deleted_at", null)
    .order("targa", { ascending: true });
  if (error) return { success: false, error: error.message };
  const mezzi = (data ?? []) as Array<{
    id: string;
    targa: string;
    fornitore_id: string | null;
    azienda_nome: string;
  }>;
  const ids = mezzi.map((m) => m.id);
  const fotoRes =
    ids.length === 0
      ? { data: [] }
      : await supabase
          .from("produzione_mezzi_foto")
          .select("id, mezzo_id, kind, storage_path")
          .in("mezzo_id", ids)
          .is("deleted_at", null);
  const fotoBy = new Map<
    string,
    MezzoIngresso["foto"]
  >();
  for (const f of (fotoRes.data ?? []) as Array<{
    id: string;
    mezzo_id: string;
    kind: MezzoFotoKind;
    storage_path: string;
  }>) {
    const list = fotoBy.get(f.mezzo_id) ?? [];
    list.push({ id: f.id, kind: f.kind, path: f.storage_path });
    fotoBy.set(f.mezzo_id, list);
  }
  return {
    success: true,
    items: mezzi.map((m) => ({
      id: m.id,
      targa: m.targa,
      fornitoreId: m.fornitore_id,
      aziendaNome: m.azienda_nome,
      foto: fotoBy.get(m.id) ?? [],
    })),
  };
}

export async function listFogliIngressoMpAction(filtro: {
  storico?: boolean;
}): Promise<
  { success: true; items: FoglioIngressoMp[] } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  let q = supabase
    .from("produzione_fogli_ingresso_mp")
    .select("*")
    .is("deleted_at", null)
    .order("arrivato_at", { ascending: false })
    .limit(200);
  q = filtro.storico
    ? q.eq("documento_stato", "chiuso")
    : q.in("documento_stato", ["bozza", "registrato"]);
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  const items = await hydrateFogli(supabase, (data ?? []) as FoglioRow[]);
  return { success: true, items };
}

export async function getFoglioIngressoMpAction(
  id: string
): Promise<
  { success: true; item: FoglioIngressoMp } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Foglio non trovato." };
  }
  const items = await hydrateFogli(supabase, [data as FoglioRow]);
  const item = items[0];
  if (!item) return { success: false, error: "Foglio non trovato." };
  return { success: true, item };
}

async function queryCodiciMpLavorata(): Promise<
  | {
      success: true;
      items: Array<{
        lotto: string;
        fornitoreTarga: string;
        fornitoreLabel: string;
        materiaPrima: string;
        arrivatoAt: string;
      }>;
    }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .select(
      "lotto_codice, fornitore_id, materia_prima_id, arrivato_at, fornitori(codice_targa, ragione_sociale), materie_prime(codice, nome)"
    )
    .is("deleted_at", null)
    .not("lotto_codice", "is", null)
    .in("documento_stato", ["registrato", "chiuso"])
    .order("arrivato_at", { ascending: false })
    .limit(300);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as Array<{
      lotto_codice: string;
      arrivato_at: string;
      fornitori:
        | { codice_targa: string; ragione_sociale: string }
        | { codice_targa: string; ragione_sociale: string }[]
        | null;
      materie_prime:
        | { codice: string; nome: string }
        | { codice: string; nome: string }[]
        | null;
    }>).map((r) => {
      const f = Array.isArray(r.fornitori) ? r.fornitori[0] : r.fornitori;
      const m = Array.isArray(r.materie_prime)
        ? r.materie_prime[0]
        : r.materie_prime;
      return {
        lotto: r.lotto_codice,
        fornitoreTarga: (f?.codice_targa ?? "").replace(/^F/i, ""),
        fornitoreLabel: f
          ? `${f.codice_targa} — ${f.ragione_sociale}`
          : "—",
        materiaPrima: m ? `${m.codice} — ${m.nome}` : "—",
        arrivatoAt: r.arrivato_at,
      };
    }),
  };
}

export async function listCodiciMpLavorataAction(): Promise<
  Awaited<ReturnType<typeof queryCodiciMpLavorata>>
> {
  await requireAreaAccess("produzione");
  return queryCodiciMpLavorata();
}

export async function listCodiciMpLavorataMagazzinoAction(): Promise<
  Awaited<ReturnType<typeof queryCodiciMpLavorata>>
> {
  await requireAreaAccess("magazzino");
  return queryCodiciMpLavorata();
}

export async function createFornitoreRapidoIngressoAction(raw: unknown): Promise<
  | {
      success: true;
      id: string;
      label: string;
      targa: string;
      isBio: false;
      tipologie: FornitoreTipologia[];
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = nuovoFornitoreRapidoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati fornitore non validi.",
    };
  }
  const supabase = await createClient();
  const { data: usedRows } = await supabase
    .from("fornitori")
    .select("codice_targa");
  const used = ((usedRows ?? []) as Array<{ codice_targa: string }>).map(
    (r) => r.codice_targa
  );
  let targa: string;
  try {
    targa = nextSequentialCodiceTarga("F", used);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Targa fornitore non disponibile.",
    };
  }
  const empty = "";
  const { data, error } = await supabase
    .from("fornitori")
    .insert({
      codice_targa: targa,
      ragione_sociale: parsed.data.ragioneSociale,
      partita_iva: parsed.data.partitaIva,
      codice_fiscale: parsed.data.partitaIva,
      email: empty,
      pec: empty,
      sdi_code: empty,
      telefono: empty,
      sito_web: empty,
      tipologie: parsed.data.tipologie ?? ["materia_prima"],
      servizi_offerti: [],
      prodotti_fornitore: [],
      sede_amm_nazione: empty,
      sede_amm_provincia: empty,
      sede_amm_citta: empty,
      sede_amm_cap: empty,
      sede_amm_indirizzo: empty,
      sede_mag_nazione: empty,
      sede_mag_provincia: empty,
      sede_mag_citta: empty,
      sede_mag_cap: empty,
      sede_mag_indirizzo: empty,
      prodotti_acquistati: [],
      bio_certificato: "",
      bio_certificato_path: "",
      bio_codice: "",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id, codice_targa, ragione_sociale")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Creazione fornitore fallita." };
  }
  void writeAuditLog({
    entity_type: "fornitori",
    entity_id: data.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Fornitore rapido ingresso MP ${data.codice_targa}`,
    payload: { ragione_sociale: data.ragione_sociale },
  });
  return {
    success: true,
    id: data.id,
    targa: data.codice_targa,
    label: `${data.codice_targa} — ${data.ragione_sociale}`,
    isBio: false,
    tipologie: parsed.data.tipologie ?? ["materia_prima"],
  };
}

export async function createMezzoIngressoAction(raw: unknown): Promise<
  { success: true; item: MezzoIngresso } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = nuovoMezzoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati mezzo non validi.",
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_mezzi")
    .insert({
      targa: parsed.data.targa.trim().toUpperCase(),
      fornitore_id: parsed.data.fornitoreId ?? null,
      azienda_nome: parsed.data.aziendaNome?.trim() ?? "",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id, targa, fornitore_id, azienda_nome")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Mezzo non salvato." };
  }
  void writeAuditLog({
    entity_type: "produzione_mezzi",
    entity_id: data.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Mezzo ingresso ${data.targa}`,
    payload: { targa: data.targa },
  });
  return {
    success: true,
    item: {
      id: data.id,
      targa: data.targa,
      fornitoreId: data.fornitore_id,
      aziendaNome: data.azienda_nome,
      foto: [],
    },
  };
}

export async function createAutistaIngressoAction(raw: unknown): Promise<
  | { success: true; id: string; label: string }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = nuovoAutistaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati autista non validi.",
    };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { data: mansioneAutista } = await supabase
    .from("rubrica_mansioni")
    .select("id, nome")
    .eq("codice", "autista")
    .is("deleted_at", null)
    .maybeSingle();
  const { data, error } = await supabase
    .from("rubrica_contatti")
    .insert({
      nome: v.nome,
      cognome: v.cognome,
      telefono: v.telefono,
      email: "",
      rapporto: "referente",
      azienda_tipo: "fornitore",
      azienda_id: v.fornitoreId,
      azienda_label: v.fornitoreLabel,
      mansione_id: mansioneAutista?.id ?? null,
      mansione: mansioneAutista?.nome ?? "Autista",
      note: v.note,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id, nome, cognome")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Autista non salvato." };
  }
  await supabase.from("fornitori_referenti").insert({
    fornitore_id: v.fornitoreId,
    contatto_id: data.id,
    created_by: auth.userId,
  });
  return {
    success: true,
    id: data.id,
    label: `${data.nome} ${data.cognome}`.trim(),
  };
}

async function replaceConfezioni(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foglioId: string,
  userId: string,
  righe: ConfezioneRiga[]
) {
  await supabase
    .from("produzione_fogli_ingresso_confezioni")
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq("foglio_id", foglioId)
    .is("deleted_at", null);
  if (righe.length === 0) return;
  const { error } = await supabase
    .from("produzione_fogli_ingresso_confezioni")
    .insert(
      righe.map((r, i) => ({
        foglio_id: foglioId,
        confezionamento_id: r.confezionamentoId,
        quantita_confezioni: r.quantitaConfezioni,
        peso_kg: r.pesoKg ?? null,
        sort_order: i,
        created_by: userId,
        updated_by: userId,
      }))
    );
  if (error) throw new Error(error.message);
}

export async function saveFoglioIngressoMpAction(raw: unknown): Promise<
  { success: true; item: FoglioIngressoMp } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = foglioIngressoSaveSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati foglio non validi.",
    };
  }
  const v = parsed.data;
  const supabase = await createClient();

  const { data: forn } = await supabase
    .from("fornitori")
    .select("id, bio_certificato_path")
    .eq("id", v.fornitoreId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!forn) return { success: false, error: "Fornitore non trovato." };
  const fornBio = Boolean(
    (forn as { bio_certificato_path?: string }).bio_certificato_path?.trim()
  );
  if (v.isBio && !fornBio) {
    return {
      success: false,
      error:
        "Il materiale bio è consentito solo se il fornitore ha il certificato caricato.",
    };
  }

  const payload = {
    fornitore_id: v.fornitoreId,
    materia_prima_id: v.materiaPrimaId,
    is_bio: v.isBio,
    quantita: v.quantita,
    quantita_unita: v.quantitaUnita,
    quantita_tipo: v.quantitaTipo,
    ddt_produttore: v.ddtProduttore,
    ddt_file_path: v.ddtFilePath ?? null,
    ddt_file_name: v.ddtFileName ?? null,
    arrivato_at: new Date(v.arrivatoAt).toISOString(),
    mezzo_id: v.mezzoId ?? null,
    autista_contatto_id: v.autistaContattoId ?? null,
    scarico_mezzo: v.scaricoMezzo,
    operatore_muletto_id: v.operatoreMulettoId ?? null,
    note: v.note,
    updated_by: auth.userId,
  };

  let id = v.id;
  if (id) {
    const { data: existing } = await supabase
      .from("produzione_fogli_ingresso_mp")
      .select("id, documento_stato, versione")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing) return { success: false, error: "Foglio non trovato." };
    if ((existing as { documento_stato: string }).documento_stato === "chiuso") {
      return { success: false, error: "Il foglio chiuso non è modificabile." };
    }
    const { error } = await supabase
      .from("produzione_fogli_ingresso_mp")
      .update({
        ...payload,
        versione: Number((existing as { versione: number }).versione ?? 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return { success: false, error: error.message };
  } else {
    const stamp = new Date();
    const codice = `FIMP-${prefixLottoDaData(stamp)}-${formatHex5Local(
      Math.floor(Math.random() * 0xfffff) + 1
    )}`;
    const { data, error } = await supabase
      .from("produzione_fogli_ingresso_mp")
      .insert({
        ...payload,
        codice,
        documento_stato: "bozza",
        versione: 1,
        created_by: auth.userId,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Salvataggio fallito." };
    }
    id = data.id;
  }
  if (!id) return { success: false, error: "Salvataggio fallito." };

  try {
    await replaceConfezioni(
      supabase,
      id,
      auth.userId,
      v.confezioni.map((r) => ({
        id: r.id,
        confezionamentoId: r.confezionamentoId,
        quantitaConfezioni: r.quantitaConfezioni,
        pesoKg: r.pesoKg ?? null,
      }))
    );
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Confezionamenti non salvati.",
    };
  }

  void writeAuditLog({
    entity_type: "produzione_fogli_ingresso_mp",
    entity_id: id,
    action: v.id ? "update" : "create",
    actor_id: auth.userId,
    summary: v.id
      ? `Aggiornato foglio ingresso MP`
      : `Creato foglio ingresso MP`,
    payload: {
      fornitore_id: v.fornitoreId,
      materia_prima_id: v.materiaPrimaId,
      quantita: v.quantita,
      quantita_tipo: v.quantitaTipo,
    },
  });

  return getFoglioIngressoMpAction(id);
}

function formatHex5Local(n: number): string {
  return Math.max(1, n).toString(16).toUpperCase().padStart(5, "0");
}

export async function generaLottoIngressoMpAction(
  foglioId: string
): Promise<
  | { success: true; lottoCodice: string; item: FoglioIngressoMp }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .select("*")
    .eq("id", foglioId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !row) {
    return { success: false, error: error?.message ?? "Foglio non trovato." };
  }
  const foglio = row as FoglioRow;
  if (foglio.documento_stato === "chiuso") {
    return { success: false, error: "Foglio chiuso." };
  }
  if (foglio.lotto_codice) {
    const cur = await getFoglioIngressoMpAction(foglioId);
    if (!cur.success) return cur;
    return { success: true, lottoCodice: foglio.lotto_codice, item: cur.item };
  }

  const arrivato = new Date(foglio.arrivato_at);
  const prefix = prefixLottoDaData(arrivato);
  const { data: esistenti } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .select("lotto_codice")
    .is("deleted_at", null)
    .like("lotto_codice", `${prefix}%`);
  const seq = nextSeqFromLotti(
    ((esistenti ?? []) as Array<{ lotto_codice: string | null }>).map(
      (r) => r.lotto_codice ?? ""
    ),
    prefix
  );
  const lotto = composeLottoIngressoMp(prefix, seq);
  if (!isValidLottoIngressoMp(lotto)) {
    return { success: false, error: "Formato lotto non valido." };
  }

  const { error: upErr } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .update({
      lotto_codice: lotto,
      documento_stato: "registrato",
      versione: Number(foglio.versione ?? 1) + 1,
      confirmed_at: new Date().toISOString(),
      confirmed_by: auth.userId,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", foglioId);
  if (upErr) return { success: false, error: upErr.message };

  await aggiornaMedieConfezioni(supabase, foglioId, Number(foglio.quantita));

  void writeAuditLog({
    entity_type: "produzione_fogli_ingresso_mp",
    entity_id: foglioId,
    action: "lotto_generate",
    actor_id: auth.userId,
    summary: `Generato lotto MP ${lotto}`,
    payload: { lotto_codice: lotto, prefix },
  });

  const cur = await getFoglioIngressoMpAction(foglioId);
  if (!cur.success) return cur;
  return { success: true, lottoCodice: lotto, item: cur.item };
}

async function aggiornaMedieConfezioni(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foglioId: string,
  quantitaTotale: number
) {
  const { data: righe } = await supabase
    .from("produzione_fogli_ingresso_confezioni")
    .select("confezionamento_id, quantita_confezioni, peso_kg")
    .eq("foglio_id", foglioId)
    .is("deleted_at", null);
  const list = (righe ?? []) as Array<{
    confezionamento_id: string;
    quantita_confezioni: number;
    peso_kg: number | null;
  }>;
  if (list.length === 0) return;
  for (const r of list) {
    const n = r.quantita_confezioni;
    const pesoRiga =
      r.peso_kg != null && Number(r.peso_kg) > 0
        ? Number(r.peso_kg)
        : list.length === 1
          ? quantitaTotale
          : null;
    if (pesoRiga == null || n <= 0) continue;
    const pesoPezzo = pesoRiga / n;
    const { data: cat } = await supabase
      .from("produzione_confezionamenti_mp")
      .select("media_peso_kg, conteggio_pesate")
      .eq("id", r.confezionamento_id)
      .maybeSingle();
    const prev = cat as {
      media_peso_kg: number | null;
      conteggio_pesate: number;
    } | null;
    const c = prev?.conteggio_pesate ?? 0;
    const media = prev?.media_peso_kg != null ? Number(prev.media_peso_kg) : 0;
    const nextCount = c + n;
    const nextMedia =
      nextCount <= 0 ? pesoPezzo : (media * c + pesoPezzo * n) / nextCount;
    await supabase
      .from("produzione_confezionamenti_mp")
      .update({
        media_peso_kg: Math.round(nextMedia * 1000) / 1000,
        conteggio_pesate: nextCount,
      })
      .eq("id", r.confezionamento_id);
  }
}

export async function chiudiFoglioIngressoMpAction(
  foglioId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .select("lotto_codice, documento_stato, versione")
    .eq("id", foglioId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return { success: false, error: "Foglio non trovato." };
  if (!(data as { lotto_codice: string | null }).lotto_codice) {
    return { success: false, error: "Genera prima il codice lotto." };
  }
  const { error } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .update({
      documento_stato: "chiuso",
      versione: Number((data as { versione?: number }).versione ?? 1) + 1,
      closed_at: new Date().toISOString(),
      closed_by: auth.userId,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", foglioId);
  if (error) return { success: false, error: error.message };
  void writeAuditLog({
    entity_type: "produzione_fogli_ingresso_mp",
    entity_id: foglioId,
    action: "close",
    actor_id: auth.userId,
    summary: `Chiuso foglio ingresso MP`,
    payload: { lotto_codice: (data as { lotto_codice: string }).lotto_codice },
  });
  return { success: true };
}

export async function uploadIngressoMpFileAction(
  formData: FormData
): Promise<
  | { success: true; path: string; fileName: string; url: string }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const file = formData.get("file");
  const kind = String(formData.get("kind") ?? "ddt");
  const ownerId = String(formData.get("ownerId") ?? "");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Seleziona un file o scatta una foto." };
  }
  if (file.size > 8 * 1024 * 1024) {
    return { success: false, error: "File troppo grande (max 8 MB)." };
  }
  const mime = file.type || "application/octet-stream";
  const ok =
    mime.startsWith("image/") || mime === "application/pdf";
  if (!ok) return { success: false, error: "Consentiti immagini o PDF." };
  const ext = mime === "application/pdf" ? "pdf" : mime.includes("png") ? "png" : "jpg";
  const folder = kind.startsWith("mezzo") ? "mezzi" : "ddt";
  const path = `${folder}/${ownerId || auth.userId}/${Date.now()}-${kind}.${ext}`;
  const supabase = await createClient();
  const buf = new Uint8Array(await file.arrayBuffer());
  const { error } = await supabase.storage.from(BUCKET).upload(path, buf, {
    contentType: mime,
    upsert: false,
  });
  if (error) return { success: false, error: error.message };
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);
  return {
    success: true,
    path,
    fileName: file.name || path,
    url: signed?.signedUrl ?? "",
  };
}

export async function attachDdtFoglioAction(input: {
  foglioId: string;
  path: string;
  fileName: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { error } = await supabase
    .from("produzione_fogli_ingresso_mp")
    .update({
      ddt_file_path: input.path,
      ddt_file_name: input.fileName,
      updated_by: auth.userId,
    })
    .eq("id", input.foglioId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function attachMezzoFotoAction(input: {
  mezzoId: string;
  kind: MezzoFotoKind;
  path: string;
  fileName: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("produzione");
  if (!MEZZO_FOTO_KINDS.includes(input.kind)) {
    return { success: false, error: "Tipo foto non valido." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("produzione_mezzi_foto").insert({
    mezzo_id: input.mezzoId,
    kind: input.kind,
    storage_path: input.path,
    file_name: input.fileName,
    created_by: auth.userId,
    updated_by: auth.userId,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function signedIngressoMpUrlAction(
  path: string
): Promise<
  { success: true; url: string } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) {
    return { success: false, error: error?.message ?? "URL non disponibile." };
  }
  return { success: true, url: data.signedUrl };
}

const provaFoglioSchema = z.object({
  foglio: foglioIngressoSaveSchema,
  generaLotto: z.boolean().optional().default(false),
  chiudi: z.boolean().optional().default(false),
  fornitoreLocale: z
    .object({
      isBio: z.boolean(),
      label: z.string().trim().max(240).optional().default(""),
    })
    .optional(),
});

/**
 * Dry-run della sola pagina Foglio Ingresso MP: stessi controlli del reale,
 * nessuna scrittura su DB, storage o audit.
 */
export async function provaFoglioIngressoMpAction(raw: unknown): Promise<
  | {
      success: true;
      skippedPersist: true;
      lottoCodice: string | null;
      codiceFoglio: string;
      messaggio: string;
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const parsed = provaFoglioSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati foglio non validi.",
    };
  }
  const { foglio: v, generaLotto, chiudi, fornitoreLocale } = parsed.data;
  const supabase = await createClient();

  const { data: forn } = await supabase
    .from("fornitori")
    .select("id, bio_certificato_path, codice_targa, ragione_sociale")
    .eq("id", v.fornitoreId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!forn && !fornitoreLocale) {
    return { success: false, error: "Fornitore non trovato." };
  }
  const fornBio = forn
    ? Boolean(
        (forn as { bio_certificato_path?: string }).bio_certificato_path?.trim()
      )
    : Boolean(fornitoreLocale?.isBio);
  if (v.isBio && !fornBio) {
    return {
      success: false,
      error:
        "Il materiale bio è consentito solo se il fornitore ha il certificato caricato.",
    };
  }

  const { data: mp } = await supabase
    .from("materie_prime")
    .select("id")
    .eq("id", v.materiaPrimaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!mp) return { success: false, error: "Tipo materiale non trovato." };

  let codiceFoglio = `FIMP-${prefixLottoDaData(new Date(v.arrivatoAt))}-ANTEPRIMA`;
  let lottoEsistente: string | null = null;
  let stato: IngressoMpStato = "bozza";
  if (v.id) {
    const { data: existing } = await supabase
      .from("produzione_fogli_ingresso_mp")
      .select("codice, lotto_codice, documento_stato")
      .eq("id", v.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing) return { success: false, error: "Foglio non trovato." };
    const row = existing as {
      codice: string;
      lotto_codice: string | null;
      documento_stato: IngressoMpStato;
    };
    if (row.documento_stato === "chiuso") {
      return { success: false, error: "Il foglio chiuso non è modificabile." };
    }
    codiceFoglio = row.codice;
    lottoEsistente = row.lotto_codice;
    stato = row.documento_stato;
  }

  let lottoCodice = lottoEsistente;
  if (generaLotto && !lottoCodice) {
    const arrivato = new Date(v.arrivatoAt);
    const prefix = prefixLottoDaData(arrivato);
    const { data: esistenti } = await supabase
      .from("produzione_fogli_ingresso_mp")
      .select("lotto_codice")
      .is("deleted_at", null)
      .like("lotto_codice", `${prefix}%`);
    const seq = nextSeqFromLotti(
      ((esistenti ?? []) as Array<{ lotto_codice: string | null }>).map(
        (r) => r.lotto_codice ?? ""
      ),
      prefix
    );
    const lotto = composeLottoIngressoMp(prefix, seq);
    if (!isValidLottoIngressoMp(lotto)) {
      return { success: false, error: "Formato lotto non valido." };
    }
    lottoCodice = lotto;
  }

  if (chiudi && !lottoCodice) {
    return { success: false, error: "Genera prima il codice lotto." };
  }

  const messaggio = chiudi
    ? `Controlli ok. Il foglio ${codiceFoglio} sarebbe stato chiuso.`
    : generaLotto
      ? `Controlli ok. Sarebbe stato assegnato il lotto ${lottoCodice} (stato Registrato).`
      : stato === "registrato"
        ? `Controlli ok. Il foglio ${codiceFoglio} sarebbe stato aggiornato.`
        : `Controlli ok. Sarebbe stata salvata la bozza ${codiceFoglio}.`;

  return {
    success: true,
    skippedPersist: true,
    lottoCodice,
    codiceFoglio,
    messaggio,
  };
}

export async function anteprimaFornitoreRapidoIngressoAction(
  raw: unknown
): Promise<
  | {
      success: true;
      id: string;
      label: string;
      targa: string;
      isBio: false;
      tipologie: FornitoreTipologia[];
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const parsed = nuovoFornitoreRapidoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati fornitore non validi.",
    };
  }
  const supabase = await createClient();
  const piva = parsed.data.partitaIva.trim();
  const { data: dup } = await supabase
    .from("fornitori")
    .select("id")
    .is("deleted_at", null)
    .ilike("partita_iva", piva)
    .maybeSingle();
  if (dup) {
    return { success: false, error: "Partita IVA già presente in anagrafica." };
  }
  const { data: usedRows } = await supabase.from("fornitori").select("codice_targa");
  const used = ((usedRows ?? []) as Array<{ codice_targa: string }>).map(
    (r) => r.codice_targa
  );
  let targa: string;
  try {
    targa = nextSequentialCodiceTarga("F", used);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Targa fornitore non disponibile.",
    };
  }
  return {
    success: true,
    id: crypto.randomUUID(),
    targa,
    label: `${targa} — ${parsed.data.ragioneSociale.trim()}`,
    isBio: false,
    tipologie: parsed.data.tipologie ?? ["materia_prima"],
  };
}

export async function anteprimaMezzoIngressoAction(raw: unknown): Promise<
  { success: true; item: MezzoIngresso } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const parsed = nuovoMezzoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati mezzo non validi.",
    };
  }
  const targa = parsed.data.targa.trim().toUpperCase();
  const supabase = await createClient();
  const { data: dup } = await supabase
    .from("produzione_mezzi")
    .select("id")
    .is("deleted_at", null)
    .ilike("targa", targa)
    .maybeSingle();
  if (dup) return { success: false, error: "Targa mezzo già registrata." };
  return {
    success: true,
    item: {
      id: crypto.randomUUID(),
      targa,
      fornitoreId: parsed.data.fornitoreId ?? null,
      aziendaNome: parsed.data.aziendaNome?.trim() ?? "",
      foto: [],
    },
  };
}

export async function anteprimaAutistaIngressoAction(raw: unknown): Promise<
  | { success: true; id: string; label: string }
  | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const parsed = nuovoAutistaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati autista non validi.",
    };
  }
  return {
    success: true,
    id: crypto.randomUUID(),
    label: `${parsed.data.nome} ${parsed.data.cognome}`.trim(),
  };
}
