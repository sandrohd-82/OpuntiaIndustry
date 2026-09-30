import { readFileSync } from "fs";
import path from "path";
import { jsPDF } from "jspdf";
import {
  AGRINSICILIA_COORDINATE,
  AGRINSICILIA_LETTERHEAD,
  OPUNTIA_ITALIA_LOGO,
  formatPreventivoDataIt,
} from "@/lib/amministrazione/preventivo-letterhead";
import {
  PREVENTIVO_CONSEGNA_LABEL,
  PREVENTIVO_IVA_DEFAULT,
  labelModalitaPagamentoPreventivo,
  nomeFilePreventivoPdf,
  prezzoNettoRigaPreventivo,
  roundEuro,
  type PreventivoConsegna,
  type PreventivoRiga,
} from "@/lib/amministrazione/preventivi";
import { formatIbanDisplay } from "@/lib/iban";
import type { OrdineTipoPagamento } from "@/lib/amministrazione/ordini";

function euro(n: number) {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pngData(fileName: string): string | null {
  try {
    const buf = readFileSync(path.join(process.cwd(), "public", fileName));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function qa(doc: jsPDF, x: number, y: number, domanda: string, risposta: string, maxW: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const label = `${domanda}: `;
  const labelW = doc.getTextWidth(label);
  doc.text(label, x, y);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(risposta || "—", Math.max(20, maxW - labelW));
  doc.text(String(lines[0] ?? "—"), x + labelW, y);
  return lines.length > 1 ? (lines.length - 1) * 3.4 : 0;
}

export function buildPreventivoPdfBuffer(input: {
  numero: string;
  dataPreventivo: string;
  azienda: string;
  partitaIva: string;
  codiceFiscale: string;
  via: string;
  capCitta: string;
  commercialeNome: string;
  commercialeTelefono: string;
  commercialeEmail: string;
  consegnaMetodo: PreventivoConsegna;
  righe: Array<
    Pick<
      PreventivoRiga,
      | "prodottoCodice"
      | "prodottoNome"
      | "quantita"
      | "unitaMisura"
      | "prezzoUnitario"
      | "ivaPercentuale"
      | "scontoExtraPct"
      | "confezionamento"
    >
  >;
  spedizioneImporto: number;
  validitaGiorni: number;
  tipoPagamento: OrdineTipoPagamento;
  giorniConsegna: string;
  note: string;
}): { buffer: Buffer; fileName: string } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = AGRINSICILIA_LETTERHEAD;
  const left = 14;
  const right = 196;
  const width = right - left;
  let y = 12;

  const logo = pngData("Agrinsicilia-Coop.png");
  if (logo) doc.addImage(logo, "PNG", left, y, 82, 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(L.ragioneSociale, right, y + 4, { align: "right", maxWidth: 95 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(L.indirizzo, right, y + 12, { align: "right" });
  doc.text(`P.iva ${L.partitaIva} - C.F. ${L.codiceFiscale}`, right, y + 16, {
    align: "right",
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(
    `PREVENTIVO nr. ${input.numero} del ${formatPreventivoDataIt(input.dataPreventivo)}`,
    right,
    y + 22,
    { align: "right" }
  );
  doc.setFontSize(8);
  doc.text("Commerciale di riferimento", right, y + 27, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(input.commercialeNome || "—", right, y + 31, { align: "right" });
  doc.text(`Telefono: ${input.commercialeTelefono || "—"}`, right, y + 35, {
    align: "right",
  });
  doc.text(`Email: ${input.commercialeEmail || "—"}`, right, y + 39, {
    align: "right",
  });

  y = 56;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.35);
  doc.line(left, y, right, y);

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("DESTINATARIO", left, y);
  y += 5;
  doc.setFontSize(9);
  doc.text((input.azienda || "—").toUpperCase(), left, y);
  y += 4;
  doc.setFontSize(8);
  const extraPiva = qa(doc, left, y, "P.IVA", input.partitaIva || "—", 90);
  y += 4 + extraPiva;
  qa(doc, left, y, "CF", input.codiceFiscale || "—", 90);
  doc.setFont("helvetica", "normal");
  doc.text((input.via || "—").toUpperCase(), right, y - 4, { align: "right" });
  doc.text((input.capCitta || "—").toUpperCase(), right, y, { align: "right" });

  y += 8;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(left, y, right, y);
  y += 6;

  const cols = [22, 68, 24, 24, 22, 22];
  const heads = ["Codice", "Nome prodotto", "Prezzo U", "Qty", "Sconto", "Totale"];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  let x = left;
  heads.forEach((label, i) => {
    doc.text(label, x, y);
    x += cols[i] ?? 0;
  });
  doc.setTextColor(15, 23, 42);
  y += 2;
  doc.setDrawColor(203, 213, 225);
  doc.line(left, y, right, y);
  y += 5;

  let imponibile = 0;
  let iva = 0;
  const ivaDoc = input.righe[0]?.ivaPercentuale || PREVENTIVO_IVA_DEFAULT;

  function ensure(space: number) {
    if (y + space < 250) return;
    doc.addPage();
    y = 16;
  }

  for (const riga of input.righe) {
    ensure(14);
    const netto = prezzoNettoRigaPreventivo(riga.prezzoUnitario, riga.scontoExtraPct);
    const totale = roundEuro(netto * riga.quantita);
    const aliq = riga.ivaPercentuale > 0 ? riga.ivaPercentuale : ivaDoc;
    imponibile += totale;
    iva += totale * (aliq / 100);
    const sconto =
      riga.scontoExtraPct > 0
        ? `extra ${riga.scontoExtraPct.toLocaleString("it-IT")}%`
        : "—";
    const cells = [
      riga.prodottoCodice,
      riga.prodottoNome,
      `${euro(riga.prezzoUnitario)} €`,
      `${riga.quantita} ${riga.unitaMisura}`,
      sconto,
      `${euro(totale)} €`,
    ];
    x = left;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    cells.forEach((cell, i) => {
      doc.setFont("helvetica", i === 0 || i === 5 ? "bold" : "normal");
      const chunk = doc.splitTextToSize(cell, (cols[i] ?? 20) - 1);
      doc.text(String(chunk[0] ?? ""), x, y);
      x += cols[i] ?? 0;
    });
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    const dettaglio =
      riga.confezionamento.trim() || "Nessun dettaglio di confezionamento";
    const pack = doc.splitTextToSize(
      `Sconto applicato a proposta di confezionamento. ${dettaglio}`,
      width - 12
    );
    doc.text(pack, left + 8, y);
    doc.setTextColor(15, 23, 42);
    y += pack.length * 3 + 2;
    doc.setDrawColor(226, 232, 240);
    doc.line(left, y, right, y);
    y += 4;
  }

  if (input.spedizioneImporto > 0) {
    ensure(10);
    imponibile += input.spedizioneImporto;
    iva += input.spedizioneImporto * (ivaDoc / 100);
    const ship = [
      "—",
      "Contributo spese di spedizione",
      `${euro(input.spedizioneImporto)} €`,
      "1",
      "—",
      `${euro(input.spedizioneImporto)} €`,
    ];
    x = left;
    doc.setFontSize(8);
    ship.forEach((cell, i) => {
      doc.setFont("helvetica", i === 5 ? "bold" : "normal");
      doc.text(cell, x, y);
      x += cols[i] ?? 0;
    });
    y += 5;
  }

  y += 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const noteLines = doc.splitTextToSize(input.note.trim() || "—", width);
  doc.text(noteLines.slice(0, 6), left, y);
  y += Math.min(noteLines.length, 6) * 3.6 + 4;
  qa(
    doc,
    left,
    y,
    "Spedizione e consegna",
    input.spedizioneImporto > 0
      ? `${PREVENTIVO_CONSEGNA_LABEL[input.consegnaMetodo]} · ${euro(input.spedizioneImporto)} €`
      : PREVENTIVO_CONSEGNA_LABEL[input.consegnaMetodo],
    width
  );
  y += 4;
  qa(doc, left, y, "Giorni di consegna", input.giorniConsegna || "da concordare", width);
  y += 5;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.35);
  doc.line(left, y, right, y);

  const imp = roundEuro(imponibile);
  const ivaR = roundEuro(iva);
  const totale = roundEuro(imp + ivaR);
  y += 4;
  const boxH = 42;
  if (y + boxH > 270) {
    doc.addPage();
    y = 16;
  }
  const boxW = width / 2;
  doc.setLineWidth(0.3);
  doc.rect(left, y, width, boxH);
  doc.line(left + boxW, y, left + boxW, y + boxH);

  let ly = y + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Modalità di Pagamento", left + 3, ly);
  ly += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(labelModalitaPagamentoPreventivo(input.tipoPagamento), left + 3, ly);
  ly += 5;
  qa(doc, left + 3, ly, "Banca", AGRINSICILIA_COORDINATE.banca, boxW - 6);
  ly += 4;
  qa(doc, left + 3, ly, "IBAN", formatIbanDisplay(AGRINSICILIA_COORDINATE.iban), boxW - 6);
  ly += 4;
  qa(doc, left + 3, ly, "BIC", AGRINSICILIA_COORDINATE.bic, boxW - 6);
  ly += 4;
  qa(doc, left + 3, ly, "Importo", `${euro(totale)} €`, boxW - 6);
  ly += 4;
  const causale = `Pagamento Preventivo n. ${input.numero} del ${formatPreventivoDataIt(input.dataPreventivo)}.`;
  qa(doc, left + 3, ly, "Causale", causale, boxW - 6);

  const tx = left + boxW + 3;
  let ty = y + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Totali", tx, ty);
  const stamp = `VALIDITÀ PREVENTIVO ${input.validitaGiorni} GG.`;
  const stampW = 58;
  const stampX = left + boxW + (boxW - stampW) / 2;
  const stampY = ty + 3;
  doc.setLineWidth(0.7);
  doc.rect(stampX, stampY, stampW, 9);
  doc.setLineWidth(0.25);
  doc.rect(stampX + 0.8, stampY + 0.8, stampW - 1.6, 7.4);
  doc.setFontSize(6.5);
  doc.text(stamp, stampX + stampW / 2, stampY + 5.4, { align: "center" });
  ty = stampY + 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Imponibile", tx, ty);
  doc.text(`${euro(imp)} €`, left + width - 3, ty, { align: "right" });
  ty += 4;
  doc.text(`Totale IVA ${ivaDoc}%`, tx, ty);
  doc.text(`${euro(ivaR)} €`, left + width - 3, ty, { align: "right" });
  ty += 2;
  doc.setDrawColor(15, 23, 42);
  doc.line(tx, ty, left + width - 3, ty);
  ty += 4;
  doc.setFont("helvetica", "bold");
  doc.text("Totale Preventivo", tx, ty);
  doc.text(`${euro(totale)} €`, left + width - 3, ty, { align: "right" });

  y += boxH + 16;
  const logoB = pngData(OPUNTIA_ITALIA_LOGO.src.replace(/^\//, ""));
  const footerLogo = pngData("Agrinsicilia-Coop.png");
  if (y > 268) {
    doc.addPage();
    y = 20;
  }
  if (footerLogo) doc.addImage(footerLogo, "PNG", 78, y, 22, 10);
  if (logoB) doc.addImage(logoB, "PNG", 108, y, 22, 10);
  y += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(L.ragioneSociale, 105, y, { align: "center" });
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`${L.sito} - ${L.email}`, 105, y, { align: "center" });
  y += 4;
  doc.text(`cell: ${L.cell}`, 105, y, { align: "center" });

  const fileName = nomeFilePreventivoPdf(input.numero);
  return { buffer: Buffer.from(doc.output("arraybuffer")), fileName };
}
