import { jsonrepair } from "jsonrepair";
import {
  geminiProducersResponseSchema,
  type geminiProducerSchema,
} from "@/lib/ai-scout/types";
import type { z } from "zod";

export type GeminiProducer = z.infer<typeof geminiProducerSchema>;

function requireGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY non configurata. Impostala in .env.local / Vercel e ridéploya."
    );
  }
  return key;
}

function geminiModelName(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
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

type GeminiGenerateResult = {
  text: string;
  model: string;
  groundingUsed: boolean;
};

/**
 * Chiama Gemini REST (v1beta). Prova prima con Google Search grounding;
 * se non supportato dal modello/account, ritenta senza grounding.
 */
async function generateGeminiContent(input: {
  system: string;
  user: string;
  temperature?: number;
  preferGrounding?: boolean;
}): Promise<GeminiGenerateResult> {
  const apiKey = requireGeminiKey();
  const model = geminiModelName();
  const preferGrounding = input.preferGrounding !== false;

  async function call(withGrounding: boolean): Promise<GeminiGenerateResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body: Record<string, unknown> = {
      systemInstruction: {
        parts: [{ text: input.system }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: input.user }],
        },
      ],
      generationConfig: {
        temperature: input.temperature ?? 0.35,
        responseMimeType: "application/json",
      },
    };
    if (withGrounding) {
      // Google Search grounding (Gemini 2.x)
      body.tools = [{ google_search: {} }];
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const rawBody = await res.text();
    if (!res.ok) {
      const err = new Error(
        `Gemini HTTP ${res.status}: ${rawBody.slice(0, 400)}`
      ) as Error & { status?: number; body?: string };
      err.status = res.status;
      err.body = rawBody;
      throw err;
    }

    const json = JSON.parse(rawBody) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        groundingMetadata?: unknown;
      }>;
    };
    const text =
      json.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim() ?? "";
    if (!text) {
      throw new Error("Gemini ha restituito una risposta vuota.");
    }
    const groundingUsed = Boolean(
      withGrounding && json.candidates?.[0]?.groundingMetadata
    );
    return { text, model, groundingUsed: groundingUsed || withGrounding };
  }

  if (!preferGrounding) {
    const r = await call(false);
    return { ...r, groundingUsed: false };
  }

  try {
    return await call(true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Grounding non disponibile / modello non supportato → fallback
    if (
      /400|404|INVALID_ARGUMENT|google_search|grounding|Tool/i.test(msg)
    ) {
      console.warn(
        "[ai-scout] grounding non disponibile, fallback senza search:",
        msg.slice(0, 200)
      );
      const r = await call(false);
      return { ...r, groundingUsed: false };
    }
    throw e;
  }
}

export async function scoutProducersWithGemini(input: {
  category: string;
  region: string;
  maxResults: number;
}): Promise<{
  producers: GeminiProducer[];
  model: string;
  groundingUsed: boolean;
  warning?: string;
}> {
  const system = `Sei un analista commerciale per OpuntiaIndustry / Agrinsicilia (cooperativa agroalimentare italiana).
Il tuo compito è individuare produttori/aziende agricole o artigianali REALI in Italia, utili come possibili fornitori o partner.
Rispondi SOLO con JSON valido nel formato:
{"producers":[{"company_name":"...","product_category":"...","location":"...","email":"...","website_or_social":"...","context_notes":"..."}]}
Regole:
- Massimo ${input.maxResults} risultati, preferisci qualità a quantità.
- Usa solo informazioni plausibili e verificabili (preferisci siti ufficiali, P.IVA pubbliche, fiere, camere di commercio).
- Se non conosci un'email pubblica certa, lascia email vuota (""). NON inventare indirizzi email.
- context_notes: 1-3 frasi su prodotti tipici, certificazioni, fiere, peculiarità.
- Non includere grandi GDO o multinazionali: privilegia PMI e produttori locali.
- Se non trovi abbastanza risultati reali, restituisci meno voci (mai inventare aziende).`;

  const user = `Cerca produttori nella categoria "${input.category}" nella regione/zona "${input.region}" (Italia).
Restituisci fino a ${input.maxResults} aziende con i campi richiesti.`;

  const result = await generateGeminiContent({
    system,
    user,
    temperature: 0.25,
    preferGrounding: true,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonText(result.text));
  } catch {
    parsed = JSON.parse(jsonrepair(extractJsonText(result.text)));
  }

  const validated = geminiProducersResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(
      "Risposta Gemini non valida (schema produttori). Riprova o riduci i risultati."
    );
  }

  const producers = validated.data.producers
    .map((p) => ({
      ...p,
      company_name: p.company_name.trim(),
      email: (p.email ?? "").trim(),
      product_category: (p.product_category || input.category).trim(),
      location: (p.location || input.region).trim(),
    }))
    .filter((p) => p.company_name.length > 0)
    .slice(0, input.maxResults);

  const warning = result.groundingUsed
    ? undefined
    : "Search grounding non attivo: verifica manualmente aziende ed email prima dell'invio.";

  return {
    producers,
    model: result.model,
    groundingUsed: result.groundingUsed,
    warning,
  };
}

export async function generateOutreachDraftWithGemini(input: {
  companyName: string;
  productCategory: string;
  location: string;
  contextNotes: string;
  websiteOrSocial: string;
}): Promise<{
  subject: string;
  body: string;
  model: string;
}> {
  const system = `Sei copywriter B2B per OpuntiaIndustry / Agrinsicilia.
Scrivi email di primo contatto brevi (max 120 parole), cordiali e professionali in italiano.
Messaggio chiave da includere in modo naturale:
- collaborazione diretta senza intermediari
- nessun costo di iscrizione / nessuna commissione sulle vendite per il produttore
- interesse concreto alla loro produzione tipica
Rispondi SOLO JSON: {"subject":"...","body":"..."}
Non inventare fatti non presenti nel contesto. Firma come "Team Commerciale OpuntiaIndustry".`;

  const user = `Azienda: ${input.companyName}
Categoria: ${input.productCategory}
Località: ${input.location}
Sito/social: ${input.websiteOrSocial || "(n/d)"}
Note contestuali: ${input.contextNotes || "(nessuna)"}`;

  const result = await generateGeminiContent({
    system,
    user,
    temperature: 0.55,
    preferGrounding: false,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonText(result.text));
  } catch {
    parsed = JSON.parse(jsonrepair(extractJsonText(result.text)));
  }

  const obj = parsed as { subject?: string; body?: string };
  const subject = String(obj.subject ?? "").trim();
  const body = String(obj.body ?? "").trim();
  if (!subject || !body) {
    throw new Error("Gemini non ha prodotto subject/body validi.");
  }
  return { subject, body, model: result.model };
}
