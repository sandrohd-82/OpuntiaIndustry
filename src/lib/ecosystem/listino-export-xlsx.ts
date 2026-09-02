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
