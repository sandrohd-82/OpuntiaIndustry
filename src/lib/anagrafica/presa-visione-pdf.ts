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

/** Altezza del timbro disegnato subito sotto il nome, non in calce. */
export function altezzaTimbro(doc: jsPDF, timbro: string, larghezza = 120): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const righe = doc.splitTextToSize(timbro, larghezza) as string[];
  return 2 + 17 + 3.5 + righe.length * 3.2;
}

/** Timbro dell'ultima pagina, appena sotto il nome del firmatario. */
export function disegnaTimbroSottoNome(
  doc: jsPDF,
  x: number,
  yNome: number,
  timbro: string,
  larghezza = 120
): number {
  const raggio = 8.5;
  const cx = x + raggio;
  const cy = yNome + 2 + raggio;
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
  const righe = doc.splitTextToSize(timbro, larghezza) as string[];
  let base = cy + raggio + 3.5;
  for (const riga of righe) {
    doc.text(riga, x, base);
    base += 3.2;
  }
  doc.setTextColor(0);
  doc.setDrawColor(0);
  doc.setLineWidth(0.2);
  return base;
}

export function logoAgrinsiciliaPdf(): string | null {
  return logoPng();
}

function piePagina(doc: jsPDF) {
  const L = AGRINSICILIA_LETTERHEAD;
  const centro = 105;
  const y = 268;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  const nome = doc.splitTextToSize(L.ragioneSociale, 170) as string[];
  doc.text(nome, centro, y, { align: "center" });
  doc.setFont("helvetica", "normal");
  const sotto = y + nome.length * 3.4;
  doc.text(`${L.sito} - ${L.email}`, centro, sotto, { align: "center" });
  doc.text(`cell: ${L.cell}`, centro, sotto + 4, { align: "center" });
}

/** In basso a destra di ogni pagina: 1 di 2, 2 di 2. */
export function numeraPagine(doc: jsPDF) {
  const totale = doc.getNumberOfPages();
  for (let n = 1; n <= totale; n += 1) {
    doc.setPage(n);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`${n} di ${totale}`, 194, 290, { align: "right" });
  }
  doc.setTextColor(0);
}

export function pdfPresaVisione(input: InputPdf): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 16;
  const width = 178;
  const titolo = input.tipo === "privacy" ? TITOLO_PRIVACY : TITOLO_CONDIZIONI;
  const blocchi = input.tipo === "privacy" ? BLOCCHI_PRIVACY : BLOCCHI_CONDIZIONI;
  let y = 26;

  const nuova = () => {
    doc.addPage();
    y = 26;
  };

  const limiteTesto = 258;
  const passoDi = (size: number) => size * 0.42 + 1.8;
  const misura = (testo: string, size: number, style: "normal" | "bold" = "normal") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const righe = doc.splitTextToSize(testo, width) as string[];
    return righe.length * passoDi(size);
  };

  const scrivi = (
    testo: string,
    size = 10,
    style: "normal" | "bold" = "normal",
    soffitto = limiteTesto
  ) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(15, 23, 42);
    const righe = doc.splitTextToSize(testo, width) as string[];
    const passo = passoDi(size);
    for (const riga of righe) {
      if (y > soffitto) nuova();
      doc.text(riga, left, y);
      y += passo;
    }
  };

  scrivi(titolo, 14, "bold");
  scrivi("Presa visione", 10, "bold");
  y += 2;
  for (const blocco of blocchi as BloccoDocumento[]) {
    const hTitolo = blocco.titolo ? 1.5 + misura(blocco.titolo, 11, "bold") : 0;
    const hTesto = misura(blocco.testo, 10);
    const minimo = hTitolo + Math.min(hTesto, passoDi(10) * 2);
    if (y + minimo > limiteTesto) nuova();
    if (blocco.titolo) {
      y += 1.5;
      scrivi(blocco.titolo, 11, "bold");
    }
    scrivi(blocco.testo);
    y += 1.2;
  }

  const fraseMarketing =
    "In merito al trattamento dei Dati Personali per finalità di marketing di prodotti e/o servizi del Titolare.";
  const hSpunte = input.tipo === "privacy" ? 22 + misura(fraseMarketing, 10) : 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const nomeRighe = doc.splitTextToSize(`Firma: ${input.firmatario}`, 76) as string[];
  const hNome = Math.max(1, nomeRighe.length) * 5;
  const hTimbro = input.timbro ? altezzaTimbro(doc, input.timbro, 76) : 0;
  const hChiusura = 4 + misura("Per presa visione", 11, "bold") + 2 + hSpunte + 4 + hNome + hTimbro;
  if (y + hChiusura > 258) nuova();
  y += 4;
  scrivi("Per presa visione", 11, "bold", 258);
  y += 2;
  if (input.tipo === "privacy") {
    spunta(doc, left, y, "Accetto Informativa Privacy", true);
    y += 7;
    spunta(doc, left, y, "Presto il consenso", input.consensoMarketing === "presto");
    y += 7;
    spunta(doc, left, y, "Nego il consenso", input.consensoMarketing === "nego");
    y += 8;
    scrivi(fraseMarketing, 10, "normal", 258);
  } else {
    spunta(doc, left, y, "Accetto Condizioni generali di vendita", true);
    y += 8;
  }
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`Data: ${input.dataFirma}`, left, y);
  let yNome = y;
  for (const riga of nomeRighe) {
    doc.text(riga, 118, yNome);
    yNome += 5;
  }
  if (input.timbro) disegnaTimbroSottoNome(doc, 118, yNome - 5, input.timbro, 76);

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
  numeraPagine(doc);
  doc.setProperties({ title: titolo });
  return Buffer.from(doc.output("arraybuffer"));
}
