import {
  POSTO_ELEMENTO_TIPO_LABEL,
  etichettaPayloadElemento,
  etichettaPayloadPallet,
  type PostoElemento,
  type PostoOccupazione,
} from "@/lib/magazzino/posto-occupazione";

export function pesoOccupazioneKg(occ: PostoOccupazione): number | null {
  const pesoEl = occ.elementi.reduce((s, e) => s + (e.pesoKg ?? 0), 0);
  const n =
    occ.pesoModo === "complessivo" && occ.pesoComplessivoKg != null
      ? Number(occ.pesoComplessivoKg)
      : pesoEl > 0
        ? pesoEl
        : Number(occ.kgAllocati ?? 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function formatKgIt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  return `${n.toLocaleString("it-IT")} kg`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function barcodePng(
  text: string,
  format: "qrcode" | "code128"
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const bwip = await import("bwip-js");
  const toCanvas =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bwip as any).toCanvas ?? (bwip as any).default?.toCanvas;
  if (typeof toCanvas !== "function") {
    throw new Error("Barcode non disponibile.");
  }
  const canvas = document.createElement("canvas");
  if (format === "qrcode") {
    await toCanvas(canvas, { bcid: "qrcode", text: trimmed, scale: 4 });
  } else {
    await toCanvas(canvas, {
      bcid: "code128",
      text: trimmed,
      scale: 3,
      height: 12,
      includetext: false,
    });
  }
  return canvas.toDataURL("image/png");
}

function openPrintHtml(html: string) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;left:0;top:0;width:1123px;height:794px;border:0;opacity:0;pointer-events:none;z-index:-1";
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument ?? win?.document;
  if (!win || !doc) {
    iframe.remove();
    return;
  }

  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    iframe.remove();
  };
  win.addEventListener("afterprint", cleanup);
  window.setTimeout(cleanup, 90_000);

  doc.open();
  doc.write(html);
  doc.close();

  const printNow = () => {
    win.focus();
    win.print();
  };

  const images = [...doc.querySelectorAll("img")];
  if (images.length === 0) {
    window.setTimeout(printNow, 50);
    return;
  }
  let pending = images.length;
  const done = () => {
    pending -= 1;
    if (pending <= 0) printNow();
  };
  for (const img of images) {
    if (img.complete) done();
    else {
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    }
  }
}

function metaRow(label: string, value: string): string {
  if (!value.trim() || value === "—") return "";
  return `<p class="meta"><span>${escapeHtml(label)}</span> ${escapeHtml(value)}</p>`;
}

function pageHtml(opts: {
  kicker: string;
  title: string;
  subtitle: string;
  meta: string;
  qr: string;
  barre: string;
  payload: string;
  codice: string;
}): string {
  return `<section class="page">
  <p class="kicker">${escapeHtml(opts.kicker)}</p>
  <h1>${escapeHtml(opts.title)}</h1>
  ${opts.subtitle ? `<p class="sub">${escapeHtml(opts.subtitle)}</p>` : ""}
  <div class="codes">
    ${opts.qr ? `<img class="qr" src="${opts.qr}" alt="" />` : ""}
    ${opts.barre ? `<img class="barre" src="${opts.barre}" alt="" />` : ""}
  </div>
  <p class="code">${escapeHtml(opts.codice)}</p>
  <p class="payload">${escapeHtml(opts.payload)}</p>
  <div class="meta-box">${opts.meta}</div>
</section>`;
}

export async function stampaEtichettePosto(opts: {
  occ: PostoOccupazione;
  prodotto?: { codice: string; nome: string } | null;
  postoCodice?: string;
  postoNome?: string;
  includePallet: boolean;
  elementi: PostoElemento[];
}): Promise<void> {
  const { occ } = opts;
  const peso = formatKgIt(pesoOccupazioneKg(occ));
  const prodotto = opts.prodotto
    ? `${opts.prodotto.codice}${opts.prodotto.nome ? ` — ${opts.prodotto.nome}` : ""}`
    : "";
  const posto = [opts.postoCodice, opts.postoNome].filter(Boolean).join(" — ");
  const tipo = POSTO_ELEMENTO_TIPO_LABEL[occ.tipoElemento];
  const mov = occ.movimentazioneNome || "Pallet";
  const nEl = occ.quantitaElementi ?? occ.elementi.length;

  const commonMeta = [
    metaRow("Posto", posto),
    metaRow("Prodotto", prodotto),
    metaRow("Lotto interno", occ.lottoInternoCodice || ""),
    metaRow("Lotto esterno", occ.lottoEsternoCodice || ""),
    metaRow("Movimentazione", mov),
    metaRow("Tipo elemento", `${tipo}${occ.imballaggioNome ? ` · ${occ.imballaggioNome}` : ""}`),
  ].join("");

  const pages: string[] = [];

  if (opts.includePallet && occ.codicePallet.trim()) {
    const payload = etichettaPayloadPallet(occ.codicePallet);
    const [qr, barre] = await Promise.all([
      barcodePng(payload, "qrcode"),
      barcodePng(occ.codicePallet, "code128"),
    ]);
    pages.push(
      pageHtml({
        kicker: "Etichetta cumulativa pallet",
        title: `${mov} ${occ.codicePallet}`,
        subtitle: `${nEl} ${nEl === 1 ? "collo" : "colli"} · peso ${peso}`,
        meta:
          commonMeta +
          metaRow("Peso pallet", peso) +
          (occ.pesoModo === "complessivo" && occ.pesoMotivazione
            ? metaRow("Motivazione peso", occ.pesoMotivazione)
            : ""),
        qr,
        barre,
        payload,
        codice: occ.codicePallet,
      })
    );
  }

  for (const el of opts.elementi) {
    const payload = etichettaPayloadElemento(occ.codicePallet, el.numero);
    const [qr, barre] = await Promise.all([
      barcodePng(payload, "qrcode"),
      barcodePng(el.numero, "code128"),
    ]);
    pages.push(
      pageHtml({
        kicker: "Etichetta collo",
        title: `Collo ${el.numero}`,
        subtitle: `${mov} ${occ.codicePallet}${
          el.pesoKg != null ? ` · ${formatKgIt(el.pesoKg)}` : ""
        }`,
        meta: commonMeta + metaRow("Peso collo", formatKgIt(el.pesoKg)),
        qr,
        barre,
        payload,
        codice: el.numero,
      })
    );
  }

  if (pages.length === 0) {
    throw new Error("Nessuna etichetta da stampare.");
  }

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Etichette ${escapeHtml(occ.codicePallet)}</title>
  <style>
    @page { size: A5 landscape; margin: 8mm; }
    html, body { margin: 0; background: #fff; color: #0f172a; font-family: system-ui, sans-serif; }
    .page {
      min-height: 128mm;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .page:last-child { page-break-after: auto; }
    .kicker { margin: 0; text-transform: uppercase; letter-spacing: 0.18em; font-size: 11px; color: #64748b; }
    h1 { margin: 8px 0 0; font-size: 28px; }
    .sub { margin: 6px 0 0; font-size: 14px; color: #334155; }
    .codes { margin-top: 14px; display: flex; align-items: center; justify-content: center; gap: 22px; }
    .qr { width: 38mm; height: auto; }
    .barre { max-width: 92mm; height: 22mm; object-fit: contain; }
    .code { margin: 12px 0 0; font-family: ui-monospace, Consolas, monospace; font-size: 26px; font-weight: 700; letter-spacing: 0.06em; }
    .payload { margin: 4px 0 0; font-family: ui-monospace, Consolas, monospace; font-size: 11px; color: #475569; }
    .meta-box { margin-top: 12px; text-align: left; min-width: 70%; }
    .meta { margin: 2px 0; font-size: 12px; }
    .meta span { display: inline-block; min-width: 9.5rem; color: #64748b; }
  </style>
</head>
<body>
${pages.join("\n")}
</body>
</html>`;

  openPrintHtml(html);
}
