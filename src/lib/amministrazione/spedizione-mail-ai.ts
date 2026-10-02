const TRACKING_ASSENTE =
  /non (?:è |e )?ancora disponibile|verrà comunicato|vi informeremo non appena|non appena sarà possibile/i;

export async function generaTestoMailSpedizione(input: {
  cliente: string;
  numero: string;
  prodotti: string;
  trackingUrl: string;
  haLettera: boolean;
}): Promise<{ subject: string; bodyText: string; model: string }> {
  const cliente = input.cliente.trim() || "Cliente";
  const numero = input.numero.trim();
  const prodotti = input.prodotti.trim() || "i prodotti richiesti";
  const tracking = input.trackingUrl.trim();
  const fallback = templateMailSpedizione({
    prodotti,
    trackingUrl: tracking,
    codiceInterno: numero,
  });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || process.env.WEBMAIL_AI_ENABLED === "false") {
    return { ...fallback, model: "template" };
  }
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const trackingIstruzione = tracking
    ? `Inserisci nel testo questo link di tracking, così com'è:\n${tracking}`
    : "Non parlare del tracking: il link non va anticipato né dato per mancante.";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Scrivi una mail formale in italiano per Agrinsicilia. Non inventare dati. Non citare codici interni, numeri di ordine, numeri di campionatura o documenti interni. La mail parte solo con il tracking già noto: non scrivere mai che il tracking manca, che non è disponibile o che arriverà dopo. Firma: Ufficio Commerciale. Rispondi JSON {\"subject\":\"...\",\"bodyText\":\"...\"}.",
          },
          {
            role: "user",
            content: `Destinatario azienda: ${cliente}
Prodotti: ${prodotti}
${trackingIstruzione}
Scopo: comunicare che i prodotti richiesti sono stati spediti.`,
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
    const subject = pulisciCodiceInterno(parsed.subject?.trim() ?? "", numero);
    const bodyText = pulisciCodiceInterno(parsed.bodyText?.trim() ?? "", numero);
    if (
      !subject ||
      !bodyText ||
      TRACKING_ASSENTE.test(subject) ||
      TRACKING_ASSENTE.test(bodyText) ||
      (numero.length > 3 &&
        (`${parsed.subject ?? ""} ${parsed.bodyText ?? ""}`).includes(numero))
    ) {
      return { ...fallback, model: "template-fallback" };
    }
    return { subject, bodyText, model };
  } catch {
    return { ...fallback, model: "template-fallback" };
  }
}

function pulisciCodiceInterno(testo: string, codiceInterno: string): string {
  let out = testo;
  const codice = codiceInterno.trim();
  if (codice.length > 3) out = out.split(codice).join("");
  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function templateMailSpedizione(input: {
  prodotti: string;
  trackingUrl: string;
  codiceInterno: string;
}): { subject: string; bodyText: string } {
  const righe = [
    "Gentili Signori,",
    "",
    `con la presente vi informiamo che i prodotti richiesti (${input.prodotti}) sono stati spediti.`,
    "",
  ];
  if (input.trackingUrl) {
    righe.push(
      "Per seguire la spedizione potete usare questo tracking:",
      input.trackingUrl,
      ""
    );
  }
  righe.push(
    "Restiamo a disposizione per ogni chiarimento.",
    "",
    "Cordiali saluti,",
    "Ufficio Commerciale"
  );
  return {
    subject: pulisciCodiceInterno(
      "Spedizione dei prodotti richiesti",
      input.codiceInterno
    ),
    bodyText: pulisciCodiceInterno(righe.join("\n"), input.codiceInterno),
  };
}
