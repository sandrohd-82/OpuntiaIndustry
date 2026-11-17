import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";

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

export function pdfPianificazione(documento: DocumentoPianificazione): Uint8Array {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const totali = totaliDocumento(documento);
  pdf.setFontSize(16);
  pdf.text("Pianificazione approvvigionamenti", 14, 16);
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
  righe.forEach((riga, indice) => pdf.text(riga, 14, 26 + indice * 5));
  autoTable(pdf, {
    startY: 26 + righe.length * 5 + 4,
    head: [["Data", "Quantità", "Unità", "Precisa/stimata", "Stato"]],
    body: righeTesto(documento),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [15, 23, 42] },
  });
  return new Uint8Array(pdf.output("arraybuffer"));
}

export async function xlsxPianificazione(documento: DocumentoPianificazione): Promise<Uint8Array> {
  const totali = totaliDocumento(documento);
  const wb = new ExcelJS.Workbook();
  wb.creator = "OpuntiaIndustry";
  const foglio = wb.addWorksheet("Pianificazione", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1 },
    views: [{ state: "frozen", ySplit: 12 }],
  });
  foglio.columns = [
    { width: 28 },
    { width: 22 },
    { width: 16 },
    { width: 18 },
    { width: 22 },
  ];
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
