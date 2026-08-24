"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import {
  suggestCodiciRigaDropdownAction,
  type CollegaCatalogoHit,
} from "@/app/actions/catalogo-collega";
import { DROPDOWN_MATCH_THRESHOLD_PCT } from "@/lib/amministrazione/catalogo-collega";

type Props = {
  descrizione: string;
  codice: string;
  fornitoreId: string | null;
  sameInvoiceCodici: string[];
  onSelectCodice: (codice: string) => void;
  onCerca: () => void;
  /** Durante lo scan auto-link: evita risultati fuorvianti. */
  cercaDisabled?: boolean;
};

const KIND_GROUP: Record<CollegaCatalogoHit["catalogoKind"], string> = {
  servizio: "Servizi (≥70%)",
  prodotto: "Prodotti (≥70%)",
  materia: "Materie prime (≥70%)",
  contributo: "Contributi (≥70%)",
};

type MenuBox = { top: number; left: number; width: number; maxHeight: number };

/**
 * Dropdown lazy: nessuna RPC all’apertura fattura.
 * Menu in portal (fixed + z alto) così non viene tagliato da overflow della tabella.
 */
export function CodiceRigaAcquistoSelect({
  descrizione,
  codice,
  fornitoreId,
  sameInvoiceCodici,
  onSelectCodice,
  onCerca,
  cercaDisabled = false,
}: Props) {
  const [hits, setHits] = useState<CollegaCatalogoHit[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<MenuBox | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const sameKey = useMemo(
    () => sameInvoiceCodici.join("|"),
    [sameInvoiceCodici]
  );

  function loadSuggestions() {
    const codes = sameKey.split("|").filter(Boolean);
    startTransition(async () => {
      const res = await suggestCodiciRigaDropdownAction({
        descrizione,
        fornitoreId,
        sameInvoiceCodici: codes,
        codiceCorrente: codice,
      });
      if (!res.success) {
        setError(res.error);
        setHits([]);
        setLoaded(true);
        return;
      }
      setError(null);
      setHits(res.hits);
      setLoaded(true);
    });
  }

  function measureBox() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
    const maxHeight = Math.min(224, Math.max(120, preferBelow ? spaceBelow : spaceAbove));
    const top = preferBelow
      ? r.bottom + 4
      : Math.max(8, r.top - 4 - maxHeight);
    setBox({
      top,
      left: r.left,
      width: Math.max(r.width, 176),
      maxHeight,
    });
  }

  function openMenu() {
    setOpen(true);
    measureBox();
    if (!loaded && !pending) loadSuggestions();
  }

  useLayoutEffect(() => {
    if (!open) return;
    measureBox();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onReposition() {
      measureBox();
    }
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const orphan =
    codice &&
    codice !== "—" &&
    loaded &&
    !hits.some((h) => h.codice === codice);

  const grouped = useMemo(() => {
    const g: Record<CollegaCatalogoHit["catalogoKind"], CollegaCatalogoHit[]> = {
      servizio: [],
      prodotto: [],
      materia: [],
      contributo: [],
    };
    for (const h of hits) g[h.catalogoKind].push(h);
    return g;
  }, [hits]);

  const menu =
    open && box && typeof document !== "undefined"
      ? createPortal(
          <>
            <button
              type="button"
              aria-label="Chiudi"
              className="fixed inset-0 z-[130] cursor-default"
              onClick={() => setOpen(false)}
            />
            <div
              className="fixed z-[140] overflow-y-auto rounded-lg border border-[var(--border)] bg-white p-2 shadow-xl"
              style={{
                top: box.top,
                left: box.left,
                width: box.width,
                maxHeight: box.maxHeight,
              }}
              role="listbox"
            >
              {pending ? (
                <p className="px-1 py-2 text-xs text-[var(--muted)]">Ricerca…</p>
              ) : null}
              {error ? (
                <p className="px-1 py-1 text-xs text-red-700">{error}</p>
              ) : null}
              {!pending && loaded && hits.length === 0 ? (
                <p className="px-1 py-2 text-xs text-[var(--muted)]">
                  Nessun match ≥{DROPDOWN_MATCH_THRESHOLD_PCT}%. Usa Cerca.
                </p>
              ) : null}
              {(
                ["servizio", "prodotto", "materia", "contributo"] as const
              ).map((k) =>
                grouped[k].length === 0 ? null : (
                  <div key={k} className="mb-2">
                    <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                      {KIND_GROUP[k]}
                    </p>
                    <ul>
                      {grouped[k].map((h) => (
                        <li key={`${h.catalogoKind}:${h.catalogoId}`}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left hover:bg-slate-50"
                            onClick={() => {
                              onSelectCodice(h.codice);
                              setOpen(false);
                            }}
                          >
                            <span className="truncate font-mono text-xs font-semibold">
                              {h.codice}
                            </span>
                            <span className="shrink-0 text-[10px] tabular-nums text-[var(--muted)]">
                              {Math.round(h.score)}%
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              )}
              {orphan ? (
                <p className="mt-1 border-t border-[var(--border)] px-1 pt-1 text-[10px] text-amber-800">
                  Codice corrente non in elenco match
                </p>
              ) : null}
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <div className="relative min-w-[11rem] flex-1">
      <div className="flex gap-1">
        <button
          ref={triggerRef}
          type="button"
          onClick={openMenu}
          onFocus={openMenu}
          className="min-w-0 flex-1 truncate rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-left font-mono text-xs font-semibold hover:bg-slate-50"
          title={codice || "Seleziona codice"}
        >
          {codice && codice !== "—" ? codice : "— seleziona —"}
        </button>
        <button
          type="button"
          onClick={onCerca}
          disabled={cercaDisabled}
          title={
            cercaDisabled
              ? "Attendi la fine del controllo automatico"
              : "Cerca codice catalogo"
          }
          className="shrink-0 rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
        >
          Cerca
        </button>
      </div>
      {menu}
    </div>
  );
}
