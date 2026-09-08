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

export type WebmailAnagraficaExtract = {
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string;
  isPrivato: boolean;
  email: string;
  pec: string;
  sdiCode: string;
  telefono: string;
  sitoWeb: string;
  nazione: string;
  provincia: string;
  citta: string;
  cap: string;
  indirizzo: string;
  referenteNome: string;
  referenteCognome: string;
  referenteEmail: string;
  referenteTelefono: string;
  referenteMansione: string;
  hasReferente: boolean;
};

function emptyExtract(email: string): WebmailAnagraficaExtract {
  return {
    ragioneSociale: "",
    partitaIva: "",
    codiceFiscale: "",
    isPrivato: false,
    email,
    pec: "",
    sdiCode: "",
    telefono: "",
    sitoWeb: "",
    nazione: "Italia",
    provincia: "",
    citta: "",
    cap: "",
    indirizzo: "",
    referenteNome: "",
    referenteCognome: "",
    referenteEmail: email,
    referenteTelefono: "",
    referenteMansione: "",
    hasReferente: false,
  };
}

function heuristicExtractAnagrafica(input: {
  fromName: string;
  fromAddress: string;
  subject: string;
  bodyText: string;
}): WebmailAnagraficaExtract {
  const email = input.fromAddress.trim().toLowerCase();
  const text = `${input.fromName}\n${input.subject}\n${input.bodyText}`;
  const out = emptyExtract(email);
  const piva = text.match(/\b(?:P\.?\s*IVA|Partita\s*IVA)[:\s]*([0-9]{11})\b/i);
  const pivaLoose = text.match(/\b([0-9]{11})\b/);
  out.partitaIva = (piva?.[1] || pivaLoose?.[1] || "").trim();
  const cf = text.match(
    /\b(?:C\.?\s*F\.?|Codice\s*fiscale)[:\s]*([A-Z0-9]{16})\b/i
  );
  out.codiceFiscale = (cf?.[1] || "").toUpperCase();
  const tel = text.match(
    /(?:tel(?:efono)?|phone|cell(?:ulare)?)[:\s]*([+0-9\s()./-]{8,20})/i
  );
  out.telefono = (tel?.[1] || "").replace(/\s+/g, " ").trim();
  const pec = text.match(/\b([a-z0-9._%+-]+@pec\.[a-z0-9.-]+\.[a-z]{2,})\b/i);
  out.pec = (pec?.[1] || "").toLowerCase();
  const site = text.match(/\b(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/i);
  out.sitoWeb = (site?.[1] || "").replace(/[),.;]+$/, "");
  const nameParts = input.fromName.trim().split(/\s+/).filter(Boolean);
  if (nameParts.length >= 2) {
    out.referenteNome = nameParts[0] ?? "";
    out.referenteCognome = nameParts.slice(1).join(" ");
    out.hasReferente = true;
  } else if (nameParts.length === 1 && nameParts[0] && !nameParts[0].includes("@")) {
    out.referenteNome = nameParts[0];
    out.hasReferente = true;
  }
  const domain = email.includes("@") ? email.split("@")[1] ?? "" : "";
  const generic = new Set([
    "gmail.com",
    "yahoo.com",
    "yahoo.it",
    "hotmail.com",
    "outlook.com",
    "libero.it",
    "icloud.com",
    "pec.it",
  ]);
  if (domain && !generic.has(domain.toLowerCase())) {
    const brand = domain.split(".")[0] ?? "";
    out.ragioneSociale = brand
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return out;
}

/** Estrae intestazione, piè di pagina e referente dalla mail. */
export async function extractAnagraficaFromEmail(input: {
  fromName: string;
  fromAddress: string;
  subject: string;
  bodyText: string;
}): Promise<WebmailAnagraficaExtract> {
  const fallback = heuristicExtractAnagrafica(input);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || process.env.WEBMAIL_AI_ENABLED === "false") {
    return fallback;
  }
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
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
          {
            role: "system",
            content: `Estrai i dati anagrafici aziendali da un'email commerciale italiana (intestazione e firma/piè di pagina).
Non inventare partita IVA, codice fiscale, indirizzi o telefoni se non sono nel testo.
Rispondi SOLO JSON:
{"ragioneSociale":"","partitaIva":"","codiceFiscale":"","isPrivato":false,"email":"","pec":"","sdiCode":"","telefono":"","sitoWeb":"","nazione":"Italia","provincia":"","citta":"","cap":"","indirizzo":"","referenteNome":"","referenteCognome":"","referenteEmail":"","referenteTelefono":"","referenteMansione":"","hasReferente":false}`,
          },
          {
            role: "user",
            content: `Mittente: ${input.fromName} <${input.fromAddress}>\nOggetto: ${input.subject}\n\n${input.bodyText.slice(0, 8000)}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error("[webmail extract]", await res.text());
      return fallback;
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const parsed = JSON.parse(
      json.choices?.[0]?.message?.content ?? "{}"
    ) as Partial<WebmailAnagraficaExtract>;
    return {
      ...fallback,
      ragioneSociale: parsed.ragioneSociale?.trim() || fallback.ragioneSociale,
      partitaIva: parsed.partitaIva?.trim() || fallback.partitaIva,
      codiceFiscale:
        parsed.codiceFiscale?.trim().toUpperCase() || fallback.codiceFiscale,
      isPrivato: Boolean(parsed.isPrivato),
      email: parsed.email?.trim().toLowerCase() || fallback.email,
      pec: parsed.pec?.trim().toLowerCase() || fallback.pec,
      sdiCode: parsed.sdiCode?.trim().toUpperCase() || fallback.sdiCode,
      telefono: parsed.telefono?.trim() || fallback.telefono,
      sitoWeb: parsed.sitoWeb?.trim() || fallback.sitoWeb,
      nazione: parsed.nazione?.trim() || fallback.nazione,
      provincia: parsed.provincia?.trim() || fallback.provincia,
      citta: parsed.citta?.trim() || fallback.citta,
      cap: parsed.cap?.trim() || fallback.cap,
      indirizzo: parsed.indirizzo?.trim() || fallback.indirizzo,
      referenteNome: parsed.referenteNome?.trim() || fallback.referenteNome,
      referenteCognome:
        parsed.referenteCognome?.trim() || fallback.referenteCognome,
      referenteEmail:
        parsed.referenteEmail?.trim().toLowerCase() || fallback.referenteEmail,
      referenteTelefono:
        parsed.referenteTelefono?.trim() || fallback.referenteTelefono,
      referenteMansione:
        parsed.referenteMansione?.trim() || fallback.referenteMansione,
      hasReferente: Boolean(
        parsed.hasReferente ||
          parsed.referenteNome?.trim() ||
          parsed.referenteCognome?.trim() ||
          fallback.hasReferente
      ),
    };
  } catch (e) {
    console.error("[webmail extract anagrafica]", e);
    return fallback;
  }
}
