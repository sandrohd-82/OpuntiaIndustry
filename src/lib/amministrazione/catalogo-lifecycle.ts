import type { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";

export type CatalogoLifecycleKind = "servizio" | "prodotto" | "materia";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CodiceRiferimentoFattura = {
  fatturaId: string;
  numeroInterno: string;
  documentoStato: string;
  righe: number;
};

export type CodiceRiferimenti = {
  fatture: CodiceRiferimentoFattura[];
  fornitoriIds: string[];
  totalRefs: number;
};

function fornitoreArrayField(
  kind: CatalogoLifecycleKind
): "servizi_offerti" | "prodotti_fornitore" | "prodotti_acquistati" {
  if (kind === "servizio") return "servizi_offerti";
  if (kind === "prodotto") return "prodotti_fornitore";
  return "prodotti_acquistati";
}

export function catalogoTable(
  kind: CatalogoLifecycleKind
): "catalogo_servizi" | "catalogo_prodotti_fornitore" | "materie_prime" {
  if (kind === "servizio") return "catalogo_servizi";
  if (kind === "prodotto") return "catalogo_prodotti_fornitore";
  return "materie_prime";
}

/** Trova fatture ricevute e schede fornitore che usano il codice. */
export async function findCodiceRiferimenti(
  supabase: Supabase,
  codice: string,
  kind: CatalogoLifecycleKind
): Promise<CodiceRiferimenti> {
  const code = codice.trim();
  if (!code) {
    return { fatture: [], fornitoriIds: [], totalRefs: 0 };
  }

  const { data: righe } = await supabase
    .from("fatture_ricevute_righe")
    .select("fattura_id, codice")
    .ilike("codice", code);

  const fatturaIds = [
    ...new Set(
      ((righe ?? []) as Array<{ fattura_id: string; codice: string }>)
        .filter((r) => r.codice.trim().toLowerCase() === code.toLowerCase())
        .map((r) => r.fattura_id)
    ),
  ];

  const fatture: CodiceRiferimentoFattura[] = [];
  if (fatturaIds.length > 0) {
    const { data: docs } = await supabase
      .from("fatture_ricevute")
      .select("id, numero_interno, documento_stato")
      .in("id", fatturaIds)
      .is("deleted_at", null);
    const countByFat = new Map<string, number>();
    for (const r of (righe ?? []) as Array<{ fattura_id: string; codice: string }>) {
      if (r.codice.trim().toLowerCase() !== code.toLowerCase()) continue;
      countByFat.set(r.fattura_id, (countByFat.get(r.fattura_id) ?? 0) + 1);
    }
    for (const d of (docs ?? []) as Array<{
      id: string;
      numero_interno: string;
      documento_stato: string;
    }>) {
      fatture.push({
        fatturaId: d.id,
        numeroInterno: d.numero_interno,
        documentoStato: d.documento_stato,
        righe: countByFat.get(d.id) ?? 0,
      });
    }
  }

  const field = fornitoreArrayField(kind);
  const { data: fornitori } = await supabase
    .from("fornitori")
    .select(`id, ${field}`)
    .is("deleted_at", null)
    .contains(field, [code]);

  // contains is case-sensitive; also scan with filter if needed
  let fornitoriIds = ((fornitori ?? []) as Array<{ id: string }>).map((f) => f.id);

  if (fornitoriIds.length === 0) {
    const { data: allF } = await supabase
      .from("fornitori")
      .select(`id, ${field}`)
      .is("deleted_at", null);
    fornitoriIds = ((allF ?? []) as Array<Record<string, unknown>>)
      .filter((f) => {
        const arr = Array.isArray(f[field]) ? (f[field] as string[]) : [];
        return arr.some((c) => String(c).trim().toLowerCase() === code.toLowerCase());
      })
      .map((f) => String(f.id));
  }

  const totalRefs = fatture.length + fornitoriIds.length;
  return { fatture, fornitoriIds, totalRefs };
}

/** Rinomina codice su righe fattura + array schede fornitore. */
export async function cascadeRenameCodice(input: {
  supabase: Supabase;
  kind: CatalogoLifecycleKind;
  oldCodice: string;
  newCodice: string;
  newNome?: string;
  userId: string;
}): Promise<{ fattureAggiornate: number; fornitoriAggiornati: number }> {
  const oldC = input.oldCodice.trim();
  const newC = input.newCodice.trim();
  if (!oldC || !newC || oldC.toLowerCase() === newC.toLowerCase()) {
    // Solo nome: aggiorna descrizioni righe con quel codice
    if (input.newNome && oldC) {
      await input.supabase
        .from("fatture_ricevute_righe")
        .update({
          descrizione: input.newNome,
          updated_by: input.userId,
        })
        .ilike("codice", oldC);
    }
    return { fattureAggiornate: 0, fornitoriAggiornati: 0 };
  }

  const { data: righe } = await input.supabase
    .from("fatture_ricevute_righe")
    .select("id, fattura_id, codice")
    .ilike("codice", oldC);

  const matched = ((righe ?? []) as Array<{
    id: string;
    fattura_id: string;
    codice: string;
  }>).filter((r) => r.codice.trim().toLowerCase() === oldC.toLowerCase());

  const fatturaIds = [...new Set(matched.map((r) => r.fattura_id))];

  for (const r of matched) {
    const patch: Record<string, unknown> = {
      codice: newC,
      updated_by: input.userId,
    };
    if (input.newNome) patch.descrizione = input.newNome;
    await input.supabase
      .from("fatture_ricevute_righe")
      .update(patch)
      .eq("id", r.id);
  }

  if (fatturaIds.length > 0) {
    for (const fid of fatturaIds) {
      const { data: fat } = await input.supabase
        .from("fatture_ricevute")
        .select("versione")
        .eq("id", fid)
        .maybeSingle();
      const ver = Number((fat as { versione?: number } | null)?.versione) || 1;
      await input.supabase
        .from("fatture_ricevute")
        .update({
          versione: ver + 1,
          updated_by: input.userId,
        })
        .eq("id", fid)
        .is("deleted_at", null);
    }
  }

  const field = fornitoreArrayField(input.kind);
  const { data: fornitori } = await input.supabase
    .from("fornitori")
    .select(`id, ${field}`)
    .is("deleted_at", null);

  let fornitoriAggiornati = 0;
  for (const f of (fornitori ?? []) as Array<Record<string, unknown>>) {
    const arr = Array.isArray(f[field]) ? [...(f[field] as string[])] : [];
    let changed = false;
    const next = arr.map((c) => {
      if (String(c).trim().toLowerCase() === oldC.toLowerCase()) {
        changed = true;
        return newC;
      }
      return String(c);
    });
    if (!changed) continue;
    const uniq = [...new Set(next)];
    await input.supabase
      .from("fornitori")
      .update({
        [field]: uniq,
        updated_by: input.userId,
      })
      .eq("id", String(f.id));
    fornitoriAggiornati += 1;
  }

  await writeAuditLog({
    entity_type: catalogoTable(input.kind),
    entity_id: "cascade",
    action: "cascade_rename_codice",
    actor_id: input.userId,
    summary: `Cascade codice ${oldC} → ${newC}`,
    payload: {
      oldCodice: oldC,
      newCodice: newC,
      fatture: fatturaIds.length,
      fornitori: fornitoriAggiornati,
    },
  });

  return {
    fattureAggiornate: fatturaIds.length,
    fornitoriAggiornati,
  };
}

/** Riapre fatture collegate a bozza (per aggiornamento obbligatorio). */
export async function reopenFattureRicevuteToBozza(input: {
  supabase: Supabase;
  fatturaIds: string[];
  userId: string;
  motivo: string;
  codice: string;
}): Promise<number> {
  let n = 0;
  for (const id of input.fatturaIds) {
    const { data: fat } = await input.supabase
      .from("fatture_ricevute")
      .select("id, numero_interno, documento_stato, versione, note")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!fat) continue;
    const row = fat as {
      id: string;
      numero_interno: string;
      documento_stato: string;
      versione: number;
      note: string | null;
    };
    if (row.documento_stato === "bozza") {
      await input.supabase
        .from("fatture_ricevute")
        .update({
          richiede_aggiornamento_catalogo: true,
          codice_catalogo_pending: input.codice,
          updated_by: input.userId,
        })
        .eq("id", id);
      n += 1;
      continue;
    }
    const noteLine = `[Riaperta] Codice ${input.codice} in eliminazione — aggiornare le righe. ${input.motivo}`;
    const note = [row.note?.trim(), noteLine].filter(Boolean).join("\n");
    await input.supabase
      .from("fatture_ricevute")
      .update({
        documento_stato: "bozza",
        versione: (Number(row.versione) || 1) + 1,
        note,
        richiede_aggiornamento_catalogo: true,
        codice_catalogo_pending: input.codice,
        updated_by: input.userId,
      })
      .eq("id", id);
    await writeAuditLog({
      entity_type: "fatture_ricevute",
      entity_id: id,
      action: "reopen_bozza",
      actor_id: input.userId,
      summary: `Riaperta ${row.numero_interno} a bozza (eliminazione codice ${input.codice})`,
      payload: {
        codice: input.codice,
        da_stato: row.documento_stato,
        a_stato: "bozza",
      },
    });
    n += 1;
  }
  return n;
}

/** Rimuove il codice dagli array scheda fornitore (dopo soft delete o in pulizia). */
export async function removeCodiceFromFornitoriSchede(input: {
  supabase: Supabase;
  kind: CatalogoLifecycleKind;
  codice: string;
  userId: string;
}): Promise<number> {
  const code = input.codice.trim();
  const field = fornitoreArrayField(input.kind);
  const { data: fornitori } = await input.supabase
    .from("fornitori")
    .select(`id, ${field}`)
    .is("deleted_at", null);

  let n = 0;
  for (const f of (fornitori ?? []) as Array<Record<string, unknown>>) {
    const arr = Array.isArray(f[field]) ? (f[field] as string[]) : [];
    const next = arr.filter(
      (c) => String(c).trim().toLowerCase() !== code.toLowerCase()
    );
    if (next.length === arr.length) continue;
    await input.supabase
      .from("fornitori")
      .update({ [field]: next, updated_by: input.userId })
      .eq("id", String(f.id));
    n += 1;
  }
  return n;
}
