import { GoogleGenerativeAI } from "@google/generative-ai";
import { jsonrepair } from "jsonrepair";
import { z } from "zod";
import {
  invoiceAiMatchResultSchema,
  type InvoiceAiMatchLineInput,
  type InvoiceAiMatchResult,
} from "@/lib/invoice-ai-match/types";
import {
  catalogoKindPrefix,
  generateSkuProposal,
  type CatalogoAcquistoKind,
} from "@/lib/sku-generator";

export type CatalogSnippet = {
  id: string;
  codice: string;
  nome: string;
  kind: CatalogoAcquistoKind;
};

function requireGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY non configurata. Impostala in .env.local / Vercel e ridéploya."
    );
  }
  return key;
}

export function invoiceAiGeminiModel(): string {
  return (
    process.env.GEMINI_MODEL?.trim() ||
    process.env.INVOICE_AI_GEMINI_MODEL?.trim() ||
    "gemini-3.6-flash"
  );
}

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

const geminiBatchSchema = z.object({
  matches: z.array(
    z.object({
      key: z.string(),
      matched_product_id: z.string().nullable().optional(),
      confidence_score: z.number().min(0).max(100),
      suggested_internal_code: z.string().nullable().optional(),
      ai_reasoning: z.string().max(2000),
      suggested_kind: z
        .enum(["servizio", "prodotto", "materia", "contributo"])
        .nullable()
        .optional(),
    })
  ),
});

/**
 * Match Gemini sulle righe fattura vs catalogo (snippet già filtrato).
 * Usa @google/generative-ai; modello da GEMINI_MODEL (default gemini-3.6-flash).
 */
export async function matchInvoiceLinesWithGemini(input: {
  lines: InvoiceAiMatchLineInput[];
  catalog: CatalogSnippet[];
}): Promise<{ results: InvoiceAiMatchResult[]; model: string }> {
  const modelName = invoiceAiGeminiModel();
  const genAI = new GoogleGenerativeAI(requireGeminiKey());
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.15,
      responseMimeType: "application/json",
    },
  });

  const catalogById = new Map(input.catalog.map((c) => [c.id, c]));
  const catalogByCode = new Map(
    input.catalog.map((c) => [c.codice.trim().toLowerCase(), c])
  );

  const system = `Sei l'assistente di riconciliazione acquisti di OpuntiaIndustry (ERP).
Confronta ogni riga fattura fornitore con il catalogo interno (Sz=servizi, Pr=prodotti, Mp=materie, Ct=contributi).
Regole:
- matched_product_id: SOLO un id presente nel catalogo fornito, oppure null.
- confidence_score 100 solo se corrispondenza univoca e certa sul significato.
- Se confidence < 100: matched_product_id può essere il candidato migliore o null; suggested_internal_code deve essere una targa nuova stile Prefisso+blocchi (es. PrMIS-SOL-PH4-5DL, SzTRA-COR-STD-STD, MpOLI-EVO-BIO-5LT).
- Non inventare id catalogo.
- ai_reasoning: 1-3 frasi in italiano, chiare per un operatore.
Rispondi SOLO JSON: {"matches":[{"key":"...","matched_product_id":null|"uuid","confidence_score":0-100,"suggested_internal_code":null|"...","suggested_kind":"prodotto"|"servizio"|"materia"|"contributo"|null,"ai_reasoning":"..."}]}`;

  const user = JSON.stringify({
    lines: input.lines.map((l) => ({
      key: l.key,
      descrizione: l.descrizione,
      quantita: l.quantita ?? null,
      prezzo_unitario: l.prezzoUnitario ?? null,
      codice_fornitore: l.codiceFornitore || null,
      codice_attuale: l.codiceAttuale || null,
    })),
    catalog: input.catalog.map((c) => ({
      id: c.id,
      codice: c.codice,
      nome: c.nome,
      kind: c.kind,
    })),
  });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: `${system}\n\nDATI:\n${user}` }],
      },
    ],
  });

  const text = result.response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonText(text));
  } catch {
    parsed = JSON.parse(jsonrepair(extractJsonText(text)));
  }

  const validated = geminiBatchSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("Risposta Gemini non valida per il match fatture.");
  }

  const byKey = new Map(validated.data.matches.map((m) => [m.key, m]));
  const results: InvoiceAiMatchResult[] = input.lines.map((line) => {
    const raw = byKey.get(line.key);
    if (!raw) {
      const sku = generateSkuProposal(line.descrizione, "prodotto");
      return invoiceAiMatchResultSchema.parse({
        key: line.key,
        matched_product_id: null,
        matched_codice: null,
        matched_nome: null,
        matched_kind: null,
        confidence_score: 0,
        suggested_internal_code: sku.codice,
        ai_reasoning:
          "Gemini non ha restituito un match per questa riga. Proposta targa locale.",
        verification_status: "NEEDS_REVIEW",
      });
    }

    let catalogHit =
      (raw.matched_product_id &&
        catalogById.get(String(raw.matched_product_id))) ||
      null;
    if (!catalogHit && raw.suggested_internal_code) {
      catalogHit =
        catalogByCode.get(raw.suggested_internal_code.trim().toLowerCase()) ??
        null;
    }

    const score = Math.round(raw.confidence_score);
    const kind =
      (raw.suggested_kind as CatalogoAcquistoKind | null) ||
      catalogHit?.kind ||
      "prodotto";

    let suggested = (raw.suggested_internal_code ?? "").trim() || null;
    if (score >= 100 && catalogHit) {
      suggested = catalogHit.codice;
    } else if (!suggested || score < 100) {
      if (!suggested || !/^(Sz|Pr|Mp|Ct)/i.test(suggested)) {
        const sku = generateSkuProposal(line.descrizione, kind);
        suggested = sku.codice;
      } else {
        // Normalizza prefisso
        const prefix = catalogoKindPrefix(kind);
        if (!suggested.startsWith(prefix)) {
          suggested = `${prefix}${suggested.replace(/^(Sz|Pr|Mp|Ct)/i, "")}`;
        }
      }
    }

    const verification_status =
      score >= 100 && catalogHit ? "AUTO_MATCHED" : "NEEDS_REVIEW";

    return invoiceAiMatchResultSchema.parse({
      key: line.key,
      matched_product_id: catalogHit?.id ?? null,
      matched_codice: catalogHit?.codice ?? null,
      matched_nome: catalogHit?.nome ?? null,
      matched_kind: catalogHit?.kind ?? kind,
      confidence_score: score,
      suggested_internal_code: suggested,
      ai_reasoning: raw.ai_reasoning.trim() || "Nessuna spiegazione.",
      verification_status,
    });
  });

  return { results, model: modelName };
}
