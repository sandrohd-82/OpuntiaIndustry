"use client";

import { Fragment, useEffect, useMemo, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";
import { riordinaVisteLuogoAction } from "@/app/actions/magazzino-mappa";
import {
  classiGrigliaViste,
  type MappaMagazzino,
  type PiantaLuogoPagina,
} from "@/lib/magazzino/mappa";
import {
  applicaCapienza,
  areeElencoConsultazione,
  capienzaDi,
  idsUbicazioniCollegate,
  unisciAreePiante,
  type FonteSettaggioPosto,
  type UbicazioneCapienza,
} from "@/lib/magazzino/ubicazioni";
import {
  getOccupazionePostoAction,
  listImballaggiPostoAction,
  listMovimentazioniPostiAction,
} from "@/app/actions/magazzino-posto-occupazione";
import {
  riepilogoOccupazionePosto,
  type ImballaggioPostoOpt,
} from "@/lib/magazzino/posto-occupazione";
import { PiantaElencoPostoDettaglio } from "@/components/magazzino/PiantaElencoPostoDettaglio";
import { PiantaVistaRitaglio } from "@/components/magazzino/PiantaVistaRitaglio";
import {
  PiantaPostoPannello,
  PiantaPostoSettaggiInfo,
} from "@/components/magazzino/PiantaPostoPannello";
import { PiantaPostoOccupazione } from "@/components/magazzino/PiantaPostoOccupazione";
import { PiantaPostoNuvola } from "@/components/magazzino/PiantaPostoNuvola";

function muoviVista(
  list: MappaMagazzino[],
  fromId: string,
  toId: string
): MappaMagazzino[] {
  if (!fromId || !toId || fromId === toId) return list;
  const from = list.findIndex((m) => m.id === fromId);
  const to = list.findIndex((m) => m.id === toId);
  if (from < 0 || to < 0) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function PiantaLuogoBoard({ luogo }: { luogo: PiantaLuogoPagina }) {
  const router = useRouter();
  const [mappe, setMappe] = useState(luogo.mappe);
  const [selezionata, setSelezionata] = useState<string | null>(null);
  const [pannello, setPannello] = useState<
    "info" | "settaggio" | "occupazione" | null
  >(null);
  const [settaggioAnchor, setSettaggioAnchor] = useState<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  } | null>(null);
  const [occTesto, setOccTesto] = useState<string | null>(null);
  const [occLoad, setOccLoad] = useState(false);
  const [modificaSequenza, setModificaSequenza] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [seqBusy, setSeqBusy] = useState(false);
  const [seqError, setSeqError] = useState<string | null>(null);
  const [seqOk, setSeqOk] = useState<string | null>(null);
  const [movPerPosto, setMovPerPosto] = useState<Record<string, string[]>>(
    {}
  );
  const [catalogoMov, setCatalogoMov] = useState<ImballaggioPostoOpt[]>([]);
  const [apertoElenco, setApertoElenco] = useState<string | null>(null);
  const serverOrdine = luogo.mappe.map((m) => m.id).join(",");

  useEffect(() => {
    setMappe(luogo.mappe);
  }, [luogo.nodoId, serverOrdine]);

  const tutteAree = useMemo(
    () => mappe.flatMap((m) => m.aree ?? []),
    [mappe]
  );
  const accese = useMemo(
    () => idsUbicazioniCollegate(tutteAree, selezionata),
    [tutteAree, selezionata]
  );
  const n = mappe.length;
  const griglia = classiGrigliaViste(n);
  const areeUnite = useMemo(
    () => unisciAreePiante(mappe.map((m) => m.aree ?? [])),
    [mappe]
  );
  const aree = areeElencoConsultazione(areeUnite);
  const haLivelli = tutteAree.some((a) => a.parentId);
  const posto = tutteAree.find((a) => a.ubicazioneId === selezionata) ?? null;

  const postiIdsKey = useMemo(
    () =>
      [...new Set(areeUnite.map((a) => a.ubicazioneId).filter(Boolean))]
        .sort()
        .join(","),
    [areeUnite]
  );

  useEffect(() => {
    const ids = postiIdsKey ? postiIdsKey.split(",") : [];
    if (!ids.length) {
      setMovPerPosto({});
      return;
    }
    let live = true;
    void listMovimentazioniPostiAction(ids).then((res) => {
      if (!live || !res.success) return;
      setMovPerPosto(res.perPosto);
    });
    return () => {
      live = false;
    };
  }, [postiIdsKey]);

  useEffect(() => {
    let live = true;
    void listImballaggiPostoAction().then((res) => {
      if (!live || !res.success) return;
      setCatalogoMov(res.movimentazioni);
    });
    return () => {
      live = false;
    };
  }, []);

  const fontiSettaggio = useMemo((): FonteSettaggioPosto[] => {
    const byId = new Map(areeUnite.map((a) => [a.ubicazioneId, a]));
    const out: FonteSettaggioPosto[] = [];
    for (const r of aree) {
      const movIds = movPerPosto[r.id] ?? [];
      if (
        (!r.haSettaggi && !movIds.length) ||
        r.id === posto?.ubicazioneId
      ) {
        continue;
      }
      const src = byId.get(r.id);
      if (!src) continue;
      const codice = r.codice.trim();
      if (!codice) continue;
      out.push({
        ubicazioneId: r.id,
        nome: codice,
        capienza: capienzaDi(src),
        movimentazioneVoceIds: movIds,
      });
    }
    return out.sort((x, y) => x.nome.localeCompare(y.nome, "it"));
  }, [aree, areeUnite, movPerPosto, posto?.ubicazioneId]);

  const movNomiPerPosto = useMemo(() => {
    const nomi = new Map(catalogoMov.map((v) => [v.id, v.nome]));
    const out: Record<string, string[]> = {};
    for (const [id, ids] of Object.entries(movPerPosto)) {
      out[id] = ids.map((vid) => nomi.get(vid) ?? vid);
    }
    return out;
  }, [catalogoMov, movPerPosto]);

  const occupazioneSel = posto
    ? capienzaDi(posto).occupazione
    : "libero";

  useEffect(() => {
    if (!selezionata || occupazioneSel !== "occupato") {
      setOccTesto(null);
      setOccLoad(false);
      return;
    }
    let live = true;
    setOccLoad(true);
    void getOccupazionePostoAction(selezionata).then((res) => {
      if (!live) return;
      setOccLoad(false);
      if (res.success && res.occupazione) {
        setOccTesto(riepilogoOccupazionePosto(res.occupazione));
        return;
      }
      setOccTesto(null);
    });
    return () => {
      live = false;
    };
  }, [selezionata, occupazioneSel]);

  const vistePosto = posto
    ? mappe
        .filter((m) =>
          (m.aree ?? []).some((a) => a.ubicazioneId === posto.ubicazioneId)
        )
        .map((m) => m.vistaEtichetta || "Vista")
    : [];

  function applica(
    ubicazioneId: string,
    capienza: UbicazioneCapienza,
    movimentazioneVoceIds?: string[]
  ) {
    setMappe((prev) =>
      prev.map((m) => ({
        ...m,
        aree: (m.aree ?? []).map((a) =>
          a.ubicazioneId === ubicazioneId ? applicaCapienza(a, capienza) : a
        ),
      }))
    );
    if (movimentazioneVoceIds) {
      setMovPerPosto((prev) => ({
        ...prev,
        [ubicazioneId]: movimentazioneVoceIds,
      }));
    }
  }

  function setStato(
    ubicazioneId: string,
    occupazione: "libero" | "occupato"
  ) {
    setMappe((prev) =>
      prev.map((m) => ({
        ...m,
        aree: (m.aree ?? []).map((a) =>
          a.ubicazioneId === ubicazioneId ? { ...a, occupazione } : a
        ),
      }))
    );
  }

  function selezionaSolo(id: string | null) {
    setSelezionata(id);
    setPannello(null);
  }

  async function applicaSequenza(next: MappaMagazzino[]): Promise<boolean> {
    const prev = mappe;
    setMappe(next);
    setSeqBusy(true);
    setSeqError(null);
    setSeqOk(null);
    const res = await riordinaVisteLuogoAction({
      nodoId: luogo.nodoId,
      mappaIds: next.map((m) => m.id),
    });
    setSeqBusy(false);
    if (!res.success) {
      setMappe(prev);
      setSeqError(res.error);
      return false;
    }
    setSeqOk("Sequenza viste salvata.");
    router.refresh();
    return true;
  }

  async function chiudiSequenza() {
    const corrente = mappe.map((m) => m.id).join(",");
    if (corrente !== serverOrdine) {
      const ok = await applicaSequenza(mappe);
      if (!ok) return;
    }
    setModificaSequenza(false);
    setDragId(null);
    setOverId(null);
  }

  function onDragStart(e: DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDragId(id);
    setSeqError(null);
  }

  function onDragOver(e: DragEvent, id: string) {
    if (!modificaSequenza) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overId !== id) setOverId(id);
  }

  function onDrop(e: DragEvent, id: string) {
    e.preventDefault();
    const from = e.dataTransfer.getData("text/plain") || dragId;
    setDragId(null);
    setOverId(null);
    if (!from || seqBusy) return;
    const next = muoviVista(mappe, from, id);
    if (next === mappe) return;
    void applicaSequenza(next);
  }

  function onDragEnd() {
    setDragId(null);
    setOverId(null);
  }

  return (
    <div className="space-y-4">
      {n > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-[var(--muted)]">
            {modificaSequenza
              ? "Trascina le viste per cambiare la sequenza."
              : `${n} viste su quest'area.`}
          </p>
          <button
            type="button"
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              modificaSequenza
                ? "border-teal-700 bg-teal-700 text-white"
                : "border-[var(--border)] bg-white text-slate-800 hover:bg-slate-50"
            }`}
            onClick={() => {
              if (modificaSequenza) {
                void chiudiSequenza();
                return;
              }
              setModificaSequenza(true);
              setSeqError(null);
              setSeqOk(null);
              setDragId(null);
              setOverId(null);
            }}
            disabled={seqBusy}
          >
            {seqBusy
              ? "Salvataggio sequenza…"
              : modificaSequenza
                ? "Fine sequenza"
                : "Modifica sequenza"}
          </button>
        </div>
      ) : null}

      {modificaSequenza && n > 1 ? (
        <ul className="space-y-2 rounded-xl border border-dashed border-teal-400 bg-teal-50/40 p-3">
          {mappe.map((m, i) => {
            const dragging = dragId === m.id;
            const over = overId === m.id && dragId && dragId !== m.id;
            return (
              <li
                key={`seq-${m.id}`}
                draggable={!seqBusy}
                onDragStart={(e) => onDragStart(e, m.id)}
                onDragOver={(e) => onDragOver(e, m.id)}
                onDrop={(e) => onDrop(e, m.id)}
                onDragEnd={onDragEnd}
                className={`flex cursor-grab items-center gap-3 rounded-lg border bg-white px-3 py-2 text-sm active:cursor-grabbing ${
                  dragging
                    ? "border-teal-600 opacity-60"
                    : over
                      ? "border-teal-600 ring-2 ring-teal-300"
                      : "border-[var(--border)]"
                }`}
              >
                <span className="w-6 text-xs font-semibold text-slate-500">
                  {i + 1}
                </span>
                <span className="select-none font-medium">
                  {m.vistaEtichetta || "Vista"}
                </span>
                <span className="ml-auto text-xs text-slate-400">⋮⋮</span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {seqError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {seqError}
        </p>
      ) : seqOk ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {seqOk}
        </p>
      ) : null}

      <div
        className={griglia.contenitore}
        style={n >= 3 ? { minHeight: n === 4 ? "36rem" : "20rem" } : undefined}
      >
        {mappe.map((m) => {
          const dragging = modificaSequenza && dragId === m.id;
          const over =
            modificaSequenza && overId === m.id && dragId && dragId !== m.id;
          return (
            <div
              key={m.id}
              className={`${griglia.cella} ${
                over ? "ring-2 ring-teal-400 ring-offset-2" : ""
              } ${dragging ? "opacity-50" : ""}`}
              draggable={modificaSequenza && !seqBusy}
              onDragStart={(e) => onDragStart(e, m.id)}
              onDragOver={(e) => onDragOver(e, m.id)}
              onDrop={(e) => onDrop(e, m.id)}
              onDragEnd={onDragEnd}
            >
              <PiantaVistaRitaglio
                mappa={m}
                accese={accese}
                primariaId={selezionata}
                onSeleziona={modificaSequenza ? undefined : selezionaSolo}
                occupazioneTesto={occTesto}
                occupazioneLoading={occLoad}
                onSettaggio={
                  modificaSequenza
                    ? undefined
                    : (id) => {
                        setSelezionata(id);
                        setPannello("info");
                      }
                }
                onOccupa={
                  modificaSequenza
                    ? undefined
                    : (id) => {
                        setSelezionata(id);
                        setPannello("occupazione");
                      }
                }
                onSettaggioAnchor={(rect) => {
                  if (!rect) {
                    setSettaggioAnchor(null);
                    return;
                  }
                  setSettaggioAnchor({
                    left: rect.left,
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.bottom,
                  });
                }}
              />
            </div>
          );
        })}
      </div>

      {posto && pannello === "info" ? (
        <PiantaPostoNuvola
          anchor={settaggioAnchor}
          onClose={() => {
            setPannello(null);
            setSettaggioAnchor(null);
          }}
        >
          <PiantaPostoSettaggiInfo
            key={`info-${posto.ubicazioneId}`}
            posto={posto}
            viste={vistePosto}
            onChiudi={() => {
              setPannello(null);
              setSettaggioAnchor(null);
            }}
          />
        </PiantaPostoNuvola>
      ) : posto && pannello === "settaggio" ? (
        <PiantaPostoNuvola
          anchor={null}
          onClose={() => {
            setPannello(null);
            setSettaggioAnchor(null);
          }}
        >
          <PiantaPostoPannello
            key={`set-${posto.ubicazioneId}`}
            posto={posto}
            viste={vistePosto}
            fontiSettaggio={fontiSettaggio}
            onSalvato={applica}
            onChiudi={() => {
              setPannello(null);
              setSettaggioAnchor(null);
            }}
          />
        </PiantaPostoNuvola>
      ) : posto && pannello === "occupazione" ? (
        <PiantaPostoNuvola
          anchor={null}
          onClose={() => setPannello(null)}
        >
          <PiantaPostoOccupazione
            key={`occ-${posto.ubicazioneId}`}
            posto={posto}
            onCambioStato={(st) => setStato(posto.ubicazioneId, st)}
            onChiudi={() => setPannello(null)}
          />
        </PiantaPostoNuvola>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          Clicca un posto sul disegno: il codice va in alto a sinistra, i
          dettagli al centro e la «i» in alto a destra mostra i settaggi in
          sola lettura.
        </p>
      )}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-3 py-2">
          <p className="text-sm font-semibold">Aree</p>
          <p className="text-xs text-[var(--muted)]">
            {haLivelli
              ? "Colonne e livelli: codice misto (es. A1, B3)."
              : "Solo colonne: codice lettera (es. A, B)."}{" "}
            Verde chiaro = libero, verde scuro = occupato.
          </p>
        </div>
        {aree.length === 0 ? (
          <p className="px-3 py-4 text-sm text-[var(--muted)]">
            Nessuna area disegnata su queste viste.
          </p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-1.5 font-medium">Codice</th>
                <th className="px-3 py-1.5 font-medium">Nome</th>
                <th className="px-3 py-1.5 font-medium">Stato</th>
                <th className="px-3 py-1.5 font-medium">Settaggio</th>
                <th className="px-3 py-1.5 font-medium">Occupazione</th>
                <th className="px-3 py-1.5 font-medium">Azioni</th>
                <th className="px-3 py-1.5 font-medium">
                  <span className="sr-only">Dettagli</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {aree.map((a) => {
                const accesa = accese.has(a.id);
                const occupato = a.occupazione === "occupato";
                const aperto = apertoElenco === a.id;
                const src = areeUnite.find((x) => x.ubicazioneId === a.id);
                const capienza = capienzaDi(src);
                return (
                  <Fragment key={a.id}>
                  <tr
                    className={`border-t border-[var(--border)] ${
                      accesa
                        ? occupato
                          ? "bg-green-800/20"
                          : "bg-teal-100"
                        : occupato
                          ? "bg-green-900/10"
                          : ""
                    }`}
                  >
                    <td
                      className="cursor-pointer px-3 py-1.5 font-semibold"
                      onClick={() =>
                        selezionaSolo(a.id === selezionata ? null : a.id)
                      }
                    >
                      {a.codice}
                    </td>
                    <td
                      className="cursor-pointer px-3 py-1.5"
                      onClick={() =>
                        selezionaSolo(a.id === selezionata ? null : a.id)
                      }
                    >
                      {a.nome}
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                          occupato ? "text-green-900" : "text-teal-800"
                        }`}
                      >
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-sm ${
                            occupato ? "bg-green-800" : "bg-teal-300"
                          }`}
                        />
                        {occupato ? "Occupato" : "Libero"}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        className={`rounded-lg border px-2 py-1 text-xs font-medium ${
                          a.haSettaggi
                            ? "border-green-900 bg-green-800 text-white hover:bg-green-900"
                            : "border-slate-400 bg-white text-slate-800 hover:bg-slate-100"
                        }`}
                        onClick={() => {
                          setSelezionata(a.id);
                          setSettaggioAnchor(null);
                          setPannello("settaggio");
                        }}
                      >
                        Settaggio
                      </button>
                    </td>
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        className="rounded-lg border border-green-800 bg-white px-2 py-1 text-xs font-medium text-green-950 hover:bg-green-50"
                        onClick={() => {
                          setSelezionata(a.id);
                          setPannello("occupazione");
                        }}
                      >
                        {occupato ? "Pallet / libera" : "Occupare"}
                      </button>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-400 bg-white px-2 py-1 text-xs font-medium text-slate-800"
                        >
                          Modifica
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-400 bg-white px-2 py-1 text-xs font-medium text-slate-800"
                        >
                          Preleva
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-400 bg-white px-2 py-1 text-xs font-medium text-slate-800"
                        >
                          Stampa etichette
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        aria-expanded={aperto}
                        aria-label={
                          aperto ? "Chiudi dettagli posto" : "Apri dettagli posto"
                        }
                        onClick={() =>
                          setApertoElenco((id) => (id === a.id ? null : a.id))
                        }
                        className="rounded-lg p-1.5 text-slate-700 hover:bg-slate-100"
                      >
                        {aperto ? (
                          <FaChevronUp size={14} />
                        ) : (
                          <FaChevronDown size={14} />
                        )}
                      </button>
                    </td>
                  </tr>
                  {aperto ? (
                    <tr className="border-t border-[var(--border)] bg-slate-50/80">
                      <td colSpan={7} className="px-3 py-2">
                        <PiantaElencoPostoDettaglio
                          ubicazioneId={a.id}
                          occupato={occupato}
                          capienza={capienza}
                          movNomi={movNomiPerPosto[a.id] ?? []}
                        />
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
