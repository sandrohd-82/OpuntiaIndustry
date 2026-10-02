"use client";

import { useRef, useState, useTransition } from "react";
import {
  anteprimaSpesaAction,
  listProgettiSpesaAction,
  registraSpesaAction,
} from "@/app/actions/spese";
import {
  CATEGORIE_SPESA,
  LABEL_CATEGORIA_SPESA,
  LABEL_PAGAMENTO_SPESA,
  LABEL_TIPO_CARICAMENTO,
  LABEL_TIPO_PROGETTO,
  PAGAMENTI_SPESA,
  TIPI_CARICAMENTO_SPESA,
  categoriaRichiedeCausale,
  type AnteprimaSpesa,
  type CategoriaSpesa,
  type SpesaProgettoView,
  type TipoCaricamentoSpesa,
} from "@/lib/fiscale/spese";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";

const vuoto = {
  esercente: "",
  partitaIva: "",
  dataDocumento: "",
  giustificazione: "",
  imponibile: "",
  aliquotaIva: "22",
  imposta: "",
  totale: "",
  valuta: "EUR",
  importoValuta: "",
  cambio: "",
  nazione: "",
  flagEsterometro: false,
  tipoAutofattura: "",
  progettoId: "",
  note: "",
  categoria: "vitto" as CategoriaSpesa,
  modalitaPagamento: "carta_aziendale",
};

export function SpeseCaricamentoBoard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const fileTenuto = useRef<File | null>(null);
  const [tipo, setTipo] = useState<TipoCaricamentoSpesa>("scontrino");
  const [anteprima, setAnteprima] = useState<AnteprimaSpesa | null>(null);
  const [form, setForm] = useState(vuoto);
  const [progetti, setProgetti] = useState<SpesaProgettoView[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function patch(partial: Partial<typeof vuoto>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  function analizza() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErrore("Seleziona un file.");
      return;
    }
    setErrore(null);
    setMsg(null);
    const body = new FormData();
    body.set("file", file);
    body.set("tipoCaricamento", tipo);
    start(async () => {
      const [res, elenco] = await Promise.all([
        anteprimaSpesaAction(body),
        listProgettiSpesaAction(),
      ]);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      fileTenuto.current = file;
      setAnteprima(res.anteprima);
      if (elenco.success) {
        setProgetti(elenco.progetti.filter((p) => p.documentoStato !== "chiuso"));
      }
      const a = res.anteprima;
      setForm({
        ...vuoto,
        esercente: a.esercente,
        partitaIva: a.partitaIva,
        dataDocumento: a.dataDocumento,
        imponibile: a.imponibile != null ? String(a.imponibile) : "",
        aliquotaIva: a.aliquotaIva != null ? String(a.aliquotaIva) : "22",
        imposta: a.imposta != null ? String(a.imposta) : "",
        totale: a.totale != null ? String(a.totale) : "",
        nazione: a.nazione,
        valuta: a.valuta || "EUR",
      });
    });
  }

  function registra() {
    const file = fileTenuto.current;
    if (!file) {
      setErrore("Rileggi il file prima di registrare.");
      return;
    }
    setErrore(null);
    setMsg(null);
    const body = new FormData();
    body.set("file", file);
    body.set("tipoCaricamento", tipo);
    body.set("categoria", form.categoria);
    body.set("modalitaPagamento", form.modalitaPagamento);
    body.set("esercente", form.esercente);
    body.set("partitaIva", form.partitaIva);
    body.set("dataDocumento", form.dataDocumento);
    body.set("giustificazione", form.giustificazione);
    body.set("imponibile", form.imponibile);
    body.set("aliquotaIva", form.aliquotaIva);
    body.set("imposta", form.imposta);
    body.set("totale", form.totale);
    body.set("valuta", form.valuta);
    body.set("importoValuta", form.importoValuta);
    body.set("cambio", form.cambio);
    body.set("nazione", form.nazione);
    body.set("flagEsterometro", form.flagEsterometro ? "true" : "false");
    body.set("tipoAutofattura", form.tipoAutofattura);
    body.set("progettoId", form.progettoId);
    body.set("note", form.note);
    body.set("letturaAutomatica", anteprima?.lettura === "manuale" ? "false" : "true");
    start(async () => {
      const res = await registraSpesaAction(body);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMsg("Spesa registrata. La trovi in Area fiscale → Gestione Piccole Spese.");
      setAnteprima(null);
      setForm(vuoto);
      fileTenuto.current = null;
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  const causaleObbligatoria = categoriaRichiedeCausale(form.categoria);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <p className="text-sm text-slate-700">
          Carica lo scontrino, la fattura estera o il file XML. I PDF con testo
          e gli XML vengono letti qui; le foto si compilano a mano. Nulla viene
          salvato finché non confermi.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Tipo documento
            </span>
            <select
              className={field}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoCaricamentoSpesa)}
            >
              {TIPI_CARICAMENTO_SPESA.map((k) => (
                <option key={k} value={k}>
                  {LABEL_TIPO_CARICAMENTO[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              File
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf,.xml,.p7m,application/pkcs7-mime"
              className={field}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={analizza}
          className="mt-4 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending && !anteprima ? "Lettura…" : "Leggi e verifica"}
        </button>
      </section>

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

      {anteprima ? (
        <section className="space-y-4 rounded-xl border border-[var(--border)] bg-white p-4">
          <p className="text-sm text-slate-700">{anteprima.avviso}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Esercente / fornitore
              </span>
              <input
                className={field}
                value={form.esercente}
                onChange={(e) => patch({ esercente: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Data documento
              </span>
              <input
                type="date"
                className={field}
                value={form.dataDocumento}
                onChange={(e) => patch({ dataDocumento: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                P. IVA
              </span>
              <input
                className={field}
                value={form.partitaIva}
                onChange={(e) => patch({ partitaIva: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Categoria
              </span>
              <select
                className={field}
                value={form.categoria}
                onChange={(e) => patch({ categoria: e.target.value as CategoriaSpesa })}
              >
                {CATEGORIE_SPESA.map((k) => (
                  <option key={k} value={k}>
                    {LABEL_CATEGORIA_SPESA[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Pagamento
              </span>
              <select
                className={field}
                value={form.modalitaPagamento}
                onChange={(e) =>
                  patch({
                    modalitaPagamento: e.target.value as (typeof vuoto)["modalitaPagamento"],
                  })
                }
              >
                {PAGAMENTI_SPESA.map((k) => (
                  <option key={k} value={k}>
                    {LABEL_PAGAMENTO_SPESA[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Giustificazione / causale
                {causaleObbligatoria ? " (obbligatoria)" : ""}
              </span>
              <textarea
                className={field}
                rows={2}
                value={form.giustificazione}
                onChange={(e) => patch({ giustificazione: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Imponibile €
              </span>
              <input
                className={field}
                inputMode="decimal"
                value={form.imponibile}
                onChange={(e) => patch({ imponibile: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Aliquota IVA %
              </span>
              <input
                className={field}
                inputMode="decimal"
                value={form.aliquotaIva}
                onChange={(e) => patch({ aliquotaIva: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                IVA €
              </span>
              <input
                className={field}
                inputMode="decimal"
                value={form.imposta}
                onChange={(e) => patch({ imposta: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Totale €
              </span>
              <input
                className={field}
                inputMode="decimal"
                value={form.totale}
                onChange={(e) => patch({ totale: e.target.value })}
              />
            </label>
            {tipo === "fattura_estera" ? (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                    Nazione fornitore
                  </span>
                  <input
                    className={field}
                    value={form.nazione}
                    onChange={(e) => patch({ nazione: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                    Valuta
                  </span>
                  <input
                    className={field}
                    maxLength={3}
                    value={form.valuta}
                    onChange={(e) => patch({ valuta: e.target.value.toUpperCase() })}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                    Importo in valuta
                  </span>
                  <input
                    className={field}
                    inputMode="decimal"
                    value={form.importoValuta}
                    onChange={(e) => patch({ importoValuta: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                    Cambio (euro per 1 unità)
                  </span>
                  <input
                    className={field}
                    inputMode="decimal"
                    value={form.cambio}
                    onChange={(e) => patch({ cambio: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                    Autofattura
                  </span>
                  <select
                    className={field}
                    value={form.tipoAutofattura}
                    onChange={(e) => patch({ tipoAutofattura: e.target.value })}
                  >
                    <option value="">Nessuna</option>
                    <option value="TD17">TD17 servizi estero</option>
                    <option value="TD18">TD18 beni intracomunitari</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.flagEsterometro}
                    onChange={(e) => patch({ flagEsterometro: e.target.checked })}
                  />
                  Da gestire in Esterometro
                </label>
              </>
            ) : null}
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Progetto o viaggio (facoltativo)
              </span>
              <select
                className={field}
                value={form.progettoId}
                onChange={(e) => patch({ progettoId: e.target.value })}
              >
                <option value="">Nessun collegamento</option>
                {progetti.map((p) => (
                  <option key={p.id} value={p.id}>
                    {LABEL_TIPO_PROGETTO[p.tipo]} — {p.titolo}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Note
              </span>
              <textarea
                className={field}
                rows={2}
                value={form.note}
                onChange={(e) => patch({ note: e.target.value })}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={registra}
            className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Registrazione…" : "Conferma e registra"}
          </button>
        </section>
      ) : null}
    </div>
  );
}
