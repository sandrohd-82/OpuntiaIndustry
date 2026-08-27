"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FaLocationCrosshairs, FaXmark } from "react-icons/fa6";
import type { LocationPayload } from "@/lib/chat/share";

type Hit = { label: string; lat: number; lng: number };

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: LocationPayload) => void | Promise<void>;
  onError: (msg: string) => void;
  busy?: boolean;
};

const IT_CENTER: [number, number] = [41.9028, 12.4964];

async function nominatimSearch(q: string): Promise<Hit[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=8&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Ricerca fallita");
  const data = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
  }>;
  return data.map((d) => ({
    label: d.display_name,
    lat: Number(d.lat),
    lng: Number(d.lon),
  }));
}

async function nominatimReverse(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=0`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    return `Posizione (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
  }
  const data = (await res.json()) as { display_name?: string };
  return (
    data.display_name?.trim() ||
    `Posizione (${lat.toFixed(5)}, ${lng.toFixed(5)})`
  );
}

/**
 * Modale mappa OSM/Leaflet: cerca, click pin, posizione attuale, conferma.
 * Leaflet caricato solo client-side (no SSR).
 */
export function ChatLocationMapModal({
  open,
  onClose,
  onConfirm,
  onError,
  busy = false,
}: Props) {
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [pin, setPin] = useState<{
    lat: number;
    lng: number;
    label: string;
    source: "attuale" | "cerca";
  } | null>(null);

  const placeMarker = useCallback(
    async (
      lat: number,
      lng: number,
      source: "attuale" | "cerca",
      label?: string
    ) => {
      const L = LRef.current;
      const map = mapRef.current;
      if (!L || !map) return;

      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(
          map
        );
        markerRef.current.on("dragend", () => {
          const pos = markerRef.current?.getLatLng();
          if (!pos) return;
          void (async () => {
            const lbl = await nominatimReverse(pos.lat, pos.lng);
            setPin({
              lat: pos.lat,
              lng: pos.lng,
              label: lbl,
              source: "cerca",
            });
          })();
        });
      }

      map.setView([lat, lng], Math.max(map.getZoom(), 15));
      const resolved = label ?? (await nominatimReverse(lat, lng));
      setPin({ lat, lng, label: resolved, source });
    },
    []
  );

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }

    let cancelled = false;
    let resizeTimer: number | undefined;

    void (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapElRef.current) return;

      // CSS Leaflet (CDN, evita import TS di .css)
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      LRef.current = L;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }

      const map = L.map(mapElRef.current, {
        center: IT_CENTER,
        zoom: 6,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      map.on("click", (e) => {
        void placeMarker(e.latlng.lat, e.latlng.lng, "cerca");
      });

      mapRef.current = map;
      setReady(true);
      resizeTimer = window.setTimeout(() => map.invalidateSize(), 120);
    })();

    return () => {
      cancelled = true;
      if (resizeTimer) window.clearTimeout(resizeTimer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
      LRef.current = null;
      setPin(null);
      setHits([]);
      setQuery("");
      setReady(false);
    };
  }, [open, placeMarker]);

  async function runSearch() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const list = await nominatimSearch(q);
      setHits(list);
      if (list[0]) {
        await placeMarker(list[0].lat, list[0].lng, "cerca", list[0].label);
      }
    } catch {
      onError("Ricerca posizione fallita.");
    } finally {
      setSearching(false);
    }
  }

  function useCurrent() {
    if (!navigator.geolocation) {
      onError("Geolocalizzazione non disponibile.");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void placeMarker(
          pos.coords.latitude,
          pos.coords.longitude,
          "attuale"
        ).finally(() => setGeoBusy(false));
      },
      () => {
        setGeoBusy(false);
        onError("Impossibile ottenere la posizione.");
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  async function confirm() {
    if (!pin) {
      onError("Seleziona un punto sulla mappa.");
      return;
    }
    await onConfirm({
      lat: pin.lat,
      lng: pin.lng,
      label: pin.label,
      source: pin.source,
    });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/55 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-[var(--card)] shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold">Posizione sulla mappa</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Chiudi"
          >
            <FaXmark size={14} />
          </button>
        </div>

        <div className="space-y-2 border-b border-[var(--border)] px-3 py-2">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca indirizzo, città…"
              className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void runSearch();
                }
              }}
            />
            <button
              type="button"
              disabled={searching || busy || !ready}
              onClick={() => void runSearch()}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm text-white disabled:opacity-40"
            >
              Cerca
            </button>
          </div>
          <button
            type="button"
            disabled={geoBusy || busy || !ready}
            onClick={useCurrent}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            <FaLocationCrosshairs size={12} />
            Usa posizione attuale
          </button>
          {hits.length > 1 ? (
            <div className="max-h-24 space-y-1 overflow-y-auto">
              {hits.map((h) => (
                <button
                  key={`${h.lat}-${h.lng}-${h.label}`}
                  type="button"
                  className="block w-full rounded border border-[var(--border)] px-2 py-1 text-left text-[11px] hover:bg-slate-50"
                  onClick={() =>
                    void placeMarker(h.lat, h.lng, "cerca", h.label)
                  }
                >
                  {h.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div
          ref={mapElRef}
          className="w-full bg-slate-100"
          style={{ height: 320 }}
        />

        <div className="space-y-2 border-t border-[var(--border)] px-3 py-3">
          <p className="text-[11px] text-slate-500">
            Tocca la mappa o trascina il pin per scegliere il punto.
          </p>
          {pin ? (
            <p className="line-clamp-2 text-xs text-slate-800">{pin.label}</p>
          ) : (
            <p className="text-xs text-slate-400">Nessun punto selezionato</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              Annulla
            </button>
            <button
              type="button"
              disabled={!pin || busy}
              onClick={() => void confirm()}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm text-white disabled:opacity-40"
            >
              Condividi posizione
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
