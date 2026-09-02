"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { listImballaggiVociAction } from "@/app/actions/imballaggi-spedizioni";
import {
  approvaListinoInUsoAction,
  createListinoAction,
  dichiaraListinoObsoletoAction,
  inviaListinoInRevisioneAction,
  listGeoCatalogAction,
  listListiniAction,
  allocateTargheScontoListinoAction,
  nextTargaScontoListinoAction,
  listListinoRigheAction,
  riportaListinoInBozzaAction,
  setListinoRigaRevisioneAction,
  updateListinoAction,
  upsertListinoRigaAction,
  upsertListinoRigaCondizioneAction,
} from "@/app/actions/listini";
import { ListinoNazioniPicker } from "@/components/amministrazione/ListinoNazioniPicker";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import { InfoHint } from "@/components/ui/InfoHint";
import {
  labelLingua,
  lingueDaNazioni,
  type GeoNazione,
} from "@/lib/ecosystem/geo-nazioni";
import {
  imballaggiPerCondizioneListino,
  standardConfezioneProdotto,
  type ImballaggioVoce,
} from "@/lib/amministrazione/imballaggi-spedizioni";
import {
  LISTINO_CODICE_PREFIX,
  LISTINO_DISPONIBILITA,
  LISTINO_DISPONIBILITA_LABEL,
  LISTINO_RIGA_UM,
  listinoCodiceSlug,
  avvisoQtyConfezione,
  isValidTargaSconto,
  listinoRigaCondizioneSyncItemSchema,
  normalizeTargaSconto,
  parseListinoCodice,
  previewScontoListino,
  rigaListinoCompleta,
  targaScontoDigits,
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
  bozza_traduzione: "Bozza traduzione",
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
  bozza_traduzione:
    "Copia in lingua madre generata a «Listino completo». Stessi prezzi; nomi prodotto restano in italiano fino alla compilazione traduzioni. Etichette fisse (Al kg, sconto…) nella lingua della versione.",
};

type DeleteTarget = {
  scontoPct: number;
  imballaggioCodice?: string;
  onConfirm: () => void;
};

type LocalCond = {
  key: string;
  id?: string;
  qtyDa: string;
  qtyA: string;
  imballaggioVoceId: string;
  imballaggioCodice?: string;
  imballaggioNome?: string;
  kg: string;
  scontoPct: string;
  kgForzato: boolean;
  locked: boolean;
  targa: string;
};

function rigaDraftKey(rigaId: string) {
  return `oi.listino.riga.draft.v1:${rigaId}`;
}

type RigaDraftStore = {
  prezzo: string;
  um: ListinoRigaUm;
  disp: ListinoDisponibilita;
  localConds: LocalCond[];
};

function readRigaDraft(rigaId: string): RigaDraftStore | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(rigaDraftKey(rigaId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RigaDraftStore;
    if (!Array.isArray(parsed.localConds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeRigaDraft(rigaId: string, draft: RigaDraftStore) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(rigaDraftKey(rigaId), JSON.stringify(draft));
  } catch {
    /* quota / private mode */
  }
}

function clearRigaDraft(rigaId: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(rigaDraftKey(rigaId));
  } catch {
    /* ignore */
  }
}

function bootstrapRiga(riga: ListinoRiga): RigaDraftStore & {
  locked: boolean;
  openSconti: boolean;
} {
  const fromServer = riga.condizioni.map(condFromRiga);
  const prezzoDefault =
    riga.prezzo === 0 && riga.disponibilita === "in_produzione"
      ? ""
      : String(riga.prezzo);
  const draft = readRigaDraft(riga.id);
  if (
    draft &&
    draft.localConds.length > fromServer.length &&
    draft.localConds.some((c) => c.locked)
  ) {
    return { ...draft, locked: false, openSconti: true };
  }
  return {
    prezzo: prezzoDefault,
    um: riga.unitaMisura,
    disp: riga.disponibilita,
    localConds: fromServer,
    locked: rigaListinoCompleta(riga),
    openSconti: false,
  };
}

function condFromRiga(c: ListinoRigaCondizione): LocalCond {
  return {
    key: c.id,
    id: c.id,
    qtyDa: String(c.qtyDa),
    qtyA: c.qtyA == null ? "" : String(c.qtyA),
    imballaggioVoceId: c.imballaggioVoceId,
    imballaggioCodice: c.imballaggioCodice,
    imballaggioNome: c.imballaggioNome,
    kg: c.kgConfezione ? String(c.kgConfezione) : "",
    scontoPct: String(c.scontoPct),
    kgForzato: c.kgForzato,
    locked: true,
    targa: c.targa || "",
  };
}

type CondDraft = {
  qtyDa: string;
  qtyA: string;
  imballaggioVoceId: string;
  kg: string;
  scontoPct: string;
  targa: string;
};

const emptyCond: CondDraft = {
  qtyDa: "0",
  qtyA: "",
  imballaggioVoceId: "",
  kg: "",
  scontoPct: "0",
  targa: "",
};

function TargaScontoField({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (targa: string) => void;
}) {
  return (
    <div className="flex min-w-[5.5rem] items-stretch overflow-hidden rounded border border-[var(--border)] bg-[var(--background)]">
      <span className="shrink-0 bg-slate-100 px-1.5 py-1 text-[11px] font-semibold text-slate-600">
        Sc
      </span>
      <input
        className="w-14 bg-transparent px-1 py-1 font-mono text-xs outline-none disabled:text-slate-500"
        inputMode="numeric"
        maxLength={5}
        placeholder="00001"
        disabled={disabled}
        value={targaScontoDigits(value)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 5);
          onChange(digits ? normalizeTargaSconto(digits) : "");
        }}
      />
    </div>
  );
}

function CodiceListinoField({
  slug,
  versione,
  disabled,
  onSlugChange,
}: {
  slug: string;
  versione: number;
  disabled?: boolean;
  onSlugChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 items-stretch overflow-hidden rounded-md border border-[var(--border)] bg-[var(--background)]">
      <span className="shrink-0 bg-slate-100 px-2 py-2 text-sm font-medium text-slate-600">
        {LISTINO_CODICE_PREFIX}
      </span>
      <input
        className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none disabled:text-slate-500"
        placeholder="InserisciTesto"
        value={slug}
        disabled={disabled}
        onChange={(e) => onSlugChange(listinoCodiceSlug(e.target.value))}
      />
      <span className="shrink-0 bg-slate-100 px-2 py-2 text-sm font-medium text-slate-600">
        -V{versione}
      </span>
    </div>
  );
}

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
  const [codiceSlug, setCodiceSlug] = useState("");
  const [nome, setNome] = useState("");
  const [modelloOpen, setModelloOpen] = useState(false);
  const [modelloId, setModelloId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, CondDraft>>({});
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [editCodice, setEditCodice] = useState("");
  const [editNome, setEditNome] = useState("");
  const [editNote, setEditNote] = useState("");
  const [catalogNazioni, setCatalogNazioni] = useState<GeoNazione[]>([]);
  const [createNazioneIds, setCreateNazioneIds] = useState<string[]>([]);
  const [editNazioneIds, setEditNazioneIds] = useState<string[]>([]);

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
    void listGeoCatalogAction().then((r) => {
      if (r.success) setCatalogNazioni(r.nazioni);
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
    setEditCodice(parseListinoCodice(selected.codice).slug);
    setEditNome(selected.nome);
    setEditNote(selected.note);
    setEditNazioneIds(selected.nazioni.map((n) => n.id));
  }, [selected?.id, selected?.codice, selected?.nome, selected?.note, selected?.nazioni]);

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
              Codice: B2B- + testo + -V1 (la versione non è modificabile). Al
              salvataggio compaiono tutte le voci prodotto, vuote e senza sconti.
              Prezzo 0 solo con dichiarazione «fuori produzione» o «non
              disponibile». Indica le nazioni coperte: a «Listino completo»
              nasce una versione per ogni lingua madre distinta.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <CodiceListinoField
                slug={codiceSlug}
                versione={1}
                onSlugChange={setCodiceSlug}
                disabled={pending}
              />
              <input
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="Nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium text-[var(--muted)]">
                Nazioni coperte
              </p>
              <ListinoNazioniPicker
                nazioni={catalogNazioni}
                selectedIds={createNazioneIds}
                disabled={pending}
                defaultOpen
                onChange={setCreateNazioneIds}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending || !codiceSlug || createNazioneIds.length < 1}
                className="rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                onClick={() =>
                  startTransition(async () => {
                    const res = await createListinoAction({
                      codice: codiceSlug,
                      nome,
                      nazioneIds: createNazioneIds,
                    });
                    if (!res.success) {
                      setError(res.error);
                      return;
                    }
                    setCodiceSlug("");
                    setNome("");
                    setCreateNazioneIds([]);
                    setModelloOpen(false);
                    reloadListini();
                    setSelectedId(res.item.id);
                  })
                }
              >
                Crea bozza
              </button>
              {items.length > 0 ? (
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium"
                  onClick={() => {
                    setModelloId(items[0]?.id ?? "");
                    setModelloOpen((v) => !v);
                  }}
                >
                  Usa modello
                </button>
              ) : null}
            </div>
            {modelloOpen && items.length > 0 ? (
              <div className="mt-3 space-y-2 rounded-lg border border-[var(--border)] bg-slate-50 p-3">
                <label className="block text-xs text-[var(--muted)]">
                  Copia da un listino esistente (prezzi, disponibilità e sconti).
                  Poi è tutto modificabile.
                  <select
                    className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)]"
                    value={modelloId}
                    onChange={(e) => setModelloId(e.target.value)}
                  >
                    {items.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.codice} — {m.nome} ({STATO_LABEL[m.stato]})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={pending || !modelloId || !codiceSlug}
                  className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  onClick={() =>
                    startTransition(async () => {
                      const res = await createListinoAction({
                        codice: codiceSlug,
                        nome,
                        modelloId,
                        nazioneIds: createNazioneIds,
                      });
                      if (!res.success) {
                        setError(res.error);
                        return;
                      }
                      setCodiceSlug("");
                      setNome("");
                      setCreateNazioneIds([]);
                      setModelloOpen(false);
                      reloadListini();
                      setSelectedId(res.item.id);
                    })
                  }
                >
                  Crea bozza dal modello
                </button>
              </div>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--muted-bg)] text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2">Codice</th>
                  <th className="px-3 py-2">Stato</th>
                  <th className="px-3 py-2">Nazioni / lingua</th>
                  <th className="px-3 py-2">In Uso dal</th>
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
                      {item.listinoOrigineId
                        ? `Versione ${labelLingua(item.locale)}`
                        : item.nazioni.length
                          ? `${item.nazioni
                              .slice(0, 3)
                              .map((n) => n.iso2)
                              .join(", ")}${item.nazioni.length > 3 ? "…" : ""} · ${lingueDaNazioni(item.nazioni)
                              .map(labelLingua)
                              .join(", ")}`
                          : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {item.stato === "in_uso" && item.publishedAt
                        ? item.publishedAt.slice(0, 10)
                        : "—"}
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
              Seleziona un listino. La validità la dà lo stato In Uso, non una
              data. In bozza ogni voce va prezzata o dichiarata.
            </p>
          ) : (
            <>
              <h2 className="text-sm font-semibold">
                {isBozza ? "Modifica bozza" : selected.nome}
              </h2>
              <p className="text-xs text-[var(--muted)]">
                {STATO_LABEL[selected.stato]} · v{selected.versione}
                {selected.listinoOrigineId
                  ? ` · versione ${labelLingua(selected.locale)}`
                  : ""}
                {isBozza
                  ? " · ogni campo è modificabile, poi Salva testata"
                  : " · bloccato: i prezzi ufficiali non si cambiano qui"}
              </p>
              {selected.stato === "bozza_traduzione" ? (
                <p className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-900">
                  Versione in {labelLingua(selected.locale)}: etichette fisse
                  (Al kg, sconto…) in lingua. I nomi prodotto restano in
                  italiano fino alla compilazione delle traduzioni.
                </p>
              ) : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-[var(--muted)]">
                  Codice
                  <div className="mt-1">
                    <CodiceListinoField
                      slug={editCodice}
                      versione={parseListinoCodice(selected.codice).versione}
                      onSlugChange={setEditCodice}
                      disabled={!isBozza || pending}
                    />
                  </div>
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
                <label className="sm:col-span-2 text-xs text-[var(--muted)]">
                  Note
                  <input
                    className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                    value={editNote}
                    disabled={!isBozza || pending}
                    onChange={(e) => setEditNote(e.target.value)}
                  />
                </label>
                <div className="sm:col-span-2">
                  <p className="mb-1 text-xs text-[var(--muted)]">
                    Nazioni coperte
                    {selected.listinoOrigineId
                      ? " (eredita dal listino madre)"
                      : ""}
                  </p>
                  {selected.listinoOrigineId ? (
                    <p className="text-xs">
                      {selected.nazioni.map((n) => n.nome).join(", ") || "—"}
                      {" · "}
                      Versione {labelLingua(selected.locale)}
                    </p>
                  ) : (
                    <ListinoNazioniPicker
                      nazioni={catalogNazioni}
                      selectedIds={editNazioneIds}
                      disabled={!isBozza || pending}
                      defaultOpen={false}
                      onChange={setEditNazioneIds}
                    />
                  )}
                </div>
              </div>
              {isBozza ? (
                <button
                  type="button"
                  disabled={pending || editNazioneIds.length < 1}
                  className="mt-3 rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() =>
                    startTransition(async () => {
                      const res = await updateListinoAction({
                        id: selected.id,
                        codice: editCodice,
                        nome: editNome,
                        note: editNote,
                        nazioneIds: editNazioneIds,
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
                  <th
                    className="px-3 py-2"
                    title="Deve essere un multiplo dei kg confezione (es. 25 → 25, 50, 475, 500)"
                  >
                    Qty da
                  </th>
                  <th
                    className="px-3 py-2"
                    title="Deve essere un multiplo dei kg confezione (es. 25 → 25, 50, 475, 500)"
                  >
                    Qty a
                  </th>
                  <th className="px-3 py-2">Confezionamento</th>
                  <th className="px-3 py-2">Kg</th>
                  <th className="px-3 py-2">Targa</th>
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
                    locale={selected.locale}
                    onSaved={() => {
                      if (selectedId) void reloadRighe(selectedId);
                    }}
                    onError={setError}
                    onAskDelete={setDeleting}
                    altriRighe={righe.filter((x) => x.id !== r.id)}
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
          message={`Togliere lo sconto ${deleting.scontoPct}% su ${deleting.imballaggioCodice ?? "confezione"} da questa riga? Si scrive in bozza solo quando premi Salva sul prodotto.`}
          confirmLabel="Rimuovi dalla riga"
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            deleting.onConfirm();
            setDeleting(null);
          }}
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
  locale,
  onSaved,
  onError,
  onAskDelete,
  altriRighe,
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
  locale: string;
  onSaved: () => void;
  onError: (msg: string) => void;
  onAskDelete: (target: DeleteTarget) => void;
  altriRighe: ListinoRiga[];
  startTransition: (fn: () => Promise<void>) => void;
}) {
  const [prezzo, setPrezzo] = useState(() => bootstrapRiga(riga).prezzo);
  const [um, setUm] = useState<ListinoRigaUm>(() => bootstrapRiga(riga).um);
  const [disp, setDisp] = useState<ListinoDisponibilita>(
    () => bootstrapRiga(riga).disp
  );
  const [prodottoLocked, setProdottoLocked] = useState(
    () => bootstrapRiga(riga).locked
  );
  const [localConds, setLocalConds] = useState<LocalCond[]>(
    () => bootstrapRiga(riga).localConds
  );
  const [draftKgWarn, setDraftKgWarn] = useState<{
    kg: number;
    standard: number;
    um: string;
  } | null>(null);
  const [scontiOpen, setScontiOpen] = useState(
    () => bootstrapRiga(riga).openSconti
  );
  const [copyFromId, setCopyFromId] = useState("");

  useEffect(() => {
    const boot = bootstrapRiga(riga);
    setPrezzo(boot.prezzo);
    setUm(boot.um);
    setDisp(boot.disp);
    setLocalConds(boot.localConds);
    setProdottoLocked(boot.locked);
    setScontiOpen(boot.openSconti);
    // Solo al cambio riga: un reload del padre non deve cancellare la bozza locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- riga.id
  }, [riga.id]);

  useEffect(() => {
    writeRigaDraft(riga.id, { prezzo, um, disp, localConds });
  }, [riga.id, prezzo, um, disp, localConds]);

  const completa = rigaListinoCompleta({
    prezzo: Number(prezzo),
    disponibilita: disp,
  });

  const draftPreviewSconto = previewScontoListino({
    prezzo: Number(prezzo) || riga.prezzo,
    scontoPct: Number(draft.scontoPct),
    qtyDa: Number(draft.qtyDa),
    qtyA: draft.qtyA.trim() === "" ? null : Number(draft.qtyA),
    unitaMisura: um,
    locale,
  });
  const draftQtyAvviso = avvisoQtyConfezione({
    qtyDa: Number(draft.qtyDa),
    qtyA: draft.qtyA.trim() === "" ? null : Number(draft.qtyA),
    kgConfezione: Number(draft.kg),
  });
  const draftKgStep =
    Number(draft.kg) > 0 ? String(Number(draft.kg)) : undefined;

  async function lockDraftCond(forza: boolean, kgOverride?: number) {
    const payload = {
      qtyDa: Number(draft.qtyDa),
      qtyA: draft.qtyA.trim() === "" ? null : Number(draft.qtyA),
      imballaggioVoceId: draft.imballaggioVoceId,
      scontoPct: Number(draft.scontoPct),
      kgConfezione: kgOverride ?? Number(draft.kg),
      kgForzato: forza,
      targa: draft.targa,
    };
    const parsed = listinoRigaCondizioneSyncItemSchema.safeParse({
      ...payload,
      targa: draft.targa || undefined,
    });
    if (!parsed.success) {
      onError(parsed.error.issues[0]?.message ?? "Sconto non valido");
      return;
    }
    let targa = draft.targa.trim()
      ? normalizeTargaSconto(draft.targa)
      : "";
    if (!isValidTargaSconto(targa)) {
      const res = await nextTargaScontoListinoAction(
        localConds.map((c) => c.targa)
      );
      if (!res.success) {
        onError(res.error);
        return;
      }
      targa = res.targa;
    }
    const saved = await upsertListinoRigaCondizioneAction({
      listinoRigaId: riga.id,
      qtyDa: payload.qtyDa,
      qtyA: payload.qtyA,
      imballaggioVoceId: payload.imballaggioVoceId,
      scontoPct: payload.scontoPct,
      kgConfezione: payload.kgConfezione,
      kgForzato: forza,
      targa,
    });
    if (!saved.success) {
      onError(saved.error);
      return;
    }
    const next: LocalCond = {
      ...condFromRiga(saved.item),
      key: saved.item.id,
      locked: true,
    };
    setLocalConds((prev) => [...prev, next]);
    onDraftChange(emptyCond);
    setScontiOpen(true);
  }

  async function copiaDaProdotto(sourceId: string) {
    const src = altriRighe.find((x) => x.id === sourceId);
    if (!src) {
      onError("Seleziona un prodotto da cui copiare.");
      return;
    }
    const alloc = await allocateTargheScontoListinoAction(
      src.condizioni.length,
      localConds.map((c) => c.targa)
    );
    if (!alloc.success) {
      onError(alloc.error);
      return;
    }
    setPrezzo(
      src.prezzo === 0 && src.disponibilita === "in_produzione"
        ? ""
        : String(src.prezzo)
    );
    setUm(src.unitaMisura);
    setDisp(src.disponibilita);
    setLocalConds(
      src.condizioni.map((c, i) => ({
        ...condFromRiga(c),
        key: `tmp-${crypto.randomUUID()}`,
        id: undefined,
        targa: alloc.targhe[i] ?? "",
        locked: true,
      }))
    );
    onDraftChange(emptyCond);
    setScontiOpen(true);
    setCopyFromId("");
    setProdottoLocked(false);
  }

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
            disabled={!editable || prodottoLocked || pending}
            onChange={(e) => setPrezzo(e.target.value)}
          />
        </td>
        <td className="px-3 py-2">
          <select
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm"
            value={um}
            disabled={!editable || prodottoLocked || pending}
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
            disabled={!editable || prodottoLocked || pending}
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
        <td colSpan={6} className="px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--muted)]">
              Sconti presenti {localConds.length}
            </span>
            {editable && !prodottoLocked && altriRighe.length ? (
              <>
                <select
                  className="max-w-[14rem] rounded border border-[var(--border)] px-1.5 py-1 text-xs"
                  value={copyFromId}
                  disabled={pending}
                  onChange={(e) => setCopyFromId(e.target.value)}
                >
                  <option value="">Copia da altro prodotto…</option>
                  {altriRighe.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.prodottoCodice} {p.prodottoNome}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pending || !copyFromId}
                  className="text-xs font-medium text-sky-800 underline disabled:opacity-40"
                  onClick={() => void copiaDaProdotto(copyFromId)}
                >
                  Copia come bozza
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="ml-auto px-1 text-sm leading-none text-slate-700"
              aria-expanded={scontiOpen}
              aria-label={scontiOpen ? "Chiudi sconti" : "Apri sconti"}
              onClick={() => setScontiOpen((v) => !v)}
            >
              {scontiOpen ? "▲" : "▼"}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Prezzo 0 solo con dichiarazione. La copia prende prezzo, quantità e
            imballaggi; le targhe sono nuove. Poi controlla e Salva sul
            prodotto.
          </p>
        </td>
        <td className="px-3 py-2">
          {editable ? (
            prodottoLocked ? (
              <button
                type="button"
                disabled={pending}
                className="text-xs font-medium text-slate-800 underline"
                onClick={() => setProdottoLocked(false)}
              >
                Modifica
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                className="text-xs font-medium text-emerald-800 underline"
                onClick={() =>
                  startTransition(async () => {
                    const unlocked = localConds.filter((c) => !c.locked);
                    if (unlocked.length) {
                      onError(
                        "Blocca ogni riga sconto con Salva prima di salvare il prodotto."
                      );
                      return;
                    }
                    const condizioni = [];
                    for (const c of localConds) {
                      const parsed = listinoRigaCondizioneSyncItemSchema.safeParse({
                        id: c.id,
                        qtyDa: Number(c.qtyDa),
                        qtyA: c.qtyA.trim() === "" ? null : Number(c.qtyA),
                        imballaggioVoceId: c.imballaggioVoceId,
                        scontoPct: Number(c.scontoPct),
                        kgConfezione: Number(c.kg),
                        kgForzato: c.kgForzato,
                        targa: c.targa,
                      });
                      if (!parsed.success) {
                        onError(
                          parsed.error.issues[0]?.message ??
                            "Controlla le righe sconto prima di Salva prodotto."
                        );
                        return;
                      }
                      condizioni.push(parsed.data);
                    }
                    const res = await upsertListinoRigaAction({
                      listinoId: riga.listinoId,
                      prodottoId: riga.prodottoId,
                      prezzo: Number(prezzo),
                      unitaMisura: um,
                      disponibilita: disp,
                      syncCondizioni: true,
                      condizioni,
                    });
                    if (!res.success) {
                      onError(res.error);
                      return;
                    }
                    setLocalConds(
                      (res.item.condizioni ?? []).map(condFromRiga)
                    );
                    setProdottoLocked(true);
                    clearRigaDraft(riga.id);
                    onSaved();
                  })
                }
              >
                Salva
              </button>
            )
          ) : null}
        </td>
      </tr>
      {scontiOpen
        ? localConds.map((c) => (
        <CondizioneRow
          key={c.key}
          cond={c}
          prodottoId={riga.prodottoId}
          prezzoBase={Number(prezzo) || riga.prezzo}
          unitaMisura={um}
          locale={locale}
          listinoRigaId={riga.id}
          reservedTarghe={localConds
            .filter((x) => x.key !== c.key)
            .map((x) => x.targa)}
          editable={editable && !prodottoLocked}
          pending={pending}
          extraLeadCells={inRevisione ? 2 : 1}
          confezioni={confezioni}
          onChange={(next) =>
            setLocalConds((prev) =>
              prev.map((x) => (x.key === c.key ? next : x))
            )
          }
          onUnlock={() =>
            setLocalConds((prev) =>
              prev.map((x) => (x.key === c.key ? { ...x, locked: false } : x))
            )
          }
          onError={onError}
          onDelete={() =>
            onAskDelete({
              scontoPct: Number(c.scontoPct) || 0,
              imballaggioCodice: c.imballaggioCodice,
              onConfirm: () =>
                setLocalConds((prev) => prev.filter((x) => x.key !== c.key)),
            })
          }
        />
      ))
        : null}
      {scontiOpen && editable && !prodottoLocked ? (
      <>
      <tr className="border-t border-dashed border-slate-200 bg-slate-50/30">
        <td
          colSpan={inRevisione ? 5 : 4}
          className="px-3 py-1.5 pl-8 align-top"
        >
          <p className="text-[11px] text-[var(--muted)]">+ sconto</p>
          <p className="text-xs font-medium text-emerald-900">
            {draftPreviewSconto ??
              "Imposta il prezzo del prodotto per vedere lo sconto al kg e la fascia in euro."}
          </p>
        </td>
        <td className="px-3 py-1.5">
          <input
            className="w-20 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            type="number"
            min={0}
            step={draftKgStep}
            value={draft.qtyDa}
            onChange={(e) => onDraftChange({ ...draft, qtyDa: e.target.value })}
          />
        </td>
        <td className="px-3 py-1.5">
          <input
            className="w-20 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            type="number"
            min={0}
            step={draftKgStep}
            placeholder="∞"
            value={draft.qtyA}
            onChange={(e) => onDraftChange({ ...draft, qtyA: e.target.value })}
          />
        </td>
        <td className="px-3 py-1.5">
          <select
            className="w-full min-w-[180px] rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            value={draft.imballaggioVoceId}
            onChange={(e) => {
              const id = e.target.value;
              const std = standardConfezioneProdotto(
                confezioni.find((v) => v.id === id),
                riga.prodottoId
              );
              onDraftChange({
                ...draft,
                imballaggioVoceId: id,
                kg: std ? String(std.max) : "",
              });
            }}
          >
            <option value="">Confezione / C&I…</option>
            {confezioni.map((v) => {
              const std = standardConfezioneProdotto(v, riga.prodottoId);
              return (
                <option key={v.id} value={v.id}>
                  {v.codice} — {v.nome}
                  {std ? ` (${std.max} ${std.um})` : ""}
                </option>
              );
            })}
          </select>
        </td>
        <td className="px-3 py-1.5">
          <input
            className="w-16 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            type="number"
            min={0}
            step="0.01"
            placeholder="kg"
            value={draft.kg}
            onChange={(e) => onDraftChange({ ...draft, kg: e.target.value })}
          />
        </td>
        <td className="px-3 py-1.5">
          <TargaScontoField
            value={draft.targa}
            onChange={(targa) => onDraftChange({ ...draft, targa })}
          />
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
            disabled={
              pending ||
              !draft.imballaggioVoceId ||
              !draft.kg ||
              Boolean(draftQtyAvviso)
            }
            className="text-xs font-medium text-emerald-800 underline disabled:opacity-40"
            onClick={() => {
              const std = standardConfezioneProdotto(
                confezioni.find((v) => v.id === draft.imballaggioVoceId),
                riga.prodottoId
              );
              const kg = Number(draft.kg);
              if (std && kg > std.max) {
                setDraftKgWarn({ kg, standard: std.max, um: std.um });
                return;
              }
              startTransition(async () => {
                await lockDraftCond(false);
              });
            }}
          >
            Salva
          </button>
        </td>
      </tr>
      {draftQtyAvviso ? (
        <tr className="bg-amber-50">
          <td
            colSpan={inRevisione ? 13 : 12}
            className="px-3 py-1.5 pl-8 text-xs text-amber-900"
          >
            {draftQtyAvviso}
          </td>
        </tr>
      ) : null}
      </>
      ) : null}
      {draftKgWarn ? (
        <KgForzaModal
          kg={draftKgWarn.kg}
          standard={draftKgWarn.standard}
          um={draftKgWarn.um}
          pending={pending}
          onAdegua={() => {
            onDraftChange({ ...draft, kg: String(draftKgWarn.standard) });
            setDraftKgWarn(null);
            startTransition(async () => {
              await lockDraftCond(false, draftKgWarn.standard);
            });
          }}
          onForza={() => {
            setDraftKgWarn(null);
            startTransition(async () => {
              await lockDraftCond(true);
            });
          }}
          onClose={() => setDraftKgWarn(null)}
        />
      ) : null}
    </>
  );
}

function CondizioneRow({
  cond,
  listinoRigaId,
  reservedTarghe,
  prodottoId,
  prezzoBase,
  unitaMisura,
  locale,
  editable,
  pending,
  extraLeadCells,
  confezioni,
  onChange,
  onUnlock,
  onError,
  onDelete,
}: {
  cond: LocalCond;
  listinoRigaId: string;
  reservedTarghe: string[];
  prodottoId: string;
  prezzoBase: number;
  unitaMisura: ListinoRigaUm;
  locale: string;
  editable: boolean;
  pending: boolean;
  extraLeadCells: number;
  confezioni: ImballaggioVoce[];
  onChange: (next: LocalCond) => void;
  onUnlock: () => void;
  onError: (msg: string) => void;
  onDelete: () => void;
}) {
  const [kgWarn, setKgWarn] = useState<{
    kg: number;
    standard: number;
    um: string;
  } | null>(null);

  const canEdit = editable && !cond.locked;
  const previewSconto = previewScontoListino({
    prezzo: prezzoBase,
    scontoPct: Number(cond.scontoPct),
    qtyDa: Number(cond.qtyDa),
    qtyA: cond.qtyA.trim() === "" ? null : Number(cond.qtyA),
    unitaMisura,
    locale,
  });
  const qtyAvviso = avvisoQtyConfezione({
    qtyDa: Number(cond.qtyDa),
    qtyA: cond.qtyA.trim() === "" ? null : Number(cond.qtyA),
    kgConfezione: Number(cond.kg),
  });
  const kgStep = Number(cond.kg) > 0 ? String(Number(cond.kg)) : undefined;

  async function tryLock(forza: boolean, kgOverride?: number) {
    const kgVal = kgOverride ?? Number(cond.kg);
    let targa = cond.targa.trim() ? normalizeTargaSconto(cond.targa) : "";
    if (!isValidTargaSconto(targa)) {
      const res = await nextTargaScontoListinoAction(reservedTarghe);
      if (!res.success) {
        onError(res.error);
        return;
      }
      targa = res.targa;
    }
    const parsed = listinoRigaCondizioneSyncItemSchema.safeParse({
      id: cond.id,
      qtyDa: Number(cond.qtyDa),
      qtyA: cond.qtyA.trim() === "" ? null : Number(cond.qtyA),
      imballaggioVoceId: cond.imballaggioVoceId,
      scontoPct: Number(cond.scontoPct),
      kgConfezione: kgVal,
      kgForzato: forza || cond.kgForzato,
      targa,
    });
    if (!parsed.success) {
      onError(parsed.error.issues[0]?.message ?? "Sconto non valido");
      return;
    }
    const saved = await upsertListinoRigaCondizioneAction({
      id: cond.id,
      listinoRigaId,
      qtyDa: parsed.data.qtyDa,
      qtyA: parsed.data.qtyA,
      imballaggioVoceId: parsed.data.imballaggioVoceId,
      scontoPct: parsed.data.scontoPct,
      kgConfezione: parsed.data.kgConfezione,
      kgForzato: parsed.data.kgForzato,
      targa: parsed.data.targa,
    });
    if (!saved.success) {
      onError(saved.error);
      return;
    }
    onChange({
      ...condFromRiga(saved.item),
      key: cond.key,
      locked: true,
    });
  }

  return (
    <>
    <tr className="border-t border-dashed border-slate-200 bg-slate-50/50">
      <td
        colSpan={extraLeadCells + 3}
        className="px-3 py-1.5 pl-8 align-top"
      >
        <p className="text-[11px] text-[var(--muted)]">sconto</p>
        <p className="text-xs font-medium text-emerald-900">
          {previewSconto ??
            "Imposta il prezzo del prodotto per vedere lo sconto al kg e la fascia in euro."}
        </p>
      </td>
      <td className="px-3 py-1.5">
        {canEdit ? (
          <input
            className="w-20 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            type="number"
            min={0}
            step={kgStep}
            value={cond.qtyDa}
            disabled={pending}
            onChange={(e) => onChange({ ...cond, qtyDa: e.target.value })}
          />
        ) : (
          <span className="tabular-nums">{cond.qtyDa}</span>
        )}
      </td>
      <td className="px-3 py-1.5">
        {canEdit ? (
          <input
            className="w-20 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            type="number"
            min={0}
            step={kgStep}
            placeholder="∞"
            value={cond.qtyA}
            disabled={pending}
            onChange={(e) => onChange({ ...cond, qtyA: e.target.value })}
          />
        ) : (
          <span className="tabular-nums">{cond.qtyA || "∞"}</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-xs">
        {canEdit ? (
          <select
            className="w-full min-w-[180px] rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            value={cond.imballaggioVoceId}
            disabled={pending}
            onChange={(e) => {
              const id = e.target.value;
              const std = standardConfezioneProdotto(
                confezioni.find((v) => v.id === id),
                prodottoId
              );
              onChange({
                ...cond,
                imballaggioVoceId: id,
                imballaggioCodice: confezioni.find((v) => v.id === id)?.codice,
                imballaggioNome: confezioni.find((v) => v.id === id)?.nome,
                kg: std ? String(std.max) : cond.kg,
              });
            }}
          >
            {confezioni.map((v) => {
              const std = standardConfezioneProdotto(v, prodottoId);
              return (
                <option key={v.id} value={v.id}>
                  {v.codice} — {v.nome}
                  {std ? ` (${std.max} ${std.um})` : ""}
                </option>
              );
            })}
            {!confezioni.some((v) => v.id === cond.imballaggioVoceId) ? (
              <option value={cond.imballaggioVoceId}>
                {cond.imballaggioCodice} {cond.imballaggioNome}
              </option>
            ) : null}
          </select>
        ) : (
          <span>
            {cond.imballaggioCodice} {cond.imballaggioNome}
          </span>
        )}
      </td>
      <td className="px-3 py-1.5">
        {canEdit ? (
          <input
            className="w-16 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            type="number"
            min={0}
            step="0.01"
            value={cond.kg}
            disabled={pending}
            onChange={(e) => onChange({ ...cond, kg: e.target.value })}
          />
        ) : (
          <span className="tabular-nums">
            {cond.kg}
            {cond.kgForzato ? " *" : ""}
          </span>
        )}
      </td>
      <td className="px-3 py-1.5">
        {canEdit ? (
          <TargaScontoField
            value={cond.targa}
            onChange={(targa) => onChange({ ...cond, targa })}
          />
        ) : (
          <span className="font-mono text-xs">{cond.targa || "—"}</span>
        )}
      </td>
      <td className="px-3 py-1.5">
        {canEdit ? (
          <input
            className="w-16 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={cond.scontoPct}
            disabled={pending}
            onChange={(e) => onChange({ ...cond, scontoPct: e.target.value })}
          />
        ) : (
          <span className="tabular-nums">{cond.scontoPct}</span>
        )}
      </td>
      <td className="px-3 py-1.5">
        {editable ? (
          <div className="flex flex-wrap gap-2">
            {cond.locked ? (
              <button
                type="button"
                disabled={pending}
                className="text-xs font-medium text-slate-800 underline"
                onClick={onUnlock}
              >
                Modifica
              </button>
            ) : (
              <button
                type="button"
                disabled={pending || Boolean(qtyAvviso)}
                className="text-xs font-medium text-emerald-800 underline disabled:opacity-40"
                onClick={() => {
                  const std = standardConfezioneProdotto(
                    confezioni.find((v) => v.id === cond.imballaggioVoceId),
                    prodottoId
                  );
                  const nextKg = Number(cond.kg);
                  if (std && nextKg > std.max) {
                    setKgWarn({ kg: nextKg, standard: std.max, um: std.um });
                    return;
                  }
                  tryLock(false);
                }}
              >
                Salva
              </button>
            )}
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
    {qtyAvviso ? (
      <tr className="bg-amber-50">
        <td
          colSpan={extraLeadCells + 11}
          className="px-3 py-1.5 pl-8 text-xs text-amber-900"
        >
          {qtyAvviso}
        </td>
      </tr>
    ) : null}
    {kgWarn ? (
      <KgForzaModal
        kg={kgWarn.kg}
        standard={kgWarn.standard}
        um={kgWarn.um}
        pending={pending}
        onAdegua={() => {
          setKgWarn(null);
          tryLock(false, kgWarn.standard);
        }}
        onForza={() => {
          setKgWarn(null);
          tryLock(true);
        }}
        onClose={() => setKgWarn(null)}
      />
    ) : null}
    </>
  );
}

function KgForzaModal({
  kg,
  standard,
  um,
  pending,
  onAdegua,
  onForza,
  onClose,
}: {
  kg: number;
  standard: number;
  um: string;
  pending: boolean;
  onAdegua: () => void;
  onForza: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
        <h3 className="text-sm font-semibold">Kg sopra lo standard</h3>
        <p className="mt-2 text-sm text-slate-700">
          Hai indicato <strong>{kg} {um}</strong>, superiore allo standard della
          confezione (<strong>{standard} {um}</strong>). Puoi adeguare allo
          standard oppure forzare la scelta proposta (resta tracciata).
        </p>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm"
            onClick={onClose}
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900"
            onClick={onAdegua}
          >
            Adegua allo standard
          </button>
          <button
            type="button"
            disabled={pending}
            className="rounded-md bg-amber-700 px-3 py-1.5 text-sm text-white"
            onClick={onForza}
          >
            Forza la scelta
          </button>
        </div>
      </div>
    </div>
  );
}
