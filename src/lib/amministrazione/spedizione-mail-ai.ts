import { bozzaMailOrdine } from "@/lib/amministrazione/ordine-mail-bozza";

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
    codiceInterno: numero,
  });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || process.env.WEBMAIL_AI_ENABLED === "false") {
    return { ...fallback, model: "template" };
  }
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const trackingIstruzione = tracking
    ? "Non inserire il link di tracking nel testo e non scrivere la parola Tracking: il link viene aggiunto in fondo, dopo l'ultimo rigo."
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

export async function generaTestoMailOrdine(input: {
  documento: "informativa" | "proforma" | "fattura";
  allegaPdf: boolean;
  cliente: string;
  numeroOrdine: string;
  prodotti: string;
  trackingUrl: string;
  allegaTracking: boolean;
}): Promise<{ subject: string; bodyText: string; model: string }> {
  const cliente = input.cliente.trim() || "Cliente";
  const numeroOrdine = input.numeroOrdine.trim();
  const prodotti = input.prodotti.trim() || "i prodotti richiesti";
  const allegaPdf = input.documento !== "informativa" && input.allegaPdf;
  const tracking = input.allegaTracking ? input.trackingUrl.trim() : "";
  const fallback = bozzaMailOrdine({
    documento: input.documento,
    allegaPdf,
    allegaTracking: input.allegaTracking,
    trackingUrl: tracking,
    cliente,
    numeroOrdine,
    prodotti,
  });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || process.env.WEBMAIL_AI_ENABLED === "false") {
    return { ...fallback, model: "template" };
  }
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  let scopo =
    "Accompagnare la fattura in allegato. Non citare un numero fiscale se non è indicato e non parlare di SDI.";
  if (input.documento === "informativa") {
    scopo =
      "Informare che l'ordine è in fase di elaborazione. Non dire che c'è un allegato e non promettere una data di spedizione.";
  } else if (input.documento === "proforma" && allegaPdf) {
    scopo =
      "Accompagnare la proforma in allegato. Non citare un numero di fattura e non parlare di SDI.";
  } else if (input.documento === "proforma") {
    scopo =
      "Scrivere dell'ordine senza dire che la proforma è in allegato. Non citare un numero di fattura e non parlare di SDI.";
  } else if (!allegaPdf) {
    scopo =
      "Scrivere dell'ordine senza dire che la fattura è in allegato. Non citare un numero fiscale e non parlare di SDI.";
  }
  let trackingIstruzione = "Non parlare di tracking.";
  if (input.allegaTracking && tracking) {
    trackingIstruzione = `Il tracking è ${tracking}. Inseriscilo in una riga dedicata.`;
  } else if (input.allegaTracking) {
    trackingIstruzione =
      "Scrivi che il tracking della spedizione è allegato a questa mail, senza inventare un link.";
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
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Scrivi una mail formale in italiano per Agrinsicilia Soc. Coop. Non inventare importi, date o numeri. Firma: Ufficio Amministrazione. Rispondi JSON {\"subject\":\"...\",\"bodyText\":\"...\"}.",
          },
          {
            role: "user",
            content: `Destinatario: ${cliente}
Ordine: ${numeroOrdine || "(non indicato)"}
Voci: ${prodotti}
${trackingIstruzione}
Scopo: ${scopo}`,
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
    const subject = parsed.subject?.trim() ?? "";
    const bodyText = parsed.bodyText?.trim() ?? "";
    if (!subject || !bodyText) return { ...fallback, model: "template-fallback" };
    return { subject, bodyText, model };
  } catch {
    return { ...fallback, model: "template-fallback" };
  }
}

function templateMailSpedizione(input: {
  prodotti: string;
  codiceInterno: string;
}): { subject: string; bodyText: string } {
  const righe = [
    "Gentili Signori,",
    "",
    `con la presente vi informiamo che i prodotti richiesti (${input.prodotti}) sono stati spediti.`,
    "",
  ];
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
