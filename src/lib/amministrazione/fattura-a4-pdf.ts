import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  totalsFromFatturaRighe,
  type FatturaA4Riga,
  type FatturaDestinatarioSnapshot,
} from "@/lib/amministrazione/fattura-a4-documento";
import { prezzoScontatoUnitario } from "@/lib/amministrazione/fatture";
import { formatIbanDisplay } from "@/lib/iban";
import {
  labelModalitaPagamentoFattura,
  labelTipoScadenza,
  type OrdinePagamentoPiano,
} from "@/lib/amministrazione/ordine-pagamento-piano";
import {
  AGRINSICILIA_COORDINATE,
  AGRINSICILIA_LETTERHEAD,
  formatDestinatarioIndirizzo,
  formatPreventivoDataIt,
  OPUNTIA_ITALIA_LOGO,
} from "@/lib/amministrazione/preventivo-letterhead";

function euro(n: number) {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function safeFilePart(value: string) {
  return value.replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(0, 48);
}

export function fatturaA4PdfFileName(numeroFattura: string, proforma = false) {
  const prefix = proforma ? "Proforma" : "Fattura";
  return `${prefix}_${safeFilePart(numeroFattura || "bozza")}.pdf`;
}

export const PROFORMA_DICITURA_FISCALE =
  "Documento privo di valenza fiscale emesso ai sensi dell'art. 21 D.P.R. 633/72. La fattura definitiva verrà emessa al saldo del pagamento.";

export type FatturaA4Logo = {
  dataUrl: string;
  widthMm: number;
  heightMm: number;
};

export type FatturaA4PdfInput = {
  numeroFattura: string;
  dataDocumento: string;
  destinatario: FatturaDestinatarioSnapshot;
  righe: FatturaA4Riga[];
  noteDocumento: string;
  proforma?: boolean;
  piano?: OrdinePagamentoPiano | null;
  commerciale?: { nome: string; telefono: string; email: string } | null;
  loghi?: {
    agrinsicilia: FatturaA4Logo | null;
    opuntia: FatturaA4Logo | null;
  } | null;
};

function testoDestra(
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  maxWidth: number
): number {
  const lines = doc.splitTextToSize(value, maxWidth) as string[];
  doc.text(lines, x, y, { align: "right" });
  const mm = (doc.getFontSize() * doc.getLineHeightFactor() * 25.4) / 72;
  return y + Math.max(lines.length, 1) * mm;
}

function formatoImmagine(dataUrl: string): "PNG" | "JPEG" {
  return dataUrl.includes("image/jpeg") ? "JPEG" : "PNG";
}

async function logoDaUrl(
  src: string,
  widthMm: number,
  maxH: number
): Promise<FatturaA4Logo | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(src);
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
    const heightMm =
      misura.w > 0 ? Math.min(maxH, (widthMm * misura.h) / misura.w) : maxH;
    return { dataUrl, widthMm, heightMm };
  } catch {
    return null;
  }
}

/** Stesso foglio della bozza ordine, con i loghi, per il download nel browser. */
export async function buildFatturaA4PdfPronto(
  input: Omit<FatturaA4PdfInput, "loghi">
): Promise<{ blob: Blob; fileName: string }> {
  const [agrinsicilia, opuntia] = await Promise.all([
    logoDaUrl(AGRINSICILIA_LETTERHEAD.logoSrc, 78, 28),
    logoDaUrl(OPUNTIA_ITALIA_LOGO.src, 22, 12),
  ]);
  return buildFatturaA4PdfBlob({
    ...input,
    loghi: { agrinsicilia, opuntia },
  });
}

/** PDF della bozza A4: intestazione, voci modificate, trasporto e totali. */
export function buildFatturaA4PdfBlob(input: FatturaA4PdfInput): {
  blob: Blob;
  fileName: string;
} {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = AGRINSICILIA_LETTERHEAD;
  const totals = totalsFromFatturaRighe(input.righe);
  const right = 196;
  const left = 14;
  let y = 14;
  const logo = input.loghi?.agrinsicilia ?? null;
  if (logo) {
    doc.addImage(
      logo.dataUrl,
      formatoImmagine(logo.dataUrl),
      left,
      y - 2,
      logo.widthMm,
      logo.heightMm
    );
  }
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  let rightY = testoDestra(doc, L.ragioneSociale, right, y, 96);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  rightY = testoDestra(doc, L.indirizzo, right, rightY, 96);
  rightY = testoDestra(
    doc,
    `P.iva ${L.partitaIva} - C.F. ${L.codiceFiscale}`,
    right,
    rightY,
    96
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const etichetta = input.proforma ? "PROFORMA" : "FATTURA";
  rightY =
    testoDestra(
      doc,
      `${etichetta} nr. ${input.numeroFattura || "NN/ANNO"} del ${formatPreventivoDataIt(input.dataDocumento)}`,
      right,
      rightY + 1,
      96
    ) + 1;
  const commerciale = input.commerciale;
  if (commerciale?.nome.trim()) {
    doc.setFontSize(8);
    rightY = testoDestra(doc, "Commerciale di riferimento", right, rightY, 96);
    doc.setFont("helvetica", "normal");
    rightY = testoDestra(doc, commerciale.nome.trim(), right, rightY, 96);
    if (commerciale.telefono.trim()) {
      rightY = testoDestra(
        doc,
        `Telefono ${commerciale.telefono.trim()}`,
        right,
        rightY,
        96
      );
    }
    if (commerciale.email.trim()) {
      rightY = testoDestra(
        doc,
        `Email ${commerciale.email.trim()}`,
        right,
        rightY,
        96
      );
    }
  }
  const sottoLogo = logo ? y - 2 + logo.heightMm + 3 : y;
  y = Math.max(rightY + 2, sottoLogo);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.3);
  doc.line(left, y, right, y);
  y += 6;

  if (input.proforma) {
    const lines = doc.splitTextToSize(PROFORMA_DICITURA_FISCALE, 176);
    const boxH = 8 + lines.length * 4.2;
    doc.setFillColor(220, 38, 38);
    doc.rect(left, y, 182, boxH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(lines, left + 4, y + 6);
    doc.setTextColor(15, 23, 42);
    y += boxH + 6;
  }

  const dest = input.destinatario;
  const addr = formatDestinatarioIndirizzo(dest.sede);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("DESTINATARIO", left, y);
  y += 5;
  doc.setFontSize(11);
  doc.text((dest.ragioneSociale || "Destinatario").toUpperCase(), left, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(addr.via, right, y, { align: "right" });
  y += 4.5;
  doc.text(`P.IVA: ${dest.partitaIva || "—"}`, left, y);
  doc.text((addr.capCitta || "").toUpperCase(), right, y, { align: "right" });
  y += 4.5;
  doc.text(`CF: ${dest.codiceFiscale || "—"}`, left, y);
  y += 8;

  const ivaUnica = input.righe.find((r) => r.ivaPercentuale > 0)?.ivaPercentuale;
  autoTable(doc, {
    startY: y,
    margin: { left, right: 14 },
    theme: "plain",
    head: [["Prodotto", "Qty", "Listino", "Sconto", "Netto", "IVA", "Tot"]],
    body: input.righe.map((r) => {
      const netto = prezzoScontatoUnitario(r.prezzoUnitario, r.scontoPercentuale);
      const totRiga = totalsFromFatturaRighe([r]).totale;
      const nome = [r.codice, r.descrizione].filter(Boolean).join(" — ");
      return [
        nome,
        `${r.quantita} ${r.unitaMisura}`,
        `${euro(r.prezzoUnitario)} €`,
        r.scontoPercentuale > 0 ? `${r.scontoPercentuale} %` : "—",
        `${euro(netto)} €`,
        `${r.ivaPercentuale}%`,
        `${euro(totRiga)} €`,
      ];
    }),
    styles: {
      font: "helvetica",
      fontSize: 8,
      textColor: [15, 23, 42],
      fillColor: [255, 255, 255],
      cellPadding: 1.3,
      lineWidth: 0,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [71, 85, 105],
      fontStyle: "bold",
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: 22, halign: "right" },
      2: { cellWidth: 22, halign: "right" },
      3: { cellWidth: 18, halign: "right" },
      4: { cellWidth: 20, halign: "right" },
      5: { cellWidth: 16, halign: "right" },
      6: { cellWidth: 22, halign: "right" },
    },
    didDrawCell: (data) => {
      if (data.section !== "head") return;
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.2);
      doc.line(
        data.cell.x,
        data.cell.y + data.cell.height,
        data.cell.x + data.cell.width,
        data.cell.y + data.cell.height
      );
    },
  });

  const after = (doc as jsPDF & { lastAutoTable?: { finalY: number } })
    .lastAutoTable?.finalY;
  y = (after ?? y) + 4;
  if (input.noteDocumento.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    const notes = doc.splitTextToSize(input.noteDocumento.trim(), 182);
    doc.text(notes, left, y);
    y += notes.length * 3.6 + 2;
  }
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.3);
  doc.line(left, y, right, y);
  y += 4;

  const piano = input.piano;
  const pagamento = piano
    ? labelModalitaPagamentoFattura(piano)
    : "Pagamento";
  const rate =
    piano?.modalita === "dilazione"
      ? piano.rate.map((rata, i) => {
          const quando =
            i === 0
              ? labelTipoScadenza(rata.tipoScadenza ?? piano.tipoUnica)
              : rata.dataPagamento
                ? formatPreventivoDataIt(rata.dataPagamento)
                : "data da definire";
          return `Rata ${i + 1}: ${quando} · ${euro(rata.importo)} €`;
        })
      : [];
  const payLines = [
    pagamento,
    ...rate,
    `Banca: ${AGRINSICILIA_COORDINATE.banca}`,
    `IBAN: ${formatIbanDisplay(AGRINSICILIA_COORDINATE.iban)}`,
    `BIC: ${AGRINSICILIA_COORDINATE.bic}`,
    `Importo: ${euro(totals.totale)} €`,
    `Causale: Pagamento Fattura n. ${input.numeroFattura || "—"} del ${formatPreventivoDataIt(input.dataDocumento)}.`,
  ];
  const boxH = Math.max(42, 16 + payLines.length * 3.8);
  if (y + boxH > 268) y = Math.max(y, 268 - boxH);
  doc.setDrawColor(15, 23, 42);
  doc.rect(left, y, 182, boxH);
  doc.line(105, y, 105, y + boxH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("Pagamento e dilazione", left + 3, y + 6);
  doc.text("Totali", 108, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  let py = y + 11;
  for (const line of payLines) {
    const wrapped = doc.splitTextToSize(line, 84) as string[];
    doc.text(wrapped, left + 3, py);
    py += wrapped.length * 3.5;
  }
  doc.setFontSize(9);
  doc.text("Imponibile", 108, y + 16);
  doc.text(`${euro(totals.imponibile)} €`, 192, y + 16, { align: "right" });
  const etichettaIva =
    ivaUnica != null ? `Totale IVA ${ivaUnica}%` : "Totale IVA";
  doc.text(etichettaIva, 108, y + 22);
  doc.text(`${euro(totals.imposta)} €`, 192, y + 22, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.line(108, y + 26, 192, y + 26);
  doc.text("Totale Fattura", 108, y + 32);
  doc.text(`${euro(totals.totale)} €`, 192, y + 32, { align: "right" });

  const foot = 284;
  const logoPiede = input.loghi?.opuntia ?? null;
  const logoTesta = input.loghi?.agrinsicilia ?? null;
  if (logoTesta || logoPiede) {
    const h = 11;
    const wTesta = logoTesta
      ? Math.min(28, (h * logoTesta.widthMm) / Math.max(logoTesta.heightMm, 1))
      : 0;
    const wPiede = logoPiede
      ? Math.min(28, (h * logoPiede.widthMm) / Math.max(logoPiede.heightMm, 1))
      : 0;
    const gap = 6;
    const totaleW = wTesta + (wTesta && wPiede ? gap : 0) + wPiede;
    let x = 105 - totaleW / 2;
    if (logoTesta) {
      doc.addImage(
        logoTesta.dataUrl,
        formatoImmagine(logoTesta.dataUrl),
        x,
        foot - 16,
        wTesta,
        h
      );
      x += wTesta + gap;
    }
    if (logoPiede) {
      doc.addImage(
        logoPiede.dataUrl,
        formatoImmagine(logoPiede.dataUrl),
        x,
        foot - 16,
        wPiede,
        h
      );
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(L.ragioneSociale, 105, foot, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.text(`${L.sito} - ${L.email}`, 105, foot + 4, { align: "center" });
  doc.text(`cell: ${L.cell}`, 105, foot + 8, { align: "center" });

  const fileName = fatturaA4PdfFileName(
    input.numeroFattura,
    Boolean(input.proforma)
  );
  return { blob: doc.output("blob"), fileName };
}
