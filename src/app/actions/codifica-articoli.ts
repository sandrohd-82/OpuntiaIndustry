"use server";

import {
  CODIFICA_SIMILARITY_THRESHOLD_PCT,
  confirmCodificaArticoloSchema,
  type CatalogoMatchHit,
  type ConfirmCodificaArticoloInput,
} from "@/lib/amministrazione/codifica-articoli";
import {
  isValidCatalogoCodice,
  normalizeCatalogoInput,
} from "@/lib/amministrazione/catalogo-offerta";
import {
  isValidCodiceMateriaPrima,
  normalizeMateriaPrimaInput,
} from "@/lib/amministrazione/materie-prime";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import {
  catalogoKindPrefix,
  normalizeInvoiceLineText,
} from "@/lib/sku-generator";
import {
  syncFornitoreSchedaDaCodici,
  syncFornitoreSchedaFromFatturaRicevutaId,
} from "@/app/actions/fatture";

type RpcMatchRow = {
  catalogo_kind: string;
  catalogo_id: string;
  codice: string;
  nome: string;
  affinita_percentuale: number | string;
};

function mapMatch(row: RpcMatchRow): CatalogoMatchHit | null {
  const kind = row.catalogo_kind;
  if (kind !== "servizio" && kind !== "prodotto" && kind !== "materia") {
    return null;
  }
  return {
    catalogoKind: kind,
    catalogoId: row.catalogo_id,
    codice: row.codice,
    nome: row.nome,
    affinitaPercentuale: Number(row.affinita_percentuale) || 0,
  };
}

export async function matchCatalogoAcquistiAction(
  query: string,
  thresholdPct: number = CODIFICA_SIMILARITY_THRESHOLD_PCT
): Promise<
  | { success: true; matches: CatalogoMatchHit[]; requiresReview: boolean }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const q = query.trim();
  if (!q) {
    return { success: true, matches: [], requiresReview: false };
  }

  const supabase = await createClient();
  const threshold = Math.min(1, Math.max(0, thresholdPct / 100));
  const { data, error } = await supabase.rpc("match_catalogo_acquisti", {
    p_query: q,
    p_threshold: threshold,
    p_limit: 12,
  });

  if (error) {
    console.error("[codifica] match_catalogo_acquisti", error.message);
    return { success: false, error: error.message };
  }

  const matches = ((data ?? []) as RpcMatchRow[])
    .map(mapMatch)
    .filter((m): m is CatalogoMatchHit => Boolean(m));

  return {
    success: true,
    matches,
    requiresReview: matches.some(
      (m) => m.affinitaPercentuale >= thresholdPct
    ),
  };
}

export async function confirmCodificaArticoloAction(
  raw: ConfirmCodificaArticoloInput
): Promise<
  | {
      success: true;
      codice: string;
      catalogoId: string | null;
      catalogoKind: "servizio" | "prodotto" | "materia";
      nome: string;
      auditId: string;
      created: boolean;
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = confirmCodificaArticoloSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dati codifica non validi.",
    };
  }
  const input = parsed.data;
  const supabase = await createClient();
  const testoNormalizzato =
    input.testoNormalizzato?.trim() ||
    normalizeInvoiceLineText(input.testoOriginale);
  const nomeArticolo =
    input.nomeArticolo?.trim() ||
    testoNormalizzato ||
    input.testoOriginale.trim();

  let catalogoId = input.catalogoId ?? null;
  let codice = input.codiceAssegnato.trim();
  let created = false;

  if (input.azione === "associa_esistente") {
    if (!catalogoId) {
      return {
        success: false,
        error: "Seleziona un articolo esistente da associare.",
      };
    }
    const table =
      input.catalogoKind === "servizio"
        ? "catalogo_servizi"
        : input.catalogoKind === "materia"
          ? "materie_prime"
          : "catalogo_prodotti_fornitore";
    const { data: row, error } = await supabase
      .from(table)
      .select("id, codice, nome")
      .eq("id", catalogoId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!row) {
      return { success: false, error: "Articolo catalogo non trovato." };
    }
    codice = String(row.codice);
  } else {
    const prefix = catalogoKindPrefix(input.catalogoKind);
    if (!codice.toLowerCase().startsWith(prefix.toLowerCase())) {
      codice = `${prefix}${codice.replace(/^Sz|^Pr|^Mp/i, "")}`;
    }

    if (input.catalogoKind === "materia") {
      const normalized = normalizeMateriaPrimaInput({
        codice,
        nome: nomeArticolo,
        note: input.note ?? `Codificato da fattura ricevuta`,
        isBio: Boolean(input.isBio),
      });
      if (!isValidCodiceMateriaPrima(normalized.codice)) {
        return {
          success: false,
          error: `Codice materia non valido (atteso ${prefix}…).`,
        };
      }
      const { data, error } = await supabase
        .from("materie_prime")
        .insert({
          codice: normalized.codice,
          nome: normalized.nome,
          note: normalized.note,
          is_bio: normalized.isBio,
          created_by: auth.userId,
          updated_by: auth.userId,
        })
        .select("id, codice, nome")
        .single();
      if (error) return { success: false, error: error.message };
      catalogoId = data.id;
      codice = data.codice;
      created = true;
      await writeAuditLog({
        entity_type: "materie_prime",
        entity_id: data.id,
        action: "create",
        actor_id: auth.userId,
        summary: `Materia codificata da fattura ricevuta: ${data.codice}`,
        payload: {
          source: "codifica_fattura_ricevuta",
          codice: data.codice,
          nome: data.nome,
        },
      });
    } else {
      const kind =
        input.catalogoKind === "servizio" ? "servizio" : "prodotto";
      const normalized = normalizeCatalogoInput(kind, {
        codice,
        nome: nomeArticolo,
        note: input.note ?? `Codificato da fattura ricevuta`,
        isBio: Boolean(input.isBio),
      });
      if (!isValidCatalogoCodice(kind, normalized.codice)) {
        return {
          success: false,
          error: `Codice non valido (atteso ${prefix}…).`,
        };
      }
      const table =
        kind === "servizio" ? "catalogo_servizi" : "catalogo_prodotti_fornitore";
      const { data, error } = await supabase
        .from(table)
        .insert({
          codice: normalized.codice,
          nome: normalized.nome,
          note: normalized.note,
          is_bio: normalized.isBio,
          created_by: auth.userId,
          updated_by: auth.userId,
        })
        .select("id, codice, nome")
        .single();
      if (error) return { success: false, error: error.message };
      catalogoId = data.id;
      codice = data.codice;
      created = true;
      await writeAuditLog({
        entity_type: table,
        entity_id: data.id,
        action: "create",
        actor_id: auth.userId,
        summary: `Catalogo ${kind} codificato da fattura ricevuta: ${data.codice}`,
        payload: {
          source: "codifica_fattura_ricevuta",
          codice: data.codice,
          nome: data.nome,
        },
      });
    }
  }

  const { data: auditRow, error: auditError } = await supabase
    .from("fatture_ricevute_codifica_articoli")
    .insert({
      fattura_ricevuta_id: input.fatturaRicevutaId ?? null,
      fattura_riga_id: input.fatturaRigaId ?? null,
      testo_originale: input.testoOriginale.trim(),
      testo_normalizzato: testoNormalizzato,
      codice_assegnato: codice,
      catalogo_kind: input.catalogoKind,
      catalogo_id: catalogoId,
      affinita_percentuale:
        input.affinitaPercentuale != null
          ? Number(input.affinitaPercentuale)
          : null,
      azione: input.azione,
      note: input.note?.trim() ?? "",
      created_by: auth.userId,
    })
    .select("id")
    .single();

  if (auditError) {
    console.error("[codifica] audit insert", auditError.message);
    return { success: false, error: auditError.message };
  }

  await writeAuditLog({
    entity_type: "fatture_ricevute_codifica_articoli",
    entity_id: auditRow.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Codifica articolo ${codice} (${input.azione})`,
    payload: {
      azione: input.azione,
      codice,
      catalogoKind: input.catalogoKind,
      catalogoId,
      affinitaPercentuale: input.affinitaPercentuale ?? null,
    },
  });

  if (input.fatturaRicevutaId) {
    try {
      await syncFornitoreSchedaFromFatturaRicevutaId({
        fatturaRicevutaId: input.fatturaRicevutaId,
        userId: auth.userId,
      });
      const { data: fat } = await supabase
        .from("fatture_ricevute")
        .select("fornitore_id, numero_interno")
        .eq("id", input.fatturaRicevutaId)
        .maybeSingle();
      if (fat?.fornitore_id) {
        await syncFornitoreSchedaDaCodici({
          fornitoreId: String(fat.fornitore_id),
          codici: [codice],
          userId: auth.userId,
          fatturaId: input.fatturaRicevutaId,
          numeroInterno: String(fat.numero_interno ?? ""),
        });
      }
    } catch (e) {
      console.error(
        "[codifica] sync scheda fornitore",
        e instanceof Error ? e.message : e
      );
    }
  }

  return {
    success: true,
    codice,
    catalogoId,
    catalogoKind: input.catalogoKind,
    nome: nomeArticolo,
    auditId: auditRow.id,
    created,
  };
}
