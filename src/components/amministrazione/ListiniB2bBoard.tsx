"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { listImballaggiVociAction } from "@/app/actions/imballaggi-spedizioni";
import {
  approvaListinoInUsoAction,
  createListinoAction,
  dichiaraListinoObsoletoAction,
  inviaListinoInRevisioneAction,
  listListiniAction,
  listListinoRigheAction,
  riportaListinoInBozzaAction,
  setListinoRigaRevisioneAction,
  softDeleteListinoRigaCondizioneAction,
  updateListinoAction,
  upsertListinoRigaAction,
  upsertListinoRigaCondizioneAction,
} from "@/app/actions/listini";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import { InfoHint } from "@/components/ui/InfoHint";
import {
  imballaggiPerCondizioneListino,
  type ImballaggioVoce,
} from "@/lib/amministrazione/imballaggi-spedizioni";
import {
  LISTINO_DISPONIBILITA,
  LISTINO_DISPONIBILITA_LABEL,
  LISTINO_RIGA_UM,
  rigaListinoCompleta,
  type Listino,
  type ListinoDisponibilita,
  type ListinoRiga,
  type ListinoRigaCondizione,
  type ListinoRigaUm,
} from "@/lib/ecosystem/listini";
import type { ListinoStato } from "@/types/database";

const STATO_LABEL: Record<ListinoStato, string> = {
  bozza: "Bozza",
  in_revisione: "In Revisione",
  in_uso: "In Uso",
  obsoleto: "Obsoleto",
};

const STATO_HELP: Record<ListinoStato, string> = {
  bozza:
    "L’operatore completa tutte le voci (prezzo oppure dichiarazione). Gli sconti sono facoltativi. Poi «Listino completo».",
  in_revisione:
    "L’admin spunta ogni voce. Poi «Approva e metti in uso» con conferma e OTP.",
  in_uso:
    "Listino ufficiale. Resta in vigore anche dopo «Dichiara obsoleto», finché un nuovo listino non va In Uso.",
  obsoleto:
    "Sostituito. Resta in storico. Non è più il listino vigente.",
};

type DeleteTarget = {
  kind: "condizione";
  riga: ListinoRiga;
  condizione: ListinoRigaCondizione;
};

type CondDraft = {
  qtyDa: string;
  qtyA: string;
  imballaggioVoceId: string;
  scontoPct: string;
};

const emptyCond: CondDraft = {
  qtyDa: "0",
  qtyA: "",
  imballaggioVoceId: "",
  scontoPct: "0",
};

export function ListiniB2bBoard() {
  const [items, setItems] = useState<Listino[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const [obsoletoOpen, setObsoletoOpen] = useState(false);
  const [righe, setRighe] = useState<ListinoRiga[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imballaggi, setImballaggi] = useState<ImballaggioVoce[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [codice, setCodice] = useState("B2B-");
  const [nome, setNome] = useState("");
  const [validoDal, setValidoDal] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [drafts, setDrafts] = useState<Record<string, CondDraft>>({});
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [editCodice, setEditCodice] = useState("");
  const [editNome, setEditNome] = useState("");
  const [editDal, setEditDal] = useState("");
  const [editAl, setEditAl] = useState("");
  const [editNote, setEditNote] = useState("");

  const confezioni = useMemo(
    () => imballaggiPerCondizioneListino(imballaggi),
    [imballaggi]
  );

  function reloadListini() {
    startTransition(async () => {
      const res = await listListiniAction();
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setItems(res.items);
      setIsAdmin(res.isAdmin);
    });
  }

  async function reloadRighe(listinoId: string) {
    const res = await listListinoRigheAction(listinoId);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setRighe(res.items);
  }

  useEffect(() => {
    reloadListini();
    void listImballaggiVociAction().then((r) => {
      if (r.success) setImballaggi(r.items);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setRighe([]);
      return;
    }
    startTransition(async () => {
      await reloadRighe(selectedId);
    });
  }, [selectedId]);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const isBozza = selected?.stato === "bozza";
  const incompleteCount = righe.filter((r) => !rigaListinoCompleta(r)).length;

  useEffect(() => {
    if (!selected) return;
    setEditCodice(selected.codice);
    setEditNome(selected.nome);
    setEditDal(selected.validoDal);
    setEditAl(selected.validoAl ?? "");
    setEditNote(selected.note);
  }, [
    selected?.id,
    selected?.codice,
    selected?.nome,
    selected?.validoDal,
    selected?.validoAl,
    selected?.note,
  ]);

  function condDraft(rigaId: string): CondDraft {
    return drafts[rigaId] ?? emptyCond;
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <h2 className="text-sm font-semibold">Nuovo listino B2B</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Alla creazione vengono caricate tutte le voci prodotto. Prezzo 0
              solo con dichiarazione «fuori produzione» o «non disponibile».
              Gli sconti sono facoltativi.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="Codice"
                value={codice}
                onChange={(e) => setCodice(e.target.value)}
              />
              <input
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="Nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
              <input
                type="date"
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                value={validoDal}
                onChange={(e) => setValidoDal(e.target.value)}
              />
            </div>
            <button
              type="button"
              disabled={pending}
              className="mt-3 rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() =>
                startTransition(async () => {
                  const res = await createListinoAction({
                    codice,
                    nome,
                    validoDal,
                  });
                  if (!res.success) {
                    setError(res.error);
                    return;
                  }
                  setNome("");
                  reloadListini();
                  setSelectedId(res.item.id);
                })
              }
            >
              Crea bozza
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--muted-bg)] text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2">Codice</th>
                  <th className="px-3 py-2">Stato</th>
                  <th className="px-3 py-2">Validità</th>
                  <th className="px-3 py-2">v</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className={`cursor-pointer border-t border-[var(--border)] ${
                      selectedId === item.id ? "bg-emerald-50" : ""
                    }`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <td className="px-3 py-2 font-medium">{item.codice}</td>
                    <td className="px-3 py-2">{STATO_LABEL[item.stato]}</td>
                    <td className="px-3 py-2 text-xs">
                      {item.validoDal}
                      {item.validoAl ? ` → ${item.validoAl}` : ""}
                    </td>
                    <td className="px-3 py-2">{item.versione}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          {!selected ? (
            <p className="text-sm text-[var(--muted)]">
              Seleziona un listino. Le righe si compilano come un foglio:
              prodotto, prezzo, poi sconti per quantità e confezione.
            </p>
          ) : (
            <>
              <h2 className="text-sm font-semibold">
                {isBozza ? "Modifica bozza" : selected.nome}
              </h2>
              <p className="text-xs text-[var(--muted)]">
                {STATO_LABEL[selected.stato]} · v{selected.versione}
                {isBozza
                  ? " · ogni campo è modificabile, poi Salva testata"
                  : " · bloccato: i prezzi ufficiali non si cambiano qui"}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-[var(--muted)]">
                  Codice
                  <input
                    className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
                    value={editCodice}
                    disabled={!isBozza || pending}
                    onChange={(e) => setEditCodice(e.target.value)}
                  />
                </label>
                <label className="text-xs text-[var(--muted)]">
                  Nome
                  <input
                    className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                    value={editNome}
                    disabled={!isBozza || pending}
                    onChange={(e) => setEditNome(e.target.value)}
                  />
                </label>
                <label className="text-xs text-[var(--muted)]">
                  Valido dal
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                    value={editDal}
                    disabled={!isBozza || pending}
                    onChange={(e) => setEditDal(e.target.value)}
                  />
                </label>
                <label className="text-xs text-[var(--muted)]">
                  Valido al (vuoto = senza scadenza)
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                    value={editAl}
                    disabled={!isBozza || pending}
                    onChange={(e) => setEditAl(e.target.value)}
                  />
                </label>
                <label className="sm:col-span-2 text-xs text-[var(--muted)]">
                  Note
                  <input
                    className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                    value={editNote}
                    disabled={!isBozza || pending}
                    onChange={(e) => setEditNote(e.target.value)}
                  />
                </label>
              </div>
              {isBozza ? (
                <button
                  type="button"
                  disabled={pending}
                  className="mt-3 rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() =>
                    startTransition(async () => {
                      const res = await updateListinoAction({
                        id: selected.id,
                        codice: editCodice,
                        nome: editNome,
                        validoDal: editDal,
                        validoAl: editAl || null,
                        note: editNote,
                      });
                      if (!res.success) {
                        setError(res.error);
                        return;
                      }
                      setItems((prev) =>
                        prev.map((x) => (x.id === res.item.id ? res.item : x))
                      );
                    })
                  }
                >
                  Salva testata
                </button>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {isBozza ? (
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    onClick={() =>
                      startTransition(async () => {
                        const res = await inviaListinoInRevisioneAction(
                          selected.id
                        );
                        if (!res.success) setError(res.error);
                        else reloadListini();
                      })
                    }
                  >
                    Listino completo → In Revisione
                  </button>
                ) : null}
                {selected.stato === "in_revisione" && isAdmin ? (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      onClick={() => {
                        setOtp("");
                        setOtpOpen(true);
                      }}
                    >
                      Approva e metti in uso
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs"
                      onClick={() =>
                        startTransition(async () => {
                          const res = await riportaListinoInBozzaAction(
                            selected.id
                          );
                          if (!res.success) setError(res.error);
                          else reloadListini();
                        })
                      }
                    >
                      Riporta in bozza
                    </button>
                  </>
                ) : null}
                {selected.stato === "in_uso" && isAdmin ? (
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900"
                    onClick={() => setObsoletoOpen(true)}
                  >
                    Dichiara obsoleto
                  </button>
                ) : null}
                <InfoHint title={STATO_LABEL[selected.stato]}>
                  {STATO_HELP[selected.stato]}
                </InfoHint>
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">
                {STATO_HELP[selected.stato]}
              </p>
            </>
          )}
        </div>
      </div>

      {selected ? (
        <div className="space-y-3">
          {isBozza && incompleteCount > 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {incompleteCount} voci senza prezzo: imposta € oppure dichiara
              «fuori produzione» / «al momento non disponibile».
            </p>
          ) : null}
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="min-w-[960px] w-full text-left text-sm">
              <thead className="bg-[var(--muted-bg)] text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2">Prodotto</th>
                  <th className="px-3 py-2">Prezzo</th>
                  <th className="px-3 py-2">UM</th>
                  <th className="px-3 py-2">Disponibilità</th>
                  {selected.stato === "in_revisione" ? (
                    <th className="px-3 py-2">Check</th>
                  ) : null}
                  <th className="px-3 py-2">Qty da</th>
                  <th className="px-3 py-2">Qty a</th>
                  <th className="px-3 py-2">Confezionamento</th>
                  <th className="px-3 py-2">Sconto %</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {righe.map((r) => (
                  <RigaBlock
                    key={r.id}
                    riga={r}
                    editable={Boolean(isBozza)}
                    inRevisione={selected.stato === "in_revisione"}
                    isAdmin={isAdmin}
                    pending={pending}
                    confezioni={confezioni}
                    draft={condDraft(r.id)}
                    onDraftChange={(next) =>
                      setDrafts((prev) => ({ ...prev, [r.id]: next }))
                    }
                    onSaved={() => {
                      if (selectedId) void reloadRighe(selectedId);
                    }}
                    onError={setError}
                    onDeleteCond={(c) =>
                      setDeleting({ kind: "condizione", riga: r, condizione: c })
                    }
                    startTransition={startTransition}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {otpOpen && selected ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold">Approva e metti in uso</h3>
            <p className="mt-2 text-sm text-slate-700">
              Confermi che tutte le voci sono state controllate? Inserisci il
              codice OTP di Google Authenticator. Il listino diventerà In Uso;
              eventuali listini In Uso precedenti passeranno a Obsoleto.
            </p>
            <input
              className="mt-3 w-full rounded-md border border-[var(--border)] px-3 py-2 font-mono text-sm tracking-widest"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border px-3 py-1.5 text-sm"
                onClick={() => setOtpOpen(false)}
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={pending || otp.length !== 6}
                className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                onClick={() =>
                  startTransition(async () => {
                    const res = await approvaListinoInUsoAction({
                      id: selected.id,
                      otp,
                    });
                    if (!res.success) {
                      setError(res.error);
                      return;
                    }
                    setOtpOpen(false);
                    reloadListini();
                  })
                }
              >
                Conferma con OTP
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {obsoletoOpen && selected ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold">Dichiara obsoleto</h3>
            <p className="mt-2 text-sm text-slate-700">
              Questo listino <strong>resta In Uso</strong> fino a quando tutte le
              voci non saranno aggiornate in una nuova bozza e quella bozza non
              verrà approvata (OTP). Gli sconti non sono obbligatori. Ogni voce
              deve avere un prezzo oppure la dichiarazione «fuori produzione» /
              «al momento non disponibile».
            </p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-md border px-3 py-1.5 text-sm"
                onClick={() => setObsoletoOpen(false)}
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={pending}
                className="rounded-md border px-3 py-1.5 text-sm"
                onClick={() =>
                  startTransition(async () => {
                    const res = await dichiaraListinoObsoletoAction({
                      id: selected.id,
                      creaSostituzione: false,
                    });
                    if (!res.success) setError(res.error);
                    setObsoletoOpen(false);
                  })
                }
              >
                Ho capito
              </button>
              <button
                type="button"
                disabled={pending}
                className="rounded-md bg-amber-700 px-3 py-1.5 text-sm text-white"
                onClick={() =>
                  startTransition(async () => {
                    const res = await dichiaraListinoObsoletoAction({
                      id: selected.id,
                      creaSostituzione: true,
                    });
                    if (!res.success) {
                      setError(res.error);
                      return;
                    }
                    setObsoletoOpen(false);
                    reloadListini();
                    if (res.bozzaId) setSelectedId(res.bozzaId);
                  })
                }
              >
                Crea bozza di sostituzione
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleting ? (
        <ConfirmDeleteModal
          title="Rimuovi condizione sconto"
          message={`Rimuovere lo sconto ${deleting.condizione.scontoPct}% su ${deleting.condizione.imballaggioCodice}? Soft delete: resta in archivio.`}
          confirmLabel="Rimuovi"
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            startTransition(async () => {
              const res = await softDeleteListinoRigaCondizioneAction(
                deleting.condizione.id
              );
              if (!res.success) {
                setError(res.error);
                return;
              }
              if (selectedId) await reloadRighe(selectedId);
              setDeleting(null);
            })
          }
        />
      ) : null}
    </div>
  );
}

function RigaBlock({
  riga,
  editable,
  inRevisione,
  isAdmin,
  pending,
  confezioni,
  draft,
  onDraftChange,
  onSaved,
  onError,
  onDeleteCond,
  startTransition,
}: {
  riga: ListinoRiga;
  editable: boolean;
  inRevisione: boolean;
  isAdmin: boolean;
  pending: boolean;
  confezioni: ImballaggioVoce[];
  draft: CondDraft;
  onDraftChange: (d: CondDraft) => void;
  onSaved: () => void;
  onError: (msg: string) => void;
  onDeleteCond: (c: ListinoRigaCondizione) => void;
  startTransition: (fn: () => Promise<void>) => void;
}) {
  const [prezzo, setPrezzo] = useState(String(riga.prezzo));
  const [um, setUm] = useState<ListinoRigaUm>(riga.unitaMisura);
  const [disp, setDisp] = useState<ListinoDisponibilita>(riga.disponibilita);

  useEffect(() => {
    setPrezzo(String(riga.prezzo));
    setUm(riga.unitaMisura);
    setDisp(riga.disponibilita);
  }, [riga.id, riga.prezzo, riga.unitaMisura, riga.disponibilita]);

  const completa = rigaListinoCompleta({
    prezzo: Number(prezzo),
    disponibilita: disp,
  });

  return (
    <>
      <tr
        className={`border-t border-[var(--border)] ${
          completa ? "bg-white" : "bg-amber-50/70"
        }`}
      >
        <td className="px-3 py-2 font-medium">
          {riga.prodottoCodice} {riga.prodottoNome}
        </td>
        <td className="px-3 py-2">
          <input
            className="w-24 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm"
            type="number"
            min={0}
            step="0.01"
            value={prezzo}
            disabled={!editable || pending}
            onChange={(e) => setPrezzo(e.target.value)}
          />
        </td>
        <td className="px-3 py-2">
          <select
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm"
            value={um}
            disabled={!editable || pending}
            onChange={(e) => setUm(e.target.value as ListinoRigaUm)}
          >
            {LISTINO_RIGA_UM.map((u) => (
              <option key={u} value={u}>
                €/{u}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-2">
          <select
            className="min-w-[11rem] rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm"
            value={disp}
            disabled={!editable || pending}
            onChange={(e) =>
              setDisp(e.target.value as ListinoDisponibilita)
            }
          >
            {LISTINO_DISPONIBILITA.map((d) => (
              <option key={d} value={d}>
                {LISTINO_DISPONIBILITA_LABEL[d]}
              </option>
            ))}
          </select>
        </td>
        {inRevisione ? (
          <td className="px-3 py-2">
            <input
              type="checkbox"
              disabled={!isAdmin || pending}
              checked={riga.revisioneApprovata}
              onChange={(e) =>
                startTransition(async () => {
                  const res = await setListinoRigaRevisioneAction({
                    rigaId: riga.id,
                    approvata: e.target.checked,
                  });
                  if (!res.success) {
                    onError(res.error);
                    return;
                  }
                  onSaved();
                })
              }
            />
          </td>
        ) : null}
        <td colSpan={4} className="px-3 py-2 text-xs text-[var(--muted)]">
          Prezzo base. Sconti facoltativi sotto. Prezzo 0 solo con
          dichiarazione.
        </td>
        <td className="px-3 py-2">
          {editable ? (
            <button
              type="button"
              disabled={pending}
              className="text-xs font-medium text-emerald-800 underline"
              onClick={() =>
                startTransition(async () => {
                  const res = await upsertListinoRigaAction({
                    listinoId: riga.listinoId,
                    prodottoId: riga.prodottoId,
                    prezzo: Number(prezzo),
                    unitaMisura: um,
                    disponibilita: disp,
                  });
                  if (!res.success) {
                    onError(res.error);
                    return;
                  }
                  onSaved();
                })
              }
            >
              Salva
            </button>
          ) : null}
        </td>
      </tr>
      {riga.condizioni.map((c) => (
        <CondizioneRow
          key={c.id}
          condizione={c}
          editable={editable}
          pending={pending}
          extraLeadCells={inRevisione ? 2 : 1}
          confezioni={confezioni}
          onSaved={onSaved}
          onError={onError}
          onDelete={() => onDeleteCond(c)}
          startTransition={startTransition}
        />
      ))}
      {editable ? (
      <tr className="border-t border-dashed border-slate-200 bg-slate-50/30">
        <td className="px-3 py-1.5 pl-8 text-xs text-[var(--muted)]">
          + sconto
        </td>
        <td className="px-3 py-1.5" />
        <td className="px-3 py-1.5" />
        <td className="px-3 py-1.5" />
        {inRevisione ? <td className="px-3 py-1.5" /> : null}
        <td className="px-3 py-1.5">
          <input
            className="w-20 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            type="number"
            min={0}
            value={draft.qtyDa}
            onChange={(e) => onDraftChange({ ...draft, qtyDa: e.target.value })}
          />
        </td>
        <td className="px-3 py-1.5">
          <input
            className="w-20 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            type="number"
            min={0}
            placeholder="∞"
            value={draft.qtyA}
            onChange={(e) => onDraftChange({ ...draft, qtyA: e.target.value })}
          />
        </td>
        <td className="px-3 py-1.5">
          <select
            className="w-full min-w-[180px] rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            value={draft.imballaggioVoceId}
            onChange={(e) =>
              onDraftChange({ ...draft, imballaggioVoceId: e.target.value })
            }
          >
            <option value="">Confezione / C&I…</option>
            {confezioni.map((v) => (
              <option key={v.id} value={v.id}>
                {v.codice} — {v.nome}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-1.5">
          <input
            className="w-16 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={draft.scontoPct}
            onChange={(e) =>
              onDraftChange({ ...draft, scontoPct: e.target.value })
            }
          />
        </td>
        <td className="px-3 py-1.5">
          <button
            type="button"
            disabled={pending || !draft.imballaggioVoceId}
            className="text-xs font-medium text-emerald-800 underline disabled:opacity-40"
            onClick={() =>
              startTransition(async () => {
                const qtyA = draft.qtyA.trim() === "" ? null : Number(draft.qtyA);
                const res = await upsertListinoRigaCondizioneAction({
                  listinoRigaId: riga.id,
                  qtyDa: Number(draft.qtyDa),
                  qtyA,
                  imballaggioVoceId: draft.imballaggioVoceId,
                  scontoPct: Number(draft.scontoPct),
                });
                if (!res.success) {
                  onError(res.error);
                  return;
                }
                onDraftChange(emptyCond);
                onSaved();
              })
            }
          >
            Aggiungi
          </button>
        </td>
      </tr>
      ) : null}
    </>
  );
}

function CondizioneRow({
  condizione,
  editable,
  pending,
  extraLeadCells,
  confezioni,
  onSaved,
  onError,
  onDelete,
  startTransition,
}: {
  condizione: ListinoRigaCondizione;
  editable: boolean;
  pending: boolean;
  extraLeadCells: number;
  confezioni: ImballaggioVoce[];
  onSaved: () => void;
  onError: (msg: string) => void;
  onDelete: () => void;
  startTransition: (fn: () => Promise<void>) => void;
}) {
  const [qtyDa, setQtyDa] = useState(String(condizione.qtyDa));
  const [qtyA, setQtyA] = useState(
    condizione.qtyA == null ? "" : String(condizione.qtyA)
  );
  const [imballaggioVoceId, setImballaggioVoceId] = useState(
    condizione.imballaggioVoceId
  );
  const [scontoPct, setScontoPct] = useState(String(condizione.scontoPct));

  useEffect(() => {
    setQtyDa(String(condizione.qtyDa));
    setQtyA(condizione.qtyA == null ? "" : String(condizione.qtyA));
    setImballaggioVoceId(condizione.imballaggioVoceId);
    setScontoPct(String(condizione.scontoPct));
  }, [
    condizione.id,
    condizione.qtyDa,
    condizione.qtyA,
    condizione.imballaggioVoceId,
    condizione.scontoPct,
  ]);

  return (
    <tr className="border-t border-dashed border-slate-200 bg-slate-50/50">
      <td className="px-3 py-1.5 pl-8 text-xs text-[var(--muted)]">
        condizione
      </td>
      <td className="px-3 py-1.5" />
      <td className="px-3 py-1.5" />
      {Array.from({ length: extraLeadCells }).map((_, i) => (
        <td key={i} className="px-3 py-1.5" />
      ))}
      <td className="px-3 py-1.5">
        {editable ? (
          <input
            className="w-20 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            type="number"
            min={0}
            value={qtyDa}
            disabled={pending}
            onChange={(e) => setQtyDa(e.target.value)}
          />
        ) : (
          <span className="tabular-nums">{condizione.qtyDa}</span>
        )}
      </td>
      <td className="px-3 py-1.5">
        {editable ? (
          <input
            className="w-20 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            type="number"
            min={0}
            placeholder="∞"
            value={qtyA}
            disabled={pending}
            onChange={(e) => setQtyA(e.target.value)}
          />
        ) : (
          <span className="tabular-nums">{condizione.qtyA ?? "∞"}</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-xs">
        {editable ? (
          <select
            className="w-full min-w-[180px] rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            value={imballaggioVoceId}
            disabled={pending}
            onChange={(e) => setImballaggioVoceId(e.target.value)}
          >
            {confezioni.map((v) => (
              <option key={v.id} value={v.id}>
                {v.codice} — {v.nome}
              </option>
            ))}
            {!confezioni.some((v) => v.id === condizione.imballaggioVoceId) ? (
              <option value={condizione.imballaggioVoceId}>
                {condizione.imballaggioCodice} {condizione.imballaggioNome}
              </option>
            ) : null}
          </select>
        ) : (
          <span>
            {condizione.imballaggioCodice} {condizione.imballaggioNome}
          </span>
        )}
      </td>
      <td className="px-3 py-1.5">
        {editable ? (
          <input
            className="w-16 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={scontoPct}
            disabled={pending}
            onChange={(e) => setScontoPct(e.target.value)}
          />
        ) : (
          <span className="tabular-nums">{condizione.scontoPct}</span>
        )}
      </td>
      <td className="px-3 py-1.5">
        {editable ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              className="text-xs font-medium text-emerald-800 underline"
              onClick={() =>
                startTransition(async () => {
                  const nextQtyA = qtyA.trim() === "" ? null : Number(qtyA);
                  const res = await upsertListinoRigaCondizioneAction({
                    id: condizione.id,
                    listinoRigaId: condizione.listinoRigaId,
                    qtyDa: Number(qtyDa),
                    qtyA: nextQtyA,
                    imballaggioVoceId,
                    scontoPct: Number(scontoPct),
                  });
                  if (!res.success) {
                    onError(res.error);
                    return;
                  }
                  onSaved();
                })
              }
            >
              Salva
            </button>
            <button
              type="button"
              className="text-xs text-red-700 underline"
              onClick={onDelete}
            >
              Rimuovi
            </button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}
