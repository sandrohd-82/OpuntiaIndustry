"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  assignNumeriVignetta,
  buildElaborazioneView,
  elaborazioneSaveSchema,
  trimestreBounds,
  type ElaborazioneContabileView,
} from "@/lib/amministrazione/elaborazione-contabile";
import type { TrimestreNumero } from "@/lib/amministrazione/trimestre-commerciale";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import type {
  ElaborazioneContabileInsert,
  ElaborazioneContabileKind,
  ElaborazioneContabileRow,
  ElaborazioneContabileVoceInsert,
  ElaborazioneContabileVoceRow,
} from "@/types/database";

export type ElaborazioneActionResult =
  | { success: true; elaborazione: ElaborazioneContabileView }
  | { success: false; error: string };

async function loadFattureTrimestre(
  kind: ElaborazioneContabileKind,
  anno: number,
  trimestre: TrimestreNumero
): Promise<
  | {
      ok: true;
      rows: Array<{
        id: string;
        numeroInterno: string;
        dataEmissione: string;
        anagraficaRagioneSociale: string;
        anagraficaCodiceTarga: string;
        totale: number;
      }>;
    }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { dal, al } = trimestreBounds(anno, trimestre);

  if (kind === "emessa") {
    const { data, error } = await supabase
      .from("fatture_emesse")
      .select(
        "id, numero_interno, data_emissione, cliente_ragione_sociale, cliente_codice_targa, totale, tipo_documento"
      )
      .is("deleted_at", null)
      .neq("tipo_documento", "nota_credito")
      .gte("data_emissione", dal)
      .lte("data_emissione", al)
      .order("data_emissione", { ascending: true })
      .order("numero_interno", { ascending: true });
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      rows: (data ?? [])
        .filter((r) => !String(r.numero_interno ?? "").toUpperCase().startsWith("NC-"))
        .map((r) => ({
          id: String(r.id),
          numeroInterno: String(r.numero_interno ?? ""),
          dataEmissione: String(r.data_emissione ?? ""),
          anagraficaRagioneSociale: String(r.cliente_ragione_sociale ?? ""),
          anagraficaCodiceTarga: String(r.cliente_codice_targa ?? ""),
          totale: Number(r.totale) || 0,
        })),
    };
  }

  const { data, error } = await supabase
    .from("fatture_ricevute")
    .select(
      "id, numero_interno, data_emissione, fornitore_ragione_sociale, fornitore_codice_targa, totale"
    )
    .is("deleted_at", null)
    .gte("data_emissione", dal)
    .lte("data_emissione", al)
    .order("data_emissione", { ascending: true })
    .order("numero_interno", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    rows: (data ?? []).map((r) => ({
      id: String(r.id),
      numeroInterno: String(r.numero_interno ?? ""),
      dataEmissione: String(r.data_emissione ?? ""),
      anagraficaRagioneSociale: String(r.fornitore_ragione_sociale ?? ""),
      anagraficaCodiceTarga: String(r.fornitore_codice_targa ?? ""),
      totale: Number(r.totale) || 0,
    })),
  };
}

export async function getElaborazioneContabileAction(input: {
  kind: ElaborazioneContabileKind;
  anno: number;
  trimestre: TrimestreNumero;
}): Promise<ElaborazioneActionResult> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();

  const fatture = await loadFattureTrimestre(
    input.kind,
    input.anno,
    input.trimestre
  );
  if (!fatture.ok) return { success: false, error: fatture.error };

  const { data: elab, error: elabErr } = await supabase
    .from("elaborazioni_contabili")
    .select("*")
    .eq("kind", input.kind)
    .eq("anno", input.anno)
    .eq("trimestre", input.trimestre)
    .is("deleted_at", null)
    .maybeSingle();
  if (elabErr) return { success: false, error: elabErr.message };

  let vociDb: ElaborazioneContabileVoceRow[] = [];
  if (elab?.id) {
    const { data: voci, error: vociErr } = await supabase
      .from("elaborazioni_contabili_voci")
      .select("*")
      .eq("elaborazione_id", elab.id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true });
    if (vociErr) return { success: false, error: vociErr.message };
    vociDb = (voci ?? []) as ElaborazioneContabileVoceRow[];
  }

  return {
    success: true,
    elaborazione: buildElaborazioneView({
      kind: input.kind,
      anno: input.anno,
      trimestre: input.trimestre,
      elaborazione: (elab as ElaborazioneContabileRow | null) ?? null,
      vociDb,
      fatture: fatture.rows,
    }),
  };
}

export async function saveElaborazioneContabileAction(
  raw: unknown
): Promise<ElaborazioneActionResult> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = elaborazioneSaveSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati non validi.",
    };
  }
  const input = parsed.data;
  const supabase = await createClient();

  const fatture = await loadFattureTrimestre(
    input.kind,
    input.anno,
    input.trimestre
  );
  if (!fatture.ok) return { success: false, error: fatture.error };

  const allowed = new Set(fatture.rows.map((f) => f.id));
  for (const v of input.voci) {
    if (!allowed.has(v.fatturaId)) {
      return {
        success: false,
        error: "Una o più fatture non appartengono al trimestre selezionato.",
      };
    }
  }

  // Ordine canonico: data crescente come in lista trimestre
  const orderIndex = new Map(fatture.rows.map((f, i) => [f.id, i]));
  const vociOrdered = [...input.voci].sort(
    (a, b) =>
      (orderIndex.get(a.fatturaId) ?? 0) - (orderIndex.get(b.fatturaId) ?? 0)
  );
  const numbered = assignNumeriVignetta(vociOrdered);

  const { data: existing, error: findErr } = await supabase
    .from("elaborazioni_contabili")
    .select("*")
    .eq("kind", input.kind)
    .eq("anno", input.anno)
    .eq("trimestre", input.trimestre)
    .is("deleted_at", null)
    .maybeSingle();
  if (findErr) return { success: false, error: findErr.message };

  let elaborazioneId: string;
  let versione = 1;

  if (existing?.id) {
    versione = (existing.versione ?? 1) + 1;
    const { data: updated, error: upErr } = await supabase
      .from("elaborazioni_contabili")
      .update({
        note: input.note ?? "",
        versione,
        updated_by: auth.userId,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (upErr || !updated) {
      return {
        success: false,
        error: upErr?.message ?? "Aggiornamento elaborazione non riuscito.",
      };
    }
    elaborazioneId = updated.id;

    const nowIso = new Date().toISOString();
    await supabase
      .from("elaborazioni_contabili_voci")
      .update({
        deleted_at: nowIso,
        deleted_by: auth.userId,
        updated_by: auth.userId,
      })
      .eq("elaborazione_id", elaborazioneId)
      .is("deleted_at", null);
  } else {
    const insert: ElaborazioneContabileInsert = {
      kind: input.kind,
      anno: input.anno,
      trimestre: input.trimestre,
      documento_stato: "bozza",
      versione: 1,
      note: input.note ?? "",
      created_by: auth.userId,
      updated_by: auth.userId,
    };
    const { data: created, error: insErr } = await supabase
      .from("elaborazioni_contabili")
      .insert(insert)
      .select("*")
      .single();
    if (insErr || !created) {
      return {
        success: false,
        error: insErr?.message ?? "Creazione elaborazione non riuscita.",
      };
    }
    elaborazioneId = created.id;
  }

  const vociInsert: ElaborazioneContabileVoceInsert[] = numbered.map((v) => ({
    elaborazione_id: elaborazioneId,
    fattura_id: v.fatturaId,
    numera_con_vignetta: v.numeraConVignetta,
    numero_vignetta: v.numeroVignetta,
    sort_order: v.sortOrder,
    created_by: auth.userId,
    updated_by: auth.userId,
  }));

  if (vociInsert.length > 0) {
    const { error: vociErr } = await supabase
      .from("elaborazioni_contabili_voci")
      .insert(vociInsert);
    if (vociErr) {
      return { success: false, error: `Voci elaborazione: ${vociErr.message}` };
    }
  }

  await writeAuditLog({
    entity_type: "elaborazioni_contabili",
    entity_id: elaborazioneId,
    action: existing?.id ? "update" : "create",
    actor_id: auth.userId,
    summary: existing?.id
      ? `Aggiornata elaborazione contabile ${input.kind} ${input.anno}-T${input.trimestre} (v${versione})`
      : `Creata elaborazione contabile ${input.kind} ${input.anno}-T${input.trimestre}`,
    payload: {
      kind: input.kind,
      anno: input.anno,
      trimestre: input.trimestre,
      versione,
      voci: numbered.length,
      conVignetta: numbered.filter((v) => v.numeraConVignetta).length,
    },
  });

  return getElaborazioneContabileAction({
    kind: input.kind,
    anno: input.anno,
    trimestre: input.trimestre,
  });
}
