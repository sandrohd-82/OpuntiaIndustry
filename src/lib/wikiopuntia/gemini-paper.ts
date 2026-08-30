import { GoogleGenerativeAI } from "@google/generative-ai";
import { jsonrepair } from "jsonrepair";
import { z } from "zod";
import {
  WIKI_APPLICAZIONI,
  WIKI_PAPER_CATEGORIES,
  WIKI_PLANT_PARTS,
} from "@/lib/ecosystem/wiki";

function requireGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY non configurata. Impostala in .env.local / Vercel."
    );
  }
  return key;
}

export function wikiPaperGeminiModel(): string {
  return (
    process.env.WIKI_GEMINI_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    "gemini-2.0-flash"
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

const extractedPaperSchema = z.object({
  title: z.string().trim().min(1).max(500),
  abstract: z.string().trim().max(20000).default(""),
  authors: z.array(z.string().trim().min(1)).max(40).default([]),
  publication_year: z.number().int().min(1900).max(2100),
  plant_parts: z.array(z.enum(WIKI_PLANT_PARTS)).max(3).default([]),
  sectors: z.array(z.enum(WIKI_APPLICAZIONI)).max(7).default([]),
  category: z.enum(WIKI_PAPER_CATEGORIES).optional().default("Agronomia"),
  keywords: z.array(z.string().trim().min(1)).max(40).default([]),
  ai_summary: z.string().trim().max(8000).default(""),
});

export type ExtractedWikiPaper = z.infer<typeof extractedPaperSchema>;

export async function extractWikiPaperWithGemini(
  pdfBytes: Buffer
): Promise<{ data: ExtractedWikiPaper; model: string }> {
  const modelName = wikiPaperGeminiModel();
  const genAI = new GoogleGenerativeAI(requireGeminiKey());
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: "application/pdf",
        data: pdfBytes.toString("base64"),
      },
    },
    {
      text: `Sei un catalogatore scientifico per WikiOpuntia (Opuntia ficus-indica).
Estrai SOLO un JSON con:
- title: titolo originale della ricerca
- abstract: abstract originale (se assente, stringa vuota)
- authors: array di nomi autori
- publication_year: anno di pubblicazione (numero)
- plant_parts: array con UNA O PIÙ tra: cladodes, fruits, flowers
  (riferimento botanico: cladodi / frutti / fiori). Se il paper riguarda la pianta in generale, includi tutte e tre.
- sectors: array con UNA O PIÙ tra: nutrace, pharma, food, cosmetic, veterina, technical, other
  (applicazione: nutraceutico, farmaceutico, alimentare, cosmetico, veterinario, tecnico, altro).
- category: una sola vetrina tra ${WIKI_PAPER_CATEGORIES.join(" | ")} (derivata dai sectors)
- keywords: 3-8 tag principali
- ai_summary: sintesi divulgativa in elenco puntato (italiano), max 8 punti
Niente testo fuori dal JSON.`,
    },
  ]);

  const raw = extractJsonText(result.response.text() || "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = JSON.parse(jsonrepair(raw));
  }
  return { data: extractedPaperSchema.parse(parsed), model: modelName };
}
