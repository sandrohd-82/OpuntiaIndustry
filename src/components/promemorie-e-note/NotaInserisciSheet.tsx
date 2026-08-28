"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  FaCamera,
  FaFileLines,
  FaIdCard,
  FaImage,
  FaLink,
  FaLocationDot,
  FaFilePen,
  FaSquarePollVertical,
  FaAddressBook,
  FaXmark,
} from "react-icons/fa6";
import {
  getChatSchedaSharePreviewAction,
  listGestionaleRubricaForChatAction,
  searchChatSchedaAction,
} from "@/app/actions/chat-share";
import { listNotaBozzePnAction } from "@/app/actions/promemorie-e-note";
import { ChatLocationMapModal } from "@/components/chat/ChatLocationMapModal";
import { ChatSchedaShareFieldsModal } from "@/components/chat/ChatSchedaShareFieldsModal";
import {
  buildChatShareActions,
  type ChatShareActionId,
  type SchedaPayload,
} from "@/lib/chat/share";
import type { SchedaSharePreview } from "@/lib/chat/scheda-share-fields";
import { schedaEntityLabel } from "@/lib/chat/types";
import {
  ensureHttpUrl,
  formatMarkdownLink,
} from "@/lib/promemorie-e-note/bozze";
import type {
  PnNotaAllegato,
  PnNotaBozza,
} from "@/lib/promemorie-e-note/types";
import { createClient } from "@/lib/supabase/client";

type Sub =
  | null
  | "link"
  | "bozza"
  | "poll"
  | "scheda"
  | "contact_gestionale"
  | "contact_device";

type Props = {
  open: boolean;
  onClose: () => void;
  /** true = amministrazione/admin: scheda e rubrica gestionale attive */
  isAdmin?: boolean;
  onInsertText: (chunk: string) => void;
  onAddAllegati: (items: PnNotaAllegato[]) => void;
  onApplyBozza: (bozza: PnNotaBozza) => void;
  onError: (msg: string) => void;
};

const MEDIA_BUCKET = "chat_media";

const iconFor: Record<ChatShareActionId | "link" | "bozza", ReactNode> = {
  gallery: <FaImage size={16} />,
  doc: <FaFileLines size={16} />,
  camera: <FaCamera size={16} />,
  location: <FaLocationDot size={16} />,
  contact_device: <FaAddressBook size={16} />,
  contact_gestionale: <FaAddressBook size={16} />,
  poll: <FaSquarePollVertical size={16} />,
  scheda: <FaIdCard size={16} />,
  link: <FaLink size={16} />,
  bozza: <FaFilePen size={16} />,
};

export function NotaInserisciSheet({
  open,
  onClose,
  isAdmin = true,
  onInsertText,
  onAddAllegati,
  onApplyBozza,
  onError,
}: Props) {
  const actions = useMemo(() => buildChatShareActions(isAdmin), [isAdmin]);
  const galleryRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [sub, setSub] = useState<Sub>(null);
  const [busy, setBusy] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");

  const [pollTitle, setPollTitle] = useState("");
  const [pollOpts, setPollOpts] = useState<string[]>(["", ""]);

  const [bozze, setBozze] = useState<PnNotaBozza[]>([]);
  const [bozzeLoading, setBozzeLoading] = useState(false);

  const [schedaStep, setSchedaStep] = useState<"type" | "search">("type");
  const [schedaType, setSchedaType] = useState<SchedaPayload["entityType"]>(
    "cliente"
  );
  const [schedaQ, setSchedaQ] = useState("");
  const [schedaHits, setSchedaHits] = useState<
    Array<{ id: string; title: string; subtitle: string }>
  >([]);
  const [schedaSearching, setSchedaSearching] = useState(false);
  const [schedaPreview, setSchedaPreview] = useState<SchedaSharePreview | null>(
    null
  );
  const [schedaFieldsOpen, setSchedaFieldsOpen] = useState(false);
  const [schedaPreviewLoading, setSchedaPreviewLoading] = useState(false);

  const [gestQ, setGestQ] = useState("");
  const [gestHits, setGestHits] = useState<
    Array<{ id: string; name: string; phone: string; email: string }>
  >([]);
  const [gestSearching, setGestSearching] = useState(false);

  useEffect(() => {
    if (!open) {
      setSub(null);
      setLinkUrl("");
      setLinkLabel("");
      setPollTitle("");
      setPollOpts(["", ""]);
      setMapOpen(false);
      setSchedaFieldsOpen(false);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open || sub !== "bozza") return;
    setBozzeLoading(true);
    void listNotaBozzePnAction().then((res) => {
      setBozzeLoading(false);
      if (!res.success) {
        onError(res.error);
        setBozze([]);
        return;
      }
      setBozze(res.items);
    });
  }, [open, sub, onError]);

  useEffect(() => {
    if (!open || sub !== "scheda" || schedaStep !== "search") return;
    let cancelled = false;
    setSchedaSearching(true);
    const t = window.setTimeout(() => {
      void (async () => {
        const res = await searchChatSchedaAction({
          entityType: schedaType,
          query: schedaQ,
        });
        if (cancelled) return;
        setSchedaSearching(false);
        if (!res.success) {
          onError(res.error);
          setSchedaHits([]);
          return;
        }
        setSchedaHits(res.hits);
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, sub, schedaStep, schedaType, schedaQ, onError]);

  useEffect(() => {
    if (!open || sub !== "contact_gestionale") return;
    let cancelled = false;
    setGestSearching(true);
    const t = window.setTimeout(() => {
      void (async () => {
        const res = await listGestionaleRubricaForChatAction(gestQ);
        if (cancelled) return;
        setGestSearching(false);
        if (!res.success) {
          onError(res.error);
          setGestHits([]);
          return;
        }
        setGestHits(res.contacts);
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, sub, gestQ, onError]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessione non valida");
      const out: PnNotaAllegato[] = [];
      for (const file of Array.from(files)) {
        const isVideo = (file.type || "").toLowerCase().startsWith("video/");
        const maxBytes = isVideo ? 25 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > maxBytes) {
          throw new Error(
            isVideo
              ? "Video troppo grande (max 25 MB)."
              : "Allegato troppo grande (max 10 MB)."
          );
        }
        const safe = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `note-allegati/${user.id}/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from(MEDIA_BUCKET)
          .upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (upErr) throw new Error(upErr.message);
        const { data: pub } = supabase.storage
          .from(MEDIA_BUCKET)
          .getPublicUrl(path);
        out.push({
          id: crypto.randomUUID(),
          kind: isVideo
            ? "video"
            : (file.type || "").startsWith("image/")
              ? "image"
              : "doc",
          label: file.name,
          url: pub.publicUrl,
          storagePath: path,
        });
      }
      onAddAllegati(out);
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload fallito");
    } finally {
      setBusy(false);
      if (galleryRef.current) galleryRef.current.value = "";
      if (docRef.current) docRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  async function onAction(id: ChatShareActionId | "link" | "bozza") {
    if (id === "gallery") {
      galleryRef.current?.click();
      return;
    }
    if (id === "doc") {
      docRef.current?.click();
      return;
    }
    if (id === "camera") {
      cameraRef.current?.click();
      return;
    }
    if (id === "location") {
      setMapOpen(true);
      return;
    }
    if (id === "link") {
      setSub("link");
      return;
    }
    if (id === "bozza") {
      setSub("bozza");
      return;
    }
    if (id === "poll") {
      setSub("poll");
      return;
    }
    if (id === "scheda") {
      setSchedaStep("type");
      setSub("scheda");
      return;
    }
    if (id === "contact_gestionale") {
      setGestQ("");
      setSub("contact_gestionale");
      return;
    }
    if (id === "contact_device") {
      setSub("contact_device");
      try {
        // @ts-expect-error Contact Picker API
        if (!navigator.contacts?.select) {
          onError("Contatti dispositivo non supportati su questo browser.");
          return;
        }
        // @ts-expect-error Contact Picker API
        const contacts = await navigator.contacts.select(
          ["name", "email", "tel"],
          { multiple: false }
        );
        const c = contacts?.[0];
        if (!c) return;
        const name = Array.isArray(c.name) ? c.name[0] : c.name || "Contatto";
        const phone = Array.isArray(c.tel) ? c.tel[0] : c.tel || "";
        const email = Array.isArray(c.email) ? c.email[0] : c.email || "";
        onInsertText(
          `\nContatto: ${name}${phone ? ` · ${phone}` : ""}${email ? ` · ${email}` : ""}\n`
        );
        onClose();
      } catch {
        onError("Impossibile leggere i contatti del dispositivo.");
      }
    }
  }

  function confirmLink() {
    const url = ensureHttpUrl(linkUrl);
    if (!url) {
      onError("Inserisci un URL valido (es. https://…).");
      return;
    }
    const label = linkLabel.trim() || url;
    onInsertText(formatMarkdownLink(label, url));
    onClose();
  }

  function confirmPoll() {
    const title = pollTitle.trim();
    const opts = pollOpts.map((o) => o.trim()).filter(Boolean);
    if (!title || opts.length < 2) {
      onError("Sondaggio: titolo e almeno 2 opzioni.");
      return;
    }
    onInsertText(
      `\nSondaggio: ${title}\n${opts.map((o, i) => `${i + 1}. ${o}`).join("\n")}\n`
    );
    onClose();
  }

  const headerTitle =
    sub === "link"
      ? "Inserisci link"
      : sub === "bozza"
        ? "Bozza nota"
        : sub === "poll"
          ? "Sondaggio"
          : sub === "scheda"
            ? schedaStep === "type"
              ? "Tipo di scheda"
              : `Cerca: ${schedaEntityLabel[schedaType] ?? "Scheda"}`
            : sub === "contact_gestionale"
              ? "Contatto gestionale"
              : "Inserisci";

  if (!open) return null;

  return (
    <>
      {!schedaFieldsOpen ? (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/50 sm:items-center"
          onClick={onClose}
        >
          <div
            className="w-full max-w-md rounded-t-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{headerTitle}</h2>
              <button
                type="button"
                onClick={() => {
                  if (sub === "scheda" && schedaStep === "search") {
                    setSchedaStep("type");
                    return;
                  }
                  if (sub) setSub(null);
                  else onClose();
                }}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <FaXmark size={14} />
              </button>
            </div>

            <input
              ref={galleryRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => void uploadFiles(e.target.files)}
            />
            <input
              ref={docRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.rtf,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => void uploadFiles(e.target.files)}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*,video/*"
              capture="environment"
              className="hidden"
              onChange={(e) => void uploadFiles(e.target.files)}
            />

            {sub === null ? (
              <div className="grid grid-cols-2 gap-2">
                {actions.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    disabled={!a.allowed || busy}
                    onClick={() => void onAction(a.id)}
                    className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition ${
                      a.allowed
                        ? "border-[var(--border)] hover:bg-slate-50"
                        : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-45"
                    }`}
                  >
                    <span className="text-[var(--primary)]">
                      {iconFor[a.id]}
                    </span>
                    <span className="text-xs font-semibold">{a.label}</span>
                    <span className="text-[10px] text-slate-500">
                      {a.description}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onAction("link")}
                  className="flex flex-col items-start gap-1 rounded-xl border border-[var(--border)] px-3 py-2.5 text-left hover:bg-slate-50"
                >
                  <span className="text-[var(--primary)]">{iconFor.link}</span>
                  <span className="text-xs font-semibold">Inserisci Link</span>
                  <span className="text-[10px] text-slate-500">
                    Ipertesto, apre nuova scheda
                  </span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onAction("bozza")}
                  className="flex flex-col items-start gap-1 rounded-xl border border-[var(--border)] px-3 py-2.5 text-left hover:bg-slate-50"
                >
                  <span className="text-[var(--primary)]">{iconFor.bozza}</span>
                  <span className="text-xs font-semibold">Bozza</span>
                  <span className="text-[10px] text-slate-500">
                    Template operazioni standard
                  </span>
                </button>
              </div>
            ) : null}

            {sub === "link" ? (
              <div className="space-y-3">
                <label className="block text-xs text-slate-500">
                  URL *
                  <input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://…"
                    className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs text-slate-500">
                  Testo visualizzato
                  <input
                    value={linkLabel}
                    onChange={(e) => setLinkLabel(e.target.value)}
                    placeholder="Etichetta del link"
                    className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={confirmLink}
                  className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                >
                  Inserisci link
                </button>
              </div>
            ) : null}

            {sub === "bozza" ? (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {bozzeLoading ? (
                  <p className="text-xs text-slate-500">Caricamento…</p>
                ) : bozze.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Nessuna bozza. Scrivi una nota e usa «Rivedi e Salva come
                    Bozza».
                  </p>
                ) : (
                  bozze.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        onApplyBozza(b);
                        onClose();
                      }}
                      className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-left hover:bg-amber-50"
                    >
                      <p className="text-xs font-semibold text-amber-950">
                        {b.titoloBozza}
                      </p>
                      {b.titoloNota ? (
                        <p className="mt-0.5 text-[10px] text-slate-600">
                          Titolo nota: {b.titoloNota}
                        </p>
                      ) : null}
                      <p className="mt-1 line-clamp-2 text-[10px] text-slate-500">
                        {b.bodyTemplate.slice(0, 160)}
                      </p>
                    </button>
                  ))
                )}
              </div>
            ) : null}

            {sub === "poll" ? (
              <div className="space-y-2">
                <input
                  value={pollTitle}
                  onChange={(e) => setPollTitle(e.target.value)}
                  placeholder="Titolo sondaggio"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
                {pollOpts.map((o, i) => (
                  <input
                    key={i}
                    value={o}
                    onChange={(e) => {
                      const next = [...pollOpts];
                      next[i] = e.target.value;
                      setPollOpts(next);
                    }}
                    placeholder={`Opzione ${i + 1}`}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setPollOpts((p) => [...p, ""])}
                  className="text-xs text-sky-700"
                >
                  + Opzione
                </button>
                <button
                  type="button"
                  onClick={confirmPoll}
                  className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                >
                  Inserisci nel testo
                </button>
              </div>
            ) : null}

            {sub === "scheda" && schedaStep === "type" ? (
              <div className="grid grid-cols-2 gap-2">
                {(
                  Object.keys(schedaEntityLabel) as Array<
                    SchedaPayload["entityType"]
                  >
                ).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setSchedaType(t);
                      setSchedaQ("");
                      setSchedaHits([]);
                      setSchedaStep("search");
                    }}
                    className="rounded-xl border border-[var(--border)] px-3 py-2 text-left text-xs font-medium hover:bg-slate-50"
                  >
                    {schedaEntityLabel[t]}
                  </button>
                ))}
              </div>
            ) : null}

            {sub === "scheda" && schedaStep === "search" ? (
              <div className="space-y-2">
                <input
                  value={schedaQ}
                  onChange={(e) => setSchedaQ(e.target.value)}
                  placeholder="Cerca…"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
                {schedaSearching ? (
                  <p className="text-xs text-slate-500">Ricerca…</p>
                ) : (
                  <div className="max-h-56 space-y-1 overflow-y-auto">
                    {schedaHits.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        disabled={schedaPreviewLoading}
                        onClick={() => {
                          setSchedaPreviewLoading(true);
                          void getChatSchedaSharePreviewAction({
                            entityType: schedaType,
                            entityId: h.id,
                          }).then((res) => {
                            setSchedaPreviewLoading(false);
                            if (!res.success) {
                              onError(res.error);
                              return;
                            }
                            setSchedaPreview(res.preview);
                            setSchedaFieldsOpen(true);
                          });
                        }}
                        className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-left hover:bg-slate-50"
                      >
                        <p className="text-xs font-medium">{h.title}</p>
                        <p className="text-[10px] text-slate-500">
                          {h.subtitle}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {sub === "contact_gestionale" ? (
              <div className="space-y-2">
                <input
                  value={gestQ}
                  onChange={(e) => setGestQ(e.target.value)}
                  placeholder="Cerca contatto…"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
                {gestSearching ? (
                  <p className="text-xs text-slate-500">Ricerca…</p>
                ) : (
                  <div className="max-h-56 space-y-1 overflow-y-auto">
                    {gestHits.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => {
                          onInsertText(
                            `\nContatto: ${h.name}${h.phone ? ` · ${h.phone}` : ""}${h.email ? ` · ${h.email}` : ""}\n`
                          );
                          onClose();
                        }}
                        className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-left hover:bg-slate-50"
                      >
                        <p className="text-xs font-medium">{h.name}</p>
                        <p className="text-[10px] text-slate-500">
                          {[h.phone, h.email].filter(Boolean).join(" · ")}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <ChatLocationMapModal
        open={mapOpen}
        busy={busy}
        onClose={() => setMapOpen(false)}
        onError={onError}
        onConfirm={(payload) => {
          onInsertText(
            `\nPosizione: ${payload.label} (${payload.lat.toFixed(5)}, ${payload.lng.toFixed(5)})\n`
          );
          setMapOpen(false);
          onClose();
        }}
      />

      {schedaPreview && schedaFieldsOpen ? (
        <ChatSchedaShareFieldsModal
          open={schedaFieldsOpen}
          preview={schedaPreview}
          onClose={() => {
            setSchedaFieldsOpen(false);
            setSchedaPreview(null);
          }}
          onConfirm={(payload) => {
            const lines = [
              ...payload.fields.map((f) => `· ${f.label}: ${f.value}`),
              ...payload.referenti.map(
                (r) =>
                  `· Referente: ${r.label}${r.dettaglio ? ` (${r.dettaglio})` : ""}`
              ),
            ];
            if (payload.includePrice && payload.priceValue) {
              lines.push(
                `· ${payload.priceLabel || "Prezzo"}: ${payload.priceValue}`
              );
            }
            onInsertText(
              `\nScheda ${schedaEntityLabel[payload.entityType] ?? ""}: ${payload.title}\n${lines.join("\n")}\n`
            );
            setSchedaFieldsOpen(false);
            setSchedaPreview(null);
            onClose();
          }}
        />
      ) : null}
    </>
  );
}
