export async function generaTestoMailSpedizione(input: {
  cliente: string;
  numero: string;
  prodotti: string;
  trackingUrl: string;
  haLettera: boolean;
}): Promise<{ subject: string; bodyText: string; model: string }> {
  const cliente = input.cliente.trim() || "Cliente";
  const numero = input.numero.trim() || "documento";
  const prodotti = input.prodotti.trim() || "i prodotti richiesti";
  const tracking = input.trackingUrl.trim();
  const fallback = templateMailSpedizione({
    cliente,
    numero,
    prodotti,
    trackingUrl: tracking,
    haLettera: input.haLettera,
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
              "Scrivi una mail formale in italiano per una cooperativa agricola (Agrinsicilia / OpuntiaIndustry). Non inventare dati. Firma: Ufficio Commerciale. Rispondi JSON {\"subject\":\"...\",\"bodyText\":\"...\"}.",
          },
          {
            role: "user",
            content: `Destinatario azienda: ${cliente}
Documento: ${numero}
Prodotti: ${prodotti}
Tracking: ${tracking || "(non ancora disponibile)"}
Lettera di via allegata: ${input.haLettera ? "sì" : "no"}
Scopo: comunicare la spedizione.`,
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

function templateMailSpedizione(input: {
  cliente: string;
  numero: string;
  prodotti: string;
  trackingUrl: string;
  haLettera: boolean;
}): { subject: string; bodyText: string } {
  const trackingRiga = input.trackingUrl
    ? `Tracking spedizione:\n${input.trackingUrl}`
    : "Il tracking verrà comunicato non appena disponibile.";
  const lettera = input.haLettera
    ? "In allegato trova anche la lettera di via."
    : "";
  return {
    subject: `Spedizione ${input.numero}`,
    bodyText: [
      `Gentile ${input.cliente},`,
      "",
      `Le comunichiamo la spedizione relativa a ${input.numero} (${input.prodotti}).`,
      "",
      trackingRiga,
      lettera,
      "",
      "Restiamo a disposizione per ogni chiarimento.",
      "",
      "Cordiali saluti,",
      "Ufficio Commerciale",
    ]
      .filter((r) => r !== "")
      .join("\n"),
  };
}
