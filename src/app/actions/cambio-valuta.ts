"use server";

import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { tassoUfficialePerEuro } from "@/lib/services/currency-exchange";

export async function tassoCambioFiscaleAction(input: {
  dataFattura: string;
  valuta: string;
}): Promise<
  | {
      success: true;
      valuta: string;
      tasso: number;
      dataCambio: string;
      fonte: "AUTO_ECB";
    }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["amministrazione", "area-fiscale"]);
  try {
    const tasso = await tassoUfficialePerEuro(input.valuta, input.dataFattura);
    return { success: true, ...tasso };
  } catch (errore) {
    return {
      success: false,
      error:
        errore instanceof Error
          ? errore.message
          : "Impossibile recuperare il tasso di cambio.",
    };
  }
}
