import { GoogleGenerativeAI } from "@google/generative-ai";
import { jsonrepair } from "jsonrepair";
import { z } from "zod";
import { AGRINSICILIA_LETTERHEAD } from "@/lib/amministrazione/preventivo-letterhead";
import { roundMoney } from "@/lib/amministrazione/fatture";
import type { AnteprimaSpesa, RigaLetturaSpesa } from "@/lib/fiscale/spese";

const PIVA_COOP = AGRINSICILIA_LETTERHEAD.partitaIva.replace(/\D/g, "");

const rigaSchema = z.object({
  descrizione: z.string().trim().max(160).default(""),
  quantita: z.number().nullable().default(null),
  imponibile: z.number().nullable().default(null),
  aliquotaIva: z.number().nullable().default(null),
  imposta: z.number().nullable().default(null),
  totale: z.number().nullable().default(null),
});

const letturaSchema = z.object({
  esercente: z.string().trim().max(200).default(""),
  partitaIvaEsercente: z.string().trim().max(32).default(""),
  partitaIvaAcquirente: z.string().trim().max(32).default(""),
  dataDocumento: z.string().trim().max(20).default(""),
  numeroDocumento: z.string().trim().max(40).default(""),
  righe: z.array(rigaSchema).max(40).default([]),
  imponibile: z.number().nullable().default(null),
  aliquotaIva: z.number().nullable().default(null),
  imposta: z.number().nullable().default(null),
  totale: z.number().nullable().default(null),
  valuta: z.string().trim().max(8).default("EUR"),
});

export type LetturaScontrinoJson = z.infer<typeof letturaSchema>;

function soloCifre(value: string): string {
  return value.replace(/\D/g, "");
}

function dataIso(raw: string): string {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
  if (!m) return "";
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) {
    return "";
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function euro(n: number | null): number | null {
  if (n == null || !Number.isFinite(n) || n < 0) return null;
  return roundMoney(n);
}

function modelloGemini(): string {
  return (
    process.env.GEMINI_MODEL?.trim() ||
    process.env.INVOICE_AI_GEMINI_MODEL?.trim() ||
    "gemini-2.5-flash"
  );
}

function estraiJson(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

/**
 * Scontrino / documento commerciale di una cooperativa agricola e sociale.
 * L'uscita di cassa è sempre il totale pagato.
 * L'IVA dello scontrino non è un credito: la detrazione (art. 19 DPR 633/1972)
 * richiede una fattura. Il documento commerciale ha valenza fiscale per il costo
 * solo se riporta la P.IVA della cooperativa (d.lgs. 127/2015, circ. 3/E 2020).
 * Il costo resta deducibile solo se inerente (art. 109 TUIR).
 */
export function qualificaScontrino(
  anteprima: AnteprimaSpesa,
  tipo: "scontrino" | "fattura_estera" | "xml"
): AnteprimaSpesa {
  const totale = anteprima.totale;
  if (tipo === "xml") {
    return {
      ...anteprima,
      uscitaImporto: totale,
      ivaDetraibile: true,
      valenzaFiscale: "fattura",
      avviso: `${anteprima.avviso} Uscita registrata: il totale. L'IVA della fattura è un credito solo se l'operazione è inerente e, in regime speciale agricolo (art. 34 DPR 633/1972), la detrazione analitica non si applica.`,
    };
  }
  const pivaAcquirente = soloCifre(anteprima.partitaIvaAcquirente);
  const intestata = pivaAcquirente.length === 11 && pivaAcquirente === PIVA_COOP;
  const motivo = intestata
    ? "Il documento riporta la P.IVA della cooperativa: vale per documentare il costo, se la spesa è inerente all'attività (art. 109 TUIR). L'IVA dello scontrino non si detrae: serve una fattura (art. 19 DPR 633/1972). L'uscita e il costo sono il totale pagato."
    : "Senza la P.IVA della cooperativa il documento commerciale ha solo valore commerciale (d.lgs. 127/2015). Non documenta da solo la deduzione del costo né un credito IVA. L'uscita registrata è comunque il totale pagato.";
  return {
    ...anteprima,
    uscitaImporto: totale,
    ivaDetraibile: false,
    valenzaFiscale: intestata ? "fiscale" : "commerciale",
    avviso: `${anteprima.avviso} ${motivo}`,
  };
}

export function anteprimaDaLettura(
  lettura: LetturaScontrinoJson,
  tipo: "scontrino" | "fattura_estera" | "xml"
): AnteprimaSpesa {
  const righe: RigaLetturaSpesa[] = lettura.righe
    .filter((r) => r.descrizione || r.totale != null)
    .map((r) => ({
      descrizione: r.descrizione,
      quantita: r.quantita,
      imponibile: euro(r.imponibile),
      aliquotaIva: r.aliquotaIva,
      imposta: euro(r.imposta),
      totale: euro(r.totale),
    }));
  let imponibile = euro(lettura.imponibile);
  let imposta = euro(lettura.imposta);
  const totale = euro(lettura.totale);
  const aliquotaIva = lettura.aliquotaIva;
  if (totale != null && aliquotaIva != null && imponibile == null) {
    imponibile = roundMoney(totale / (1 + aliquotaIva / 100));
    imposta = roundMoney(totale - imponibile);
  }
  const json: Record<string, unknown> = {
    ...lettura,
    righe,
    imponibile,
    imposta,
    totale,
  };
  const base: AnteprimaSpesa = {
    esercente: lettura.esercente,
    partitaIva: soloCifre(lettura.partitaIvaEsercente),
    partitaIvaAcquirente: soloCifre(lettura.partitaIvaAcquirente),
    dataDocumento: dataIso(lettura.dataDocumento),
    imponibile,
    aliquotaIva,
    imposta,
    totale,
    nazione: "",
    valuta: /^[A-Za-z]{3}$/.test(lettura.valuta) ? lettura.valuta.toUpperCase() : "EUR",
    righe,
    lettura: "ocr",
    letturaJson: json,
    uscitaImporto: totale,
    ivaDetraibile: false,
    valenzaFiscale: "commerciale",
    avviso: "Testo letto dallo scontrino. Controlla righe, imponibile, IVA e totale prima di registrare l'uscita.",
  };
  return qualificaScontrino(base, tipo);
}

export async function leggiScontrinoGemini(input: {
  bytes: Buffer;
  mime: string;
  tipo: "scontrino" | "fattura_estera" | "xml";
}): Promise<AnteprimaSpesa> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    return qualificaScontrino(
      {
        esercente: "",
        partitaIva: "",
        partitaIvaAcquirente: "",
        dataDocumento: "",
        imponibile: null,
        aliquotaIva: null,
        imposta: null,
        totale: null,
        nazione: "",
        valuta: "EUR",
        righe: [],
        lettura: "manuale",
        letturaJson: null,
        uscitaImporto: null,
        ivaDetraibile: false,
        valenzaFiscale: "commerciale",
        avviso:
          "Lettura automatica non disponibile: manca GEMINI_API_KEY. Compila i campi a mano.",
      },
      input.tipo
    );
  }
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: modelloGemini(),
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
    },
  });
  const prompt = `Sei un lettore di scontrini e documenti commerciali italiani.
Trascrivi solo ciò che è stampato. Non inventare importi, date o partite IVA.
Rispondi JSON con queste chiavi:
esercente, partitaIvaEsercente, partitaIvaAcquirente, dataDocumento (YYYY-MM-DD),
numeroDocumento, righe (array di {descrizione, quantita, imponibile, aliquotaIva, imposta, totale}),
imponibile, aliquotaIva, imposta, totale, valuta.
Importi numerici con il punto decimale. Se un dato non c'è, usa null o stringa vuota.
Le righe sono i prodotti, non i totali.`;
  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        mimeType: input.mime,
        data: input.bytes.toString("base64"),
      },
    },
  ]);
  const raw = result.response.text();
  const parsed = letturaSchema.safeParse(JSON.parse(estraiJson(jsonrepair(raw))));
  if (!parsed.success) {
    return qualificaScontrino(
      {
        esercente: "",
        partitaIva: "",
        partitaIvaAcquirente: "",
        dataDocumento: "",
        imponibile: null,
        aliquotaIva: null,
        imposta: null,
        totale: null,
        nazione: "",
        valuta: "EUR",
        righe: [],
        lettura: "manuale",
        letturaJson: null,
        uscitaImporto: null,
        ivaDetraibile: false,
        valenzaFiscale: "commerciale",
        avviso: "Non sono riuscito a interpretare il testo letto. Compila i campi a mano.",
      },
      input.tipo
    );
  }
  return anteprimaDaLettura(parsed.data, input.tipo);
}
