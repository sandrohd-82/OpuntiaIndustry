"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  addAutorizzazionePostoAction,
  createPermessoAction,
  getPersonaAction,
  listAutorizzazioniPersonaAction,
  listCertificatiCatalogoAction,
  listCertificatiInScadenzaAction,
  listMansioniAction,
  listRepartiAction,
  listPermessiAction,
  listPersonaAttivitaAction,
  listPersonaDocumentiAction,
  listPostiOrganigrammaAction,
  removeAutorizzazionePostoAction,
  setOperatoreInForzaAction,
  applicaTacitoRinnovoAction,
  setContrattoStatoAction,
  setPermessoStatoAction,
  softDeleteContrattoAction,
  softDeleteDocumentoAction,
  updatePersonaAction,
  uploadPersonaContrattoAction,
  uploadPersonaDocumentoAction,
  uploadPersonaFotoAction,
  listPersonaContrattiAction,
} from "@/app/actions/organigramma";
import { getCommercialeAnagraficaContextAction } from "@/app/actions/commerciale-anagrafica";
import { AziendeCommercialeCard } from "@/components/amministrazione/organigramma/AziendeCommercialeCard";
import { ContrattoElenco } from "@/components/amministrazione/organigramma/ContrattoElenco";
import { DocumentoElenco } from "@/components/amministrazione/organigramma/DocumentoElenco";
import { CreateGestionaleProfileModal } from "@/components/amministrazione/organigramma/CreateGestionaleProfileModal";
import { EsportaSchedaOperatoreModal } from "@/components/amministrazione/organigramma/EsportaSchedaOperatoreModal";
import { ActionGate } from "@/components/layout/ActionAccessProvider";
import { AZ } from "@/lib/auth/action-access";
import {
  FotoTesseraBox,
  type FotoTesseraHandle,
} from "@/components/amministrazione/organigramma/FotoTesseraBox";
import { FileDropZone } from "@/components/ui/FileDropZone";
import {
  COMMERCIALE_GRADI,
  COMMERCIALE_GRADO_LABELS,
  isRepartoCommerciale,
} from "@/lib/auth/commerciale";
import {
  OPERATIVE_AZIONI,
  ORGANIGRAMMA_CONTRATTO_STATI,
  ORGANIGRAMMA_CONTRATTO_TIPI,
  ORGANIGRAMMA_PERMESSO_STATI,
  ORGANIGRAMMA_PERMESSO_TIPI,
  attivitaPersonaLabel,
  calcolaScadenzaCertificato,
  certificatoAlertLabel,
  contrattoAlertLabel,
  contrattoAlertLivello,
  contrattoTipoLabel,
  docTipoLabel,
  permessoTipoLabel,
  personaLabel,
  type CertificatoScadenzaAlert,
  type OrganigrammaAttivita,
  type OrganigrammaCertificatoCatalogo,
  type OrganigrammaContratto,
  type OrganigrammaContrattoStato,
  type OrganigrammaContrattoTipo,
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

function SalvaSezioneButton({
  busy,
  disabled,
  label = "Salva",
  onClick,
}: {
  busy?: boolean;
  disabled?: boolean;
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
    >
      {busy ? "Salvataggio…" : label}
    </button>
  );
}

type Props = { personaId: string };

export function OrganigrammaPersonaBoard({ personaId }: Props) {
  const [item, setItem] = useState<OrganigrammaPersona | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [linkingProfile, setLinkingProfile] = useState(false);
  const [mansioni, setMansioni] = useState<OrganigrammaMansione[]>([]);
  const [reparti, setReparti] = useState<OrganigrammaReparto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [lineageIds, setLineageIds] = useState<string[]>([]);

  useEffect(() => {
    void getCommercialeAnagraficaContextAction().then((ctx) => {
      setLineageIds(ctx.lineageIds);
    });
  }, []);

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
      setIsSuperadmin(p.isSuperadmin);
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/app/amministrazione/organigramma/elenco-e-mansioni"
          className="text-sm font-medium text-[var(--primary)] hover:underline"
        >
          ← Elenco e mansioni
        </Link>
        <button
          type="button"
          onClick={() => setExportOpen(true)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Esporta PDF
        </button>
      </div>
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {exportOpen ? (
        <EsportaSchedaOperatoreModal
          persona={item}
          onClose={() => setExportOpen(false)}
        />
      ) : null}

      <AnagraficaCard
        item={item}
        mansioni={mansioni}
        reparti={reparti}
        isAdmin={isAdmin}
        isSuperadmin={isSuperadmin}
        onOpenProfilo={() => setLinkingProfile(true)}
        onSaved={() => setRefresh((n) => n + 1)}
        onError={setError}
      />
      <AziendeCommercialeCard persona={item} lineageIds={lineageIds} />
      {linkingProfile && !item.userId ? (
        <CreateGestionaleProfileModal
          persona={item}
          onClose={() => setLinkingProfile(false)}
          onCreated={() => {
            setLinkingProfile(false);
            setRefresh((n) => n + 1);
          }}
        />
      ) : null}
      <DocumentiCard
        personaId={item.id}
        isAdmin={isAdmin}
        tipi={["cf_fronte", "cf_retro", "ci_fronte", "ci_retro"]}
        title="Documenti di identità"
        hint="Codice fiscale e carta d’identità, fronte e retro. Si possono caricare anche in creazione operatore."
      />
      <CertificatiCard
        personaId={item.id}
        inForza={item.inForza}
        isAdmin={isAdmin}
      />
      <ContrattiCard personaId={item.id} isAdmin={isAdmin} />
      <DocumentiCard
        personaId={item.id}
        isAdmin={isAdmin}
        tipi={["fattura", "busta_paga"]}
        title="Storico fatture e buste paga"
        hint="Scegli il tipo: Fattura se l’operatore è esterno a contratto, Busta paga se è ingaggiato dall’azienda. Indica il periodo (es. 2026-08)."
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
  isSuperadmin,
  onOpenProfilo,
  onSaved,
  onError,
}: {
  item: OrganigrammaPersona;
  mansioni: OrganigrammaMansione[];
  reparti: OrganigrammaReparto[];
  isAdmin: boolean;
  isSuperadmin: boolean;
  onOpenProfilo: () => void;
  onSaved: () => void;
  onError: (msg: string | null) => void;
}) {
  const [nome, setNome] = useState(item.nome);
  const [cognome, setCognome] = useState(item.cognome);
  const [codiceFiscale, setCf] = useState(item.codiceFiscale);
  const [cartaIdentita, setCi] = useState(item.cartaIdentita);
  const [note, setNote] = useState(item.note);
  const [repartoId, setRepartoId] = useState(item.repartoId ?? "");
  const [commercialeGrado, setCommercialeGrado] = useState(
    item.commercialeGrado ?? ""
  );
  const [mansioneIds, setMansioneIds] = useState(
    item.mansioni.map((m) => m.id)
  );
  const fotoRef = useRef<FotoTesseraHandle>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNome(item.nome);
    setCognome(item.cognome);
    setCf(item.codiceFiscale);
    setCi(item.cartaIdentita);
    setNote(item.note);
    setRepartoId(item.repartoId ?? "");
    setCommercialeGrado(item.commercialeGrado ?? "");
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
      commercialeGrado:
        (commercialeGrado as "senior" | "professional" | "executive") ||
        null,
    });
    if (!res.success) {
      setBusy(false);
      onError(res.error);
      return;
    }
    try {
      const cropped = await fotoRef.current?.exportIfNeeded();
      if (cropped) {
        const fd = new FormData();
        fd.set("personaId", item.id);
        fd.set("file", cropped);
        const up = await uploadPersonaFotoAction(fd);
        if (!up.success) {
          setBusy(false);
          onError(up.error);
          return;
        }
      }
    } catch (err) {
      setBusy(false);
      onError(err instanceof Error ? err.message : "Salvataggio foto non riuscito.");
      return;
    }
    setBusy(false);
    onSaved();
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="shrink-0">
          <FotoTesseraBox
            ref={fotoRef}
            coverUrl={item.fotoUrl}
            busy={busy}
            disabled={!isAdmin}
            alt={`Foto ${personaLabel(item)}`}
            onInvalid={onError}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{personaLabel(item)}</h2>
          <p className="text-xs text-[var(--muted)]">
            {item.inForza ? "In forza" : "Non lavora più in azienda"}
            {item.cessatoAt
              ? ` dal ${new Date(item.cessatoAt).toLocaleDateString("it-IT")}`
              : ""}
            {" · "}
            Stato documento: {item.documentoStato}
            {item.userId ? " · Collegato a un login" : ""}
          </p>
          {item.profilo ? (
            <p className="mt-1 text-xs text-slate-700">
              Profilo gestionale: {item.profilo.email || "—"} ·{" "}
              {item.profilo.gerarchia} · {item.profilo.stato}
            </p>
          ) : isSuperadmin ? (
            <ActionGate actionKey={AZ.creaProfilo}>
              <button
                type="button"
                className="mt-2 rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--primary-hover)]"
                onClick={onOpenProfilo}
              >
                Collega o crea profilo gestionale
              </button>
            </ActionGate>
          ) : (
            <p className="mt-1 text-xs text-[var(--muted)]">
              Nessun profilo gestionale collegato.
            </p>
          )}
          {isAdmin ? (
            <button
              type="button"
              className="mt-2 rounded-md border border-[var(--border)] px-3 py-1 text-xs font-medium hover:bg-slate-50"
              onClick={async () => {
                const res = await setOperatoreInForzaAction(item.id, !item.inForza);
                if (!res.success) onError(res.error);
                else onSaved();
              }}
            >
              {item.inForza
                ? "Dichiara che non lavora più in azienda"
                : "Riporta in forza"}
            </button>
          ) : null}
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
            {isRepartoCommerciale(
              reparti.find((r) => r.id === repartoId)
            ) ? (
              <label className="text-xs text-[var(--muted)] sm:col-span-2">
                Grado commerciale
                <select
                  value={commercialeGrado}
                  disabled={!isAdmin}
                  onChange={(e) => setCommercialeGrado(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Seleziona grado</option>
                  {COMMERCIALE_GRADI.map((g) => (
                    <option key={g} value={g}>
                      {COMMERCIALE_GRADO_LABELS[g]}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px]">
                  Senior in alto, sotto Professional, sotto Executive. I
                  subordinati si impostano nell&apos;albero organigramma.
                </span>
              </label>
            ) : null}
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
            <div className="mt-3">
              <SalvaSezioneButton busy={busy} onClick={() => void save()} />
            </div>
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
  const [picked, setPicked] = useState<File | null>(null);
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

  async function save() {
    if (!picked) {
      setError("Seleziona un file, controlla i dati e premi Salva.");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("personaId", personaId);
    fd.set("tipo", tipo);
    fd.set("titolo", titolo);
    fd.set("periodo", periodo);
    fd.set("note", "");
    fd.set("file", picked);
    const res = await uploadPersonaDocumentoAction(fd);
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setPicked(null);
    setTitolo("");
    setPeriodo("");
    await load();
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {hint} Compila, allega il file e premi Salva dopo il controllo.
      </p>
      {isAdmin ? (
        <>
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
          </div>
          <div className="mt-3">
            <FileDropZone
              file={picked}
              busy={busy}
              onFile={(f) => {
                setError(null);
                setPicked(f);
              }}
              onInvalid={setError}
            />
          </div>
          <div className="mt-3">
            <SalvaSezioneButton
              busy={busy}
              disabled={!picked}
              onClick={() => void save()}
            />
          </div>
        </>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <DocumentoElenco
        items={items}
        isAdmin={isAdmin}
        variant="documenti"
        onError={setError}
        onRemove={
          isAdmin
            ? async (id) => {
                const res = await softDeleteDocumentoAction(id);
                if (!res.success) setError(res.error);
                else await load();
              }
            : undefined
        }
      />
    </section>
  );
}

function CertificatiCard({
  personaId,
  inForza,
  isAdmin,
}: {
  personaId: string;
  inForza: boolean;
  isAdmin: boolean;
}) {
  const [items, setItems] = useState<OrganigrammaDocumento[]>([]);
  const [catalogo, setCatalogo] = useState<OrganigrammaCertificatoCatalogo[]>([]);
  const [alerts, setAlerts] = useState<CertificatoScadenzaAlert[]>([]);
  const [tipo, setTipo] = useState<"corso" | "certificato">("certificato");
  const [catalogoId, setCatalogoId] = useState("");
  const [titolo, setTitolo] = useState("");
  const [dataRilascio, setDataRilascio] = useState("");
  const [validitaAnni, setValiditaAnni] = useState("5");
  const [picked, setPicked] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const scadenzaPrevista =
    dataRilascio && Number(validitaAnni) >= 1
      ? calcolaScadenzaCertificato(dataRilascio, Number(validitaAnni))
      : "";

  async function load() {
    const [d, c, a] = await Promise.all([
      listPersonaDocumentiAction(personaId),
      listCertificatiCatalogoAction(),
      listCertificatiInScadenzaAction(),
    ]);
    if (!d.success) {
      setError(d.error);
      return;
    }
    if (c.success) setCatalogo(c.items);
    if (a.success) {
      setAlerts(a.items.filter((x) => x.personaId === personaId));
    }
    setItems(d.items.filter((x) => x.tipo === "corso" || x.tipo === "certificato"));
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

  async function save() {
    if (!titolo.trim()) {
      setError("Indica il titolo, controlla i dati e premi Salva.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRilascio)) {
      setError("Indica la data di rilascio, poi premi Salva.");
      return;
    }
    const anni = Number(validitaAnni);
    if (!Number.isInteger(anni) || anni < 1 || anni > 30) {
      setError("Validità: indica gli anni (1–30), poi premi Salva.");
      return;
    }
    if (!picked) {
      setError("Seleziona il documento, controlla i dati e premi Salva.");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("personaId", personaId);
    fd.set("tipo", tipo);
    fd.set("catalogoId", catalogoId);
    fd.set("titolo", titolo);
    fd.set("dataRilascio", dataRilascio);
    fd.set("validitaAnni", validitaAnni);
    fd.set("periodo", "");
    fd.set("note", "");
    fd.set("file", picked);
    const res = await uploadPersonaDocumentoAction(fd);
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setPicked(null);
    setTitolo("");
    setCatalogoId("");
    setDataRilascio("");
    setValiditaAnni("5");
    await load();
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h3 className="text-sm font-semibold">Corsi e certificati</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Il titolo salvato (es. Antincendio Liv.2) diventa selezionabile per gli
        altri operatori. La scadenza è calcolata da data di rilascio + anni di
        validità. Avvisi a 6 mesi, 3 mesi e poi ogni mese, finché non carichi
        il certificato corrispondente. Compila, allega il file e premi Salva
        dopo il controllo: nulla viene registrato in automatico.
      </p>
      {!inForza ? (
        <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          Operatore non in azienda: gli avvisi di scadenza sono disattivati.
        </p>
      ) : alerts.length ? (
        <ul className="mt-2 space-y-1">
          {alerts.map((al) => (
            <li
              key={al.documentoId}
              className={`rounded-md border px-3 py-2 text-sm ${
                al.livello === "scaduto"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-amber-200 bg-amber-50 text-amber-950"
              }`}
            >
              {al.titolo} · {certificatoAlertLabel(al.livello)} · scade{" "}
              {new Date(`${al.dataScadenza}T00:00:00`).toLocaleDateString("it-IT")}
            </li>
          ))}
        </ul>
      ) : null}
      {isAdmin ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-[var(--muted)]">
            Tipo
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "corso" | "certificato")}
              className={inputCls}
            >
              <option value="certificato">Certificato</option>
              <option value="corso">Corso</option>
            </select>
          </label>
          <label className="text-xs text-[var(--muted)] sm:col-span-2">
            Titolo / certificato
            <select
              value={catalogoId}
              onChange={(e) => {
                const id = e.target.value;
                setCatalogoId(id);
                const found = catalogo.find((x) => x.id === id);
                if (found) {
                  setTitolo(found.nome);
                  setValiditaAnni(String(found.validitaAnniDefault));
                } else {
                  setTitolo("");
                }
              }}
              className={inputCls}
            >
              <option value="">Nuovo titolo…</option>
              {catalogo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          {!catalogoId ? (
            <label className="text-xs text-[var(--muted)] sm:col-span-2 lg:col-span-3">
              Nuovo titolo
              <input
                value={titolo}
                onChange={(e) => setTitolo(e.target.value)}
                className={inputCls}
                placeholder="Es. Antincendio Liv.2"
              />
            </label>
          ) : null}
          <label className="text-xs text-[var(--muted)]">
            Data rilascio
            <input
              type="date"
              value={dataRilascio}
              onChange={(e) => setDataRilascio(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Periodo validità (anni)
            <input
              type="number"
              min={1}
              max={30}
              value={validitaAnni}
              onChange={(e) => setValiditaAnni(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Scadenza (calcolata)
            <input
              readOnly
              value={
                scadenzaPrevista
                  ? new Date(`${scadenzaPrevista}T00:00:00`).toLocaleDateString(
                      "it-IT"
                    )
                  : "—"
              }
              className={`${inputCls} bg-slate-50`}
            />
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <FileDropZone
              file={picked}
              busy={busy}
              onFile={(f) => {
                setError(null);
                setPicked(f);
              }}
              onInvalid={setError}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <SalvaSezioneButton
              busy={busy}
              disabled={!picked}
              onClick={() => void save()}
            />
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <DocumentoElenco
        items={items}
        isAdmin={isAdmin}
        inForza={inForza}
        variant="certificati"
        onError={setError}
        onRemove={
          isAdmin
            ? async (id) => {
                const res = await softDeleteDocumentoAction(id);
                if (!res.success) setError(res.error);
                else await load();
              }
            : undefined
        }
      />
    </section>
  );
}

function ContrattiCard({
  personaId,
  isAdmin,
}: {
  personaId: string;
  isAdmin: boolean;
}) {
  const [items, setItems] = useState<OrganigrammaContratto[]>([]);
  const [tipologia, setTipologia] =
    useState<OrganigrammaContrattoTipo>("collaborazione");
  const [titolo, setTitolo] = useState("");
  const [dataInizio, setDataInizio] = useState("");
  const [dataFine, setDataFine] = useState("");
  const [importo, setImporto] = useState("");
  const [note, setNote] = useState("");
  const [stato, setStato] = useState<OrganigrammaContrattoStato>("proposto");
  const [tacitoRinnovo, setTacitoRinnovo] = useState(false);
  const [picked, setPicked] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const indeterminato = tipologia === "tempo_indeterminato";
  const alerts = items
    .map((c) => {
      const livello = contrattoAlertLivello(c.dataFine, c.documentoStato);
      return livello ? { id: c.id, titolo: c.titolo, livello, dataFine: c.dataFine } : null;
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  async function load() {
    const res = await listPersonaContrattiAction(personaId);
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

  async function save() {
    if (!titolo.trim()) {
      setError("Indica il titolo, controlla i dati e premi Salva.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInizio)) {
      setError("Indica la data di inizio, poi premi Salva.");
      return;
    }
    if (!picked) {
      setError("Allega il contratto, controlla i dati e premi Salva.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("personaId", personaId);
      fd.set("tipologia", tipologia);
      fd.set("titolo", titolo);
      fd.set("dataInizio", dataInizio);
      fd.set("dataFine", indeterminato ? "" : dataFine);
      fd.set("importo", importo);
      fd.set("note", note);
      fd.set("documentoStato", stato);
      fd.set("tacitoRinnovo", tacitoRinnovo ? "1" : "0");
      fd.set("file", picked);
      const res = await uploadPersonaContrattoAction(fd);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setPicked(null);
      setTitolo("");
      setDataInizio("");
      setDataFine("");
      setImporto("");
      setNote("");
      setStato("proposto");
      setTacitoRinnovo(false);
      await load();
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Salvataggio contratto non riuscito. Riprova."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h3 className="text-sm font-semibold">Contratti</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Ogni contratto è collegato a questa scheda operatore: collaborazione,
        ingaggio, tempo determinato o indeterminato, stage. Compila, allega il
        file e premi Salva dopo il controllo: nulla viene registrato in
        automatico. Iter: Proposto, poi Accettato o Respinto; se Accettato
        la validità è In essere o Scaduto. Tacito rinnovo: clicca in elenco
        per generare le copie fino a oggi (restano Proposte).
      </p>
      {alerts.length ? (
        <ul className="mt-2 space-y-1">
          {alerts.map((al) => (
            <li
              key={al.id}
              className={`rounded-md border px-3 py-2 text-sm ${
                al.livello === "scaduto"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-amber-200 bg-amber-50 text-amber-950"
              }`}
            >
              {al.titolo} · {contrattoAlertLabel(al.livello)}
              {al.dataFine
                ? ` · ${new Date(`${al.dataFine}T00:00:00`).toLocaleDateString("it-IT")}`
                : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {isAdmin ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-[var(--muted)]">
            Tipologia
            <select
              value={tipologia}
              onChange={(e) => {
                const next = e.target.value as OrganigrammaContrattoTipo;
                setTipologia(next);
                if (next === "tempo_indeterminato") setDataFine("");
              }}
              className={inputCls}
            >
              {ORGANIGRAMMA_CONTRATTO_TIPI.map((t) => (
                <option key={t} value={t}>
                  {contrattoTipoLabel(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[var(--muted)] sm:col-span-2">
            Titolo / oggetto
            <input
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              className={inputCls}
              placeholder="Es. Contratto di collaborazione 2026"
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Data inizio
            <input
              type="date"
              value={dataInizio}
              onChange={(e) => setDataInizio(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Data fine
            <input
              type="date"
              value={dataFine}
              disabled={indeterminato}
              onChange={(e) => setDataFine(e.target.value)}
              className={`${inputCls} ${indeterminato ? "bg-slate-50" : ""}`}
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Importo (facoltativo)
            <input
              inputMode="decimal"
              value={importo}
              onChange={(e) => setImporto(e.target.value)}
              className={inputCls}
              placeholder="0,00"
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Stato
            <select
              value={stato}
              onChange={(e) =>
                setStato(e.target.value as OrganigrammaContrattoStato)
              }
              className={inputCls}
            >
              {ORGANIGRAMMA_CONTRATTO_STATI.map((s) => (
                <option key={s} value={s}>
                  {s === "accettato"
                    ? "Accettato"
                    : s === "respinto"
                      ? "Respinto"
                      : "Proposto"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)] sm:col-span-2">
            <input
              type="checkbox"
              checked={tacitoRinnovo}
              disabled={indeterminato}
              onChange={(e) => setTacitoRinnovo(e.target.checked)}
            />
            Tacito rinnovo (poi applica le copie dall’elenco)
          </label>
          <label className="text-xs text-[var(--muted)] sm:col-span-2">
            Note
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputCls}
            />
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <FileDropZone
              file={picked}
              busy={busy}
              title="Allegato contratto"
              hint="PDF o immagine. Premi Salva dopo il controllo."
              onFile={(f) => {
                setError(null);
                setPicked(f);
              }}
              onInvalid={setError}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <SalvaSezioneButton
              busy={busy}
              onClick={() => void save()}
            />
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <ContrattoElenco
        items={items}
        isAdmin={isAdmin}
        onError={setError}
        onStato={
          isAdmin
            ? async (id, next) => {
                const res = await setContrattoStatoAction(id, next);
                if (!res.success) setError(res.error);
                else await load();
              }
            : undefined
        }
        onRemove={
          isAdmin
            ? async (id) => {
                const res = await softDeleteContrattoAction(id);
                if (!res.success) setError(res.error);
                else await load();
              }
            : undefined
        }
        onTacitoRinnovo={
          isAdmin
            ? async (id) => {
                const res = await applicaTacitoRinnovoAction(id);
                if (!res.success) setError(res.error);
                else await load();
              }
            : undefined
        }
      />
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
            Salva
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
            Salva
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
  const [linkedLogin, setLinkedLogin] = useState(true);

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
    setLinkedLogin(res.linkedLogin);
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
            Entrate e uscite di lavorazione, processi, aree, eventi di linea e
            assenze. Non include foto, certificati o modifiche anagrafiche.
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
            {OPERATIVE_AZIONI.map((a) => (
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
                if (r.success) {
                  setItems(r.items);
                  setLinkedLogin(r.linkedLogin);
                }
              });
            }}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            Reset
          </button>
        </div>
      </form>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      {!linkedLogin ? (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Operatore senza login collegato: si vedono le assenze. Per lavorazioni,
          aree ed eventi di linea collega un profilo di accesso.
        </p>
      ) : null}
      {items.length === 0 && !loading ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Nessuna attività operativa per i filtri selezionati.
        </p>
      ) : vista === "elenco" ? (
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {items.map((row) => (
            <li key={row.id} className="py-2 text-sm">
              <span className="font-semibold">{attivitaPersonaLabel(row.azione)}</span>
              {row.areaNome ? ` · ${row.areaNome}` : ""}
              {row.riferimento ? ` · ${row.riferimento}` : ""}
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
              <p className="text-xs text-slate-700">
                {[row.areaNome, row.riferimento].filter(Boolean).join(" · ") ||
                  "—"}
              </p>
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
