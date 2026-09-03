import ExcelJS from "exceljs";
import {
  listinoExportFilename,
  listinoExportRowCells,
  type ListinoExportMeta,
  type ListinoExportRow,
} from "@/lib/ecosystem/listino-export";
import { listinoExportI18n } from "@/lib/ecosystem/listino-export-i18n";

export async function buildListinoXlsxBuffer(
  meta: ListinoExportMeta,
  rows: ListinoExportRow[]
): Promise<{ filename: string; buffer: Buffer }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OpuntiaIndustry";
  wb.created = new Date();
  wb.title = meta.nome || `Listino ${meta.codice}`;

  const ws = wb.addWorksheet(listinoExportI18n(meta.locale).filePrefix.slice(0, 31) || "Listino", {
    views: [{ state: "normal", showGridLines: false }],
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
    { width: 20 },
    { width: 36 },
    { width: 14 },
    { width: 12 },
  ];

  const titleRow = ws.addRow([meta.nome]);
  ws.mergeCells(1, 1, 1, 6);
  titleRow.height = 26;
  const titleCell = titleRow.getCell(1);
  titleCell.font = { name: "Calibri", size: 16, bold: true };
  titleCell.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };

  for (const row of rows) {
    if (row.kind === "spacer") {
      const spacer = ws.addRow([]);
      spacer.height = 12;
      continue;
    }
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
    }
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { filename: listinoExportFilename(meta, "xlsx"), buffer };
}
