"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  computeSemaforo,
  quantitaDaOrdinare,
  updateMagazzinoProdottoSchema,
  type MagazzinoCatalogKind,
  type MagazzinoProdottoRiga,
  type MagazzinoUnita,
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
  is_bio: boolean | null;
};

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
        .select("id, codice, nome, is_bio")
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

  const items: MagazzinoProdottoRiga[] = ((articoli ?? []) as ArticoloRow[]).map(
    (p) => {
      const g = giacByProd.get(p.id);
      const quantita = g ? Number(g.quantita_kg) || 0 : 0;
      const quantitaRiserva =
        g?.quantita_riserva != null && g.quantita_riserva !== ""
          ? Number(g.quantita_riserva)
          : null;
      const unita = (g?.unita === "pz" ? "pz" : "kg") as MagazzinoUnita;
      return {
        catalogKind,
        prodottoId: p.id,
        codice: p.codice,
        nome: p.nome,
        isBio: Boolean(p.is_bio),
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
      };
    }
  );

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

  const { data: articolo, error: pErr } = await supabase
    .from(table)
    .select("id, codice, nome, is_bio")
    .eq("id", input.prodottoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (pErr) return { success: false, error: pErr.message };
  if (!articolo) return { success: false, error: "Articolo non trovato." };
  const p = articolo as ArticoloRow;

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
    prodottoNome: p.nome,
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
      isBio: Boolean(p.is_bio),
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
