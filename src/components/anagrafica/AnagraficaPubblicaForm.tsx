"use client";

import { useState } from "react";
import {
  caricaFirmatoAnagraficaAction,
  comuniCapAnagraficaAction,
  modificaAnagraficaAction,
  salvaCampoAnagraficaAction,
  scaricaPdfAnagraficaAction,
} from "@/app/actions/anagrafica-richiesta-pubblica";
import {
  DOCUMENTI_TITOLARE,
  type AnagraficaFormPayload,
  type SedeAnagraficaForm,
  type VistaPubblica,
} from "@/lib/anagrafica/richiesta-form";

function AvvisoTest({ attivo }: { attivo: boolean }) {
  if (!attivo) return null;
  return (
    <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      Fase di test. I dati si salvano, ma l&apos;azienda può annullare la prova e riportare la scheda a com&apos;era prima dell&apos;invio.
    </p>
  );
}

const NAZIONI = [
  "Italia",
  "Francia",
  "Germania",
  "Spagna",
  "Svizzera",
  "Austria",
  "Belgio",
  "Paesi Bassi",
  "Regno Unito",
  "Stati Uniti",
];

type ComuneCap = { citta: string; provincia: string };

function Campo({
  label,
  value,
  onChange,
  onBlur,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onBlur(event.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
      />
    </label>
  );
}

export function AnagraficaPubblicaForm({
  token,
  iniziale,
}: {
  token: string;
  iniziale: VistaPubblica | { errore: string };
}) {
  const partenza = "errore" in iniziale ? null : iniziale;
  const [stato, setStato] = useState(partenza?.stato ?? "scaduta");
  const [form, setForm] = useState<AnagraficaFormPayload | null>(partenza?.form ?? null);
  const [messaggio, setMessaggio] = useState("errore" in iniziale ? iniziale.errore : "");
  const [mancanti, setMancanti] = useState<string[]>([]);
  const [occupato, setOccupato] = useState(false);
  const [comuni, setComuni] = useState<Record<string, ComuneCap[]>>({});
  const faseTest = partenza?.faseTest === true;

  if (!form || stato === "scaduta" || stato === "annullata") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-xl font-semibold">Anagrafica aziendale</h1>
        <p className="mt-3 text-sm text-slate-700">
          {messaggio || "Il link non è più valido. Chiedete all'azienda di inviarne uno nuovo."}
        </p>
      </main>
    );
  }

  async function salva(campo: string, valore: unknown) {
    setMessaggio("");
    const esito = await salvaCampoAnagraficaAction({ token, campo, valore });
    if ("errore" in esito) {
      setMessaggio(esito.errore);
      return;
    }
    setForm(esito.form);
  }

  function aggiorna(campo: keyof AnagraficaFormPayload, valore: string) {
    setForm((corrente) => (corrente ? { ...corrente, [campo]: valore } : corrente));
  }

  async function salvaSede(
    campo: "sedeLegale" | "sedeAmministrativa" | "sedeMagazzino",
    sede: SedeAnagraficaForm
  ) {
    setForm((corrente) => (corrente ? { ...corrente, [campo]: sede } : corrente));
    await salva(campo, sede);
  }

  async function alCap(
    campo: "sedeLegale" | "sedeAmministrativa" | "sedeMagazzino",
    sede: SedeAnagraficaForm
  ) {
    if (sede.nazione !== "Italia" || !/^\d{5}$/.test(sede.cap)) {
      await salvaSede(campo, sede);
      return;
    }
    const esito = await comuniCapAnagraficaAction({ token, cap: sede.cap });
    if ("errore" in esito) {
      setMessaggio(esito.errore);
      return;
    }
    setComuni((corrente) => ({ ...corrente, [campo]: esito.comuni }));
    if (esito.comuni.length === 1) {
      await salvaSede(campo, {
        ...sede,
        citta: esito.comuni[0].citta,
        provincia: esito.comuni[0].provincia,
      });
      return;
    }
    await salvaSede(campo, sede);
  }

  async function scarica() {
    setOccupato(true);
    setMancanti([]);
    setMessaggio("");
    const esito = await scaricaPdfAnagraficaAction(token);
    setOccupato(false);
    if ("errore" in esito) {
      setMessaggio(esito.errore);
      setMancanti(esito.mancanti ?? []);
      return;
    }
    const binario = atob(esito.pdfBase64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = esito.fileName;
    link.click();
    URL.revokeObjectURL(url);
    setForm(esito.form);
    setStato("pdf_pronto");
  }

  if (stato === "firmata") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <AvvisoTest attivo={faseTest} />
        <h1 className="text-xl font-semibold">Anagrafica aziendale</h1>
        <p className="mt-3 text-sm text-slate-700">
          Grazie. Il documento firmato è stato ricevuto e la procedura è chiusa.
        </p>
      </main>
    );
  }

  if (stato === "pdf_pronto") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <AvvisoTest attivo={faseTest} />
        <h1 className="text-xl font-semibold">Anagrafica aziendale</h1>
        <p className="mt-3 text-sm text-slate-700">
          Stampate il PDF su carta intestata, timbratelo e fatelo firmare dal Rappresentante Legale.
          Poi caricatelo qui, oppure correggete i dati e scaricate un nuovo PDF.
        </p>
        {messaggio ? <p className="mt-3 text-sm text-red-700">{messaggio}</p> : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={occupato}
            onClick={async () => {
              setOccupato(true);
              const esito = await modificaAnagraficaAction(token);
              setOccupato(false);
              if ("errore" in esito) {
                setMessaggio(esito.errore);
                return;
              }
              setForm(esito.form);
              setStato("compilazione");
            }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold"
          >
            Modifica i dati e scarica nuovo PDF
          </button>
        </div>
        <form
          className="mt-6 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setOccupato(true);
            setMessaggio("");
            const dati = new FormData(event.currentTarget);
            dati.set("token", token);
            const esito = await caricaFirmatoAnagraficaAction(dati);
            setOccupato(false);
            if ("errore" in esito) {
              setMessaggio(esito.errore);
              return;
            }
            setStato("firmata");
          }}
        >
          <label className="block text-sm font-medium text-slate-700">
            Carica documento firmato
            <input
              name="file"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              required
              className="mt-1 block w-full text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={occupato}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Carica documento firmato
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <AvvisoTest attivo={faseTest} />
      <p className="text-sm font-semibold">Spett.le</p>
      <p className="text-sm font-semibold">Agrinsicilia coop</p>
      <p className="text-sm">Sede legale: Via Pacini Giovanni 6</p>
      <p className="text-sm">92027 Licata (AG)</p>
      <h1 className="mt-6 text-center text-base font-semibold">
        OGGETTO: ARCHIVIO ANAGRAFICO e INFORMAZIONI PER MODELLO ORGANIZZATIVO
      </h1>
      <p className="mt-4 text-sm">Vi trasmettiamo di seguito i nostri dati:</p>
      <p className="mt-2 text-xs text-slate-500">
        Ogni campo viene salvato appena uscite dal campo. Potete chiudere e riprendere da qui.
      </p>
      {messaggio ? <p className="mt-3 text-sm text-red-700">{messaggio}</p> : null}
      {mancanti.length ? (
        <ul className="mt-2 list-disc pl-5 text-sm text-red-700">
          {mancanti.map((voce) => (
            <li key={voce}>{voce}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 space-y-4">
        <Campo
          label="Ragione sociale"
          required
          value={form.ragioneSociale}
          onChange={(valore) => aggiorna("ragioneSociale", valore)}
          onBlur={(valore) => void salva("ragioneSociale", valore)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            label="P. IVA"
            value={form.partitaIva}
            onChange={(valore) => aggiorna("partitaIva", valore)}
            onBlur={(valore) => void salva("partitaIva", valore)}
          />
          <Campo
            label="Codice fiscale"
            value={form.codiceFiscale}
            onChange={(valore) => aggiorna("codiceFiscale", valore)}
            onBlur={(valore) => void salva("codiceFiscale", valore)}
          />
          <Campo
            label="Codice destinatario"
            value={form.sdiCode}
            onChange={(valore) => aggiorna("sdiCode", valore)}
            onBlur={(valore) => void salva("sdiCode", valore)}
          />
          <Campo
            label="P.E.C."
            value={form.pec}
            onChange={(valore) => aggiorna("pec", valore)}
            onBlur={(valore) => void salva("pec", valore)}
          />
          <Campo
            label="N° tel"
            value={form.telefono}
            onChange={(valore) => aggiorna("telefono", valore)}
            onBlur={(valore) => void salva("telefono", valore)}
          />
          <Campo
            label="E-mail"
            required
            type="email"
            value={form.email}
            onChange={(valore) => aggiorna("email", valore)}
            onBlur={(valore) => void salva("email", valore)}
          />
        </div>
        <p className="text-xs text-slate-500">
          P. IVA oppure codice fiscale. Codice destinatario oppure PEC. Con 0000000 la PEC è obbligatoria.
        </p>

        <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold">Responsabile acquisti</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo label="Nome" value={form.respAcquistiNome} onChange={(v) => aggiorna("respAcquistiNome", v)} onBlur={(valore) => void salva("respAcquistiNome", valore)} />
            <Campo label="Tel" value={form.respAcquistiTel} onChange={(v) => aggiorna("respAcquistiTel", v)} onBlur={(valore) => void salva("respAcquistiTel", valore)} />
            <Campo label="E-mail" value={form.respAcquistiEmail} onChange={(v) => aggiorna("respAcquistiEmail", v)} onBlur={(valore) => void salva("respAcquistiEmail", valore)} />
          </div>
        </fieldset>
        <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold">Responsabile tecnico</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo label="Nome" value={form.respTecnicoNome} onChange={(v) => aggiorna("respTecnicoNome", v)} onBlur={(valore) => void salva("respTecnicoNome", valore)} />
            <Campo label="Tel" value={form.respTecnicoTel} onChange={(v) => aggiorna("respTecnicoTel", v)} onBlur={(valore) => void salva("respTecnicoTel", valore)} />
            <Campo label="E-mail" value={form.respTecnicoEmail} onChange={(v) => aggiorna("respTecnicoEmail", v)} onBlur={(valore) => void salva("respTecnicoEmail", valore)} />
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo label="Banca appoggio" required value={form.bancaAppoggio} onChange={(v) => aggiorna("bancaAppoggio", v)} onBlur={(valore) => void salva("bancaAppoggio", valore)} />
          <Campo label="Filiale" required value={form.bancaFiliale} onChange={(v) => aggiorna("bancaFiliale", v)} onBlur={(valore) => void salva("bancaFiliale", valore)} />
          <Campo label="IBAN" required value={form.bancaIban} onChange={(v) => aggiorna("bancaIban", v)} onBlur={(valore) => void salva("bancaIban", valore)} />
        </div>

        <SedeBlocco
          titolo="Sede legale"
          sede={form.sedeLegale}
          comuni={comuni.sedeLegale ?? []}
          onChange={(sede) => setForm((c) => (c ? { ...c, sedeLegale: sede } : c))}
          onBlurCampo={(sede) => void salvaSede("sedeLegale", sede)}
          onCap={(sede) => void alCap("sedeLegale", sede)}
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.sedeAmmUgualeLegale}
            onChange={(event) => {
              const acceso = event.target.checked;
              setForm((c) => (c ? { ...c, sedeAmmUgualeLegale: acceso } : c));
              void salva("sedeAmmUgualeLegale", acceso);
            }}
          />
          La sede amministrativa coincide con la sede legale
        </label>
        {form.sedeAmmUgualeLegale ? null : (
          <SedeBlocco
            titolo="Sede amministrativa"
            sede={form.sedeAmministrativa}
            comuni={comuni.sedeAmministrativa ?? []}
            onChange={(sede) => setForm((c) => (c ? { ...c, sedeAmministrativa: sede } : c))}
            onBlurCampo={(sede) => void salvaSede("sedeAmministrativa", sede)}
            onCap={(sede) => void alCap("sedeAmministrativa", sede)}
          />
        )}

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Indirizzo di consegna o ritiro, se diverso
          </span>
          <select
            value={form.sedeMagFonte}
            onChange={(event) => {
              const fonte = event.target.value;
              setForm((c) =>
                c ? { ...c, sedeMagFonte: fonte as AnagraficaFormPayload["sedeMagFonte"] } : c
              );
              void salva("sedeMagFonte", fonte);
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            <option value="">Non indicato</option>
            <option value="legale">Uguale alla sede legale</option>
            <option value="amministrativa">Uguale alla sede amministrativa</option>
            <option value="altra">Indirizzo diverso</option>
          </select>
        </label>
        {form.sedeMagFonte === "altra" ? (
          <SedeBlocco
            titolo="Magazzino"
            sede={form.sedeMagazzino}
            comuni={comuni.sedeMagazzino ?? []}
            onChange={(sede) => setForm((c) => (c ? { ...c, sedeMagazzino: sede } : c))}
            onBlurCampo={(sede) => void salvaSede("sedeMagazzino", sede)}
            onCap={(sede) => void alCap("sedeMagazzino", sede)}
          />
        ) : null}

        <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-sm font-semibold">Titolare effettivo</h2>
          <p className="text-sm text-slate-700">
            Al fine di ottemperare alle disposizioni contenute nel Vostro Modello Organizzativo (ex D.Lgs. 231/2001 e successive modifiche), Vi comunichiamo altresì le seguenti informazioni.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Cognome" required value={form.titolareCognome} onChange={(v) => aggiorna("titolareCognome", v)} onBlur={(valore) => void salva("titolareCognome", valore)} />
            <Campo label="Nome" required value={form.titolareNome} onChange={(v) => aggiorna("titolareNome", v)} onBlur={(valore) => void salva("titolareNome", valore)} />
            <Campo label="Codice fiscale" required value={form.titolareCf} onChange={(v) => aggiorna("titolareCf", v)} onBlur={(valore) => void salva("titolareCf", valore)} />
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Documento di identità *</span>
              <select
                value={form.titolareDocumentoTipo}
                onChange={(event) => aggiorna("titolareDocumentoTipo", event.target.value)}
                onBlur={(event) =>
                  void salva("titolareDocumentoTipo", event.target.value)
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                <option value="">Seleziona</option>
                {DOCUMENTI_TITOLARE.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </select>
            </label>
            <Campo label="N. documento" required value={form.titolareDocumentoNumero} onChange={(v) => aggiorna("titolareDocumentoNumero", v)} onBlur={(valore) => void salva("titolareDocumentoNumero", valore)} />
          </div>
          <p className="text-sm">
            Vi autorizziamo al trattamento dei nostri dati ai sensi del Regolamento UE 2016/679, della legge 196/2003 e per i fini dichiarati.
          </p>
          <p className="text-sm">La data di compilazione è quella del giorno in cui scaricate il PDF.</p>
          <p className="text-sm">Firma in calce al PDF, come Rappresentante Legale.</p>
          <p className="text-xs text-slate-500">
            Da restituire compilato su carta intestata e firmato da Rappresentante Legale.
          </p>
        </section>

        <button
          type="button"
          disabled={occupato}
          onClick={() => void scarica()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Scarica PDF
        </button>
      </div>
    </main>
  );
}

function SedeBlocco({
  titolo,
  sede,
  comuni,
  onChange,
  onBlurCampo,
  onCap,
}: {
  titolo: string;
  sede: SedeAnagraficaForm;
  comuni: ComuneCap[];
  onChange: (sede: SedeAnagraficaForm) => void;
  onBlurCampo: (sede: SedeAnagraficaForm) => void;
  onCap: (sede: SedeAnagraficaForm) => void;
}) {
  const nota = NAZIONI.includes(sede.nazione) ? sede.nazione : "Altro";
  return (
    <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
      <legend className="px-1 text-sm font-semibold">{titolo}</legend>
      <Campo
        label="Via"
        value={sede.indirizzo}
        onChange={(indirizzo) => onChange({ ...sede, indirizzo })}
        onBlur={(valore) => onBlurCampo({ ...sede, indirizzo: valore })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Nazione</span>
          <select
            value={nota}
            onChange={(event) => {
              const nazione = event.target.value === "Altro" ? "" : event.target.value;
              const prossima = { ...sede, nazione };
              onChange(prossima);
              onBlurCampo(prossima);
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            {NAZIONI.map((nazione) => (
              <option key={nazione} value={nazione}>
                {nazione}
              </option>
            ))}
            <option value="Altro">Altro</option>
          </select>
        </label>
        {nota === "Altro" ? (
          <Campo
            label="Nazione, se altra"
            value={sede.nazione}
            onChange={(nazione) => onChange({ ...sede, nazione })}
            onBlur={(valore) => onBlurCampo({ ...sede, nazione: valore })}
          />
        ) : null}
        <Campo
          label="CAP"
          value={sede.cap}
          onChange={(cap) => onChange({ ...sede, cap })}
          onBlur={(valore) => onCap({ ...sede, cap: valore })}
        />
        <Campo
          label="Città"
          value={sede.citta}
          onChange={(citta) => onChange({ ...sede, citta })}
          onBlur={(valore) => onBlurCampo({ ...sede, citta: valore })}
        />
        {comuni.length > 1 ? (
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Comuni del CAP</span>
            <select
              value=""
              onChange={(event) => {
                const scelto = comuni.find((item) => item.citta === event.target.value);
                if (!scelto) return;
                const prossima = { ...sede, citta: scelto.citta, provincia: scelto.provincia };
                onChange(prossima);
                onBlurCampo(prossima);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">Scegli oppure scrivi la città</option>
              {comuni.map((item) => (
                <option key={`${item.citta}-${item.provincia}`} value={item.citta}>
                  {item.citta} ({item.provincia})
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Campo
          label="Provincia"
          value={sede.provincia}
          onChange={(provincia) => onChange({ ...sede, provincia })}
          onBlur={(valore) => onBlurCampo({ ...sede, provincia: valore })}
        />
        <Campo
          label="Località"
          value={sede.localita}
          onChange={(localita) => onChange({ ...sede, localita })}
          onBlur={(valore) => onBlurCampo({ ...sede, localita: valore })}
        />
        <Campo
          label="Tel"
          value={sede.telefono}
          onChange={(telefono) => onChange({ ...sede, telefono })}
          onBlur={(valore) => onBlurCampo({ ...sede, telefono: valore })}
        />
      </div>
    </fieldset>
  );
}
