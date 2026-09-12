"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FaMagnifyingGlass, FaPlus, FaTrash } from "react-icons/fa6";
import { listPersoneMinimeAction } from "@/app/actions/organigramma";
import {
  anteprimaAutistaIngressoAction,
  anteprimaFornitoreRapidoIngressoAction,
  anteprimaMezzoIngressoAction,
  attachDdtFoglioAction,
  attachMezzoFotoAction,
  chiudiFoglioIngressoMpAction,
  createAutistaIngressoAction,
  createFornitoreRapidoIngressoAction,
  createMezzoIngressoAction,
  generaLottoIngressoMpAction,
  getFoglioIngressoMpAction,
  listAutistiIngressoAction,
  listConfezionamentiMpAction,
  listFornitoriIngressoAction,
  listMateriePrimeIngressoAction,
  listMezziIngressoAction,
  provaFoglioIngressoMpAction,
  saveFoglioIngressoMpAction,
  signedIngressoMpUrlAction,
} from "@/app/actions/produzione-ingresso-mp";
import { IngressoMpFotoPicker } from "@/components/produzione/IngressoMpFotoPicker";
import { IngressoMpLottoPrintModal } from "@/components/produzione/IngressoMpLottoPrintModal";
import { labelFornitoreTipologia } from "@/lib/amministrazione/catalogo-offerta";
import {
  FOGLIO_INGRESSO_TEST_KEY,
  MEZZO_FOTO_KINDS,
  MEZZO_FOTO_LABEL,
  labelStatoIngresso,
  type ConfezionamentoMp,
  type FoglioIngressoMp,
  type MezzoFotoKind,
  type MezzoIngresso,
  type QuantitaTipoIngresso,
} from "@/lib/produzione/fogli-ingresso-mp";
import type { FornitoreTipologia } from "@/types/database";

type FornitoreFiltro = "" | "servizio" | "prodotto" | "materia_prima";

const FORNITORE_FILTRI: Array<{ value: FornitoreFiltro; label: string }> = [
  { value: "", label: "Tutti" },
  { value: "servizio", label: "Servizi" },
  { value: "prodotto", label: "Prodotti" },
  { value: "materia_prima", label: "Materia prima" },
];

type FornitoreOpt = {
  id: string;
  label: string;
  targa: string;
  isBio: boolean;
  tipologie: FornitoreTipologia[];
};

type Props = {
  foglioId?: string;
};

function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoToLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return nowLocal();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function FoglioIngressoMpForm({ foglioId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(Boolean(foglioId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<FoglioIngressoMp | null>(null);

  const [fornitori, setFornitori] = useState<FornitoreOpt[]>([]);
  const [materie, setMaterie] = useState<Array<{ id: string; label: string; isBio: boolean }>>([]);
  const [catalogo, setCatalogo] = useState<ConfezionamentoMp[]>([]);
  const [mezzi, setMezzi] = useState<MezzoIngresso[]>([]);
  const [autisti, setAutisti] = useState<Array<{ id: string; label: string }>>([]);
  const [operatori, setOperatori] = useState<Array<{ id: string; nome: string; cognome: string }>>([]);

  const [fornitoreFiltro, setFornitoreFiltro] =
    useState<FornitoreFiltro>("materia_prima");
  const [fornitoreSearchOpen, setFornitoreSearchOpen] = useState(false);
  const [fornitoreQuery, setFornitoreQuery] = useState("");
  const fornitoreSearchRef = useRef<HTMLInputElement>(null);
  const [fornitoreId, setFornitoreId] = useState("");
  const [materiaPrimaId, setMateriaPrimaId] = useState("");
  const [isBio, setIsBio] = useState(false);
  const [quantita, setQuantita] = useState("");
  const [quantitaTipo, setQuantitaTipo] = useState<QuantitaTipoIngresso>("stimato");
  const [ddtProduttore, setDdtProduttore] = useState("");
  const [ddtFilePath, setDdtFilePath] = useState<string | null>(null);
  const [ddtFileName, setDdtFileName] = useState<string | null>(null);
  const [ddtPreview, setDdtPreview] = useState<string | null>(null);
  const [arrivatoAt, setArrivatoAt] = useState(nowLocal());
  const [mezzoId, setMezzoId] = useState("");
  const [autistaId, setAutistaId] = useState("");
  const [scaricoMezzo, setScaricoMezzo] = useState("muletto");
  const [operatoreId, setOperatoreId] = useState("");
  const [note, setNote] = useState("");
  const [righe, setRighe] = useState<
    Array<{ confezionamentoId: string; quantitaConfezioni: string }>
  >([{ confezionamentoId: "", quantitaConfezioni: "" }]);

  const [nuovoForn, setNuovoForn] = useState(false);
  const [fornNome, setFornNome] = useState("");
  const [fornPiva, setFornPiva] = useState("");
  const [nuovoMezzo, setNuovoMezzo] = useState(false);
  const [mezzoTarga, setMezzoTarga] = useState("");
  const [mezzoAzienda, setMezzoAzienda] = useState("");
  const [nuovoAutista, setNuovoAutista] = useState(false);
  const [autNome, setAutNome] = useState("");
  const [autCognome, setAutCognome] = useState("");
  const [autTel, setAutTel] = useState("");
  const [printOpen, setPrintOpen] = useState(false);
  const [uploadOwner] = useState(() => crypto.randomUUID());
  const [testMode, setTestMode] = useState(false);
  const [testNotice, setTestNotice] = useState<string | null>(null);
  const [testLotto, setTestLotto] = useState<string | null>(null);
  const [fornitoriLocali, setFornitoriLocali] = useState<Set<string>>(
    () => new Set()
  );
  const [mezziLocali, setMezziLocali] = useState<Set<string>>(() => new Set());
  const [autistiLocali, setAutistiLocali] = useState<Set<string>>(
    () => new Set()
  );

  const fornitore = fornitori.find((f) => f.id === fornitoreId);
  const locked = item?.documentoStato === "chiuso";
  const fornitoriVisibili = useMemo(() => {
    const q = fornitoreQuery.trim().toLowerCase();
    return fornitori.filter((f) => {
      if (fornitoreFiltro && !f.tipologie.includes(fornitoreFiltro)) {
        return false;
      }
      if (!q) return true;
      return (
        f.label.toLowerCase().includes(q) || f.targa.toLowerCase().includes(q)
      );
    });
  }, [fornitori, fornitoreFiltro, fornitoreQuery]);
  const fornitoriSelect = useMemo(() => {
    if (fornitore && !fornitoriVisibili.some((f) => f.id === fornitore.id)) {
      return [fornitore, ...fornitoriVisibili];
    }
    return fornitoriVisibili;
  }, [fornitore, fornitoriVisibili]);

  useEffect(() => {
    try {
      setTestMode(sessionStorage.getItem(FOGLIO_INGRESSO_TEST_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  function toggleTestMode() {
    const next = !testMode;
    setTestMode(next);
    try {
      if (next) sessionStorage.setItem(FOGLIO_INGRESSO_TEST_KEY, "1");
      else sessionStorage.removeItem(FOGLIO_INGRESSO_TEST_KEY);
    } catch {
      /* ignore */
    }
    if (next) return;
    setTestNotice(null);
    setTestLotto(null);
    if (ddtFilePath?.startsWith("test://")) {
      setDdtFilePath(null);
      setDdtFileName(null);
      if (ddtPreview?.startsWith("blob:")) URL.revokeObjectURL(ddtPreview);
      setDdtPreview(null);
    }
    setFornitori((cur) => cur.filter((f) => !fornitoriLocali.has(f.id)));
    setMezzi((cur) => cur.filter((m) => !mezziLocali.has(m.id)));
    setAutisti((cur) => cur.filter((a) => !autistiLocali.has(a.id)));
    if (fornitoreId && fornitoriLocali.has(fornitoreId)) {
      setFornitoreId("");
      setAutistaId("");
    }
    if (mezzoId && mezziLocali.has(mezzoId)) setMezzoId("");
    if (autistaId && autistiLocali.has(autistaId)) setAutistaId("");
    setFornitoriLocali(new Set());
    setMezziLocali(new Set());
    setAutistiLocali(new Set());
  }

  useEffect(() => {
    void Promise.all([
      listFornitoriIngressoAction(),
      listMateriePrimeIngressoAction(),
      listConfezionamentiMpAction(),
      listMezziIngressoAction(),
      listPersoneMinimeAction(),
    ]).then(([f, m, c, z, p]) => {
      if (f.success) setFornitori(f.items);
      if (m.success) setMaterie(m.items);
      if (c.success) setCatalogo(c.items);
      if (z.success) setMezzi(z.items);
      if (p.success) setOperatori(p.items);
    });
  }, []);

  useEffect(() => {
    if (!foglioId) return;
    setLoading(true);
    void getFoglioIngressoMpAction(foglioId).then((res) => {
      setLoading(false);
      if (!res.success) {
        setError(res.error);
        return;
      }
      applyItem(res.item);
    });
  }, [foglioId]);

  useEffect(() => {
    if (!fornitoreId) {
      setAutisti([]);
      return;
    }
    void listAutistiIngressoAction(fornitoreId).then((res) => {
      if (res.success) setAutisti(res.items);
    });
  }, [fornitoreId]);

  function applyItem(next: FoglioIngressoMp) {
    setItem(next);
    setFornitoreId(next.fornitoreId);
    setMateriaPrimaId(next.materiaPrimaId);
    setIsBio(next.isBio);
    setQuantita(String(next.quantita));
    setQuantitaTipo(next.quantitaTipo);
    setDdtProduttore(next.ddtProduttore);
    setDdtFilePath(next.ddtFilePath);
    setDdtFileName(next.ddtFileName);
    setArrivatoAt(isoToLocal(next.arrivatoAt));
    setMezzoId(next.mezzoId ?? "");
    setAutistaId(next.autistaContattoId ?? "");
    setScaricoMezzo(next.scaricoMezzo || "muletto");
    setOperatoreId(next.operatoreMulettoId ?? "");
    setNote(next.note);
    setRighe(
      next.confezioni.length
        ? next.confezioni.map((r) => ({
            confezionamentoId: r.confezionamentoId,
            quantitaConfezioni: String(r.quantitaConfezioni),
          }))
        : [{ confezionamentoId: "", quantitaConfezioni: "" }]
    );
    if (next.ddtFilePath) {
      void signedIngressoMpUrlAction(next.ddtFilePath).then((u) => {
        if (u.success) setDdtPreview(u.url);
      });
    }
  }

  const payload = useMemo(
    () => ({
      id: item?.id,
      fornitoreId,
      materiaPrimaId,
      isBio,
      quantita: Number(quantita.replace(",", ".")),
      quantitaUnita: "kg",
      quantitaTipo,
      ddtProduttore,
      ddtFilePath,
      ddtFileName,
      arrivatoAt,
      mezzoId: mezzoId || null,
      autistaContattoId: autistaId || null,
      scaricoMezzo,
      operatoreMulettoId: operatoreId || null,
      note,
      confezioni: righe
        .filter((r) => r.confezionamentoId && Number(r.quantitaConfezioni) > 0)
        .map((r) => ({
          confezionamentoId: r.confezionamentoId,
          quantitaConfezioni: Number(r.quantitaConfezioni),
        })),
    }),
    [
      item?.id,
      fornitoreId,
      materiaPrimaId,
      isBio,
      quantita,
      quantitaTipo,
      ddtProduttore,
      ddtFilePath,
      ddtFileName,
      arrivatoAt,
      mezzoId,
      autistaId,
      scaricoMezzo,
      operatoreId,
      note,
      righe,
    ]
  );

  function provaInput(extra: { generaLotto?: boolean; chiudi?: boolean }) {
    const locale = fornitore && fornitoriLocali.has(fornitore.id);
    return {
      foglio: payload,
      ...extra,
      fornitoreLocale: locale
        ? { isBio: fornitore.isBio, label: fornitore.label }
        : undefined,
    };
  }

  async function salva(): Promise<FoglioIngressoMp | null> {
    setBusy(true);
    setError(null);
    setTestNotice(null);
    if (testMode) {
      const res = await provaFoglioIngressoMpAction(provaInput({}));
      setBusy(false);
      if (!res.success) {
        setError(res.error);
        return null;
      }
      setTestNotice(`${res.messaggio} Salvataggio non eseguito.`);
      return null;
    }
    const res = await saveFoglioIngressoMpAction(payload);
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return null;
    }
    applyItem(res.item);
    if (!foglioId) {
      router.replace(`/app/produzione/foglio-ingresso-mp/nuovo?id=${res.item.id}`);
    }
    return res.item;
  }

  async function genera() {
    setError(null);
    setTestNotice(null);
    if (testMode) {
      setBusy(true);
      const res = await provaFoglioIngressoMpAction(
        provaInput({ generaLotto: true })
      );
      setBusy(false);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setTestLotto(res.lottoCodice);
      setTestNotice(`${res.messaggio} Salvataggio non eseguito.`);
      if (res.lottoCodice) setPrintOpen(true);
      return;
    }
    const saved = await salva();
    if (!saved) return;
    setBusy(true);
    const res = await generaLottoIngressoMpAction(saved.id);
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    applyItem(res.item);
    setPrintOpen(true);
  }

  async function chiudi() {
    if (testMode) {
      setBusy(true);
      setError(null);
      const res = await provaFoglioIngressoMpAction(provaInput({ chiudi: true }));
      setBusy(false);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setTestNotice(`${res.messaggio} Salvataggio non eseguito.`);
      return;
    }
    if (!item) return;
    setBusy(true);
    const res = await chiudiFoglioIngressoMpAction(item.id);
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    const fresh = await getFoglioIngressoMpAction(item.id);
    if (fresh.success) applyItem(fresh.item);
    router.push("/app/produzione/foglio-ingresso-mp/storico");
  }

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Caricamento foglio…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          {testMode
            ? "Controlli identici al reale: il salvataggio su questa pagina è bloccato."
            : "Compila il foglio e genera il codice lotto MP."}
        </p>
        <button
          type="button"
          aria-pressed={testMode}
          onClick={toggleTestMode}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            testMode
              ? "bg-amber-500 text-white"
              : "border border-[var(--border)] bg-white text-slate-700"
          }`}
        >
          Modalità test {testMode ? "accesa" : "spenta"}
        </button>
      </div>
      {testMode ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Modalità test di questa pagina: validazioni, anteprima lotto e
          allegati restano locali. Nessuna scrittura su database, storage o
          registro audit.
        </p>
      ) : null}
      {testNotice ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {testNotice}
        </p>
      ) : null}
      {item ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm">
          <span className="font-medium">{item.codice}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold">
            {labelStatoIngresso(item.documentoStato)} · v{item.versione}
          </span>
          {item.lottoCodice ? (
            <span className="font-mono text-sm">{item.lottoCodice}</span>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold">1. Fornitore</h3>
          <button
            type="button"
            disabled={locked}
            aria-pressed={fornitoreSearchOpen}
            aria-label="Cerca ragione sociale o targa"
            onClick={() => {
              setFornitoreSearchOpen((v) => {
                const next = !v;
                if (next) {
                  window.setTimeout(() => fornitoreSearchRef.current?.focus(), 0);
                }
                return next;
              });
            }}
            className={`rounded-lg p-2 ${
              fornitoreSearchOpen
                ? "bg-[var(--primary)] text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <FaMagnifyingGlass size={14} />
          </button>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Screma per tipologia
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FORNITORE_FILTRI.map((f) => (
              <button
                key={f.value || "tutti"}
                type="button"
                disabled={locked}
                onClick={() => setFornitoreFiltro(f.value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 ${
                  fornitoreFiltro === f.value
                    ? "bg-[var(--primary)] text-white ring-[var(--primary)]"
                    : "bg-white text-slate-700 ring-[var(--border)] hover:bg-slate-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {fornitoreSearchOpen ? (
          <input
            ref={fornitoreSearchRef}
            disabled={locked}
            value={fornitoreQuery}
            onChange={(e) => setFornitoreQuery(e.target.value)}
            placeholder="Cerca ragione sociale o targa…"
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        ) : null}
        <select
          disabled={locked}
          value={fornitoreId}
          onChange={(e) => {
            setFornitoreId(e.target.value);
            setAutistaId("");
            const f = fornitori.find((x) => x.id === e.target.value);
            if (f && !f.isBio) setIsBio(false);
          }}
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
        >
          <option value="">
            Seleziona fornitore… ({fornitoriVisibili.length})
          </option>
          {fornitoriSelect.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
              {f.tipologie.length
                ? ` · ${f.tipologie.map(labelFornitoreTipologia).join(", ")}`
                : " · senza tipologia"}
            </option>
          ))}
        </select>
        {!locked ? (
          <button
            type="button"
            onClick={() => setNuovoForn((v) => !v)}
            className="text-sm text-[var(--primary)] underline"
          >
            {nuovoForn ? "Nascondi nuovo fornitore" : "+ Crea nuovo fornitore"}
          </button>
        ) : null}
        {nuovoForn && !locked ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={fornNome}
              onChange={(e) => setFornNome(e.target.value)}
              placeholder="Ragione sociale"
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <input
              value={fornPiva}
              onChange={(e) => setFornPiva(e.target.value)}
              placeholder="Partita IVA"
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const tipologieCreate: FornitoreTipologia[] = fornitoreFiltro
                  ? [fornitoreFiltro]
                  : ["materia_prima"];
                const body = {
                  ragioneSociale: fornNome,
                  partitaIva: fornPiva,
                  tipologie: tipologieCreate,
                };
                const res = testMode
                  ? await anteprimaFornitoreRapidoIngressoAction(body)
                  : await createFornitoreRapidoIngressoAction(body);
                setBusy(false);
                if (!res.success) {
                  setError(res.error);
                  return;
                }
                if (testMode) {
                  setFornitoriLocali((cur) => new Set(cur).add(res.id));
                  setTestNotice(
                    `Fornitore ${res.label} valido. Non salvato in anagrafica.`
                  );
                }
                setFornitori((cur) => [
                  ...cur,
                  {
                    id: res.id,
                    label: res.label,
                    targa: res.targa,
                    isBio: false,
                    tipologie: res.tipologie,
                  },
                ]);
                setFornitoreId(res.id);
                setNuovoForn(false);
                setFornNome("");
                setFornPiva("");
              }}
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white"
            >
              Salva fornitore
            </button>
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold">2. Tipo materiale</h3>
        <select
          disabled={locked}
          value={materiaPrimaId}
          onChange={(e) => {
            const id = e.target.value;
            setMateriaPrimaId(id);
            const m = materie.find((x) => x.id === id);
            if (m?.isBio && fornitore?.isBio) setIsBio(true);
          }}
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
        >
          <option value="">Seleziona materia prima…</option>
          {materie.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
              {m.isBio ? " (bio)" : ""}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            disabled={locked || !fornitore?.isBio}
            checked={isBio}
            onChange={(e) => setIsBio(e.target.checked)}
          />
          Materiale bio
          {!fornitore?.isBio ? (
            <span className="text-xs text-[var(--muted)]">
              (serve certificato bio sul fornitore)
            </span>
          ) : null}
        </label>
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold">3. Quantità</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Kg</span>
            <input
              disabled={locked}
              value={quantita}
              onChange={(e) => setQuantita(e.target.value)}
              inputMode="decimal"
              className="w-40 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <fieldset className="flex gap-4 text-sm">
            {(["reale", "stimato"] as const).map((t) => (
              <label key={t} className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  disabled={locked}
                  checked={quantitaTipo === t}
                  onChange={() => setQuantitaTipo(t)}
                />
                {t === "reale" ? "Reale" : "Stimato"}
              </label>
            ))}
          </fieldset>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold">4. DDT produttore</h3>
        <input
          disabled={locked}
          value={ddtProduttore}
          onChange={(e) => setDdtProduttore(e.target.value)}
          placeholder="Numero o riferimento DDT"
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
        {!locked ? (
          <IngressoMpFotoPicker
            kind="ddt"
            ownerId={item?.id ?? uploadOwner}
            acceptPdf
            testMode={testMode}
            previewUrl={ddtPreview}
            onUploaded={(path, fileName, url) => {
              setDdtFilePath(path);
              setDdtFileName(fileName);
              setDdtPreview(url);
              if (item?.id && !testMode) {
                void attachDdtFoglioAction({
                  foglioId: item.id,
                  path,
                  fileName,
                });
              }
            }}
          />
        ) : ddtPreview ? (
          <a
            href={ddtPreview}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-[var(--primary)] underline"
          >
            Apri allegato DDT
          </a>
        ) : null}
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold">5–7. Confezionamento</h3>
        {righe.map((r, i) => {
          const cat = catalogo.find((c) => c.id === r.confezionamentoId);
          return (
            <div
              key={i}
              className="grid gap-2 rounded-lg border border-dashed border-[var(--border)] p-3 sm:grid-cols-[1fr_10rem_auto]"
            >
              <label className="text-sm">
                <span className="mb-1 block font-medium">Confezionamento</span>
                <select
                  disabled={locked}
                  value={r.confezionamentoId}
                  onChange={(e) =>
                    setRighe((cur) =>
                      cur.map((x, idx) =>
                        idx === i
                          ? { ...x, confezionamentoId: e.target.value }
                          : x
                      )
                    )
                  }
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <option value="">Seleziona…</option>
                  {catalogo.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                      {c.mediaPesoKg != null
                        ? ` · media ${c.mediaPesoKg} kg`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">
                  {cat?.labelNumero ?? "Numero confezioni"}
                </span>
                <input
                  disabled={locked}
                  value={r.quantitaConfezioni}
                  onChange={(e) =>
                    setRighe((cur) =>
                      cur.map((x, idx) =>
                        idx === i
                          ? { ...x, quantitaConfezioni: e.target.value }
                          : x
                      )
                    )
                  }
                  inputMode="numeric"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </label>
              {!locked && righe.length > 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setRighe((cur) => cur.filter((_, idx) => idx !== i))
                  }
                  className="self-end rounded-lg border border-[var(--border)] px-3 py-2 text-slate-600"
                  aria-label="Rimuovi riga"
                >
                  <FaTrash size={12} />
                </button>
              ) : null}
            </div>
          );
        })}
        {!locked ? (
          <button
            type="button"
            onClick={() =>
              setRighe((cur) => [
                ...cur,
                { confezionamentoId: "", quantitaConfezioni: "" },
              ])
            }
            className="inline-flex items-center gap-2 text-sm text-[var(--primary)]"
          >
            <FaPlus size={12} />
            aggiungi campo
          </button>
        ) : null}
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold">8. Data e ora arrivo</h3>
        <input
          type="datetime-local"
          disabled={locked}
          value={arrivatoAt}
          onChange={(e) => setArrivatoAt(e.target.value)}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold">9. Mezzo</h3>
        <select
          disabled={locked}
          value={mezzoId}
          onChange={(e) => setMezzoId(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
        >
          <option value="">Seleziona mezzo…</option>
          {mezzi.map((m) => (
            <option key={m.id} value={m.id}>
              {m.targa}
              {m.aziendaNome ? ` — ${m.aziendaNome}` : ""}
            </option>
          ))}
        </select>
        {!locked ? (
          <button
            type="button"
            onClick={() => setNuovoMezzo((v) => !v)}
            className="text-sm text-[var(--primary)] underline"
          >
            {nuovoMezzo ? "Nascondi nuovo mezzo" : "+ Nuovo mezzo"}
          </button>
        ) : null}
        {nuovoMezzo && !locked ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={mezzoTarga}
              onChange={(e) => setMezzoTarga(e.target.value)}
              placeholder="Targa"
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm uppercase"
            />
            <input
              value={mezzoAzienda}
              onChange={(e) => setMezzoAzienda(e.target.value)}
              placeholder="Azienda (o nuova ragione sociale)"
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const body = {
                  targa: mezzoTarga,
                  fornitoreId: fornitoreId || null,
                  aziendaNome: mezzoAzienda || fornitore?.label || "",
                };
                const res = testMode
                  ? await anteprimaMezzoIngressoAction(body)
                  : await createMezzoIngressoAction(body);
                setBusy(false);
                if (!res.success) {
                  setError(res.error);
                  return;
                }
                if (testMode) {
                  setMezziLocali((cur) => new Set(cur).add(res.item.id));
                  setTestNotice(
                    `Mezzo ${res.item.targa} valido. Non salvato in anagrafica.`
                  );
                }
                setMezzi((cur) => [...cur, res.item]);
                setMezzoId(res.item.id);
                setNuovoMezzo(false);
                setMezzoTarga("");
                setMezzoAzienda("");
              }}
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white"
            >
              Salva mezzo
            </button>
          </div>
        ) : null}
        {mezzoId
          ? MEZZO_FOTO_KINDS.map((kind: MezzoFotoKind) => (
              <div key={kind} className="rounded-lg bg-slate-50 p-3">
                <p className="mb-2 text-sm font-medium">{MEZZO_FOTO_LABEL[kind]}</p>
                {!locked ? (
                  <IngressoMpFotoPicker
                    kind={`mezzo_${kind}`}
                    ownerId={mezzoId}
                    testMode={testMode}
                    onUploaded={(path, fileName) => {
                      if (testMode) return;
                      void attachMezzoFotoAction({
                        mezzoId,
                        kind,
                        path,
                        fileName,
                      });
                    }}
                  />
                ) : null}
              </div>
            ))
          : null}
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold">10. Autista</h3>
        <select
          disabled={locked || !fornitoreId}
          value={autistaId}
          onChange={(e) => setAutistaId(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
        >
          <option value="">
            {fornitoreId ? "Seleziona dalla rubrica…" : "Prima il fornitore"}
          </option>
          {autisti.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        {!locked && fornitoreId ? (
          <button
            type="button"
            onClick={() => setNuovoAutista((v) => !v)}
            className="text-sm text-[var(--primary)] underline"
          >
            {nuovoAutista ? "Nascondi nuovo autista" : "+ Nuovo autista"}
          </button>
        ) : null}
        {nuovoAutista && !locked ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              value={autNome}
              onChange={(e) => setAutNome(e.target.value)}
              placeholder="Nome"
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <input
              value={autCognome}
              onChange={(e) => setAutCognome(e.target.value)}
              placeholder="Cognome"
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <input
              value={autTel}
              onChange={(e) => setAutTel(e.target.value)}
              placeholder="Telefono (opzionale)"
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (!fornitore) return;
                setBusy(true);
                const body = {
                  nome: autNome,
                  cognome: autCognome,
                  telefono: autTel,
                  fornitoreId,
                  fornitoreLabel: fornitore.label,
                };
                const res = testMode
                  ? await anteprimaAutistaIngressoAction(body)
                  : await createAutistaIngressoAction(body);
                setBusy(false);
                if (!res.success) {
                  setError(res.error);
                  return;
                }
                if (testMode) {
                  setAutistiLocali((cur) => new Set(cur).add(res.id));
                  setTestNotice(
                    `Autista ${res.label} valido. Non salvato in rubrica.`
                  );
                }
                setAutisti((cur) => [...cur, { id: res.id, label: res.label }]);
                setAutistaId(res.id);
                setNuovoAutista(false);
                setAutNome("");
                setAutCognome("");
                setAutTel("");
              }}
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white"
            >
              Salva autista
            </button>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-semibold">11. Scaricato a mezzo</span>
          <input
            disabled={locked}
            value={scaricoMezzo}
            onChange={(e) => setScaricoMezzo(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold">12. Operatore muletto</span>
          <select
            disabled={locked}
            value={operatoreId}
            onChange={(e) => setOperatoreId(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
          >
            <option value="">Seleziona dall’organigramma…</option>
            {operatori.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome} {o.cognome}
              </option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-2 text-sm">
          <span className="mb-1 block font-medium">Note</span>
          <textarea
            disabled={locked}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>
      </section>

      <div className="flex flex-wrap gap-2">
        {!locked ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void salva()}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
          >
            Salva bozza
          </button>
        ) : null}
        {!locked ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void genera()}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
          >
            13. Genera codice lotto
          </button>
        ) : null}
        {item?.lottoCodice || testLotto ? (
          <button
            type="button"
            onClick={() => setPrintOpen(true)}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white"
          >
            Stampa etichetta
          </button>
        ) : null}
        {item?.documentoStato === "registrato" || (testMode && testLotto) ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void chiudi()}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
          >
            Chiudi foglio
          </button>
        ) : null}
      </div>

      {printOpen && (testLotto || item?.lottoCodice) ? (
        <IngressoMpLottoPrintModal
          lotto={(testLotto || item?.lottoCodice) as string}
          arrivatoAt={
            item?.arrivatoAt ?? new Date(arrivatoAt).toISOString()
          }
          onClose={() => setPrintOpen(false)}
        />
      ) : null}
    </div>
  );
}
