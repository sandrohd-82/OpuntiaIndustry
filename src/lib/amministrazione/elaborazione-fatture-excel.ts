import { nomiPdfUnivoci } from "@/lib/amministrazione/fattura-classica-pdf";
import { roundMoney } from "@/lib/amministrazione/fatture";
import {
  bandieraNazione,
  codiceNazione,
  nomeNazione,
} from "@/lib/amministrazione/nazione-fattura";
import {
  registroLatoEmesso,
  registroMostraBeneConsumo,
  type CommercialistaRegistroKind,
} from "@/lib/amministrazione/commercialista";

const MESI = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
] as const;

export function titoliElaborazioneExcel(
  kind: CommercialistaRegistroKind
): readonly string[] {
  const base = [...titoliBaseExcel(kind)];
  if (!registroMostraBeneConsumo(kind)) return base;
  base.splice(2, 0, "Numero documento");
  base.push("Origine", "Bene ammortizzabile");
  return base;
}

/** SDI se il documento arriva dallo SdI. Altrimenti il supporto del caricamento. */
export function etichettaOrigineDocumento(input: {
  ficId?: number | null;
  haXmlSdi?: boolean;
  fileName?: string | null;
}): string {
  const fic = Number(input.ficId ?? 0);
  if ((Number.isFinite(fic) && fic > 0) || input.haXmlSdi) return "SDI";
  const name = String(input.fileName ?? "").trim().toLowerCase();
  if (!name) return "Manuale";
  if (/\.(jpe?g|png|webp|heic|gif|bmp)$/.test(name)) return "Foto";
  if (/\.(eml|msg)$/.test(name)) return "mail";
  if (name.endsWith(".pdf")) return "PDF";
  if (name.endsWith(".xml") || name.endsWith(".p7m")) return "XML";
  return "File";
}

function titoliBaseExcel(kind: CommercialistaRegistroKind): readonly string[] {
  return [
    "Numero Provvisorio",
    "Nome file",
    "Data",
    registroLatoEmesso(kind) ? "Intestazione Ricevente" : "Intestazione Emittente",
    "Tot. Imponibile",
    "Tot. IVA",
    "Tot. Fattura",
    "Nazione",
  ];
}

export type FatturaElaborazioneSorgente = {
  numeroSequenza: number | null;
  numeroInterno: string;
  dataEmissione: string;
  anagraficaRagioneSociale: string;
  classica: {
    numero: string;
    dataDocumento: string;
    emittente: { ragioneSociale: string; nazione: string };
    destinatario: { ragioneSociale: string; nazione: string };
    imponibile: number;
    imposta: number;
    totale: number;
  } | null;
  model: {
    numero: string;
    data: string | null;
    mittente: { ragioneSociale: string };
    imponibile: number;
    iva: number;
    totale: number;
  };
  numeroDocumento: string;
  /** SDI, mail, Foto, PDF, XML, Manuale. */
  origineDocumento: string;
  /** Solo registri in entrata: SI se almeno una riga è ammortizzabile. */
  beneAmmortizzabile: "SI" | "NO" | null;
  /** Matita dal 1° gennaio. Il file PDF delle inviate non la usa. */
  numeroProgressivoAnno?: number | null;
  notaCredito: boolean;
};

export const TITOLI_USCITA_EXCEL = [
  "N. Prog",
  "Tipo doc.",
  "Numero documento",
  "Data documento",
  "Intestazione",
  "Imponibile",
  "IVA",
  "Totale",
  "Nazionalità",
  "Beni strumentali",
] as const;

export type RigaCartellaUscita = {
  numeroProgressivo: number | null;
  tipoDocumento: string;
  nomeFile: string;
  numeroDocumento: string;
  data: string;
  intestazione: string;
  imponibile: number;
  iva: number;
  totale: number;
  nazione: string;
  beniStrumentali: "SI" | "NO";
  notaCredito: boolean;
};

export type RigaElaborazioneExcel =
  | {
      tipo: "fattura";
      numeroProvvisorio: number | null;
      nomeFile: string;
      data: string;
      intestazione: string;
      nazione: string;
      numeroDocumento: string;
      origineDocumento: string;
      beneAmmortizzabile: "SI" | "NO" | null;
      notaCredito: boolean;
      imponibile: number;
      iva: number;
      totale: number;
    }
  | {
      tipo: "mese" | "generale";
      etichetta: string;
      imponibile: number;
      iva: number;
      totale: number;
    };

function isoGiorno(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(t);
  return m?.[1] ?? "";
}

function dataIt(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "—";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function etichettaMese(yyyyMm: string): string {
  const [anno, mese] = yyyyMm.split("-");
  const nome = MESI[Number(mese) - 1] ?? mese;
  return `Totale ${nome} ${anno}`;
}

function intestazioneDi(
  doc: FatturaElaborazioneSorgente,
  kind: CommercialistaRegistroKind
): string {
  if (registroLatoEmesso(kind)) {
    const ricevente = doc.classica?.destinatario.ragioneSociale.trim() ?? "";
    const nome = ricevente || doc.anagraficaRagioneSociale.trim() || "—";
    return doc.notaCredito ? `Nota di credito — ${nome}` : nome;
  }
  const daSdi = doc.classica?.emittente.ragioneSociale.trim() ?? "";
  if (daSdi) return daSdi;
  const daModello = doc.model.mittente.ragioneSociale.trim();
  if (daModello) return daModello;
  return doc.anagraficaRagioneSociale.trim() || "—";
}

function nazioneDi(
  doc: FatturaElaborazioneSorgente,
  kind: CommercialistaRegistroKind
): string {
  if (registroLatoEmesso(kind)) {
    return nomeNazione(doc.classica?.destinatario.nazione) || "—";
  }
  return bandieraNazione(doc.classica?.emittente.nazione) || "—";
}

function importiDi(doc: FatturaElaborazioneSorgente) {
  const registro = {
    imponibile: roundMoney(doc.model.imponibile),
    iva: roundMoney(doc.model.iva),
    totale: roundMoney(doc.model.totale),
  };
  if (registro.totale < 0 || !doc.classica) return registro;
  return {
    imponibile: roundMoney(doc.classica.imponibile),
    iva: roundMoney(doc.classica.imposta),
    totale: roundMoney(doc.classica.totale),
  };
}

function tipoDocumentoUscita(
  doc: FatturaElaborazioneSorgente,
  kind: CommercialistaRegistroKind
): string {
  if (kind === "ddt_emesso" || kind === "ddt_ricevuto") return "DDT";
  const interno = doc.numeroInterno.trim();
  const numero = doc.numeroDocumento.trim();
  const prenotata =
    interno.startsWith("Pren-") ||
    numero.startsWith("Pren-") ||
    numero === "Prenotata";
  const proforma = interno.startsWith("Pren-PR-") || /^PR-\d+\/20\d{2}$/.test(numero);
  if (proforma) return "Proforma prenotata";
  if (prenotata && (doc.notaCredito || kind === "nota_emessa" || kind === "nota_ricevuta")) {
    return "Nota prenotata";
  }
  if (prenotata) return "Fattura prenotata";
  if (doc.notaCredito || kind === "nota_emessa" || kind === "nota_ricevuta") {
    return "Nota di credito";
  }
  return "Fattura";
}

function codiceDestinazione(
  doc: FatturaElaborazioneSorgente,
  kind: CommercialistaRegistroKind
): string {
  const raw = registroLatoEmesso(kind)
    ? (doc.classica?.destinatario.nazione ?? "")
    : "";
  const codice = codiceNazione(raw);
  if (codice) return codice;
  return raw.trim() ? "—" : "IT";
}

/** Resoconto delle inviate: la matita in colonna A parte dal 1° gennaio. */
export function righeCartellaUscita(
  docs: FatturaElaborazioneSorgente[],
  kind: CommercialistaRegistroKind
): RigaCartellaUscita[] {
  const nomi = nomiPdfUnivoci(
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
  const nomePerDoc = new Map(docs.map((doc, i) => [doc, nomi[i] ?? ""]));
  const ordinate = [...docs].sort((a, b) => {
    const da =
      isoGiorno(a.classica?.dataDocumento || a.dataEmissione || a.model.data) ||
      "9999-99-99";
    const db =
      isoGiorno(b.classica?.dataDocumento || b.dataEmissione || b.model.data) ||
      "9999-99-99";
    if (da !== db) return da < db ? -1 : 1;
    return (a.numeroProgressivoAnno ?? 999999) - (b.numeroProgressivoAnno ?? 999999);
  });
  return ordinate.map((doc) => {
    const giorno =
      isoGiorno(doc.classica?.dataDocumento || doc.dataEmissione || doc.model.data) ||
      "";
    const importi = importiDi(doc);
    return {
      numeroProgressivo: doc.numeroProgressivoAnno ?? null,
      tipoDocumento: tipoDocumentoUscita(doc, kind),
      nomeFile: nomePerDoc.get(doc) ?? "",
      numeroDocumento: doc.numeroDocumento || doc.numeroInterno,
      data: giorno ? dataIt(giorno) : "—",
      intestazione: intestazioneDi(doc, kind),
      imponibile: importi.imponibile,
      iva: importi.iva,
      totale: importi.totale,
      nazione: codiceDestinazione(doc, kind),
      beniStrumentali: doc.beneAmmortizzabile === "SI" ? "SI" : "NO",
      notaCredito: doc.notaCredito,
    };
  });
}

/** Elenco ordinato per data, con il totale di ogni mese e il totale generale. */
export function righeElaborazioneFatture(
  docs: FatturaElaborazioneSorgente[],
  kind: CommercialistaRegistroKind
): RigaElaborazioneExcel[] {
  const nomi = nomiPdfUnivoci(
    docs.map((doc) => ({
      numeroSequenza: doc.numeroSequenza,
      numeroFattura:
        doc.numeroDocumento ||
        doc.classica?.numero ||
        doc.model.numero ||
        doc.numeroInterno,
      data: doc.classica?.dataDocumento || doc.dataEmissione || doc.model.data || "",
    })),
    registroMostraBeneConsumo(kind) ? "entrata" : "classico"
  );
  const nomePerDoc = new Map(docs.map((doc, i) => [doc, nomi[i] ?? ""]));
  const ordinate = [...docs].sort((a, b) => {
    const da =
      isoGiorno(a.classica?.dataDocumento || a.dataEmissione || a.model.data) ||
      "9999-99-99";
    const db =
      isoGiorno(b.classica?.dataDocumento || b.dataEmissione || b.model.data) ||
      "9999-99-99";
    if (da !== db) return da < db ? -1 : 1;
    return (a.numeroSequenza ?? 999999) - (b.numeroSequenza ?? 999999);
  });

  const out: RigaElaborazioneExcel[] = [];
  let mese = "";
  let impMese = 0;
  let ivaMese = 0;
  let totMese = 0;
  let impTutte = 0;
  let ivaTutte = 0;
  let totTutte = 0;

  function chiudiMese() {
    if (!mese) return;
    out.push({
      tipo: "mese",
      etichetta: etichettaMese(mese),
      imponibile: roundMoney(impMese),
      iva: roundMoney(ivaMese),
      totale: roundMoney(totMese),
    });
    impMese = 0;
    ivaMese = 0;
    totMese = 0;
  }

  for (const doc of ordinate) {
    const giorno =
      isoGiorno(doc.classica?.dataDocumento || doc.dataEmissione || doc.model.data) ||
      "";
    const chiaveMese = giorno.slice(0, 7) || "senza-data";
    if (mese && chiaveMese !== mese) chiudiMese();
    mese = chiaveMese;
    const importi = importiDi(doc);
    out.push({
      tipo: "fattura",
      numeroProvvisorio: doc.numeroSequenza,
      nomeFile: nomePerDoc.get(doc) ?? "",
      data: giorno ? dataIt(giorno) : "—",
      intestazione: intestazioneDi(doc, kind),
      nazione: nazioneDi(doc, kind),
      numeroDocumento: doc.numeroDocumento,
      origineDocumento: doc.origineDocumento,
      beneAmmortizzabile: registroMostraBeneConsumo(kind)
        ? doc.beneAmmortizzabile
        : null,
      notaCredito: doc.notaCredito,
      imponibile: importi.imponibile,
      iva: importi.iva,
      totale: importi.totale,
    });
    impMese += importi.imponibile;
    ivaMese += importi.iva;
    totMese += importi.totale;
    impTutte += importi.imponibile;
    ivaTutte += importi.iva;
    totTutte += importi.totale;
  }

  if (out.length === 0) return out;
  chiudiMese();
  out.push({
    tipo: "generale",
    etichetta: "Totale generale",
    imponibile: roundMoney(impTutte),
    iva: roundMoney(ivaTutte),
    totale: roundMoney(totTutte),
  });
  return out;
}
