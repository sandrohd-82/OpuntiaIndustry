import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  hasActiveProdottiPropriFilters,
  type ProdottoProprio,
  type ProdottiPropriFilters,
} from "@/lib/amministrazione/prodotti-propri";

function formatDateTime(date = new Date()): string {
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function describeFilters(filters: ProdottiPropriFilters): string[] {
  if (!hasActiveProdottiPropriFilters(filters)) {
    return ["Nessun filtro applicato — elenco completo"];
  }

  const lines: string[] = [];

  if (filters.showBio && !filters.showConvenzionale) {
    lines.push("Tipologia: solo biologici");
  } else if (!filters.showBio && filters.showConvenzionale) {
    lines.push("Tipologia: solo convenzionali");
  } else if (!filters.showBio && !filters.showConvenzionale) {
    lines.push("Tipologia: nessuna (bio e convenzionale disattivati)");
  }

  const codice = filters.codice.trim();
  if (codice) lines.push(`Targa/codice contiene: “${codice}”`);

  const text = filters.textQuery.trim();
  if (text) {
    const campo =
      filters.textField === "nome"
        ? "Nome"
        : filters.textField === "note"
          ? "Note"
          : "Nome e Note";
    lines.push(`Testo “${text}” su ${campo}`);
  }

  return lines.length > 0 ? lines : ["Filtri attivi"];
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 40);
}

export function exportProdottiPropriPdf(
  prodotti: ProdottoProprio[],
  filters: ProdottiPropriFilters
): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  let y = 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Prodotti propri", marginX, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`Esportato il ${formatDateTime()}`, marginX, y);
  y += 5;
  doc.text(`Record esportati: ${prodotti.length}`, marginX, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30);
  doc.text("Filtri", marginX, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(60);
  for (const line of describeFilters(filters)) {
    const wrapped = doc.splitTextToSize(line, pageWidth - marginX * 2);
    doc.text(wrapped, marginX, y);
    y += wrapped.length * 4.5;
  }
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [["Codice", "Nome", "Tipologia", "Note"]],
    body: prodotti.map((p) => [
      p.codice,
      p.nome,
      p.isBio ? "Bio" : "Convenzionale",
      p.note || "—",
    ]),
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 2.5,
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
      0: { cellWidth: 32, fontStyle: "bold" },
      1: { cellWidth: 50 },
      2: { cellWidth: 28 },
      3: { cellWidth: "auto" },
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
  const suffix = hasActiveProdottiPropriFilters(filters)
    ? "_filtrati"
    : "_completi";
  doc.save(`prodotti-propri${suffix}_${safeFilenamePart(stamp)}.pdf`);
}
