"use client";

import { useEffect, useMemo, useState } from "react";
import { getListinoVoceVigenteAction } from "@/app/actions/listini";
import { listProdottiPropriAction } from "@/app/actions/prodotti-propri";
import { ClearableNumberInput } from "@/components/ui/ClearableNumberInput";
import type { FatturaA4Riga } from "@/lib/amministrazione/fattura-a4-documento";
import { prezzoScontatoUnitario } from "@/lib/amministrazione/fatture";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";
import type { ListinoVoceVigente } from "@/lib/ecosystem/listino-vigente";

type Fonte = "catalogo" | "manuale";

type Props = {
  value: FatturaA4Riga;
  onChange: (next: FatturaA4Riga) => void;
};

function euro(n: number) {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fonteIniziale(riga: FatturaA4Riga): Fonte {
  if (riga.prodottoId) return "catalogo";
  const codice = riga.codice.trim();
  if (!codice || codice.toUpperCase() === "VOCE") return "catalogo";
  return "manuale";
}

export function FatturaA4RigaEditor({ value, onChange }: Props) {
  const [fonte, setFonte] = useState<Fonte>(() => fonteIniziale(value));
  const [query, setQuery] = useState("");
  const [prodotti, setProdotti] = useState<ProdottoProprio[]>([]);
  const [prodottiReady, setProdottiReady] = useState(false);
  const [listinoHint, setListinoHint] = useState<ListinoVoceVigente | null>(
    null
  );
  const [listinoMsg, setListinoMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listProdottiPropriAction().then((res) => {
      if (cancelled) return;
      if (res.success) setProdotti(res.prodotti);
      setProdottiReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (fonte !== "catalogo" || !value.prodottoId) {
      setListinoHint(null);
      setListinoMsg(null);
      return;
    }
    const prodottoId = value.prodottoId;
    let cancelled = false;
    void getListinoVoceVigenteAction(prodottoId).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        setListinoHint(null);
        setListinoMsg(res.error);
        return;
      }
      setListinoHint(res.voce);
      setListinoMsg(
        res.voce && res.voce.prezzo > 0
          ? null
          : "Nessun prezzo listino In Uso: inseriscilo a mano."
      );
    });
    return () => {
      cancelled = true;
    };
  }, [fonte, value.prodottoId]);

  const filtrati = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return prodotti;
    return prodotti.filter((p) => {
      const hay = `${p.codice} ${p.nome}`.toLowerCase();
      return hay.includes(q);
    });
  }, [prodotti, query]);

  function setFonteMode(next: Fonte) {
    setFonte(next);
    if (next === "manuale") {
      onChange({ ...value, prodottoId: null });
      setListinoHint(null);
      setListinoMsg(null);
    }
  }

  function scegliCatalogo(prodottoId: string) {
    const p = prodotti.find((x) => x.id === prodottoId);
    if (!p) {
      onChange({ ...value, prodottoId: null });
      return;
    }
    onChange({
      ...value,
      prodottoId: p.id,
      codice: p.codice,
      descrizione: p.nome,
    });
  }

  function patch(part: Partial<FatturaA4Riga>) {
    onChange({ ...value, ...part });
  }

  return (
    <div className="space-y-3">
      <fieldset className="space-y-1.5 text-sm">
        <legend className="mb-1 font-medium">Origine riga</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="fattura-riga-fonte"
            checked={fonte === "catalogo"}
            onChange={() => setFonteMode("catalogo")}
          />
          Da catalogo Agrinsicilia
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="fattura-riga-fonte"
            checked={fonte === "manuale"}
            onChange={() => setFonteMode("manuale")}
          />
          Inserimento manuale
        </label>
        <p className="text-xs text-slate-500">
          Quantità, listino, sconto, unità e IVA restano liberi e indipendenti:
          il catalogo non li ricalcola.
        </p>
      </fieldset>

      {fonte === "catalogo" ? (
        <div className="space-y-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Cerca prodotto</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Codice o nome…"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              Prodotti propri Agrinsicilia
            </span>
            <select
              value={value.prodottoId ?? ""}
              disabled={!prodottiReady}
              onChange={(e) => scegliCatalogo(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">
                {prodottiReady
                  ? filtrati.length
                    ? "Seleziona prodotto…"
                    : "Nessun prodotto trovato"
                  : "Caricamento catalogo…"}
              </option>
              {filtrati.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codice} — {p.nome}
                  {p.isBio ? " · BIO" : ""}
                </option>
              ))}
            </select>
          </label>
          {listinoHint && listinoHint.prezzo > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              Suggerimento listino In Uso: {euro(listinoHint.prezzo)} € /{" "}
              {listinoHint.unitaMisura}. Non viene applicato da solo.
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => patch({ prezzoUnitario: listinoHint.prezzo })}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                >
                  Copia solo prezzo
                </button>
                <button
                  type="button"
                  onClick={() =>
                    patch({ unitaMisura: listinoHint.unitaMisura })
                  }
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                >
                  Copia solo unità
                </button>
              </div>
            </div>
          ) : listinoMsg ? (
            <p className="text-xs text-amber-800">{listinoMsg}</p>
          ) : null}
        </div>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Codice</span>
        <input
          value={value.codice}
          onChange={(e) => patch({ codice: e.target.value })}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Dicitura</span>
        <input
          value={value.descrizione}
          onChange={(e) => patch({ descrizione: e.target.value })}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Quantità</span>
          <ClearableNumberInput
            min={0}
            value={value.quantita}
            onValueChange={(v) => patch({ quantita: Number(v) || 0 })}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Unità</span>
          <input
            value={value.unitaMisura}
            onChange={(e) => patch({ unitaMisura: e.target.value })}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Listino (€)</span>
          <ClearableNumberInput
            min={0}
            value={value.prezzoUnitario}
            onValueChange={(v) => patch({ prezzoUnitario: Number(v) || 0 })}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Sconto (%)</span>
          <ClearableNumberInput
            min={0}
            max={100}
            value={value.scontoPercentuale}
            onValueChange={(v) =>
              patch({ scontoPercentuale: Number(v) || 0 })
            }
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">IVA (%)</span>
          <ClearableNumberInput
            min={0}
            max={100}
            value={value.ivaPercentuale}
            onValueChange={(v) => patch({ ivaPercentuale: Number(v) || 0 })}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <p className="text-xs text-slate-500">
        Netto unitario (solo visualizzato):{" "}
        {euro(
          prezzoScontatoUnitario(value.prezzoUnitario, value.scontoPercentuale)
        )}{" "}
        €
      </p>
    </div>
  );
}
