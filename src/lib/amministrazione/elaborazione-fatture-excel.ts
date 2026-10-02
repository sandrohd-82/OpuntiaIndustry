import { nomiPdfUnivoci } from "@/lib/amministrazione/fattura-classica-pdf";
import { roundMoney } from "@/lib/amministrazione/fatture";
import {
  bandieraNazione,
  nomeNazione,
} from "@/lib/amministrazione/nazione-fattura";
import type { ElaborazioneContabileKind } from "@/types/database";

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
  kind: ElaborazioneContabileKind
): readonly string[] {
  const base = titoliBaseExcel(kind);
  if (kind === "ricevuta") return [...base, "Bene di Consumo"];
  return base;
}

function titoliBaseExcel(kind: ElaborazioneContabileKind): readonly string[] {
  return [
    "Numero Provvisorio",
    "Nome file",
    "Data",
    kind === "emessa" ? "Intestazione Ricevente" : "Intestazione Emittente",
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
  /** Solo ricevute: SI materiale di consumo, NO se c'è un bene ammortizzabile. */
  beneDiConsumo: "SI" | "NO" | null;
};

export type RigaElaborazioneExcel =
  | {
      tipo: "fattura";
      numeroProvvisorio: number | null;
      nomeFile: string;
      data: string;
      intestazione: string;
      nazione: string;
      beneDiConsumo: "SI" | "NO" | null;
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
  kind: ElaborazioneContabileKind
): string {
  if (kind === "emessa") {
    const ricevente = doc.classica?.destinatario.ragioneSociale.trim() ?? "";
    if (ricevente) return ricevente;
    return doc.anagraficaRagioneSociale.trim() || "—";
  }
  const daSdi = doc.classica?.emittente.ragioneSociale.trim() ?? "";
  if (daSdi) return daSdi;
  const daModello = doc.model.mittente.ragioneSociale.trim();
  if (daModello) return daModello;
  return doc.anagraficaRagioneSociale.trim() || "—";
}

function nazioneDi(
  doc: FatturaElaborazioneSorgente,
  kind: ElaborazioneContabileKind
): string {
  if (kind === "emessa") {
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

/** Elenco ordinato per data, con il totale di ogni mese e il totale generale. */
export function righeElaborazioneFatture(
  docs: FatturaElaborazioneSorgente[],
  kind: ElaborazioneContabileKind
): RigaElaborazioneExcel[] {
  const nomi = nomiPdfUnivoci(
    docs.map((doc) => ({
      numeroSequenza: doc.numeroSequenza,
      numeroFattura:
        doc.classica?.numero || doc.model.numero || doc.numeroInterno,
      data: doc.classica?.dataDocumento || doc.dataEmissione || doc.model.data || "",
    }))
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
      beneDiConsumo: kind === "ricevuta" ? doc.beneDiConsumo : null,
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
