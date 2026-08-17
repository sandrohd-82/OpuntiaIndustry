"use server";

import { z } from "zod";
import {
  catalogoTable,
  type CatalogoLifecycleKind,
} from "@/lib/amministrazione/catalogo-lifecycle";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";

export type ArticoloRef = {
  kind: CatalogoLifecycleKind;
  id: string;
  codice: string;
  nome: string;
};

export type ArticoloCollegamento = {
  id: string;
  note: string;
  linked: ArticoloRef;
  createdAt: string;
};

const kindSchema = z.enum(["servizio", "prodotto", "materia"]);

const pairSchema = z.object({
  kindA: kindSchema,
  idA: z.string().uuid(),
  kindB: kindSchema,
  idB: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
});

type Row = {
  id: string;
  kind_a: CatalogoLifecycleKind;
  articolo_a_id: string;
  kind_b: CatalogoLifecycleKind;
  articolo_b_id: string;
  note: string;
  created_at: string;
};

/** Ordine canonico per unicità undirected. */
function canonicalize(
  kindA: CatalogoLifecycleKind,
  idA: string,
  kindB: CatalogoLifecycleKind,
  idB: string
): {
  kind_a: CatalogoLifecycleKind;
  articolo_a_id: string;
  kind_b: CatalogoLifecycleKind;
  articolo_b_id: string;
} {
  const keyA = `${kindA}:${idA}`;
  const keyB = `${kindB}:${idB}`;
  if (keyA === keyB) {
    throw new Error("Non puoi collegare un articolo a se stesso.");
  }
  if (keyA < keyB) {
    return {
      kind_a: kindA,
      articolo_a_id: idA,
      kind_b: kindB,
      articolo_b_id: idB,
    };
  }
  return {
    kind_a: kindB,
    articolo_a_id: idB,
    kind_b: kindA,
    articolo_b_id: idA,
  };
}

async function resolveArticolo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kind: CatalogoLifecycleKind,
  id: string
): Promise<ArticoloRef | null> {
  const table = catalogoTable(kind);
  const { data, error } = await supabase
    .from(table)
    .select("id, codice, nome")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; codice: string; nome: string };
  return { kind, id: row.id, codice: row.codice, nome: row.nome };
}

async function resolveMany(
  supabase: Awaited<ReturnType<typeof createClient>>,
  refs: Array<{ kind: CatalogoLifecycleKind; id: string }>
): Promise<Map<string, ArticoloRef>> {
  const map = new Map<string, ArticoloRef>();
  const byKind: Record<CatalogoLifecycleKind, string[]> = {
    servizio: [],
    prodotto: [],
    materia: [],
  };
  for (const r of refs) byKind[r.kind].push(r.id);

  for (const kind of ["servizio", "prodotto", "materia"] as const) {
    const ids = [...new Set(byKind[kind])];
    if (ids.length === 0) continue;
    const { data } = await supabase
      .from(catalogoTable(kind))
      .select("id, codice, nome")
      .in("id", ids)
      .is("deleted_at", null);
    for (const row of (data ?? []) as Array<{
      id: string;
      codice: string;
      nome: string;
    }>) {
      map.set(`${kind}:${row.id}`, {
        kind,
        id: row.id,
        codice: row.codice,
        nome: row.nome,
      });
    }
  }
  return map;
}

export async function listArticoloCollegamentiAction(input: {
  kind: CatalogoLifecycleKind;
  id: string;
}): Promise<
  | { success: true; items: ArticoloCollegamento[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const [{ data: asA, error: errA }, { data: asB, error: errB }] =
    await Promise.all([
      supabase
        .from("catalogo_articoli_collegamenti")
        .select("*")
        .is("deleted_at", null)
        .eq("kind_a", input.kind)
        .eq("articolo_a_id", input.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("catalogo_articoli_collegamenti")
        .select("*")
        .is("deleted_at", null)
        .eq("kind_b", input.kind)
        .eq("articolo_b_id", input.id)
        .order("created_at", { ascending: false }),
    ]);
  if (errA) return { success: false, error: errA.message };
  if (errB) return { success: false, error: errB.message };

  const rows = [...((asA ?? []) as Row[]), ...((asB ?? []) as Row[])];
  const otherRefs = rows.map((r) =>
    r.kind_a === input.kind && r.articolo_a_id === input.id
      ? { kind: r.kind_b, id: r.articolo_b_id }
      : { kind: r.kind_a, id: r.articolo_a_id }
  );
  const resolved = await resolveMany(supabase, otherRefs);
  const items: ArticoloCollegamento[] = [];
  for (const r of rows) {
    const other =
      r.kind_a === input.kind && r.articolo_a_id === input.id
        ? resolved.get(`${r.kind_b}:${r.articolo_b_id}`)
        : resolved.get(`${r.kind_a}:${r.articolo_a_id}`);
    if (!other) continue;
    items.push({
      id: r.id,
      note: r.note ?? "",
      linked: other,
      createdAt: r.created_at,
    });
  }
  return { success: true, items };
}

/** Collegati per più codici (es. righe fattura) — bidirezionale. */
export async function listCollegamentiByCodiciAction(
  codici: string[]
): Promise<
  | { success: true; byCodice: Record<string, ArticoloRef[]> }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const codes = [
    ...new Set(codici.map((c) => c.trim()).filter((c) => c && c !== "—")),
  ];
  const byCodice: Record<string, ArticoloRef[]> = {};
  if (codes.length === 0) return { success: true, byCodice };

  const refs: ArticoloRef[] = [];
  for (const kind of ["servizio", "prodotto", "materia"] as const) {
    const { data } = await supabase
      .from(catalogoTable(kind))
      .select("id, codice, nome")
      .in("codice", codes)
      .is("deleted_at", null);
    for (const row of (data ?? []) as Array<{
      id: string;
      codice: string;
      nome: string;
    }>) {
      refs.push({ kind, id: row.id, codice: row.codice, nome: row.nome });
    }
  }
  if (refs.length === 0) return { success: true, byCodice };

  const linkRows: Row[] = [];
  for (const r of refs) {
    const [{ data: asA }, { data: asB }] = await Promise.all([
      supabase
        .from("catalogo_articoli_collegamenti")
        .select("*")
        .is("deleted_at", null)
        .eq("kind_a", r.kind)
        .eq("articolo_a_id", r.id),
      supabase
        .from("catalogo_articoli_collegamenti")
        .select("*")
        .is("deleted_at", null)
        .eq("kind_b", r.kind)
        .eq("articolo_b_id", r.id),
    ]);
    linkRows.push(...((asA ?? []) as Row[]), ...((asB ?? []) as Row[]));
  }

  // dedupe by id
  const byId = new Map(linkRows.map((r) => [r.id, r]));
  const rows = [...byId.values()];

  const allOther = rows.flatMap((r) => [
    { kind: r.kind_a, id: r.articolo_a_id },
    { kind: r.kind_b, id: r.articolo_b_id },
  ]);
  const resolved = await resolveMany(supabase, allOther);

  const refByKey = new Map(refs.map((r) => [`${r.kind}:${r.id}`, r]));

  for (const r of rows) {
    const a = resolved.get(`${r.kind_a}:${r.articolo_a_id}`);
    const b = resolved.get(`${r.kind_b}:${r.articolo_b_id}`);
    if (!a || !b) continue;
    const aIsSource = refByKey.has(`${a.kind}:${a.id}`);
    const bIsSource = refByKey.has(`${b.kind}:${b.id}`);
    if (aIsSource) {
      const src = refByKey.get(`${a.kind}:${a.id}`)!;
      const list = byCodice[src.codice] ?? (byCodice[src.codice] = []);
      if (!list.some((x) => x.id === b.id && x.kind === b.kind)) list.push(b);
    }
    if (bIsSource) {
      const src = refByKey.get(`${b.kind}:${b.id}`)!;
      const list = byCodice[src.codice] ?? (byCodice[src.codice] = []);
      if (!list.some((x) => x.id === a.id && x.kind === a.kind)) list.push(a);
    }
  }

  return { success: true, byCodice };
}

export async function createArticoloCollegamentoAction(input: {
  kindA: CatalogoLifecycleKind;
  idA: string;
  kindB: CatalogoLifecycleKind;
  idB: string;
  note?: string;
}): Promise<
  | { success: true; item: ArticoloCollegamento }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = pairSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }

  const supabase = await createClient();
  let pair;
  try {
    pair = canonicalize(
      parsed.data.kindA,
      parsed.data.idA,
      parsed.data.kindB,
      parsed.data.idB
    );
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Legame non valido.",
    };
  }

  const a = await resolveArticolo(supabase, pair.kind_a, pair.articolo_a_id);
  const b = await resolveArticolo(supabase, pair.kind_b, pair.articolo_b_id);
  if (!a || !b) {
    return { success: false, error: "Uno dei due articoli non esiste più." };
  }

  const { data, error } = await supabase
    .from("catalogo_articoli_collegamenti")
    .insert({
      ...pair,
      note: parsed.data.note ?? "",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Questi articoli sono già collegati." };
    }
    return { success: false, error: error.message };
  }

  const row = data as Row;
  const linked =
    row.kind_a === parsed.data.kindA && row.articolo_a_id === parsed.data.idA
      ? b
      : a;

  await writeAuditLog({
    entity_type: "catalogo_articoli_collegamenti",
    entity_id: row.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Collegati ${a.codice} ↔ ${b.codice}`,
    payload: { a, b, note: parsed.data.note ?? "" },
  });

  return {
    success: true,
    item: {
      id: row.id,
      note: row.note ?? "",
      linked,
      createdAt: row.created_at,
    },
  };
}

export async function softDeleteArticoloCollegamentoAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("catalogo_articoli_collegamenti")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existing) return { success: false, error: "Legame non trovato." };

  const { error } = await supabase
    .from("catalogo_articoli_collegamenti")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "catalogo_articoli_collegamenti",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Rimosso legame articoli",
    payload: existing,
  });

  return { success: true };
}

/** Candidati per aggiungere un legame (ricerca codice/nome). */
export async function searchArticoliPerCollegamentoAction(input: {
  query: string;
  excludeKind: CatalogoLifecycleKind;
  excludeId: string;
}): Promise<
  | { success: true; items: ArticoloRef[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const q = input.query.trim();
  const items: ArticoloRef[] = [];

  for (const kind of ["servizio", "prodotto", "materia"] as const) {
    let query = supabase
      .from(catalogoTable(kind))
      .select("id, codice, nome")
      .is("deleted_at", null)
      .order("codice", { ascending: true })
      .limit(40);
    if (q) {
      const safe = q.replace(/[%_,]/g, " ").trim();
      if (safe) {
        query = query.or(`codice.ilike.%${safe}%,nome.ilike.%${safe}%`);
      }
    }
    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    for (const row of (data ?? []) as Array<{
      id: string;
      codice: string;
      nome: string;
    }>) {
      if (kind === input.excludeKind && row.id === input.excludeId) continue;
      items.push({ kind, id: row.id, codice: row.codice, nome: row.nome });
    }
  }

  items.sort((a, b) => a.codice.localeCompare(b.codice, "it"));
  return { success: true, items: items.slice(0, 50) };
}
