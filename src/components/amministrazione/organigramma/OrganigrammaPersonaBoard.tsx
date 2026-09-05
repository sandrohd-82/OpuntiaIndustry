"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  addAutorizzazionePostoAction,
  createPermessoAction,
  getDocumentoUrlAction,
  getPersonaAction,
  listAutorizzazioniPersonaAction,
  listMansioniAction,
  listRepartiAction,
  listPermessiAction,
  listPersonaAttivitaAction,
  listPersonaDocumentiAction,
  listPostiOrganigrammaAction,
  removeAutorizzazionePostoAction,
  setPermessoStatoAction,
  softDeleteDocumentoAction,
  updatePersonaAction,
  uploadPersonaDocumentoAction,
  uploadPersonaFotoAction,
} from "@/app/actions/organigramma";
import {
  ORGANIGRAMMA_AZIONI,
  ORGANIGRAMMA_PERMESSO_STATI,
  ORGANIGRAMMA_PERMESSO_TIPI,
  attivitaPersonaLabel,
  docTipoLabel,
  permessoTipoLabel,
  personaLabel,
  type OrganigrammaAttivita,
  type OrganigrammaDocumento,
  type OrganigrammaDocTipo,
  type OrganigrammaMansione,
  type OrganigrammaPermesso,
  type OrganigrammaPersona,
  type OrganigrammaReparto,
  type PostoAutorizzato,
  type PostoOrganigrammaOption,
} from "@/lib/amministrazione/organigramma";

const inputCls =
  "mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm";

type Props = { personaId: string };

export function OrganigrammaPersonaBoard({ personaId }: Props) {
  const [item, setItem] = useState<OrganigrammaPersona | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mansioni, setMansioni] = useState<OrganigrammaMansione[]>([]);
  const [reparti, setReparti] = useState<OrganigrammaReparto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    void (async () => {
      const [p, m, r] = await Promise.all([
        getPersonaAction(personaId),
        listMansioniAction(),
        listRepartiAction(),
      ]);
      if (!p.success) {
        setError(p.error);
        return;
      }
      setItem(p.item);
      setIsAdmin(p.isAdmin);
      if (m.success) setMansioni(m.items);
      if (r.success) setReparti(r.items);
    })();
  }, [personaId, refresh]);

  if (error && !item) {
    return <p className="text-sm text-red-700">{error}</p>;
  }
  if (!item) {
    return <p className="text-sm text-[var(--muted)]">Caricamento scheda…</p>;
  }

  return (
    <div className="space-y-4">
      <Link
        href="/app/amministrazione/organigramma/elenco-e-mansioni"
        className="text-sm font-medium text-[var(--primary)] hover:underline"
      >
        ← Elenco e mansioni
      </Link>
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <AnagraficaCard
        item={item}
        mansioni={mansioni}
        reparti={reparti}
        isAdmin={isAdmin}
        onSaved={() => setRefresh((n) => n + 1)}
        onError={setError}
      />
      <DocumentiCard
        personaId={item.id}
        isAdmin={isAdmin}
        tipi={["cf_fronte", "cf_retro", "ci_fronte", "ci_retro"]}
        title="Documenti di identità"
        hint="Codice fiscale e carta d’identità, fronte e retro. Si possono caricare anche in creazione operatore."
      />
      <DocumentiCard
        personaId={item.id}
        isAdmin={isAdmin}
        tipi={["corso", "certificato"]}
        title="Corsi e certificati"
        hint="Allegati dei corsi e delle certificazioni."
        askTitolo
      />
      <DocumentiCard
        personaId={item.id}
        isAdmin={isAdmin}
        tipi={["busta_paga"]}
        title="Storico buste paga"
        hint="Carica il file e indica il periodo (es. 2026-08)."
        askTitolo
        askPeriodo
      />
      <AutorizzazioniCard personaId={item.id} isAdmin={isAdmin} />
      <PermessiCard personaId={item.id} isAdmin={isAdmin} />
      <StoricoPersonaCard personaId={item.id} refreshKey={refresh} />
    </div>
  );
}

function AnagraficaCard({
  item,
  mansioni,
  reparti,
  isAdmin,
  onSaved,
  onError,
}: {
  item: OrganigrammaPersona;
  mansioni: OrganigrammaMansione[];
  reparti: OrganigrammaReparto[];
  isAdmin: boolean;
  onSaved: () => void;
  onError: (msg: string | null) => void;
}) {
  const [nome, setNome] = useState(item.nome);
  const [cognome, setCognome] = useState(item.cognome);
  const [codiceFiscale, setCf] = useState(item.codiceFiscale);
  const [cartaIdentita, setCi] = useState(item.cartaIdentita);
  const [note, setNote] = useState(item.note);
  const [repartoId, setRepartoId] = useState(item.repartoId ?? "");
  const [mansioneIds, setMansioneIds] = useState(
    item.mansioni.map((m) => m.id)
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNome(item.nome);
    setCognome(item.cognome);
    setCf(item.codiceFiscale);
    setCi(item.cartaIdentita);
    setNote(item.note);
    setRepartoId(item.repartoId ?? "");
    setMansioneIds(item.mansioni.map((m) => m.id));
  }, [item]);

  async function save() {
    setBusy(true);
    onError(null);
    const res = await updatePersonaAction({
      id: item.id,
      nome,
      cognome,
      codiceFiscale,
      cartaIdentita,
      note,
      mansioneIds,
      repartoId: repartoId || undefined,
    });
    setBusy(false);
    if (!res.success) {
      onError(res.error);
      return;
    }
    onSaved();
  }

  async function onFoto(file: File | null) {
    if (!file) return;
    const fd = new FormData();
    fd.set("personaId", item.id);
    fd.set("file", file);
    const res = await uploadPersonaFotoAction(fd);
    if (!res.success) {
      onError(res.error);
      return;
    }
    onSaved();
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="shrink-0">
          {item.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.fotoUrl}
              alt={`Foto ${personaLabel(item)}`}
              className="h-24 w-24 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-slate-100 text-xs text-[var(--muted)]">
              Nessuna foto
            </div>
          )}
          {isAdmin ? (
            <label className="mt-2 block text-xs text-[var(--primary)]">
              Carica foto
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => void onFoto(e.target.files?.[0] ?? null)}
              />
            </label>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{personaLabel(item)}</h2>
          <p className="text-xs capitalize text-[var(--muted)]">
            Stato documento: {item.documentoStato}
            {item.userId ? " · Collegata a un login" : ""}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-[var(--muted)]">
              Nome
              <input
                value={nome}
                disabled={!isAdmin}
                onChange={(e) => setNome(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Cognome
              <input
                value={cognome}
                disabled={!isAdmin}
                onChange={(e) => setCognome(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Codice fiscale
              <input
                value={codiceFiscale}
                disabled={!isAdmin}
                onChange={(e) => setCf(e.target.value)}
                className={inputCls}
                maxLength={16}
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Carta d’identità
              <input
                value={cartaIdentita}
                disabled={!isAdmin}
                onChange={(e) => setCi(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="text-xs text-[var(--muted)] sm:col-span-2">
              Reparto
              <select
                value={repartoId}
                disabled={!isAdmin}
                onChange={(e) => setRepartoId(e.target.value)}
                className={inputCls}
              >
                <option value="">Nessun reparto</option>
                {reparti.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="mt-3">
            <legend className="text-xs text-[var(--muted)]">Mansioni</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {mansioni.map((m) => (
                <label key={m.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={mansioneIds.includes(m.id)}
                    onChange={() =>
                      setMansioneIds((cur) =>
                        cur.includes(m.id)
                          ? cur.filter((x) => x !== m.id)
                          : [...cur, m.id]
                      )
                    }
                  />
                  {m.nome}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="mt-3 block text-xs text-[var(--muted)]">
            Note
            <textarea
              value={note}
              disabled={!isAdmin}
              onChange={(e) => setNote(e.target.value)}
              className={inputCls}
              rows={2}
            />
          </label>
          {isAdmin ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="mt-3 rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Salvataggio…" : "Salva anagrafica"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function DocumentiCard({
  personaId,
  isAdmin,
  tipi,
  title,
  hint,
  askTitolo,
  askPeriodo,
}: {
  personaId: string;
  isAdmin: boolean;
  tipi: OrganigrammaDocTipo[];
  title: string;
  hint: string;
  askTitolo?: boolean;
  askPeriodo?: boolean;
}) {
  const [items, setItems] = useState<OrganigrammaDocumento[]>([]);
  const [tipo, setTipo] = useState<OrganigrammaDocTipo>(tipi[0]!);
  const [titolo, setTitolo] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await listPersonaDocumentiAction(personaId);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setItems(res.items.filter((d) => tipi.includes(d.tipo)));
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

  async function upload(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("personaId", personaId);
    fd.set("tipo", tipo);
    fd.set("titolo", titolo);
    fd.set("periodo", periodo);
    fd.set("note", "");
    fd.set("file", file);
    const res = await uploadPersonaDocumentoAction(fd);
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setTitolo("");
    setPeriodo("");
    await load();
  }

  async function openDoc(id: string) {
    const res = await getDocumentoUrlAction(id);
    if (!res.success) {
      setError(res.error);
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
      {isAdmin ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {tipi.length > 1 ? (
            <label className="text-xs text-[var(--muted)]">
              Tipo
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as OrganigrammaDocTipo)}
                className={inputCls}
              >
                {tipi.map((t) => (
                  <option key={t} value={t}>
                    {docTipoLabel(t)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {askTitolo ? (
            <label className="text-xs text-[var(--muted)]">
              Titolo
              <input
                value={titolo}
                onChange={(e) => setTitolo(e.target.value)}
                className={inputCls}
              />
            </label>
          ) : null}
          {askPeriodo ? (
            <label className="text-xs text-[var(--muted)]">
              Periodo
              <input
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                className={inputCls}
                placeholder="2026-08"
              />
            </label>
          ) : null}
          <label className="text-xs text-[var(--muted)]">
            File
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              disabled={busy}
              className="mt-1 block w-full text-sm"
              onChange={(e) => void upload(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <ul className="mt-3 divide-y divide-[var(--border)]">
        {items.length === 0 ? (
          <li className="py-2 text-sm text-[var(--muted)]">Nessun allegato.</li>
        ) : (
          items.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="font-medium">{d.titolo || docTipoLabel(d.tipo)}</span>
              <span className="text-xs text-[var(--muted)]">
                {docTipoLabel(d.tipo)}
                {d.periodo ? ` · ${d.periodo}` : ""}
                {" · "}
                {new Date(d.createdAt).toLocaleDateString("it-IT")}
              </span>
              <button
                type="button"
                onClick={() => void openDoc(d.id)}
                className="text-[var(--primary)] hover:underline"
              >
                Apri
              </button>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={async () => {
                    const res = await softDeleteDocumentoAction(d.id);
                    if (!res.success) setError(res.error);
                    else await load();
                  }}
                  className="text-red-700 hover:underline"
                >
                  Rimuovi
                </button>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function AutorizzazioniCard({
  personaId,
  isAdmin,
}: {
  personaId: string;
  isAdmin: boolean;
}) {
  const [items, setItems] = useState<PostoAutorizzato[]>([]);
  const [posti, setPosti] = useState<PostoOrganigrammaOption[]>([]);
  const [postoId, setPostoId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [a, p] = await Promise.all([
      listAutorizzazioniPersonaAction(personaId),
      listPostiOrganigrammaAction(),
    ]);
    if (!a.success) {
      setError(a.error);
      return;
    }
    if (!p.success) {
      setError(p.error);
      return;
    }
    setItems(a.items);
    setPosti(p.items);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

  const used = new Set(items.map((i) => i.postoId));

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h3 className="text-sm font-semibold">Autorizzazioni postazioni</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Solo le postazioni dove serve un operatore. La vasca non è una
        postazione.
      </p>
      {isAdmin ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-[14rem] flex-1 text-xs text-[var(--muted)]">
            Postazione
            <select
              value={postoId}
              onChange={(e) => setPostoId(e.target.value)}
              className={inputCls}
            >
              <option value="">Seleziona…</option>
              {posti
                .filter((p) => !used.has(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.areaNome} — {p.nome}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!postoId}
            onClick={async () => {
              const res = await addAutorizzazionePostoAction({
                postoId,
                personaId,
              });
              if (!res.success) setError(res.error);
              else {
                setPostoId("");
                await load();
              }
            }}
            className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Autorizza
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <ul className="mt-3 divide-y divide-[var(--border)]">
        {items.length === 0 ? (
          <li className="py-2 text-sm text-[var(--muted)]">
            Nessuna postazione autorizzata.
          </li>
        ) : (
          items.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {a.areaNome} — {a.postoNome}
              </span>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={async () => {
                    const res = await removeAutorizzazionePostoAction(a.id);
                    if (!res.success) setError(res.error);
                    else await load();
                  }}
                  className="text-red-700 hover:underline"
                >
                  Revoca
                </button>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function PermessiCard({
  personaId,
  isAdmin,
}: {
  personaId: string;
  isAdmin: boolean;
}) {
  const [items, setItems] = useState<OrganigrammaPermesso[]>([]);
  const [tipo, setTipo] = useState<(typeof ORGANIGRAMMA_PERMESSO_TIPI)[number]>(
    "ferie"
  );
  const [dal, setDal] = useState("");
  const [al, setAl] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await listPermessiAction(personaId);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setItems(res.items);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h3 className="text-sm font-semibold">Richieste e permessi</h3>
      {isAdmin ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs text-[var(--muted)]">
            Tipo
            <select
              value={tipo}
              onChange={(e) =>
                setTipo(e.target.value as (typeof ORGANIGRAMMA_PERMESSO_TIPI)[number])
              }
              className={inputCls}
            >
              {ORGANIGRAMMA_PERMESSO_TIPI.map((t) => (
                <option key={t} value={t}>
                  {permessoTipoLabel(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[var(--muted)]">
            Dal
            <input
              type="date"
              value={dal}
              onChange={(e) => setDal(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Al
            <input
              type="date"
              value={al}
              onChange={(e) => setAl(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="text-xs text-[var(--muted)] lg:col-span-2">
            Note
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputCls}
            />
          </label>
          <button
            type="button"
            onClick={async () => {
              const res = await createPermessoAction({
                personaId,
                tipo,
                dal,
                al,
                note,
              });
              if (!res.success) setError(res.error);
              else {
                setNote("");
                await load();
              }
            }}
            className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white sm:self-end"
          >
            Registra
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <ul className="mt-3 divide-y divide-[var(--border)]">
        {items.length === 0 ? (
          <li className="py-2 text-sm text-[var(--muted)]">Nessuna richiesta.</li>
        ) : (
          items.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="font-medium">{permessoTipoLabel(p.tipo)}</span>
              <span className="text-xs text-[var(--muted)]">
                {p.dal} → {p.al} · {p.documentoStato}
              </span>
              {p.note ? (
                <span className="text-xs text-[var(--muted)]">{p.note}</span>
              ) : null}
              {isAdmin ? (
                <select
                  value={p.documentoStato}
                  onChange={async (e) => {
                    const res = await setPermessoStatoAction(
                      p.id,
                      e.target.value as OrganigrammaPermesso["documentoStato"]
                    );
                    if (!res.success) setError(res.error);
                    else await load();
                  }}
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"
                >
                  {ORGANIGRAMMA_PERMESSO_STATI.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function StoricoPersonaCard({
  personaId,
  refreshKey,
}: {
  personaId: string;
  refreshKey: number;
}) {
  const [vista, setVista] = useState<"elenco" | "timeline">("elenco");
  const [items, setItems] = useState<OrganigrammaAttivita[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [azione, setAzione] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await listPersonaAttivitaAction({
      personaId,
      dateFrom,
      dateTo,
      azione,
    });
    setLoading(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setError(null);
    setItems(res.items);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId, refreshKey]);

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Registro attività</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Registro immutabile di anagrafica, documenti, permessi e
            autorizzazioni.
          </p>
        </div>
        <div className="flex rounded-full border border-[var(--border)] p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setVista("elenco")}
            className={`rounded-full px-3 py-1 font-medium ${
              vista === "elenco" ? "bg-[var(--primary)] text-white" : "text-slate-600"
            }`}
          >
            Elenco
          </button>
          <button
            type="button"
            onClick={() => setVista("timeline")}
            className={`rounded-full px-3 py-1 font-medium ${
              vista === "timeline" ? "bg-[var(--primary)] text-white" : "text-slate-600"
            }`}
          >
            Timeline
          </button>
        </div>
      </div>
      <form
        className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label className="text-xs text-[var(--muted)]">
          Data da
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Data a
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Tipo
          <select
            value={azione}
            onChange={(e) => setAzione(e.target.value)}
            className={inputCls}
          >
            <option value="">Tutte</option>
            {ORGANIGRAMMA_AZIONI.map((a) => (
              <option key={a} value={a}>
                {attivitaPersonaLabel(a)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Filtra
          </button>
          <button
            type="button"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setAzione("");
              void listPersonaAttivitaAction({ personaId }).then((r) => {
                if (r.success) setItems(r.items);
              });
            }}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            Reset
          </button>
        </div>
      </form>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      {items.length === 0 && !loading ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Nessuna attività per i filtri selezionati.
        </p>
      ) : vista === "elenco" ? (
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {items.map((row) => (
            <li key={row.id} className="py-2 text-sm">
              <span className="font-semibold">{attivitaPersonaLabel(row.azione)}</span>
              {" · "}
              {row.actorNome || "Operatore"}
              {" · "}
              {new Date(row.createdAt).toLocaleString("it-IT")}
              {row.note ? (
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  {row.note}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <ol className="mt-4 space-y-0 border-l-2 border-slate-200 pl-4">
          {items.map((row) => (
            <li key={row.id} className="relative pb-4 last:pb-0">
              <span className="absolute -left-[23px] top-1 h-3 w-3 rounded-full bg-[var(--primary)] ring-2 ring-white" />
              <p className="text-xs text-[var(--muted)]">
                {new Date(row.createdAt).toLocaleString("it-IT")}
              </p>
              <p className="text-sm font-semibold">
                {attivitaPersonaLabel(row.azione)}
              </p>
              <p className="text-xs text-slate-700">{row.actorNome || "Operatore"}</p>
              {row.note ? (
                <p className="mt-0.5 text-xs text-[var(--muted)]">{row.note}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
