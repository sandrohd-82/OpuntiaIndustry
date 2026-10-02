import ExcelJS from "exceljs";
import {
  righeElaborazioneFatture,
  titoliElaborazioneExcel,
  type FatturaElaborazioneSorgente,
  type RigaElaborazioneExcel,
} from "@/lib/amministrazione/elaborazione-fatture-excel";
import type { ElaborazioneContabileKind } from "@/types/database";

function celle(riga: RigaElaborazioneExcel): (string | number | null)[] {
  if (riga.tipo === "fattura") {
    return [
      riga.numeroProvvisorio,
      riga.nomeFile,
      riga.data,
      riga.intestazione,
      riga.imponibile,
      riga.iva,
      riga.totale,
      riga.nazione,
    ];
  }
  return [
    null,
    null,
    null,
    riga.etichetta,
    riga.imponibile,
    riga.iva,
    riga.totale,
    null,
  ];
}

export async function buildElaborazioneFattureXlsx(input: {
  kind: ElaborazioneContabileKind;
  anno: number;
  trimestre: number;
  docs: FatturaElaborazioneSorgente[];
}): Promise<{ filename: string; base64: string }> {
  const righe = righeElaborazioneFatture(input.docs, input.kind);
  const wb = new ExcelJS.Workbook();
  wb.creator = "OpuntiaIndustry";
  wb.created = new Date();
  const nomeFoglio = input.kind === "emessa" ? "Fatture emesse" : "Fatture ricevute";
  const ws = wb.addWorksheet(nomeFoglio, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = [
    { width: 22 },
    { width: 32 },
    { width: 14 },
    { width: 46 },
    { width: 18 },
    { width: 16 },
    { width: 18 },
    { width: 16 },
  ];

  const header = ws.addRow([...titoliElaborazioneExcel(input.kind)]);
  header.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" },
    };
    cell.alignment = { vertical: "middle" };
  });
  header.height = 22;

  for (const riga of righe) {
    const excelRow = ws.addRow(celle(riga));
    excelRow.font = { name: "Calibri", size: 11 };
    for (const col of [5, 6, 7]) {
      excelRow.getCell(col).numFmt = "#,##0.00";
      excelRow.getCell(col).alignment = { horizontal: "right" };
    }
    const nazione = excelRow.getCell(8);
    nazione.alignment = { horizontal: "center" };
    if (riga.tipo === "fattura" && input.kind === "ricevuta") {
      nazione.font = { name: "Segoe UI Emoji", size: 16 };
    }
    if (riga.tipo === "mese" || riga.tipo === "generale") {
      const scuro = riga.tipo === "generale";
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
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `Elaborazione_${input.kind === "emessa" ? "emesse" : "ricevute"}_${input.anno}_T${input.trimestre}.xlsx`;
  return {
    filename,
    base64: Buffer.from(buffer).toString("base64"),
  };
}
