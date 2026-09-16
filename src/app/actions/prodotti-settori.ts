"use server";

import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import {
  createCatalogoSettoreSchema,
  normalizeNomeSettore,
  slugSettoreFromNome,
  type CatalogoSettore,
  type ProdottoSettore,
} from "@/lib/amministrazione/prodotti-settori";
import type { CatalogoSettoreRow } from "@/types/database";

function mapSettoreRow(row: CatalogoSettoreRow): CatalogoSettore {
  return {
    id: row.id,
    slug: row.slug,
    nome: row.nome,
    sortOrder: row.sort_order,
    attivo: row.attivo,
  };
}

export async function listCatalogoSettoriAction(): Promise<
  | { success: true; settori: CatalogoSettore[] }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess([
    "amministrazione",
    "magazzino",
    "commerciale",
    "produzione",
  ]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalogo_settori")
    .select("*")
    .is("deleted_at", null)
    .eq("attivo", true)
    .order("sort_order", { ascending: true })
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    settori: ((data ?? []) as CatalogoSettoreRow[]).map(mapSettoreRow),
  };
}

export async function createCatalogoSettoreAction(input: {
  nome: string;
}): Promise<
  | { success: true; settore: CatalogoSettore }
  | { success: false; error: string }
> {
  const parsed = createCatalogoSettoreSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati settore non validi.",
    };
  }
  const { auth } = await requireAnyAreaAccess([
    "amministrazione",
    "magazzino",
  ]);
  const supabase = await createClient();
  const nome = normalizeNomeSettore(parsed.data.nome);
  let slug = slugSettoreFromNome(nome);

  const { data: sameNome } = await supabase
    .from("catalogo_settori")
    .select("id")
    .is("deleted_at", null)
    .ilike("nome", nome)
    .maybeSingle();
  if (sameNome) {
    return { success: false, error: `Il settore “${nome}” esiste già.` };
  }

  for (let i = 2; i < 20; i += 1) {
    const { data: clash } = await supabase
      .from("catalogo_settori")
      .select("id")
      .is("deleted_at", null)
      .eq("slug", slug)
      .maybeSingle();
    if (!clash) break;
    slug = `${slugSettoreFromNome(nome)}-${i}`;
  }

  const { data: maxRow } = await supabase
    .from("catalogo_settori")
    .select("sort_order")
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder =
    Number((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("catalogo_settori")
    .insert({
      slug,
      nome,
      sort_order: sortOrder,
      attivo: true,
      versione: 1,
      documento_stato: "approvato",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("*")
    .single();

  if (error || !data) {
    return {
      success: false,
      error:
        error?.code === "23505"
          ? `Il settore “${nome}” esiste già.`
          : error?.message ?? "Salvataggio settore non riuscito.",
    };
  }

  const row = data as CatalogoSettoreRow;
  await writeAuditLog({
    entity_type: "catalogo_settori",
    entity_id: row.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creato settore ${row.nome}`,
    payload: { slug: row.slug, nome: row.nome },
  });

  return { success: true, settore: mapSettoreRow(row) };
}

export async function loadSettoriByProdottoIds(
  prodottoIds: string[]
): Promise<Map<string, ProdottoSettore[]>> {
  const map = new Map<string, ProdottoSettore[]>();
  if (prodottoIds.length === 0) return map;
  const supabase = await createClient();
  const { data: links, error: linkErr } = await supabase
    .from("prodotti_propri_settori")
    .select("prodotto_id, settore_id")
    .in("prodotto_id", prodottoIds)
    .is("deleted_at", null);
  if (linkErr || !links?.length) return map;

  const settoreIds = [
    ...new Set(
      (links as Array<{ settore_id: string }>).map((l) => l.settore_id)
    ),
  ];
  const { data: settori } = await supabase
    .from("catalogo_settori")
    .select("id, nome, slug, sort_order")
    .in("id", settoreIds)
    .is("deleted_at", null);
  const byId = new Map(
    (
      (settori ?? []) as Array<{
        id: string;
        nome: string;
        slug: string;
        sort_order: number;
      }>
    ).map((s) => [s.id, s])
  );

  for (const link of links as Array<{
    prodotto_id: string;
    settore_id: string;
  }>) {
    const s = byId.get(link.settore_id);
    if (!s) continue;
    const list = map.get(link.prodotto_id) ?? [];
    list.push({ id: s.id, nome: s.nome, slug: s.slug });
    map.set(link.prodotto_id, list);
  }

  for (const [id, list] of map) {
    list.sort((a, b) => a.nome.localeCompare(b.nome, "it"));
    map.set(id, list);
  }
  return map;
}

export async function syncProdottoSettori(input: {
  prodottoId: string;
  settoreIds: string[];
  userId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const wanted = [...new Set(input.settoreIds.filter(Boolean))];

  const { data: existing, error: exErr } = await supabase
    .from("prodotti_propri_settori")
    .select("id, settore_id, deleted_at")
    .eq("prodotto_id", input.prodottoId);
  if (exErr) return { success: false, error: exErr.message };

  const rows = (existing ?? []) as Array<{
    id: string;
    settore_id: string;
    deleted_at: string | null;
  }>;
  const live = rows.filter((r) => !r.deleted_at);
  const liveIds = new Set(live.map((r) => r.settore_id));

  const toRemove = live.filter((r) => !wanted.includes(r.settore_id));
  if (toRemove.length) {
    const { error } = await supabase
      .from("prodotti_propri_settori")
      .update({
        deleted_at: nowIso,
        deleted_by: input.userId,
        updated_by: input.userId,
      })
      .in(
        "id",
        toRemove.map((r) => r.id)
      );
    if (error) return { success: false, error: error.message };
  }

  for (const settoreId of wanted) {
    if (liveIds.has(settoreId)) continue;
    const resurrect = rows.find(
      (r) => r.settore_id === settoreId && r.deleted_at
    );
    if (resurrect) {
      const { error } = await supabase
        .from("prodotti_propri_settori")
        .update({
          deleted_at: null,
          deleted_by: null,
          updated_by: input.userId,
        })
        .eq("id", resurrect.id);
      if (error) return { success: false, error: error.message };
      continue;
    }
    const { error } = await supabase.from("prodotti_propri_settori").insert({
      prodotto_id: input.prodottoId,
      settore_id: settoreId,
      created_by: input.userId,
      updated_by: input.userId,
    });
    if (error) return { success: false, error: error.message };
  }

  await writeAuditLog({
    entity_type: "prodotti_propri_settori",
    entity_id: input.prodottoId,
    action: "update",
    actor_id: input.userId,
    summary: `Aggiornati settori prodotto (${wanted.length})`,
    payload: { settoreIds: wanted },
  });

  return { success: true };
}
