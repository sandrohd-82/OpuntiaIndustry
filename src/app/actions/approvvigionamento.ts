"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { unitaMateriaPrimaValida } from "@/lib/amministrazione/materie-prime";
import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();
const giornoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const chiaveSchema = z.string().trim().min(8).max(80);

const rigaSchema = z.object({
  materiaPrimaId: uuidSchema,
  quantita: z.number().positive().max(1_000_000),
  unitaMisura: z.string().trim().refine(unitaMateriaPrimaValida, "Unità non prevista."),
  note: z.string().trim().max(500).optional().default(""),
});

const ordineSchema = z.object({
  fornitoreId: uuidSchema,
  dataConsegna: giornoSchema,
  note: z.string().trim().max(2000).optional().default(""),
  origineOrdineId: uuidSchema.nullable().optional(),
  righe: z.array(rigaSchema).min(1).max(40),
});

type Errore = { success: false; error: string };

export type OrdineCalendario = {
  id: string;
  codice: string;
  fornitoreId: string;
  fornitore: string;
  dataConsegna: string;
  note: string;
  stato: "bozza";
  origineOrdineId: string | null;
  righe: {
    id: string;
    materiaPrimaId: string;
    codice: string;
    nome: string;
    quantita: number;
    unitaMisura: string;
    note: string;
  }[];
};

export type MateriaCalendario = {
  id: string;
  codice: string;
  nome: string;
  unitaMisura: string | null;
};

function messaggioDb(errore: { message?: string } | null, fallback: string): string {
  const testo = errore?.message ?? fallback;
  if (testo.includes("@")) return fallback;
  return testo.replace(/^Errore:\s*/i, "").slice(0, 300);
}

function comeOggetto(data: unknown): Record<string, unknown> {
  if (Array.isArray(data)) return (data[0] ?? {}) as Record<string, unknown>;
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return {};
}

async function richiedi() {
  const { auth } = await requireAreaAccess("produzione");
  return auth;
}

export async function listaMaterieApprovvigionamentoAction(): Promise<
  { success: true; materie: MateriaCalendario[] } | Errore
> {
  await richiedi();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materie_prime")
    .select("id, codice, nome, unita_misura")
    .is("deleted_at", null)
    .order("codice", { ascending: true });
  if (error) return { success: false, error: "Catalogo materie prime non disponibile." };
  return {
    success: true,
    materie: (data ?? []).map((row) => ({
      id: String(row.id),
      codice: String(row.codice),
      nome: String(row.nome),
      unitaMisura: row.unita_misura ? String(row.unita_misura) : null,
    })),
  };
}

export async function fornitoriCompatibiliApprovvigionamentoAction(
  materiaIds: string[]
): Promise<{ success: true; fornitori: { id: string; nome: string; targa: string }[] } | Errore> {
  await richiedi();
  const ids = [...new Set(materiaIds)].filter((id) => uuidSchema.safeParse(id).success);
  if (!ids.length) return { success: true, fornitori: [] };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fornitori_compatibili_approvvigionamento", {
    p_materie: ids,
  });
  if (error) return { success: false, error: messaggioDb(error, "Fornitori non disponibili.") };
  const righe = Array.isArray(data) ? data : [];
  return {
    success: true,
    fornitori: righe.map((row) => ({
      id: String(row.id),
      nome: String(row.ragione_sociale),
      targa: String(row.codice_targa ?? ""),
    })),
  };
}

export async function listaOrdiniApprovvigionamentoAction(input: {
  da: string;
  a: string;
}): Promise<{ success: true; ordini: OrdineCalendario[] } | Errore> {
  await richiedi();
  const da = giornoSchema.safeParse(input.da);
  const a = giornoSchema.safeParse(input.a);
  if (!da.success || !a.success) return { success: false, error: "Periodo non valido." };
  const supabase = await createClient();
  const { data: ordini, error } = await supabase
    .from("approvvigionamenti_ordini")
    .select("id, codice, fornitore_id, data_consegna, note, stato, origine_ordine_id")
    .is("deleted_at", null)
    .gte("data_consegna", da.data)
    .lte("data_consegna", a.data)
    .order("data_consegna", { ascending: true });
  if (error) return { success: false, error: "Ordini non disponibili." };
  const ids = (ordini ?? []).map((row) => String(row.id));
  const fornitoreIds = [...new Set((ordini ?? []).map((row) => String(row.fornitore_id)))];
  const [righeRes, fornitoriRes] = await Promise.all([
    ids.length
      ? supabase
          .from("approvvigionamenti_righe")
          .select("id, ordine_id, materia_prima_id, quantita, unita_misura, note, sort_order")
          .in("ordine_id", ids)
          .is("deleted_at", null)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    fornitoreIds.length
      ? supabase
          .from("fornitori")
          .select("id, ragione_sociale")
          .in("id", fornitoreIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (righeRes.error || fornitoriRes.error) {
    return { success: false, error: "Dettaglio ordini non disponibile." };
  }
  const materiaIds = [...new Set((righeRes.data ?? []).map((row) => String(row.materia_prima_id)))];
  const { data: materie } = materiaIds.length
    ? await supabase.from("materie_prime").select("id, codice, nome").in("id", materiaIds)
    : { data: [] };
  const nomiMaterie = new Map(
    (materie ?? []).map((row) => [String(row.id), { codice: String(row.codice), nome: String(row.nome) }])
  );
  const nomiFornitori = new Map(
    (fornitoriRes.data ?? []).map((row) => [String(row.id), String(row.ragione_sociale)])
  );
  const righePerOrdine = new Map<string, OrdineCalendario["righe"]>();
  for (const row of righeRes.data ?? []) {
    const ordineId = String(row.ordine_id);
    const materia = nomiMaterie.get(String(row.materia_prima_id));
    const lista = righePerOrdine.get(ordineId) ?? [];
    lista.push({
      id: String(row.id),
      materiaPrimaId: String(row.materia_prima_id),
      codice: materia?.codice ?? "",
      nome: materia?.nome ?? "Materia prima",
      quantita: Number(row.quantita),
      unitaMisura: String(row.unita_misura),
      note: String(row.note ?? ""),
    });
    righePerOrdine.set(ordineId, lista);
  }
  return {
    success: true,
    ordini: (ordini ?? []).map((row) => ({
      id: String(row.id),
      codice: String(row.codice),
      fornitoreId: String(row.fornitore_id),
      fornitore: nomiFornitori.get(String(row.fornitore_id)) ?? "Fornitore",
      dataConsegna: String(row.data_consegna),
      note: String(row.note ?? ""),
      stato: "bozza",
      origineOrdineId: row.origine_ordine_id ? String(row.origine_ordine_id) : null,
      righe: righePerOrdine.get(String(row.id)) ?? [],
    })),
  };
}

export async function salvaApprovvigionamentiAction(raw: unknown): Promise<
  { success: true; riusata: boolean; ordini: { id: string; codice: string; dataConsegna: string }[] } | Errore
> {
  const parsed = z
    .object({
      chiave: chiaveSchema,
      tipo: z.enum(["crea", "copia", "settimana", "piano"]),
      ordini: z.array(ordineSchema).min(1).max(200),
    })
    .safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Ordine non valido." };
  }
  const auth = await richiedi();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registra_approvvigionamenti", {
    p_chiave: parsed.data.chiave,
    p_tipo: parsed.data.tipo,
    p_ordini: parsed.data.ordini,
  });
  if (error) return { success: false, error: messaggioDb(error, "Registrazione non riuscita.") };
  const corpo = comeOggetto(data);
  const ordini = Array.isArray(corpo.ordini)
    ? corpo.ordini.map((voce) => {
        const riga = voce as { id?: string; codice?: string; dataConsegna?: string };
        return {
          id: String(riga.id),
          codice: String(riga.codice),
          dataConsegna: String(riga.dataConsegna),
        };
      })
    : [];
  await writeAuditLog({
    entity_type: "approvvigionamenti_ordini",
    entity_id: ordini[0]?.id ?? parsed.data.chiave,
    action: parsed.data.tipo,
    actor_id: auth.userId,
    summary: corpo.riusata
      ? "Operazione già registrata: nessun nuovo ordine."
      : `Registrate ${ordini.length} bozze di approvvigionamento.`,
    payload: { riusata: Boolean(corpo.riusata), ordini: ordini.length },
  });
  return { success: true, riusata: Boolean(corpo.riusata), ordini };
}

export async function aggiornaApprovvigionamentoAction(raw: unknown): Promise<
  { success: true; riusata: boolean } | Errore
> {
  const parsed = z
    .object({
      chiave: chiaveSchema,
      ordineId: uuidSchema,
      ordine: ordineSchema,
    })
    .safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Modifica non valida." };
  }
  const auth = await richiedi();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("aggiorna_approvvigionamento", {
    p_chiave: parsed.data.chiave,
    p_ordine_id: parsed.data.ordineId,
    p_ordine: parsed.data.ordine,
  });
  if (error) return { success: false, error: messaggioDb(error, "Modifica non riuscita.") };
  const corpo = comeOggetto(data);
  await writeAuditLog({
    entity_type: "approvvigionamenti_ordini",
    entity_id: parsed.data.ordineId,
    action: "aggiorna",
    actor_id: auth.userId,
    summary: corpo.riusata
      ? "Modifica già registrata."
      : "Bozza di approvvigionamento aggiornata.",
    payload: { riusata: Boolean(corpo.riusata) },
  });
  return { success: true, riusata: Boolean(corpo.riusata) };
}
