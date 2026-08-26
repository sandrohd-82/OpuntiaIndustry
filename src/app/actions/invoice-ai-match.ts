"use server";

import { scoreNomeAffinity } from "@/lib/amministrazione/catalogo-affinity";
import { AUTO_LINK_EXACT_MATCH_PCT } from "@/lib/amministrazione/catalogo-collega";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  matchInvoiceLinesWithGemini,
  type CatalogSnippet,
} from "@/lib/invoice-ai-match/gemini";
import {
  buildAiMatchData,
  invoiceAiMatchRequestSchema,
  type InvoiceAiMatchData,
  type InvoiceAiMatchResult,
  type InvoiceAiVerificationStatus,
} from "@/lib/invoice-ai-match/types";
import { generateSkuProposal } from "@/lib/sku-generator";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const CATALOG_HARD_CAP = 180;
const CANDIDATES_PER_LINE = 12;

async function loadCatalogSnippets(): Promise<CatalogSnippet[]> {
  const supabase = await createClient();
  const [servizi, prodotti, materie, contributi] = await Promise.all([
    supabase
      .from("catalogo_servizi")
      .select("id, codice, nome")
      .is("deleted_at", null)
      .limit(500),
    supabase
      .from("catalogo_prodotti_fornitore")
      .select("id, codice, nome")
      .is("deleted_at", null)
      .limit(800),
    supabase.from("materie_prime").select("id, codice, nome").limit(500),
    supabase
      .from("catalogo_contributi")
      .select("id, codice, nome")
      .is("deleted_at", null)
      .limit(200),
  ]);

  const out: CatalogSnippet[] = [];
  for (const r of servizi.data ?? []) {
    out.push({
      id: String(r.id),
      codice: String(r.codice ?? ""),
      nome: String(r.nome ?? ""),
      kind: "servizio",
    });
  }
  for (const r of prodotti.data ?? []) {
    out.push({
      id: String(r.id),
      codice: String(r.codice ?? ""),
      nome: String(r.nome ?? ""),
      kind: "prodotto",
    });
  }
  for (const r of materie.data ?? []) {
    out.push({
      id: String(r.id),
      codice: String(r.codice ?? ""),
      nome: String(r.nome ?? ""),
      kind: "materia",
    });
  }
  for (const r of contributi.data ?? []) {
    out.push({
      id: String(r.id),
      codice: String(r.codice ?? ""),
      nome: String(r.nome ?? ""),
      kind: "contributo",
    });
  }
  return out.filter((c) => c.codice && c.nome);
}

function pickRelevantCatalog(
  lines: Array<{ descrizione: string }>,
  catalog: CatalogSnippet[]
): CatalogSnippet[] {
  if (catalog.length <= CATALOG_HARD_CAP) return catalog;
  const scored = new Map<string, { item: CatalogSnippet; score: number }>();
  for (const line of lines) {
    const q = (line.descrizione ?? "").trim();
    if (!q) continue;
    for (const item of catalog) {
      const score = scoreNomeAffinity(q, item.nome);
      const prev = scored.get(item.id);
      if (!prev || score > prev.score) {
        scored.set(item.id, { item, score });
      }
    }
  }
  return [...scored.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, CATALOG_HARD_CAP)
    .map((x) => x.item);
}

function localMatchLine(
  line: {
    key: string;
    descrizione: string;
    codiceAttuale?: string;
  },
  catalog: CatalogSnippet[]
): InvoiceAiMatchResult {
  const desc = (line.descrizione ?? "").trim();
  const ranked = catalog
    .map((c) => ({
      c,
      score: scoreNomeAffinity(desc, c.nome),
    }))
    .filter((x) => x.score >= 40)
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATES_PER_LINE);

  const best = ranked[0];
  const uniqueExact =
    best &&
    best.score >= AUTO_LINK_EXACT_MATCH_PCT &&
    ranked.filter((r) => r.score >= AUTO_LINK_EXACT_MATCH_PCT).length === 1
      ? best
      : null;

  if (uniqueExact) {
    return {
      key: line.key,
      matched_product_id: uniqueExact.c.id,
      matched_codice: uniqueExact.c.codice,
      matched_nome: uniqueExact.c.nome,
      matched_kind: uniqueExact.c.kind,
      confidence_score: 100,
      suggested_internal_code: uniqueExact.c.codice,
      ai_reasoning: `Match locale esatto e univoco su «${uniqueExact.c.nome}» (${uniqueExact.c.codice}).`,
      verification_status: "AUTO_MATCHED",
    };
  }

  const sku = generateSkuProposal(desc || "articolo", best?.c.kind ?? "prodotto");
  if (best && best.score >= 55) {
    return {
      key: line.key,
      matched_product_id: best.c.id,
      matched_codice: best.c.codice,
      matched_nome: best.c.nome,
      matched_kind: best.c.kind,
      confidence_score: Math.round(best.score),
      suggested_internal_code: best.c.codice,
      ai_reasoning: `Affinità locale ${Math.round(best.score)}% con «${best.c.nome}». Verifica prima di confermare.`,
      verification_status: "NEEDS_REVIEW",
    };
  }

  return {
    key: line.key,
    matched_product_id: null,
    matched_codice: null,
    matched_nome: null,
    matched_kind: sku.kind,
    confidence_score: Math.max(0, Math.round(best?.score ?? 0)),
    suggested_internal_code: sku.codice,
    ai_reasoning:
      "Nessun match catalogo affidabile: proposta nuova targa interna da generatore SKU.",
    verification_status: "NEEDS_REVIEW",
  };
}

export type InvoiceAiMatchActionResult = InvoiceAiMatchResult & {
  ai_match_data: InvoiceAiMatchData;
};

export async function invoiceAiMatchAction(
  raw: unknown
): Promise<
  | {
      success: true;
      results: InvoiceAiMatchActionResult[];
      model: string;
      usedGemini: boolean;
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = invoiceAiMatchRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Payload non valido.",
    };
  }

  let catalog: CatalogSnippet[];
  try {
    catalog = await loadCatalogSnippets();
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Errore lettura catalogo.",
    };
  }

  const relevant = pickRelevantCatalog(parsed.data.lines, catalog);

  // Righe già con codice attuale in catalogo → skip AI se match esatto codice
  const catalogByCode = new Map(
    catalog.map((c) => [c.codice.trim().toLowerCase(), c])
  );

  const needsAi: typeof parsed.data.lines = [];
  const preResults: InvoiceAiMatchActionResult[] = [];

  for (const line of parsed.data.lines) {
    const code = (line.codiceAttuale ?? "").trim();
    if (code && code !== "—") {
      const hit = catalogByCode.get(code.toLowerCase());
      if (hit) {
        const result: InvoiceAiMatchResult = {
          key: line.key,
          matched_product_id: hit.id,
          matched_codice: hit.codice,
          matched_nome: hit.nome,
          matched_kind: hit.kind,
          confidence_score: 100,
          suggested_internal_code: hit.codice,
          ai_reasoning: `Codice riga già presente in catalogo (${hit.codice}).`,
          verification_status: "AUTO_MATCHED",
        };
        preResults.push({
          ...result,
          ai_match_data: buildAiMatchData(result, {
            model: "local-code",
            source: "auto_exact",
          }),
        });
        continue;
      }
    }
    needsAi.push(line);
  }

  let geminiResults: InvoiceAiMatchResult[] = [];
  let model = "local";
  let usedGemini = false;

  if (needsAi.length > 0) {
    if (!parsed.data.localOnly && process.env.GEMINI_API_KEY?.trim()) {
      try {
        const gem = await matchInvoiceLinesWithGemini({
          lines: needsAi,
          catalog: relevant,
        });
        geminiResults = gem.results;
        model = gem.model;
        usedGemini = true;
      } catch (e) {
        console.error("[invoice-ai-match] gemini fallback local", e);
        geminiResults = needsAi.map((l) => localMatchLine(l, relevant));
        model = "local-fallback";
      }
    } else {
      geminiResults = needsAi.map((l) => localMatchLine(l, relevant));
      model = parsed.data.localOnly
        ? "local-only"
        : "local-no-key";
    }
  }

  const aiMapped: InvoiceAiMatchActionResult[] = geminiResults.map((r) => ({
    ...r,
    ai_match_data: buildAiMatchData(r, {
      model,
      source: usedGemini ? "gemini" : "local",
    }),
  }));

  const results = [...preResults, ...aiMapped];

  await writeAuditLog({
    entity_type: "fatture_ricevute",
    entity_id: parsed.data.fatturaId ?? "draft",
    action: "invoice_ai_match",
    actor_id: auth.userId,
    summary: `AI match fattura: ${results.length} righe (gemini=${usedGemini})`,
    payload: {
      count: results.length,
      usedGemini,
      model,
      fornitoreId: parsed.data.fornitoreId ?? null,
    },
  });

  return { success: true, results, model, usedGemini };
}

const verifySchema = z.object({
  rigaId: z.string().uuid().optional(),
  fatturaId: z.string().uuid().optional(),
  key: z.string().optional(),
  verification_status: z.enum(["AUTO_MATCHED", "NEEDS_REVIEW", "VERIFIED"]),
  codice: z.string().trim().min(1).max(80).optional(),
  ai_match_data: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Persiste verifica AI su una riga già salvata (opzionale).
 */
export async function verifyInvoiceAiMatchRigaAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = verifySchema.safeParse(raw);
  if (!parsed.success || !parsed.data.rigaId) {
    return { success: false, error: "rigaId obbligatorio per persistenza." };
  }

  const supabase = await createClient();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    verification_status: parsed.data.verification_status as InvoiceAiVerificationStatus,
    updated_by: auth.userId,
  };
  if (parsed.data.verification_status === "VERIFIED") {
    patch.ai_verified_by = auth.userId;
    patch.ai_verified_at = now;
  }
  if (parsed.data.codice) patch.codice = parsed.data.codice;
  if (parsed.data.ai_match_data) patch.ai_match_data = parsed.data.ai_match_data;

  const { error } = await supabase
    .from("fatture_ricevute_righe")
    .update(patch)
    .eq("id", parsed.data.rigaId);
  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    entity_type: "fatture_ricevute_righe",
    entity_id: parsed.data.rigaId,
    action: "invoice_ai_verify",
    actor_id: auth.userId,
    summary: `Verifica AI riga → ${parsed.data.verification_status}`,
    payload: {
      codice: parsed.data.codice ?? null,
      status: parsed.data.verification_status,
    },
  });

  return { success: true };
}

const SCAN_CANDIDATE_MIN_EXCLUSIVE = 75;

const scanModificaSchema = z.object({
  descrizione: z.string().max(2000),
  quantita: z.number().finite().optional(),
  prezzoUnitario: z.number().finite().optional(),
  codiceAttuale: z.string().max(120).optional().default(""),
  fatturaId: z.string().uuid().nullable().optional(),
  fornitoreId: z.string().uuid().nullable().optional(),
});

export type ScanModificaCandidato = {
  id: string;
  codice: string;
  nome: string;
  kind: "servizio" | "prodotto" | "materia" | "contributo";
  score: number;
  source: "local" | "gemini";
};

/**
 * Scan on-demand da modal Modifica: candidati catalogo con score > 75%
 * (affinità locale + eventuale Gemini).
 */
export async function scanModificaArticoloRigaAction(
  raw: unknown
): Promise<
  | {
      success: true;
      candidates: ScanModificaCandidato[];
      geminiReasoning: string | null;
      suggestedCode: string | null;
      model: string;
      usedGemini: boolean;
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = scanModificaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Payload non valido.",
    };
  }

  const desc = parsed.data.descrizione.trim();
  if (!desc) {
    return { success: false, error: "Descrizione riga vuota." };
  }

  let catalog: CatalogSnippet[];
  try {
    catalog = await loadCatalogSnippets();
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Errore lettura catalogo.",
    };
  }

  const relevant = pickRelevantCatalog([{ descrizione: desc }], catalog);
  const byId = new Map<string, ScanModificaCandidato>();

  for (const c of catalog) {
    const score = Math.max(
      scoreNomeAffinity(desc, c.nome),
      scoreNomeAffinity(desc, c.codice)
    );
    if (score <= SCAN_CANDIDATE_MIN_EXCLUSIVE) continue;
    const prev = byId.get(c.id);
    if (!prev || score > prev.score) {
      byId.set(c.id, {
        id: c.id,
        codice: c.codice,
        nome: c.nome,
        kind: c.kind,
        score: Math.round(score),
        source: "local",
      });
    }
  }

  let geminiReasoning: string | null = null;
  let suggestedCode: string | null = null;
  let model = "local";
  let usedGemini = false;

  const lineKey = "modifica";
  if (process.env.GEMINI_API_KEY?.trim()) {
    try {
      const gem = await matchInvoiceLinesWithGemini({
        lines: [
          {
            key: lineKey,
            descrizione: desc,
            quantita: parsed.data.quantita,
            prezzoUnitario: parsed.data.prezzoUnitario,
            codiceFornitore: "",
            codiceAttuale: parsed.data.codiceAttuale ?? "",
          },
        ],
        catalog: relevant,
      });
      usedGemini = true;
      model = gem.model;
      const hit = gem.results.find((r) => r.key === lineKey) ?? gem.results[0];
      if (hit) {
        geminiReasoning = hit.ai_reasoning;
        suggestedCode = hit.suggested_internal_code;
        if (
          hit.matched_product_id &&
          hit.confidence_score > SCAN_CANDIDATE_MIN_EXCLUSIVE
        ) {
          const cat = catalog.find((c) => c.id === hit.matched_product_id);
          if (cat) {
            const score = Math.round(hit.confidence_score);
            const prev = byId.get(cat.id);
            if (!prev || score > prev.score) {
              byId.set(cat.id, {
                id: cat.id,
                codice: cat.codice,
                nome: cat.nome,
                kind: cat.kind,
                score,
                source: "gemini",
              });
            } else {
              byId.set(cat.id, { ...prev, source: "gemini" });
            }
          }
        }
      }
    } catch (e) {
      console.error("[scan-modifica] gemini", e);
      model = "local-fallback";
      const local = localMatchLine(
        { key: lineKey, descrizione: desc, codiceAttuale: parsed.data.codiceAttuale },
        relevant
      );
      geminiReasoning = local.ai_reasoning;
      suggestedCode = local.suggested_internal_code;
    }
  } else {
    const local = localMatchLine(
      { key: lineKey, descrizione: desc, codiceAttuale: parsed.data.codiceAttuale },
      relevant
    );
    geminiReasoning = local.ai_reasoning;
    suggestedCode = local.suggested_internal_code;
    model = "local-no-key";
  }

  const candidates = [...byId.values()].sort((a, b) => b.score - a.score);

  await writeAuditLog({
    entity_type: "fatture_ricevute",
    entity_id: parsed.data.fatturaId ?? "draft",
    action: "invoice_ai_scan_modifica",
    actor_id: auth.userId,
    summary: `Scan modifica riga: ${candidates.length} candidati >${SCAN_CANDIDATE_MIN_EXCLUSIVE}%`,
    payload: {
      candidates: candidates.length,
      usedGemini,
      model,
      fornitoreId: parsed.data.fornitoreId ?? null,
    },
  });

  return {
    success: true,
    candidates,
    geminiReasoning,
    suggestedCode,
    model,
    usedGemini,
  };
}
