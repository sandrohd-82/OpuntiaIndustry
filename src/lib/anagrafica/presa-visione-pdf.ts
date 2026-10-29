import { readFileSync } from "fs";
import path from "path";
import { jsPDF } from "jspdf";
import { AGRINSICILIA_LETTERHEAD } from "@/lib/amministrazione/preventivo-letterhead";
import {
  BLOCCHI_CONDIZIONI,
  BLOCCHI_PRIVACY,
  TITOLO_CONDIZIONI,
  TITOLO_PRIVACY,
  type BloccoDocumento,
} from "@/lib/anagrafica/presa-visione-testi";

export type ConsensoMarketing = "presto" | "nego";

type InputPdf = {
  tipo: "privacy" | "condizioni";
  dataFirma: string;
  firmatario: string;
  consensoMarketing?: ConsensoMarketing;
  timbro?: string;
};

function logoPng(): string | null {
  try {
    const file = readFileSync(path.join(process.cwd(), "public", "Agrinsicilia-Coop.png"));
    return `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    return null;
  }
}

function spunta(doc: jsPDF, x: number, y: number, testo: string, attiva: boolean) {
  doc.setDrawColor(30);
  doc.setLineWidth(0.3);
  doc.rect(x, y - 3.1, 3.4, 3.4);
  if (attiva) {
    doc.setLineWidth(0.45);
    doc.line(x + 0.5, y - 1.5, x + 1.3, y - 0.5);
    doc.line(x + 1.3, y - 0.5, x + 2.9, y - 2.7);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(testo, x + 5.2, y);
}

function applicaTimbro(doc: jsPDF, timbro: string) {
  const pagine = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= pagine; pagina += 1) {
    doc.setPage(pagina);
    const testo = `${timbro} | ${pagina} di ${pagine}`;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const colonna = 70;
    const destra = 194;
    const righe = doc.splitTextToSize(testo, colonna) as string[];
    const interlinea = 3.2;
    const fondo = 286;
    const yPrima = fondo - Math.max(0, righe.length - 1) * interlinea;
    const raggio = 8.5;
    const cx = destra - raggio;
    const cy = yPrima - 5 - raggio;
    doc.setDrawColor(20, 60, 140);
    doc.setLineWidth(0.7);
    doc.circle(cx, cy, raggio, "S");
    doc.setLineWidth(0.25);
    doc.circle(cx, cy, raggio - 1.3, "S");
    doc.setTextColor(20, 60, 140);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text("FIRMATO", cx, cy - 0.5, { align: "center" });
    doc.setFontSize(5.5);
    doc.text("OTP", cx, cy + 2.6, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(30);
    let base = yPrima;
    for (const riga of righe) {
      doc.text(riga, destra, base, { align: "right" });
      base += interlinea;
    }
  }
  doc.setTextColor(0);
  doc.setDrawColor(0);
  doc.setLineWidth(0.2);
}

function piePagina(doc: jsPDF) {
  const L = AGRINSICILIA_LETTERHEAD;
  const y = 268;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  const nome = doc.splitTextToSize(L.ragioneSociale, 150) as string[];
  doc.text(nome, 88, y, { align: "center" });
  doc.setFont("helvetica", "normal");
  const sotto = y + nome.length * 3.4;
  doc.text(`${L.sito} - ${L.email}`, 88, sotto, { align: "center" });
  doc.text(`cell: ${L.cell}`, 88, sotto + 4, { align: "center" });
}

export function pdfPresaVisione(input: InputPdf): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 16;
  const width = 178;
  const titolo = input.tipo === "privacy" ? TITOLO_PRIVACY : TITOLO_CONDIZIONI;
  const blocchi = input.tipo === "privacy" ? BLOCCHI_PRIVACY : BLOCCHI_CONDIZIONI;
  let y = 28;

  const nuova = () => {
    doc.addPage();
    y = 28;
  };

  const scrivi = (testo: string, size = 10, style: "normal" | "bold" = "normal") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(15, 23, 42);
    const righe = doc.splitTextToSize(testo, width) as string[];
    const passo = size * 0.42 + 1.8;
    for (const riga of righe) {
      if (y > 228) nuova();
      doc.text(riga, left, y);
      y += passo;
    }
  };

  scrivi(titolo, 14, "bold");
  scrivi("Presa visione", 10, "bold");
  y += 2;
  for (const blocco of blocchi as BloccoDocumento[]) {
    if (blocco.titolo) {
      y += 1.5;
      scrivi(blocco.titolo, 11, "bold");
    }
    scrivi(blocco.testo);
    y += 1.2;
  }

  if (y > 198) nuova();
  y += 4;
  scrivi("Per presa visione", 11, "bold");
  y += 2;
  if (input.tipo === "privacy") {
    spunta(doc, left, y, "Accetto Informativa Privacy", true);
    y += 7;
    spunta(doc, left, y, "Presto il consenso", input.consensoMarketing === "presto");
    y += 7;
    spunta(doc, left, y, "Nego il consenso", input.consensoMarketing === "nego");
    y += 8;
    scrivi("In merito al trattamento dei Dati Personali per finalità di marketing di prodotti e/o servizi del Titolare.");
  } else {
    spunta(doc, left, y, "Accetto Condizioni generali di vendita", true);
    y += 8;
  }
  y += 4;
  if (y > 220) nuova();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Data: ${input.dataFirma}`, left, y);
  doc.text(`Firma: ${input.firmatario}`, 118, y);

  const logo = logoPng();
  const pagine = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= pagine; pagina += 1) {
    doc.setPage(pagina);
    if (logo) {
      doc.addImage(logo, "PNG", 168, 8, 28, 12);
    }
  }
  doc.setPage(pagine);
  piePagina(doc);
  if (input.timbro) applicaTimbro(doc, input.timbro);
  doc.setProperties({ title: titolo });
  return Buffer.from(doc.output("arraybuffer"));
}
