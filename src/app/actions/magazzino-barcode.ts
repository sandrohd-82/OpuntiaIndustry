"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  associateBarcodeSchema,
  createFromBarcodeSchema,
  movimentoScanSchema,
  setArticoloBarcodeSchema,
  suggestProvisionalCode,
  type BarcodeLookupHit,
} from "@/lib/magazzino/barcode";
import type {
  MagazzinoCatalogKind,
  MagazzinoUnita,
} from "@/lib/magazzino/types";
import { createClient } from "@/lib/supabase/server";

function catalogTable(
  kind: MagazzinoCatalogKind
): "materie_prime" | "catalogo_prodotti_fornitore" {
  return kind === "materia_prima"
    ? "materie_prime"
    : "catalogo_prodotti_fornitore";
}

async function findByBarcode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  barcode: string
): Promise<{
  kind: MagazzinoCatalogKind;
  row: {
    id: string;
    codice: string;
    nome: string;
    barcode: string | null;
    scheda_provvisoria: boolean | null;
    categoria_utilizzo: string | null;
  };
} | null> {
  const normalized = barcode.trim();
  const kinds: MagazzinoCatalogKind[] = [
    "materia_prima",
    "prodotto_fornitore",
  ];
  for (const kind of kinds) {
    const { data } = await supabase
      .from(catalogTable(kind))
      .select(
        "id, codice, nome, barcode, scheda_provvisoria, categoria_utilizzo"
      )
      .is("deleted_at", null)
      .ilike("barcode", normalized)
      .maybeSingle();
    if (data) {
      return {
        kind,
        row: data as {
          id: string;
          codice: string;
          nome: string;
          barcode: string | null;
          scheda_provvisoria: boolean | null;
          categoria_utilizzo: string | null;
        },
      };
    }
  }
  return null;
}

async function loadGiacenza(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kind: MagazzinoCatalogKind,
  prodottoId: string
): Promise<{ quantita: number; unita: MagazzinoUnita; id: string | null }> {
  const { data } = await supabase
    .from("magazzino_giacenze")
    .select("id, quantita_kg, unita")
    .eq("catalog_kind", kind)
    .eq("prodotto_id", prodottoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return { quantita: 0, unita: "pz", id: null };
  return {
    quantita: Number((data as { quantita_kg: number }).quantita_kg) || 0,
    unita:
      (data as { unita: string }).unita === "kg" ? "kg" : "pz",
    id: String((data as { id: string }).id),
  };
}

export async function lookupBarcodeAction(barcodeRaw: string): Promise<
  | { success: true; found: true; item: BarcodeLookupHit }
  | { success: true; found: false; barcode: string }
  | { success: false; error: string }
> {
  await requireAreaAccess("magazzino");
  const barcode = String(barcodeRaw ?? "").trim();
  if (!barcode) return { success: false, error: "Barcode vuoto." };
  const supabase = await createClient();
  const hit = await findByBarcode(supabase, barcode);
  if (!hit) {
    return { success: true, found: false, barcode };
  }
  const g = await loadGiacenza(supabase, hit.kind, hit.row.id);
  return {
    success: true,
    found: true,
    item: {
      catalogKind: hit.kind,
      prodottoId: hit.row.id,
      codice: hit.row.codice,
      nome: hit.row.nome,
      barcode: hit.row.barcode ?? barcode,
      schedaProvvisoria: Boolean(hit.row.scheda_provvisoria),
      categoriaUtilizzo: hit.row.categoria_utilizzo,
      giacenza: g.quantita,
      unita: g.unita,
    },
  };
}

export type BarcodeRegistratoRiga = {
  id: string;
  codice: string;
  nome: string;
  barcode: string;
  schedaProvvisoria: boolean;
  categoriaUtilizzo: string | null;
  updatedAt: string | null;
};

/** Elenco barcode già registrati su schede Mp o Pr (non soft-deleted). */
export async function listBarcodeRegistratiAction(
  catalogKind: MagazzinoCatalogKind
): Promise<
  | { success: true; items: BarcodeRegistratoRiga[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("magazzino");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(catalogTable(catalogKind))
    .select(
      "id, codice, nome, barcode, scheda_provvisoria, categoria_utilizzo, updated_at"
    )
    .is("deleted_at", null)
    .not("barcode", "is", null)
    .neq("barcode", "")
    .order("codice", { ascending: true });
  if (error) return { success: false, error: error.message };

  const items = (
    (data ?? []) as Array<{
      id: string;
      codice: string;
      nome: string;
      barcode: string | null;
      scheda_provvisoria: boolean | null;
      categoria_utilizzo: string | null;
      updated_at: string | null;
    }>
  )
    .map((r) => {
      const barcode = String(r.barcode ?? "").trim();
      if (!barcode) return null;
      return {
        id: r.id,
        codice: r.codice,
        nome: r.nome,
        barcode,
        schedaProvvisoria: Boolean(r.scheda_provvisoria),
        categoriaUtilizzo: r.categoria_utilizzo,
        updatedAt: r.updated_at,
      } satisfies BarcodeRegistratoRiga;
    })
    .filter((r): r is BarcodeRegistratoRiga => r !== null);

  return { success: true, items };
}

export async function listArticoliPerAssociaBarcodeAction(
  catalogKind: MagazzinoCatalogKind,
  q?: string
): Promise<
  | {
      success: true;
      items: Array<{
        id: string;
        codice: string;
        nome: string;
        barcode: string | null;
        schedaProvvisoria: boolean;
      }>;
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("magazzino");
  const supabase = await createClient();
  let query = supabase
    .from(catalogTable(catalogKind))
    .select("id, codice, nome, barcode, scheda_provvisoria")
    .is("deleted_at", null)
    .order("codice", { ascending: true })
    .limit(80);
  const term = String(q ?? "").trim();
  if (term) {
    query = query.or(
      `codice.ilike.%${term}%,nome.ilike.%${term}%,barcode.ilike.%${term}%`
    );
  }
  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as Array<{
      id: string;
      codice: string;
      nome: string;
      barcode: string | null;
      scheda_provvisoria: boolean | null;
    }>).map((r) => ({
      id: r.id,
      codice: r.codice,
      nome: r.nome,
      barcode: r.barcode,
      schedaProvvisoria: Boolean(r.scheda_provvisoria),
    })),
  };
}

export async function associateBarcodeAction(raw: unknown): Promise<
  | { success: true; item: BarcodeLookupHit }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("magazzino");
  const parsed = associateBarcodeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const input = parsed.data;
  const supabase = await createClient();

  const existing = await findByBarcode(supabase, input.barcode);
  if (existing && existing.row.id !== input.prodottoId) {
    return {
      success: false,
      error: `Barcode già associato a ${existing.row.codice}.`,
    };
  }

  const table = catalogTable(input.catalogKind);
  const { data, error } = await supabase
    .from(table)
    .update({
      barcode: input.barcode.trim(),
      updated_by: auth.userId,
    })
    .eq("id", input.prodottoId)
    .is("deleted_at", null)
    .select(
      "id, codice, nome, barcode, scheda_provvisoria, categoria_utilizzo"
    )
    .single();
  if (error || !data) {
    return {
      success: false,
      error:
        error?.code === "23505"
          ? "Barcode già in uso."
          : error?.message ?? "Associazione fallita.",
    };
  }

  const row = data as {
    id: string;
    codice: string;
    nome: string;
    barcode: string | null;
    scheda_provvisoria: boolean | null;
    categoria_utilizzo: string | null;
  };
  const g = await loadGiacenza(supabase, input.catalogKind, row.id);

  void writeAuditLog({
    entity_type: table,
    entity_id: row.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Associato barcode ${input.barcode} a ${row.codice}`,
    payload: { barcode: input.barcode },
  });

  return {
    success: true,
    item: {
      catalogKind: input.catalogKind,
      prodottoId: row.id,
      codice: row.codice,
      nome: row.nome,
      barcode: row.barcode ?? input.barcode,
      schedaProvvisoria: Boolean(row.scheda_provvisoria),
      categoriaUtilizzo: row.categoria_utilizzo,
      giacenza: g.quantita,
      unita: g.unita,
    },
  };
}

export async function createArticoloFromBarcodeAction(raw: unknown): Promise<
  | { success: true; item: BarcodeLookupHit }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("magazzino");
  const parsed = createFromBarcodeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const input = parsed.data;
  const supabase = await createClient();

  const dup = await findByBarcode(supabase, input.barcode);
  if (dup) {
    return {
      success: false,
      error: `Barcode già associato a ${dup.row.codice}.`,
    };
  }

  if (input.categoriaUtilizzo === "acquisti_occasionali") {
    return {
      success: false,
      error:
        "Acquisti Occasionali non usano magazzino barcode. Scegli Mat. Consumo o Mat. Poco Consumo.",
    };
  }

  const table = catalogTable(input.catalogKind);
  let codice = suggestProvisionalCode(input.catalogKind, input.nome);
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await supabase
      .from(table)
      .select("id")
      .ilike("codice", codice)
      .is("deleted_at", null)
      .maybeSingle();
    if (!clash) break;
    codice = suggestProvisionalCode(input.catalogKind, input.nome + i);
  }

  const { data, error } = await supabase
    .from(table)
    .insert({
      codice,
      nome: input.nome.trim(),
      note: "Creato da scansione barcode",
      is_bio: false,
      barcode: input.barcode.trim(),
      scheda_provvisoria: input.schedaProvvisoria,
      categoria_utilizzo: input.categoriaUtilizzo,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(
      "id, codice, nome, barcode, scheda_provvisoria, categoria_utilizzo"
    )
    .single();
  if (error || !data) {
    return {
      success: false,
      error:
        error?.code === "23505"
          ? "Codice o barcode già esistente."
          : error?.message ?? "Creazione fallita.",
    };
  }

  const row = data as {
    id: string;
    codice: string;
    nome: string;
    barcode: string | null;
    scheda_provvisoria: boolean | null;
    categoria_utilizzo: string | null;
  };

  void writeAuditLog({
    entity_type: table,
    entity_id: row.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Nuovo articolo da barcode ${input.barcode}${
      input.schedaProvvisoria ? " (scheda provvisoria)" : ""
    }`,
    payload: {
      barcode: input.barcode,
      codice: row.codice,
      schedaProvvisoria: input.schedaProvvisoria,
    },
  });

  return {
    success: true,
    item: {
      catalogKind: input.catalogKind,
      prodottoId: row.id,
      codice: row.codice,
      nome: row.nome,
      barcode: row.barcode ?? input.barcode,
      schedaProvvisoria: Boolean(row.scheda_provvisoria),
      categoriaUtilizzo: row.categoria_utilizzo,
      giacenza: 0,
      unita: input.unita,
    },
  };
}

export async function setArticoloBarcodeAction(raw: unknown): Promise<
  | { success: true }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("magazzino");
  const parsed = setArticoloBarcodeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const input = parsed.data;
  const supabase = await createClient();
  const table = catalogTable(input.catalogKind);

  if (input.barcode) {
    const dup = await findByBarcode(supabase, input.barcode);
    if (dup && dup.row.id !== input.prodottoId) {
      return {
        success: false,
        error: `Barcode già associato a ${dup.row.codice}.`,
      };
    }
  }

  const payload: Record<string, unknown> = {
    barcode: input.barcode ? input.barcode.trim() : null,
    updated_by: auth.userId,
  };
  if (typeof input.schedaProvvisoria === "boolean") {
    payload.scheda_provvisoria = input.schedaProvvisoria;
  }

  const { error } = await supabase
    .from(table)
    .update(payload)
    .eq("id", input.prodottoId)
    .is("deleted_at", null);
  if (error) {
    return {
      success: false,
      error:
        error.code === "23505" ? "Barcode già in uso." : error.message,
    };
  }

  void writeAuditLog({
    entity_type: table,
    entity_id: input.prodottoId,
    action: "update",
    actor_id: auth.userId,
    summary: input.barcode
      ? `Impostato barcode ${input.barcode}`
      : "Rimosso barcode",
    payload: {
      barcode: input.barcode,
      schedaProvvisoria: input.schedaProvvisoria,
    },
  });
  return { success: true };
}

export async function movimentoScanAction(raw: unknown): Promise<
  | {
      success: true;
      item: BarcodeLookupHit;
      movimentoId: string;
      delta: number;
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("magazzino");
  const parsed = movimentoScanSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const input = parsed.data;
  const supabase = await createClient();
  const hit = await findByBarcode(supabase, input.barcode);
  if (!hit) {
    return {
      success: false,
      error: "Barcode non associato. Usa Associa o Crea nuovo.",
    };
  }
  if (hit.row.categoria_utilizzo === "acquisti_occasionali") {
    return {
      success: false,
      error: "Articolo Acquisti Occasionali: non gestito in magazzino.",
    };
  }

  const g = await loadGiacenza(supabase, hit.kind, hit.row.id);
  const delta =
    input.mode === "carico" ? Math.abs(input.quantita) : -Math.abs(input.quantita);
  const nextQty = g.quantita + delta;
  if (nextQty < 0) {
    return {
      success: false,
      error: `Giacenza insufficiente (${g.quantita} ${g.unita}).`,
    };
  }

  const unita = input.unita || g.unita;
  const giacPayload = {
    catalog_kind: hit.kind,
    prodotto_id: hit.row.id,
    prodotto_codice: hit.row.codice,
    quantita_kg: nextQty,
    unita,
    updated_by: auth.userId,
    is_test: false,
  };

  let giacenzaId = g.id;
  if (g.id) {
    const { error } = await supabase
      .from("magazzino_giacenze")
      .update(giacPayload)
      .eq("id", g.id);
    if (error) return { success: false, error: error.message };
  } else {
    const { data, error } = await supabase
      .from("magazzino_giacenze")
      .insert({ ...giacPayload, created_by: auth.userId })
      .select("id")
      .single();
    if (error || !data) {
      return { success: false, error: error?.message ?? "Giacenza fallita." };
    }
    giacenzaId = data.id;
  }

  const { data: mov, error: movErr } = await supabase
    .from("magazzino_movimenti")
    .insert({
      catalog_kind: hit.kind,
      prodotto_id: hit.row.id,
      prodotto_codice: hit.row.codice,
      tipo: input.mode,
      quantita_kg: Math.abs(input.quantita),
      unita,
      barcode_letto: input.barcode.trim(),
      riferimento: `scan-${input.mode}`,
      note: input.note ?? "",
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
    summary: `${input.mode === "carico" ? "Carico" : "Scarico"} ${Math.abs(
      input.quantita
    )} ${unita} · ${hit.row.codice} · barcode ${input.barcode}`,
    payload: {
      mode: input.mode,
      barcode: input.barcode,
      quantita: input.quantita,
      giacenzaPrima: g.quantita,
      giacenzaDopo: nextQty,
      giacenzaId,
    },
  });

  return {
    success: true,
    movimentoId: mov.id,
    delta,
    item: {
      catalogKind: hit.kind,
      prodottoId: hit.row.id,
      codice: hit.row.codice,
      nome: hit.row.nome,
      barcode: hit.row.barcode ?? input.barcode,
      schedaProvvisoria: Boolean(hit.row.scheda_provvisoria),
      categoriaUtilizzo: hit.row.categoria_utilizzo,
      giacenza: nextQty,
      unita,
    },
  };
}
