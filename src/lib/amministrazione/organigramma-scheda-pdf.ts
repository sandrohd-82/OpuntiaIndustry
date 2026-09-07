import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  contrattoStatoLabel,
  contrattoTipoLabel,
  docTipoLabel,
  permessoTipoLabel,
  personaLabel,
  type PersonaSchedaExportFile,
  type PersonaSchedaExportPayload,
} from "@/lib/amministrazione/organigramma";

/** Helvetica/WinAnsi: accenti italiani ok, no virgolette tipografiche / char fuori Latin-1. */
function pdfSafeText(value: string): string {
  const mapped: Record<string, string> = {
    "\u2018": "'",
    "\u2019": "'",
    "\u201A": "'",
    "\u201B": "'",
    "`": "'",
    "\u00B4": "'",
    "\u201C": '"',
    "\u201D": '"',
    "\u201E": '"',
    "\u2013": "-",
    "\u2014": "-",
    "\u2212": "-",
    "\u2026": "...",
    "\u00A0": " ",
    "\u202F": " ",
    "\u2122": "",
    "\u00AE": "",
    "\u00A9": "",
  };
  let out = "";
  for (const ch of value.normalize("NFC")) {
    if (mapped[ch] !== undefined) {
      out += mapped[ch];
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 32 && code <= 126) {
      out += ch;
      continue;
    }
    if (code >= 160 && code <= 255) {
      out += ch;
      continue;
    }
    const folded = ch.normalize("NFD").replace(/\p{M}/gu, "");
    const first = folded.codePointAt(0);
    if (first && first >= 32 && first <= 255) out += folded[0];
    else out += " ";
  }
  return out.replace(/\s+/g, " ").trim();
}

function t(value: string): string {
  return pdfSafeText(value);
}

function formatData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const value = iso.includes("T") ? iso : `${iso}T00:00:00`;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("it-IT");
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 40);
}

function gruppoLabel(g: PersonaSchedaExportFile["gruppo"]): string {
  if (g === "identita") return "Documento di identità";
  if (g === "certificati") return "Corso / certificato";
  if (g === "contratti") return "Contratto";
  return "Busta paga";
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Stesso ritaglio della scheda: quadrato object-cover, non il file originale. */
async function tesseraJpegFromUrl(url: string, out = 512): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const nw = bitmap.width || 1;
    const nh = bitmap.height || 1;
    const scale = Math.max(out / nw, out / nh);
    const dw = nw * scale;
    const dh = nh * scale;
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(0, 0, out, out);
    ctx.drawImage(bitmap, (out - dw) / 2, (out - dh) / 2, dw, dh);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    return null;
  }
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
}

const TESSERA_MM = 36;

function writeAnagrafica(
  doc: jsPDF,
  payload: PersonaSchedaExportPayload,
  startY: number,
  fotoDataUrl: string | null
): number {
  const p = payload.persona;
  const margin = 14;
  let y = startY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(t("Anagrafica"), margin, y);
  y += 4;
  const rows: Array<[string, string]> = [
    [t("Nome"), t(`${p.cognome} ${p.nome}`)],
    [t("Codice fiscale"), t(p.codiceFiscale || "—")],
    [t("Carta d'identità"), t(p.cartaIdentita || "—")],
    [t("Reparto"), t(p.repartoNome || "—")],
    [t("Mansioni"), t(p.mansioni.map((m) => m.nome).join(", ") || "—")],
    [t("In forza"), t(p.inForza ? "Sì" : "No")],
    [t("Note"), t(p.note || "—")],
  ];
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: fotoDataUrl ? TESSERA_MM + 18 : margin },
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 1.2 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 38 },
      1: { cellWidth: "auto" },
    },
    body: rows,
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  if (fotoDataUrl) {
    try {
      const x = 210 - 14 - TESSERA_MM;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, startY + 1, TESSERA_MM, TESSERA_MM, 2, 2, "S");
      doc.addImage(fotoDataUrl, "JPEG", x, startY + 1, TESSERA_MM, TESSERA_MM);
    } catch {
      /* foto non incorporabile */
    }
    y = Math.max(y, startY + TESSERA_MM + 8);
  }
  return y;
}

export async function downloadPersonaSchedaPdf(
  payload: PersonaSchedaExportPayload
): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 14;
  const p = payload.persona;
  const sel = payload.selection;
  let y = 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(t("Scheda operatore"), margin, y);
  y += 7;
  doc.setFontSize(12);
  doc.text(t(personaLabel(p)), margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text(
    t(`Esportata il ${formatDateTime(payload.exportedAt)} da ${payload.exportedBy}`),
    margin,
    y
  );
  doc.setTextColor(20);
  y += 8;

  let fotoDataUrl: string | null = null;
  if (sel.foto && p.fotoUrl) {
    fotoDataUrl = await tesseraJpegFromUrl(p.fotoUrl);
  }

  if (sel.anagrafica || sel.foto) {
    y = writeAnagrafica(doc, payload, y, sel.foto ? fotoDataUrl : null);
  }

  function sectionTable(title: string, head: string[], body: string[][]) {
    if (y > 250) {
      doc.addPage();
      y = 16;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(t(title), margin, y);
    y += 3;
    const safeHead = head.map((h) => t(h));
    const safeBody = body.length
      ? body.map((row) => row.map((cell) => t(cell)))
      : [[t("Nessun elemento")]];
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [safeHead],
      body: safeBody,
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 1.6,
        overflow: "linebreak",
        cellWidth: "wrap",
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: 30,
        fontStyle: "bold",
      },
      columnStyles:
        safeHead.length === 4
          ? {
              0: { cellWidth: 70 },
              1: { cellWidth: 38 },
              2: { cellWidth: 32 },
              3: { cellWidth: 32 },
            }
          : safeHead.length === 5
            ? {
                0: { cellWidth: 52 },
                1: { cellWidth: 38 },
                2: { cellWidth: 28 },
                3: { cellWidth: 28 },
                4: { cellWidth: 26 },
              }
            : undefined,
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  if (sel.identitaElenco) {
    sectionTable(
      "Documenti di identità (elenco)",
      ["Tipo", "File", "Caricato"],
      payload.identita.map((d) => [
        docTipoLabel(d.tipo),
        d.fileName || d.titolo || "—",
        formatData(d.createdAt),
      ])
    );
  }
  if (sel.certificatiElenco) {
    sectionTable(
      "Corsi e certificati (elenco)",
      ["Titolo", "Tipo", "Rilascio", "Scadenza"],
      payload.certificati.map((d) => [
        d.titolo || "—",
        docTipoLabel(d.tipo),
        formatData(d.dataRilascio),
        formatData(d.dataScadenza),
      ])
    );
  }
  if (sel.contrattiElenco) {
    sectionTable(
      "Contratti (elenco)",
      ["Titolo", "Tipologia", "Dal", "Al", "Stato"],
      payload.contratti.map((c) => [
        c.titolo,
        contrattoTipoLabel(c.tipologia),
        formatData(c.dataInizio),
        c.tipologia === "tempo_indeterminato"
          ? "Indeterminato"
          : formatData(c.dataFine),
        contrattoStatoLabel(c.documentoStato),
      ])
    );
  }
  if (sel.busteElenco) {
    sectionTable(
      "Buste paga (elenco)",
      ["Titolo", "Periodo", "File"],
      payload.buste.map((d) => [
        d.titolo || "Busta paga",
        d.periodo || "—",
        d.fileName || "—",
      ])
    );
  }
  if (sel.autorizzazioni) {
    sectionTable(
      "Autorizzazioni postazione",
      ["Postazione", "Area"],
      payload.autorizzazioni.map((a) => [a.postoNome, a.areaNome])
    );
  }
  if (sel.permessi) {
    sectionTable(
      "Permessi / assenze",
      ["Tipo", "Dal", "Al", "Stato"],
      payload.permessi.map((x) => [
        permessoTipoLabel(x.tipo),
        formatData(x.dal),
        formatData(x.al),
        x.documentoStato,
      ])
    );
  }

  if (payload.files.length) {
    if (y > 250) {
      doc.addPage();
      y = 16;
    }
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.text(
      t(
        `A seguire ${payload.files.length} file allegat${payload.files.length === 1 ? "o" : "i"} selezionati.`
      ),
      margin,
      y
    );
  }

  const schedaBytes = doc.output("arraybuffer");
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const merged = await PDFDocument.create();
  const schedaPdf = await PDFDocument.load(schedaBytes);
  for (const page of await merged.copyPages(schedaPdf, schedaPdf.getPageIndices())) {
    merged.addPage(page);
  }

  const font = await merged.embedFont(StandardFonts.Helvetica);
  const fontBold = await merged.embedFont(StandardFonts.HelveticaBold);
  const A4: [number, number] = [595.28, 841.89];

  function drawSafe(
    page: { drawText: (s: string, o: object) => void },
    text: string,
    opts: { x: number; y: number; size: number; font: typeof font; color?: ReturnType<typeof rgb> }
  ) {
    const safe = t(text).slice(0, 110);
    try {
      page.drawText(safe, opts);
    } catch {
      const ascii = safe.normalize("NFD").replace(/\p{M}/gu, "");
      page.drawText(ascii.slice(0, 110), opts);
    }
  }

  for (const file of payload.files) {
    const sep = merged.addPage(A4);
    let sy = A4[1] - 50;
    drawSafe(sep, "Allegato in coda", {
      x: 40,
      y: sy,
      size: 14,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    sy -= 22;
    drawSafe(sep, `${gruppoLabel(file.gruppo)}: ${file.titolo}`, {
      x: 40,
      y: sy,
      size: 11,
      font,
    });
    sy -= 16;
    drawSafe(sep, `File: ${file.fileName}`, {
      x: 40,
      y: sy,
      size: 10,
      font,
    });
    sy -= 20;
    drawSafe(sep, "Contenuto nelle pagine successive.", {
      x: 40,
      y: sy,
      size: 10,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });

    try {
      const mime = (file.mime || "").toLowerCase();
      const name = file.fileName.toLowerCase();
      const isPdf = mime === "application/pdf" || name.endsWith(".pdf");
      const isPng = mime.includes("png") || name.endsWith(".png");
      const isJpg =
        mime.includes("jpeg") ||
        mime.includes("jpg") ||
        name.endsWith(".jpg") ||
        name.endsWith(".jpeg");
      const bytes = await fetchBytes(file.url);
      if (bytes.byteLength > 20 * 1024 * 1024) {
        throw new Error("File troppo grande (>20 MB)");
      }
      if (isPdf) {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        for (const page of await merged.copyPages(src, src.getPageIndices())) {
          merged.addPage(page);
        }
      } else if (isPng || isJpg) {
        const image = isPng
          ? await merged.embedPng(bytes)
          : await merged.embedJpg(bytes);
        const page = merged.addPage(A4);
        const maxW = A4[0] - 80;
        const maxH = A4[1] - 80;
        const scale = Math.min(maxW / image.width, maxH / image.height, 1);
        const w = image.width * scale;
        const h = image.height * scale;
        page.drawImage(image, {
          x: (A4[0] - w) / 2,
          y: (A4[1] - h) / 2,
          width: w,
          height: h,
        });
      } else {
        drawSafe(sep, "Formato non unibile in PDF (usa il file originale).", {
          x: 40,
          y: Math.max(40, sy - 16),
          size: 9,
          font,
          color: rgb(0.7, 0.2, 0.2),
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore file";
      drawSafe(sep, `(Non incorporato: ${msg.slice(0, 80)})`, {
        x: 40,
        y: Math.max(40, sy - 16),
        size: 9,
        font,
        color: rgb(0.7, 0.2, 0.2),
      });
    }
  }

  const out = await merged.save();
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `scheda-operatore_${safeFilenamePart(p.cognome)}_${safeFilenamePart(p.nome)}_${stamp}.pdf`;
  triggerBlobDownload(
    new Blob([new Uint8Array(out)], { type: "application/pdf" }),
    filename
  );
}
