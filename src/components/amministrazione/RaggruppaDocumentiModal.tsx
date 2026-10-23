"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  contestoMailUnicaAction,
  dettaglioCampionatureRaggruppoAction,
  elencoRaggruppoScalettaAction,
  raggruppaEProcessaAction,
  type CandidatoRaggruppamento,
  type DocumentoRaggruppo,
  type RiferimentoDocumento,
} from "@/app/actions/gruppi-scaletta";
import { listCaselleSpedizioneMailAction } from "@/app/actions/spedizione-mail";
import { listLottiMagazzinoInserimentoAction, listProcessiInserimentoProduzioneAction } from "@/app/actions/lotto-produzione-magazzino";
import { CampiMailUnica } from "@/components/amministrazione/MailUnicaInAttesaBanner";
import type {
  LottoInserimentoOption,
  ProcessoInserimentoOption,
} from "@/lib/produzione/lotto-produzione-magazzino";

function chiave(ref: RiferimentoDocumento) {
  return `${ref.entityType}:${ref.entityId}`;
}

function labelLotto(l: LottoInserimentoOption): string {
  const nome = l.prodottoNome ? ` — ${l.prodottoNome}` : "";
  const ext = l.lottoEsternoCodice ? ` · ext ${l.lottoEsternoCodice}` : "";
  const unita = l.unita?.trim() || "kg";
  return `${l.lottoInternoCodice}${ext} · ${l.prodottoCodice}${nome} · ${l.quantitaKg.toLocaleString("it-IT")} ${unita}`;
}

function oggiISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

type Props = {
  onClose: () => void;
  onDone: (avviso: string) => void;
};

export function RaggruppaDocumentiModal({ onClose, onDone }: Props) {
  const titleId = useId();
  const [coda, setCoda] = useState<CandidatoRaggruppamento[]>([]);
  const [giaProcessati, setGiaProcessati] = useState<CandidatoRaggruppamento[]>(
    []
  );
  const [scelti, setScelti] = useState<string[]>([]);
  const [giaId, setGiaId] = useState("");
  const [unicoPacco, setUnicoPacco] = useState(true);
  const [unicaMail, setUnicaMail] = useState(true);
  const [trackingUrl, setTrackingUrl] = useState("");
  const [errore, setErrore] = useState("");
  const [saving, setSaving] = useState(false);
  const [fase, setFase] = useState<"scelta" | "lotto" | "chiusura">("scelta");
  const [indice, setIndice] = useState(0);
  const [documenti, setDocumenti] = useState<DocumentoRaggruppo[]>([]);
  const [lotti, setLotti] = useState<LottoInserimentoOption[]>([]);
  const [processi, setProcessi] = useState<ProcessoInserimentoOption[]>([]);
  const [lottiPronti, setLottiPronti] = useState(false);
  const [lottoPerRiga, setLottoPerRiga] = useState<Record<string, string>>({});
  const [processoPerRiga, setProcessoPerRiga] = useState<Record<string, string>>(
    {}
  );
  const [datePerDoc, setDatePerDoc] = useState<
    Record<string, { lavorazione: string; confezionamento: string }>
  >({});
  const [caselle, setCaselle] = useState<
    Array<{ id: string; label: string; email: string }>
  >([]);
  const [mailEmail, setMailEmail] = useState("");
  const [mailClienteId, setMailClienteId] = useState("");
  const [mailAccountId, setMailAccountId] = useState("");
  const [mailOggetto, setMailOggetto] = useState("");
  const [mailCorpo, setMailCorpo] = useState("");

  useEffect(() => {
    void elencoRaggruppoScalettaAction().then((res) => {
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setCoda(res.coda);
      setGiaProcessati(res.giaProcessati);
    });
  }, []);

  useEffect(() => {
    if (fase !== "chiusura" || !unicaMail) return;
    const selezionati = scelti
      .map((key) => coda.find((item) => chiave(item) === key))
      .filter((item): item is CandidatoRaggruppamento => Boolean(item));
    const gia = giaProcessati.find((item) => chiave(item) === giaId);
    const refs = [
      ...selezionati.map((item) => ({
        entityType: item.entityType,
        entityId: item.entityId,
      })),
      ...(gia ? [{ entityType: gia.entityType, entityId: gia.entityId }] : []),
    ];
    void Promise.all([
      listCaselleSpedizioneMailAction(),
      contestoMailUnicaAction(refs),
    ]).then(([caselleRes, contestoRes]) => {
      if (caselleRes.success) setCaselle(caselleRes.accounts);
      if (!contestoRes.success) return;
      const ctx = contestoRes.contesto;
      setMailEmail((prev) => prev || ctx.email);
      setMailClienteId(ctx.clienteId);
      setMailAccountId((prev) => prev || ctx.accountId);
      const nome = ctx.destinatario || "Cliente";
      const documenti = ctx.numeri.join(", ");
      setMailOggetto((prev) => prev || "Spedizione campionature");
      setMailCorpo(
        (prev) =>
          prev ||
          `Gentile ${nome},\n\nla spedizione è in partenza.\nDocumenti: ${documenti}.\n\nCordiali saluti,\nUfficio Commerciale`
      );
    });
  }, [fase, unicaMail, scelti, coda, giaProcessati, giaId]);

  const lottoByKey = useMemo(() => {
    const map = new Map<string, LottoInserimentoOption>();
    for (const lotto of lotti) map.set(lotto.key, lotto);
    return map;
  }, [lotti]);

  const corrente = documenti[indice] ?? null;
  const campionateSelezionate = coda.filter(
    (item) =>
      scelti.includes(chiave(item)) && item.entityType === "campionatura"
  ).length;
  const passi =
    fase === "scelta" ? 2 + campionateSelezionate : 1 + documenti.length + 1;
  let passo = passi;
  if (fase === "scelta") passo = 1;
  else if (fase === "lotto") passo = 2 + indice;
  let etichettaPasso = "Pacco e mail";
  if (fase === "scelta") etichettaPasso = "Selezione";
  else if (fase === "lotto" && corrente) {
    etichettaPasso = `${corrente.numero} · Lotto`;
  }

  const vendita = coda.some(
    (item) =>
      scelti.includes(chiave(item)) &&
      item.entityType === "ordine" &&
      item.tipoOrdine === "vendita"
  );

  function documentiSelezionati() {
    return scelti
      .map((key) => coda.find((item) => chiave(item) === key))
      .filter((item): item is CandidatoRaggruppamento => Boolean(item));
  }

  async function vaiAiLotti() {
    setErrore("");
    const selezionati = documentiSelezionati();
    const gia = giaProcessati.find((item) => chiave(item) === giaId);
    if (selezionati.length + (gia ? 1 : 0) < 2) {
      setErrore(
        "Seleziona almeno due documenti, oppure uno e un ordine già in scaletta."
      );
      return;
    }
    const campionature = selezionati.filter(
      (item) => item.entityType === "campionatura"
    );
    if (campionature.length === 0) {
      setDocumenti([]);
      setFase("chiusura");
      return;
    }
    setSaving(true);
    try {
      const [dettaglio, lottiRes, processiRes] = await Promise.all([
        dettaglioCampionatureRaggruppoAction(campionature.map((item) => item.entityId)),
        listLottiMagazzinoInserimentoAction(),
        listProcessiInserimentoProduzioneAction(),
      ]);
      if (!dettaglio.success) {
        setErrore(dettaglio.error);
        return;
      }
      if (!lottiRes.success) {
        setErrore(lottiRes.error);
        return;
      }
      if (!processiRes.success) {
        setErrore(processiRes.error);
        return;
      }
      setProcessi(processiRes.processi);
      setLotti(lottiRes.lotti);
      setLottiPronti(true);
      const perId = new Map(dettaglio.documenti.map((doc) => [doc.id, doc]));
      const ordinati = campionature
        .map((item) => perId.get(item.entityId))
        .filter((doc): doc is DocumentoRaggruppo => Boolean(doc));
      setDocumenti(ordinati);
      const oggi = oggiISO();
      setDatePerDoc((prev) => {
        const next = { ...prev };
        for (const doc of ordinati) {
          if (!next[doc.id]) {
            next[doc.id] = { lavorazione: oggi, confezionamento: oggi };
          }
        }
        return next;
      });
      setLottoPerRiga((prev) => {
        const next = { ...prev };
        for (const doc of dettaglio.documenti) {
          for (const riga of doc.righe) {
            const key = `${doc.id}:${riga.id}`;
            if (next[key]) continue;
            const match = lottiRes.lotti.find(
              (lotto) => lotto.prodottoId === riga.prodottoId
            );
            if (match) next[key] = match.key;
          }
        }
        return next;
      });
      setIndice(0);
      setFase("lotto");
    } finally {
      setSaving(false);
    }
  }

  function validaLottoCorrente(): boolean {
    if (!corrente) return false;
    for (const riga of corrente.righe) {
      const key = `${corrente.id}:${riga.id}`;
      const lotto = lottoByKey.get(lottoPerRiga[key] ?? "");
      if (!lotto) {
        setErrore(`Seleziona un lotto per ${riga.prodottoCodice}.`);
        return false;
      }
      if (lotto.prodottoId !== riga.prodottoId && !processoPerRiga[key]) {
        setErrore(
          `Indica il processo di trasformazione per ${riga.prodottoCodice}.`
        );
        return false;
      }
    }
    if (corrente.righe.length === 0) {
      setErrore(`${corrente.numero} non ha prodotti da mettere in scaletta.`);
      return false;
    }
    setErrore("");
    return true;
  }

  function avantiLotto() {
    if (!validaLottoCorrente()) return;
    if (indice < documenti.length - 1) {
      setIndice((n) => n + 1);
      return;
    }
    setFase("chiusura");
  }

  function indietro() {
    setErrore("");
    if (fase === "chiusura") {
      if (documenti.length > 0) {
        setIndice(documenti.length - 1);
        setFase("lotto");
      } else {
        setFase("scelta");
      }
      return;
    }
    if (fase === "lotto") {
      if (indice > 0) setIndice((n) => n - 1);
      else setFase("scelta");
    }
  }

  async function conferma() {
    setErrore("");
    if (unicaMail && !trackingUrl.trim()) {
      setErrore("Con la mail unica inserisci il link di tracking.");
      return;
    }
    if (unicaMail && !mailEmail.includes("@")) {
      setErrore("Indica l'indirizzo a cui inviare la mail unica.");
      return;
    }
    if (unicaMail && !mailAccountId) {
      setErrore("Seleziona la casella da cui parte la mail unica.");
      return;
    }
    if (unicaMail && (!mailOggetto.trim() || !mailCorpo.trim())) {
      setErrore("Compila oggetto e testo della mail unica.");
      return;
    }
    const selezionati = documentiSelezionati();
    const gia = giaProcessati.find((item) => chiave(item) === giaId);
    const oggi = oggiISO();
    const campionature = documenti.map((doc) => ({
      campionaturaId: doc.id,
      dataLavorazione: datePerDoc[doc.id]?.lavorazione || oggi,
      dataConfezionamento: datePerDoc[doc.id]?.confezionamento || oggi,
      righe: doc.righe.map((riga) => {
        const key = `${doc.id}:${riga.id}`;
        const lotto = lottoByKey.get(lottoPerRiga[key] ?? "");
        const conforme = Boolean(lotto && lotto.prodottoId === riga.prodottoId);
        const processo = processi.find((item) => item.id === processoPerRiga[key]);
        return {
          rigaId: riga.id,
          lottoInternoCodice: lotto?.lottoInternoCodice ?? "",
          lottoProdottoId: lotto?.prodottoId ?? riga.prodottoId,
          lottoProdottoCodice: lotto?.prodottoCodice ?? riga.prodottoCodice,
          conforme,
          processoId: conforme ? null : processo?.id ?? null,
          processoCodice: conforme ? "" : processo?.codice ?? "",
          processoNome: conforme ? "" : processo?.nome ?? "",
          sottoprodottoPrenotato: false,
        };
      }),
    }));
    setSaving(true);
    try {
      const res = await raggruppaEProcessaAction({
        documenti: selezionati.map((item) => ({
          entityType: item.entityType,
          entityId: item.entityId,
        })),
        giaProcessato: gia
          ? { entityType: gia.entityType, entityId: gia.entityId }
          : null,
        unicoPacco,
        unicaMail,
        trackingUrl,
        destinatarioEmail: unicaMail ? mailEmail : "",
        accountId: unicaMail ? mailAccountId : "",
        oggetto: unicaMail ? mailOggetto : "",
        corpo: unicaMail ? mailCorpo : "",
        campionature,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      onDone(res.avviso);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Raggruppa
        </h2>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Passo {passo} di {passi} · {etichettaPasso}
        </p>

        {fase === "scelta" ? (
          <>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Seleziona i documenti. Poi, una campionatura alla volta, scegli il
              lotto. Pacco e mail si decidono all&apos;ultimo passo.
            </p>
            <fieldset className="mt-4 space-y-2">
              <legend className="text-sm font-medium">Da processare</legend>
              {coda.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  Nessun documento libero in coda.
                </p>
              ) : (
                <div className="max-h-52 space-y-1 overflow-y-auto">
                  {coda.map((item) => {
                    const key = chiave(item);
                    return (
                      <label key={key} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={scelti.includes(key)}
                          onChange={(e) =>
                            setScelti((prev) =>
                              e.target.checked
                                ? [...prev, key]
                                : prev.filter((id) => id !== key)
                            )
                          }
                        />
                        <span>
                          {item.numero} · {item.destinatario || item.cliente}
                          {item.prodotto ? ` · ${item.prodotto}` : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block font-medium">
                Associa a un documento già in scaletta
              </span>
              <select
                value={giaId}
                onChange={(e) => setGiaId(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <option value="">Nessuno</option>
                {giaProcessati.map((item) => (
                  <option key={chiave(item)} value={chiave(item)}>
                    {item.numero} · {item.destinatario || item.cliente}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        {fase === "lotto" && corrente ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-[var(--muted)]">
              {corrente.numero} · {corrente.destinatario}. Scegli il lotto di
              ogni prodotto. Se il lotto è di un altro prodotto, indica anche la
              trasformazione.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Data lavorazione</span>
                <input
                  type="date"
                  value={datePerDoc[corrente.id]?.lavorazione ?? oggiISO()}
                  onChange={(e) =>
                    setDatePerDoc((prev) => ({
                      ...prev,
                      [corrente.id]: {
                        lavorazione: e.target.value,
                        confezionamento:
                          prev[corrente.id]?.confezionamento ?? oggiISO(),
                      },
                    }))
                  }
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">
                  Data confezionamento
                </span>
                <input
                  type="date"
                  value={datePerDoc[corrente.id]?.confezionamento ?? oggiISO()}
                  onChange={(e) =>
                    setDatePerDoc((prev) => ({
                      ...prev,
                      [corrente.id]: {
                        lavorazione:
                          prev[corrente.id]?.lavorazione ?? oggiISO(),
                        confezionamento: e.target.value,
                      },
                    }))
                  }
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </label>
            </div>
            {lottiPronti && lotti.length === 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                In magazzino non ci sono lotti disponibili.
              </p>
            ) : null}
            {corrente.righe.map((riga) => {
              const key = `${corrente.id}:${riga.id}`;
              const scelto = lottoByKey.get(lottoPerRiga[key] ?? "");
              const conforme = Boolean(
                scelto && scelto.prodottoId === riga.prodottoId
              );
              const consigliati = lotti.filter(
                (lotto) => lotto.prodottoId === riga.prodottoId
              );
              const altri = lotti.filter(
                (lotto) => lotto.prodottoId !== riga.prodottoId
              );
              return (
                <div key={riga.id} className="text-sm">
                  <label className="block">
                    <span className="mb-1 block font-medium">
                      {riga.prodottoCodice}
                      {riga.prodottoNome ? ` · ${riga.prodottoNome}` : ""} ·{" "}
                      {riga.quantita} {riga.unitaMisura}
                    </span>
                    <select
                      value={lottoPerRiga[key] ?? ""}
                      disabled={!lottiPronti}
                      onChange={(e) =>
                        setLottoPerRiga((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 font-mono text-sm"
                    >
                      <option value="">Seleziona un lotto a magazzino</option>
                      {consigliati.length ? (
                        <optgroup label="Consigliati">
                          {consigliati.map((lotto) => (
                            <option key={lotto.key} value={lotto.key}>
                              Consigliato · {labelLotto(lotto)}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {altri.length ? (
                        <optgroup label="Altri lotti">
                          {altri.map((lotto) => (
                            <option key={lotto.key} value={lotto.key}>
                              {labelLotto(lotto)}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
                  </label>
                  {scelto && !conforme ? (
                    <label className="mt-2 block">
                      <span className="mb-1 block font-medium">
                        Processo di trasformazione
                      </span>
                      <select
                        value={processoPerRiga[key] ?? ""}
                        onChange={(e) =>
                          setProcessoPerRiga((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        <option value="">Come lo trasformi…</option>
                        {processi.map((processo) => (
                          <option key={processo.id} value={processo.id}>
                            {processo.codice} · {processo.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {fase === "chiusura" ? (
          <>
            <p className="mt-3 text-sm text-[var(--muted)]">
              I lotti sono scelti. Qui decidi se viaggiano insieme e se parte
              una sola mail.
            </p>
            <fieldset className="mt-4 space-y-2 text-sm">
              <legend className="font-medium">Unico pacco</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="unico-pacco"
                  checked={unicoPacco}
                  onChange={() => setUnicoPacco(true)}
                />
                Sì, tutti nello stesso pacco
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="unico-pacco"
                  checked={!unicoPacco}
                  onChange={() => setUnicoPacco(false)}
                />
                No, un pacco per documento
              </label>
            </fieldset>
            <fieldset className="mt-4 space-y-2 text-sm">
              <legend className="font-medium">Unica mail</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="unica-mail"
                  checked={unicaMail}
                  onChange={() => setUnicaMail(true)}
                />
                Sì, una sola mail e un solo tracking
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="unica-mail"
                  checked={!unicaMail}
                  onChange={() => setUnicaMail(false)}
                />
                No, ogni documento tiene la propria mail
              </label>
              {unicaMail ? (
                <div className="space-y-3 pt-1">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium">
                      Link di tracking
                    </span>
                    <input
                      type="url"
                      value={trackingUrl}
                      onChange={(e) => setTrackingUrl(e.target.value)}
                      placeholder="https://"
                      className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    />
                  </label>
                  <CampiMailUnica
                    email={mailEmail}
                    onEmail={setMailEmail}
                    clienteId={mailClienteId}
                    accountId={mailAccountId}
                    onAccount={setMailAccountId}
                    accounts={caselle}
                    oggetto={mailOggetto}
                    onOggetto={setMailOggetto}
                    corpo={mailCorpo}
                    onCorpo={setMailCorpo}
                  />
                </div>
              ) : null}
            </fieldset>
            {vendita ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                Gli ordini di vendita selezionati entrano in produzione: numero
                fiscale, SDI e mail al cliente.
              </p>
            ) : null}
          </>
        ) : null}

        {errore ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errore}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50"
          >
            Annulla
          </button>
          {fase !== "scelta" ? (
            <button
              type="button"
              onClick={indietro}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50"
            >
              Indietro
            </button>
          ) : null}
          {fase !== "chiusura" ? (
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                fase === "scelta" ? void vaiAiLotti() : avantiLotto()
              }
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              {saving ? "Caricamento…" : "Avanti"}
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void conferma()}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              {saving ? "Elaborazione…" : "Processa insieme"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
