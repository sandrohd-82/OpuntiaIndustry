"use server";

import { generaTestoMailFattura } from "@/lib/amministrazione/fattura-mail-ai";
import { requireAnyAreaAccess } from "@/lib/areas/guard";

export async function generaCorpoMailFatturaAction(input: {
  cliente: string;
  numeroFattura: string;
  dataDocumento: string;
  ordineNumero: string;
  prodotti: string;
  totaleEuro: string;
}): Promise<
  | { success: true; subject: string; bodyText: string; model: string }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["amministrazione", "webmail"]);
  try {
    const testo = await generaTestoMailFattura(input);
    return {
      success: true,
      subject: testo.subject,
      bodyText: testo.bodyText,
      model: testo.model,
    };
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error ? e.message : "Generazione testo mail non riuscita.",
    };
  }
}
