import { jsPDF } from "jspdf";
import type { AnagraficaFormPayload, SedeAnagraficaForm } from "@/lib/anagrafica/richiesta-form";

function rigaSede(sede: SedeAnagraficaForm): string[] {
  const luogo = [sede.cap, sede.citta, sede.provincia].filter(Boolean).join(" ");
  const lines = [
    sede.indirizzo,
    [luogo, sede.localita].filter(Boolean).join(" — "),
    sede.nazione,
  ].filter(Boolean);
  if (sede.telefono) lines.push(`Tel ${sede.telefono}`);
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
  let y = 16;

  const scrivi = (testo: string, size = 10, style: "normal" | "bold" = "normal") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const righe = doc.splitTextToSize(testo, width) as string[];
    for (const riga of righe) {
      if (y > 280) {
        doc.addPage();
        y = 16;
      }
      doc.text(riga, left, y);
      y += size * 0.45 + 2.2;
    }
  };

  scrivi("Spett.le", 11, "bold");
  scrivi("Agrinsicilia coop", 11, "bold");
  scrivi("Sede legale: Via Pacini Giovanni 6");
  scrivi("92027 Licata (AG)");
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const titolo = "OGGETTO: ARCHIVIO ANAGRAFICO";
  const titoloRighe = doc.splitTextToSize(titolo, width) as string[];
  for (const riga of titoloRighe) {
    doc.text(riga, 105, y, { align: "center" });
    y += 6;
  }
  y += 2;
  scrivi("Vi trasmettiamo di seguito i nostri dati:", 10, "bold");
  y += 2;

  const campi: Array<[string, string]> = [
    ["Ragione sociale", form.ragioneSociale],
    ["Partita IVA", form.partitaIva],
    ["Codice fiscale", form.codiceFiscale],
    ["Codice destinatario", form.sdiCode],
    ["PEC", form.pec],
    ["Telefono", form.telefono],
    ["E-mail", form.email],
  ];
  for (const [etichetta, valore] of campi) {
    scrivi(`${etichetta}: ${valore || "—"}`);
  }
  y += 2;
  scrivi("Legale rappresentante e firmatario del documento", 10, "bold");
  scrivi(`Cognome: ${form.legaleCognome || "—"}`);
  scrivi(`Nome: ${form.legaleNome || "—"}`);
  scrivi(`Telefono: ${form.legaleTel || "—"}`);
  scrivi(`E-mail: ${form.legaleEmail || "—"}`);
  y += 2;
  scrivi(`Banca di appoggio: ${form.bancaAppoggio || "—"}`);
  scrivi(`BIC: ${form.bancaBic || "—"}`);
  scrivi(`IBAN: ${form.bancaIban || "—"}`);
  if (form.bancaFiliale) scrivi(`Filiale: ${form.bancaFiliale}`);
  y += 2;
  scrivi("Sede legale", 10, "bold");
  for (const riga of rigaSede(form.sedeLegale)) scrivi(riga);
  y += 1;
  scrivi("Sede amministrativa", 10, "bold");
  const amm = form.sedeAmmUgualeLegale ? form.sedeLegale : form.sedeAmministrativa;
  if (form.sedeAmmUgualeLegale) scrivi("Uguale alla sede legale");
  for (const riga of rigaSede(amm)) scrivi(riga);
  y += 1;
  scrivi("Indirizzo di consegna o ritiro magazzino", 10, "bold");
  const mag =
    form.sedeMagFonte === "legale"
      ? form.sedeLegale
      : (form.sedeMagFonte === "amministrativa" ? amm : form.sedeMagazzino);
  if (form.sedeMagFonte === "legale") scrivi("Uguale alla sede legale");
  if (form.sedeMagFonte === "amministrativa") scrivi("Uguale alla sede amministrativa");
  if (!form.sedeMagFonte) scrivi("Non indicato");
  else for (const riga of rigaSede(mag)) scrivi(riga);

  const facoltativi: Array<[string, string]> = [
    ["Responsabile acquisti", [form.respAcquistiNome, form.respAcquistiTel, form.respAcquistiEmail].filter(Boolean).join(" · ")],
    ["Responsabile tecnico", [form.respTecnicoNome, form.respTecnicoTel, form.respTecnicoEmail].filter(Boolean).join(" · ")],
  ];
  for (const [etichetta, valore] of facoltativi) {
    if (valore) scrivi(`${etichetta}: ${valore}`);
  }

  if (y > 190) {
    doc.addPage();
    y = 16;
  }
  y += 4;
  scrivi(
    "Vi autorizziamo al trattamento dei nostri dati ai sensi del Regolamento UE 2016/679, della legge 196/2003 e per i fini dichiarati."
  );
  y += 6;
  scrivi(`Data: ${dataCompilazione}`);
  y += 14;
  if (!timbro) {
    doc.setDrawColor(30);
    doc.line(left, y, left + 70, y);
    y += 5;
    scrivi("Firma");
    scrivi("(Rappresentante Legale)");
  }
  y += 4;
  scrivi(
    "Da restituire compilato su carta intestata e firmato da Rappresentante Legale oppure firmare tramite OTP: verranno salvate mail, IP, data e ora e token.",
    8
  );
  if (timbro) {
    const pagine = doc.getNumberOfPages();
    for (let pagina = 1; pagina <= pagine; pagina += 1) {
      doc.setPage(pagina);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(30);
      const righe = doc.splitTextToSize(timbro, width) as string[];
      let base = 292 - righe.length * 3.2;
      doc.setDrawColor(30);
      doc.line(left, base - 3, left + width, base - 3);
      for (const riga of righe) {
        doc.text(riga, left, base);
        base += 3.2;
      }
    }
  }
  doc.setProperties({ title: "Anagrafica Aziendale" });
  return Buffer.from(doc.output("arraybuffer"));
}
