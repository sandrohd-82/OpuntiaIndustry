import {
  nomeFoglioRegistro,
  registroMostraBeneConsumo,
  type CommercialistaRegistroKind,
} from "@/lib/amministrazione/commercialista";
import type { FatturaElaborazioneSorgente } from "@/lib/amministrazione/elaborazione-fatture-excel";
import {
  buildElaborazioneFattureXlsx,
  buildUscitaCartellaXlsx,
} from "@/lib/amministrazione/elaborazione-fatture-xlsx";
import type { FatturaClassicaStampaModel } from "@/lib/amministrazione/fattura-classica-stampa";
import {
  buildFatturaClassicaPdf,
  buildPaperFatturaPdf,
  nomiPdfUnivoci,
  scriviFileInCartella,
  type CartellaPdf,
} from "@/lib/amministrazione/fattura-classica-pdf";
import type { PaperInvoiceModel } from "@/lib/amministrazione/paper-invoice";
import type { TrimestreNumero } from "@/lib/amministrazione/trimestre-commerciale";

const ROMANI = ["I", "II", "III", "IV"] as const;

export type DocumentoElaborazioneCartella = FatturaElaborazioneSorgente & {
  classica: FatturaClassicaStampaModel | null;
  model: PaperInvoiceModel;
};

export type RegistroTrimestre = {
  kind: CommercialistaRegistroKind;
  /** Presente quando emessi e ricevuti convivono nella stessa cartella di gruppo. */
  sottocartella: string | null;
};

export type GruppoTrimestre = {
  titolo: string;
  cartella: string;
  registri: RegistroTrimestre[];
};

export function romanoTrimestre(trim: TrimestreNumero): string {
  return ROMANI[trim - 1] ?? String(trim);
}

export function nomeCartellaTrimestre(
  anno: number,
  trim: TrimestreNumero
): string {
  return `Agrinsicilia ${romanoTrimestre(trim)} ${anno}`;
}

export function gruppiElaborazioneTrimestre(
  anno: number,
  trim: TrimestreNumero
): GruppoTrimestre[] {
  const periodo = `${romanoTrimestre(trim)} ${anno}`;
  return [
    {
      titolo: "Emesse",
      cartella: `Emesse ${periodo}`,
      registri: [{ kind: "emessa", sottocartella: null }],
    },
    {
      titolo: "Ricevute",
      cartella: `Ricevute ${periodo}`,
      registri: [{ kind: "ricevuta", sottocartella: null }],
    },
    {
      titolo: "DDT",
      cartella: `DDT ${periodo}`,
      registri: [
        { kind: "ddt_emesso", sottocartella: nomeFoglioRegistro("ddt_emesso") },
        { kind: "ddt_ricevuto", sottocartella: nomeFoglioRegistro("ddt_ricevuto") },
      ],
    },
    {
      titolo: "Note di credito",
      cartella: `Note Cr ${periodo}`,
      registri: [
        { kind: "nota_emessa", sottocartella: nomeFoglioRegistro("nota_emessa") },
        {
          kind: "nota_ricevuta",
          sottocartella: nomeFoglioRegistro("nota_ricevuta"),
        },
      ],
    },
  ];
}

export function percorsoPdfTrimestre(
  gruppo: GruppoTrimestre,
  registro: RegistroTrimestre,
  nomeFile: string
): string {
  if (registro.sottocartella) {
    return `${gruppo.cartella}/${registro.sottocartella}/${nomeFile}`;
  }
  return `${gruppo.cartella}/${nomeFile}`;
}

export function nomiFileElaborazione(
  docs: FatturaElaborazioneSorgente[]
): string[] {
  return nomiPdfUnivoci(
    docs.map((doc) => ({
      numeroSequenza: doc.numeroSequenza,
      numeroFattura:
        doc.numeroDocumento ||
        doc.classica?.numero ||
        doc.model.numero ||
        doc.numeroInterno,
      data: doc.classica?.dataDocumento || doc.dataEmissione || doc.model.data || "",
    })),
    "entrata"
  );
}

const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Stessi PDF e lo stesso resoconto della singola elaborazione. */
export async function scriviElaborazioneRegistro(input: {
  cartella: CartellaPdf;
  kind: CommercialistaRegistroKind;
  anno: number;
  trimestre: number;
  docs: DocumentoElaborazioneCartella[];
}): Promise<void> {
  const nomi = nomiFileElaborazione(input.docs);
  for (let i = 0; i < input.docs.length; i += 1) {
    const doc = input.docs[i];
    if (!doc) continue;
    const fileName = nomi[i] ?? `documento_${i + 1}.pdf`;
    const pdf = doc.classica
      ? buildFatturaClassicaPdf({
          model: doc.classica,
          numeroSequenza: doc.numeroSequenza,
          showSequenza: doc.numeroSequenza != null,
          fileName,
        })
      : buildPaperFatturaPdf({
          model: doc.model,
          numeroSequenza: doc.numeroSequenza,
          fileName,
        });
    await scriviFileInCartella(input.cartella, pdf.fileName, pdf.blob);
  }
  const excel = registroMostraBeneConsumo(input.kind)
    ? await buildElaborazioneFattureXlsx({
        kind: input.kind,
        anno: input.anno,
        trimestre: input.trimestre,
        docs: input.docs,
        collegaPdf: true,
      })
    : await buildUscitaCartellaXlsx({ kind: input.kind, docs: input.docs });
  await scriviFileInCartella(
    input.cartella,
    excel.filename,
    new Blob([excel.bytes as BlobPart], { type: MIME_XLSX })
  );
}
