"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FaLocationCrosshairs, FaXmark } from "react-icons/fa6";
import type { LocationPayload } from "@/lib/chat/share";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: LocationPayload) => void | Promise<void>;
  onError: (msg: string) => void;
  busy?: boolean;
};

const IT_CENTER = { lat: 41.9028, lng: 12.4964 };

declare global {
  interface Window {
    google?: typeof google;
    __opuntiaGmapsPromise?: Promise<typeof google>;
  }
}

function getApiKey(): string {
  return (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "").trim();
}

function loadGoogleMaps(apiKey: string): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Solo browser"));
  }
  if (window.google?.maps) return Promise.resolve(window.google);
  if (window.__opuntiaGmapsPromise) return window.__opuntiaGmapsPromise;

  window.__opuntiaGmapsPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById("opuntia-google-maps");
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.google?.maps) resolve(window.google);
        else reject(new Error("Google Maps non caricato"));
      });
      return;
    }
    const script = document.createElement("script");
    script.id = "opuntia-google-maps";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=it&region=IT`;
    script.onload = () => {
      if (window.google?.maps) resolve(window.google);
      else reject(new Error("Google Maps non disponibile"));
    };
    script.onerror = () =>
      reject(new Error("Impossibile caricare Google Maps (controlla la API key)."));
    document.head.appendChild(script);
  });

  return window.__opuntiaGmapsPromise;
}

/**
 * Modale posizione con Google Maps (Places + pin + GPS).
 */
export function ChatLocationMapModal({
  open,
  onClose,
  onConfirm,
  onError,
  busy = false,
}: Props) {
  const mapElRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const [geoBusy, setGeoBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [missingKey, setMissingKey] = useState(false);
  const [pin, setPin] = useState<{
    lat: number;
    lng: number;
    label: string;
    source: "attuale" | "cerca";
  } | null>(null);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    const geocoder = geocoderRef.current;
    if (!geocoder) {
      return `Posizione (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
    }
    return new Promise<string>((resolve) => {
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === "OK" && results?.[0]?.formatted_address) {
          resolve(results[0].formatted_address);
          return;
        }
        resolve(`Posizione (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
      });
    });
  }, []);

  const placeMarker = useCallback(
    async (
      lat: number,
      lng: number,
      source: "attuale" | "cerca",
      label?: string
    ) => {
      const map = mapRef.current;
      const g = window.google;
      if (!map || !g?.maps) return;

      const pos = { lat, lng };
      if (markerRef.current) {
        markerRef.current.setPosition(pos);
      } else {
        markerRef.current = new g.maps.Marker({
          map,
          position: pos,
          draggable: true,
          animation: g.maps.Animation.DROP,
        });
        markerRef.current.addListener("dragend", () => {
          const p = markerRef.current?.getPosition();
          if (!p) return;
          void (async () => {
            const lbl = await reverseGeocode(p.lat(), p.lng());
            setPin({
              lat: p.lat(),
              lng: p.lng(),
              label: lbl,
              source: "cerca",
            });
            if (searchRef.current) searchRef.current.value = lbl;
          })();
        });
      }

      map.panTo(pos);
      if ((map.getZoom() ?? 0) < 15) map.setZoom(16);

      const resolved = label ?? (await reverseGeocode(lat, lng));
      setPin({ lat, lng, label: resolved, source });
      if (searchRef.current) searchRef.current.value = resolved;
    },
    [reverseGeocode]
  );

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      setMissingKey(true);
      onError(
        "Manca NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Aggiungila in .env.local e su Vercel."
      );
      return;
    }
    setMissingKey(false);

    let cancelled = false;
    let clickListener: google.maps.MapsEventListener | null = null;

    void (async () => {
      try {
        const g = await loadGoogleMaps(apiKey);
        if (cancelled || !mapElRef.current) return;

        geocoderRef.current = new g.maps.Geocoder();
        const map = new g.maps.Map(mapElRef.current, {
          center: IT_CENTER,
          zoom: 6,
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: true,
          zoomControl: true,
        });
        mapRef.current = map;

        clickListener = map.addListener("click", (e: google.maps.MapMouseEvent) => {
          const ll = e.latLng;
          if (!ll) return;
          void placeMarker(ll.lat(), ll.lng(), "cerca");
        });

        if (searchRef.current) {
          const ac = new g.maps.places.Autocomplete(searchRef.current, {
            fields: ["formatted_address", "geometry", "name"],
            componentRestrictions: { country: ["it"] },
          });
          autocompleteRef.current = ac;
          ac.addListener("place_changed", () => {
            const place = ac.getPlace();
            const loc = place.geometry?.location;
            if (!loc) {
              onError("Luogo senza coordinate. Scegli un suggerimento dalla lista.");
              return;
            }
            void placeMarker(
              loc.lat(),
              loc.lng(),
              "cerca",
              place.formatted_address || place.name || undefined
            );
          });
        }

        setReady(true);
      } catch (e) {
        onError(e instanceof Error ? e.message : "Errore Google Maps");
      }
    })();

    return () => {
      cancelled = true;
      if (clickListener) clickListener.remove();
      autocompleteRef.current = null;
      markerRef.current = null;
      mapRef.current = null;
      geocoderRef.current = null;
      setPin(null);
      setReady(false);
      if (searchRef.current) searchRef.current.value = "";
    };
  }, [open, onError, placeMarker]);

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
          <h2 className="text-sm font-semibold">Posizione (Google Maps)</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Chiudi"
          >
            <FaXmark size={14} />
          </button>
        </div>

        {missingKey ? (
          <p className="m-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Chiave Google Maps assente. Aggiungi{" "}
            <code className="font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in{" "}
            <code className="font-mono">.env.local</code> e su Vercel, poi
            riavvia l’app.
          </p>
        ) : null}

        <div className="space-y-2 border-b border-[var(--border)] px-3 py-2">
          <input
            ref={searchRef}
            defaultValue=""
            placeholder="Cerca indirizzo con Google…"
            disabled={missingKey || !ready}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50"
            autoComplete="off"
          />
          <button
            type="button"
            disabled={geoBusy || busy || missingKey || !ready}
            onClick={useCurrent}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            <FaLocationCrosshairs size={12} />
            Usa posizione attuale
          </button>
        </div>

        <div
          ref={mapElRef}
          className="w-full bg-slate-100"
          style={{ height: 320 }}
        />

        <div className="space-y-2 border-t border-[var(--border)] px-3 py-3">
          <p className="text-[11px] text-slate-500">
            Digita e scegli un suggerimento, tocca la mappa o trascina il pin.
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
              disabled={!pin || busy || missingKey}
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
