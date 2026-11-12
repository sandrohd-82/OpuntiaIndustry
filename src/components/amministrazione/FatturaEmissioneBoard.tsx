"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { anteprimaNumeroFatturaBozzaAction } from "@/app/actions/fattura-da-ordine";
import {
  getAliquoteEmissioneAction,
  inviaMailBozzaNuovaFatturaAction,
  listCaselleNuovaFatturaAction,
} from "@/app/actions/fattura-emissione";
import { listPreventivoCommercialiRiferimentoAction } from "@/app/actions/preventivi";
import { listProdottiPropriAction } from "@/app/actions/prodotti-propri";
import { ClienteSelectField } from "@/components/amministrazione/ClienteSelectField";
import { FatturaEmissioneDocumento } from "@/components/amministrazione/FatturaEmissioneDocumento";
import { FatturaEmissioneScontiProdotto } from "@/components/amministrazione/FatturaEmissioneScontiProdotto";
import { OrdinePagamentoPianoFields } from "@/components/amministrazione/OrdinePagamentoPianoFields";
import { usePrenotazioneNumero } from "@/components/amministrazione/FatturaNumeroPrenotato";
import { ClearableNumberInput } from "@/components/ui/ClearableNumberInput";
import type { Cliente } from "@/lib/amministrazione/clienti";
import {
  calcolaTotaliEmissione,
  emptyEmissioneRiga,
  emptySpedizioneRiga,
  importoEmissioneRiga,
  type EmissioneRigaInput,
} from "@/lib/amministrazione/fattura-emissione";
import { formatEuro, todayIsoDate } from "@/lib/amministrazione/fatture";
import { formatIbanDisplay } from "@/lib/iban";
import {
  applyTotaleToPiano,
  emptyPagamentoPiano,
  type OrdinePagamentoPiano,
} from "@/lib/amministrazione/ordine-pagamento-piano";
import { FASE_TEST_NUOVA_FATTURA } from "@/lib/amministrazione/fattura-emissione-test";
import { EMAIL_CONTROLLO_DEFAULT } from "@/lib/amministrazione/prova-ordine";
import { buildFatturaA4PdfPronto } from "@/lib/amministrazione/fattura-a4-pdf";
import { destinatarioFromCliente } from "@/lib/amministrazione/fattura-a4-documento";
import { AGRINSICILIA_COORDINATE } from "@/lib/amministrazione/preventivo-letterhead";
import type { PreventivoCommercialeRiferimento } from "@/lib/amministrazione/preventivo-commerciale-riferimento";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";

export function FatturaEmissioneBoard() {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [prodotti, setProdotti] = useState<ProdottoProprio[]>([]);
  const [aliquote, setAliquote] = useState<number[]>([0, 4, 10, 22]);
  const [dataDocumento, setDataDocumento] = useState(todayIsoDate);
  const [piano, setPiano] = useState<OrdinePagamentoPiano>(emptyPagamentoPiano());
  const [sendToSdi, setSendToSdi] = useState(true);
  const [sendCourtesyEmail, setSendCourtesyEmail] = useState(true);
  const [dryRunSdi, setDryRunSdi] = useState(false);
  const [noteDocumento, setNoteDocumento] = useState("");
  const [numeroBozza, setNumeroBozza] = useState("");
  const [commerciale, setCommerciale] =
    useState<PreventivoCommercialeRiferimento | null>(null);
  const [sezione, setSezione] = useState<string | null>(null);
  const [rigaBozza, setRigaBozza] = useState<number | null>(null);
  const [righe, setRighe] = useState<EmissioneRigaInput[]>([
    emptyEmissioneRiga({ ivaPercentuale: 22 }),
  ]);
  const [spedizione, setSpedizione] = useState(emptySpedizioneRiga(0, false, 22));
  const [includeSpedizione, setIncludeSpedizione] = useState(false);
  const [sessioneNumeroId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `fattura-${Date.now()}`
  );
  const prenotazioneNumero = usePrenotazioneNumero({
    contesto: "fattura",
    sessioneId: sessioneNumeroId,
    attivo: false,
    dataDocumento,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    fatturaId: string;
    numeroFattura: string;
    pdfUrl: string;
    eiStatus: string;
  } | null>(null);
  const prova = FASE_TEST_NUOVA_FATTURA;
  const [caselle, setCaselle] = useState<
    Array<{ id: string; label: string; email: string }>
  >([]);
  const [caselleErrore, setCaselleErrore] = useState<string | null>(null);
  const [casellaId, setCasellaId] = useState("");
  const [mailOggetto, setMailOggetto] = useState("");
  const [mailCorpo, setMailCorpo] = useState("");
  const [mailTo, setMailTo] = useState("");
  const [allegato, setAllegato] = useState<{
    name: string;
    base64: string;
    url: string;
  } | null>(null);
  const [allegatoErrore, setAllegatoErrore] = useState<string | null>(null);
  const [improntaSalvata, setImprontaSalvata] = useState<string | null>(null);
  const [provaEsito, setProvaEsito] = useState<string | null>(null);

  useEffect(() => {
    void listProdottiPropriAction().then((r) => {
      if (r.success) setProdotti(r.prodotti);
    });
    void getAliquoteEmissioneAction().then((r) => {
      if (r.success) setAliquote(r.aliquote);
    });
    void listPreventivoCommercialiRiferimentoAction({
      includiSenzaAccount: true,
    }).then((res) => {
      if (res.success) setCommerciale(res.defaultItem ?? null);
    });
  }, []);

  useEffect(() => {
    let cancel = false;
    void anteprimaNumeroFatturaBozzaAction(dataDocumento).then((res) => {
      if (cancel || !res.success) return;
      setNumeroBozza(res.numero);
    });
    return () => {
      cancel = true;
    };
  }, [dataDocumento]);

  function vaiA(id: string, rigaIndex?: number) {
    setSezione(id);
    if (rigaIndex != null) setRigaBozza(rigaIndex);
    const nodo = document.getElementById(
      rigaIndex != null && id === "fattura-righe"
        ? (rigaIndex < righe.length
          ? `fattura-riga-${rigaIndex}`
          : "fattura-spedizione")
        : id
    );
    nodo?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const righeCalcolo = useMemo(() => {
    const list = righe.map((r) => ({
      ...r,
      importo: importoEmissioneRiga(r),
    }));
    if (includeSpedizione && spedizione.prezzoUnitario > 0) {
      list.push({
        ...spedizione,
        importo: importoEmissioneRiga(spedizione),
      });
    }
    return list;
  }, [righe, includeSpedizione, spedizione]);

  const totals = useMemo(
    () => calcolaTotaliEmissione(righeCalcolo),
    [righeCalcolo]
  );
  const righeBozza = useMemo(
    () =>
      includeSpedizione && spedizione.prezzoUnitario > 0
        ? [...righe, spedizione]
        : righe,
    [includeSpedizione, righe, spedizione]
  );

  useEffect(() => {
    setPiano((prev) => applyTotaleToPiano(prev, totals.totale));
  }, [totals.totale]);

  const pianoDocumento = useMemo(
    () => applyTotaleToPiano(piano, totals.totale),
    [piano, totals.totale]
  );

  const improntaMail = useMemo(
    () =>
      JSON.stringify({
        clienteId: cliente?.id ?? "",
        dataDocumento,
        noteDocumento,
        piano: pianoDocumento,
        righe: righeBozza,
        casellaId,
        mailOggetto,
        mailCorpo,
        destinazione: prova ? EMAIL_CONTROLLO_DEFAULT : mailTo.trim(),
        pdf: allegato?.name ?? "",
      }),
    [
      cliente?.id,
      dataDocumento,
      noteDocumento,
      pianoDocumento,
      righeBozza,
      casellaId,
      mailOggetto,
      mailCorpo,
      prova,
      mailTo,
      allegato?.name,
    ]
  );
  const bozzaPronta =
    sendCourtesyEmail && improntaSalvata === improntaMail && Boolean(allegato);

  useEffect(() => {
    if (!sendCourtesyEmail) return;
    void listCaselleNuovaFatturaAction().then((res) => {
      if (!res.success) {
        setCaselleErrore(res.error);
        return;
      }
      setCaselleErrore(null);
      setCaselle(res.accounts);
      setCasellaId((prev) => {
        if (prev) return prev;
        return res.accounts.length === 1 ? res.accounts[0].id : "";
      });
    });
  }, [sendCourtesyEmail]);

  useEffect(() => {
    if (!sendCourtesyEmail) return;
    setMailOggetto((prev) => {
      if (!prev || prev === "Fattura") {
        return numeroBozza ? `Fattura ${numeroBozza}` : "Fattura";
      }
      return prev;
    });
    setMailCorpo(
      (prev) =>
        prev ||
        "Gentile cliente,\n\nIn allegato la fattura.\n\nCordiali saluti."
    );
  }, [sendCourtesyEmail, numeroBozza]);

  useEffect(() => {
    if (!sendCourtesyEmail || !cliente) return;
    let cancel = false;
    void (async () => {
      try {
        const pronto = await buildFatturaA4PdfPronto({
          numeroFattura: numeroBozza || "bozza",
          dataDocumento,
          destinatario: destinatarioFromCliente(cliente),
          righe: righeBozza.map((r) => ({
            prodottoId: r.prodottoId,
            codice: r.codice,
            descrizione: r.descrizione,
            quantita: r.quantita,
            unitaMisura: r.unitaMisura,
            prezzoUnitario: r.prezzoUnitario,
            scontoPercentuale: 0,
            ivaPercentuale: r.ivaPercentuale,
            isSpedizione: r.isSpedizione,
            note: r.note,
            importo: importoEmissioneRiga(r),
            scontoListinoPct: r.scontoListinoPct,
            scontoExtraPct: r.scontoExtraPct,
          })),
          noteDocumento,
          piano: pianoDocumento,
          commerciale: commerciale
            ? {
                nome: commerciale.nome,
                telefono: commerciale.telefono,
                email: commerciale.email,
              }
            : null,
        });
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const raw = String(reader.result ?? "");
            const comma = raw.indexOf(",");
            resolve(comma >= 0 ? raw.slice(comma + 1) : raw);
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(pronto.blob);
        });
        if (cancel) return;
        const url = URL.createObjectURL(pronto.blob);
        setAllegato((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url);
          return { name: pronto.fileName, base64, url };
        });
        setAllegatoErrore(null);
      } catch (err) {
        if (cancel) return;
        setAllegato(null);
        setAllegatoErrore(
          err instanceof Error ? err.message : "PDF non disponibile."
        );
      }
    })();
    return () => {
      cancel = true;
    };
  }, [
    sendCourtesyEmail,
    cliente,
    numeroBozza,
    dataDocumento,
    righeBozza,
    noteDocumento,
    pianoDocumento,
    commerciale,
  ]);

  function salvaBozzaMail() {
    setError(null);
    setProvaEsito(null);
    if (!casellaId) {
      setError("Seleziona la casella di uscita.");
      return;
    }
    if (!mailOggetto.trim() || !mailCorpo.trim()) {
      setError("Oggetto e corpo della mail sono obbligatori.");
      return;
    }
    const destinazione = prova ? EMAIL_CONTROLLO_DEFAULT : mailTo.trim();
    if (!destinazione.includes("@")) {
      setError("Manca la mail di destinazione.");
      return;
    }
    if (!allegato) {
      setError(allegatoErrore ?? "L'allegato PDF non è pronto.");
      return;
    }
    setImprontaSalvata(improntaMail);
    try {
      sessionStorage.setItem(
        "opuntia-nuova-fattura-mail-bozza",
        JSON.stringify({
          casellaId,
          mailOggetto,
          mailCorpo,
          mailTo: destinazione,
        })
      );
    } catch {
      /* la bozza resta in pagina anche se il browser rifiuta la sessione */
    }
  }

  function updateRiga(index: number, patch: Partial<EmissioneRigaInput>) {
    setRighe((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  }

  function applyProdotto(index: number, prodottoId: string) {
    const p = prodotti.find((x) => x.id === prodottoId);
    if (!p) {
      updateRiga(index, {
        prodottoId: null,
        scontoListinoPct: 0,
        scontoExtraPct: 0,
        scontoPercentuale: 0,
      });
      return;
    }
    updateRiga(index, {
      prodottoId: p.id,
      codice: p.codice,
      descrizione: p.nome,
      note: p.note ?? "",
      scontoListinoPct: 0,
      scontoExtraPct: 0,
      scontoPercentuale: 0,
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setProvaEsito(null);
    if (!cliente) {
      setError("Seleziona un cliente.");
      return;
    }
    if (sendCourtesyEmail && !bozzaPronta) {
      setError("Salva prima la bozza della mail.");
      return;
    }

    if (prova) {
      setBusy(true);
      try {
        if (!sendCourtesyEmail) {
          setProvaEsito(
            "Fase di prova: nessuna fattura è partita allo SDI e nessuna mail è stata inviata."
          );
          return;
        }
        if (!allegato) {
          setError("L'allegato PDF non è pronto.");
          return;
        }
        const mail = await inviaMailBozzaNuovaFatturaAction({
          accountId: casellaId,
          subject: mailOggetto.trim(),
          body: mailCorpo.trim(),
          pdfBase64: allegato.base64,
          pdfName: allegato.name,
          clienteId: cliente.id,
          to: EMAIL_CONTROLLO_DEFAULT,
          fatturaId: null,
        });
        if (!mail.success) {
          setError(mail.error);
          return;
        }
        setProvaEsito(
          "Fase di prova: la mail è partita all'indirizzo di controllo. Lo SDI non è stato chiamato."
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore di rete.");
      } finally {
        setBusy(false);
      }
      return;
    }

    const payload = {
      clienteId: cliente.id,
      dataDocumento,
      piano: applyTotaleToPiano(piano, totals.totale),
      sendToSdi,
      sendCourtesyEmail,
      dryRunSdi,
      ordineId: null,
      noteDocumento,
      righe: [
        ...righe,
        ...(includeSpedizione && spedizione.prezzoUnitario > 0
          ? [spedizione]
          : []),
      ],
    };

    setBusy(true);
    prenotazioneNumero.bloccaRilascio();
    try {
      const res = await fetch("/api/invoices/create-and-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          prenotazioneId: null,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        fatturaId?: string;
        numeroFattura?: string;
        pdfUrl?: string;
        eiStatus?: string;
      };
      if (!json.success) {
        prenotazioneNumero.consentiRilascio();
        setError(json.error ?? "Emissione non riuscita.");
        return;
      }
      if (sendCourtesyEmail && !allegato) {
        setError("Fattura emessa. L'allegato della mail non è pronto.");
      } else if (sendCourtesyEmail && allegato) {
        const mail = await inviaMailBozzaNuovaFatturaAction({
          accountId: casellaId,
          subject: mailOggetto.trim(),
          body: mailCorpo.trim(),
          pdfBase64: allegato.base64,
          pdfName: allegato.name,
          clienteId: cliente.id,
          to: mailTo.trim(),
          fatturaId: json.fatturaId ?? null,
        });
        if (!mail.success) {
          setError(`Fattura emessa. Mail non inviata: ${mail.error}`);
        }
      }
      if (prenotazioneNumero.pren) {
        prenotazioneNumero.applica({
          ...prenotazioneNumero.pren,
          stato: "emessa",
          incerto: false,
          numeroFattura: json.numeroFattura || prenotazioneNumero.pren.numeroFattura,
        });
      }
      setSuccess({
        fatturaId: json.fatturaId!,
        numeroFattura: json.numeroFattura!,
        pdfUrl: json.pdfUrl ?? "",
        eiStatus: json.eiStatus ?? "",
      });
      setRighe([emptyEmissioneRiga({ ivaPercentuale: 22 })]);
      setIncludeSpedizione(false);
      setSpedizione(emptySpedizioneRiga(0, false, 22));
      setNoteDocumento("");
    } catch (err) {
      prenotazioneNumero.consentiRilascio();
      setError(err instanceof Error ? err.message : "Errore di rete.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => vaiA("bozza-fattura")}
        className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
      >
        Visualizza bozza
      </button>
      <p className="text-sm text-[var(--muted)]">
        Il foglio è la fattura. Ogni modifica del form lo aggiorna, e ogni
        matita del foglio riapre il campo nel form.
      </p>
    </div>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_210mm]">
    <form onSubmit={onSubmit} className="order-2 space-y-6 xl:order-1">
      <p className="text-sm text-[var(--muted)]">
        Compila e invia la fattura elettronica a Fatture in Cloud / SDI. Il
        numero fattura, fino al 31/12/2026, è{" "}
        <span className="font-mono">NN/ANNO</span> (es.{" "}
        <span className="font-mono">23/2026</span>). Dal 01/01/2027 diventa{" "}
        <span className="font-mono">27/0001</span>, in base alla data di emissione.
        I codici riga usano la
        targa prodotto interna (es. NCL1).
      </p>

      <section
        id="fattura-cliente"
        className={`space-y-3 rounded-xl border bg-[var(--card)] p-4 ${
          sezione === "fattura-cliente"
            ? "border-[var(--primary)] ring-2 ring-[var(--primary)]"
            : "border-[var(--border)]"
        }`}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Cliente
        </h2>
        <ClienteSelectField
          preferenza="fatture"
          value={cliente?.id ?? ""}
          onChange={setCliente}
          required
        />
        {cliente ? (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[var(--muted)]">P. IVA</dt>
              <dd>{cliente.partitaIva || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Codice fiscale</dt>
              <dd>{cliente.codiceFiscale || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-[var(--muted)]">Indirizzo</dt>
              <dd>
                {[
                  cliente.sedeAmministrativa.indirizzo,
                  cliente.sedeAmministrativa.cap,
                  cliente.sedeAmministrativa.citta,
                  cliente.sedeAmministrativa.provincia,
                ]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Codice SDI</dt>
              <dd className="font-mono">{cliente.sdiCode || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">PEC</dt>
              <dd>{cliente.pec || "—"}</dd>
            </div>
          </dl>
        ) : null}
        {prenotazioneNumero.errore ? (
          <p className="text-sm text-red-700">{prenotazioneNumero.errore}</p>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            Il numero si assegna solo all&apos;invio allo SDI. Senza SDI non
            parte nemmeno la mail.
          </p>
        )}
      </section>

      <section
        id="fattura-righe"
        className={`space-y-3 rounded-xl border bg-[var(--card)] p-4 ${
          sezione === "fattura-righe"
            ? "border-[var(--primary)] ring-2 ring-[var(--primary)]"
            : "border-[var(--border)]"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Righe documento
          </h2>
          <button
            type="button"
            onClick={() =>
              setRighe((p) => [
                ...p,
                emptyEmissioneRiga({ ivaPercentuale: aliquote.includes(22) ? 22 : aliquote[0] ?? 0 }),
              ])
            }
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
          >
            + Riga
          </button>
        </div>

        <div className="space-y-4">
          {righe.map((r, index) => (
            <div
              key={index}
              id={`fattura-riga-${index}`}
              className={`grid gap-2 rounded-lg border p-3 sm:grid-cols-6 ${
                rigaBozza === index
                  ? "border-[var(--primary)] ring-2 ring-[var(--primary)]"
                  : "border-[var(--border)]"
              }`}
            >
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-xs font-medium">Prodotto</span>
                <select
                  value={r.prodottoId ?? ""}
                  onChange={(e) => applyProdotto(index, e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">Manuale…</option>
                  {prodotti.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codice} — {p.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium">Codice</span>
                <input
                  value={r.codice}
                  onChange={(e) => updateRiga(index, { codice: e.target.value })}
                  required
                  className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 font-mono text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium">Unità</span>
                <input
                  value={r.unitaMisura}
                  onChange={(e) =>
                    updateRiga(index, { unitaMisura: e.target.value })
                  }
                  className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium">Qtà</span>
                <ClearableNumberInput
                  value={r.quantita}
                  onValueChange={(v) =>
                    updateRiga(index, { quantita: v === "" ? 0 : v })
                  }
                  min={0}
                  step={0.01}
                  emptyAsZeroOnBlur
                  className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium">Prezzo €</span>
                <ClearableNumberInput
                  value={r.prezzoUnitario}
                  onValueChange={(v) =>
                    updateRiga(index, { prezzoUnitario: v === "" ? 0 : v })
                  }
                  min={0}
                  step={0.01}
                  emptyAsZeroOnBlur
                  className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              </label>
              <FatturaEmissioneScontiProdotto
                prodottoId={r.prodottoId}
                prodottoCodice={r.codice}
                clienteId={cliente?.id ?? null}
                quantita={r.quantita}
                prezzoUnitario={r.prezzoUnitario}
                scontoListinoPct={r.scontoListinoPct}
                scontoExtraPct={r.scontoExtraPct}
                onPrezzo={(prezzo, iva, unita) =>
                  updateRiga(index, {
                    prezzoUnitario: prezzo,
                    ...(unita ? { unitaMisura: unita } : {}),
                    ...(iva != null && aliquote.includes(iva)
                      ? { ivaPercentuale: iva }
                      : {}),
                  })
                }
                onScontoListino={(pct) =>
                  updateRiga(index, {
                    scontoListinoPct: pct,
                    scontoPercentuale: 0,
                  })
                }
                onScontoExtra={(pct) =>
                  updateRiga(index, {
                    scontoExtraPct: pct,
                    scontoPercentuale: 0,
                  })
                }
              />
              <label className="block text-sm sm:col-span-3">
                <span className="mb-1 block text-xs font-medium">
                  Descrizione
                </span>
                <input
                  value={r.descrizione}
                  onChange={(e) =>
                    updateRiga(index, { descrizione: e.target.value })
                  }
                  required
                  className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                  Note (meno evidenziate)
                </span>
                <input
                  value={r.note}
                  onChange={(e) => updateRiga(index, { note: e.target.value })}
                  className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-2 py-1.5 text-sm text-slate-500"
                  placeholder="Opzionale — sotto la descrizione in fattura"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium">IVA %</span>
                <select
                  value={r.ivaPercentuale}
                  onChange={(e) =>
                    updateRiga(index, {
                      ivaPercentuale: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                >
                  {aliquote.map((a) => (
                    <option key={a} value={a}>
                      {a}%
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end justify-between gap-2 sm:col-span-6">
                <p className="text-sm tabular-nums text-slate-700">
                  Importo:{" "}
                  {formatEuro(importoEmissioneRiga(r))}
                </p>
                {righe.length > 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setRighe((prev) => prev.filter((_, i) => i !== index))
                    }
                    className="text-xs font-medium text-rose-700 hover:underline"
                  >
                    Rimuovi
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div
          id="fattura-spedizione"
          className="rounded-lg border border-dashed border-[var(--border)] p-3"
        >
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={includeSpedizione}
              onChange={(e) => setIncludeSpedizione(e.target.checked)}
            />
            Aggiungi riga Spedizione (come prodotto, codice SPED)
          </label>
          {includeSpedizione ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-xs font-medium">
                  Importo spedizione €
                </span>
                <ClearableNumberInput
                  value={spedizione.prezzoUnitario}
                  onValueChange={(v) =>
                    setSpedizione((s) => ({
                      ...s,
                      prezzoUnitario: v === "" ? 0 : v,
                    }))
                  }
                  min={0}
                  step={0.01}
                  emptyAsZeroOnBlur
                  className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={spedizione.ivaPercentuale > 0}
                  onChange={(e) =>
                    setSpedizione((s) => ({
                      ...s,
                      ivaPercentuale: e.target.checked
                        ? aliquote.includes(22)
                          ? 22
                          : aliquote[0] ?? 0
                        : 0,
                    }))
                  }
                />
                Calcola IVA sulla spedizione
              </label>
              {spedizione.ivaPercentuale > 0 ? (
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium">IVA %</span>
                  <select
                    value={spedizione.ivaPercentuale}
                    onChange={(e) =>
                      setSpedizione((s) => ({
                        ...s,
                        ivaPercentuale: Number(e.target.value),
                      }))
                    }
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                  >
                    {aliquote
                      .filter((a) => a > 0)
                      .map((a) => (
                        <option key={a} value={a}>
                          {a}%
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section
        id="fattura-pagamento"
        className={`space-y-3 rounded-xl border bg-[var(--card)] p-4 ${
          sezione === "fattura-pagamento"
            ? "border-[var(--primary)] ring-2 ring-[var(--primary)]"
            : "border-[var(--border)]"
        }`}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Condizioni di pagamento
        </h2>
        <OrdinePagamentoPianoFields
          piano={piano}
          onChange={setPiano}
          totale={totals.totale}
        />
        <div className="grid gap-3">
          <dl className="space-y-1 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--muted)]">Banca</dt>
              <dd>{AGRINSICILIA_COORDINATE.banca}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--muted)]">IBAN</dt>
              <dd className="font-mono">
                {formatIbanDisplay(AGRINSICILIA_COORDINATE.iban)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--muted)]">BIC</dt>
              <dd className="font-mono">{AGRINSICILIA_COORDINATE.bic}</dd>
            </div>
            <p className="pt-1 text-xs text-[var(--muted)]">
              Coordinate già salvate: in fattura il pagamento è il bonifico,
              con queste coordinate. La scadenza segue la condizione scelta.
            </p>
          </dl>
        </div>
        <label id="fattura-note" className="block text-sm">
          <span className="mb-1 block font-medium">Note documento</span>
          <textarea
            value={noteDocumento}
            onChange={(e) => setNoteDocumento(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={prova ? false : sendToSdi}
              disabled={prova}
              onChange={(e) => {
                setSendToSdi(e.target.checked);
                if (!e.target.checked) setSendCourtesyEmail(false);
              }}
            />
            Invia allo SDI
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={sendCourtesyEmail && (prova || sendToSdi)}
              disabled={prova ? false : !sendToSdi}
              onChange={(e) => setSendCourtesyEmail(e.target.checked)}
            />
            {prova
              ? "Mail di cortesia"
              : "Mail di cortesia al cliente, solo se lo SDI parte"}
          </label>
          {prova ? null : (
            <label className="inline-flex items-center gap-2 text-[var(--muted)]">
              <input
                type="checkbox"
                checked={dryRunSdi}
                onChange={(e) => setDryRunSdi(e.target.checked)}
                disabled={!sendToSdi}
              />
              Dry-run SDI (test)
            </label>
          )}
        </div>
        {prova ? (
          <p className="text-sm text-amber-800">
            Fase di prova di questa pagina: lo SDI non parte. Con la mail
            selezionata il destinatario è solo l&apos;indirizzo di controllo.
          </p>
        ) : null}
      </section>

      {sendCourtesyEmail ? (
        <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Bozza mail
          </h2>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Casella di uscita</span>
            <select
              value={casellaId}
              onChange={(e) => setCasellaId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <option value="">Seleziona la casella</option>
              {caselle.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label ? `${c.label} — ${c.email}` : c.email}
                </option>
              ))}
            </select>
            {caselleErrore ? (
              <p className="mt-1 text-xs text-red-700">{caselleErrore}</p>
            ) : null}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Oggetto</span>
            <input
              value={mailOggetto}
              onChange={(e) => setMailOggetto(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Mail di destinazione</span>
            <input
              value={prova ? EMAIL_CONTROLLO_DEFAULT : mailTo}
              readOnly={prova}
              onChange={(e) => {
                if (!prova) setMailTo(e.target.value);
              }}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm read-only:bg-slate-50"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Corpo mail</span>
            <textarea
              value={mailCorpo}
              onChange={(e) => setMailCorpo(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <div className="text-sm">
            <p className="mb-1 font-medium">File allegato</p>
            {allegato ? (
              <a
                href={allegato.url}
                download={allegato.name}
                className="font-medium text-[var(--primary)] hover:underline"
              >
                {allegato.name}
              </a>
            ) : (
              <p className="text-[var(--muted)]">
                {allegatoErrore ?? "Preparazione del PDF…"}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={salvaBozzaMail}
              className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              Salva bozza
            </button>
            {bozzaPronta ? (
              <p className="text-sm text-emerald-800">
                Bozza salvata. Crea e invia usa questa mail.
              </p>
            ) : improntaSalvata ? (
              <p className="text-sm text-amber-800">
                La bozza non è aggiornata. Salvala di nuovo.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Totale documento
          </p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatEuro(totals.totale)}
          </p>
          <p className="text-xs text-[var(--muted)]">
            Imponibile {formatEuro(totals.imponibile)} · IVA{" "}
            {formatEuro(totals.imposta)}
          </p>
        </div>
        <button
          type="submit"
          disabled={busy || !cliente || (sendCourtesyEmail && !bozzaPronta)}
          className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy
            ? "Invio in corso…"
            : (sendCourtesyEmail ? "Crea e invia" : "Crea e invia fattura")}
        </button>
      </section>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {provaEsito ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-semibold">{provaEsito}</p>
        </div>
      ) : null}

      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-semibold">
            Fattura {success.numeroFattura} emessa correttamente.
          </p>
          <p className="mt-1 text-xs">Stato SDI/FiC: {success.eiStatus || "—"}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link
              href={`/app/amministrazione/fatture/emesse/${success.fatturaId}`}
              className="font-medium text-[var(--primary)] hover:underline"
            >
              Apri in storico
            </Link>
            {success.pdfUrl ? (
              <a
                href={success.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[var(--primary)] hover:underline"
              >
                Apri PDF FiC
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </form>
    <div className="order-1 xl:sticky xl:top-4 xl:order-2">
      <FatturaEmissioneDocumento
        numero={numeroBozza}
        dataDocumento={dataDocumento}
        commerciale={commerciale}
        cliente={cliente}
        noteDocumento={noteDocumento}
        piano={applyTotaleToPiano(piano, totals.totale)}
        righe={righeBozza}
        imponibile={totals.imponibile}
        imposta={totals.imposta}
        totale={totals.totale}
        onDataDocumento={setDataDocumento}
        onVaiA={vaiA}
      />
    </div>
    </div>
    </>
  );
}
