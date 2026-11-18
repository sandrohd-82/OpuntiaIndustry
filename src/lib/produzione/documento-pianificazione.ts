import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import { aggiungiGiorni, giornoValido, lunediSettimana } from "@/lib/produzione/approvvigionamento";

export type ConsegnaDocumento = {
  data: string;
  quantita: number;
  tipoQuantita: "precisa" | "stimata";
  stato: string;
  unita?: string;
};

export type DocumentoPianificazione = {
  codice: string;
  fornitore: string;
  materia: string;
  unita: string;
  periodoInizio: string;
  periodoFine: string;
  note: string;
  consegne: readonly ConsegnaDocumento[];
};

export function totaliDocumento(documento: DocumentoPianificazione): {
  consegne: number;
  precisa: number | null;
  stimata: number | null;
} {
  const unita = new Set(
    documento.consegne.map((consegna) => consegna.unita || documento.unita)
  );
  if (unita.size > 1) {
    return { consegne: documento.consegne.length, precisa: null, stimata: null };
  }
  let precisa = 0;
  let stimata = 0;
  for (const consegna of documento.consegne) {
    if (consegna.tipoQuantita === "stimata") stimata += consegna.quantita;
    else precisa += consegna.quantita;
  }
  return { consegne: documento.consegne.length, precisa, stimata };
}

function testoTotale(valore: number | null, unita: string): string {
  if (valore == null) return "non sommato: unità diverse";
  return `${valore} ${unita}`;
}

function righeTesto(documento: DocumentoPianificazione): string[][] {
  return documento.consegne.map((consegna) => [
    consegna.data,
    String(consegna.quantita),
    consegna.unita || documento.unita,
    consegna.tipoQuantita,
    consegna.stato,
  ]);
}

const NOMI_MESI = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];
const FERIALI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const MASSIMO_MESI = 24;

function pad2(valore: number): string {
  return String(valore).padStart(2, "0");
}

function mesiDelDocumento(documento: DocumentoPianificazione): string[] {
  const date = documento.consegne.map((consegna) => consegna.data).filter(giornoValido).sort();
  let inizio = giornoValido(documento.periodoInizio) ? documento.periodoInizio : (date[0] ?? "");
  let fine = giornoValido(documento.periodoFine) ? documento.periodoFine : (date[date.length - 1] ?? inizio);
  if (!giornoValido(inizio) || !giornoValido(fine)) return [];
  if (fine < inizio) fine = inizio;
  const mesi: string[] = [];
  let anno = Number(inizio.slice(0, 4));
  let mese = Number(inizio.slice(5, 7));
  const annoFine = Number(fine.slice(0, 4));
  const meseFine = Number(fine.slice(5, 7));
  while ((anno < annoFine || (anno === annoFine && mese <= meseFine)) && mesi.length < MASSIMO_MESI) {
    mesi.push(`${anno}-${pad2(mese)}-01`);
    mese += 1;
    if (mese === 13) {
      mese = 1;
      anno += 1;
    }
  }
  return mesi;
}

function settimaneDelMese(primo: string): (string | null)[][] {
  const anno = Number(primo.slice(0, 4));
  const mese = Number(primo.slice(5, 7));
  const chiave = primo.slice(0, 7);
  const ultimoGiorno = new Date(Date.UTC(anno, mese, 0)).getUTCDate();
  const ultimo = `${chiave}-${pad2(ultimoGiorno)}`;
  const da = lunediSettimana(primo);
  const a = aggiungiGiorni(lunediSettimana(ultimo), 6);
  const settimane: (string | null)[][] = [];
  let riga: (string | null)[] = [];
  for (let giorno = da; giorno <= a; giorno = aggiungiGiorni(giorno, 1)) {
    riga.push(giorno.slice(0, 7) === chiave ? giorno : null);
    if (riga.length === 7) {
      settimane.push(riga);
      riga = [];
    }
  }
  return settimane;
}

function mappaQuantita(documento: DocumentoPianificazione): Map<string, string[]> {
  const mappa = new Map<string, string[]>();
  for (const consegna of documento.consegne) {
    if (!giornoValido(consegna.data)) continue;
    const unita = consegna.unita || documento.unita;
    const testo = unita === documento.unita ? String(consegna.quantita) : `${consegna.quantita} ${unita}`;
    const lista = mappa.get(consegna.data) ?? [];
    lista.push(testo);
    mappa.set(consegna.data, lista);
  }
  return mappa;
}

function nomeMese(primo: string): string {
  const mese = Number(primo.slice(5, 7));
  return `${NOMI_MESI[mese - 1] ?? ""} ${primo.slice(0, 4)}`;
}

function disegnaMese(
  pdf: jsPDF,
  documento: DocumentoPianificazione,
  primo: string,
  mappa: Map<string, string[]>
) {
  const sinistra = 10;
  const larghezza = 277;
  const colonna = larghezza / 7;
  const alto = 26;
  const settimane = settimaneDelMese(primo);
  const altezzaRiga = Math.min(28, (176 - 7) / Math.max(settimane.length, 1));
  pdf.setFontSize(16);
  pdf.setTextColor(15, 23, 42);
  pdf.text(nomeMese(primo), sinistra, 14);
  pdf.setFontSize(10);
  pdf.text(`${documento.codice} · ${documento.fornitore} · ${documento.materia}`, sinistra, 21);
  FERIALI.forEach((feriale, indice) => {
    pdf.setFillColor(15, 23, 42);
    pdf.rect(sinistra + indice * colonna, alto, colonna, 7, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.text(feriale, sinistra + indice * colonna + colonna / 2, alto + 4.8, { align: "center" });
  });
  settimane.forEach((settimana, riga) => {
    settimana.forEach((iso, indice) => {
      const x = sinistra + indice * colonna;
      const y = alto + 7 + riga * altezzaRiga;
      const quantita = iso ? (mappa.get(iso) ?? []) : [];
      if (!iso) pdf.setFillColor(241, 245, 249);
      else if (quantita.length > 0) pdf.setFillColor(237, 233, 254);
      else pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(203, 213, 225);
      pdf.rect(x, y, colonna, altezzaRiga, "FD");
      if (!iso) return;
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(String(Number(iso.slice(8, 10))), x + 1.6, y + 4);
      if (quantita.length === 0) return;
      pdf.setTextColor(76, 29, 149);
      pdf.setFontSize(quantita.length > 2 ? 9 : 13);
      const interlinea = quantita.length > 2 ? 4 : 5.5;
      const blocco = (quantita.length - 1) * interlinea;
      const partenza = y + altezzaRiga / 2 - blocco / 2 + 2;
      quantita.forEach((voce, voceIndice) => {
        pdf.text(voce, x + colonna / 2, partenza + voceIndice * interlinea, { align: "center" });
      });
    });
  });
  pdf.setTextColor(0, 0, 0);
}

function disegnaElenco(pdf: jsPDF, documento: DocumentoPianificazione) {
  const totali = totaliDocumento(documento);
  pdf.setFontSize(16);
  pdf.setTextColor(15, 23, 42);
  pdf.text("Elenco consegne", 14, 16);
  pdf.setFontSize(10);
  const righe = [
    `Pianificazione: ${documento.codice}`,
    `Fornitore: ${documento.fornitore}`,
    `Materia prima: ${documento.materia}`,
    `Unità: ${documento.unita}`,
    `Periodo: ${documento.periodoInizio} – ${documento.periodoFine}`,
    `Consegne: ${totali.consegne}`,
    `Totale precisa: ${testoTotale(totali.precisa, documento.unita)}`,
    `Totale stimata: ${testoTotale(totali.stimata, documento.unita)}`,
    `Note: ${documento.note || "—"}`,
  ];
  righe.forEach((riga, indice) => pdf.text(riga, 14, 24 + indice * 5));
  autoTable(pdf, {
    startY: 24 + righe.length * 5 + 4,
    head: [["Data", "Quantità", "Unità", "Precisa/stimata", "Stato"]],
    body: righeTesto(documento),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [15, 23, 42] },
    margin: { left: 14, right: 14 },
  });
}

export function pdfPianificazione(documento: DocumentoPianificazione): Uint8Array {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const mappa = mappaQuantita(documento);
  const mesi = mesiDelDocumento(documento);
  mesi.forEach((primo, indice) => {
    if (indice > 0) pdf.addPage("a4", "landscape");
    disegnaMese(pdf, documento, primo, mappa);
  });
  if (mesi.length > 0) pdf.addPage("a4", "landscape");
  disegnaElenco(pdf, documento);
  return new Uint8Array(pdf.output("arraybuffer"));
}

const BORDO_GIORNO: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFCBD5E1" } },
  left: { style: "thin", color: { argb: "FFCBD5E1" } },
  bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
  right: { style: "thin", color: { argb: "FFCBD5E1" } },
};

function scriviCalendari(
  foglio: ExcelJS.Worksheet,
  documento: DocumentoPianificazione,
  mappa: Map<string, string[]>
) {
  for (const primo of mesiDelDocumento(documento)) {
    const titolo = foglio.addRow([nomeMese(primo)]);
    foglio.mergeCells(titolo.number, 1, titolo.number, 7);
    titolo.font = { bold: true, size: 14, color: { argb: "FF0F172A" } };
    titolo.height = 22;
    const feriali = foglio.addRow(FERIALI);
    feriali.font = { bold: true, color: { argb: "FFFFFFFF" } };
    feriali.eachCell((cella) => {
      cella.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
      cella.alignment = { horizontal: "center", vertical: "middle" };
    });
    for (const settimana of settimaneDelMese(primo)) {
      const riga = foglio.addRow(
        settimana.map((iso) => {
          if (!iso) return "";
          const quantita = mappa.get(iso) ?? [];
          const giorno = String(Number(iso.slice(8, 10)));
          if (quantita.length === 0) return giorno;
          return `${giorno}\n${quantita.join("\n")}`;
        })
      );
      riga.height = 36;
      riga.eachCell({ includeEmpty: true }, (cella, colonna) => {
        const iso = settimana[colonna - 1];
        const quantita = iso ? (mappa.get(iso) ?? []) : [];
        cella.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cella.border = BORDO_GIORNO;
        if (!iso) {
          cella.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
          return;
        }
        if (quantita.length === 0) {
          cella.font = { color: { argb: "FF64748B" } };
          return;
        }
        cella.font = { bold: true, color: { argb: "FF4C1D95" } };
        cella.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
      });
    }
    foglio.addRow([]);
  }
}

export async function xlsxPianificazione(documento: DocumentoPianificazione): Promise<Uint8Array> {
  const totali = totaliDocumento(documento);
  const wb = new ExcelJS.Workbook();
  wb.creator = "OpuntiaIndustry";
  const foglio = wb.addWorksheet("Pianificazione", {
    pageSetup: { paperSize: 9, orientation: "landscape" },
  });
  foglio.columns = [
    { width: 18 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
    { width: 16 },
    { width: 16 },
  ];
  scriviCalendari(foglio, documento, mappaQuantita(documento));
  foglio.addRow([]);
  const testata: [string, string][] = [
    ["Pianificazione", documento.codice],
    ["Fornitore", documento.fornitore],
    ["Materia prima", documento.materia],
    ["Unità", documento.unita],
    ["Periodo", `${documento.periodoInizio} – ${documento.periodoFine}`],
    ["Consegne", String(totali.consegne)],
    ["Totale precisa", testoTotale(totali.precisa, documento.unita)],
    ["Totale stimata", testoTotale(totali.stimata, documento.unita)],
    ["Note", documento.note || "—"],
  ];
  for (const [etichetta, valore] of testata) {
    const riga = foglio.addRow([etichetta, valore]);
    riga.getCell(1).font = { bold: true };
  }
  foglio.addRow([]);
  const intestazione = foglio.addRow(["Data", "Quantità", "Unità", "Precisa/stimata", "Stato"]);
  intestazione.font = { bold: true };
  for (const consegna of documento.consegne) {
    foglio.addRow([
      consegna.data,
      consegna.quantita,
      consegna.unita || documento.unita,
      consegna.tipoQuantita,
      consegna.stato,
    ]);
  }
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
