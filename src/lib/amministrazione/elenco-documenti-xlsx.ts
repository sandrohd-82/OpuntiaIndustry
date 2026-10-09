import ExcelJS from "exceljs";
import {
  dataElencoIt,
  type LatoElenco,
  type RigaElencoMisto,
} from "@/lib/amministrazione/elenco-documenti";

const TITOLI = [
  "N.",
  "Gruppo",
  "Tipo",
  "Numero",
  "Data",
  "Intestazione",
  "Collegato a",
  "Imponibile",
  "IVA",
  "Totale",
] as const;

export async function buildElencoMistoXlsx(input: {
  lato: LatoElenco;
  anno: number;
  trimestre: number;
  righe: RigaElencoMisto[];
}): Promise<{ filename: string; base64: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OpuntiaIndustry";
  wb.created = new Date();
  const nome =
    input.lato === "emesso" ? "Elenco emessi" : "Elenco ricevuti";
  const ws = wb.addWorksheet(nome, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = [
    { width: 8 },
    { width: 10 },
    { width: 18 },
    { width: 22 },
    { width: 14 },
    { width: 42 },
    { width: 36 },
    { width: 16 },
    { width: 14 },
    { width: 16 },
  ];

  const header = ws.addRow([...TITOLI]);
  header.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  header.height = 22;
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" },
    };
    cell.alignment = { vertical: "middle" };
  });

  for (let i = 0; i < input.righe.length; i += 1) {
    const riga = input.righe[i];
    if (!riga) continue;
    const excelRow = ws.addRow([
      riga.sequenza,
      riga.gruppo,
      riga.tipo,
      riga.numero,
      riga.tipoRiga === "documento" ? dataElencoIt(riga.data) : "",
      riga.intestazione,
      riga.collegatoA,
      riga.imponibile,
      riga.iva,
      riga.totale,
    ]);
    excelRow.font = { name: "Calibri", size: 11 };
    for (const col of [8, 9, 10]) {
      excelRow.getCell(col).numFmt = "#,##0.00";
      excelRow.getCell(col).alignment = { horizontal: "right" };
    }
    if (riga.tipoRiga === "documento" && riga.notaCredito) {
      excelRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFEECEC" },
        };
      });
    } else if (riga.tipoRiga === "documento" && riga.ddt) {
      excelRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF3F7FC" },
        };
      });
    } else if (riga.tipoRiga === "mese" || riga.tipoRiga === "generale") {
      const scuro = riga.tipoRiga === "generale";
      excelRow.font = {
        name: "Calibri",
        size: 11,
        bold: true,
        color: { argb: scuro ? "FFFFFFFF" : "FF1E293B" },
      };
      excelRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: scuro ? "FF0F172A" : "FFFEF3C7" },
        };
      });
    }
    if (riga.tipoRiga === "mese" && input.righe[i + 1]?.tipoRiga === "mese") {
      ws.addRow([]);
    }
  }

  const lato = input.lato === "emesso" ? "emessi" : "ricevuti";
  const buffer = await wb.xlsx.writeBuffer();
  return {
    filename: `Elenco_${lato}_${input.anno}_T${input.trimestre}.xlsx`,
    base64: Buffer.from(buffer).toString("base64"),
  };
}
