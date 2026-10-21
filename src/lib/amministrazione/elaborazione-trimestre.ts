import {
  nomeFoglioRegistro,
  registroMostraBeneConsumo,
  type CommercialistaRegistroKind,
} from "@/lib/amministrazione/commercialista";
import {
  nomiConFileExport,
  type FatturaElaborazioneSorgente,
} from "@/lib/amministrazione/elaborazione-fatture-excel";
import {
  buildElaborazioneFattureXlsx,
  buildUscitaCartellaXlsx,
} from "@/lib/amministrazione/elaborazione-fatture-xlsx";
import type { FatturaClassicaStampaModel } from "@/lib/amministrazione/fattura-classica-stampa";
import {
  buildFatturaClassicaPdf,
  buildPaperFatturaPdf,
  caricaLogoIntestazione,
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
      titolo: "Prima Nota spesa (Scontrini)",
      cartella: `Prima Nota ${periodo}`,
      registri: [{ kind: "scontrino", sottocartella: null }],
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

/** Solo le cartelle che contengono file, non altre cartelle: «Ricevute III 2026 (185 file)». */
export function nomeCartellaConConteggio(nome: string, documenti: number): string {
  return `${nome} (${documenti} file)`;
}

export function percorsoPdfTrimestre(
  gruppo: GruppoTrimestre,
  registro: RegistroTrimestre,
  nomeFile: string,
  documenti: number
): string {
  const foglia = nomeCartellaConConteggio(
    registro.sottocartella ?? gruppo.cartella,
    documenti
  );
  if (registro.sottocartella) {
    return `${gruppo.cartella}/${foglia}/${nomeFile}`;
  }
  return `${foglia}/${nomeFile}`;
}

/** Cartella dei PDF, vista dalla cartella madre Agrinsicilia. */
export function cartellaPdfTrimestre(
  gruppo: GruppoTrimestre,
  registro: RegistroTrimestre,
  documenti: number
): string {
  const foglia = nomeCartellaConConteggio(
    registro.sottocartella ?? gruppo.cartella,
    documenti
  );
  return registro.sottocartella ? `${gruppo.cartella}/${foglia}` : foglia;
}

export function nomiFileElaborazione(
  docs: FatturaElaborazioneSorgente[]
): string[] {
  const generati = nomiPdfUnivoci(
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
  return nomiConFileExport(docs, generati);
}

const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** PDF e Excel del registro, nella stessa cartella. Il resoconto completo sta nella madre. */
export async function scriviElaborazioneRegistro(input: {
  cartella: CartellaPdf;
  kind: CommercialistaRegistroKind;
  anno: number;
  trimestre: number;
  docs: DocumentoElaborazioneCartella[];
}): Promise<void> {
  const nomi = nomiFileElaborazione(input.docs);
  const comeInviata = input.kind === "emessa" || input.kind === "nota_emessa";
  const logo = comeInviata ? await caricaLogoIntestazione() : null;
  if (input.docs.length > 0) {
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
  for (let i = 0; i < input.docs.length; i += 1) {
    const doc = input.docs[i];
    if (!doc) continue;
    const fileName = nomi[i] ?? `documento_${i + 1}.pdf`;
    if (input.kind === "scontrino" && doc.allegatoUrl) {
      try {
        const risposta = await fetch(doc.allegatoUrl);
        if (risposta.ok) {
          await scriviFileInCartella(input.cartella, fileName, await risposta.blob());
          continue;
        }
      } catch {
        // Senza l'allegato resta il foglio generato dai dati registrati.
      }
    }
    const pdf = doc.classica
      ? buildFatturaClassicaPdf({
          model: doc.classica,
          numeroSequenza: doc.numeroSequenza,
          showSequenza: doc.numeroSequenza != null,
          fileName,
          logo,
        })
      : buildPaperFatturaPdf({
          model: doc.model,
          numeroSequenza: doc.numeroSequenza,
          fileName,
          comeInviata,
          notaCredito: doc.notaCredito,
          logo,
        });
    await scriviFileInCartella(input.cartella, pdf.fileName, pdf.blob);
  }
}
