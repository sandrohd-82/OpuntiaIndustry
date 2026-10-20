"use client";

import { Fragment, useEffect, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { FaCircleCheck, FaCircleXmark } from "react-icons/fa6";
import {
  annullaSpesaAction,
  apriAllegatoRegistroAction,
  caricaAllegatoRegistroAction,
  contabilizzaSpesaAction,
  dettaglioFatturaEsteraRegistroAction,
  listSpeseAction,
} from "@/app/actions/spese";
import { ScontrinoZoomPane } from "@/components/fiscale/ScontrinoZoomPane";
import { formatDateIt, formatEuro } from "@/lib/amministrazione/fatture";
import {
  CATEGORIE_SPESA,
  LABEL_CATEGORIA_SPESA,
  LABEL_PAGAMENTO_SPESA,
  LABEL_STATO_SPESA,
  LABEL_TIPO_CARICAMENTO,
  TIPI_CARICAMENTO_SPESA,
  type CategoriaSpesa,
  type SpesaDocumentoView,
  type SpesaRigaView,
  type StatoSpesa,
  type TipoCaricamentoSpesa,
} from "@/lib/fiscale/spese";

const field =
  "rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";

function nomeFileBase(value: string): string {
  const base = value.trim().split(/[/\\]/).pop() ?? "";
  return base.toLocaleLowerCase("it-IT");
}

function testoDocumento(spesa: SpesaDocumentoView, modo: "title" | "aria"): string {
  if (spesa.documentoCaricato) {
    if (modo === "aria") {
      return spesa.nomeDocumento
        ? `Apri documento ${spesa.nomeDocumento}`
        : "Apri documento";
    }
    return spesa.nomeDocumento || "Documento caricato";
  }
  if (spesa.nomeDocumento) {
    return modo === "aria"
      ? `Carica il documento ${spesa.nomeDocumento}`
      : `Manca ${spesa.nomeDocumento}`;
  }
  return modo === "aria" ? "Carica il documento" : "Documento non caricato";
}

function stessoDocumento(atteso: string, scelto: string): boolean {
  const left = nomeFileBase(atteso);
  const right = nomeFileBase(scelto);
  if (!left || !right) return true;
  return left === right;
}

function vistaFileRegistro(file: File): "pdf" | "image" {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  return "image";
}

function CaricaDocumentoRegistro({
  spesa,
  onClose,
  onCaricato,
}: {
  spesa: SpesaDocumentoView | null;
  onClose: () => void;
  onCaricato: (id: string, fileName: string) => void;
}) {
  const [errore, setErrore] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [anteprima, setAnteprima] = useState<string | null>(null);
  const [chiedi, setChiedi] = useState(false);
  const [pending, setPending] = useState(false);
  const [righe, setRighe] = useState<SpesaRigaView[]>([]);
  const [partitaIva, setPartitaIva] = useState("");
  const atteso = spesa?.nomeDocumento.trim() ?? "";
  const confronto = spesa?.fonte === "fattura" && file != null && anteprima != null;

  useEffect(() => {
    setErrore(null);
    setFile(null);
    setChiedi(false);
    setPending(false);
    setRighe([]);
    setPartitaIva("");
  }, [spesa?.id]);

  useEffect(() => {
    if (!file) {
      setAnteprima(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setAnteprima(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!spesa || spesa.fonte !== "fattura") return;
    let attivo = true;
    void dettaglioFatturaEsteraRegistroAction(spesa.id).then((res) => {
      if (!attivo) return;
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setRighe(res.righe);
      setPartitaIva(res.partitaIva);
    });
    return () => {
      attivo = false;
    };
  }, [spesa]);

  async function invia(scelto: File) {
    if (!spesa) return;
    setPending(true);
    setErrore(null);
    const body = new FormData();
    body.set("id", spesa.id);
    body.set("fonte", spesa.fonte);
    body.set("file", scelto);
    const res = await caricaAllegatoRegistroAction(body);
    setPending(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    onCaricato(spesa.id, res.fileName);
  }

  function scegli(scelto: File) {
    setFile(scelto);
    setErrore(null);
    const diverso = !stessoDocumento(atteso, scelto.name);
    setChiedi(diverso);
    if (spesa?.fonte === "fattura") return;
    if (diverso) return;
    void invia(scelto);
  }

  if (!spesa || typeof document === "undefined") return null;

  const importoEstero =
    spesa.valuta !== "EUR" && spesa.importoValuta != null
      ? `${spesa.importoValuta.toLocaleString("it-IT")} ${spesa.valuta}`
      : "";

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/40 p-3">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="carica-documento-registro-title"
        className={
          confronto
            ? "flex h-[calc(100vh-1.5rem)] w-full flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-xl"
            : "w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-4 shadow-xl"
        }
      >
        {confronto && file && anteprima ? (
          <>
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
              <div className="min-h-0 overflow-y-auto border-b border-slate-200 p-4 lg:border-b-0 lg:border-r">
                <h2
                  id="carica-documento-registro-title"
                  className="text-base font-semibold text-slate-900"
                >
                  Dettaglio salvato
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Confronta questi dati con il documento a destra, poi conferma il salvataggio.
                </p>
                <div className="mt-4 space-y-1 text-sm">
                  <VoceDettaglio etichetta="Fornitore" valore={spesa.esercente} />
                  <VoceDettaglio etichetta="P. IVA" valore={partitaIva} />
                  <VoceDettaglio
                    etichetta="Data"
                    valore={spesa.dataDocumento ? formatDateIt(spesa.dataDocumento) : ""}
                  />
                  <VoceDettaglio etichetta="Numero" valore={spesa.giustificazione} />
                  <VoceDettaglio etichetta="Nazione" valore={spesa.nazione} />
                  <VoceDettaglio etichetta="Importo in valuta" valore={importoEstero} />
                  <VoceDettaglio
                    etichetta="Cambio"
                    valore={spesa.cambio != null ? String(spesa.cambio) : ""}
                  />
                  <VoceDettaglio etichetta="Imponibile" valore={formatEuro(spesa.imponibile)} />
                  <VoceDettaglio
                    etichetta="IVA"
                    valore={`${spesa.aliquotaIva}% · ${formatEuro(spesa.imposta)}`}
                  />
                  <VoceDettaglio etichetta="Totale" valore={formatEuro(spesa.totale)} />
                  <VoceDettaglio etichetta="Note" valore={spesa.note} />
                </div>
                {righe.length > 0 ? (
                  <table className="mt-4 w-full text-xs">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="py-1 text-left font-medium">Descrizione</th>
                        <th className="py-1 text-right font-medium">Qtà</th>
                        <th className="py-1 text-right font-medium">Prezzo</th>
                        <th className="py-1 text-right font-medium">IVA</th>
                        <th className="py-1 text-right font-medium">Importo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {righe.map((riga, index) => (
                        <tr key={`${spesa.id}-confronto-${index}`} className="border-t border-slate-100">
                          <td className="py-1 pr-2">{riga.descrizione}</td>
                          <td className="py-1 text-right tabular-nums">
                            {riga.quantita.toLocaleString("it-IT")}
                          </td>
                          <td className="py-1 text-right tabular-nums">
                            {formatEuro(riga.prezzoUnitario)}
                          </td>
                          <td className="py-1 text-right tabular-nums">{riga.aliquotaIva}%</td>
                          <td className="py-1 text-right tabular-nums">{formatEuro(riga.imponibile)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
                {atteso ? (
                  <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                    Documento atteso: <span className="font-semibold">{atteso}</span>
                  </p>
                ) : null}
                {chiedi ? (
                  <p className="mt-3 text-sm text-red-800">
                    Hai selezionato <span className="font-semibold">{file.name}</span>
                    {atteso ? (
                      <>
                        . Non coincide con <span className="font-semibold">{atteso}</span>
                      </>
                    ) : null}
                    .
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">File scelto: {file.name}</p>
                )}
                {errore ? <p className="mt-3 text-sm text-red-700">{errore}</p> : null}
              </div>
              <div className="relative min-h-[40vh] bg-slate-100 lg:min-h-0">
                <div className="absolute inset-0">
                  {vistaFileRegistro(file) === "pdf" ? (
                    <iframe
                      title="Documento da allegare"
                      src={`${anteprima.split("#")[0]}#navpanes=0&pagemode=none&view=FitH`}
                      className="h-full w-full border-0 bg-white"
                    />
                  ) : (
                    <ScontrinoZoomPane src={anteprima} alt="Documento da allegare" />
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 p-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                Chiudi
              </button>
              <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm">
                Scegli un altro
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  disabled={pending}
                  onChange={(e) => {
                    const scelto = e.target.files?.[0];
                    e.target.value = "";
                    if (scelto) scegli(scelto);
                  }}
                />
              </label>
              <button
                type="button"
                disabled={pending}
                onClick={() => void invia(file)}
                className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {pending ? "Salvataggio…" : "Salva documento"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="carica-documento-registro-title" className="text-base font-semibold text-slate-900">
              Carica documento
            </h2>
            <p className="mt-1 text-sm text-slate-600">{spesa.esercente}</p>
            {atteso ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                Documento atteso: <span className="font-semibold">{atteso}</span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-600">
                Non risulta il nome del file originale. Controlla di allegare il documento giusto.
              </p>
            )}
            {chiedi && file ? (
              <p className="mt-3 text-sm text-red-800">
                Hai selezionato <span className="font-semibold">{file.name}</span>
                {atteso ? (
                  <>
                    . Non coincide con <span className="font-semibold">{atteso}</span>
                  </>
                ) : null}
                .
              </p>
            ) : null}
            {errore ? <p className="mt-3 text-sm text-red-700">{errore}</p> : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                Chiudi
              </button>
              {chiedi && file ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setChiedi(false);
                    setFile(null);
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  Scegli un altro
                </button>
              ) : null}
              {chiedi && file ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void invia(file)}
                  className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {pending ? "Caricamento…" : "Carica questo file"}
                </button>
              ) : (
                <label className="cursor-pointer rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white">
                  {pending ? "Caricamento…" : "Scegli file"}
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
                    className="hidden"
                    disabled={pending}
                    onChange={(e) => {
                      const scelto = e.target.files?.[0];
                      e.target.value = "";
                      if (scelto) scegli(scelto);
                    }}
                  />
                </label>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

function VoceDettaglio({
  etichetta,
  valore,
}: {
  etichetta: string;
  valore: string;
}) {
  if (!valore) return null;
  return (
    <p>
      <span className="text-slate-500">{etichetta}: </span>
      <span className="text-slate-800">{valore}</span>
    </p>
  );
}

function DettagliSpesa({
  spesa,
  chiediConferma,
  onFile,
  onContabilizza,
  onChiediContabilizza,
  onAnnulla,
}: {
  spesa: SpesaDocumentoView;
  chiediConferma: boolean;
  onFile: () => void;
  onContabilizza: () => void;
  onChiediContabilizza: () => void;
  onAnnulla: () => void;
}) {
  const s = spesa;
  let importoEstero = "";
  if (s.valuta !== "EUR" && s.importoValuta != null) {
    importoEstero = `${s.importoValuta.toLocaleString("it-IT")} ${s.valuta}`;
    if (s.cambio != null) importoEstero += ` · cambio ${s.cambio}`;
  }
  let azioneContabilizza: ReactNode = null;
  if (s.stato === "registrato" && !s.progettoId) {
    if (chiediConferma) {
      azioneContabilizza = (
        <button
          type="button"
          className="rounded bg-[var(--primary)] px-2 py-1 text-xs text-white"
          onClick={onContabilizza}
        >
          Conferma
        </button>
      );
    } else {
      azioneContabilizza = (
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-1 text-xs"
          onClick={onChiediContabilizza}
        >
          Contabilizza
        </button>
      );
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        <VoceDettaglio etichetta="Tipo" valore={LABEL_TIPO_CARICAMENTO[s.tipoCaricamento]} />
        {s.fonte === "fattura" ? null : (
          <VoceDettaglio etichetta="Categoria" valore={LABEL_CATEGORIA_SPESA[s.categoria]} />
        )}
        {s.fonte === "fattura" ? null : (
          <VoceDettaglio etichetta="Pagamento" valore={LABEL_PAGAMENTO_SPESA[s.modalitaPagamento]} />
        )}
        <VoceDettaglio etichetta="Progetto" valore={s.progettoTitolo || "—"} />
        <VoceDettaglio etichetta="Giustificazione" valore={s.giustificazione} />
        <VoceDettaglio etichetta="P. IVA" valore={s.partitaIva} />
        <VoceDettaglio etichetta="Imponibile" valore={formatEuro(s.imponibile)} />
        <VoceDettaglio
          etichetta="IVA"
          valore={s.privaIva ? "Priva di IVA" : `${s.aliquotaIva}% · ${formatEuro(s.imposta)}`}
        />
        <VoceDettaglio etichetta="Note" valore={s.note} />
        <VoceDettaglio etichetta="Importo in valuta" valore={importoEstero} />
        <VoceDettaglio etichetta="Nazione" valore={s.nazione} />
        <VoceDettaglio etichetta="Esterometro" valore={s.flagEsterometro ? "Sì" : ""} />
        <VoceDettaglio etichetta="Autofattura" valore={s.tipoAutofattura} />
        <VoceDettaglio
          etichetta="Contabilizzata il"
          valore={s.contabilizzatoAt ? formatDateIt(s.contabilizzatoAt) : ""}
        />
        <VoceDettaglio etichetta="File" valore={s.fileName} />
      </div>
      {s.prezziIvaCompresa ? (
        <p className="text-xs text-slate-600">
          Prezzi inseriti IVA compresa. Imponibile e IVA sono scorporati dal totale.
        </p>
      ) : null}
      {s.righe.length > 0 ? (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="py-1 text-left font-medium">Descrizione</th>
              <th className="py-1 text-right font-medium">Numero</th>
              <th className="py-1 text-right font-medium">Prezzo</th>
              <th className="py-1 text-right font-medium">Imponibile</th>
              <th className="py-1 text-right font-medium">% IVA</th>
              <th className="py-1 text-right font-medium">IVA</th>
              <th className="py-1 text-right font-medium">Totale</th>
            </tr>
          </thead>
          <tbody>
            {s.righe.map((riga, index) => (
              <tr key={`${s.id}-${index}`}>
                <td className="py-1 pr-3">{riga.descrizione}</td>
                <td className="py-1 text-right tabular-nums">
                  {riga.quantita.toLocaleString("it-IT")}
                </td>
                <td className="py-1 text-right tabular-nums">{formatEuro(riga.prezzoUnitario)}</td>
                <td className="py-1 text-right tabular-nums">{formatEuro(riga.imponibile)}</td>
                <td className="py-1 text-right tabular-nums">{riga.aliquotaIva}</td>
                <td className="py-1 text-right tabular-nums">{formatEuro(riga.imposta)}</td>
                <td className="py-1 text-right tabular-nums">{formatEuro(riga.totale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {s.fonte === "fattura" && s.schedaHref ? (
          <Link
            href={s.schedaHref}
            className="rounded border border-slate-300 px-2 py-1 text-xs"
          >
            Apri fattura
          </Link>
        ) : (
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 text-xs"
            onClick={onFile}
          >
            Apri file
          </button>
        )}
        {s.fonte === "fattura" ? null : azioneContabilizza}
        {s.fonte === "spesa" && s.stato === "registrato" ? (
          <button
            type="button"
            className="rounded border border-red-200 px-2 py-1 text-xs text-red-700"
            onClick={onAnnulla}
          >
            Annulla
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function SpeseRegistroBoard() {
  const [spese, setSpese] = useState<SpesaDocumentoView[]>([]);
  const [stato, setStato] = useState<"" | StatoSpesa>("");
  const [categoria, setCategoria] = useState<"" | CategoriaSpesa>("");
  const [tipo, setTipo] = useState<"" | TipoCaricamentoSpesa>("");
  const [soloLibere, setSoloLibere] = useState(false);
  const [testo, setTesto] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confermaId, setConfermaId] = useState<string | null>(null);
  const [aperti, setAperti] = useState<Set<string>>(() => new Set());
  const [daCaricare, setDaCaricare] = useState<SpesaDocumentoView | null>(null);
  const [pending, start] = useTransition();

  function toggleDettagli(id: string) {
    setAperti((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function carica() {
    start(async () => {
      const res = await listSpeseAction({ stato, categoria, tipo, soloLibere, testo });
      if (!res.success) {
        setErrore(res.error);
        setSpese([]);
        return;
      }
      setErrore(null);
      setSpese(res.spese);
    });
  }

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function contabilizza(id: string) {
    setMsg(null);
    start(async () => {
      const res = await contabilizzaSpesaAction(id);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setConfermaId(null);
      setMsg("Spesa segnata come contabilizzata.");
      carica();
    });
  }

  function annulla(id: string) {
    setMsg(null);
    start(async () => {
      const res = await annullaSpesaAction(id);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMsg("Spesa annullata.");
      carica();
    });
  }

  function apriFile(spesa: SpesaDocumentoView) {
    start(async () => {
      const res = await apriAllegatoRegistroAction({
        id: spesa.id,
        fonte: spesa.fonte,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      window.open(res.url, "_blank", "noopener,noreferrer");
    });
  }

  function segnaCaricato(id: string, fileName: string) {
    setSpese((prev) =>
      prev.map((spesa) =>
        spesa.id === id
          ? {
              ...spesa,
              documentoCaricato: true,
              nomeDocumento: fileName,
              fileName,
            }
          : spesa
      )
    );
    setDaCaricare(null);
    setMsg("Documento caricato.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-[var(--muted)]">Stato</span>
          <select
            className={field}
            value={stato}
            onChange={(e) => setStato(e.target.value as "" | StatoSpesa)}
          >
            <option value="">Tutti</option>
            <option value="registrato">Registrato</option>
            <option value="contabilizzato">Contabilizzato</option>
            <option value="annullato">Annullato</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-[var(--muted)]">Categoria</span>
          <select
            className={field}
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as "" | CategoriaSpesa)}
          >
            <option value="">Tutte</option>
            {CATEGORIE_SPESA.map((k) => (
              <option key={k} value={k}>
                {LABEL_CATEGORIA_SPESA[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-[var(--muted)]">Tipo</span>
          <select
            className={field}
            value={tipo}
            onChange={(e) => setTipo(e.target.value as "" | TipoCaricamentoSpesa)}
          >
            <option value="">Tutti</option>
            {TIPI_CARICAMENTO_SPESA.map((k) => (
              <option key={k} value={k}>
                {LABEL_TIPO_CARICAMENTO[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-[var(--muted)]">Esercente</span>
          <input
            className={field}
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={soloLibere}
            onChange={(e) => setSoloLibere(e.target.checked)}
          />
          Solo senza progetto
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={carica}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50"
        >
          Aggiorna
        </button>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Il caricamento del file è in Strumenti → Caricamento manuale spese.
      </p>
      {errore ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errore}
        </p>
      ) : null}
      {msg ? <p className="text-sm text-slate-700">{msg}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Esercente</th>
              <th className="px-3 py-2 text-right">Totale</th>
              <th className="px-3 py-2">Stato</th>
              <th className="px-3 py-2">Documento</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {spese.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  {pending ? "Caricamento…" : "Nessuna spesa con questi filtri."}
                </td>
              </tr>
            ) : (
              spese.map((s) => {
                const aperto = aperti.has(s.id);
                return (
                  <Fragment key={s.id}>
                    <tr className="border-t border-slate-100">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatDateIt(s.dataDocumento)}
                      </td>
                      <td className="px-3 py-2">
                        {LABEL_TIPO_CARICAMENTO[s.tipoCaricamento]}
                      </td>
                      <td className="px-3 py-2">{s.esercente}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatEuro(s.totale)}
                        {s.valuta !== "EUR" ? (
                          <span className="block text-xs text-[var(--muted)]">{s.valuta}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{LABEL_STATO_SPESA[s.stato]}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1"
                          title={testoDocumento(s, "title")}
                          aria-label={testoDocumento(s, "aria")}
                          onClick={() => {
                            if (s.documentoCaricato) apriFile(s);
                            else setDaCaricare(s);
                          }}
                        >
                          {s.documentoCaricato ? (
                            <FaCircleCheck className="text-emerald-600" size={16} />
                          ) : (
                            <FaCircleXmark className="text-red-600" size={16} />
                          )}
                          {!s.documentoCaricato && s.nomeDocumento ? (
                            <span className="max-w-[9rem] truncate text-xs text-red-800">
                              {s.nomeDocumento}
                            </span>
                          ) : null}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          className="text-sm font-medium text-slate-900 underline underline-offset-2"
                          aria-expanded={aperto}
                          onClick={() => toggleDettagli(s.id)}
                        >
                          {aperto ? "Nascondi" : "Dettagli"}
                        </button>
                      </td>
                    </tr>
                    {aperto ? (
                      <tr className="border-t border-slate-100 bg-slate-50">
                        <td colSpan={7} className="px-3 py-3">
                          <DettagliSpesa
                            spesa={s}
                            chiediConferma={confermaId === s.id}
                            onFile={() => apriFile(s)}
                            onContabilizza={() => contabilizza(s.id)}
                            onChiediContabilizza={() => setConfermaId(s.id)}
                            onAnnulla={() => annulla(s.id)}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <CaricaDocumentoRegistro
        spesa={daCaricare}
        onClose={() => setDaCaricare(null)}
        onCaricato={segnaCaricato}
      />
    </div>
  );
}
