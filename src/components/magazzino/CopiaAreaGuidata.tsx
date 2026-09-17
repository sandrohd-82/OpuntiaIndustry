"use client";

import { useEffect, useMemo, useState } from "react";
import { formattaQuadrati } from "@/lib/magazzino/mappa";
import type { MappaAreaDisegnata } from "@/lib/magazzino/ubicazioni";

const PASSI = ["sorgente", "codice", "nome", "parent", "larghezza", "altezza"] as const;
type Passo = (typeof PASSI)[number];

const PASSO_LABEL: Record<Passo, string> = {
  sorgente: "Area di origine",
  codice: "Codice",
  nome: "Nome",
  parent: "Area madre",
  larghezza: "Larghezza (quadrati)",
  altezza: "Altezza (quadrati)",
};

export type CopiaAreaRisultato = {
  codice: string;
  nome: string;
  parentId: string | null;
  width: number;
  height: number;
  source: MappaAreaDisegnata;
};

export function CopiaAreaGuidata({
  open,
  aree,
  parentOptions,
  sourceId,
  griglia,
  onClose,
  onCompleta,
}: {
  open: boolean;
  aree: MappaAreaDisegnata[];
  parentOptions: { id: string; label: string }[];
  sourceId: string | null;
  griglia: number;
  onClose: () => void;
  onCompleta: (r: CopiaAreaRisultato) => void;
}) {
  const [passo, setPasso] = useState<Passo>("sorgente");
  const [modifica, setModifica] = useState(false);
  const [pickedId, setPickedId] = useState(sourceId ?? "");
  const [codice, setCodice] = useState("");
  const [nome, setNome] = useState("");
  const [parentId, setParentId] = useState("");
  const [larghezzaQ, setLarghezzaQ] = useState(1);
  const [altezzaQ, setAltezzaQ] = useState(1);
  const [errore, setErrore] = useState<string | null>(null);

  const source = aree.find((a) => a.id === pickedId) ?? null;

  useEffect(() => {
    if (!open) return;
    const start = sourceId && aree.some((a) => a.id === sourceId) ? sourceId : "";
    const src = aree.find((a) => a.id === start) ?? null;
    setPickedId(start);
    setPasso(start ? "codice" : "sorgente");
    setModifica(false);
    setErrore(null);
    if (src) {
      setCodice(src.codice);
      setNome(src.nome);
      setParentId(src.parentId ?? "");
      setLarghezzaQ(Math.max(1, Math.round(src.width / Math.max(griglia, 1))));
      setAltezzaQ(Math.max(1, Math.round(src.height / Math.max(griglia, 1))));
    } else {
      setCodice("");
      setNome("");
      setParentId("");
      setLarghezzaQ(1);
      setAltezzaQ(1);
    }
  }, [open, sourceId, aree, griglia]);

  const parentLabel = useMemo(() => {
    if (!parentId) return "Nessuna (area principale)";
    return parentOptions.find((o) => o.id === parentId)?.label ?? parentId;
  }, [parentId, parentOptions]);

  function applicaSorgente(id: string) {
    const src = aree.find((a) => a.id === id);
    if (!src) return;
    setPickedId(id);
    setCodice(src.codice);
    setNome(src.nome);
    setParentId(src.parentId ?? "");
    setLarghezzaQ(Math.max(1, Math.round(src.width / Math.max(griglia, 1))));
    setAltezzaQ(Math.max(1, Math.round(src.height / Math.max(griglia, 1))));
  }

  function valoreCorrente(): string {
    switch (passo) {
      case "sorgente":
        return source ? `${source.codice} — ${source.nome}` : "—";
      case "codice":
        return codice || "—";
      case "nome":
        return nome || "—";
      case "parent":
        return parentLabel;
      case "larghezza":
        return formattaQuadrati(larghezzaQ);
      case "altezza":
        return formattaQuadrati(altezzaQ);
      default:
        return "—";
    }
  }

  function avanti() {
    setErrore(null);
    if (passo === "sorgente") {
      if (!source) {
        setErrore("Scegli l'area da cui copiare.");
        return;
      }
      setPasso("codice");
      setModifica(false);
      return;
    }
    if (passo === "codice") {
      const c = codice.trim().toUpperCase();
      if (!c) {
        setErrore("Il codice è obbligatorio.");
        return;
      }
      const clash = aree.some((a) => a.codice.trim().toUpperCase() === c);
      if (clash) {
        setErrore("Questo codice esiste già. Modificalo prima di confermare.");
        setModifica(true);
        return;
      }
      setCodice(c);
    }
    if (passo === "nome" && !nome.trim()) {
      setErrore("Il nome è obbligatorio.");
      return;
    }
    if (passo === "larghezza" && larghezzaQ < 1) {
      setErrore("Larghezza almeno 1 quadrato.");
      return;
    }
    if (passo === "altezza") {
      if (altezzaQ < 1) {
        setErrore("Altezza almeno 1 quadrato.");
        return;
      }
      if (!source) {
        setErrore("Area di origine mancante.");
        return;
      }
      onCompleta({
        codice: codice.trim().toUpperCase(),
        nome: nome.trim(),
        parentId: parentId || null,
        width: Math.max(1, larghezzaQ) * Math.max(griglia, 1),
        height: Math.max(1, altezzaQ) * Math.max(griglia, 1),
        source,
      });
      onClose();
      return;
    }
    const i = PASSI.indexOf(passo);
    setPasso(PASSI[i + 1]!);
    setModifica(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-teal-300 bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-teal-950">Copia da area</h2>
            <p className="mt-1 text-sm text-slate-600">
              Parametro {PASSI.indexOf(passo) + 1} di {PASSI.length}:{" "}
              <strong>{PASSO_LABEL[passo]}</strong>. Conferma il valore copiato o
              modificalo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            Chiudi
          </button>
        </div>

        {errore ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {errore}
          </p>
        ) : null}

        <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50/70 px-3 py-3">
          <p className="text-xs font-medium uppercase text-teal-800">
            {PASSO_LABEL[passo]}
          </p>
          {!modifica && passo !== "sorgente" ? (
            <p className="mt-1 text-lg font-semibold text-teal-950">{valoreCorrente()}</p>
          ) : null}

          {passo === "sorgente" ? (
            <select
              value={pickedId}
              onChange={(e) => applicaSorgente(e.target.value)}
              className="mt-2 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">Scegli area…</option>
              {aree.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codice} — {a.nome}
                </option>
              ))}
            </select>
          ) : null}

          {modifica && passo === "codice" ? (
            <input
              value={codice}
              onChange={(e) => setCodice(e.target.value.toUpperCase())}
              className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm uppercase"
            />
          ) : null}
          {modifica && passo === "nome" ? (
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          ) : null}
          {modifica && passo === "parent" ? (
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="mt-2 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">Nessuna (area principale)</option>
              {parentOptions
                .filter((o) => o.id !== source?.id && o.id !== source?.ubicazioneId)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
            </select>
          ) : null}
          {modifica && passo === "larghezza" ? (
            <input
              type="number"
              min={1}
              value={larghezzaQ}
              onChange={(e) => setLarghezzaQ(Math.max(1, Math.round(Number(e.target.value) || 1)))}
              className="mt-2 w-32 rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          ) : null}
          {modifica && passo === "altezza" ? (
            <input
              type="number"
              min={1}
              value={altezzaQ}
              onChange={(e) => setAltezzaQ(Math.max(1, Math.round(Number(e.target.value) || 1)))}
              className="mt-2 w-32 rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {!modifica && passo !== "sorgente" ? (
            <button
              type="button"
              onClick={() => {
                setModifica(true);
                setErrore(null);
              }}
              className="rounded-lg border border-teal-700 px-3 py-1.5 text-sm font-medium text-teal-900 hover:bg-teal-50"
            >
              Modifica
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => avanti()}
            className="rounded-lg bg-teal-800 px-3 py-1.5 text-sm font-medium text-white"
          >
            {passo === "altezza" ? "Crea copia" : "Conferma"}
          </button>
        </div>
      </div>
    </div>
  );
}
