"use client";

import { useEffect, useState, useTransition } from "react";
import { creaDdtAction, listClientiDdtAction } from "@/app/actions/ddt";
import { formatEuro } from "@/lib/amministrazione/fatture";
import { totaliDdt, type DdtClienteOption } from "@/lib/fiscale/ddt";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";

type RigaForm = {
  key: string;
  codice: string;
  descrizione: string;
  quantita: string;
  prezzoUnitario: string;
  scontoPercentuale: string;
  ivaPercentuale: string;
};

function rigaVuota(): RigaForm {
  return {
    key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    codice: "",
    descrizione: "",
    quantita: "1",
    prezzoUnitario: "",
    scontoPercentuale: "0",
    ivaPercentuale: "22",
  };
}

function parseNum(raw: string): number {
  const n = Number(raw.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

export function DdtEmissioneBoard() {
  const [clienti, setClienti] = useState<DdtClienteOption[]>([]);
  const [filtro, setFiltro] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [dataDocumento, setDataDocumento] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [causale, setCausale] = useState("Vendita");
  const [destinazione, setDestinazione] = useState("");
  const [note, setNote] = useState("");
  const [righe, setRighe] = useState<RigaForm[]>([rigaVuota()]);
  const [errore, setErrore] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    start(async () => {
      const res = await listClientiDdtAction();
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setClienti(res.clienti);
    });
  }, []);

  function scegliCliente(id: string) {
    setClienteId(id);
    const c = clienti.find((x) => x.id === id);
    if (c && !destinazione.trim()) setDestinazione(c.destinazione);
  }

  function aggiorna(key: string, patch: Partial<RigaForm>) {
    setRighe((curr) => curr.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  const numeri = righe.map((r) => ({
    quantita: parseNum(r.quantita),
    prezzoUnitario: parseNum(r.prezzoUnitario),
    scontoPercentuale: parseNum(r.scontoPercentuale) || 0,
    ivaPercentuale: parseNum(r.ivaPercentuale) || 0,
  }));
  const totaliValidi = numeri.every(
    (r) =>
      Number.isFinite(r.quantita) &&
      r.quantita > 0 &&
      Number.isFinite(r.prezzoUnitario) &&
      r.prezzoUnitario >= 0
  );
  const totali = totaliValidi
    ? totaliDdt(numeri)
    : { imponibile: 0, imposta: 0, totale: 0 };

  const q = filtro.trim().toLowerCase();
  const clientiVisibili = q
    ? clienti.filter((c) =>
        `${c.ragioneSociale} ${c.partitaIva} ${c.codiceTarga}`.toLowerCase().includes(q)
      )
    : clienti;

  function registra() {
    setErrore(null);
    setMsg(null);
    if (!totaliValidi) {
      setErrore("Controlla quantità e prezzi delle righe.");
      return;
    }
    start(async () => {
      const res = await creaDdtAction({
        clienteId,
        dataDocumento,
        causale,
        destinazione,
        note,
        righe: righe.map((r, i) => ({
          codice: r.codice,
          descrizione: r.descrizione,
          quantita: numeri[i].quantita,
          prezzoUnitario: numeri[i].prezzoUnitario,
          scontoPercentuale: numeri[i].scontoPercentuale,
          ivaPercentuale: numeri[i].ivaPercentuale,
        })),
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMsg(
        `DDT ${res.numeroInterno} registrato su Fatture in Cloud con numero ${res.numeroFic || res.ficId}. Il contatore fatture non è stato usato.`
      );
      setRighe([rigaVuota()]);
      setNote("");
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">
        Compili il DDT qui. Viene creato su Fatture in Cloud come documento di
        trasporto, con numerazione propria. Non consuma il numero della prossima fattura.
      </p>
      {errore ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errore}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {msg}
        </p>
      ) : null}
      <section className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 md:grid-cols-2">
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block text-xs text-[var(--muted)]">Cerca cliente</span>
          <input
            className={field}
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Ragione sociale o partita IVA"
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block text-xs text-[var(--muted)]">Cliente</span>
          <select
            className={field}
            value={clienteId}
            onChange={(e) => scegliCliente(e.target.value)}
          >
            <option value="">Seleziona</option>
            {clientiVisibili.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ragioneSociale}
                {c.codiceTarga ? ` · ${c.codiceTarga}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-[var(--muted)]">Data</span>
          <input
            type="date"
            className={field}
            value={dataDocumento}
            onChange={(e) => setDataDocumento(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-[var(--muted)]">Causale trasporto</span>
          <input
            className={field}
            value={causale}
            onChange={(e) => setCausale(e.target.value)}
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block text-xs text-[var(--muted)]">Destinazione</span>
          <input
            className={field}
            value={destinazione}
            onChange={(e) => setDestinazione(e.target.value)}
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block text-xs text-[var(--muted)]">Note</span>
          <textarea
            className={field}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </section>

      <section className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Righe</h2>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            onClick={() => setRighe((curr) => [...curr, rigaVuota()])}
          >
            Aggiungi riga
          </button>
        </div>
        {righe.map((r) => (
          <div key={r.key} className="grid gap-2 md:grid-cols-12">
            <input
              className={`${field} md:col-span-2`}
              placeholder="Codice"
              value={r.codice}
              onChange={(e) => aggiorna(r.key, { codice: e.target.value })}
            />
            <input
              className={`${field} md:col-span-4`}
              placeholder="Descrizione"
              value={r.descrizione}
              onChange={(e) => aggiorna(r.key, { descrizione: e.target.value })}
            />
            <input
              className={`${field} md:col-span-1`}
              placeholder="Qtà"
              value={r.quantita}
              onChange={(e) => aggiorna(r.key, { quantita: e.target.value })}
            />
            <input
              className={`${field} md:col-span-2`}
              placeholder="Prezzo"
              value={r.prezzoUnitario}
              onChange={(e) => aggiorna(r.key, { prezzoUnitario: e.target.value })}
            />
            <input
              className={`${field} md:col-span-1`}
              placeholder="Sc.%"
              value={r.scontoPercentuale}
              onChange={(e) => aggiorna(r.key, { scontoPercentuale: e.target.value })}
            />
            <input
              className={`${field} md:col-span-1`}
              placeholder="IVA%"
              value={r.ivaPercentuale}
              onChange={(e) => aggiorna(r.key, { ivaPercentuale: e.target.value })}
            />
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-2 py-2 text-xs md:col-span-1"
              onClick={() =>
                setRighe((curr) =>
                  curr.length === 1 ? curr : curr.filter((x) => x.key !== r.key)
                )
              }
            >
              Togli
            </button>
          </div>
        ))}
        <p className="text-sm">
          Imponibile {formatEuro(totali.imponibile)} · IVA {formatEuro(totali.imposta)} ·
          Totale {formatEuro(totali.totale)}
        </p>
        <button
          type="button"
          className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={pending}
          onClick={registra}
        >
          {pending ? "Registrazione…" : "Registra su Fatture in Cloud"}
        </button>
      </section>
    </div>
  );
}
