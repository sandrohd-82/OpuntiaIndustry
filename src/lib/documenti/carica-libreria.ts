import type { jsPDF } from "jspdf";
import type { Workbook } from "exceljs";

type CostruttorePdf = typeof import("jspdf").jsPDF;
type FunzioneTabella = typeof import("jspdf-autotable").default;
type OpzioniPdf = {
  orientation?: "portrait" | "landscape" | "p" | "l";
  unit?: "pt" | "px" | "in" | "mm" | "cm" | "ex" | "em" | "pc";
  format?: string | number[];
  compress?: boolean;
};

let costruttorePdf: CostruttorePdf | null = null;
let tabellaPdf: FunzioneTabella | null = null;
let excelNs: { Workbook: new () => Workbook } | null = null;

export async function assicuratiPdf(): Promise<void> {
  if (costruttorePdf && tabellaPdf) return;
  const [pdf, tabella] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  costruttorePdf = pdf.jsPDF;
  tabellaPdf = tabella.default;
}

export async function creaJsPdf(opzioni?: OpzioniPdf): Promise<jsPDF> {
  await assicuratiPdf();
  if (!costruttorePdf) {
    throw new Error("La libreria PDF non è ancora caricata.");
  }
  return new costruttorePdf(opzioni);
}

export async function tabellaJsPdf(
  ...argomenti: Parameters<FunzioneTabella>
): Promise<ReturnType<FunzioneTabella>> {
  await assicuratiPdf();
  if (!tabellaPdf) {
    throw new Error("La libreria PDF non è ancora caricata.");
  }
  return tabellaPdf(...argomenti);
}

export async function assicuratiExcel(): Promise<void> {
  if (excelNs) return;
  const modulo = (await import("exceljs")) as typeof import("exceljs") & {
    default?: { Workbook: new () => Workbook };
  };
  excelNs = modulo.default ?? modulo;
}

export async function creaWorkbook(): Promise<Workbook> {
  await assicuratiExcel();
  if (!excelNs) {
    throw new Error("La libreria Excel non è ancora caricata.");
  }
  return new excelNs.Workbook();
}
