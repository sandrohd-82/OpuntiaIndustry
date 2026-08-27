"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  FaCamera,
  FaFileLines,
  FaIdCard,
  FaImage,
  FaLocationDot,
  FaSquarePollVertical,
  FaAddressBook,
  FaXmark,
} from "react-icons/fa6";
import {
  createChatPollAction,
  listGestionaleRubricaForChatAction,
  searchChatSchedaAction,
} from "@/app/actions/chat-share";
import {
  buildChatShareActions,
  type ChatShareActionId,
  type ContactPayload,
  type LocationPayload,
  type SchedaPayload,
} from "@/lib/chat/share";
import { schedaEntityLabel, type ChatMessage } from "@/lib/chat/types";
import type { TopicMessage } from "@/lib/chat/topics";
import { sendChatAttachment, sendTopicAttachment } from "@/lib/chat/media";
import { insertChatMessageAndNotify } from "@/lib/chat/messages";
import { insertTopicMessage } from "@/lib/chat/topic-api";
import { createClient } from "@/lib/supabase/client";

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string;
  /** Chat 1:1 */
  conversationId?: string;
  /** Argomento di gruppo */
  topicId?: string;
  isAdmin: boolean;
  onSent: (msg: ChatMessage | TopicMessage) => void;
  onError: (msg: string) => void;
};

type Sub =
  | null
  | "location"
  | "contact"
  | "poll"
  | "scheda"
  | "contact_gestionale";

const iconFor: Record<ChatShareActionId, ReactNode> = {
  gallery: <FaImage size={16} />,
  doc: <FaFileLines size={16} />,
  camera: <FaCamera size={16} />,
  location: <FaLocationDot size={16} />,
  contact_device: <FaAddressBook size={16} />,
  contact_gestionale: <FaAddressBook size={16} />,
  poll: <FaSquarePollVertical size={16} />,
  scheda: <FaIdCard size={16} />,
};

export function ChatShareSheet({
  open,
  onClose,
  userId,
  conversationId,
  topicId,
  isAdmin,
  onSent,
  onError,
}: Props) {
  const actions = useMemo(() => buildChatShareActions(isAdmin), [isAdmin]);
  const galleryRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [sub, setSub] = useState<Sub>(null);
  const [busy, setBusy] = useState(false);

  // location
  const [locMode, setLocMode] = useState<"attuale" | "cerca" | null>(null);
  const [locQuery, setLocQuery] = useState("");
  const [locHits, setLocHits] = useState<
    Array<{ label: string; lat: number; lng: number }>
  >([]);

  // poll
  const [pollTitle, setPollTitle] = useState("");
  const [pollOpts, setPollOpts] = useState<string[]>(["", ""]);

  // scheda
  const [schedaType, setSchedaType] = useState<SchedaPayload["entityType"]>(
    "cliente"
  );
  const [schedaQ, setSchedaQ] = useState("");
  const [schedaHits, setSchedaHits] = useState<
    Array<{ id: string; title: string; subtitle: string }>
  >([]);

  // gestionale contacts
  const [gestQ, setGestQ] = useState("");
  const [gestHits, setGestHits] = useState<
    Array<{ id: string; name: string; phone: string; email: string }>
  >([]);

  if (!open) return null;
  if (!conversationId && !topicId) return null;

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const supabase = createClient();
    try {
      for (const file of Array.from(files)) {
        const msg = topicId
          ? await sendTopicAttachment(supabase, userId, topicId, file)
          : await sendChatAttachment(
              supabase,
              userId,
              conversationId!,
              file
            );
        onSent(msg);
      }
      onClose();
      setSub(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload fallito");
    } finally {
      setBusy(false);
    }
  }

  async function sendLocation(payload: LocationPayload) {
    setBusy(true);
    const supabase = createClient();
    try {
      const msg = topicId
        ? await insertTopicMessage(supabase, userId, topicId, {
            content: payload.label,
            messageKind: "location",
            payload,
          })
        : await insertChatMessageAndNotify(supabase, userId, {
            conversationId: conversationId!,
            content: payload.label,
            messageKind: "location",
            payload,
          });
      onSent(msg);
      onClose();
      setSub(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Posizione non inviata");
    } finally {
      setBusy(false);
    }
  }

  async function sendContact(payload: ContactPayload) {
    setBusy(true);
    const supabase = createClient();
    try {
      const msg = topicId
        ? await insertTopicMessage(supabase, userId, topicId, {
            content: payload.name,
            messageKind: "contact",
            payload,
          })
        : await insertChatMessageAndNotify(supabase, userId, {
            conversationId: conversationId!,
            content: payload.name,
            messageKind: "contact",
            payload,
          });
      onSent(msg);
      onClose();
      setSub(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Contatto non inviato");
    } finally {
      setBusy(false);
    }
  }

  async function sendScheda(payload: SchedaPayload) {
    setBusy(true);
    const supabase = createClient();
    try {
      const msg = topicId
        ? await insertTopicMessage(supabase, userId, topicId, {
            content: payload.title,
            messageKind: "scheda",
            payload,
          })
        : await insertChatMessageAndNotify(supabase, userId, {
            conversationId: conversationId!,
            content: payload.title,
            messageKind: "scheda",
            payload,
          });
      onSent(msg);
      onClose();
      setSub(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Scheda non inviata");
    } finally {
      setBusy(false);
    }
  }

  async function onAction(id: ChatShareActionId) {
    const action = actions.find((a) => a.id === id);
    if (!action?.allowed) return;
    if (id === "gallery") galleryRef.current?.click();
    else if (id === "doc") docRef.current?.click();
    else if (id === "camera") cameraRef.current?.click();
    else if (id === "location") {
      setLocMode(null);
      setSub("location");
    } else if (id === "contact_device") {
      await pickDeviceContact();
    } else if (id === "contact_gestionale") {
      setSub("contact_gestionale");
      void loadGest("");
    } else if (id === "poll") {
      setPollTitle("");
      setPollOpts(["", ""]);
      setSub("poll");
    } else if (id === "scheda") {
      setSub("scheda");
      setSchedaHits([]);
    }
  }

  async function pickDeviceContact() {
    type ContactPicker = {
      select: (
        props: string[],
        opts: { multiple: boolean }
      ) => Promise<Array<Record<string, Array<{ value?: string } | string>>>>;
    };
    const nav = navigator as Navigator & { contacts?: ContactPicker };
    if (nav.contacts?.select) {
      try {
        const list = await nav.contacts.select(["name", "email", "tel"], {
          multiple: false,
        });
        const c = list[0];
        if (!c) return;
        const nameArr = c.name as Array<string> | undefined;
        const telArr = c.tel as Array<{ value?: string } | string> | undefined;
        const emailArr = c.email as
          | Array<{ value?: string } | string>
          | undefined;
        const name = nameArr?.[0] ?? "Contatto";
        const phone =
          typeof telArr?.[0] === "string"
            ? telArr[0]
            : telArr?.[0]?.value ?? "";
        const email =
          typeof emailArr?.[0] === "string"
            ? emailArr[0]
            : emailArr?.[0]?.value ?? "";
        await sendContact({
          name,
          phone,
          email,
          source: "device",
          rubricaId: null,
        });
        return;
      } catch {
        // fallback form
      }
    }
    const name = window.prompt("Nome contatto?");
    if (!name?.trim()) return;
    const phone = window.prompt("Telefono (opzionale)?") ?? "";
    const email = window.prompt("Email (opzionale)?") ?? "";
    await sendContact({
      name: name.trim(),
      phone,
      email,
      source: "device",
      rubricaId: null,
    });
  }

  async function shareCurrentLocation() {
    if (!navigator.geolocation) {
      onError("Geolocalizzazione non disponibile.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const label = `Posizione attuale (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
        await sendLocation({ lat, lng, label, source: "attuale" });
      },
      () => {
        setBusy(false);
        onError("Impossibile ottenere la posizione.");
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  async function searchPlaces() {
    const q = locQuery.trim();
    if (!q) return;
    setBusy(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=8&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      const data = (await res.json()) as Array<{
        display_name: string;
        lat: string;
        lon: string;
      }>;
      setLocHits(
        data.map((d) => ({
          label: d.display_name,
          lat: Number(d.lat),
          lng: Number(d.lon),
        }))
      );
    } catch {
      onError("Ricerca posizione fallita.");
    } finally {
      setBusy(false);
    }
  }

  async function loadGest(q: string) {
    const res = await listGestionaleRubricaForChatAction(q);
    if (!res.success) {
      onError(res.error);
      return;
    }
    setGestHits(res.contacts);
  }

  async function loadScheda() {
    setBusy(true);
    const res = await searchChatSchedaAction({
      entityType: schedaType,
      query: schedaQ,
    });
    setBusy(false);
    if (!res.success) {
      onError(res.error);
      return;
    }
    setSchedaHits(res.hits);
  }

  async function createPoll() {
    const options = pollOpts.map((o) => o.trim()).filter(Boolean);
    if (!pollTitle.trim() || options.length < 1) {
      onError("Titolo e almeno una risposta sono obbligatori.");
      return;
    }
    setBusy(true);
    const res = await createChatPollAction({
      ...(topicId ? { topicId } : { conversationId }),
      titolo: pollTitle.trim(),
      options,
    });
    setBusy(false);
    if (!res.success) {
      onError(res.error);
      return;
    }
    onSent(res.message);
    onClose();
    setSub(null);
  }

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-950/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {sub === null ? "Condividi" : "Dettaglio"}
          </h2>
          <button
            type="button"
            onClick={() => {
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
                title={
                  a.allowed
                    ? a.description
                    : "Non autorizzato (solo admin)"
                }
              >
                <span className="text-[var(--primary)]">{iconFor[a.id]}</span>
                <span className="text-xs font-semibold">{a.label}</span>
                <span className="text-[10px] text-slate-500">
                  {a.allowed
                    ? a.description
                    : a.adminOnly
                      ? "Solo admin"
                      : "Non disponibile"}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {sub === "location" ? (
          <div className="space-y-3">
            {!locMode ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void shareCurrentLocation()}
                  className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm text-white"
                >
                  Attuale
                </button>
                <button
                  type="button"
                  onClick={() => setLocMode("cerca")}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  Cerca
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  value={locQuery}
                  onChange={(e) => setLocQuery(e.target.value)}
                  placeholder="Via, città…"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void searchPlaces()}
                  className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm text-white"
                >
                  Cerca sulla mappa
                </button>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {locHits.map((h) => (
                    <button
                      key={`${h.lat}-${h.lng}-${h.label}`}
                      type="button"
                      className="block w-full rounded border border-[var(--border)] px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                      onClick={() =>
                        void sendLocation({
                          lat: h.lat,
                          lng: h.lng,
                          label: h.label,
                          source: "cerca",
                        })
                      }
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>
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
                onChange={(e) =>
                  setPollOpts((prev) =>
                    prev.map((x, j) => (j === i ? e.target.value : x))
                  )
                }
                placeholder={`Risposta ${i + 1}`}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            ))}
            <button
              type="button"
              onClick={() => setPollOpts((p) => [...p, ""])}
              className="text-xs text-[var(--primary)] underline"
            >
              + Aggiungi risposta
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void createPoll()}
              className="w-full rounded-lg bg-[var(--primary)] px-3 py-2 text-sm text-white"
            >
              Pubblica sondaggio
            </button>
          </div>
        ) : null}

        {sub === "contact_gestionale" ? (
          <div className="space-y-2">
            <input
              value={gestQ}
              onChange={(e) => setGestQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void loadGest(gestQ);
              }}
              placeholder="Cerca in rubrica gestionale…"
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void loadGest(gestQ)}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs"
            >
              Cerca
            </button>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {gestHits.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="block w-full rounded border border-[var(--border)] px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                  onClick={() =>
                    void sendContact({
                      name: c.name,
                      phone: c.phone,
                      email: c.email,
                      source: "gestionale",
                      rubricaId: c.id,
                    })
                  }
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="block text-slate-500">
                    {c.phone} {c.email}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {sub === "scheda" ? (
          <div className="space-y-2">
            <select
              value={schedaType}
              onChange={(e) =>
                setSchedaType(e.target.value as SchedaPayload["entityType"])
              }
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              {Object.entries(schedaEntityLabel).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input
              value={schedaQ}
              onChange={(e) => setSchedaQ(e.target.value)}
              placeholder="Cerca…"
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void loadScheda()}
              className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm text-white"
            >
              Cerca
            </button>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {schedaHits.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className="block w-full rounded border border-[var(--border)] px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                  onClick={() =>
                    void sendScheda({
                      entityType: schedaType,
                      entityId: h.id,
                      title: h.title,
                      subtitle: h.subtitle,
                    })
                  }
                >
                  <span className="font-medium">{h.title}</span>
                  <span className="block text-slate-500">{h.subtitle}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
