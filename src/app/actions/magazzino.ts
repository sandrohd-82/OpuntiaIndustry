"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  computeSemaforo,
  categoriaRequiresMagazzino,
  formatQuantitaCarico,
  isMagazzinoCaricoUnita,
  movimentoManualeSchema,
  quantitaDaOrdinare,
  quantitaStockDaCarico,
  unitaSchedaProdotto,
  unitaStockDaCarico,
  updateMagazzinoProdottoSchema,
  type CategoriaUtilizzo,
  type FoglioApertoOption,
  type MagazzinoCaricoUnita,
  type MagazzinoCatalogKind,
  type MagazzinoProdottoRiga,
  type MagazzinoUnita,
  type MotivoSenzaFoglio,
  type MovimentoAgrinsiciliaRiga,
  type NotaAcquisto,
  type NotaAcquistoRiga,
  type NotaAcquistoStato,
  type UpdateMagazzinoProdottoInput,
} from "@/lib/magazzino/types";
import { createClient } from "@/lib/supabase/server";

type GiacenzaRow = {
  id: string;
  catalog_kind: string;
  prodotto_id: string;
  prodotto_codice: string;
  quantita_kg: number | string;
  quantita_riserva: number | string | null;
  unita: string | null;
  reparto_id: string | null;
};

type ArticoloRow = {
  id: string;
  codice: string;
  nome: string;
  titolo_magazzino: string | null;
  is_bio: boolean | null;
  categoria_utilizzo: string | null;
  barcode: string | null;
  foto_path: string | null;
  scheda_provvisoria: boolean | null;
  fattura_ricevuta_id?: string | null;
};

function parseCategoriaUtilizzo(
  raw: string | null | undefined
): CategoriaUtilizzo | null {
  if (
    raw === "mat_consumo" ||
    raw === "mat_poco_consumo" ||
    raw === "acquisti_occasionali"
  ) {
    return raw;
  }
  return null;
}

type RepartoMini = { id: string; nome: string; codice: string };

function catalogTable(
  kind: MagazzinoCatalogKind
): "materie_prime" | "catalogo_prodotti_fornitore" {
  return kind === "materia_prima"
    ? "materie_prime"
    : "catalogo_prodotti_fornitore";
}

async function nextNotaNumero(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `NA-${year}-`;
  const { data } = await supabase
    .from("magazzino_note_acquisto")
    .select("numero")
    .ilike("numero", `${prefix}%`)
    .is("deleted_at", null)
    .order("numero", { ascending: false })
    .limit(1);
  const last = (data?.[0] as { numero?: string } | undefined)?.numero ?? "";
  const n = Number(last.replace(prefix, "")) || 0;
  return `${prefix}${String(n + 1).padStart(4, "0")}`;
}

async function getOrCreateOpenNota(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{ id: string; numero: string } | { error: string }> {
  const { data: existing } = await supabase
    .from("magazzino_note_acquisto")
    .select("id, numero")
    .eq("documento_stato", "aperta")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    return {
      id: String((existing as { id: string }).id),
      numero: String((existing as { numero: string }).numero),
    };
  }
  const numero = await nextNotaNumero(supabase);
  const { data, error } = await supabase
    .from("magazzino_note_acquisto")
    .insert({
      numero,
      versione: 1,
      documento_stato: "aperta",
      titolo: "Nota di acquisto automatica",
      note: "Generata dalle soglie di riserva magazzino",
      created_by: userId,
      updated_by: userId,
    })
    .select("id, numero")
    .single();
  if (error || !data) {
    return { error: error?.message ?? "Impossibile creare nota di acquisto." };
  }
  void writeAuditLog({
    entity_type: "magazzino_note_acquisto",
    entity_id: data.id,
    action: "create",
    actor_id: userId,
    summary: `Creata nota di acquisto ${numero}`,
    payload: { numero, source: "soglia_riserva" },
  });
  return { id: data.id, numero: data.numero };
}

async function syncNotaForProdotto(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  catalogKind: MagazzinoCatalogKind;
  prodottoId: string;
  prodottoCodice: string;
  prodottoNome: string;
  quantita: number;
  quantitaRiserva: number | null;
  unita: MagazzinoUnita;
}): Promise<void> {
  const {
    supabase,
    userId,
    catalogKind,
    prodottoId,
    prodottoCodice,
    prodottoNome,
    quantita,
    quantitaRiserva,
    unita,
  } = input;

  const sottoOSoglia =
    quantitaRiserva != null &&
    Number.isFinite(quantitaRiserva) &&
    quantita <= quantitaRiserva;

  if (!sottoOSoglia) {
    const { data: openNotes } = await supabase
      .from("magazzino_note_acquisto")
      .select("id")
      .eq("documento_stato", "aperta")
      .is("deleted_at", null);
    const noteIds = ((openNotes ?? []) as Array<{ id: string }>).map(
      (n) => n.id
    );
    if (noteIds.length === 0) return;
    await supabase
      .from("magazzino_note_acquisto_righe")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
        updated_by: userId,
      })
      .in("nota_id", noteIds)
      .eq("catalog_kind", catalogKind)
      .eq("prodotto_id", prodottoId)
      .is("deleted_at", null);
    return;
  }

  const nota = await getOrCreateOpenNota(supabase, userId);
  if ("error" in nota) {
    console.error("[magazzino] nota", nota.error);
    return;
  }

  const qty = quantitaDaOrdinare(quantita, quantitaRiserva!);

  const { data: existingRiga } = await supabase
    .from("magazzino_note_acquisto_righe")
    .select("id")
    .eq("nota_id", nota.id)
    .eq("catalog_kind", catalogKind)
    .eq("prodotto_id", prodottoId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingRiga) {
    await supabase
      .from("magazzino_note_acquisto_righe")
      .update({
        quantita_richiesta: qty,
        unita,
        prodotto_codice: prodottoCodice,
        prodotto_nome: prodottoNome,
        updated_by: userId,
      })
      .eq("id", (existingRiga as { id: string }).id);
  } else {
    await supabase.from("magazzino_note_acquisto_righe").insert({
      nota_id: nota.id,
      catalog_kind: catalogKind,
      prodotto_id: prodottoId,
      prodotto_codice: prodottoCodice,
      prodotto_nome: prodottoNome,
      quantita_richiesta: qty,
      unita,
      motivo: "soglia_riserva",
      created_by: userId,
      updated_by: userId,
    });
    void writeAuditLog({
      entity_type: "magazzino_note_acquisto",
      entity_id: nota.id,
      action: "update",
      actor_id: userId,
      summary: `Aggiunto ${prodottoCodice} a nota ${nota.numero}`,
      payload: {
        catalogKind,
        prodottoId,
        quantita: qty,
        unita,
        semaforo: computeSemaforo(quantita, quantitaRiserva),
      },
    });
  }
}

export async function listMagazzinoProdottiAction(
  catalogKind: MagazzinoCatalogKind = "prodotto_fornitore"
): Promise<
  | { success: true; items: MagazzinoProdottoRiga[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("magazzino");
  if (
    catalogKind !== "materia_prima" &&
    catalogKind !== "prodotto_fornitore"
  ) {
    return { success: false, error: "Catalogo magazzino non valido." };
  }
  const supabase = await createClient();
  const table = catalogTable(catalogKind);

  const [{ data: articoli, error: pErr }, { data: giacenze, error: gErr }] =
    await Promise.all([
      supabase
        .from(table)
        .select(
          "id, codice, nome, titolo_magazzino, is_bio, categoria_utilizzo, barcode, foto_path, scheda_provvisoria"
        )
        .is("deleted_at", null)
        .order("codice", { ascending: true }),
      supabase
        .from("magazzino_giacenze")
        .select(
          "id, catalog_kind, prodotto_id, prodotto_codice, quantita_kg, quantita_riserva, unita, reparto_id"
        )
        .eq("catalog_kind", catalogKind)
        .is("deleted_at", null),
    ]);
  if (pErr) return { success: false, error: pErr.message };
  if (gErr) return { success: false, error: gErr.message };

  const giacByProd = new Map(
    ((giacenze ?? []) as GiacenzaRow[]).map((g) => [g.prodotto_id, g])
  );
  const repartoIds = [
    ...new Set(
      ((giacenze ?? []) as GiacenzaRow[])
        .map((g) => g.reparto_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const repartoMap = new Map<string, string>();
  if (repartoIds.length > 0) {
    const { data: reparti } = await supabase
      .from("produzione_reparti")
      .select("id, nome, codice")
      .in("id", repartoIds)
      .is("deleted_at", null);
    for (const r of (reparti ?? []) as RepartoMini[]) {
      repartoMap.set(r.id, `${r.codice} — ${r.nome}`);
    }
  }

  const items: MagazzinoProdottoRiga[] = [];
  for (const p of (articoli ?? []) as ArticoloRow[]) {
    const categoriaUtilizzo = parseCategoriaUtilizzo(p.categoria_utilizzo);
    if (
      categoriaUtilizzo === "acquisti_occasionali" ||
      (categoriaUtilizzo && !categoriaRequiresMagazzino(categoriaUtilizzo))
    ) {
      continue;
    }
    const g = giacByProd.get(p.id);
    const quantita = g ? Number(g.quantita_kg) || 0 : 0;
    const quantitaRiserva =
      g?.quantita_riserva != null && g.quantita_riserva !== ""
        ? Number(g.quantita_riserva)
        : null;
    const unita = (g?.unita === "pz" ? "pz" : "kg") as MagazzinoUnita;
    items.push({
      catalogKind,
      prodottoId: p.id,
      codice: p.codice,
      nome: p.nome,
      titoloMagazzino: p.titolo_magazzino
        ? String(p.titolo_magazzino).trim() || null
        : null,
      isBio: Boolean(p.is_bio),
      categoriaUtilizzo,
      barcode: p.barcode ? String(p.barcode) : null,
      fotoPath: p.foto_path ? String(p.foto_path).trim() || null : null,
      schedaProvvisoria: Boolean(p.scheda_provvisoria),
      giacenzaId: g?.id ?? null,
      quantita,
      quantitaRiserva:
        quantitaRiserva != null && Number.isFinite(quantitaRiserva)
          ? quantitaRiserva
          : null,
      unita,
      repartoId: g?.reparto_id ?? null,
      repartoNome: g?.reparto_id
        ? (repartoMap.get(g.reparto_id) ?? null)
        : null,
      semaforo: computeSemaforo(quantita, quantitaRiserva),
    });
  }

  return { success: true, items };
}

export async function updateMagazzinoProdottoAction(
  raw: UpdateMagazzinoProdottoInput
): Promise<
  | { success: true; item: MagazzinoProdottoRiga }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("magazzino");
  const parsed = updateMagazzinoProdottoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const input = parsed.data;
  const supabase = await createClient();
  const table = catalogTable(input.catalogKind);

  if (
    categoriaRequiresMagazzino(input.categoriaUtilizzo) &&
    (input.quantitaRiserva == null || !Number.isFinite(input.quantitaRiserva))
  ) {
    return {
      success: false,
      error:
        "Imposta la quantità di riserva per Mat. Consumo / Mat. Poco Consumo.",
    };
  }

  const { data: articolo, error: pErr } = await supabase
    .from(table)
    .select(
      "id, codice, nome, titolo_magazzino, is_bio, categoria_utilizzo, barcode, foto_path, scheda_provvisoria"
    )
    .eq("id", input.prodottoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (pErr) return { success: false, error: pErr.message };
  if (!articolo) return { success: false, error: "Articolo non trovato." };
  const p = articolo as ArticoloRow;

  const titoloNuovo = input.titoloMagazzino.trim();
  const titoloAttuale = (p.titolo_magazzino ?? "").trim();
  if (titoloAttuale && titoloAttuale !== titoloNuovo) {
    const conferma = (input.confermaTitoloAttuale ?? "").trim();
    if (conferma !== titoloAttuale) {
      return {
        success: false,
        error:
          "Per modificare il titolo ricopia esattamente il titolo attuale nella conferma.",
      };
    }
  }

  const { error: catErr } = await supabase
    .from(table)
    .update({
      categoria_utilizzo: input.categoriaUtilizzo,
      titolo_magazzino: titoloNuovo,
      updated_by: auth.userId,
    })
    .eq("id", p.id)
    .is("deleted_at", null);
  if (catErr) return { success: false, error: catErr.message };

  if (titoloAttuale !== titoloNuovo) {
    void writeAuditLog({
      entity_type: table,
      entity_id: p.id,
      action: "update",
      actor_id: auth.userId,
      summary: titoloAttuale
        ? `Titolo magazzino ${p.codice}: «${titoloAttuale}» → «${titoloNuovo}»`
        : `Impostato titolo magazzino ${p.codice}: «${titoloNuovo}»`,
      payload: {
        titoloPrecedente: titoloAttuale || null,
        titoloMagazzino: titoloNuovo,
      },
    });
  }

  // Acquisti occasionali: nessuna giacenza; soft-delete se esisteva
  if (!categoriaRequiresMagazzino(input.categoriaUtilizzo)) {
    const { data: existingOcc } = await supabase
      .from("magazzino_giacenze")
      .select("id")
      .eq("catalog_kind", input.catalogKind)
      .eq("prodotto_id", input.prodottoId)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingOcc) {
      await supabase
        .from("magazzino_giacenze")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: auth.userId,
          updated_by: auth.userId,
        })
        .eq("id", (existingOcc as { id: string }).id);
      await syncNotaForProdotto({
        supabase,
        userId: auth.userId,
        catalogKind: input.catalogKind,
        prodottoId: p.id,
        prodottoCodice: p.codice,
        prodottoNome: titoloNuovo || p.nome,
        quantita: 0,
        quantitaRiserva: null,
        unita: input.unita,
      });
    }
    void writeAuditLog({
      entity_type: table,
      entity_id: p.id,
      action: "update",
      actor_id: auth.userId,
      summary: `Classificato ${p.codice} come Acquisti Occasionali (fuori magazzino)`,
      payload: { categoriaUtilizzo: input.categoriaUtilizzo },
    });
    return {
      success: true,
      item: {
        catalogKind: input.catalogKind,
        prodottoId: p.id,
        codice: p.codice,
        nome: p.nome,
        titoloMagazzino: titoloNuovo,
        isBio: Boolean(p.is_bio),
        categoriaUtilizzo: input.categoriaUtilizzo,
        barcode: p.barcode ? String(p.barcode) : null,
        fotoPath: p.foto_path ? String(p.foto_path).trim() || null : null,
        schedaProvvisoria: Boolean(p.scheda_provvisoria),
        giacenzaId: null,
        quantita: 0,
        quantitaRiserva: null,
        unita: input.unita,
        repartoId: null,
        repartoNome: null,
        semaforo: "n/d",
      },
    };
  }

  const { data: existing } = await supabase
    .from("magazzino_giacenze")
    .select("id")
    .eq("catalog_kind", input.catalogKind)
    .eq("prodotto_id", input.prodottoId)
    .is("deleted_at", null)
    .maybeSingle();

  const payload = {
    catalog_kind: input.catalogKind,
    prodotto_id: input.prodottoId,
    prodotto_codice: p.codice,
    quantita_kg: input.quantita,
    quantita_riserva: input.quantitaRiserva,
    unita: input.unita,
    reparto_id: input.repartoId,
    updated_by: auth.userId,
    is_test: false,
  };

  let giacenzaId: string;
  if (existing) {
    const { data, error } = await supabase
      .from("magazzino_giacenze")
      .update(payload)
      .eq("id", (existing as { id: string }).id)
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    giacenzaId = data.id;
  } else {
    const { data, error } = await supabase
      .from("magazzino_giacenze")
      .insert({
        ...payload,
        created_by: auth.userId,
      })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    giacenzaId = data.id;
  }

  await syncNotaForProdotto({
    supabase,
    userId: auth.userId,
    catalogKind: input.catalogKind,
    prodottoId: p.id,
    prodottoCodice: p.codice,
    prodottoNome: titoloNuovo || p.nome,
    quantita: input.quantita,
    quantitaRiserva: input.quantitaRiserva,
    unita: input.unita,
  });

  void writeAuditLog({
    entity_type: "magazzino_giacenze",
    entity_id: giacenzaId,
    action: existing ? "update" : "create",
    actor_id: auth.userId,
    summary: `Parametri magazzino ${input.catalogKind} ${p.codice}`,
    payload: {
      catalogKind: input.catalogKind,
      categoriaUtilizzo: input.categoriaUtilizzo,
      titoloMagazzino: titoloNuovo,
      quantita: input.quantita,
      quantitaRiserva: input.quantitaRiserva,
      unita: input.unita,
      repartoId: input.repartoId,
      semaforo: computeSemaforo(input.quantita, input.quantitaRiserva),
    },
  });

  let repartoNome: string | null = null;
  if (input.repartoId) {
    const { data: rep } = await supabase
      .from("produzione_reparti")
      .select("codice, nome")
      .eq("id", input.repartoId)
      .maybeSingle();
    if (rep) {
      repartoNome = `${(rep as RepartoMini).codice} — ${(rep as RepartoMini).nome}`;
    }
  }

  return {
    success: true,
    item: {
      catalogKind: input.catalogKind,
      prodottoId: p.id,
      codice: p.codice,
      nome: p.nome,
      titoloMagazzino: titoloNuovo,
      isBio: Boolean(p.is_bio),
      categoriaUtilizzo: input.categoriaUtilizzo,
      barcode: p.barcode ? String(p.barcode) : null,
      fotoPath: p.foto_path ? String(p.foto_path).trim() || null : null,
      schedaProvvisoria: Boolean(p.scheda_provvisoria),
      giacenzaId,
      quantita: input.quantita,
      quantitaRiserva: input.quantitaRiserva,
      unita: input.unita,
      repartoId: input.repartoId,
      repartoNome,
      semaforo: computeSemaforo(input.quantita, input.quantitaRiserva),
    },
  };
}

function mapNotaRiga(row: {
  id: string;
  catalog_kind?: string | null;
  prodotto_id: string;
  prodotto_codice: string;
  prodotto_nome: string;
  quantita_richiesta: number | string;
  unita: string;
  motivo: string;
}): NotaAcquistoRiga {
  const kind: MagazzinoCatalogKind =
    row.catalog_kind === "prodotto_fornitore"
      ? "prodotto_fornitore"
      : "materia_prima";
  return {
    id: row.id,
    catalogKind: kind,
    prodottoId: row.prodotto_id,
    prodottoCodice: row.prodotto_codice,
    prodottoNome: row.prodotto_nome,
    quantitaRichiesta: Number(row.quantita_richiesta) || 0,
    unita: row.unita === "pz" ? "pz" : "kg",
    motivo: row.motivo,
  };
}

export async function listNoteAcquistoAction(): Promise<
  { success: true; items: NotaAcquisto[] } | { success: false; error: string }
> {
  await requireAreaAccess("magazzino");
  const supabase = await createClient();
  const { data: notes, error } = await supabase
    .from("magazzino_note_acquisto")
    .select(
      "id, numero, versione, documento_stato, titolo, note, created_at, updated_at, closed_at"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message };

  const ids = ((notes ?? []) as Array<{ id: string }>).map((n) => n.id);
  const righeBy = new Map<string, NotaAcquistoRiga[]>();
  if (ids.length > 0) {
    const { data: righe } = await supabase
      .from("magazzino_note_acquisto_righe")
      .select(
        "id, nota_id, catalog_kind, prodotto_id, prodotto_codice, prodotto_nome, quantita_richiesta, unita, motivo"
      )
      .in("nota_id", ids)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true });
    for (const r of (righe ?? []) as Array<{
      id: string;
      nota_id: string;
      catalog_kind?: string | null;
      prodotto_id: string;
      prodotto_codice: string;
      prodotto_nome: string;
      quantita_richiesta: number | string;
      unita: string;
      motivo: string;
    }>) {
      const list = righeBy.get(r.nota_id) ?? [];
      list.push(mapNotaRiga(r));
      righeBy.set(r.nota_id, list);
    }
  }

  const items: NotaAcquisto[] = (
    (notes ?? []) as Array<{
      id: string;
      numero: string;
      versione: number;
      documento_stato: NotaAcquistoStato;
      titolo: string;
      note: string;
      created_at: string;
      updated_at: string;
      closed_at: string | null;
    }>
  ).map((n) => ({
    id: n.id,
    numero: n.numero,
    versione: n.versione,
    documentoStato: n.documento_stato,
    titolo: n.titolo,
    note: n.note,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
    closedAt: n.closed_at,
    righe: righeBy.get(n.id) ?? [],
  }));

  return { success: true, items };
}

export async function chiudiNotaAcquistoAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("magazzino");
  const supabase = await createClient();
  const { error } = await supabase
    .from("magazzino_note_acquisto")
    .update({
      documento_stato: "chiusa",
      closed_at: new Date().toISOString(),
      closed_by: auth.userId,
      updated_by: auth.userId,
      versione: 1,
    })
    .eq("id", id)
    .eq("documento_stato", "aperta")
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  void writeAuditLog({
    entity_type: "magazzino_note_acquisto",
    entity_id: id,
    action: "update",
    actor_id: auth.userId,
    summary: "Chiusura nota di acquisto",
    payload: { documento_stato: "chiusa" },
  });
  return { success: true };
}

const CATALOG_PROPRIO = "prodotto_proprio";

export async function listProdottiPropriMagazzinoAction(): Promise<
  | {
      success: true;
      prodotti: Array<{
        id: string;
        codice: string;
        nome: string;
        giacenzaKg: number;
        unitaScheda: MagazzinoCaricoUnita;
      }>;
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("magazzino");
  const supabase = await createClient();
  const [{ data: prodotti, error: pErr }, { data: giacenze, error: gErr }] =
    await Promise.all([
      supabase
        .from("prodotti_propri")
        .select("id, codice, nome, unita_misura")
        .is("deleted_at", null)
        .order("codice", { ascending: true }),
      supabase
        .from("magazzino_giacenze")
        .select("prodotto_id, quantita_kg")
        .eq("catalog_kind", CATALOG_PROPRIO)
        .is("deleted_at", null),
    ]);
  if (pErr) return { success: false, error: pErr.message };
  if (gErr) return { success: false, error: gErr.message };
  const qty = new Map(
    ((giacenze ?? []) as Array<{ prodotto_id: string; quantita_kg: number }>).map(
      (g) => [g.prodotto_id, Number(g.quantita_kg) || 0]
    )
  );
  return {
    success: true,
    prodotti: ((prodotti ?? []) as Array<{
      id: string;
      codice: string;
      nome: string;
      unita_misura?: string | null;
    }>).map((p) => ({
      id: p.id,
      codice: p.codice,
      nome: p.nome,
      giacenzaKg: qty.get(p.id) ?? 0,
      unitaScheda: unitaSchedaProdotto({
        schedaUm: p.unita_misura,
        prodottoCodice: p.codice,
      }),
    })),
  };
}

export async function listFogliApertiMagazzinoAction(): Promise<
  | { success: true; items: FoglioApertoOption[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("magazzino");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_fogli_lavorazione")
    .select("id, codice, prodotto, lotto_label, stato")
    .eq("stato", "aperto")
    .is("deleted_at", null)
    .order("started_at", { ascending: false })
    .limit(120);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as Array<{
      id: string;
      codice: string;
      prodotto: string | null;
      lotto_label: string | null;
      stato: "aperto" | "chiuso";
    }>).map((r) => ({
      id: r.id,
      codice: r.codice,
      prodotto: r.prodotto ?? "",
      lottoLabel: r.lotto_label ?? "",
      stato: r.stato,
    })),
  };
}

export async function listMovimentiAgrinsiciliaAction(): Promise<
  | { success: true; items: MovimentoAgrinsiciliaRiga[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("magazzino");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("magazzino_movimenti")
    .select(
      "id, created_at, prodotto_codice, quantita_kg, unita, lotto_codice, foglio_id, motivo_senza_foglio, note, foglio:produzione_fogli_lavorazione(codice)"
    )
    .eq("catalog_kind", CATALOG_PROPRIO)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as Array<{
      id: string;
      created_at: string;
      prodotto_codice: string;
      quantita_kg: number;
      unita?: string | null;
      lotto_codice: string | null;
      motivo_senza_foglio: string | null;
      note: string | null;
      foglio: { codice: string } | { codice: string }[] | null;
    }>).map((r) => {
      const foglio = Array.isArray(r.foglio) ? r.foglio[0] : r.foglio;
      const motivo =
        r.motivo_senza_foglio === "inventario" ||
        r.motivo_senza_foglio === "rivisita_ordine"
          ? (r.motivo_senza_foglio as MotivoSenzaFoglio)
          : null;
      return {
        id: r.id,
        createdAt: r.created_at,
        prodottoCodice: r.prodotto_codice,
        quantitaKg: Number(r.quantita_kg) || 0,
        unita: isMagazzinoCaricoUnita(r.unita) ? r.unita : "kg",
        lottoCodice: r.lotto_codice ?? "",
        foglioCodice: foglio?.codice ?? null,
        motivoSenzaFoglio: motivo,
        note: r.note ?? "",
      };
    }),
  };
}

export async function movimentoManualeAgrinsiciliaAction(
  raw: unknown
): Promise<
  | { success: true; giacenzaKg: number; movimentoId: string }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("magazzino");
  const parsed = movimentoManualeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const input = parsed.data;
  const supabase = await createClient();
  const { data: prodotto, error: pErr } = await supabase
    .from("prodotti_propri")
    .select("id, codice, nome, unita_misura")
    .eq("id", input.prodottoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (pErr || !prodotto) {
    return { success: false, error: pErr?.message ?? "Prodotto non trovato." };
  }

  if (input.collegaFoglio && input.foglioId) {
    const { data: foglio, error: fErr } = await supabase
      .from("produzione_fogli_lavorazione")
      .select("id, codice, stato")
      .eq("id", input.foglioId)
      .is("deleted_at", null)
      .maybeSingle();
    if (fErr || !foglio) {
      return { success: false, error: fErr?.message ?? "Foglio non trovato." };
    }
    if (foglio.stato !== "aperto") {
      return { success: false, error: "Il foglio selezionato non è aperto." };
    }
  }

  const qtyStock = quantitaStockDaCarico(input.quantita, input.unitaMisura);
  const unitaScheda = unitaSchedaProdotto({
    schedaUm: (prodotto as { unita_misura?: string | null }).unita_misura,
    prodottoCodice: prodotto.codice,
  });
  const unitaStock = unitaStockDaCarico(unitaScheda);
  const { data: giac } = await supabase
    .from("magazzino_giacenze")
    .select("id, quantita_kg")
    .eq("catalog_kind", CATALOG_PROPRIO)
    .eq("prodotto_id", input.prodottoId)
    .is("deleted_at", null)
    .maybeSingle();
  const prima = giac ? Number(giac.quantita_kg) || 0 : 0;
  const dopo = Math.round((prima + qtyStock) * 1000) / 1000;

  const giacPayload = {
    catalog_kind: CATALOG_PROPRIO,
    prodotto_id: input.prodottoId,
    prodotto_codice: prodotto.codice,
    quantita_kg: dopo,
    unita: unitaStock,
    updated_by: auth.userId,
    is_test: false,
  };
  if (giac?.id) {
    const { error } = await supabase
      .from("magazzino_giacenze")
      .update(giacPayload)
      .eq("id", giac.id);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("magazzino_giacenze")
      .insert({ ...giacPayload, created_by: auth.userId });
    if (error) return { success: false, error: error.message };
  }

  const { data: mov, error: movErr } = await supabase
    .from("magazzino_movimenti")
    .insert({
      catalog_kind: CATALOG_PROPRIO,
      prodotto_id: input.prodottoId,
      prodotto_codice: prodotto.codice,
      tipo: "carico",
      quantita_kg: qtyStock,
      unita: input.unitaMisura,
      lotto_codice: input.lottoCodice.trim(),
      foglio_id: input.collegaFoglio ? input.foglioId : null,
      motivo_senza_foglio: input.collegaFoglio
        ? null
        : input.motivoSenzaFoglio,
      riferimento: "carico-manuale",
      note: input.note.trim(),
      is_test: false,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (movErr || !mov) {
    return { success: false, error: movErr?.message ?? "Movimento fallito." };
  }

  void writeAuditLog({
    entity_type: "magazzino_movimenti",
    entity_id: mov.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Carico manuale ${formatQuantitaCarico(qtyStock, input.unitaMisura)} · ${prodotto.codice} · lotto ${input.lottoCodice}`,
    payload: {
      prodotto_id: input.prodottoId,
      quantita: input.quantita,
      unita: input.unitaMisura,
      quantita_stock: qtyStock,
      unita_stock: unitaStock,
      lotto_codice: input.lottoCodice,
      foglio_id: input.collegaFoglio ? input.foglioId : null,
      motivo_senza_foglio: input.collegaFoglio
        ? null
        : input.motivoSenzaFoglio,
      giacenza_prima: prima,
      giacenza_dopo: dopo,
    },
  });

  return { success: true, giacenzaKg: dopo, movimentoId: mov.id };
}
