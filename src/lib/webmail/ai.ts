import type { WebmailIntent } from "@/lib/webmail/types";

export type ClassifyResult = {
  intent: WebmailIntent;
  confidence: number;
  productQuery: string | null;
  referentName: string | null;
  modelName: string;
  rationale: string;
};

function heuristicClassify(subject: string, body: string): ClassifyResult {
  const text = `${subject}\n${body}`.toLowerCase();
  let intent: WebmailIntent = "generico";
  let confidence = 45;
  if (
    /scheda\s*tecnic|datasheet|specifiche\s*tecnic|scheda\s*prodotto/.test(text)
  ) {
    intent = "scheda_tecnica";
    confidence = 78;
  } else if (
    /preventiv|listino|quotaz|prezzo|offerta\s*econom/.test(text)
  ) {
    intent = "preventivo_listino";
    confidence = 76;
  } else if (/ordine|lotto|tracking|spediz|consegna/.test(text)) {
    intent = "ordine_lotto";
    confidence = 72;
  } else if (/unsubscribe|viagra|crypto\s*invest|lottery/.test(text)) {
    intent = "scartate";
    confidence = 70;
  }
  if (confidence < 55) intent = "da_revisionare";
  return {
    intent,
    confidence,
    productQuery: null,
    referentName: null,
    modelName: "heuristic",
    rationale: "Classificazione euristica (LLM non configurato o fallback).",
  };
}

/**
 * Classifica intent email. Usa OpenAI se OPENAI_API_KEY presente, altrimenti euristica.
 */
export async function classifyInboundEmail(input: {
  subject: string;
  bodyText: string;
  fromName: string;
}): Promise<ClassifyResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || process.env.WEBMAIL_AI_ENABLED === "false") {
    return heuristicClassify(input.subject, input.bodyText);
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const system = `Sei l'assistente commerciale di una cooperativa agricola (OpuntiaIndustry).
Classifica l'email inbound in UNO di questi intent:
- scheda_tecnica
- preventivo_listino
- ordine_lotto
- generico
- da_revisionare
- scartate
Rispondi SOLO JSON valido:
{"intent":"...","confidence":0-100,"productQuery":"string|null","referentName":"string|null","rationale":"..."}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `Da: ${input.fromName}\nOggetto: ${input.subject}\n\n${input.bodyText.slice(0, 6000)}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error("[webmail ai]", await res.text());
      return heuristicClassify(input.subject, input.bodyText);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      intent?: string;
      confidence?: number;
      productQuery?: string | null;
      referentName?: string | null;
      rationale?: string;
    };
    const intent = (
      [
        "scheda_tecnica",
        "preventivo_listino",
        "ordine_lotto",
        "generico",
        "da_revisionare",
        "scartate",
      ].includes(String(parsed.intent))
        ? parsed.intent
        : "da_revisionare"
    ) as WebmailIntent;
    const confidence = Math.min(
      100,
      Math.max(0, Number(parsed.confidence) || 0)
    );
    return {
      intent: confidence < 50 ? "da_revisionare" : intent,
      confidence,
      productQuery: parsed.productQuery?.trim() || null,
      referentName: parsed.referentName?.trim() || input.fromName || null,
      modelName: model,
      rationale: parsed.rationale?.trim() || "",
    };
  } catch (e) {
    console.error("[webmail ai classify]", e);
    return heuristicClassify(input.subject, input.bodyText);
  }
}

export async function generateDraftReply(input: {
  intent: WebmailIntent;
  subject: string;
  bodyText: string;
  fromName: string;
  referentName: string | null;
  ragContext: string;
}): Promise<{ subject: string; bodyText: string; modelName: string }> {
  const referente =
    input.referentName?.trim() ||
    input.fromName.trim() ||
    "Gentile Cliente";
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  if (!apiKey || process.env.WEBMAIL_AI_ENABLED === "false") {
    const body = [
      `Gentile ${referente},`,
      "",
      "grazie per la Sua comunicazione.",
      "",
      input.ragContext
        ? `In riferimento alla Sua richiesta:\n${input.ragContext}`
        : "Abbiamo preso in carico la Sua richiesta e Le risponderemo al più presto con le informazioni necessarie.",
      "",
      "Restiamo a disposizione per ogni chiarimento.",
      "",
      "Cordiali saluti,",
      "Cooperativa Agricola — Ufficio Commerciale",
      "OpuntiaIndustry",
    ].join("\n");
    return {
      subject: input.subject.toLowerCase().startsWith("re:")
        ? input.subject
        : `Re: ${input.subject || "Sua richiesta"}`,
      bodyText: body,
      modelName: "template",
    };
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `Scrivi una bozza di risposta email formale in italiano per una cooperativa agricola.
Intent: ${input.intent}.
Usa SOLO i dati in RAG per prezzi/schede; non inventare listini.
Non firmare con nomi di persone inventate: usa "Ufficio Commerciale".
Rispondi JSON: {"subject":"...","bodyText":"..."}`,
          },
          {
            role: "user",
            content: `Referente: ${referente}\nOggetto originale: ${input.subject}\n\nEmail:\n${input.bodyText.slice(0, 4000)}\n\nRAG:\n${input.ragContext || "(nessun dato)"}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.error("[webmail draft]", await res.text());
      const referente =
        input.referentName?.trim() ||
        input.fromName.trim() ||
        "Gentile Cliente";
      return {
        subject: input.subject.toLowerCase().startsWith("re:")
          ? input.subject
          : `Re: ${input.subject || "Sua richiesta"}`,
        bodyText: [
          `Gentile ${referente},`,
          "",
          "grazie per la Sua comunicazione.",
          "",
          input.ragContext
            ? `In riferimento alla Sua richiesta:\n${input.ragContext}`
            : "Abbiamo preso in carico la Sua richiesta.",
          "",
          "Cordiali saluti,",
          "Ufficio Commerciale — OpuntiaIndustry",
        ].join("\n"),
        modelName: "template-fallback",
      };
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const parsed = JSON.parse(
      json.choices?.[0]?.message?.content ?? "{}"
    ) as { subject?: string; bodyText?: string };
    return {
      subject: parsed.subject?.trim() || `Re: ${input.subject}`,
      bodyText:
        parsed.bodyText?.trim() ||
        `Gentile ${referente},\n\ngrazie per la Sua comunicazione.\n\nCordiali saluti,\nUfficio Commerciale`,
      modelName: model,
    };
  } catch (e) {
    console.error("[webmail draft gen]", e);
    return {
      subject: `Re: ${input.subject}`,
      bodyText: `Gentile ${referente},\n\ngrazie per la Sua comunicazione.\n\nCordiali saluti,\nUfficio Commerciale`,
      modelName: "template-error",
    };
  }
}
