import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { labelLingua } from "@/lib/ecosystem/geo-nazioni";

export type TestoIntercomunicazione = {
  key: string;
  text: string;
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

function modelChain(): string[] {
  const primary =
    process.env.GEMINI_MODEL?.trim() ||
    process.env.INVOICE_AI_GEMINI_MODEL?.trim() ||
    "gemini-3.6-flash";
  const invoice = process.env.INVOICE_AI_GEMINI_MODEL?.trim();
  const extra = (process.env.GEMINI_MODEL_FALLBACKS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const defaults = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-flash-latest",
  ];
  return [
    ...new Set(
      [primary, invoice, ...extra, ...defaults].filter(
        (item): item is string => Boolean(item)
      )
    ),
  ];
}

function isGeminiBusyError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /503|429|404|high demand|unavailable|overloaded|try again later|resource.?exhausted|not found|not supported/i.test(
    msg
  );
}

function friendlyGeminiError(e: unknown): Error {
  if (isGeminiBusyError(e)) {
    return new Error(
      "Il servizio di traduzione è momentaneamente saturo. Riprova tra poco."
    );
  }
  return e instanceof Error ? e : new Error("Traduzione non riuscita.");
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

const resultSchema = z.object({
  items: z.array(
    z.object({
      key: z.string(),
      text: z.string(),
    })
  ),
});

/**
 * Traduce testi liberi nella lingua del cliente.
 * Non traduce numeri, prezzi, codici, partite IVA, targhe, email e URL.
 * Non scrive nulla su database.
 */
export async function traduciTestiIntercomunicazione(input: {
  lingua: string;
  testi: TestoIntercomunicazione[];
}): Promise<TestoIntercomunicazione[]> {
  const daTradurre = input.testi.filter((item) => item.text.trim());
  if (daTradurre.length === 0) {
    throw new Error("Non c'è testo da tradurre.");
  }
  const linguaLabel = labelLingua(input.lingua);
  const genAI = new GoogleGenerativeAI(requireGeminiKey());
  const payload = daTradurre.map((item) => ({
    key: item.key,
    text: item.text.slice(0, 8000),
  }));
  const prompt = `Sei un traduttore per documenti commerciali e email.
Traduci ogni testo in ${linguaLabel} (codice ${input.lingua}).
Regole:
- Mantieni il tono professionale.
- Non tradurre numeri, prezzi, valute, quantità, codici, SKU, partite IVA, codici fiscali, targhe, IBAN, email, URL e nomi propri di aziende o persone.
- Non aggiungere commenti.
- Restituisci SOLO JSON: {"items":[{"key":"...","text":"..."}]}
- Usa esattamente le stesse key ricevute.

TESTI:
${JSON.stringify({ items: payload })}`;

  const models = modelChain();
  let lastBusy: unknown = null;
  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      });
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });
      let parsed: unknown;
      try {
        parsed = JSON.parse(extractJsonText(result.response.text()));
      } catch {
        throw new Error("Risposta di traduzione non valida.");
      }
      const validated = resultSchema.safeParse(parsed);
      if (!validated.success) {
        throw new Error("Traduzione incompleta.");
      }
      const byKey = new Map(
        validated.data.items.map((item) => [item.key, item.text.trim()])
      );
      const mancanti = daTradurre.filter((item) => !byKey.get(item.key));
      if (mancanti.length > 0) {
        throw new Error("Traduzione incompleta.");
      }
      return daTradurre.map((item) => ({
        key: item.key,
        text: byKey.get(item.key) ?? item.text,
      }));
    } catch (e) {
      if (isGeminiBusyError(e)) {
        lastBusy = e;
        continue;
      }
      throw friendlyGeminiError(e);
    }
  }
  throw friendlyGeminiError(lastBusy);
}
