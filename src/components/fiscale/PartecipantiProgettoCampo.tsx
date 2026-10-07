"use client";

import { useEffect, useState } from "react";
import { formatDateIt } from "@/lib/amministrazione/fatture";
import {
  LABEL_SOGGETTO_PARTECIPANTE,
  TIPI_SOGGETTO_PARTECIPANTE,
  errorePeriodoPartecipante,
  periodiPartecipanteSovrapposti,
  type SoggettoPartecipanteOption,
  type TipoSoggettoPartecipante,
} from "@/lib/fiscale/spese";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";

export type VocePartecipante = {
  chiave: string;
  soggettoTipo: TipoSoggettoPartecipante;
  soggettoId: string;
  etichetta: string;
  dataInizio: string;
  dataFine: string | null;
};

export function PartecipantiProgettoCampo({
  progettoInizio,
  progettoFine,
  soggetti,
  voci,
  solaLettura,
  pending,
  onAggiungi,
  onRimuovi,
}: {
  progettoInizio: string;
  progettoFine: string;
  soggetti: SoggettoPartecipanteOption[];
  voci: VocePartecipante[];
  solaLettura: boolean;
  pending: boolean;
  onAggiungi: (input: {
    soggettoTipo: TipoSoggettoPartecipante;
    soggettoId: string;
    dataInizio: string;
    dataFine: string | null;
  }) => void;
  onRimuovi: (chiave: string) => void;
}) {
  const [tipo, setTipo] = useState<TipoSoggettoPartecipante>("operatore");
  const [soggettoId, setSoggettoId] = useState("");
  const [modo, setModo] = useState<"giorno" | "arco">("giorno");
  const [inizio, setInizio] = useState(progettoInizio);
  const [fine, setFine] = useState(progettoFine);
  const [filtro, setFiltro] = useState("");
  const [localeErrore, setLocaleErrore] = useState<string | null>(null);

  useEffect(() => {
    setInizio((prev) => prev || progettoInizio);
  }, [progettoInizio]);

  const opzioni = soggetti.filter((soggetto) => {
    if (soggetto.tipo !== tipo) return false;
    const testo = filtro.trim().toLowerCase();
    if (!testo) return true;
    return soggetto.etichetta.toLowerCase().includes(testo);
  });

  function cambiaTipo(next: TipoSoggettoPartecipante) {
    setTipo(next);
    setSoggettoId("");
    setFiltro("");
  }

  function aggiungi() {
    setLocaleErrore(null);
    if (!progettoInizio) {
      setLocaleErrore("Indica prima la data di inizio del progetto.");
      return;
    }
    if (!soggettoId) {
      setLocaleErrore("Scegli un partecipante.");
      return;
    }
    const dataFine = modo === "arco" ? fine : null;
    if (modo === "arco" && !dataFine) {
      setLocaleErrore("Indica la data di fine dell'arco.");
      return;
    }
    const msg = errorePeriodoPartecipante(
      progettoInizio,
      progettoFine || null,
      inizio,
      dataFine
    );
    if (msg) {
      setLocaleErrore(msg);
      return;
    }
    const sovrapposto = voci.some(
      (voce) =>
        voce.soggettoTipo === tipo &&
        voce.soggettoId === soggettoId &&
        periodiPartecipanteSovrapposti(voce.dataInizio, voce.dataFine, inizio, dataFine)
    );
    if (sovrapposto) {
      setLocaleErrore("Questo partecipante ha già un periodo che si sovrappone.");
      return;
    }
    onAggiungi({
      soggettoTipo: tipo,
      soggettoId,
      dataInizio: inizio,
      dataFine,
    });
    setSoggettoId("");
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-800">Partecipanti</p>
      <p className="text-xs text-slate-500">
        {solaLettura
          ? "Dopo l'approvazione i partecipanti restano in lettura."
          : "Ogni operatore, referente o azienda può esserci per un giorno oppure per un arco, dentro le date del progetto."}
      </p>
      {voci.length === 0 ? (
        <p className="text-sm text-slate-500">Nessun partecipante.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {voci.map((voce) => (
            <li key={voce.chiave} className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                {voce.etichetta}
                <span className="block text-xs text-[var(--muted)]">
                  {LABEL_SOGGETTO_PARTECIPANTE[voce.soggettoTipo]}
                  {" · "}
                  {voce.dataFine && voce.dataFine !== voce.dataInizio
                    ? `${formatDateIt(voce.dataInizio)} – ${formatDateIt(voce.dataFine)}`
                    : formatDateIt(voce.dataInizio)}
                </span>
              </span>
              {solaLettura ? null : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onRimuovi(voce.chiave)}
                  className="shrink-0 text-xs text-slate-600 underline disabled:opacity-40"
                >
                  Togli
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {solaLettura ? null : (
        <div className="space-y-2 border-t border-[var(--border)] pt-2">
          <select
            className={field}
            value={tipo}
            onChange={(e) => cambiaTipo(e.target.value as TipoSoggettoPartecipante)}
          >
            {TIPI_SOGGETTO_PARTECIPANTE.map((voce) => (
              <option key={voce} value={voce}>
                {LABEL_SOGGETTO_PARTECIPANTE[voce]}
              </option>
            ))}
          </select>
          <input
            className={field}
            placeholder="Cerca"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
          <select
            className={field}
            value={soggettoId}
            onChange={(e) => setSoggettoId(e.target.value)}
          >
            <option value="">Scegli</option>
            {opzioni.map((soggetto) => (
              <option key={soggetto.id} value={soggetto.id}>
                {soggetto.etichetta}
              </option>
            ))}
          </select>
          <select
            className={field}
            value={modo}
            onChange={(e) => setModo(e.target.value as "giorno" | "arco")}
          >
            <option value="giorno">Un solo giorno</option>
            <option value="arco">Arco di date</option>
          </select>
          <input
            className={field}
            type="date"
            value={inizio}
            onChange={(e) => setInizio(e.target.value)}
          />
          {modo === "arco" ? (
            <input
              className={field}
              type="date"
              value={fine}
              onChange={(e) => setFine(e.target.value)}
            />
          ) : null}
          {localeErrore ? <p className="text-xs text-red-700">{localeErrore}</p> : null}
          <button
            type="button"
            disabled={pending}
            onClick={aggiungi}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            Aggiungi partecipante
          </button>
        </div>
      )}
    </div>
  );
}
