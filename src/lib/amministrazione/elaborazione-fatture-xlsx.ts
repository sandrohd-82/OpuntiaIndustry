import ExcelJS from "exceljs";
import {
  righeCartellaUscita,
  righeElaborazioneFatture,
  TITOLI_USCITA_EXCEL,
  titoliElaborazioneExcel,
  type FatturaElaborazioneSorgente,
  type RigaElaborazioneExcel,
} from "@/lib/amministrazione/elaborazione-fatture-excel";
import {
  nomeFoglioRegistro,
  registroMostraBeneConsumo,
  type CommercialistaRegistroKind,
} from "@/lib/amministrazione/commercialista";

function larghezzaColonna(titolo: string): number {
  if (
    titolo === "Nome file" ||
    titolo === "Intestazione Emittente" ||
    titolo === "Intestazione Ricevente"
  ) {
    return 42;
  }
  if (titolo === "Numero documento") return 22;
  return 18;
}

function celle(
  riga: RigaElaborazioneExcel,
  kind: CommercialistaRegistroKind
): (string | number | null)[] {
  const entrata = registroMostraBeneConsumo(kind);
  if (riga.tipo === "fattura") {
    const valori: (string | number | null)[] = [
      riga.numeroProvvisorio,
      riga.nomeFile,
    ];
    if (entrata) valori.push(riga.numeroDocumento);
    valori.push(
      riga.data,
      riga.intestazione,
      riga.imponibile,
      riga.iva,
      riga.totale,
      riga.nazione
    );
    if (entrata) valori.push(riga.origineDocumento, riga.beneAmmortizzabile);
    return valori;
  }
  const valori: (string | number | null)[] = [null, null];
  if (entrata) valori.push(null);
  valori.push(null, riga.etichetta, riga.imponibile, riga.iva, riga.totale, null);
  if (entrata) valori.push(null, null);
  return valori;
}

export async function buildElaborazioneFattureXlsx(input: {
  kind: CommercialistaRegistroKind;
  anno: number;
  trimestre: number;
  docs: FatturaElaborazioneSorgente[];
  /** Il numero documento apre il PDF che sta nella stessa cartella. */
  collegaPdf?: boolean;
}): Promise<{ filename: string; base64: string; bytes: Uint8Array }> {
  const righe = righeElaborazioneFatture(input.docs, input.kind);
  const wb = new ExcelJS.Workbook();
  wb.creator = "OpuntiaIndustry";
  wb.created = new Date();
  const nomeFoglio = nomeFoglioRegistro(input.kind);
  const ws = wb.addWorksheet(nomeFoglio, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const titoli = titoliElaborazioneExcel(input.kind);
  ws.columns = titoli.map((titolo) => ({
    width: larghezzaColonna(titolo),
  }));

  const header = ws.addRow([...titoli]);
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
    const excelRow = ws.addRow(celle(riga, input.kind));
    excelRow.font = { name: "Calibri", size: 11 };
    const colImporto = (nome: string) => titoli.indexOf(nome) + 1;
    for (const nome of ["Tot. Imponibile", "Tot. IVA", "Tot. Fattura"]) {
      const col = colImporto(nome);
      if (col <= 0) continue;
      excelRow.getCell(col).numFmt = "#,##0.00";
      excelRow.getCell(col).alignment = { horizontal: "right" };
    }
    const nazione = excelRow.getCell(colImporto("Nazione"));
    nazione.alignment = { horizontal: "center" };
    if (riga.tipo === "fattura" && registroMostraBeneConsumo(input.kind)) {
      nazione.font = { name: "Segoe UI Emoji", size: 16 };
      const bene = excelRow.getCell(colImporto("Bene ammortizzabile"));
      bene.alignment = { horizontal: "center" };
      excelRow.getCell(colImporto("Origine")).alignment = {
        horizontal: "center",
      };
    }
    if (input.collegaPdf && riga.tipo === "fattura" && riga.nomeFile) {
      const colNumero = titoli.indexOf("Numero documento") + 1;
      if (colNumero > 0) {
        const cell = excelRow.getCell(colNumero);
        const testo = String(cell.value ?? "").trim() || riga.nomeFile;
        cell.value = {
          text: testo,
          hyperlink: riga.nomeFile,
          tooltip: "Apri il PDF",
        };
        cell.font = {
          name: "Calibri",
          size: 11,
          color: { argb: "FF1D4ED8" },
          underline: true,
        };
      }
    }
    if (riga.tipo === "fattura" && riga.notaCredito) {
      excelRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFEECEC" },
        };
      });
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
  const bytes = new Uint8Array(buffer);
  const filename = input.collegaPdf
    ? "resoconto.xlsx"
    : `Elaborazione_${input.kind}_${input.anno}_T${input.trimestre}.xlsx`;
  return {
    filename,
    bytes,
    base64: Buffer.from(bytes).toString("base64"),
  };
}

function larghezzaUscita(titolo: string): number {
  if (titolo === "Intestazione" || titolo === "Numero documento") return 36;
  if (titolo === "Tipo doc.") return 22;
  if (titolo === "N. Prog") return 12;
  return 18;
}

/** Excel delle inviate: il numero documento apre il PDF nella stessa cartella. */
export async function buildUscitaCartellaXlsx(input: {
  kind: CommercialistaRegistroKind;
  docs: FatturaElaborazioneSorgente[];
}): Promise<{ filename: string; bytes: Uint8Array }> {
  const righe = righeCartellaUscita(input.docs, input.kind);
  const wb = new ExcelJS.Workbook();
  wb.creator = "OpuntiaIndustry";
  wb.created = new Date();
  const ws = wb.addWorksheet(nomeFoglioRegistro(input.kind), {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = TITOLI_USCITA_EXCEL.map((titolo) => ({
    width: larghezzaUscita(titolo),
  }));
  const header = ws.addRow([...TITOLI_USCITA_EXCEL]);
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
    const documento = riga.tipo === "documento";
    const excelRow = ws.addRow(
      documento
        ? [
            riga.numeroProgressivo,
            riga.tipoDocumento,
            riga.numeroDocumento,
            riga.data,
            riga.intestazione,
            riga.imponibile,
            riga.iva,
            riga.totale,
            riga.nazione,
            riga.beniStrumentali,
          ]
        : [null, null, null, null, riga.etichetta, riga.imponibile, riga.iva, riga.totale, null, null]
    );
    excelRow.font = { name: "Calibri", size: 11 };
    for (const col of [6, 7, 8]) {
      excelRow.getCell(col).numFmt = "#,##0.00";
      excelRow.getCell(col).alignment = { horizontal: "right" };
    }
    excelRow.getCell(9).alignment = { horizontal: "center" };
    excelRow.getCell(10).alignment = { horizontal: "center" };
    if (documento && riga.nomeFile && riga.numeroDocumento) {
      const cell = excelRow.getCell(3);
      cell.value = {
        text: riga.numeroDocumento,
        hyperlink: riga.nomeFile,
        tooltip: "Apri il PDF",
      };
      cell.font = {
        name: "Calibri",
        size: 11,
        color: { argb: "FF1D4ED8" },
        underline: true,
      };
    }
    if (documento && riga.notaCredito) {
      excelRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFEECEC" },
        };
      });
    }
    if (riga.tipo === "mese" || riga.tipo === "trimestre") {
      const scuro = riga.tipo === "trimestre";
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
  return { filename: "resoconto.xlsx", bytes: new Uint8Array(buffer) };
}
