import { jsPDF } from "jspdf";
import type { AnagraficaFormPayload, SedeAnagraficaForm } from "@/lib/anagrafica/richiesta-form";
import {
  altezzaTimbro,
  disegnaTimbroSottoNome,
  logoAgrinsiciliaPdf,
  numeraPagine,
} from "@/lib/anagrafica/presa-visione-pdf";

function rigaSede(sede: SedeAnagraficaForm): string[] {
  const luogo = [sede.cap, sede.citta, sede.provincia].filter(Boolean).join(" ");
  const lines = [
    sede.indirizzo,
    [luogo, sede.localita].filter(Boolean).join(" — "),
    sede.nazione,
    sede.telefono ? `Tel ${sede.telefono}` : "",
  ].filter(Boolean);
  return lines.length ? lines : ["—"];
}

export function pdfAnagraficaAziendale(
  form: AnagraficaFormPayload,
  dataCompilazione: string,
  timbro?: string
): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 16;
  const width = 178;
  const limite = 278;
  let y = 26;

  const passoDi = (size: number) => size * 0.36 + 1.15;
  const misura = (testo: string, size = 10) => {
    doc.setFontSize(size);
    const righe = doc.splitTextToSize(testo, width) as string[];
    return righe.length * passoDi(size);
  };

  const nuova = () => {
    doc.addPage();
    y = 26;
  };

  const scrivi = (testo: string, size = 10, style: "normal" | "bold" = "normal") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(15, 23, 42);
    const righe = doc.splitTextToSize(testo, width) as string[];
    const passo = passoDi(size);
    for (const riga of righe) {
      if (y > limite) nuova();
      doc.text(riga, left, y);
      y += passo;
    }
  };

  const blocco = (titolo: string, corpo: string[]) => {
    const hTitolo = misura(titolo, 10) + 1;
    let hCorpo = 0;
    for (const riga of corpo) hCorpo += misura(riga, 10);
    const minimo = hTitolo + Math.min(hCorpo, passoDi(10) * 2);
    if (y + minimo > limite) nuova();
    y += 0.6;
    scrivi(titolo, 10, "bold");
    for (const riga of corpo) scrivi(riga);
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  const titolo = "ARCHIVIO ANAGRAFICO";
  const titoloRighe = doc.splitTextToSize(titolo, width) as string[];
  const campi: Array<[string, string]> = [
    ["Ragione sociale", form.ragioneSociale],
    ["Partita IVA", form.partitaIva],
    ["Codice fiscale", form.codiceFiscale],
    ["Codice destinatario", form.sdiCode],
    ["PEC", form.pec],
    ["Telefono", form.telefono],
    ["E-mail", form.email],
  ];
  const hAnagrafica =
    titoloRighe.length * 6 +
    4 +
    campi.reduce((sum, [etichetta, valore]) => sum + misura(`${etichetta}: ${valore || "—"}`), 0);
  if (y + Math.min(hAnagrafica, 24) > limite) nuova();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  for (const riga of titoloRighe) {
    doc.text(riga, 105, y, { align: "center" });
    y += 5;
  }
  y += 2;
  for (const [etichetta, valore] of campi) {
    scrivi(`${etichetta}: ${valore || "—"}`);
  }

  blocco("Legale rappresentante e firmatario del documento", [
    `Cognome: ${form.legaleCognome || "—"}`,
    `Nome: ${form.legaleNome || "—"}`,
    `Telefono: ${form.legaleTel || "—"}`,
    `E-mail: ${form.legaleEmail || "—"}`,
  ]);

  const banca = [`${form.bancaAppoggio || "—"}`, `BIC: ${form.bancaBic || "—"}`, `IBAN: ${form.bancaIban || "—"}`];
  if (form.bancaFiliale) banca.push(`Filiale: ${form.bancaFiliale}`);
  blocco("Banca di appoggio", banca);

  blocco("Sede legale", rigaSede(form.sedeLegale));

  const amm = form.sedeAmmUgualeLegale ? form.sedeLegale : form.sedeAmministrativa;
  const righeAmm = form.sedeAmmUgualeLegale
    ? ["Uguale alla sede legale", ...rigaSede(amm)]
    : rigaSede(amm);
  blocco("Sede amministrativa", righeAmm);

  const mag =
    form.sedeMagFonte === "legale"
      ? form.sedeLegale
      : (form.sedeMagFonte === "amministrativa" ? amm : form.sedeMagazzino);
  const righeMag = !form.sedeMagFonte
    ? ["Non indicato"]
    : [
        ...(form.sedeMagFonte === "legale" ? ["Uguale alla sede legale"] : []),
        ...(form.sedeMagFonte === "amministrativa" ? ["Uguale alla sede amministrativa"] : []),
        ...rigaSede(mag),
      ];
  blocco("Indirizzo di consegna o ritiro magazzino", righeMag);

  const facoltativi: Array<[string, string]> = [
    ["Responsabile acquisti", [form.respAcquistiNome, form.respAcquistiTel, form.respAcquistiEmail].filter(Boolean).join(" · ")],
    ["Responsabile tecnico", [form.respTecnicoNome, form.respTecnicoTel, form.respTecnicoEmail].filter(Boolean).join(" · ")],
  ];
  for (const [etichetta, valore] of facoltativi) {
    if (valore) scrivi(`${etichetta}: ${valore}`);
  }

  scrivi(
    "Vi autorizziamo al trattamento dei nostri dati ai sensi del Regolamento UE 2016/679, della legge 196/2003 e per i fini dichiarati."
  );
  y += 4;

  const firmatario = [form.legaleNome, form.legaleCognome].filter(Boolean).join(" ").trim() || "—";
  const xFirma = 118;
  const larghezzaFirma = 76;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const nomeRighe = doc.splitTextToSize(`Firma: ${firmatario}`, larghezzaFirma) as string[];
  const hNome = Math.max(1, nomeRighe.length) * 5;
  const hTimbro = timbro ? altezzaTimbro(doc, timbro, larghezzaFirma) : 8;
  const hFirma = Math.max(6, hNome) + hTimbro;
  if (y + hFirma > limite) nuova();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`Data: ${dataCompilazione}`, left, y);
  let yNome = y;
  for (const riga of nomeRighe) {
    doc.text(riga, xFirma, yNome);
    yNome += 5;
  }
  if (timbro) {
    disegnaTimbroSottoNome(doc, xFirma, yNome - 5, timbro, larghezzaFirma);
  } else {
    const yLinea = yNome + 2;
    doc.setDrawColor(30);
    doc.line(xFirma, yLinea, xFirma + 70, yLinea);
  }

  const logo = logoAgrinsiciliaPdf();
  const pagine = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= pagine; pagina += 1) {
    doc.setPage(pagina);
    if (logo) doc.addImage(logo, "PNG", 168, 8, 28, 12);
  }
  numeraPagine(doc);
  doc.setProperties({ title: "Anagrafica Aziendale" });
  return Buffer.from(doc.output("arraybuffer"));
}
