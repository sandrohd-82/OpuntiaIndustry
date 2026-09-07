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

async function fetchImageForJsPdf(
  url: string
): Promise<{ data: string; format: "JPEG" | "PNG" } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const type = (blob.type || "").toLowerCase();
    const format = type.includes("png") ? "PNG" : type.includes("jpeg") || type.includes("jpg") ? "JPEG" : null;
    if (!format) return null;
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Lettura immagine fallita"));
      reader.readAsDataURL(blob);
    });
    return { data, format };
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

function writeAnagrafica(
  doc: jsPDF,
  payload: PersonaSchedaExportPayload,
  startY: number,
  fotoData: { data: string; format: "JPEG" | "PNG" } | null
): number {
  const p = payload.persona;
  const margin = 14;
  let y = startY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Anagrafica", margin, y);
  y += 4;
  const rows: Array<[string, string]> = [
    ["Nome", `${p.cognome} ${p.nome}`],
    ["Codice fiscale", p.codiceFiscale || "—"],
    ["Carta d'identità", p.cartaIdentita || "—"],
    ["Reparto", p.repartoNome || "—"],
    ["Mansioni", p.mansioni.map((m) => m.nome).join(", ") || "—"],
    ["In forza", p.inForza ? "Sì" : "No"],
    ["Note", p.note || "—"],
  ];
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: fotoData ? 52 : margin },
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.2 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 38 },
      1: { cellWidth: "auto" },
    },
    body: rows,
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  if (fotoData) {
    try {
      doc.addImage(fotoData.data, fotoData.format, 160, startY + 2, 32, 40);
    } catch {
      /* foto non incorporabile */
    }
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
  doc.text("Scheda operatore", margin, y);
  y += 7;
  doc.setFontSize(12);
  doc.text(personaLabel(p), margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text(
    `Esportata il ${formatDateTime(payload.exportedAt)} da ${payload.exportedBy}`,
    margin,
    y
  );
  doc.setTextColor(20);
  y += 8;

  let fotoData: { data: string; format: "JPEG" | "PNG" } | null = null;
  if (sel.foto && p.fotoUrl) {
    fotoData = await fetchImageForJsPdf(p.fotoUrl);
  }

  if (sel.anagrafica || sel.foto) {
    y = writeAnagrafica(doc, payload, y, sel.foto ? fotoData : null);
  }

  function sectionTable(title: string, head: string[], body: string[][]) {
    if (y > 250) {
      doc.addPage();
      y = 16;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(title, margin, y);
    y += 3;
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [head],
      body: body.length ? body : [["Nessun elemento"]],
      styles: { fontSize: 8, cellPadding: 1.6 },
      headStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: "bold" },
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
        c.tipologia === "tempo_indeterminato" ? "Indeterminato" : formatData(c.dataFine),
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
      `A seguire ${payload.files.length} file allegat${payload.files.length === 1 ? "o" : "i"} selezionati.`,
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

  for (const file of payload.files) {
    const sep = merged.addPage(A4);
    let sy = A4[1] - 50;
    sep.drawText("Allegato in coda", {
      x: 40,
      y: sy,
      size: 14,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    sy -= 22;
    sep.drawText(`${gruppoLabel(file.gruppo)}: ${file.titolo}`.slice(0, 110), {
      x: 40,
      y: sy,
      size: 11,
      font,
    });
    sy -= 16;
    sep.drawText(`File: ${file.fileName}`.slice(0, 110), {
      x: 40,
      y: sy,
      size: 10,
      font,
    });
    sy -= 20;
    sep.drawText("Contenuto nelle pagine successive.", {
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
        sep.drawText("Formato non unibile in PDF (usa il file originale).", {
          x: 40,
          y: Math.max(40, sy - 16),
          size: 9,
          font,
          color: rgb(0.7, 0.2, 0.2),
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore file";
      sep.drawText(`(Non incorporato: ${msg.slice(0, 80)})`, {
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
