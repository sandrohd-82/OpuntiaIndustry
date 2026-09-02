import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  listinoExportFilename,
  listinoExportRowCells,
  type ListinoExportMeta,
  type ListinoExportRow,
} from "@/lib/ecosystem/listino-export";

export function downloadListinoPdf(
  meta: ListinoExportMeta,
  rows: ListinoExportRow[]
): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;
  let y = 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Listino ${meta.codice}`, marginX, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60);
  const info = [
    `${meta.nome} · stato ${meta.statoLabel} · versione V${meta.versione} · lingua ${meta.locale.toUpperCase()}`,
    `Esportato il ${meta.exportedAt} da ${meta.actor}`,
    `Ambito: ${meta.scope === "selezione" ? "prodotti selezionati" : "listino completo"} · ${meta.prodottiCount} prodotti · ${meta.scontiCount} sconti`,
  ];
  for (const line of info) {
    doc.text(line, marginX, y);
    y += 4.5;
  }
  y += 2;

  autoTable(doc, {
    startY: y,
    head: [],
    body: rows.map(listinoExportRowCells),
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 1.6,
      overflow: "linebreak",
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 48 },
      2: { cellWidth: 36 },
      3: { cellWidth: 48 },
      4: { cellWidth: 28 },
      5: { cellWidth: 24 },
    },
    margin: { left: marginX, right: marginX },
    theme: "plain",
    didParseCell: (data) => {
      const row = rows[data.row.index];
      if (!row) return;
      if (row.kind === "product_head" || row.kind === "discount_head") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor =
          row.kind === "product_head" ? [15, 118, 110] : [51, 65, 85];
        data.cell.styles.textColor = 255;
      } else if (row.kind === "product") {
        data.cell.styles.fillColor = [236, 253, 245];
        data.cell.styles.fontStyle = "bold";
      } else if (row.kind === "spacer") {
        data.cell.styles.minCellHeight = 3;
        data.cell.styles.fillColor = [255, 255, 255];
      }
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `${meta.codice} · ${meta.statoLabel} · pagina ${i} di ${pageCount}`,
      pageWidth - marginX,
      doc.internal.pageSize.getHeight() - 6,
      { align: "right" }
    );
  }

  doc.save(listinoExportFilename(meta, "pdf"));
}
