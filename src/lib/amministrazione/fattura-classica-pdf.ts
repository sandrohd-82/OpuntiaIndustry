import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { FatturaClassicaStampaModel } from "@/lib/amministrazione/fattura-classica-stampa";
import { prezzoScontatoUnitario } from "@/lib/amministrazione/fatture";
import {
  AGRINSICILIA_COORDINATE,
  AGRINSICILIA_LETTERHEAD,
  formatPreventivoDataIt,
} from "@/lib/amministrazione/preventivo-letterhead";
import { formatIbanDisplay } from "@/lib/iban";
import type { PaperInvoiceModel } from "@/lib/amministrazione/paper-invoice";

function euro(n: number) {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function testo(value: string, vuoto = "—") {
  const t = value.trim();
  return t || vuoto;
}

/** N. provvisorio, data GG-MM-AA e numero fattura. Esempio: 15_11-08-26(63-Abf).pdf */
export function nomePdfFatturaCommercialista(input: {
  numeroSequenza: number | null;
  numeroFattura: string;
  data: string;
}): string {
  const seq =
    input.numeroSequenza != null ? String(input.numeroSequenza) : "senza";
  const num = numeroFileFattura(input.numeroFattura);
  return `${seq}_${dataFile(input.data)}(${num}).pdf`;
}

/**
 * Entrata: n. provvisorio, data fra parentesi, numero dato dal cliente.
 * Esempio: 15(11-08-26)63-Abf.pdf
 */
export function nomePdfEntrataCommercialista(input: {
  numeroSequenza: number | null;
  numeroFattura: string;
  data: string;
}): string {
  const seq =
    input.numeroSequenza != null ? String(input.numeroSequenza) : "senza";
  const num = numeroFileFattura(input.numeroFattura);
  return `${seq}(${dataFile(input.data)})${num}.pdf`;
}

/** Stessi nomi del download PDF, con suffisso se due fatture coincidono. */
export function nomiPdfUnivoci(
  inputs: { numeroSequenza: number | null; numeroFattura: string; data: string }[],
  formato: "classico" | "entrata" = "classico"
): string[] {
  const usati = new Map<string, number>();
  return inputs.map((input) => {
    let fileName =
      formato === "entrata"
        ? nomePdfEntrataCommercialista(input)
        : nomePdfFatturaCommercialista(input);
    const gia = usati.get(fileName) ?? 0;
    usati.set(fileName, gia + 1);
    if (gia > 0) fileName = fileName.replace(/\.pdf$/i, `_${gia + 1}.pdf`);
    return fileName;
  });
}

function numeroFileFattura(raw: string): string {
  const pulito = raw
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/[^\w.\-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return pulito || "fattura";
}

function dataFile(raw: string): string {
  const t = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1].slice(2)}`;
  const it = /^(\d{2})[/.-](\d{2})[/.-](\d{2,4})/.exec(t);
  if (it) return `${it[1]}-${it[2]}-${it[3].slice(-2)}`;
  return "senza-data";
}

function dataLunga(raw: string): string {
  const t = raw.trim();
  if (!t) return "—";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return formatPreventivoDataIt(`${iso[1]}-${iso[2]}-${iso[3]}`);
  return t;
}

type FilePdf = { fileName: string; blob: Blob };

export type LogoIntestazione = {
  dataUrl: string;
  widthMm: number;
  heightMm: number;
};

/** Logo della fattura inviata al cliente. Manca fuori dal browser. */
export async function caricaLogoIntestazione(): Promise<LogoIntestazione | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(AGRINSICILIA_LETTERHEAD.logoSrc);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const misura = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error("logo"));
      img.src = dataUrl;
    });
    const widthMm = 72;
    const heightMm =
      misura.w > 0 ? Math.min(28, (widthMm * misura.h) / misura.w) : 18;
    return { dataUrl, widthMm, heightMm };
  } catch {
    return null;
  }
}

type ColonnaTabella = {
  titolo: string;
  larghezza: number;
  align: "left" | "right";
};

/** Griglia con il titolo sulla stessa linea dei valori della colonna. */
function disegnaTabella(
  doc: jsPDF,
  y: number,
  colonne: ColonnaTabella[],
  body: string[][]
): number {
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    theme: "grid",
    tableWidth: 186,
    head: [colonne.map((colonna) => colonna.titolo)],
    body,
    styles: {
      font: "helvetica",
      fontSize: 8,
      textColor: [15, 23, 42],
      lineColor: [148, 163, 184],
      lineWidth: 0.2,
      cellPadding: { top: 1.8, right: 1.5, bottom: 1.8, left: 1.5 },
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: "bold",
      fontSize: 8,
      valign: "middle",
      minCellHeight: 8,
      lineColor: [100, 116, 139],
      lineWidth: 0.25,
    },
    columnStyles: Object.fromEntries(
      colonne.map((colonna, index) => [
        index,
        { cellWidth: colonna.larghezza, halign: colonna.align },
      ])
    ),
    didParseCell: (data) => {
      const colonna = colonne[data.column.index];
      if (!colonna) return;
      data.cell.styles.halign = colonna.align;
      data.cell.styles.valign = "middle";
    },
  });
  return (
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? y
  );
}

const COLONNE_FATTURA: ColonnaTabella[] = [
  { titolo: "Prodotto", larghezza: 78, align: "left" },
  { titolo: "Qty", larghezza: 22, align: "right" },
  { titolo: "Listino", larghezza: 24, align: "right" },
  { titolo: "Sconto", larghezza: 18, align: "right" },
  { titolo: "Netto", larghezza: 26, align: "right" },
  { titolo: "IVA", larghezza: 18, align: "right" },
];

/** Stessa testata della fattura che parte verso il cliente. */
function disegnaIntestazioneInviata(
  doc: jsPDF,
  input: { logo: LogoIntestazione | null; titolo: string; sdi: string; y: number }
): number {
  const L = AGRINSICILIA_LETTERHEAD;
  const right = 198;
  let y = input.y;
  if (input.logo) {
    const formato = input.logo.dataUrl.includes("image/jpeg") ? "JPEG" : "PNG";
    doc.addImage(
      input.logo.dataUrl,
      formato,
      12,
      y - 2,
      input.logo.widthMm,
      input.logo.heightMm
    );
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  y = testoDestra(doc, L.ragioneSociale, right, y, 108);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  y = testoDestra(doc, L.indirizzo, right, y, 108);
  y = testoDestra(
    doc,
    `P.iva ${L.partitaIva} - C.F. ${L.codiceFiscale}`,
    right,
    y,
    108
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  y = testoDestra(doc, input.titolo, right, y, 108) + 0.6;
  if (input.sdi.trim()) {
    doc.setFontSize(10);
    y = testoDestra(doc, `SDI ${input.sdi.trim()}`, right, y, 108);
  }
  const sottoLogo = input.logo ? input.y - 2 + input.logo.heightMm + 3 : y;
  y = Math.max(y + 1.5, sottoLogo);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.3);
  doc.line(12, y, right, y);
  return y + 4;
}

/** Testo a destra che va a capo. Restituisce la y sotto l'ultima riga. */
function testoDestra(
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  maxWidth = 100
): number {
  const lines = doc.splitTextToSize(value, maxWidth) as string[];
  doc.text(lines, x, y, { align: "right" });
  const mm = (doc.getFontSize() * doc.getLineHeightFactor() * 25.4) / 72;
  return y + Math.max(lines.length, 1) * mm;
}

function drawAvvisoEstero(doc: jsPDF, nazione: string | null, y: number): number {
  if (!nazione) return y;
  doc.setDrawColor(180, 83, 9);
  doc.setFillColor(255, 251, 235);
  doc.rect(12, y, 186, 8, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(120, 53, 15);
  doc.text(`Fattura estera — ${nazione}`, 105, y + 5.4, { align: "center" });
  doc.setTextColor(15, 23, 42);
  return y + 8;
}

export function buildFatturaClassicaPdf(input: {
  model: FatturaClassicaStampaModel;
  numeroSequenza: number | null;
  showSequenza: boolean;
  fileName: string;
  /** Solo sulle emesse: stesso marchio della fattura inviata al cliente. */
  logo?: LogoIntestazione | null;
}): FilePdf {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const m = input.model;
  const data = dataLunga(m.dataDocumento);
  const right = 198;
  const inviata = !m.nascondiPiePagina;
  let y = 14;

  if (!inviata && input.showSequenza && input.numeroSequenza != null) {
    doc.setFont("times", "italic");
    doc.setFontSize(18);
    doc.setTextColor(148, 163, 184);
    doc.text(String(input.numeroSequenza), 14, 12);
    doc.setTextColor(15, 23, 42);
  }

  doc.setTextColor(15, 23, 42);
  if (inviata) {
    y = disegnaIntestazioneInviata(doc, {
      logo: input.logo ?? null,
      titolo: `${m.notaCredito ? "NOTA DI CREDITO" : "FATTURA"} nr. ${testo(m.numero)} del ${data}`,
      sdi: m.destinatario.sdi,
      y,
    });
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    y = testoDestra(doc, "EMITTENTE", right, y);
    doc.setFontSize(11);
    y = testoDestra(doc, testo(m.emittente.ragioneSociale), right, y) + 1.2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    if (m.emittente.via.trim()) {
      y = testoDestra(doc, m.emittente.via.trim(), right, y);
    }
    if (m.emittente.capCitta.trim()) {
      y = testoDestra(doc, m.emittente.capCitta.trim(), right, y);
    }
    y = testoDestra(
      doc,
      `P.iva ${testo(m.emittente.partitaIva)} - C.F. ${testo(m.emittente.codiceFiscale)}`,
      right,
      y
    );
    if (m.emittente.email.trim()) {
      y = testoDestra(doc, m.emittente.email.trim(), right, y);
    }
    if (m.emittente.telefono.trim()) {
      y = testoDestra(doc, `Tel. ${m.emittente.telefono.trim()}`, right, y);
    }
    y += 1.5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    y = testoDestra(
      doc,
      `${m.notaCredito ? "NOTA DI CREDITO" : "FATTURA"} nr. ${testo(m.numero)} del ${data}`,
      right,
      y
    );
  }
  if (!inviata && m.destinatario.sdi.trim()) {
    doc.setFontSize(10);
    y = testoDestra(doc, `SDI ${m.destinatario.sdi.trim()}`, right, y);
  }

  if (!inviata) {
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.3);
    doc.line(12, y, right, y);
    y += 4;
  }
  if (m.notaCredito) {
    doc.setFillColor(254, 236, 236);
    doc.setDrawColor(252, 165, 165);
    doc.rect(12, y, 186, 7, "FD");
    doc.setTextColor(127, 29, 29);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Nota di credito — importi in negativo", 105, y + 4.8, { align: "center" });
    doc.setTextColor(15, 23, 42);
    y += 11;
  }
  y = drawAvvisoEstero(doc, m.nazioneEstera, y);
  y += 4;

  doc.setFontSize(8);
  doc.text("DESTINATARIO", 12, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const destY = y + 5;
  doc.text(testo(m.destinatario.ragioneSociale).toUpperCase(), 12, destY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let leftY = destY + 5;
  doc.text(`P.IVA: ${testo(m.destinatario.partitaIva)}`, 12, leftY);
  leftY += 4;
  doc.text(`CF: ${testo(m.destinatario.codiceFiscale)}`, 12, leftY);
  leftY += 4;
  if (m.destinatario.sdi.trim()) {
    doc.text(`SDI: ${m.destinatario.sdi.trim()}`, 12, leftY);
    leftY += 4;
  }
  doc.text(testo(m.destinatario.via, ""), right, destY, { align: "right" });
  doc.text(testo(m.destinatario.capCitta, "").toUpperCase(), right, destY + 5, {
    align: "right",
  });
  y = Math.max(leftY, destY + 10) + 4;

  const rows = Math.max(m.righe.length, 1);
  const tableGuess = 10 + rows * 6;
  const boxH = 46;
  const footerTop = 276;
  const free = footerTop - y - tableGuess - boxH;
  const gap = Math.max(6, Math.min(18, free / 2));
  y += gap;

  const after = disegnaTabella(
    doc,
    y,
    COLONNE_FATTURA,
    m.righe.length === 0
      ? [["Nessuna riga nello SDI", "", "", "", "", ""]]
      : m.righe.map((r) => {
          const netto = prezzoScontatoUnitario(
            r.prezzoUnitario,
            r.scontoPercentuale
          );
          const nome = [r.codice, r.descrizione].filter(Boolean).join(" — ");
          return [
            nome,
            `${r.quantita} ${r.unitaMisura}`,
            `${euro(r.prezzoUnitario)} €`,
            r.scontoPercentuale > 0 ? `${r.scontoPercentuale} %` : "—",
            `${euro(netto)} €`,
            `${r.ivaPercentuale}%`,
          ];
        })
  );
  let boxY = after + gap;
  if (boxY + boxH > footerTop - 4) boxY = after + 6;
  if (boxY + boxH > footerTop - 2) boxY = Math.max(after + 4, footerTop - boxH);

  doc.setDrawColor(15, 23, 42);
  doc.rect(12, boxY, 186, boxH);
  doc.line(105, boxY, 105, boxY + boxH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Pagamento", 15, boxY + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const banca = inviata ? AGRINSICILIA_COORDINATE.banca : m.banca;
  const iban = inviata ? AGRINSICILIA_COORDINATE.iban : m.iban;
  const bic = inviata ? AGRINSICILIA_COORDINATE.bic : m.bic;
  const pay = [
    testo(m.pagamento),
    `Banca: ${testo(banca)}`,
    `IBAN: ${iban.trim() ? formatIbanDisplay(iban) : "—"}`,
    `BIC: ${testo(bic)}`,
    `Importo: ${euro(m.totale)} €`,
    `Causale: ${m.notaCredito ? "Nota di credito" : "Pagamento Fattura"} n. ${testo(m.numero)} del ${data}.`,
  ];
  let py = boxY + 11;
  for (const line of pay) {
    const wrapped = doc.splitTextToSize(line, 86);
    doc.text(wrapped, 15, py);
    py += wrapped.length * 3.6;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Totali", 108, boxY + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Imponibile", 108, boxY + 16);
  doc.text(`${euro(m.imponibile)} €`, 194, boxY + 16, { align: "right" });
  doc.text(
    m.aliquote.length === 1
      ? `Totale IVA ${m.aliquote[0].aliquota}%`
      : "Totale IVA",
    108,
    boxY + 22
  );
  doc.text(`${euro(m.imposta)} €`, 194, boxY + 22, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.line(108, boxY + 28, 194, boxY + 28);
  doc.text(m.notaCredito ? "Totale nota di credito" : "Totale Fattura", 108, boxY + 34);
  doc.text(`${euro(m.totale)} €`, 194, boxY + 34, { align: "right" });

  if (!m.nascondiPiePagina) {
    const foot = 284;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(AGRINSICILIA_LETTERHEAD.ragioneSociale, 105, foot, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text(
      `${AGRINSICILIA_LETTERHEAD.sito} - ${AGRINSICILIA_LETTERHEAD.email}`,
      105,
      foot + 4,
      { align: "center" }
    );
    doc.text(`cell: ${AGRINSICILIA_LETTERHEAD.cell}`, 105, foot + 8, {
      align: "center",
    });
  }

  return { fileName: input.fileName, blob: doc.output("blob") };
}

const COLONNE_RICEVUTA: ColonnaTabella[] = [
  { titolo: "Descrizione", larghezza: 78, align: "left" },
  { titolo: "Qty", larghezza: 22, align: "right" },
  { titolo: "Prezzo", larghezza: 24, align: "right" },
  { titolo: "Sconto", larghezza: 18, align: "right" },
  { titolo: "IVA", larghezza: 18, align: "right" },
  { titolo: "Importo", larghezza: 26, align: "right" },
];

export function buildPaperFatturaPdf(input: {
  model: PaperInvoiceModel;
  numeroSequenza: number | null;
  fileName: string;
  /** Fattura o nota emessa da noi: stessa testata di quella inviata al cliente. */
  comeInviata?: boolean;
  notaCredito?: boolean;
  logo?: LogoIntestazione | null;
}): FilePdf {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const m = input.model;
  const data = dataLunga(m.data ?? "");
  const nota = Boolean(input.comeInviata && input.notaCredito);
  let y = 16;
  if (input.comeInviata) {
    y = disegnaIntestazioneInviata(doc, {
      logo: input.logo ?? null,
      titolo: `${nota ? "NOTA DI CREDITO" : "FATTURA"} nr. ${testo(m.numero)} del ${data}`,
      sdi: m.destinatario.sdi,
      y,
    });
  } else {
    if (input.numeroSequenza != null) {
      doc.setFont("times", "italic");
      doc.setFontSize(18);
      doc.setTextColor(148, 163, 184);
      doc.text(String(input.numeroSequenza), 14, 12);
      doc.setTextColor(15, 23, 42);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    y = testoDestra(doc, "EMITTENTE", 198, 16);
    doc.setFontSize(11);
    y = testoDestra(doc, testo(m.mittente.ragioneSociale), 198, y) + 1;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const titolo = (m.documentoTitolo ?? "Fattura").toUpperCase();
    y = testoDestra(doc, `${titolo} nr. ${testo(m.numero)} del ${data}`, 198, y);
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.3);
    doc.line(12, y, 198, y);
    y += 6;
  }
  y = drawAvvisoEstero(doc, m.nazioneEstera ?? null, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text("DESTINATARIO", 12, y + 5);
  doc.setFontSize(11);
  doc.text(testo(m.destinatario.ragioneSociale).toUpperCase(), 12, y + 10);
  const after = disegnaTabella(
    doc,
    y + 16,
    input.comeInviata ? COLONNE_FATTURA : COLONNE_RICEVUTA,
    m.righe.length === 0
      ? [["Nessuna riga", "", "", "", "", ""]]
      : m.righe.map((r) => {
          const netto = prezzoScontatoUnitario(r.prezzo, r.scontoPercentuale);
          if (input.comeInviata) {
            return [
              r.descrizione,
              `${r.quantita} ${r.unitaMisura}`.trim(),
              `${euro(r.prezzo)} €`,
              r.scontoPercentuale > 0 ? `${r.scontoPercentuale} %` : "—",
              `${euro(netto)} €`,
              `${r.ivaPercentuale}%`,
            ];
          }
          return [
            r.descrizione,
            `${r.quantita} ${r.unitaMisura}`.trim(),
            `${euro(r.prezzo)} €`,
            r.scontoPercentuale > 0 ? `${r.scontoPercentuale} %` : "—",
            `${r.ivaPercentuale}%`,
            `${euro(r.importo)} €`,
          ];
        })
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(
    `${nota ? "Totale nota di credito" : "Totale"} ${euro(m.totale)} €`,
    198,
    after + 8,
    { align: "right" }
  );
  return { fileName: input.fileName, blob: doc.output("blob") };
}

type FileScrivibile = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

export type CartellaPdf = {
  getDirectoryHandle: (
    name: string,
    opts: { create: boolean }
  ) => Promise<CartellaPdf>;
  getFileHandle: (
    name: string,
    opts: { create: boolean }
  ) => Promise<FileScrivibile>;
};

/** Prima di scrivere: l'operatore sceglie la chiavetta o la cartella. Annullare non è un errore. */
export async function chiediCartellaScrittura(): Promise<CartellaPdf | null> {
  const picker = (
    window as Window & {
      showDirectoryPicker?: (opts: { mode: "readwrite" }) => Promise<CartellaPdf>;
    }
  ).showDirectoryPicker;
  if (!picker) {
    throw new Error(
      "Per scegliere dove salvare serve Chrome o Edge."
    );
  }
  try {
    return await picker({ mode: "readwrite" });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return null;
    throw err;
  }
}

/** Una pagina A4 con la foto dello scontrino. Excel apre il PDF, non il jpg. */
export async function blobImmagineInPdf(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("immagine"));
      el.src = url;
    });
    const maxLato = 2000;
    const scala = Math.min(1, maxLato / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scala));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scala));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const margin = 8;
    const maxW = 210 - margin * 2;
    const maxH = 297 - margin * 2;
    const rapporto = Math.min(maxW / canvas.width, maxH / canvas.height);
    const w = canvas.width * rapporto;
    const h = canvas.height * rapporto;
    doc.addImage(
      canvas.toDataURL("image/jpeg", 0.92),
      "JPEG",
      margin + (maxW - w) / 2,
      margin,
      w,
      h
    );
    return doc.output("blob");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function scriviFileInCartella(
  cartella: CartellaPdf,
  nome: string,
  contenuto: Blob
): Promise<void> {
  const handle = await cartella.getFileHandle(nome, { create: true });
  const writable = await handle.createWritable();
  await writable.write(contenuto);
  await writable.close();
}

/** Un click: chiede la cartella e scrive un PDF per fattura. */
export async function salvaPdfSeparati(files: FilePdf[]): Promise<number> {
  const unici = nomiUnici(files);
  const picker = (
    window as Window & {
      showDirectoryPicker?: (opts: { mode: "readwrite" }) => Promise<CartellaPdf>;
    }
  ).showDirectoryPicker;
  if (picker) {
    const dir = await picker({ mode: "readwrite" });
    for (const file of unici) {
      const handle = await dir.getFileHandle(file.fileName, { create: true });
      const writable = await handle.createWritable();
      await writable.write(file.blob);
      await writable.close();
    }
    return unici.length;
  }
  for (const file of unici) {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return unici.length;
}

function nomiUnici(files: FilePdf[]): FilePdf[] {
  const usati = new Map<string, number>();
  return files.map((file) => {
    const n = usati.get(file.fileName) ?? 0;
    usati.set(file.fileName, n + 1);
    if (n === 0) return file;
    return {
      ...file,
      fileName: file.fileName.replace(/\.pdf$/i, `_${n + 1}.pdf`),
    };
  });
}
