import ExcelJS from "exceljs";
import {
  listinoExportFilename,
  listinoExportRowCells,
  type ListinoExportMeta,
  type ListinoExportRow,
} from "@/lib/ecosystem/listino-export";

export async function buildListinoXlsxBuffer(
  meta: ListinoExportMeta,
  rows: ListinoExportRow[]
): Promise<{ filename: string; buffer: Buffer }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OpuntiaIndustry";
  wb.created = new Date();
  wb.title = `Listino ${meta.codice}`;

  const ws = wb.addWorksheet("Listino", {
    views: [{ state: "frozen", ySplit: 5 }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      paperSize: 9,
    },
  });

  ws.columns = [
    { width: 28 },
    { width: 42 },
    { width: 18 },
    { width: 36 },
    { width: 12 },
    { width: 12 },
  ];

  const headLines = [
    [`Listino ${meta.codice}`, meta.nome, "", "", "", ""],
    [
      `Stato: ${meta.statoLabel}`,
      `Versione: V${meta.versione}`,
      `Lingua: ${meta.locale.toUpperCase()}`,
      "",
      "",
      "",
    ],
    [
      `Esportato il ${meta.exportedAt}`,
      `Operatore: ${meta.actor}`,
      meta.scope === "selezione" ? "Ambito: selezione" : "Ambito: listino completo",
      `${meta.prodottiCount} prodotti`,
      `${meta.scontiCount} sconti`,
      "",
    ],
    ["", "", "", "", "", ""],
  ];
  for (const line of headLines) {
    const r = ws.addRow(line);
    r.font = { bold: true, name: "Calibri", size: 11 };
  }

  for (const row of rows) {
    const excelRow = ws.addRow(listinoExportRowCells(row));
    excelRow.font = { name: "Calibri", size: 10 };
    if (row.kind === "product_head") {
      excelRow.font = {
        name: "Calibri",
        size: 10,
        bold: true,
        color: { argb: "FFFFFFFF" },
      };
      excelRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF0F766E" },
        };
      });
    } else if (row.kind === "discount_head") {
      excelRow.font = {
        name: "Calibri",
        size: 10,
        bold: true,
        color: { argb: "FFFFFFFF" },
      };
      excelRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF334155" },
        };
      });
    } else if (row.kind === "product") {
      excelRow.font = { name: "Calibri", size: 10, bold: true };
      excelRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFECFDF5" },
        };
      });
    } else if (row.kind === "spacer") {
      excelRow.height = 10;
    }
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { filename: listinoExportFilename(meta, "xlsx"), buffer };
}
