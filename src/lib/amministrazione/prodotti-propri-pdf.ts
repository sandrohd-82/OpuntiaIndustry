import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  hasActiveProdottiPropriFilters,
  type ProdottoProprio,
  type ProdottiPropriFilters,
} from "@/lib/amministrazione/prodotti-propri";
import { formatSettoriProdotto } from "@/lib/amministrazione/prodotti-settori";
import {
  formatQuantitaCarico,
  unitaStockDaCarico,
  type MagazzinoCaricoUnita,
} from "@/lib/magazzino/types";

export type ProdottiPropriPdfGiacenza = {
  giacenzaKg: number;
  unitaScheda: MagazzinoCaricoUnita;
};

function formatDateTime(date = new Date()): string {
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function describeFilters(filters: ProdottiPropriFilters): string[] {
  if (!hasActiveProdottiPropriFilters(filters)) {
    return ["Nessun filtro applicato — elenco completo"];
  }

  const lines: string[] = [];

  if (filters.showBio && !filters.showConvenzionale) {
    lines.push("Tipologia: solo biologici");
  } else if (!filters.showBio && filters.showConvenzionale) {
    lines.push("Tipologia: solo convenzionali");
  } else if (!filters.showBio && !filters.showConvenzionale) {
    lines.push("Tipologia: nessuna (bio e convenzionale disattivati)");
  }

  const codice = filters.codice.trim();
  if (codice) lines.push(`Targa/codice contiene: “${codice}”`);

  if ((filters.settoreIds ?? []).length > 0) {
    lines.push(`Settori selezionati: ${filters.settoreIds.length}`);
  }

  const text = filters.textQuery.trim();
  if (text) {
    const campo =
      filters.textField === "nome"
        ? "Nome"
        : filters.textField === "note"
          ? "Note"
          : "Nome e Note";
    lines.push(`Testo “${text}” su ${campo}`);
  }

  return lines.length > 0 ? lines : ["Filtri attivi"];
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 40);
}

export function exportProdottiPropriPdf(
  prodotti: ProdottoProprio[],
  filters: ProdottiPropriFilters,
  options?: { giacenze?: Record<string, ProdottiPropriPdfGiacenza> }
): void {
  const giacenze = options?.giacenze;
  const withQty = Boolean(giacenze);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  let y = 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(
    withQty ? "Elenco e quantità presenti — Agrinsicilia" : "Prodotti propri",
    marginX,
    y
  );
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`Esportato il ${formatDateTime()}`, marginX, y);
  y += 5;
  doc.text(`Record esportati: ${prodotti.length}`, marginX, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30);
  doc.text("Filtri", marginX, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(60);
  for (const line of describeFilters(filters)) {
    const wrapped = doc.splitTextToSize(line, pageWidth - marginX * 2);
    doc.text(wrapped, marginX, y);
    y += wrapped.length * 4.5;
  }
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [
      withQty
        ? [
            "Codice",
            "Nome",
            "Settori",
            "Quantità in magazzino",
            "Tipologia",
            "Note",
          ]
        : ["Codice", "Nome", "Settori", "Tipologia", "Note"],
    ],
    body: prodotti.map((p) => {
      const g = giacenze?.[p.id];
      const qty = g
        ? formatQuantitaCarico(g.giacenzaKg, unitaStockDaCarico(g.unitaScheda))
        : "0 kg";
      const settori = formatSettoriProdotto(p.settori);
      return withQty
        ? [
            p.codice,
            p.nome,
            settori,
            qty,
            p.isBio ? "Bio" : "Convenzionale",
            p.note || "—",
          ]
        : [p.codice, p.nome, settori, p.isBio ? "Bio" : "Convenzionale", p.note || "—"];
    }),
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 2.5,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: withQty
      ? {
          0: { cellWidth: 22, fontStyle: "bold" },
          1: { cellWidth: 36 },
          2: { cellWidth: 32 },
          3: { cellWidth: 28 },
          4: { cellWidth: 22 },
          5: { cellWidth: "auto" },
        }
      : {
          0: { cellWidth: 26, fontStyle: "bold" },
          1: { cellWidth: 42 },
          2: { cellWidth: 36 },
          3: { cellWidth: 24 },
          4: { cellWidth: "auto" },
        },
    margin: { left: marginX, right: marginX },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `Pagina ${i} di ${pageCount}`,
      pageWidth - marginX,
      doc.internal.pageSize.getHeight() - 8,
      { align: "right" }
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = hasActiveProdottiPropriFilters(filters)
    ? "_filtrati"
    : "_completi";
  doc.save(
    `${withQty ? "elenco-quantita-agrinsicilia" : "prodotti-propri"}${suffix}_${safeFilenamePart(stamp)}.pdf`
  );
}
