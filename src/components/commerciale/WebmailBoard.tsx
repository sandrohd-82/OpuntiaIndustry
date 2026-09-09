"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { FaChevronDown } from "react-icons/fa6";
import {
  confirmWebmailCategoriaSuggestionAction,
  confirmWebmailMessaggioDeleteAction,
  generateWebmailAiReplyAction,
  getWebmailBozzaForMessaggioAction,
  isWebmailSenderBlacklistedAction,
  linkWebmailMessaggioAnagraficaAction,
  listWebmailAccountsAction,
  listWebmailCategorieAction,
  listWebmailMessaggiAction,
  listWebmailMessaggioIdsAction,
  bulkDeleteWebmailMessaggiAction,
  markWebmailMessaggioSeenAction,
  rejectWebmailCategoriaSuggestionAction,
  restoreWebmailMessaggioAction,
  archiveWebmailMessaggioAction,
  unarchiveWebmailMessaggioAction,
  setWebmailMessaggiSpamAction,
  markWebmailMessaggioSpamAction,
  unmarkWebmailMessaggioSpamAction,
  runWebmailSyncAction,
  setWebmailImportedSeenAction,
  sendWebmailBozzaAction,
  sendWebmailNuovaMailAction,
  translateWebmailTextAction,
  updateWebmailBozzaAction,
  reloadWebmailMessaggioBodyAction,
  type WebmailMessaggioAllegatoPublic,
} from "@/app/actions/webmail";
import { WebmailBulkDeleteModal } from "@/components/webmail/WebmailBulkDeleteModal";
import { WebmailCategoriaModal } from "@/components/webmail/WebmailCategoriaModal";
import { WebmailSelectScopeModal } from "@/components/webmail/WebmailSelectScopeModal";
import { WebmailCollegaAziendaFlow } from "@/components/webmail/WebmailCollegaAziendaFlow";
import { WebmailDeleteConfirmModal } from "@/components/webmail/WebmailDeleteConfirmModal";
import {
  WebmailSyncImportedStatusModal,
  type WebmailImportedSeenChoice,
} from "@/components/webmail/WebmailSyncImportedStatusModal";
import {
  WebmailSyncModal,
  type WebmailSyncChoice,
} from "@/components/webmail/WebmailSyncModal";
import { BusyBanner, BusySpinner } from "@/components/ui/BusyIndicator";
import { WithInfoNuvola } from "@/components/ui/InfoNuvola";
import { WebmailHtmlBody } from "@/components/webmail/WebmailHtmlBody";
import {
  WEBMAIL_PAGE_SIZE,
  WEBMAIL_SORT_LABELS,
  type WebmailAccountPublic,
  type WebmailSortDir,
  type WebmailSortKey,
  type WebmailBozzaAi,
  type WebmailCategoria,
  type WebmailMailboxView,
  type WebmailMessaggio,
} from "@/lib/webmail/types";
import { WEBMAIL_TRANSLATE_LANGS } from "@/lib/webmail/translate-langs";
import { notifyWebmailUnreadNav } from "@/lib/webmail/unread-nav";

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT");
  } catch {
    return iso;
  }
}

function linkStatoLabel(stato: WebmailMessaggio["linkStato"]) {
  if (stato === "collegata") return "Collegata";
  if (stato === "da_salvare") return "Da salvare";
  return "Bozza";
}

const MAIL_INFO = {
  headers:
    "Mostra o nasconde mittente, destinatari, date, Message-ID e gli altri header della mail.",
  catSi:
    "Conferma che la categoria proposta è corretta. Il sistema impara per le prossime mail simili.",
  catNo:
    "Rifiuta la categoria automatica e ti permette di scegliere tu dove spostare la mail.",
  catConferma:
    "Applica a questa mail la categoria suggerita dal sistema.",
  catIgnora:
    "Lascia la mail dove sta e non applica il suggerimento di categoria.",
  collega:
    "Collega questa mail a un cliente o a un possibile cliente in anagrafica.",
  rispondi:
    "Apre a destra il pannello per scrivere e inviare una risposta dalla casella collegata.",
  ai: "Apre a destra il pannello della risposta AI: genera, controlla, salva e invia la bozza.",
  ripristina: "Riporta la mail dal cestino alla casella.",
  ripristinaArchivio: "Riporta la mail dall’archivio alla casella.",
  spam: "Sposta la mail in Spam. Non è una cancellazione: resta tracciata e la puoi ripristinare.",
  nonSpam: "Riporta la mail da Spam in In arrivo.",
  categoria: "Scegli una categoria (cartella) in cui spostare questa mail.",
  archivia: "Sposta la mail in Archiviate, fuori dalla casella principale.",
  elimina: "Sposta la mail nel cestino. Non è una cancellazione fisica: resta tracciata.",
  rematch: "Riesegue il riconoscimento automatico del mittente in anagrafica.",
  traduci:
    "Mostra una traduzione in italiano del testo. L’originale della mail non viene modificato.",
  toggleTraduzione: "Alterna tra il testo originale e la traduzione.",
  soloTesto: "Mostra il corpo come testo semplice oppure come HTML formattato.",
  ricarica:
    "Riscarica dal server della casella il corpo HTML e gli allegati di questa mail.",
  chiudiPannello:
    "Chiude il pannello di destra e riporta la mail a tutta larghezza.",
  apriAllegato: "Apre o scarica l’allegato in una nuova scheda.",
  inviaRisposta: "Invia la risposta dalla casella collegata al destinatario indicato.",
  generaAiPannello: "Crea una nuova bozza di risposta con l’AI.",
  traduciBozza: "Traduce la bozza nella lingua scelta, senza inviarla.",
  applicaTraduzione:
    "Sostituisce oggetto e testo della bozza con la traduzione mostrata.",
  rigenera: "Genera di nuovo la bozza AI, sostituendo quella attuale.",
  salvaBozza: "Salva le modifiche alla bozza su questa mail.",
  inviaBozza: "Invia la bozza AI come email di risposta.",
  live:
    "Ascolta la casella in tempo reale (IMAP IDLE): le nuove mail compaiono appena arrivano sul server. Resta attivo finché questa pagina è aperta. Spegni il pulsante per interrompere.",
};

export function WebmailBoard({
  initialAccountId = null,
  view = "all",
  categoriaId = null,
  hideTopFilters = false,
}: {
  initialAccountId?: string | null;
  view?: WebmailMailboxView;
  categoriaId?: string | null;
  /** Nasconde filtri account/categoria quando la vista è guidata dal menu. */
  hideTopFilters?: boolean;
}) {
  const [accounts, setAccounts] = useState<WebmailAccountPublic[]>([]);
  const [categorie, setCategorie] = useState<WebmailCategoria[]>([]);
  const [messaggi, setMessaggi] = useState<WebmailMessaggio[]>([]);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [sortKey, setSortKey] = useState<WebmailSortKey>("received_at");
  const [sortDir, setSortDir] = useState<WebmailSortDir>("desc");
  const [accountFilter, setAccountFilter] = useState<string>(
    initialAccountId ?? ""
  );
  const [categoriaFilter, setCategoriaFilter] = useState<string>(
    categoriaId ?? ""
  );
  const [onlyDraft, setOnlyDraft] = useState(view === "bozze");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bozza, setBozza] = useState<WebmailBozzaAi | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [listLoading, setListLoading] = useState(true);
  const [busyLabel, setBusyLabel] = useState("Caricamento elenco…");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const filterKeyRef = useRef("");
  const totalCountRef = useRef(0);
  const reloadGenRef = useRef(0);
  const listBoxRef = useRef<HTMLDivElement | null>(null);
  const listScrollRef = useRef<HTMLUListElement | null>(null);
  const [catTargetIds, setCatTargetIds] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectScopeOpen, setSelectScopeOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [aziendaModalOpen, setAziendaModalOpen] = useState(false);
  const [senderBlacklisted, setSenderBlacklisted] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  const [importedStatus, setImportedStatus] = useState<{
    ids: string[];
    extraInfo: string | null;
  } | null>(null);
  const [headersOpen, setHeadersOpen] = useState(false);
  const [inboundTranslation, setInboundTranslation] = useState<{
    subject: string | null;
    bodyText: string;
    targetLangLabel: string;
  } | null>(null);
  const [showInboundTranslation, setShowInboundTranslation] = useState(false);
  const [outboundLang, setOutboundLang] = useState("en");
  const [outboundTranslation, setOutboundTranslation] = useState<{
    subject: string | null;
    bodyText: string;
    targetLangLabel: string;
  } | null>(null);
  const [showPlainText, setShowPlainText] = useState(false);
  const [htmlReloadToken, setHtmlReloadToken] = useState(0);
  const [sidePanel, setSidePanel] = useState<
    "ai" | "reply" | "allegato" | null
  >(null);
  const [previewAllegato, setPreviewAllegato] =
    useState<WebmailMessaggioAllegatoPublic | null>(null);
  const [replyTo, setReplyTo] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [liveKeep, setLiveKeep] = useState(false);
  const [liveStatus, setLiveStatus] = useState<{
    at: Date | null;
    listening: boolean;
    lastImported: number;
    error: string | null;
  }>({ at: null, listening: false, lastImported: 0, error: null });

  const selected = useMemo(
    () => messaggi.find((m) => m.id === selectedId) ?? null,
    [messaggi, selectedId]
  );

  const headerChecked = useMemo(() => {
    if (selectedIds.length === 0) return false;
    if (totalCount > 0 && selectedIds.length === totalCount) return true;
    return (
      messaggi.length > 0 && messaggi.every((m) => selectedIds.includes(m.id))
    );
  }, [selectedIds, messaggi, totalCount]);

  useEffect(() => {
    setHeadersOpen(false);
    setInboundTranslation(null);
    setShowInboundTranslation(false);
    setOutboundTranslation(null);
    setShowPlainText(false);
    setHtmlReloadToken(0);
    setDeleteConfirmOpen(false);
  }, [selectedId]);

  const catById = useMemo(() => {
    const m = new Map<string, WebmailCategoria>();
    for (const c of categorie) m.set(c.id, c);
    return m;
  }, [categorie]);

  const listFilterKey = [
    accountFilter,
    view,
    categoriaId ?? "",
    categoriaFilter,
    onlyDraft ? "1" : "0",
  ].join("|");

  const reloadMeta = useCallback(async () => {
    const [a, c] = await Promise.all([
      listWebmailAccountsAction(),
      listWebmailCategorieAction(),
    ]);
    if (a.success) setAccounts(a.accounts);
    else setError(a.error);
    if (c.success) setCategorie(c.items);
    else setError(c.error);
  }, []);

  const reload = useCallback(async () => {
    const gen = ++reloadGenRef.current;
    setError(null);
    setListLoading(true);
    const sameFilters = filterKeyRef.current === listFilterKey;
    const skipCount = sameFilters && totalCountRef.current > 0;
    try {
      const m = await listWebmailMessaggiAction({
        accountId: accountFilter || null,
        categoriaId:
          view === "categoria"
            ? categoriaId || categoriaFilter || null
            : view === "all"
              ? categoriaFilter || null
              : null,
        onlyAiDraft: view === "bozze" ? true : onlyDraft,
        view,
        page,
        sortKey,
        sortDir,
        skipCount,
      });
      if (!m.success) {
        if (reloadGenRef.current === gen) setError(m.error);
        return;
      }
      if (reloadGenRef.current !== gen) return;
      setMessaggi(m.messaggi);
      if (m.total >= 0) {
        setTotalCount(m.total);
        totalCountRef.current = m.total;
      }
      filterKeyRef.current = listFilterKey;
      if (m.messaggi.length === 0 && m.page > 0 && (m.total > 0 || totalCountRef.current > 0)) {
        setPage(m.page - 1);
      }
    } finally {
      if (reloadGenRef.current === gen) {
        setListLoading(false);
        setBusyLabel("Caricamento elenco…");
      }
    }
  }, [
    accountFilter,
    categoriaFilter,
    onlyDraft,
    view,
    categoriaId,
    page,
    sortKey,
    sortDir,
    listFilterKey,
  ]);

  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const accountLiveRef = useRef(accountFilter);
  accountLiveRef.current = accountFilter;
  const syncBusyRef = useRef(false);
  syncBusyRef.current = Boolean(syncProgress || syncModalOpen);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("webmail-live-sync") === "1") {
        setLiveKeep(true);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem("webmail-live-sync", liveKeep ? "1" : "0");
    } catch {
      // ignore
    }
  }, [liveKeep]);

  useEffect(() => {
    if (!liveKeep) {
      setLiveStatus((s) => ({ ...s, listening: false }));
      return;
    }
    const ac = new AbortController();
    let cancelled = false;
    setLiveStatus((s) => ({ ...s, listening: true, error: null }));

    void (async () => {
      while (!cancelled) {
        while (syncBusyRef.current && !cancelled) {
          await new Promise((r) => setTimeout(r, 400));
        }
        if (cancelled) break;
        try {
          const res = await fetch("/api/webmail/live-sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accountId: accountLiveRef.current || null,
            }),
            signal: ac.signal,
          });
          const data = (await res.json()) as {
            imported?: number;
            error?: string;
            errors?: string[];
          };
          if (cancelled) break;
          const err =
            data.error ||
            (data.errors && data.errors.length
              ? data.errors.join("; ")
              : null);
          setLiveStatus({
            at: new Date(),
            listening: true,
            lastImported: data.imported ?? 0,
            error: err,
          });
          if ((data.imported ?? 0) > 0) {
            const n = data.imported ?? 0;
            setInfo(
              n === 1
                ? "1 nuova mail ricevuta dalla casella."
                : `${n} nuove mail ricevute dalla casella.`
            );
            setPage(0);
            notifyWebmailUnreadNav(accountLiveRef.current || null);
            await reloadRef.current();
          }
        } catch (e) {
          if (
            cancelled ||
            (e instanceof DOMException && e.name === "AbortError")
          ) {
            break;
          }
          setLiveStatus((s) => ({
            ...s,
            at: new Date(),
            error:
              e instanceof Error ? e.message : "Ascolto interrotto. Riprovo…",
          }));
          await new Promise((r) => setTimeout(r, 2500));
        }
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [liveKeep, accountFilter]);

  function resetSelection() {
    setSelectMode(false);
    setSelectedIds([]);
    setSelectScopeOpen(false);
    setBulkDeleteOpen(false);
  }

  useEffect(() => {
    setBusyLabel("Apertura casella…");
    setListLoading(true);
    setAccountFilter(initialAccountId ?? "");
    setSelectedId(null);
    setPage(0);
    resetSelection();
  }, [initialAccountId]);

  useEffect(() => {
    setBusyLabel("Apertura categoria…");
    setListLoading(true);
    setCategoriaFilter(categoriaId ?? "");
    setSelectedId(null);
    setPage(0);
    resetSelection();
  }, [categoriaId]);

  useEffect(() => {
    setBusyLabel("Apertura cartella…");
    setListLoading(true);
    setOnlyDraft(view === "bozze");
    setPage(0);
    resetSelection();
  }, [view]);

  useEffect(() => {
    setPage(0);
    resetSelection();
  }, [accountFilter, categoriaFilter, onlyDraft]);

  useEffect(() => {
    void reloadMeta();
  }, [reloadMeta]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    listBoxRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [page]);

  useEffect(() => {
    if (!selectedId) {
      setBozza(null);
      setSidePanel(null);
      setPreviewAllegato(null);
      setOpeningId(null);
      return;
    }
    setOpeningId(selectedId);
    setSidePanel(null);
    setPreviewAllegato(null);
    void (async () => {
      const seen = await markWebmailMessaggioSeenAction(selectedId);
      if (seen.success) {
        setMessaggi((prev) =>
          prev.map((x) =>
            x.id === seen.messaggio.id ? { ...x, isSeen: true } : x
          )
        );
        notifyWebmailUnreadNav(seen.messaggio.accountId);
      }
      const res = await getWebmailBozzaForMessaggioAction(selectedId);
      if (!res.success) {
        setError(res.error);
        setOpeningId(null);
        return;
      }
      setBozza(res.bozza);
      setDraftSubject(res.bozza?.subject ?? "");
      setDraftBody(res.bozza?.bodyText ?? "");
      setOpeningId(null);
    })();
  }, [selectedId]);

  useEffect(() => {
    if (!selected?.fromAddress || !selected.accountId) {
      setSenderBlacklisted(false);
      return;
    }
    void isWebmailSenderBlacklistedAction({
      emailAddress: selected.fromAddress,
      accountId: selected.accountId,
    }).then((res) => {
      if (res.success) setSenderBlacklisted(res.blacklisted);
    });
  }, [selected?.id, selected?.fromAddress, selected?.accountId]);

  function patchMessaggio(m: WebmailMessaggio) {
    setMessaggi((prev) =>
      prev.map((x) =>
        x.id === m.id
          ? {
              ...x,
              ...m,
              bodyText: m.bodyText || x.bodyText,
              bodyHtml: m.bodyHtml || x.bodyHtml,
            }
          : x
      )
    );
  }

  function syncNow() {
    setError(null);
    setInfo(null);
    setSyncProgress(null);
    setSyncModalOpen(true);
  }

  function finishSyncImport(
    importedIds: string[],
    extraInfo: string | null
  ) {
    setSyncModalOpen(false);
    setSyncProgress(null);
    if (importedIds.length > 0) {
      setPage(0);
      setImportedStatus({ ids: importedIds, extraInfo });
      notifyWebmailUnreadNav(accountFilter || null);
    } else {
      setInfo(extraInfo ?? "Nessuna nuova mail importata.");
    }
  }

  function currentListFilter() {
    return {
      accountId: accountFilter || null,
      categoriaId:
        view === "categoria"
          ? categoriaId || categoriaFilter || null
          : view === "all"
            ? categoriaFilter || null
            : null,
      onlyAiDraft: view === "bozze" ? true : onlyDraft,
      view,
      sortKey,
      sortDir,
    };
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function onHeaderSelectClick() {
    if (!selectMode) {
      setSelectMode(true);
      return;
    }
    if (headerChecked) {
      setSelectedIds([]);
      return;
    }
    if (totalCount <= WEBMAIL_PAGE_SIZE) {
      setSelectedIds(messaggi.map((m) => m.id));
      return;
    }
    setSelectScopeOpen(true);
  }

  function chooseSelectPage() {
    setSelectedIds(messaggi.map((m) => m.id));
    setSelectScopeOpen(false);
  }

  function chooseSelectAll() {
    setBusyLabel("Selezione in corso…");
    startTransition(async () => {
      const res = await listWebmailMessaggioIdsAction(currentListFilter());
      if (!res.success) {
        setError(res.error);
        return;
      }
      setSelectedIds(res.ids);
      setSelectScopeOpen(false);
    });
  }

  function applyBulkSeen(seen: boolean) {
    if (selectedIds.length === 0) return;
    startTransition(async () => {
      const res = await setWebmailImportedSeenAction({
        messaggioIds: selectedIds,
        seen,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setInfo(
        seen
          ? `${res.updated} mail segnalate come già lette.`
          : `${res.updated} mail segnalate come da leggere.`
      );
      resetSelection();
      notifyWebmailUnreadNav(accountFilter || null);
      await reload();
    });
  }

  function applyImportedStatus(choice: WebmailImportedSeenChoice) {
    if (!importedStatus) return;
    const ids = importedStatus.ids;
    const extraInfo = importedStatus.extraInfo;
    startTransition(async () => {
      const res = await setWebmailImportedSeenAction({
        messaggioIds: ids,
        seen: choice === "read",
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      const stato = choice === "read" ? "Lette" : "Da leggere";
      setImportedStatus(null);
      setInfo(
        `${ids.length} mail importate. Stato: ${stato}.${
          extraInfo ? ` ${extraInfo}` : ""
        }`
      );
      setMessaggi((prev) =>
        prev.map((m) =>
          ids.includes(m.id) ? { ...m, isSeen: choice === "read" } : m
        )
      );
      notifyWebmailUnreadNav(accountFilter || null);
      await reload();
    });
  }

  function runSyncChoice(choice: WebmailSyncChoice) {
    const accountId = accountFilter || undefined;
    const gapMs = 2000;
    startTransition(async () => {
      try {
        if (choice === "all") {
          let imported = 0;
          const importedIds: string[] = [];
          let round = 0;
          while (round < 200) {
            setSyncProgress(
              `Richiesta ${round + 1}: importazione di massimo 40 mail…`
            );
            const res = await runWebmailSyncAction(accountId, "recent");
            if (!res.success) {
              setError(res.error);
              if (importedIds.length > 0) {
                finishSyncImport(importedIds, null);
                await reload();
              } else {
                setSyncProgress(null);
              }
              return;
            }
            imported += res.imported;
            importedIds.push(...(res.importedIds ?? []));
            const errs = res.errors ?? [];
            if (errs.length) {
              setError(errs.join("; "));
            }
            if (res.pending <= 0) {
              finishSyncImport(importedIds, null);
              await reload();
              return;
            }
            setSyncProgress(
              `Importate ${imported}. Attesa prima della prossima richiesta (${res.pending} ancora)…`
            );
            await new Promise((r) => setTimeout(r, gapMs));
            round += 1;
          }
          finishSyncImport(
            importedIds,
            "Sync parziale. Riprova per continuare."
          );
          await reload();
          return;
        }

        const res = await runWebmailSyncAction(
          accountId,
          choice === "older" ? "older" : "recent"
        );
        if (!res.success) {
          setError(res.error);
          return;
        }
        const errs = res.errors ?? [];
        finishSyncImport(
          res.importedIds ?? [],
          [
            res.pending > 0 ? `Ancora ${res.pending} da importare.` : "",
            errs.length ? errs.join("; ") : "",
          ]
            .filter(Boolean)
            .join(" ") || null
        );
        await reload();
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Errore sync (timeout o connessione). Riprova."
        );
        setSyncProgress(null);
      }
    });
  }

  function generateAi() {
    if (!selected) return;
    setInfo(null);
    setSidePanel("ai");
    startTransition(async () => {
      const res = await generateWebmailAiReplyAction(selected.id);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setBozza(res.bozza);
      setDraftSubject(res.bozza.subject);
      setDraftBody(res.bozza.bodyText);
      patchMessaggio({ ...selected, hasAiDraft: true });
      setInfo("Risposta AI generata — controlla e invia se corretta.");
    });
  }

  function openAiReplyModal() {
    setSidePanel("ai");
  }

  function openReplyPanel() {
    if (!selected) return;
    const subj = selected.subject.trim();
    setReplyTo(selected.fromAddress);
    setReplySubject(/^re\s*:/i.test(subj) ? subj : `Re: ${subj || "(senza oggetto)"}`);
    setReplyBody("");
    setSidePanel("reply");
  }

  function openAllegatoPanel(file: WebmailMessaggioAllegatoPublic) {
    setPreviewAllegato(file);
    setSidePanel("allegato");
  }

  function closeSidePanel() {
    setSidePanel(null);
    setPreviewAllegato(null);
  }

  function sendReply() {
    if (!selected) return;
    if (
      !window.confirm(
        "Inviare questa risposta dalla casella collegata? L’operazione sarà registrata in audit."
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await sendWebmailNuovaMailAction({
        accountId: selected.accountId,
        to: replyTo,
        subject: replySubject,
        bodyText: replyBody,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setInfo("Risposta inviata.");
      closeSidePanel();
    });
  }

  function saveDraft() {
    if (!bozza) return;
    startTransition(async () => {
      const res = await updateWebmailBozzaAction({
        bozzaId: bozza.id,
        subject: draftSubject,
        bodyText: draftBody,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setBozza((prev) =>
        prev
          ? { ...prev, subject: draftSubject, bodyText: draftBody }
          : prev
      );
      setInfo("Bozza salvata.");
    });
  }

  function sendDraft() {
    if (!bozza) return;
    if (
      !window.confirm(
        "Inviare questa email dalla casella collegata? L’operazione sarà registrata in audit."
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await sendWebmailBozzaAction({ bozzaId: bozza.id });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setInfo("Email inviata. Audit registrato.");
      setBozza(null);
      closeSidePanel();
      await reload();
    });
  }

  const suggestCat = selected?.categoriaSuggestId
    ? catById.get(selected.categoriaSuggestId)
    : null;
  const currentCat = selected?.categoriaId
    ? catById.get(selected.categoriaId)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          {view === "cestino"
            ? "Mail eliminate (soft delete). Puoi ripristinarle nel gestionale."
            : view === "spam"
              ? "Mail in Spam (casella e, se presente, cartella Junk IMAP). Puoi ripristinarle in In arrivo."
              : view === "inbox"
              ? "In arrivo: messaggi senza categoria. Spostali in una categoria quando li classifichi."
              : view === "bozze"
                ? "Messaggi con bozza AI da revisionare o inviare."
                : view === "categoria"
                  ? "Messaggi nella categoria selezionata."
                  : "Leggi la mail, genera la risposta AI solo quando serve, sposta in categoria e collega l’azienda. Il sistema impara dalle tue conferme (soglie 2 / 4 / 6)."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {view !== "cestino" ? (
            <button
              type="button"
              disabled={pending}
              onClick={syncNow}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Sincronizza
            </button>
          ) : null}
          <WithInfoNuvola info={MAIL_INFO.live}>
            <button
              type="button"
              aria-pressed={liveKeep}
              onClick={() => setLiveKeep((v) => !v)}
              className={`rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 ${
                liveKeep
                  ? "bg-emerald-700 text-white"
                  : "border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
              }`}
            >
              {liveKeep ? "In ascolto…" : "Mantieni sincronizzato"}
            </button>
          </WithInfoNuvola>
        </div>
      </div>
      {liveKeep ? (
        <p className="inline-flex items-center gap-2 text-xs text-emerald-800">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Ascolto casella: le nuove mail arrivano appena sono sul server.
          {liveStatus.at
            ? ` Ultimo controllo ${liveStatus.at.toLocaleTimeString("it-IT")}.`
            : ""}
          {liveStatus.error ? ` ${liveStatus.error}` : ""}
        </p>
      ) : null}

      {hideTopFilters ? null : (
      <div className="flex flex-wrap gap-2">
        {initialAccountId ? null : (
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
          >
            <option value="">Tutte le caselle</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} ({a.emailAddress})
              </option>
            ))}
          </select>
        )}
        {view === "all" ? (
          <>
            <select
              value={categoriaFilter}
              onChange={(e) => setCategoriaFilter(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
            >
              <option value="">Tutte le categorie</option>
              {categorie.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={onlyDraft}
                onChange={(e) => setOnlyDraft(e.target.checked)}
              />
              Solo con bozza AI
            </label>
          </>
        ) : null}
      </div>
      )}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {info}
        </p>
      ) : null}
      {listLoading || pending || openingId ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
          <BusyBanner
            label={
              pending
                ? "Operazione in corso…"
                : openingId
                  ? "Apertura mail…"
                  : busyLabel
            }
          />
        </div>
      ) : null}

      <div
        ref={listBoxRef}
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={headerChecked}
                onChange={onHeaderSelectClick}
                aria-label="Seleziona tutte le mail"
                aria-checked={headerChecked}
                className="h-4 w-4"
              />
              <button
                type="button"
                onClick={onHeaderSelectClick}
                className="text-xs font-semibold uppercase tracking-wide text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
              >
                Seleziona
              </button>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Messaggi
              </p>
              {selectMode ? (
                <button
                  type="button"
                  onClick={resetSelection}
                  className="text-[11px] text-slate-500 underline"
                >
                  Annulla
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <label className="inline-flex items-center gap-1">
                <span className="sr-only">Ordina per</span>
                <select
                  value={sortKey}
                  disabled={listLoading}
                  onChange={(e) => {
                    const next = e.target.value as WebmailSortKey;
                    setBusyLabel("Ordinamento in corso…");
                    setListLoading(true);
                    setSortKey(next);
                    setSortDir(next === "is_seen" ? "asc" : "desc");
                    setPage(0);
                  }}
                  className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 disabled:opacity-60"
                  aria-label="Ordina per"
                >
                  {(
                    Object.keys(WEBMAIL_SORT_LABELS) as WebmailSortKey[]
                  ).map((k) => (
                    <option key={k} value={k}>
                      {WEBMAIL_SORT_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={listLoading}
                onClick={() => {
                  setBusyLabel("Ordinamento in corso…");
                  setListLoading(true);
                  setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                  setPage(0);
                }}
                className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-white disabled:opacity-60"
                aria-label={
                  sortDir === "asc"
                    ? "Ordine crescente. Clicca per decrescente"
                    : "Ordine decrescente. Clicca per crescente"
                }
                title={
                  sortKey === "is_seen"
                    ? sortDir === "asc"
                      ? "Non lette prima"
                      : "Lette prima"
                    : sortDir === "asc"
                      ? "Crescente"
                      : "Decrescente"
                }
              >
                {sortKey === "is_seen"
                  ? sortDir === "asc"
                    ? "Non lette ↓"
                    : "Lette ↓"
                  : sortDir === "asc"
                    ? "Crescente ↑"
                    : "Decrescente ↓"}
              </button>
              {listLoading ? <BusySpinner /> : null}
              <span>
                {totalCount === 0
                  ? "0-0 di 0 mail"
                  : `${page * WEBMAIL_PAGE_SIZE}-${Math.min(
                      page * WEBMAIL_PAGE_SIZE + WEBMAIL_PAGE_SIZE,
                      totalCount
                    )} di ${totalCount} mail`}
              </span>
              <button
                type="button"
                disabled={listLoading || page <= 0}
                onClick={() => {
                  setBusyLabel("Caricamento pagina…");
                  setListLoading(true);
                  setPage((p) => Math.max(0, p - 1));
                }}
                className="rounded border border-slate-200 px-1.5 py-0.5 disabled:opacity-30"
                aria-label="Pagina precedente"
              >
                ‹
              </button>
              <button
                type="button"
                disabled={
                  listLoading || (page + 1) * WEBMAIL_PAGE_SIZE >= totalCount
                }
                onClick={() => {
                  setBusyLabel("Caricamento pagina…");
                  setListLoading(true);
                  setPage((p) => p + 1);
                }}
                className="rounded border border-slate-200 px-1.5 py-0.5 disabled:opacity-30"
                aria-label="Pagina successiva"
              >
                ›
              </button>
            </div>
          </div>
          {selectedIds.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={pending}
                onClick={() => applyBulkSeen(false)}
                className="rounded-lg border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-medium"
              >
                Segnala come da leggere
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => applyBulkSeen(true)}
                className="rounded-lg border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-medium"
              >
                Segnala come già lette
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setBulkDeleteOpen(true)}
                className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700"
              >
                Elimina
              </button>
              {view === "spam" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const res = await setWebmailMessaggiSpamAction({
                        messaggioIds: selectedIds,
                        spam: false,
                      });
                      if (!res.success) {
                        setError(res.error);
                        return;
                      }
                      setInfo(`${res.updated} mail ripristinate da Spam.`);
                      resetSelection();
                      notifyWebmailUnreadNav(accountFilter || null);
                      await reload();
                    });
                  }}
                  className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800"
                >
                  Non è spam
                </button>
              ) : view !== "cestino" && view !== "archiviate" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const res = await setWebmailMessaggiSpamAction({
                        messaggioIds: selectedIds,
                        spam: true,
                      });
                      if (!res.success) {
                        setError(res.error);
                        return;
                      }
                      setInfo(`${res.updated} mail spostate in Spam.`);
                      resetSelection();
                      notifyWebmailUnreadNav(accountFilter || null);
                      await reload();
                    });
                  }}
                  className="rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-amber-800"
                >
                  Segnala come spam
                </button>
              ) : null}
              <button
                type="button"
                disabled={pending}
                onClick={() => setCatTargetIds([...selectedIds])}
                className="rounded-lg border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-medium"
              >
                Sposta in categoria
              </button>
            </div>
          ) : null}
        </div>
        <ul
          ref={listScrollRef}
          className="relative max-h-[min(78vh,52rem)] divide-y divide-slate-100 overflow-y-auto"
          aria-busy={listLoading || pending}
        >
          {listLoading ? (
            <li className="sticky top-0 z-10 border-b border-sky-100 bg-sky-50/95 px-4 py-2">
              <BusyBanner label={busyLabel} />
            </li>
          ) : null}
          {messaggi.length === 0 && !listLoading ? (
            <li className="p-8 text-center text-sm text-[var(--muted)]">
              Nessun messaggio in questa vista. Sincronizza o cambia cartella.
            </li>
          ) : messaggi.length === 0 && listLoading ? (
            <li className="p-10 text-center">
              <BusyBanner label={busyLabel} />
            </li>
          ) : (
            messaggi.map((m) => {
              const cat = m.categoriaId ? catById.get(m.categoriaId) : null;
              const expanded = selectedId === m.id;
              return (
                <li
                  key={m.id}
                  className={
                    !m.isSeen
                      ? expanded
                        ? "bg-amber-100"
                        : "bg-amber-50"
                      : expanded
                        ? "bg-sky-50/40"
                        : "bg-white"
                  }
                >
                  <div className="flex w-full items-start gap-2 px-4 py-3">
                    {selectMode ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(m.id)}
                        onChange={() => toggleSelected(m.id)}
                        className="mt-1 h-4 w-4 shrink-0"
                        aria-label={`Seleziona ${m.subject}`}
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedId((prev) => (prev === m.id ? null : m.id))
                      }
                      className={`flex min-w-0 flex-1 items-start gap-2 text-left text-sm transition ${
                        m.isSeen ? "hover:bg-slate-50" : "hover:bg-amber-100/80"
                      }`}
                    >
                    {openingId === m.id ? (
                      <BusySpinner className="mt-1" />
                    ) : (
                    <FaChevronDown
                      size={12}
                      className={`mt-1 shrink-0 text-slate-400 transition ${
                        expanded ? "rotate-180 text-sky-600" : ""
                      }`}
                    />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`line-clamp-1 ${
                            m.isSeen
                              ? "font-medium text-slate-900"
                              : "font-semibold text-slate-950"
                          }`}
                        >
                          {m.subject}
                        </p>
                        <div className="flex shrink-0 items-center gap-1">
                          {!m.isSeen ? (
                            <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                              new
                            </span>
                          ) : null}
                          {m.hasAiDraft ? (
                            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                              Bozza AI
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                        {m.fromName || m.fromAddress} ·{" "}
                        {formatWhen(m.receivedAt)}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {cat ? (
                          <span
                            className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                            style={{ background: cat.colore }}
                          >
                            {cat.nome}
                          </span>
                        ) : null}
                        {m.categoriaAutoPending ? (
                          <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                            Auto-spostata
                          </span>
                        ) : null}
                        {m.aziendaLabel ? (
                          <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900">
                            {m.aziendaLabel}
                          </span>
                        ) : (
                          <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                            {linkStatoLabel(m.linkStato)}
                          </span>
                        )}
                      </div>
                    </div>
                    </button>
                  </div>

                  {expanded && selected ? (
            <div
              className={`border-t border-sky-100 bg-white ${
                sidePanel
                  ? "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(20rem,40%)]"
                  : ""
              }`}
            >
              <section
                className={`min-w-0 border-b border-[var(--border)] p-4 lg:border-b-0 ${
                  sidePanel ? "lg:border-r" : ""
                }`}
              >
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Mail ricevuta
                </h3>
                <p className="mt-2 font-semibold text-slate-900">
                  {selected.subject}
                </p>
                <div className="mt-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                    <span className="min-w-0 truncate">
                      Da {selected.fromName || selected.fromAddress} ·{" "}
                      {formatWhen(selected.receivedAt)}
                    </span>
                    <WithInfoNuvola info={MAIL_INFO.headers}>
                    <button
                      type="button"
                      aria-expanded={headersOpen}
                      aria-label={
                        headersOpen
                          ? "Nascondi dettagli mail e header"
                          : "Mostra dettagli mail e header"
                      }
                      title="Dettagli mail e header"
                      onClick={() => setHeadersOpen((v) => !v)}
                      className="inline-flex shrink-0 items-center justify-center rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    >
                      <FaChevronDown
                        size={11}
                        className={`transition-transform duration-150 ${
                          headersOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    </WithInfoNuvola>
                  </div>
                  {headersOpen ? (
                    <dl className="mt-2 space-y-1.5 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2.5 text-xs text-slate-800">
                      <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
                        <dt className="font-medium text-[var(--muted)]">Da</dt>
                        <dd className="break-all">
                          {selected.fromName
                            ? `${selected.fromName} <${selected.fromAddress}>`
                            : selected.fromAddress || "—"}
                        </dd>
                      </div>
                      <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
                        <dt className="font-medium text-[var(--muted)]">A</dt>
                        <dd className="break-all">
                          {selected.toAddresses.length
                            ? selected.toAddresses.join(", ")
                            : "—"}
                        </dd>
                      </div>
                      {selected.ccAddresses.length > 0 ? (
                        <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
                          <dt className="font-medium text-[var(--muted)]">Cc</dt>
                          <dd className="break-all">
                            {selected.ccAddresses.join(", ")}
                          </dd>
                        </div>
                      ) : null}
                      <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
                        <dt className="font-medium text-[var(--muted)]">
                          Oggetto
                        </dt>
                        <dd className="break-words">
                          {selected.subject || "—"}
                        </dd>
                      </div>
                      <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
                        <dt className="font-medium text-[var(--muted)]">
                          Data arrivo
                        </dt>
                        <dd>{formatWhen(selected.receivedAt)}</dd>
                      </div>
                      {selected.sentAt ? (
                        <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
                          <dt className="font-medium text-[var(--muted)]">
                            Data invio
                          </dt>
                          <dd>{formatWhen(selected.sentAt)}</dd>
                        </div>
                      ) : null}
                      <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
                        <dt className="font-medium text-[var(--muted)]">
                          Message-ID
                        </dt>
                        <dd className="break-all font-mono text-[11px]">
                          {selected.messageIdHeader || "—"}
                        </dd>
                      </div>
                      <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
                        <dt className="font-medium text-[var(--muted)]">
                          Cartella
                        </dt>
                        <dd>
                          {selected.folder || "INBOX"}
                          {selected.messageUid
                            ? ` · UID ${selected.messageUid}`
                            : ""}
                        </dd>
                      </div>
                      <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
                        <dt className="font-medium text-[var(--muted)]">
                          Direzione
                        </dt>
                        <dd>
                          {selected.direction === "outbound"
                            ? "In uscita"
                            : "In arrivo"}
                        </dd>
                      </div>
                      {selected.createdAt ? (
                        <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
                          <dt className="font-medium text-[var(--muted)]">
                            Importata
                          </dt>
                          <dd>{formatWhen(selected.createdAt)}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                </div>

                {selected.categoriaAutoPending && currentCat ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    <p>
                      Il sistema ha spostato questa mail in{" "}
                      <strong>{currentCat.nome}</strong>. Confermi che è
                      corretto?
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <WithInfoNuvola info={MAIL_INFO.catSi}>
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded bg-amber-800 px-2 py-1 text-[11px] font-medium text-white"
                        onClick={() => {
                          startTransition(async () => {
                            const res =
                              await confirmWebmailCategoriaSuggestionAction(
                                selected.id
                              );
                            if (!res.success) {
                              setError(res.error);
                              return;
                            }
                            patchMessaggio({
                              ...selected,
                              categoriaId: res.categoriaId,
                              categoriaSuggestId: null,
                              categoriaSuggestMode: null,
                              categoriaAutoPending: false,
                            });
                            setInfo(
                              `Confermato. Apprendimento: ${res.learnMode}.`
                            );
                          });
                        }}
                      >
                        Sì, corretto
                      </button>
                      </WithInfoNuvola>
                      <WithInfoNuvola info={MAIL_INFO.catNo}>
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium"
                        onClick={() => {
                          startTransition(async () => {
                            const res =
                              await rejectWebmailCategoriaSuggestionAction(
                                selected.id
                              );
                            if (!res.success) {
                              setError(res.error);
                              return;
                            }
                            patchMessaggio(res.messaggio);
                            setCatTargetIds([selected.id]);
                          });
                        }}
                      >
                        No, cambia
                      </button>
                      </WithInfoNuvola>
                    </div>
                  </div>
                ) : null}

                {selected.categoriaSuggestMode === "suggest" &&
                suggestCat &&
                !selected.categoriaAutoPending ? (
                  <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
                    <p>
                      Questa mail sembra della categoria{" "}
                      <strong>{suggestCat.nome}</strong>. Confermi?
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <WithInfoNuvola info={MAIL_INFO.catConferma}>
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded bg-sky-700 px-2 py-1 text-[11px] font-medium text-white"
                        onClick={() => {
                          startTransition(async () => {
                            const res =
                              await confirmWebmailCategoriaSuggestionAction(
                                selected.id
                              );
                            if (!res.success) {
                              setError(res.error);
                              return;
                            }
                            patchMessaggio({
                              ...selected,
                              categoriaId: res.categoriaId,
                              categoriaSuggestId: null,
                              categoriaSuggestMode: null,
                              categoriaAutoPending: false,
                            });
                            setInfo(
                              `Categoria applicata. Apprendimento: ${res.learnMode}.`
                            );
                          });
                        }}
                      >
                        Conferma
                      </button>
                      </WithInfoNuvola>
                      <WithInfoNuvola info={MAIL_INFO.catIgnora}>
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded border border-sky-300 bg-white px-2 py-1 text-[11px] font-medium"
                        onClick={() => {
                          startTransition(async () => {
                            const res =
                              await rejectWebmailCategoriaSuggestionAction(
                                selected.id
                              );
                            if (!res.success) {
                              setError(res.error);
                              return;
                            }
                            patchMessaggio(res.messaggio);
                          });
                        }}
                      >
                        Ignora
                      </button>
                      </WithInfoNuvola>
                    </div>
                  </div>
                ) : null}

                {selected.categoriaSuggestMode === "auto_silent" &&
                selected.categoriaAutoNotified &&
                currentCat &&
                !selected.categoriaAutoPending ? (
                  <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    Spostata automaticamente in <strong>{currentCat.nome}</strong>{" "}
                    (apprendimento consolidato).
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                      <WithInfoNuvola info={MAIL_INFO.collega}>
                      <button
                        type="button"
                        className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium"
                        onClick={() => setAziendaModalOpen(true)}
                      >
                        Collega azienda
                      </button>
                      </WithInfoNuvola>
                      <WithInfoNuvola info={MAIL_INFO.rispondi}>
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-900 disabled:opacity-50"
                        onClick={openReplyPanel}
                      >
                        Rispondi
                      </button>
                      </WithInfoNuvola>
                      <WithInfoNuvola info={MAIL_INFO.ai}>
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded-lg bg-violet-700 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        onClick={() => {
                          if (bozza) openAiReplyModal();
                          else generateAi();
                        }}
                      >
                        {bozza ? "Apri risposta AI" : "Genera risposta AI"}
                      </button>
                      </WithInfoNuvola>
                  {view === "cestino" ? (
                    <WithInfoNuvola info={MAIL_INFO.ripristina}>
                    <button
                      type="button"
                      disabled={pending}
                      className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                      onClick={() => {
                        startTransition(async () => {
                          const res = await restoreWebmailMessaggioAction(
                            selected.id
                          );
                          if (!res.success) {
                            setError(res.error);
                            return;
                          }
                          setSelectedId(null);
                          setInfo("Mail ripristinata dal cestino.");
                          await reload();
                        });
                      }}
                    >
                      Ripristina
                    </button>
                    </WithInfoNuvola>
                  ) : view === "spam" ? (
                    <>
                    <WithInfoNuvola info={MAIL_INFO.nonSpam}>
                    <button
                      type="button"
                      disabled={pending}
                      className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                      onClick={() => {
                        startTransition(async () => {
                          const res = await unmarkWebmailMessaggioSpamAction(
                            selected.id
                          );
                          if (!res.success) {
                            setError(res.error);
                            return;
                          }
                          setSelectedId(null);
                          setInfo("Mail ripristinata da Spam.");
                          notifyWebmailUnreadNav(accountFilter || null);
                          await reload();
                        });
                      }}
                    >
                      Non è spam
                    </button>
                    </WithInfoNuvola>
                    <WithInfoNuvola info={MAIL_INFO.elimina}>
                    <button
                      type="button"
                      disabled={pending}
                      className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      onClick={() => setDeleteConfirmOpen(true)}
                    >
                      Elimina
                    </button>
                    </WithInfoNuvola>
                    </>
                  ) : view === "archiviate" ? (
                    <WithInfoNuvola info={MAIL_INFO.ripristinaArchivio}>
                    <button
                      type="button"
                      disabled={pending}
                      className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                      onClick={() => {
                        startTransition(async () => {
                          const res = await unarchiveWebmailMessaggioAction(
                            selected.id
                          );
                          if (!res.success) {
                            setError(res.error);
                            return;
                          }
                          setSelectedId(null);
                          setInfo("Mail ripristinata dall'archivio.");
                          await reload();
                        });
                      }}
                    >
                      Ripristina in casella
                    </button>
                    </WithInfoNuvola>
                  ) : (
                    <>
                      <WithInfoNuvola info={MAIL_INFO.categoria}>
                      <button
                        type="button"
                        className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium"
                        onClick={() => setCatTargetIds([selected.id])}
                      >
                        Sposta in categoria
                      </button>
                      </WithInfoNuvola>
                      <WithInfoNuvola info={MAIL_INFO.spam}>
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                        onClick={() => {
                          startTransition(async () => {
                            const res = await markWebmailMessaggioSpamAction(
                              selected.id
                            );
                            if (!res.success) {
                              setError(res.error);
                              return;
                            }
                            setSelectedId(null);
                            setInfo("Mail spostata in Spam.");
                            notifyWebmailUnreadNav(accountFilter || null);
                            await reload();
                          });
                        }}
                      >
                        Spam
                      </button>
                      </WithInfoNuvola>
                      <WithInfoNuvola info={MAIL_INFO.archivia}>
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium"
                        onClick={() => {
                          startTransition(async () => {
                            const res = await archiveWebmailMessaggioAction(
                              selected.id
                            );
                            if (!res.success) {
                              setError(res.error);
                              return;
                            }
                            setSelectedId(null);
                            setInfo("Mail spostata in Archiviate.");
                            await reload();
                          });
                        }}
                      >
                        Archivia
                      </button>
                      </WithInfoNuvola>
                      <WithInfoNuvola info={MAIL_INFO.elimina}>
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                        onClick={() => setDeleteConfirmOpen(true)}
                      >
                        Elimina
                      </button>
                      </WithInfoNuvola>
                    </>
                  )}
                </div>

                <div className="mt-3 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-xs">
                  <p className="font-semibold text-slate-700">Anagrafica</p>
                  <p className="mt-1 text-slate-600">
                    {selected.aziendaLabel
                      ? `${selected.aziendaTipo ?? "azienda"} · ${selected.aziendaLabel}`
                      : "Nessuna azienda collegata"}
                    {" · "}
                    {linkStatoLabel(selected.linkStato)}
                    {selected.contattoId ? " · referente collegato" : ""}
                  </p>
                  <WithInfoNuvola info={MAIL_INFO.rematch}>
                  <button
                    type="button"
                    disabled={pending}
                    className="mt-2 rounded border border-[var(--border)] bg-white px-2 py-1 text-[11px] font-medium hover:bg-slate-100 disabled:opacity-50"
                    onClick={() => {
                      startTransition(async () => {
                        const res = await linkWebmailMessaggioAnagraficaAction({
                          messaggioId: selected.id,
                          rematch: true,
                        });
                        if (!res.success) {
                          setError(res.error);
                          return;
                        }
                        patchMessaggio(res.messaggio);
                        setInfo("Match mittente aggiornato.");
                      });
                    }}
                  >
                    Ricalcola match mittente
                  </button>
                  </WithInfoNuvola>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <WithInfoNuvola info={MAIL_INFO.traduci}>
                  <button
                    type="button"
                    disabled={pending || !selected.bodyText.trim()}
                    className="rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-50"
                    onClick={() => {
                      startTransition(async () => {
                        const res = await translateWebmailTextAction({
                          messaggioId: selected.id,
                          subject: selected.subject,
                          bodyText: selected.bodyText,
                          targetLang: "it",
                          direction: "inbound",
                        });
                        if (!res.success) {
                          setError(res.error);
                          return;
                        }
                        setInboundTranslation({
                          subject: res.subject,
                          bodyText: res.bodyText,
                          targetLangLabel: res.targetLangLabel,
                        });
                        setShowInboundTranslation(true);
                        setInfo(
                          `Traduzione in ${res.targetLangLabel} (${res.model}).`
                        );
                      });
                    }}
                  >
                    Traduci in italiano
                  </button>
                  </WithInfoNuvola>
                  {inboundTranslation ? (
                    <WithInfoNuvola info={MAIL_INFO.toggleTraduzione}>
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
                      onClick={() =>
                        setShowInboundTranslation((v) => !v)
                      }
                    >
                      {showInboundTranslation
                        ? "Mostra originale"
                        : "Mostra traduzione"}
                    </button>
                    </WithInfoNuvola>
                  ) : null}
                  {!showInboundTranslation ? (
                    <>
                      <WithInfoNuvola info={MAIL_INFO.soloTesto}>
                      <button
                        type="button"
                        className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
                        onClick={() => setShowPlainText((v) => !v)}
                      >
                        {showPlainText ? "Mostra HTML" : "Solo testo"}
                      </button>
                      </WithInfoNuvola>
                      <WithInfoNuvola info={MAIL_INFO.ricarica}>
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                        onClick={() => {
                          startTransition(async () => {
                            const res =
                              await reloadWebmailMessaggioBodyAction(
                                selected.id
                              );
                            if (!res.success) {
                              setError(res.error);
                              return;
                            }
                            patchMessaggio(res.messaggio);
                            setHtmlReloadToken((t) => t + 1);
                            setShowPlainText(false);
                            setInfo(
                              `Corpo e allegati ricaricati (${res.allegatiSaved} file).`
                            );
                          });
                        }}
                      >
                        Ricarica corpo e allegati
                      </button>
                      </WithInfoNuvola>
                    </>
                  ) : null}
                </div>
                {showInboundTranslation && inboundTranslation ? (
                  <>
                    <pre className="mt-2 max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-800">
                      {[
                        inboundTranslation.subject
                          ? `Oggetto: ${inboundTranslation.subject}`
                          : null,
                        inboundTranslation.bodyText,
                      ]
                        .filter(Boolean)
                        .join("\n\n")}
                    </pre>
                    <p className="mt-1 text-[10px] text-[var(--muted)]">
                      Traduzione Gemini → {inboundTranslation.targetLangLabel}{" "}
                      (originale non modificato)
                    </p>
                  </>
                ) : (
                  <WebmailHtmlBody
                    messaggioId={selected.id}
                    bodyText={selected.bodyText}
                    forcePlain={showPlainText}
                    reloadToken={htmlReloadToken}
                    onError={(msg) => setError(msg)}
                    onAllegatoClick={openAllegatoPanel}
                  />
                )}
              </section>
              {sidePanel ? (
                <aside className="flex min-h-[24rem] min-w-0 flex-col border-t border-[var(--border)] bg-slate-50/70 lg:border-t-0 lg:border-l">
                  <div className="flex shrink-0 items-start justify-between gap-2 border-b border-[var(--border)] bg-white px-4 py-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {sidePanel === "ai"
                          ? "Risposta AI"
                          : sidePanel === "reply"
                            ? "Rispondi"
                            : previewAllegato?.filename || "Allegato"}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {sidePanel === "ai"
                          ? "Controlla, modifica e invia. La bozza resta salvata sulla mail."
                          : sidePanel === "reply"
                            ? "Scrivi e invia la risposta dalla casella collegata."
                            : previewAllegato?.mimeType || "Anteprima allegato"}
                      </p>
                    </div>
                    <WithInfoNuvola info={MAIL_INFO.chiudiPannello}>
                    <button
                      type="button"
                      onClick={closeSidePanel}
                      className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
                    >
                      Chiudi
                    </button>
                    </WithInfoNuvola>
                  </div>
                  {sidePanel === "allegato" && previewAllegato ? (
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                      {previewAllegato.url &&
                      /^image\//i.test(previewAllegato.mimeType) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewAllegato.url}
                          alt={previewAllegato.filename}
                          className="max-h-[70vh] w-full rounded-lg border border-[var(--border)] object-contain bg-white"
                        />
                      ) : previewAllegato.url &&
                        /pdf/i.test(previewAllegato.mimeType) ? (
                        <iframe
                          title={previewAllegato.filename}
                          src={previewAllegato.url}
                          className="min-h-[70vh] w-full rounded-lg border border-[var(--border)] bg-white"
                        />
                      ) : (
                        <p className="text-sm text-[var(--muted)]">
                          Anteprima non disponibile per questo tipo di file.
                        </p>
                      )}
                      {previewAllegato.url ? (
                        <WithInfoNuvola info={MAIL_INFO.apriAllegato}>
                        <a
                          href={previewAllegato.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex text-xs font-medium text-sky-800 hover:underline"
                        >
                          Apri / scarica
                        </a>
                        </WithInfoNuvola>
                      ) : null}
                    </div>
                  ) : null}
                  {sidePanel === "reply" ? (
                    <div className="flex min-h-0 flex-1 flex-col">
                      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                        <label className="block text-sm">
                          <span className="mb-1 block text-xs font-medium">
                            A
                          </span>
                          <input
                            value={replyTo}
                            onChange={(e) => setReplyTo(e.target.value)}
                            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1 block text-xs font-medium">
                            Oggetto
                          </span>
                          <input
                            value={replySubject}
                            onChange={(e) => setReplySubject(e.target.value)}
                            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1 block text-xs font-medium">
                            Testo
                          </span>
                          <textarea
                            value={replyBody}
                            onChange={(e) => setReplyBody(e.target.value)}
                            rows={12}
                            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                          />
                        </label>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2 border-t border-[var(--border)] bg-white px-4 py-3">
                        <WithInfoNuvola info={MAIL_INFO.inviaRisposta}>
                        <button
                          type="button"
                          disabled={pending || !replyTo.trim() || !replyBody.trim()}
                          onClick={sendReply}
                          className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          Invia
                        </button>
                        </WithInfoNuvola>
                      </div>
                    </div>
                  ) : null}
                  {sidePanel === "ai" ? (
                    <div className="flex min-h-0 flex-1 flex-col">
                      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                        {!bozza ? (
                          <div className="space-y-3 py-6 text-center">
                            <p className="text-sm text-[var(--muted)]">
                              {pending
                                ? "Generazione risposta in corso…"
                                : "Nessuna bozza. Genera una proposta di risposta."}
                            </p>
                            <WithInfoNuvola info={MAIL_INFO.generaAiPannello}>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={generateAi}
                              className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                            >
                              Genera risposta AI
                            </button>
                            </WithInfoNuvola>
                          </div>
                        ) : (
                          <>
                            <p className="text-xs text-[var(--muted)]">
                              Intent: {bozza.intent}
                              {bozza.confidence != null
                                ? ` · ${bozza.confidence}%`
                                : ""}
                            </p>
                            <label className="block text-sm">
                              <span className="mb-1 block text-xs font-medium">
                                Oggetto
                              </span>
                              <input
                                value={draftSubject}
                                onChange={(e) => setDraftSubject(e.target.value)}
                                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block text-sm">
                              <span className="mb-1 block text-xs font-medium">
                                Testo
                              </span>
                              <textarea
                                value={draftBody}
                                onChange={(e) => setDraftBody(e.target.value)}
                                rows={12}
                                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                              />
                            </label>
                            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2">
                              <label className="text-xs">
                                <span className="mb-1 block font-medium text-[var(--muted)]">
                                  Traduci bozza in
                                </span>
                                <select
                                  value={outboundLang}
                                  onChange={(e) =>
                                    setOutboundLang(e.target.value)
                                  }
                                  className="rounded border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                                >
                                  {WEBMAIL_TRANSLATE_LANGS.filter(
                                    (l) => l.code !== "it"
                                  ).map((l) => (
                                    <option key={l.code} value={l.code}>
                                      {l.label}
                                    </option>
                                  ))}
                                  <option value="it">Italiano</option>
                                </select>
                              </label>
                              <WithInfoNuvola info={MAIL_INFO.traduciBozza}>
                              <button
                                type="button"
                                disabled={pending || !draftBody.trim()}
                                className="rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-900 disabled:opacity-50"
                                onClick={() => {
                                  startTransition(async () => {
                                    const res = await translateWebmailTextAction({
                                      messaggioId: selected.id,
                                      bozzaId: bozza.id,
                                      subject: draftSubject,
                                      bodyText: draftBody,
                                      targetLang: outboundLang,
                                      direction: "outbound",
                                    });
                                    if (!res.success) {
                                      setError(res.error);
                                      return;
                                    }
                                    setOutboundTranslation({
                                      subject: res.subject,
                                      bodyText: res.bodyText,
                                      targetLangLabel: res.targetLangLabel,
                                    });
                                    setInfo(
                                      `Traduzione bozza → ${res.targetLangLabel} (${res.model}).`
                                    );
                                  });
                                }}
                              >
                                Traduci
                              </button>
                              </WithInfoNuvola>
                              {outboundTranslation ? (
                                <WithInfoNuvola info={MAIL_INFO.applicaTraduzione}>
                                <button
                                  type="button"
                                  disabled={pending}
                                  className="rounded-lg bg-sky-700 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                                  onClick={() => {
                                    if (outboundTranslation.subject) {
                                      setDraftSubject(
                                        outboundTranslation.subject
                                      );
                                    }
                                    setDraftBody(outboundTranslation.bodyText);
                                    setInfo(
                                      `Traduzione applicata al testo della bozza (${outboundTranslation.targetLangLabel}). Salva se vuoi conservarla.`
                                    );
                                  }}
                                >
                                  Applica alla bozza
                                </button>
                                </WithInfoNuvola>
                              ) : null}
                            </div>
                            {outboundTranslation ? (
                              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-sky-200 bg-sky-50 p-2 text-xs text-slate-800">
                                {[
                                  outboundTranslation.subject
                                    ? `Oggetto: ${outboundTranslation.subject}`
                                    : null,
                                  outboundTranslation.bodyText,
                                ]
                                  .filter(Boolean)
                                  .join("\n\n")}
                              </pre>
                            ) : null}
                            {bozza.allegati.length > 0 ? (
                              <ul className="space-y-1 text-xs text-slate-700">
                                {bozza.allegati.map((a) => (
                                  <li key={a.id}>Allegato: {a.fileName}</li>
                                ))}
                              </ul>
                            ) : null}
                          </>
                        )}
                      </div>
                      {bozza ? (
                        <div className="flex shrink-0 flex-wrap gap-2 border-t border-[var(--border)] bg-white px-4 py-3">
                          <WithInfoNuvola info={MAIL_INFO.rigenera}>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={generateAi}
                            className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm text-violet-900"
                          >
                            Rigenera AI
                          </button>
                          </WithInfoNuvola>
                          <WithInfoNuvola info={MAIL_INFO.salvaBozza}>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={saveDraft}
                            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                          >
                            Salva modifiche
                          </button>
                          </WithInfoNuvola>
                          <WithInfoNuvola info={MAIL_INFO.inviaBozza}>
                          <button
                            type="button"
                            disabled={
                              pending || bozza.documentoStato === "inviata"
                            }
                            onClick={sendDraft}
                            className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                          >
                            Invia email
                          </button>
                          </WithInfoNuvola>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </aside>
              ) : null}
            </div>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </div>

      <WebmailCategoriaModal
        open={catTargetIds.length > 0}
        messaggioIds={catTargetIds}
        categorie={categorie}
        accountId={
          (catTargetIds[0]
            ? messaggi.find((x) => x.id === catTargetIds[0])?.accountId
            : null) ??
          selected?.accountId ??
          accountFilter ??
          null
        }
        fromAddresses={catTargetIds.flatMap((id) => {
          const m =
            messaggi.find((x) => x.id === id) ??
            (selected?.id === id ? selected : null);
          return m?.fromAddress ? [m.fromAddress] : [];
        })}
        currentCategoriaId={
          catTargetIds.length === 1
            ? (messaggi.find((m) => m.id === catTargetIds[0])?.categoriaId ??
                (selected?.id === catTargetIds[0]
                  ? selected.categoriaId
                  : null) ??
                null)
            : null
        }
        onClose={() => setCatTargetIds([])}
        onCategoriaCreated={(c) =>
          setCategorie((prev) =>
            prev.some((x) => x.id === c.id) ? prev : [...prev, c]
          )
        }
        onDone={(_id, learnMode) => {
          setInfo(`Categoria aggiornata. Apprendimento: ${learnMode}.`);
          setCatTargetIds([]);
          resetSelection();
          void reload();
        }}
      />

      {selected ? (
        <>
          <WebmailCollegaAziendaFlow
            open={aziendaModalOpen}
            messaggio={selected}
            onClose={() => setAziendaModalOpen(false)}
            onDone={(m, info) => {
              patchMessaggio(m);
              setInfo(info);
              void reload();
            }}
          />
          <WebmailDeleteConfirmModal
            open={deleteConfirmOpen}
            fromAddress={selected.fromAddress}
            alreadyBlocked={senderBlacklisted}
            pending={pending}
            onClose={() => setDeleteConfirmOpen(false)}
            onConfirm={({ blockFutureImport, deleteAllFromSender }) => {
              startTransition(async () => {
                const res = await confirmWebmailMessaggioDeleteAction({
                  messaggioId: selected.id,
                  blockFutureImport,
                  deleteAllFromSender,
                });
                if (!res.success) {
                  setError(res.error);
                  return;
                }
                setDeleteConfirmOpen(false);
                setSelectedId(null);
                setBozza(null);
                const bits = ["Mail eliminata."];
                if (res.blockedFuture) {
                  bits.push(
                    `Non verranno più importate mail da ${selected.fromAddress}.`
                  );
                }
                if (deleteAllFromSender) {
                  bits.push(`Eliminate ${res.purged} mail da questo indirizzo.`);
                }
                setInfo(bits.join(" "));
                await reload();
              });
            }}
          />
        </>
      ) : null}

      <WebmailSyncModal
        open={syncModalOpen}
        accountId={accountFilter || undefined}
        running={pending && syncModalOpen}
        progress={syncProgress}
        onClose={() => {
          if (pending) return;
          setSyncModalOpen(false);
          setSyncProgress(null);
        }}
        onConfirm={runSyncChoice}
      />
      <WebmailSyncImportedStatusModal
        open={Boolean(importedStatus)}
        importedCount={importedStatus?.ids.length ?? 0}
        pending={pending}
        onChoose={applyImportedStatus}
      />
      <WebmailSelectScopeModal
        open={selectScopeOpen}
        pageCount={messaggi.length}
        totalCount={totalCount}
        pending={pending}
        variant={view === "categoria" ? "categoria" : "elenco"}
        onClose={() => setSelectScopeOpen(false)}
        onChoosePage={chooseSelectPage}
        onChooseAll={chooseSelectAll}
      />
      <WebmailBulkDeleteModal
        open={bulkDeleteOpen}
        count={selectedIds.length}
        inCestino={view === "cestino"}
        pending={pending}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={({ confermaTestuale, purgeFromTrash }) => {
          startTransition(async () => {
            const res = await bulkDeleteWebmailMessaggiAction({
              messaggioIds: selectedIds,
              confermaTestuale,
              purgeFromTrash,
            });
            if (!res.success) {
              setError(res.error);
              return;
            }
            setBulkDeleteOpen(false);
            setSelectedId(null);
            setInfo(
              purgeFromTrash
                ? `${res.updated} mail spostate nel cestino e rimosse dal cestino.`
                : `${res.updated} mail spostate nel cestino.`
            );
            resetSelection();
            await reload();
          });
        }}
      />
    </div>
  );
}
