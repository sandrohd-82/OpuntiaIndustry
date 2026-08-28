import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { WEBMAIL_TRANSLATE_LANG_NAMES } from "@/lib/webmail/translate-langs";

function requireGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY non configurata. Impostala in .env.local / Vercel e ridéploya."
    );
  }
  return key;
}

export function webmailGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
}

const translateResultSchema = z.object({
  subject: z.string().nullable().optional(),
  body: z.string().min(1),
});

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

/**
 * Traduce oggetto/corpo mail con Gemini. Non modifica DB.
 */
export async function translateMailWithGemini(input: {
  subject?: string | null;
  bodyText: string;
  targetLang: string;
}): Promise<{
  subject: string | null;
  bodyText: string;
  model: string;
  targetLangLabel: string;
}> {
  const target =
    WEBMAIL_TRANSLATE_LANG_NAMES[input.targetLang] ||
    input.targetLang.trim() ||
    "Italiano";
  const modelName = webmailGeminiModel();
  const genAI = new GoogleGenerativeAI(requireGeminiKey());
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const body = input.bodyText.slice(0, 80_000);
  const subject = (input.subject ?? "").slice(0, 500);

  const prompt = `Sei un traduttore professionale per email commerciali.
Traduci il testo nella lingua: ${target} (codice: ${input.targetLang}).
Regole:
- Mantieni tono formale/professionale.
- Non aggiungere commenti, note o spiegazioni.
- Conserva nomi propri, email, URL, numeri, codici prodotto.
- Rispondi SOLO JSON: {"subject":"..."|null,"body":"..."}
- Se subject è vuoto o assente, subject = null.

OGGETTO:
${subject || "(vuoto)"}

CORPO:
${body}`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  const raw = result.response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonText(raw));
  } catch {
    throw new Error("Risposta Gemini non valida (JSON traduzione).");
  }
  const validated = translateResultSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("Traduzione Gemini incompleta o non valida.");
  }

  return {
    subject: validated.data.subject?.trim() || null,
    bodyText: validated.data.body.trim(),
    model: modelName,
    targetLangLabel: target,
  };
}

export {
  WEBMAIL_TRANSLATE_LANGS,
  type WebmailTranslateLangCode,
} from "@/lib/webmail/translate-langs";
