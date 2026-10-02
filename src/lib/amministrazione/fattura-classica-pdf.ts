import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { FatturaClassicaStampaModel } from "@/lib/amministrazione/fattura-classica-stampa";
import { prezzoScontatoUnitario } from "@/lib/amministrazione/fatture";
import { formatPreventivoDataIt } from "@/lib/amministrazione/preventivo-letterhead";
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

/** 20/2026 → 20, data ISO → 15-10-2026. Esempio: 1_20_15-10-2026.pdf */
export function nomePdfFatturaCommercialista(input: {
  numeroSequenza: number | null;
  numeroFattura: string;
  data: string;
}): string {
  const seq =
    input.numeroSequenza != null ? String(input.numeroSequenza) : "senza";
  const prima = input.numeroFattura.trim().split("/")[0]?.trim() ?? "";
  const num = prima.replace(/[^\w-]+/g, "") || "fattura";
  return `${seq}_${num}_${dataFile(input.data)}.pdf`;
}

function dataFile(raw: string): string {
  const t = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const it = /^(\d{2})[/.-](\d{2})[/.-](\d{4})/.exec(t);
  if (it) return `${it[1]}-${it[2]}-${it[3]}`;
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
}): FilePdf {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const m = input.model;
  const data = dataLunga(m.dataDocumento);
  const right = 198;
  let y = 14;

  if (input.showSequenza && input.numeroSequenza != null) {
    doc.setFont("times", "italic");
    doc.setFontSize(18);
    doc.setTextColor(148, 163, 184);
    doc.text(String(input.numeroSequenza), 14, 12);
    doc.setTextColor(15, 23, 42);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
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
  y = testoDestra(doc, `FATTURA nr. ${testo(m.numero)} del ${data}`, right, y);
  if (m.destinatario.sdi.trim()) {
    doc.setFontSize(10);
    y = testoDestra(doc, `SDI ${m.destinatario.sdi.trim()}`, right, y);
  }

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.3);
  doc.line(12, y, right, y);
  y += 4;
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

  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    theme: "plain",
    head: [["Prodotto", "Qty", "Listino", "Sconto", "Netto", "IVA"]],
    body:
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
          }),
    styles: {
      fontSize: 8,
      textColor: [15, 23, 42],
      cellPadding: 1.2,
      overflow: "linebreak",
    },
    headStyles: {
      fontStyle: "bold",
      textColor: [71, 85, 105],
      fillColor: [255, 255, 255],
    },
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: 30, halign: "right" },
      2: { cellWidth: 28, halign: "right" },
      3: { cellWidth: 20, halign: "right" },
      4: { cellWidth: 28, halign: "right" },
      5: { cellWidth: 18, halign: "right" },
    },
  });

  const after =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? y;
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
  const pay = [
    testo(m.pagamento),
    `Banca: ${testo(m.banca)}`,
    `IBAN: ${m.iban.trim() ? formatIbanDisplay(m.iban) : "—"}`,
    `BIC: ${testo(m.bic)}`,
    `Importo: ${euro(m.totale)} €`,
    `Causale: Pagamento Fattura n. ${testo(m.numero)} del ${data}.`,
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
  doc.text("Totale Fattura", 108, boxY + 34);
  doc.text(`${euro(m.totale)} €`, 194, boxY + 34, { align: "right" });

  const foot = 284;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(testo(m.emittente.ragioneSociale), 105, foot, { align: "center" });
  doc.setFont("helvetica", "normal");
  const pie = [m.emittente.via, m.emittente.capCitta, m.emittente.email]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(" - ");
  doc.text(pie || "—", 105, foot + 4, { align: "center" });
  if (m.emittente.telefono.trim()) {
    doc.text(`Tel. ${m.emittente.telefono.trim()}`, 105, foot + 8, {
      align: "center",
    });
  }

  return { fileName: input.fileName, blob: doc.output("blob") };
}

export function buildPaperFatturaPdf(input: {
  model: PaperInvoiceModel;
  numeroSequenza: number | null;
  fileName: string;
}): FilePdf {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const m = input.model;
  const data = dataLunga(m.data ?? "");
  if (input.numeroSequenza != null) {
    doc.setFont("times", "italic");
    doc.setFontSize(18);
    doc.setTextColor(148, 163, 184);
    doc.text(String(input.numeroSequenza), 14, 12);
    doc.setTextColor(15, 23, 42);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  let yTestata = testoDestra(doc, testo(m.mittente.ragioneSociale), 198, 16) + 1.2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  yTestata = testoDestra(
    doc,
    `FATTURA nr. ${testo(m.numero)} del ${data}`,
    198,
    yTestata
  );
  if (m.destinatario.sdi.trim()) {
    yTestata = testoDestra(
      doc,
      `SDI ${m.destinatario.sdi.trim()}`,
      198,
      yTestata
    );
  }
  const dopoAvviso = drawAvvisoEstero(
    doc,
    m.nazioneEstera ?? null,
    Math.max(32, yTestata + 2)
  );
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(testo(m.destinatario.ragioneSociale), 12, dopoAvviso + 6);
  doc.setFont("helvetica", "normal");
  autoTable(doc, {
    startY: dopoAvviso + 10,
    margin: { left: 12, right: 12 },
    theme: "plain",
    head: [["Descrizione", "Qty", "Prezzo", "IVA", "Importo"]],
    body: m.righe.map((r) => [
      r.descrizione,
      `${r.quantita} ${r.unitaMisura}`,
      `${euro(r.prezzo)} €`,
      `${r.ivaPercentuale}%`,
      `${euro(r.importo)} €`,
    ]),
    styles: { fontSize: 8, cellPadding: 1.2 },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
  });
  const after =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? 60;
  doc.setFont("helvetica", "bold");
  doc.text(`Totale ${euro(m.totale)} €`, 198, after + 10, { align: "right" });
  return { fileName: input.fileName, blob: doc.output("blob") };
}

type CartellaPdf = {
  getFileHandle: (
    name: string,
    opts: { create: boolean }
  ) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

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
