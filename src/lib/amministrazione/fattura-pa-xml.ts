import { roundMoney } from "@/lib/amministrazione/fatture";
import type {
  PaperInvoiceLine,
  PaperInvoiceModel,
  PaperIvaCastelletto,
  PaperParty,
} from "@/lib/amministrazione/paper-invoice";

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(s: string): string {
  return decodeXmlEntities(s.replace(/<[^>]+>/g, "").trim());
}

/** Testo del primo elemento con local-name (ignora namespace). */
export function xmlText(xml: string, localName: string): string {
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${localName}>`,
    "i"
  );
  const m = xml.match(re);
  return m ? stripTags(m[1]) : "";
}

function xmlBlocks(xml: string, localName: string): string[] {
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${localName}>`,
    "gi"
  );
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1]);
  }
  return out;
}

function emptyParty(): PaperParty {
  return {
    ragioneSociale: "",
    partitaIva: "",
    codiceFiscale: "",
    indirizzo: "",
    citta: "",
    cap: "",
    provincia: "",
    pec: "",
    email: "",
    telefono: "",
    sdi: "",
  };
}

function partyFromAnagraficaBlock(block: string): PaperParty {
  const p = emptyParty();
  p.partitaIva = xmlText(block, "IdCodice");
  p.codiceFiscale = xmlText(block, "CodiceFiscale") || p.partitaIva;
  p.ragioneSociale =
    xmlText(block, "Denominazione") ||
    [xmlText(block, "Nome"), xmlText(block, "Cognome")]
      .filter(Boolean)
      .join(" ");
  p.indirizzo = [
    xmlText(block, "Indirizzo"),
    xmlText(block, "NumeroCivico"),
  ]
    .filter(Boolean)
    .join(" ");
  p.cap = xmlText(block, "CAP");
  p.citta = xmlText(block, "Comune");
  p.provincia = xmlText(block, "Provincia");
  return p;
}

function enrichPartyFromOuter(outer: string, party: PaperParty): PaperParty {
  const email = xmlText(outer, "Email");
  const tel = xmlText(outer, "Telefono");
  const pec = /pec/i.test(email) ? email : xmlText(outer, "PEC") || party.pec;
  return {
    ...party,
    email: party.email || email,
    telefono: party.telefono || tel,
    pec: party.pec || pec,
    indirizzo:
      party.indirizzo ||
      [
        [party.indirizzo, party.cap, party.citta, party.provincia]
          .filter(Boolean)
          .join(" "),
      ][0],
  };
}

function formatPartyAddress(p: PaperParty): string {
  const line1 = p.indirizzo;
  const line2 = [p.cap, p.citta, p.provincia ? `(${p.provincia})` : ""]
    .filter(Boolean)
    .join(" ");
  return [line1, line2].filter(Boolean).join(", ");
}

function parseIsoDateIt(raw: string): string | null {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = /^(\d{2})[/.-](\d{2})[/.-](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function num(raw: string): number {
  const n = Number(String(raw).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Converte XML FatturaPA (SDI) in modello foglio carta.
 */
export function parseFatturaPaXml(xml: string): PaperInvoiceModel {
  const cleaned = xml.replace(/^\uFEFF/, "").trim();
  if (!cleaned.startsWith("<")) {
    throw new Error("Il contenuto non è un XML FatturaPA valido.");
  }

  const cedenteOuter =
    xmlBlocks(cleaned, "CedentePrestatore")[0] ??
    xmlBlocks(cleaned, "CedentePrestatoreDTE")[0] ??
    "";
  const cessionarioOuter =
    xmlBlocks(cleaned, "CessionarioCommittente")[0] ?? "";

  let mittente = partyFromAnagraficaBlock(cedenteOuter);
  mittente = enrichPartyFromOuter(cedenteOuter, mittente);
  mittente.indirizzo = formatPartyAddress(mittente) || mittente.indirizzo;
  mittente.sdi = xmlText(cleaned, "ProgressivoInvio") ? "" : mittente.sdi;
  // PEC cedente spesso in Contatti
  if (!mittente.pec && mittente.email && /pec|legalmail|cert/i.test(mittente.email)) {
    mittente.pec = mittente.email;
  }

  let destinatario = partyFromAnagraficaBlock(cessionarioOuter);
  destinatario = enrichPartyFromOuter(cessionarioOuter, destinatario);
  destinatario.sdi =
    xmlText(cleaned, "CodiceDestinatario") || destinatario.sdi;
  destinatario.indirizzo =
    formatPartyAddress(destinatario) || destinatario.indirizzo;

  const numero =
    xmlText(cleaned, "Numero") ||
    xmlText(cleaned, "NumeroFattura") ||
    "—";
  const data = parseIsoDateIt(xmlText(cleaned, "Data"));

  const lineBlocks = xmlBlocks(cleaned, "DettaglioLinee");
  const righe: PaperInvoiceLine[] = lineBlocks.map((block) => {
    const quantita = num(xmlText(block, "Quantita")) || 1;
    const prezzo = num(xmlText(block, "PrezzoUnitario"));
    const importo =
      num(xmlText(block, "PrezzoTotale")) || roundMoney(quantita * prezzo);
    const scontoBlocks = xmlBlocks(block, "ScontoMaggiorazione");
    let sconto = 0;
    for (const sb of scontoBlocks) {
      if (xmlText(sb, "Tipo").toUpperCase() === "SC") {
        sconto += num(xmlText(sb, "Percentuale"));
      }
    }
    return {
      descrizione:
        xmlText(block, "Descrizione") ||
        xmlText(block, "CodiceArticolo") ||
        "Voce",
      quantita,
      unitaMisura: xmlText(block, "UnitaMisura") || "NR",
      prezzo,
      scontoPercentuale: Math.min(100, Math.max(0, sconto)),
      ivaPercentuale: num(xmlText(block, "AliquotaIVA")),
      importo: roundMoney(importo),
    };
  });

  const riepilogoBlocks = xmlBlocks(cleaned, "DatiRiepilogo");
  const castelletto: PaperIvaCastelletto[] = riepilogoBlocks.map((block) => ({
    aliquota: num(xmlText(block, "AliquotaIVA")),
    imponibile: roundMoney(num(xmlText(block, "ImponibileImporto"))),
    imposta: roundMoney(num(xmlText(block, "Imposta"))),
    natura: xmlText(block, "Natura"),
    esigibilita: xmlText(block, "EsigibilitaIVA") || "I",
  }));

  const scissionePagamenti = castelletto.some(
    (c) => c.esigibilita.toUpperCase() === "S"
  );

  let imponibile = castelletto.reduce((s, c) => s + c.imponibile, 0);
  const iva = castelletto.reduce((s, c) => s + c.imposta, 0);
  if (imponibile === 0 && righe.length) {
    imponibile = righe.reduce((s, r) => s + r.importo, 0);
  }
  const totaleDoc = num(xmlText(cleaned, "ImportoTotaleDocumento"));
  const totale =
    totaleDoc ||
    roundMoney(imponibile + (scissionePagamenti ? 0 : iva));

  const pagamenti = xmlBlocks(cleaned, "DettaglioPagamento");
  let dataScadenza: string | null = null;
  let iban = "";
  const noteParts: string[] = [];
  for (const p of pagamenti) {
    if (!dataScadenza) {
      dataScadenza = parseIsoDateIt(xmlText(p, "DataScadenzaPagamento"));
    }
    if (!iban) iban = xmlText(p, "IBAN").replace(/\s+/g, "").toUpperCase();
    const modo = xmlText(p, "ModalitaPagamento");
    const importoPag = xmlText(p, "ImportoPagamento");
    if (modo || importoPag) {
      noteParts.push(
        [modo, importoPag ? `€ ${importoPag}` : ""].filter(Boolean).join(" · ")
      );
    }
  }

  const causale = xmlBlocks(cleaned, "Causale")
    .map((c) => stripTags(c))
    .filter(Boolean)
    .join(" — ");

  return {
    numero,
    data,
    dataScadenza,
    mittente,
    destinatario,
    righe,
    castelletto:
      castelletto.length > 0
        ? castelletto
        : (() => {
            const map = new Map<number, PaperIvaCastelletto>();
            for (const r of righe) {
              const cur = map.get(r.ivaPercentuale) ?? {
                aliquota: r.ivaPercentuale,
                imponibile: 0,
                imposta: 0,
                natura: "",
                esigibilita: "I",
              };
              cur.imponibile = roundMoney(cur.imponibile + r.importo);
              cur.imposta = roundMoney(
                (cur.imponibile * cur.aliquota) / 100
              );
              map.set(r.ivaPercentuale, cur);
            }
            return [...map.values()];
          })(),
    imponibile: roundMoney(imponibile),
    iva: roundMoney(iva),
    totale: roundMoney(totale),
    iban,
    notePagamento: [noteParts.join("; "), causale].filter(Boolean).join(" — "),
    fonte: "fic",
    scissionePagamenti,
  };
}
