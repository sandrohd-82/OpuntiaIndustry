import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { AGRINSICILIA_LETTERHEAD, AGRINSICILIA_MAIL_FIRMA } from "@/lib/amministrazione/preventivo-letterhead";
import {
  PREVENTIVO_IVA_DEFAULT,
  labelModalitaPagamentoPreventivo,
  nomeFilePreventivoPdf,
  prezzoNettoRigaPreventivo,
  roundEuro,
  type PreventivoRiga,
} from "@/lib/amministrazione/preventivi";
import type { OrdineTipoPagamento } from "@/lib/amministrazione/ordini";

function euro(n: number) {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function dataIt(iso: string) {
  const [y, m, d] = iso.split("-");
  if (y && m && d) return `${d}/${m}/${y}`;
  return iso;
}

export function buildPreventivoPdfBuffer(input: {
  numero: string;
  dataPreventivo: string;
  azienda: string;
  indirizzo: string;
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
  let y = 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(L.ragioneSociale, 14, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(L.indirizzo, 14, y);
  y += 4;
  doc.text(`P.IVA ${L.partitaIva} · ${L.sito}`, 14, y);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("PREVENTIVO", 14, y);
  doc.setFontSize(11);
  doc.text(input.numero, 196, y, { align: "right" });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Data: ${dataIt(input.dataPreventivo)}`, 196, y, { align: "right" });
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Destinatario", 14, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.text(input.azienda || "—", 14, y);
  y += 4;
  const addr = doc.splitTextToSize(input.indirizzo || "—", 120);
  doc.text(addr, 14, y);
  y += addr.length * 4 + 4;

  let imponibile = 0;
  let iva = 0;
  const body: string[][] = [];
  for (const riga of input.righe) {
    const netto = prezzoNettoRigaPreventivo(riga.prezzoUnitario, riga.scontoExtraPct);
    const totale = roundEuro(netto * riga.quantita);
    const aliq = riga.ivaPercentuale > 0 ? riga.ivaPercentuale : PREVENTIVO_IVA_DEFAULT;
    imponibile += totale;
    iva += totale * (aliq / 100);
    const nome = riga.confezionamento.trim()
      ? `${riga.prodottoNome}\n${riga.confezionamento.trim()}`
      : riga.prodottoNome;
    body.push([
      riga.prodottoCodice,
      nome,
      `${euro(riga.prezzoUnitario)} €`,
      `${riga.quantita} ${riga.unitaMisura}`,
      riga.scontoExtraPct > 0 ? `${riga.scontoExtraPct} %` : "—",
      `${euro(totale)} €`,
    ]);
  }
  if (input.spedizioneImporto > 0) {
    const aliq = input.righe[0]?.ivaPercentuale || PREVENTIVO_IVA_DEFAULT;
    imponibile += input.spedizioneImporto;
    iva += input.spedizioneImporto * (aliq / 100);
    body.push([
      "—",
      "Contributo spese di spedizione",
      `${euro(input.spedizioneImporto)} €`,
      "1",
      "—",
      `${euro(input.spedizioneImporto)} €`,
    ]);
  }

  autoTable(doc, {
    startY: y,
    head: [["Codice", "Nome prodotto", "Prezzo U", "Qty", "Sconto", "Totale"]],
    body,
    styles: { fontSize: 8, cellPadding: 1.5, overflow: "linebreak" },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
    margin: { left: 14, right: 14 },
  });

  const after = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  y = (after ?? y) + 8;
  const imp = roundEuro(imponibile);
  const ivaR = roundEuro(iva);
  doc.setFont("helvetica", "normal");
  doc.text(`Imponibile: ${euro(imp)} €`, 196, y, { align: "right" });
  y += 5;
  doc.text(`IVA: ${euro(ivaR)} €`, 196, y, { align: "right" });
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text(`Totale: ${euro(roundEuro(imp + ivaR))} €`, 196, y, { align: "right" });
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const meta = [
    labelModalitaPagamentoPreventivo(input.tipoPagamento),
    `Giorni di consegna: ${input.giorniConsegna || "da concordare"}`,
    `Validità ${input.validitaGiorni} giorni`,
    input.note.trim(),
  ].filter(Boolean);
  const metaLines = doc.splitTextToSize(meta.join("\n"), 182);
  doc.text(metaLines, 14, y);
  y += metaLines.length * 4 + 8;
  if (y > 250) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(8);
  const firma = doc.splitTextToSize(AGRINSICILIA_MAIL_FIRMA, 120);
  doc.text(firma, 14, y);

  const fileName = nomeFilePreventivoPdf(input.numero);
  const bytes = doc.output("arraybuffer");
  return { buffer: Buffer.from(bytes), fileName };
}
