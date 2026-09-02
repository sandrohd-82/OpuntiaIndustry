import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  listinoExportFilename,
  listinoExportRowCells,
  type ListinoExportMeta,
  type ListinoExportRow,
} from "@/lib/ecosystem/listino-export";

function splitProductBlocks(rows: ListinoExportRow[]): ListinoExportRow[][] {
  const blocks: ListinoExportRow[][] = [];
  let current: ListinoExportRow[] = [];
  for (const row of rows) {
    if (row.kind === "spacer") {
      if (current.length) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    current.push(row);
  }
  if (current.length) blocks.push(current);
  return blocks;
}

export function downloadListinoPdf(
  meta: ListinoExportMeta,
  rows: ListinoExportRow[]
): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;
  let y = 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(meta.nome || `Listino ${meta.codice}`, pageWidth / 2, y, {
    align: "center",
    maxWidth: pageWidth - marginX * 2,
  });
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60);
  const info = [
    `${meta.codice} · stato ${meta.statoLabel} · versione V${meta.versione} · lingua ${meta.locale.toUpperCase()}`,
    `Esportato il ${meta.exportedAt} da ${meta.actor}`,
    `Ambito: ${meta.scope === "selezione" ? "prodotti selezionati" : "listino completo"} · ${meta.prodottiCount} prodotti · ${meta.scontiCount} sconti`,
  ];
  for (const line of info) {
    doc.text(line, marginX, y);
    y += 4.5;
  }
  y += 2;

  const tableOpts = {
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 1.6,
      overflow: "linebreak" as const,
      valign: "middle" as const,
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
    theme: "plain" as const,
  };

  for (const block of splitProductBlocks(rows)) {
    autoTable(doc, {
      ...tableOpts,
      startY: y,
      head: [],
      body: block.map(listinoExportRowCells),
      didParseCell: (data) => {
        const row = block[data.row.index];
        if (!row) return;
        if (row.kind === "product_head" || row.kind === "discount_head") {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor =
            row.kind === "product_head" ? [15, 118, 110] : [51, 65, 85];
          data.cell.styles.textColor = 255;
        } else if (row.kind === "product") {
          data.cell.styles.fillColor = [236, 253, 245];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    const lastY = (
      doc as jsPDF & { lastAutoTable?: { finalY: number } }
    ).lastAutoTable?.finalY;
    y = (lastY ?? y) + 10;
  }

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
