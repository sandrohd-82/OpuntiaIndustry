import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  totalsFromFatturaRighe,
  type FatturaA4Riga,
  type FatturaDestinatarioSnapshot,
} from "@/lib/amministrazione/fattura-a4-documento";
import { prezzoScontatoUnitario } from "@/lib/amministrazione/fatture";
import { AGRINSICILIA_LETTERHEAD } from "@/lib/amministrazione/preventivo-letterhead";

function euro(n: number) {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function dataIt(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (y && m && d) return `${d}/${m}/${y}`;
  return iso;
}

function safeFilePart(value: string) {
  return value.replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(0, 48);
}

export function fatturaA4PdfFileName(numeroFattura: string) {
  return `Fattura_${safeFilePart(numeroFattura || "bozza")}.pdf`;
}

export function buildFatturaA4PdfBlob(input: {
  numeroFattura: string;
  dataDocumento: string;
  destinatario: FatturaDestinatarioSnapshot;
  righe: FatturaA4Riga[];
  noteDocumento: string;
}): { blob: Blob; fileName: string } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = AGRINSICILIA_LETTERHEAD;
  const totals = totalsFromFatturaRighe(input.righe);
  let y = 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(L.ragioneSociale, 14, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(L.indirizzo, 14, y);
  y += 4;
  doc.text(
    `P.IVA / C.F. ${L.partitaIva} · ${L.email} · ${L.sito}`,
    14,
    y
  );
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("FATTURA", 14, y);
  doc.setFontSize(10);
  doc.text(input.numeroFattura || "N/ANNO", 196, y, { align: "right" });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Data: ${dataIt(input.dataDocumento)}`, 196, y, { align: "right" });
  y += 8;

  const dest = input.destinatario;
  doc.setFont("helvetica", "bold");
  doc.text("Destinatario", 14, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  const destLines = [
    dest.ragioneSociale,
    dest.partitaIva ? `P.IVA ${dest.partitaIva}` : "",
    dest.codiceFiscale ? `C.F. ${dest.codiceFiscale}` : "",
    [dest.sede.indirizzo, dest.sede.cap, dest.sede.citta, dest.sede.provincia]
      .filter(Boolean)
      .join(" "),
    dest.email,
  ].filter(Boolean);
  for (const line of destLines) {
    doc.text(line, 14, y);
    y += 4;
  }
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [["Codice", "Descrizione", "Qty", "Listino", "Sconto", "Netto", "IVA"]],
    body: input.righe.map((r) => [
      r.codice,
      r.descrizione,
      `${r.quantita} ${r.unitaMisura}`,
      `${euro(r.prezzoUnitario)} €`,
      r.scontoPercentuale > 0 ? `${r.scontoPercentuale} %` : "—",
      `${euro(prezzoScontatoUnitario(r.prezzoUnitario, r.scontoPercentuale))} €`,
      `${r.ivaPercentuale} %`,
    ]),
    styles: { fontSize: 8, cellPadding: 1.4 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
    },
    margin: { left: 14, right: 14 },
  });

  const after = (doc as jsPDF & { lastAutoTable?: { finalY: number } })
    .lastAutoTable?.finalY;
  y = (after ?? y) + 8;
  doc.setFont("helvetica", "normal");
  doc.text(`Imponibile: ${euro(totals.imponibile)} €`, 196, y, {
    align: "right",
  });
  y += 5;
  doc.text(`IVA: ${euro(totals.imposta)} €`, 196, y, { align: "right" });
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text(`Totale: ${euro(totals.totale)} €`, 196, y, { align: "right" });

  if (input.noteDocumento.trim()) {
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Note", 14, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    const notes = doc.splitTextToSize(input.noteDocumento.trim(), 182);
    doc.text(notes, 14, y);
  }

  const fileName = fatturaA4PdfFileName(input.numeroFattura);
  return { blob: doc.output("blob"), fileName };
}
