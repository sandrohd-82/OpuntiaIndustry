import { bozzaMailOrdine } from "@/lib/amministrazione/ordine-mail-bozza";

/** Una riga per prodotto: codice e nome, come li deve leggere il cliente. */
export function elencoProdottiMail(prodotti: string): string {
  const raw = prodotti.trim();
  if (!raw || raw === "i prodotti richiesti") return "";
  const parti = (raw.includes("\n") ? raw.split(/\n+/) : raw.split(","))
    .map((parte) => parte.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return parti.join("\n");
}

export function etichettaProdottoMail(codice: string, nome: string): string {
  const codicePulito = codice.trim();
  const nomePulito = nome.trim();
  if (!codicePulito) return nomePulito;
  if (
    !nomePulito ||
    nomePulito.toLowerCase() === codicePulito.toLowerCase() ||
    nomePulito.toLowerCase().startsWith(`${codicePulito.toLowerCase()} `)
  ) {
    return nomePulito || codicePulito;
  }
  return `${codicePulito} ${nomePulito}`;
}

export async function generaTestoMailSpedizione(input: {
  cliente: string;
  numero: string;
  prodotti: string;
  trackingUrl: string;
  haLettera: boolean;
}): Promise<{ subject: string; bodyText: string; model: string }> {
  const numero = input.numero.trim();
  const fallback = templateMailSpedizione({
    prodotti: input.prodotti.trim() || "i prodotti richiesti",
    codiceInterno: numero,
  });
  return { ...fallback, model: "template" };
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
  if (input.documento === "fattura" && allegaPdf) {
    return { ...fallback, model: "template" };
  }
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
  const elenco = elencoProdottiMail(input.prodotti);
  const righe = ["Gentili Signori,", ""];
  if (elenco) righe.push(elenco, "");
  righe.push(
    "da voi richiesti sono stati spediti.",
    "",
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
