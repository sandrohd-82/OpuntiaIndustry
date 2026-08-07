import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatSedeBreve,
  hasActiveFornitoriFilters,
  volumeAcquistoOf,
  type Fornitore,
  type FornitoriFilters,
} from "@/lib/amministrazione/fornitori";

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
  filters: FornitoriFilters,
  selectedCount: number,
  mode: "all-filtered" | "selection"
): string[] {
  if (mode === "selection") {
    return [`Selezione manuale: ${selectedCount} aziende`];
  }

  if (!hasActiveFornitoriFilters(filters)) {
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

export function exportFornitoriPdf(
  fornitori: Fornitore[],
  filters: FornitoriFilters,
  options?: { selectionMode?: boolean }
): void {
  const selectionMode = Boolean(options?.selectionMode);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;
  let y = 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Fornitori", marginX, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`Esportato il ${formatDateTime()}`, marginX, y);
  y += 5;
  doc.text(`Aziende esportate: ${fornitori.length}`, marginX, y);
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
    fornitori.length,
    selectionMode ? "selection" : "all-filtered"
  )) {
    const wrapped = doc.splitTextToSize(line, pageWidth - marginX * 2);
    doc.text(wrapped, marginX, y);
    y += wrapped.length * 4.5;
  }
  y += 2;

  autoTable(doc, {
    startY: y,
    head: [
      [
        "Targa",
        "R. Sociale",
        "P. IVA",
        "Città",
        "Sede amm.",
        "Prodotti",
        "Volume",
      ],
    ],
    body: fornitori.map((f) => [
      f.codiceTarga,
      f.ragioneSociale,
      f.partitaIva,
      f.sedeAmministrativa.citta || "—",
      formatSedeBreve(f.sedeAmministrativa),
      f.prodottiAcquistati.length
        ? f.prodottiAcquistati.join(", ")
        : "—",
      String(volumeAcquistoOf(f)),
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
      1: { cellWidth: 45 },
      2: { cellWidth: 28 },
      3: { cellWidth: 28 },
      4: { cellWidth: 40 },
      5: { cellWidth: 55 },
      6: { cellWidth: 18 },
    },
    margin: { left: marginX, right: marginX },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `Pagina ${i} di ${pageCount}`,
      pageWidth - marginX,
      doc.internal.pageSize.getHeight() - 8,
      { align: "right" }
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = selectionMode
    ? "_selezione"
    : hasActiveFornitoriFilters(filters)
      ? "_filtrati"
      : "_completi";
  doc.save(`fornitori${suffix}_${safeFilenamePart(stamp)}.pdf`);
}
