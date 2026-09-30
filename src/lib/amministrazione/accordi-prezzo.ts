import { z } from "zod";

export const ACCORDO_PREZZO_MODALITA = [
  "sconto_percentuale",
  "prezzo_fisso",
] as const;

export type AccordoPrezzoModalita = (typeof ACCORDO_PREZZO_MODALITA)[number];
export type AccordoPrezzoAziendaTipo = "cliente" | "cliente_possibile";

export type AccordoPrezzoProdotto = {
  id: string;
  prodottoCodice: string;
  modalita: AccordoPrezzoModalita;
  scontoPct: number | null;
  prezzoKg: number | null;
  giustificazione: string;
  versione: number;
};

export type AccordoPrezzoVoceForm = {
  prodottoCodice: string;
  modalita: "nessuno" | AccordoPrezzoModalita;
  scontoPct: number | "";
  prezzoKg: number | "";
  giustificazione: string;
};

export type AccordoRigaSnapshot = {
  accordoId: string | null;
  accordoModalita: AccordoPrezzoModalita | null;
  accordoValoreOrigine: number | null;
  accordoGiustificazione: string;
  accordoForzato: boolean;
};

export const accordoPrezzoVuoto: AccordoRigaSnapshot = {
  accordoId: null,
  accordoModalita: null,
  accordoValoreOrigine: null,
  accordoGiustificazione: "",
  accordoForzato: false,
};

export function colonneAccordoDb(row: Partial<AccordoRigaSnapshot> | null | undefined) {
  const campi = campiAccordoRiga(row);
  return {
    accordo_id: campi.accordoId,
    accordo_modalita: campi.accordoModalita,
    accordo_valore_origine: campi.accordoValoreOrigine,
    accordo_giustificazione: campi.accordoGiustificazione,
    accordo_forzato: campi.accordoForzato,
  };
}

export function campiAccordoRiga(
  row: Partial<AccordoRigaSnapshot> | null | undefined
): AccordoRigaSnapshot {
  const modalita = row?.accordoModalita ?? null;
  return {
    accordoId: row?.accordoId ?? null,
    accordoModalita:
      modalita === "sconto_percentuale" || modalita === "prezzo_fisso"
        ? modalita
        : null,
    accordoValoreOrigine:
      row?.accordoValoreOrigine == null
        ? null
        : Number(row.accordoValoreOrigine),
    accordoGiustificazione: row?.accordoGiustificazione ?? "",
    accordoForzato: Boolean(row?.accordoForzato),
  };
}

export function valoreOrigineAccordo(
  item: Pick<AccordoPrezzoProdotto, "modalita" | "scontoPct" | "prezzoKg">
): number {
  return item.modalita === "prezzo_fisso"
    ? Number(item.prezzoKg ?? 0)
    : Number(item.scontoPct ?? 0);
}

export function accordoForzato(
  origine: number | null,
  applicato: number
): boolean {
  if (origine == null) return false;
  return Math.abs(applicato - origine) > 0.0001;
}

function fmtNum(n: number) {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Voce che spiega perché il campo è precompilato, e se l'operatore lo ha cambiato. */
export function voceAccordoPrezzo(input: {
  modalita: AccordoPrezzoModalita;
  valoreOrigine: number;
  valoreApplicato: number;
  giustificazione: string;
  unita?: string;
}): string {
  const um = input.unita?.trim() || "kg";
  const origine =
    input.modalita === "prezzo_fisso"
      ? `Prezzo concordato ${fmtNum(input.valoreOrigine)} €/${um}, non legato a quantità o confezione.`
      : `Sconto concordato ${fmtNum(input.valoreOrigine)}%, non legato a quantità o confezione.`;
  const motivo = input.giustificazione.trim();
  const cambiato = accordoForzato(input.valoreOrigine, input.valoreApplicato);
  const forza = cambiato
    ? input.modalita === "prezzo_fisso"
      ? ` In questo documento l'operatore ha impostato ${fmtNum(input.valoreApplicato)} €/${um}.`
      : ` In questo documento l'operatore ha impostato ${fmtNum(input.valoreApplicato)}%.`
    : "";
  return `${origine}${motivo ? ` Motivo: ${motivo}` : ""}${forza}`;
}

export const accordoPrezzoVoceSchema = z
  .object({
    prodottoCodice: z.string().trim().min(1),
    modalita: z.enum(["nessuno", ...ACCORDO_PREZZO_MODALITA]),
    scontoPct: z.number().min(0).max(100).nullable().optional(),
    prezzoKg: z.number().positive().nullable().optional(),
    giustificazione: z.string().trim().max(500).optional().default(""),
  })
  .superRefine((voce, ctx) => {
    if (voce.modalita === "nessuno") return;
    if (voce.giustificazione.trim().length < 3) {
      ctx.addIssue({
        code: "custom",
        message: `Scrivi perché per ${voce.prodottoCodice} è stato concordato questo sconto o questo prezzo (almeno 3 caratteri).`,
        path: ["giustificazione"],
      });
    }
    if (voce.modalita === "sconto_percentuale" && voce.scontoPct == null) {
      ctx.addIssue({
        code: "custom",
        message: `Indica lo sconto % per ${voce.prodottoCodice}.`,
        path: ["scontoPct"],
      });
    }
    if (voce.modalita === "prezzo_fisso" && voce.prezzoKg == null) {
      ctx.addIssue({
        code: "custom",
        message: `Indica il prezzo al kg per ${voce.prodottoCodice}.`,
        path: ["prezzoKg"],
      });
    }
  });

export const saveAccordiPrezzoSchema = z.object({
  aziendaTipo: z.enum(["cliente", "cliente_possibile"]),
  aziendaId: z.string().uuid(),
  voci: z.array(accordoPrezzoVoceSchema),
});

export const lookupAccordoPrezzoSchema = z.object({
  aziendaTipo: z.enum(["cliente", "cliente_possibile"]),
  aziendaId: z.string().uuid(),
  prodottoCodice: z.string().trim().min(1),
});
