import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatSedeBreve,
  hasActiveClientiFilters,
  volumeAcquistoClienteOf,
  type Cliente,
  type ClientiFilters,
  type SedeCliente,
} from "@/lib/amministrazione/clienti";
import type { PdfDetailLevel } from "@/lib/amministrazione/pdf-export";

function formatDateTime(date = new Date()): string {
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function describeExport(
  filters: ClientiFilters,
  selectedCount: number,
  mode: "all-filtered" | "selection"
): string[] {
  if (mode === "selection") {
    return [`Selezione manuale: ${selectedCount} aziende`];
  }

  if (!hasActiveClientiFilters(filters)) {
    return ["Nessun filtro applicato — elenco completo"];
  }

  const lines: string[] = [];
  if (filters.letter) lines.push(`Iniziale ragione sociale: ${filters.letter}`);
  if (filters.citta.trim()) lines.push(`Città: ${filters.citta.trim()}`);
  if (filters.query.trim()) {
    lines.push(`Ricerca: “${filters.query.trim()}”`);
  }
  if (filters.volume === "0") lines.push("Volume: nessun prodotto collegato");
  if (filters.volume === "1-3") lines.push("Volume: 1–3 prodotti collegati");
  if (filters.volume === "4+") lines.push("Volume: 4+ prodotti collegati");
  return lines.length ? lines : ["Filtri attivi"];
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 40);
}

function formatSedeCompleta(sede: SedeCliente): string {
  const line = [
    sede.indirizzo,
    [sede.cap, sede.citta, sede.provincia].filter(Boolean).join(" "),
    sede.nazione,
  ]
    .filter(Boolean)
    .join(" · ");
  return line || "—";
}

function writeHeader(
  doc: jsPDF,
  title: string,
  clienti: Cliente[],
  filters: ClientiFilters,
  selectionMode: boolean,
  detailLabel: string
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;
  let y = 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text(title, marginX, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`Esportato il ${formatDateTime()}`, marginX, y);
  y += 5;
  doc.text(`Aziende esportate: ${clienti.length}`, marginX, y);
  y += 5;
  doc.text(`Dettaglio: ${detailLabel}`, marginX, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30);
  doc.text("Criteri", marginX, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(60);
  for (const line of describeExport(
    filters,
    clienti.length,
    selectionMode ? "selection" : "all-filtered"
  )) {
    const wrapped = doc.splitTextToSize(line, pageWidth - marginX * 2);
    doc.text(wrapped, marginX, y);
    y += wrapped.length * 4.5;
  }
  return y + 2;
}

function addPageFooters(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `Pagina ${i} di ${pageCount}`,
      pageWidth - 12,
      doc.internal.pageSize.getHeight() - 8,
      { align: "right" }
    );
  }
}

function exportPrincipali(
  clienti: Cliente[],
  filters: ClientiFilters,
  selectionMode: boolean
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const y = writeHeader(
    doc,
    "Clienti — dati principali",
    clienti,
    filters,
    selectionMode,
    "Solo riga elenco"
  );

  autoTable(doc, {
    startY: y,
    head: [
      ["Targa", "R. Sociale", "P. IVA", "Sede Amm.", "Sede Mag.", "Prodotti"],
    ],
    body: clienti.map((c) => [
      c.codiceTarga,
      c.ragioneSociale,
      c.partitaIva,
      formatSedeBreve(c.sedeAmministrativa),
      formatSedeBreve(c.sedeMagazzino),
      c.prodottiAcquistati.length ? c.prodottiAcquistati.join(", ") : "—",
    ]),
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 18, fontStyle: "bold" },
      1: { cellWidth: 48 },
      2: { cellWidth: 28 },
      3: { cellWidth: 42 },
      4: { cellWidth: 42 },
      5: { cellWidth: 55 },
    },
    margin: { left: 12, right: 12 },
  });

  addPageFooters(doc);
  return doc;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - 14) {
    doc.addPage();
    return 16;
  }
  return y;
}

function writeLabelValue(
  doc: jsPDF,
  label: string,
  value: string,
  y: number,
  marginX: number,
  contentWidth: number
): number {
  y = ensureSpace(doc, y, 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(40);
  doc.text(label, marginX, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60);
  const wrapped = doc.splitTextToSize(value || "—", contentWidth);
  doc.text(wrapped, marginX, y);
  return y + wrapped.length * 4.2 + 2;
}

function exportCompleta(
  clienti: Cliente[],
  filters: ClientiFilters,
  selectionMode: boolean
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;
  let y = writeHeader(
    doc,
    "Clienti — schede complete",
    clienti,
    filters,
    selectionMode,
    "Scheda completa"
  );

  clienti.forEach((c, index) => {
    y = ensureSpace(doc, y, 36);
    if (index > 0) {
      doc.setDrawColor(220);
      doc.line(marginX, y, pageWidth - marginX, y);
      y += 8;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 118, 110);
    doc.text(`${c.codiceTarga} — ${c.ragioneSociale}`, marginX, y);
    y += 7;

    y = writeLabelValue(doc, "Partita IVA", c.partitaIva, y, marginX, contentWidth);
    y = writeLabelValue(
      doc,
      "Sede amministrativa",
      formatSedeCompleta(c.sedeAmministrativa),
      y,
      marginX,
      contentWidth
    );
    y = writeLabelValue(
      doc,
      "Sede magazzino",
      formatSedeCompleta(c.sedeMagazzino),
      y,
      marginX,
      contentWidth
    );

    if (c.consegneAltraAzienda.length > 0) {
      y = ensureSpace(doc, y, 8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(40);
      doc.text("Consegne presso altre aziende", marginX, y);
      y += 5;
      for (const consegna of c.consegneAltraAzienda) {
        const text = `${consegna.ragioneSociale || "—"} — ${formatSedeCompleta(consegna)}`;
        y = ensureSpace(doc, y, 8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60);
        const wrapped = doc.splitTextToSize(`• ${text}`, contentWidth);
        doc.text(wrapped, marginX, y);
        y += wrapped.length * 4.2 + 1.5;
      }
      y += 1;
    } else {
      y = writeLabelValue(
        doc,
        "Consegne presso altre aziende",
        "Nessuna",
        y,
        marginX,
        contentWidth
      );
    }

    y = writeLabelValue(
      doc,
      "Prodotti acquistati",
      c.prodottiAcquistati.length
        ? c.prodottiAcquistati.join(", ")
        : "Nessuno",
      y,
      marginX,
      contentWidth
    );
    y = writeLabelValue(
      doc,
      "Volume (prodotti collegati)",
      String(volumeAcquistoClienteOf(c)),
      y,
      marginX,
      contentWidth
    );
    y += 4;
  });

  addPageFooters(doc);
  return doc;
}

export function exportClientiPdf(
  clienti: Cliente[],
  filters: ClientiFilters,
  options?: { selectionMode?: boolean; detailLevel?: PdfDetailLevel }
): void {
  const selectionMode = Boolean(options?.selectionMode);
  const detailLevel = options?.detailLevel ?? "principali";
  const doc =
    detailLevel === "completa"
      ? exportCompleta(clienti, filters, selectionMode)
      : exportPrincipali(clienti, filters, selectionMode);

  const stamp = new Date().toISOString().slice(0, 10);
  const scope = selectionMode
    ? "_selezione"
    : hasActiveClientiFilters(filters)
      ? "_filtrati"
      : "_elenco";
  const detail = detailLevel === "completa" ? "_schede" : "_principali";
  doc.save(`clienti${scope}${detail}_${safeFilenamePart(stamp)}.pdf`);
}
