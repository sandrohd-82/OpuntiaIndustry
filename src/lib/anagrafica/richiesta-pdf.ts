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
    const limite = timbro ? 232 : 272;
    for (const riga of righe) {
      if (y > limite) {
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
  if (timbro) {
    const pagine = doc.getNumberOfPages();
    for (let pagina = 1; pagina <= pagine; pagina += 1) {
      doc.setPage(pagina);
      const testo = `${timbro} | ${pagina} di ${pagine}`;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      const colonna = 118;
      const destra = 194;
      const righe = doc.splitTextToSize(testo, colonna) as string[];
      const interlinea = 3.2;
      const fondo = 285;
      const yPrima = fondo - Math.max(0, righe.length - 1) * interlinea;
      const raggio = 8.5;
      const cx = destra - raggio;
      const cy = yPrima - 5 - raggio;
      doc.setDrawColor(20, 60, 140);
      doc.setLineWidth(0.7);
      doc.circle(cx, cy, raggio, "S");
      doc.setLineWidth(0.25);
      doc.circle(cx, cy, raggio - 1.3, "S");
      doc.setTextColor(20, 60, 140);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.text("FIRMATO", cx, cy - 0.5, { align: "center" });
      doc.setFontSize(5.5);
      doc.text("OTP", cx, cy + 2.6, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(30);
      let base = yPrima;
      for (const riga of righe) {
        doc.text(riga, destra, base, { align: "right" });
        base += interlinea;
      }
    }
    doc.setTextColor(0);
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
  }
  doc.setProperties({ title: "Anagrafica Aziendale" });
  return Buffer.from(doc.output("arraybuffer"));
}
