"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  anteprimaSpesaAction,
  listCausaliSpesaAction,
  listProgettiSpesaAction,
  listRicevuteRecentiSpesaAction,
  registraSpesaAction,
  suggerisciEsercentiSpesaAction,
  urlAllegatoSpesaAction,
  type CausaleSpesaUsata,
  type RicevutaRecenteSpesa,
  type SuggerimentoEsercenteSpesa,
} from "@/app/actions/spese";
import { formatDateIt, formatEuro } from "@/lib/amministrazione/fatture";
import { ScontrinoZoomPane } from "@/components/fiscale/ScontrinoZoomPane";
import {
  CATEGORIE_SPESA,
  LABEL_CATEGORIA_SPESA,
  LABEL_PAGAMENTO_SPESA,
  LABEL_STATO_SPESA,
  LABEL_TIPO_CARICAMENTO,
  LABEL_TIPO_PROGETTO,
  PAGAMENTI_SPESA,
  TIPI_CARICAMENTO_SPESA,
  calcolaRigheScontrino,
  categoriaRichiedeCausale,
  type AnteprimaSpesa,
  type CategoriaSpesa,
  type SpesaProgettoView,
  type TipoCaricamentoSpesa,
} from "@/lib/fiscale/spese";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";

function formatSalvataggio(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function testoRicerca(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("it-IT")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function CausaliUsateFinestra({
  corrente,
  onScegli,
  onClose,
}: {
  corrente: string;
  onScegli: (testo: string) => void;
  onClose: () => void;
}) {
  const [causali, setCausali] = useState<CausaleSpesaUsata[]>([]);
  const [errore, setErrore] = useState("");
  const [caricamento, setCaricamento] = useState(true);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    let vivo = true;
    void listCausaliSpesaAction().then((res) => {
      if (!vivo) return;
      setCaricamento(false);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setCausali(res.causali);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const chiave = testoRicerca(filtro);
  const visibili = chiave
    ? causali.filter((voce) => testoRicerca(voce.testo).includes(chiave))
    : causali;
  const sceltaAttuale = testoRicerca(corrente);
  let elencoCausali = (
    <ul>
      {visibili.map((voce) => {
        const scelta = testoRicerca(voce.testo) === sceltaAttuale;
        return (
          <li key={voce.testo} className="border-b border-slate-100 last:border-b-0">
            <button
              type="button"
              onClick={() => onScegli(voce.testo)}
              className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                scelta ? "bg-slate-100" : ""
              }`}
            >
              <span>{voce.testo}</span>
              <span className="shrink-0 text-xs text-slate-500">
                {voce.usi === 1 ? "1 volta" : `${voce.usi} volte`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
  if (caricamento) {
    elencoCausali = <p className="px-3 py-3 text-sm text-slate-500">Caricamento…</p>;
  } else if (errore) {
    elencoCausali = <p className="px-3 py-3 text-sm text-red-700">{errore}</p>;
  } else if (visibili.length === 0) {
    elencoCausali = (
      <p className="px-3 py-3 text-sm text-slate-500">
        {causali.length === 0
          ? "Nessuna causale registrata finora."
          : "Nessuna causale corrisponde alla ricerca."}
      </p>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto bg-slate-950/50 px-3 py-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="causali-usate-titolo"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
      >
        <h3 id="causali-usate-titolo" className="text-base font-semibold text-slate-900">
          Causali già usate
        </h3>
        <p className="mt-1 text-xs text-slate-600">
          Elenco delle giustificazioni scritte sugli scontrini finora. Scegline
          una per non registrarne una nuova uguale.
        </p>
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Cerca una causale"
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-slate-200">
          {elencoCausali}
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function EsercenteSpesaCampo({
  value,
  onChange,
  onSelect,
}: {
  value: string;
  onChange: (nome: string) => void;
  onSelect: (voce: SuggerimentoEsercenteSpesa) => void;
}) {
  const [catalogo, setCatalogo] = useState<SuggerimentoEsercenteSpesa[]>([]);
  const [aperto, setAperto] = useState(false);
  const [attivo, setAttivo] = useState(0);

  useEffect(() => {
    let vivo = true;
    void suggerisciEsercentiSpesaAction().then((res) => {
      if (!vivo || !res.success) return;
      setCatalogo(res.voci);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const query = testoRicerca(value);
  const suggerimenti =
    query.length === 0
      ? []
      : catalogo
          .filter((voce) => {
            const nome = testoRicerca(voce.nome);
            return nome.includes(query) && nome !== query;
          })
          .sort((a, b) => {
            const aPrefisso = testoRicerca(a.nome).startsWith(query) ? 0 : 1;
            const bPrefisso = testoRicerca(b.nome).startsWith(query) ? 0 : 1;
            if (b.usi !== a.usi) return b.usi - a.usi;
            if (aPrefisso !== bPrefisso) return aPrefisso - bPrefisso;
            return a.nome.localeCompare(b.nome, "it");
          })
          .slice(0, 8);

  useEffect(() => {
    setAttivo(0);
  }, [query]);

  function scegli(voce: SuggerimentoEsercenteSpesa) {
    onSelect(voce);
    setAperto(false);
  }

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAperto(false);
      }}
    >
      <input
        className={field}
        value={value}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={aperto && suggerimenti.length > 0}
        onChange={(e) => {
          onChange(e.target.value);
          setAperto(true);
        }}
        onFocus={() => setAperto(true)}
        onKeyDown={(e) => {
          if (!aperto || suggerimenti.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAttivo((i) => (i + 1) % suggerimenti.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAttivo((i) => (i - 1 + suggerimenti.length) % suggerimenti.length);
          } else if (e.key === "Enter" && suggerimenti[attivo]) {
            e.preventDefault();
            scegli(suggerimenti[attivo]);
          } else if (e.key === "Escape") {
            setAperto(false);
          }
        }}
      />
      {aperto && suggerimenti.length > 0 ? (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[var(--border)] bg-white py-1 shadow-lg"
        >
          {suggerimenti.map((voce, index) => (
            <li key={voce.nome}>
              <button
                type="button"
                role="option"
                aria-selected={index === attivo}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                  index === attivo ? "bg-slate-100" : "hover:bg-slate-50"
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setAttivo(index)}
                onClick={() => scegli(voce)}
              >
                <span className="min-w-0">
                  <span className="block truncate">{voce.nome}</span>
                  {voce.partitaIva ? (
                    <span className="block text-xs text-[var(--muted)]">
                      P. IVA {voce.partitaIva}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-[var(--muted)]">
                  {voce.usi === 1 ? "1 volta" : `${voce.usi} volte`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function vistaDaFile(file: File): "image" | "pdf" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return "pdf";
  }
  return null;
}

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

type RigaForm = {
  key: string;
  descrizione: string;
  prezzo: string;
  quantita: string;
  aliquotaIva: string;
};

function rigaVuota(partial?: {
  descrizione?: string;
  prezzo?: string;
  quantita?: string;
  aliquotaIva?: string;
}): RigaForm {
  return {
    key: crypto.randomUUID(),
    descrizione: partial?.descrizione ?? "",
    prezzo: partial?.prezzo ?? "",
    quantita: partial?.quantita ?? "1",
    aliquotaIva: partial?.aliquotaIva ?? "22",
  };
}

function decimale(raw: string): number | null {
  const testo = raw.trim().replace(",", ".");
  if (!testo) return null;
  const valore = Number(testo);
  return Number.isFinite(valore) ? valore : null;
}

export function SpeseCaricamentoBoard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraFallbackRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const urlRef = useRef<string | null>(null);
  const fileTenuto = useRef<File | null>(null);
  const [tipo, setTipo] = useState<TipoCaricamentoSpesa>("scontrino");
  const [fileScelto, setFileScelto] = useState<File | null>(null);
  const [anteprimaUrl, setAnteprimaUrl] = useState<string | null>(null);
  const [vistaFile, setVistaFile] = useState<"image" | "pdf" | null>(null);
  const [cameraAperta, setCameraAperta] = useState(false);
  const [anteprima, setAnteprima] = useState<AnteprimaSpesa | null>(null);
  const [form, setForm] = useState(vuoto);
  const [righe, setRighe] = useState<RigaForm[]>(() => [rigaVuota()]);
  const [prezziIvaCompresa, setPrezziIvaCompresa] = useState(false);
  const [privaIva, setPrivaIva] = useState(false);
  const [progetti, setProgetti] = useState<SpesaProgettoView[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [causaliAperte, setCausaliAperte] = useState(false);
  const [scelteCausale, setScelteCausale] = useState<
    { testo: string; usi: number }[]
  >([]);
  const [ricevute, setRicevute] = useState<RicevutaRecenteSpesa[]>([]);
  const [ricevuteErrore, setRicevuteErrore] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function patch(partial: Partial<typeof vuoto>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  async function caricaRicevute() {
    const res = await listRicevuteRecentiSpesaAction();
    if (!res.success) {
      setRicevuteErrore(res.error);
      setRicevute([]);
      return;
    }
    setRicevuteErrore(null);
    setRicevute(res.ricevute);
  }

  useEffect(() => {
    void caricaRicevute();
  }, []);

  async function apriRicevuta(id: string) {
    const res = await urlAllegatoSpesaAction(id);
    if (!res.success) {
      setRicevuteErrore(res.error);
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  function chiudiCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraAperta(false);
  }

  function impostaFile(file: File) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const vista = vistaDaFile(file);
    urlRef.current = vista ? URL.createObjectURL(file) : null;
    setVistaFile(vista);
    setAnteprimaUrl(urlRef.current);
    fileTenuto.current = file;
    setFileScelto(file);
    setAnteprima(null);
    setMsg(null);
    setErrore(null);
  }

  useEffect(() => {
    if (!cameraAperta || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => undefined);
  }, [cameraAperta]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const inserimentoManuale = anteprima?.lettura === "manuale";

  useEffect(() => {
    if (!inserimentoManuale) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [inserimentoManuale]);

  async function apriCamera() {
    setErrore(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraFallbackRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraAperta(true);
    } catch {
      cameraFallbackRef.current?.click();
    }
  }

  function scatta() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setErrore("La fotocamera non è ancora pronta.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setErrore("Non sono riuscito a salvare la foto.");
          return;
        }
        const nome = `spesa-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.jpg`;
        impostaFile(new File([blob], nome, { type: "image/jpeg" }));
        chiudiCamera();
      },
      "image/jpeg",
      0.92
    );
  }

  function analizza() {
    const file = fileTenuto.current;
    if (!file) {
      setErrore("Scatta una foto oppure carica un file.");
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
      if (tipo === "scontrino") {
        const lette = a.righe
          .filter((riga) => riga.descrizione || riga.imponibile != null || riga.totale != null)
          .map((riga) => {
            const numero =
              riga.quantita != null && riga.quantita > 0 ? riga.quantita : 1;
            const importo = riga.imponibile ?? riga.totale;
            const prezzo =
              importo != null ? String(Math.round((importo / numero) * 100) / 100) : "";
            return rigaVuota({
              descrizione: riga.descrizione,
              prezzo,
              quantita: String(numero),
              aliquotaIva:
                riga.aliquotaIva != null ? String(riga.aliquotaIva) : "22",
            });
          });
        setRighe(lette.length ? lette : [rigaVuota()]);
      }
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
    if (tipo === "scontrino") {
      const input = [];
      for (const riga of righe) {
        const prezzoUnitario = decimale(riga.prezzo);
        const quantita = decimale(riga.quantita);
        const aliquotaIva = privaIva ? 0 : decimale(riga.aliquotaIva);
        if (!riga.descrizione.trim()) {
          setErrore("Ogni riga ha una descrizione.");
          return;
        }
        if (prezzoUnitario == null || prezzoUnitario < 0) {
          setErrore("Inserisci il prezzo di ogni prodotto.");
          return;
        }
        if (quantita == null || quantita <= 0) {
          setErrore("Indica il numero di pezzi di ogni prodotto.");
          return;
        }
        if (!privaIva && (aliquotaIva == null || aliquotaIva < 0 || aliquotaIva > 100)) {
          setErrore("L'aliquota IVA di ogni riga deve essere tra 0 e 100.");
          return;
        }
        input.push({
          descrizione: riga.descrizione.trim(),
          prezzoUnitario,
          quantita,
          aliquotaIva: aliquotaIva ?? 0,
        });
      }
      const calc = calcolaRigheScontrino(input, privaIva ? false : prezziIvaCompresa);
      if (calc.totale <= 0) {
        setErrore("Il totale calcolato deve essere maggiore di zero.");
        return;
      }
      body.set("imponibile", String(calc.imponibile));
      body.set("aliquotaIva", String(calc.aliquotaIva));
      body.set("imposta", String(calc.imposta));
      body.set("totale", String(calc.totale));
      body.set("prezziIvaCompresa", !privaIva && prezziIvaCompresa ? "true" : "false");
      body.set("privaIva", privaIva ? "true" : "false");
      body.set("righe", JSON.stringify(input));
    } else {
      body.set("imponibile", form.imponibile);
      body.set("aliquotaIva", form.aliquotaIva);
      body.set("imposta", form.imposta);
      body.set("totale", form.totale);
    }
    body.set("valuta", form.valuta);
    body.set("importoValuta", form.importoValuta);
    body.set("cambio", form.cambio);
    body.set("nazione", form.nazione);
    body.set("flagEsterometro", form.flagEsterometro ? "true" : "false");
    body.set("tipoAutofattura", form.tipoAutofattura);
    body.set("progettoId", form.progettoId);
    body.set("note", form.note);
    body.set("letturaAutomatica", anteprima?.lettura === "manuale" ? "false" : "true");
    if (anteprima?.letturaJson) {
      body.set("letturaJson", JSON.stringify(anteprima.letturaJson));
    }
    start(async () => {
      const res = await registraSpesaAction(body);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMsg("Spesa registrata. La trovi in Area fiscale → Gestione Piccole Spese.");
      void caricaRicevute();
      setAnteprima(null);
      setForm(vuoto);
      setScelteCausale([]);
      setPrivaIva(false);
      setPrezziIvaCompresa(false);
      setRighe([rigaVuota()]);
      fileTenuto.current = null;
      setFileScelto(null);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      setAnteprimaUrl(null);
      setVistaFile(null);
      chiudiCamera();
      if (fileRef.current) fileRef.current.value = "";
      if (cameraFallbackRef.current) cameraFallbackRef.current.value = "";
    });
  }

  const causaleObbligatoria = categoriaRichiedeCausale(form.categoria);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <p className="text-sm text-slate-700">
          Scatta una foto con la fotocamera oppure carica un file (foto, PDF o
          XML). I PDF con testo e gli XML vengono letti qui; le foto si
          compilano a mano. Nulla viene salvato finché non confermi.
        </p>
        <label className="mt-4 block max-w-sm text-sm">
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
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void apriCamera()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Fotocamera
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Carica file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,.xml,.p7m,application/pkcs7-mime"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) impostaFile(file);
            }}
          />
          <input
            ref={cameraFallbackRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) impostaFile(file);
            }}
          />
        </div>
        {cameraAperta ? (
          <div className="mt-4 space-y-2">
            <video
              ref={videoRef}
              playsInline
              muted
              className="max-h-80 w-full rounded-lg bg-black object-contain"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={scatta}
                className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
              >
                Scatta
              </button>
              <button
                type="button"
                onClick={chiudiCamera}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                Chiudi fotocamera
              </button>
            </div>
          </div>
        ) : null}
        {fileScelto ? (
          <div className="mt-4 flex items-center gap-3">
            {anteprimaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={anteprimaUrl}
                alt="Documento scelto"
                className="h-20 w-20 rounded-lg border border-slate-200 object-cover"
              />
            ) : null}
            <p className="text-sm text-slate-700">
              Pronto: <span className="font-medium">{fileScelto.name}</span>
            </p>
          </div>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={analizza}
          className="mt-4 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending && !anteprima ? "Lettura…" : "Leggi e verifica"}
        </button>
      </section>

      {!inserimentoManuale && errore ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errore}
        </p>
      ) : null}
      {!inserimentoManuale && msg ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {msg}
        </p>
      ) : null}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-semibold text-slate-900">
          Ricevute salvate negli ultimi 30 giorni
        </h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Le più recenti per prime, in base a quando sono state registrate.
        </p>
        {ricevuteErrore ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {ricevuteErrore}
          </p>
        ) : null}
        {ricevute.length === 0 ? (
          ricevuteErrore ? null : (
            <p className="mt-3 text-sm text-slate-500">
              Nessuna ricevuta salvata negli ultimi 30 giorni.
            </p>
          )
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {ricevute.map((voce) => (
              <li key={voce.id} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{voce.esercente}</p>
                  <p className="text-xs text-[var(--muted)]">
                    Salvata {formatSalvataggio(voce.salvataIl)}
                    {" · "}
                    documento {formatDateIt(voce.dataDocumento)}
                    {" · "}
                    {LABEL_TIPO_CARICAMENTO[voce.tipoCaricamento]}
                    {voce.privaIva ? " · priva di IVA" : ""}
                    {" · "}
                    {LABEL_STATO_SPESA[voce.stato]}
                  </p>
                  {voce.giustificazione ? (
                    <p className="mt-0.5 text-xs text-slate-700">{voce.giustificazione}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="text-sm tabular-nums">
                    {formatEuro(voce.totale)}
                    {voce.valuta !== "EUR" ? (
                      <span className="block text-xs text-[var(--muted)]">{voce.valuta}</span>
                    ) : null}
                  </p>
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-2 py-1 text-xs"
                    onClick={() => void apriRicevuta(voce.id)}
                  >
                    Documento
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(() => {
        const modulo = anteprima ? (
        <section
          className={
            inserimentoManuale
              ? "space-y-4"
              : "space-y-4 rounded-xl border border-[var(--border)] bg-white p-4"
          }
        >
          {inserimentoManuale && errore ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {errore}
            </p>
          ) : null}
          {inserimentoManuale && msg ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {msg}
            </p>
          ) : null}
          <p className="text-sm text-slate-700">{anteprima.avviso}</p>
          {anteprima.uscitaImporto != null ? (
            <p className="text-sm font-medium text-slate-900">
              Uscita da registrare: {anteprima.uscitaImporto.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
              {anteprima.ivaDetraibile
                ? " · IVA detraibile solo se la fattura è inerente."
                : " · IVA dello scontrino inclusa nel costo, non detraibile."}
            </p>
          ) : null}
          {tipo !== "scontrino" && anteprima.righe.length ? (
            <ul className="space-y-1 text-sm text-slate-700">
              {anteprima.righe.map((riga, index) => (
                <li key={`${riga.descrizione}-${index}`} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{riga.descrizione || "Riga"}</span>
                  <span className="shrink-0 tabular-nums">
                    {riga.totale != null
                      ? riga.totale.toLocaleString("it-IT", { style: "currency", currency: "EUR" })
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Esercente / fornitore
              </span>
              <EsercenteSpesaCampo
                value={form.esercente}
                onChange={(esercente) => {
                  setScelteCausale([]);
                  patch({ esercente });
                }}
                onSelect={(voce) => {
                  const base = voce.partitaIva
                    ? { esercente: voce.nome, partitaIva: voce.partitaIva }
                    : { esercente: voce.nome };
                  if (!inserimentoManuale || voce.giustificazioni.length === 0) {
                    setScelteCausale([]);
                    patch(base);
                    return;
                  }
                  if (voce.giustificazioni.length === 1) {
                    setScelteCausale([]);
                    patch({
                      ...base,
                      giustificazione: voce.giustificazioni[0].testo,
                    });
                    return;
                  }
                  setScelteCausale(voce.giustificazioni);
                  patch(base);
                }}
              />
            </div>
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
                {tipo === "scontrino" && privaIva ? " (non obbligatoria)" : ""}
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
            <div className="block text-sm sm:col-span-2">
              <span className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-[var(--muted)]">
                <span>
                  Giustificazione / causale
                  {causaleObbligatoria ? " (obbligatoria)" : ""}
                </span>
                {tipo === "scontrino" ? (
                  <button
                    type="button"
                    onClick={() => setCausaliAperte(true)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                  >
                    Causali già usate
                  </button>
                ) : null}
              </span>
              {inserimentoManuale && scelteCausale.length > 1 ? (
                <div className="mb-2 flex flex-wrap gap-2">
                  {scelteCausale.map((voce) => {
                    const scelta = form.giustificazione.trim() === voce.testo;
                    return (
                      <button
                        key={voce.testo}
                        type="button"
                        onClick={() => patch({ giustificazione: voce.testo })}
                        className={`max-w-full rounded-lg border px-2.5 py-1.5 text-left text-xs ${
                          scelta
                            ? "border-[var(--primary)] bg-slate-100 text-slate-900"
                            : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                        }`}
                      >
                        <span className="block">{voce.testo}</span>
                        <span className="text-[var(--muted)]">
                          {voce.usi === 1 ? "1 volta" : `${voce.usi} volte`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <textarea
                className={field}
                rows={2}
                value={form.giustificazione}
                onChange={(e) => patch({ giustificazione: e.target.value })}
              />
            </div>
            {tipo === "scontrino" ? (
              <div className="space-y-2 sm:col-span-2">
                <label className="flex items-start gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={privaIva}
                    onChange={(e) => {
                      const attivo = e.target.checked;
                      setPrivaIva(attivo);
                      if (attivo) {
                        setPrezziIvaCompresa(false);
                        setRighe((prev) =>
                          prev.map((item) => ({ ...item, aliquotaIva: "0" }))
                        );
                      } else {
                        setRighe((prev) =>
                          prev.map((item) =>
                            item.aliquotaIva === "0"
                              ? { ...item, aliquotaIva: "22" }
                              : item
                          )
                        );
                      }
                    }}
                  />
                  <span>
                    Ricevuta priva di IVA (taxi e simili). L&apos;importo è
                    tutto costo, senza imposta. La partita IVA non è
                    obbligatoria.
                  </span>
                </label>
                {privaIva ? null : (
                <label className="flex items-start gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={prezziIvaCompresa}
                    onChange={(e) => setPrezziIvaCompresa(e.target.checked)}
                  />
                  <span>
                    I prezzi inseriti sono IVA compresa. Il totale della riga
                    resta prezzo × numero; imponibile e IVA si scorporano con
                    l&apos;aliquota della riga.
                  </span>
                </label>
                )}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">Righe</p>
                  <button
                    type="button"
                    onClick={() => setRighe((prev) => [...prev, rigaVuota()])}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                  >
                    Aggiungi riga
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-600">
                      <tr>
                        <th className="px-2 py-2">Descrizione</th>
                        <th className="px-2 py-2">Prezzo</th>
                        <th className="px-2 py-2">Numero</th>
                        {privaIva ? null : <th className="px-2 py-2">% IVA</th>}
                        {prezziIvaCompresa ? (
                          <>
                            <th className="px-2 py-2 text-right">Imponibile</th>
                            <th className="px-2 py-2 text-right">IVA</th>
                          </>
                        ) : null}
                        <th className="px-2 py-2 text-right">Totale</th>
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {righe.map((riga) => {
                        const prezzo = decimale(riga.prezzo) ?? 0;
                        const numero = decimale(riga.quantita) ?? 0;
                        const aliquota = decimale(riga.aliquotaIva) ?? 0;
                        const calcRiga = calcolaRigheScontrino(
                          [
                            {
                              descrizione: riga.descrizione || "Voce",
                              prezzoUnitario: prezzo,
                              quantita: numero > 0 ? numero : 0,
                              aliquotaIva: aliquota,
                            },
                          ],
                          prezziIvaCompresa
                        ).righe[0];
                        const totaleRiga = prezziIvaCompresa
                          ? (calcRiga?.totale ?? 0)
                          : Math.round((prezzo * numero + Number.EPSILON) * 100) / 100;
                        return (
                          <tr key={riga.key} className="border-t border-slate-100">
                            <td className="px-2 py-2">
                              <input
                                className={field}
                                value={riga.descrizione}
                                onChange={(e) =>
                                  setRighe((prev) =>
                                    prev.map((item) =>
                                      item.key === riga.key
                                        ? { ...item, descrizione: e.target.value }
                                        : item
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="w-28 px-2 py-2">
                              <input
                                className={field}
                                inputMode="decimal"
                                value={riga.prezzo}
                                onChange={(e) =>
                                  setRighe((prev) =>
                                    prev.map((item) =>
                                      item.key === riga.key
                                        ? { ...item, prezzo: e.target.value }
                                        : item
                                    )
                                  )
                                }
                              />
                            </td>
                            <td className="w-24 px-2 py-2">
                              <input
                                className={field}
                                inputMode="decimal"
                                value={riga.quantita}
                                onChange={(e) =>
                                  setRighe((prev) =>
                                    prev.map((item) =>
                                      item.key === riga.key
                                        ? { ...item, quantita: e.target.value }
                                        : item
                                    )
                                  )
                                }
                              />
                            </td>
                            {privaIva ? null : (
                            <td className="w-24 px-2 py-2">
                              <input
                                className={field}
                                inputMode="decimal"
                                value={riga.aliquotaIva}
                                onChange={(e) =>
                                  setRighe((prev) =>
                                    prev.map((item) =>
                                      item.key === riga.key
                                        ? { ...item, aliquotaIva: e.target.value }
                                        : item
                                    )
                                  )
                                }
                              />
                            </td>
                            )}
                            {prezziIvaCompresa ? (
                              <>
                                <td className="px-2 py-2 text-right tabular-nums">
                                  {(calcRiga?.imponibile ?? 0).toLocaleString("it-IT", {
                                    style: "currency",
                                    currency: "EUR",
                                  })}
                                </td>
                                <td className="px-2 py-2 text-right tabular-nums">
                                  {(calcRiga?.imposta ?? 0).toLocaleString("it-IT", {
                                    style: "currency",
                                    currency: "EUR",
                                  })}
                                </td>
                              </>
                            ) : null}
                            <td className="px-2 py-2 text-right tabular-nums">
                              {totaleRiga.toLocaleString("it-IT", {
                                style: "currency",
                                currency: "EUR",
                              })}
                            </td>
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                disabled={righe.length === 1}
                                onClick={() =>
                                  setRighe((prev) =>
                                    prev.filter((item) => item.key !== riga.key)
                                  )
                                }
                                className="text-xs text-red-700 disabled:opacity-40"
                              >
                                Togli
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-500">
                  {privaIva
                    ? "Il totale della riga è prezzo × numero e non contiene IVA."
                    : (prezziIvaCompresa
                      ? "Il totale inserito è IVA compresa: prezzo × numero. Nella riga compaiono imponibile, IVA e totale."
                      : "Il totale della riga è prezzo × numero. Esempio: 0,45 × 6 = 2,70. L'IVA si calcola su quell'importo.")}
                </p>
                <p className="text-sm text-slate-800">
                  {(() => {
                    const calc = calcolaRigheScontrino(
                      righe.map((riga) => ({
                        descrizione: riga.descrizione || "Voce",
                        prezzoUnitario: decimale(riga.prezzo) ?? 0,
                        quantita: decimale(riga.quantita) ?? 0,
                        aliquotaIva: privaIva ? 0 : (decimale(riga.aliquotaIva) ?? 0),
                      })),
                      privaIva ? false : prezziIvaCompresa
                    );
                    const euro = (n: number) =>
                      n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
                    return privaIva
                      ? `Priva di IVA · Totale ${euro(calc.totale)}`
                      : `Imponibile ${euro(calc.imponibile)} · IVA ${euro(calc.imposta)} · Totale ${euro(calc.totale)}`;
                  })()}
                </p>
              </div>
            ) : (
              <>
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
              </>
            )}
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
        ) : null;
        if (
          inserimentoManuale &&
          anteprima &&
          modulo &&
          typeof document !== "undefined"
        ) {
          return createPortal(
            <div
              className="fixed inset-0 z-[90] flex flex-col bg-white"
              role="dialog"
              aria-modal="true"
              aria-labelledby="scontrino-manuale-title"
            >
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div>
                  <h2 id="scontrino-manuale-title" className="text-base font-semibold text-slate-900">
                    Inserimento manuale dello scontrino
                  </h2>
                  <p className="text-xs text-slate-500">
                    A sinistra il documento, a destra i dati da copiare e registrare.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAnteprima(null)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  Chiudi
                </button>
              </header>
              <div className="grid min-h-0 flex-1 grid-cols-3">
                <div className="relative col-span-1 min-h-0 border-r border-slate-200">
                  <div className="absolute inset-0">
                    {vistaFile === "image" && anteprimaUrl ? (
                      <ScontrinoZoomPane src={anteprimaUrl} alt="Scontrino da compilare" />
                    ) : vistaFile === "pdf" && anteprimaUrl ? (
                      <iframe
                        title="Scontrino"
                        src={anteprimaUrl}
                        className="h-full w-full border-0 bg-white"
                      />
                    ) : (
                      <p className="p-4 text-sm text-slate-600">
                        Questo file non ha un’anteprima visiva. I dati si compilano nel modulo a destra.
                      </p>
                    )}
                  </div>
                </div>
                <div className="col-span-2 min-h-0 overflow-y-auto p-4">{modulo}</div>
              </div>
            </div>,
            document.body
          );
        }
        return modulo;
      })()}
      {causaliAperte ? (
        <CausaliUsateFinestra
          corrente={form.giustificazione}
          onScegli={(testo) => {
            patch({ giustificazione: testo });
            setCausaliAperte(false);
          }}
          onClose={() => setCausaliAperte(false)}
        />
      ) : null}
    </div>
  );
}
