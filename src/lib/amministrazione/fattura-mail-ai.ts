export async function generaTestoMailFattura(input: {
  cliente: string;
  numeroFattura: string;
  dataDocumento: string;
  ordineNumero: string;
  prodotti: string;
  totaleEuro: string;
}): Promise<{ subject: string; bodyText: string; model: string }> {
  const cliente = input.cliente.trim() || "Cliente";
  const numero = input.numeroFattura.trim() || "fattura";
  const data = input.dataDocumento.trim();
  const ordine = input.ordineNumero.trim();
  const prodotti = input.prodotti.trim() || "i prodotti in fattura";
  const totale = input.totaleEuro.trim();
  const fallback = templateMailFattura({
    cliente,
    numero,
    data,
    ordine,
    prodotti,
    totale,
  });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || process.env.WEBMAIL_AI_ENABLED === "false") {
    return { ...fallback, model: "template" };
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
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Scrivi una mail formale in italiano per Agrinsicilia (cooperativa agricola). Non inventare dati. Non promettere SDI se non indicato. Firma: Ufficio Amministrazione. Rispondi JSON {\"subject\":\"...\",\"bodyText\":\"...\"}.",
          },
          {
            role: "user",
            content: `Destinatario: ${cliente}
Fattura: ${numero}
Data documento: ${data || "(non indicata)"}
Ordine collegato: ${ordine || "(non indicato)"}
Voci: ${prodotti}
Totale: ${totale || "(in fattura)"}
Scopo: inviare la fattura in allegato PDF.`,
          },
        ],
      }),
    });
    if (!res.ok) return { ...fallback, model: "template-fallback" };
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const parsed = JSON.parse(
      String(json.choices?.[0]?.message?.content ?? "{}")
    ) as { subject?: string; bodyText?: string };
    if (!parsed.subject || !parsed.bodyText) {
      return { ...fallback, model: "template-fallback" };
    }
    return {
      subject: parsed.subject.trim(),
      bodyText: parsed.bodyText.trim(),
      model,
    };
  } catch {
    return { ...fallback, model: "template-fallback" };
  }
}

function templateMailFattura(input: {
  cliente: string;
  numero: string;
  data: string;
  ordine: string;
  prodotti: string;
  totale: string;
}): { subject: string; bodyText: string } {
  const dataRiga = input.data
    ? ` del ${input.data.split("-").reverse().join("/")}`
    : "";
  const ordineRiga = input.ordine
    ? `Ordine di riferimento: ${input.ordine}.`
    : "";
  const totRiga = input.totale ? `Totale documento: ${input.totale}.` : "";
  return {
    subject: `Fattura ${input.numero}${dataRiga}`,
    bodyText: [
      `Gentile ${input.cliente},`,
      "",
      `in allegato trova la fattura ${input.numero}${dataRiga}.`,
      ordineRiga,
      `Voci: ${input.prodotti}.`,
      totRiga,
      "",
      "Restiamo a disposizione per ogni chiarimento.",
      "",
      "Cordiali saluti,",
      "Ufficio Amministrazione",
      "Agrinsicilia Soc. Coop.",
    ]
      .filter((r) => r !== "")
      .join("\n"),
  };
}
