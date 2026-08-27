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
 * Modale posizione con Google Maps (Places + pin + GPS ad alta precisione).
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
  const accuracyCircleRef = useRef<google.maps.Circle | null>(null);

  const [geoBusy, setGeoBusy] = useState(false);
  const [geoHint, setGeoHint] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [missingKey, setMissingKey] = useState(false);
  const [pin, setPin] = useState<{
    lat: number;
    lng: number;
    label: string;
    source: "attuale" | "cerca";
    accuracyM?: number | null;
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
      label?: string,
      accuracyM?: number | null
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
              accuracyM: null,
            });
            setGeoHint(null);
            if (accuracyCircleRef.current) {
              accuracyCircleRef.current.setMap(null);
              accuracyCircleRef.current = null;
            }
            if (searchRef.current) searchRef.current.value = lbl;
          })();
        });
      }

      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.setMap(null);
        accuracyCircleRef.current = null;
      }
      if (
        typeof accuracyM === "number" &&
        accuracyM > 0 &&
        Number.isFinite(accuracyM)
      ) {
        accuracyCircleRef.current = new g.maps.Circle({
          map,
          center: pos,
          radius: accuracyM,
          strokeColor: "#2563eb",
          strokeOpacity: 0.8,
          strokeWeight: 1,
          fillColor: "#3b82f6",
          fillOpacity: 0.15,
        });
      }

      map.panTo(pos);
      const zoom = accuracyM && accuracyM > 200 ? 15 : 17;
      if ((map.getZoom() ?? 0) < zoom) map.setZoom(zoom);

      const resolved = label ?? (await reverseGeocode(lat, lng));
      setPin({
        lat,
        lng,
        label: resolved,
        source,
        accuracyM: accuracyM ?? null,
      });
      if (searchRef.current) searchRef.current.value = resolved;

      if (source === "attuale" && typeof accuracyM === "number") {
        if (accuracyM > 150) {
          setGeoHint(
            `Attenzione: precisione scarsa (±${Math.round(accuracyM)} m). Su PC/Wi‑Fi aziendale il browser stima spesso la sede (IP/rete), non il GPS. Trascina il pin o usa un telefono.`
          );
        } else {
          setGeoHint(`Precisione rilevata: circa ±${Math.round(accuracyM)} m.`);
        }
      } else {
        setGeoHint(null);
      }
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
    const searchInput = searchRef.current;

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

        if (searchInput) {
          const ac = new g.maps.places.Autocomplete(searchInput, {
            fields: ["formatted_address", "geometry", "name"],
            componentRestrictions: { country: ["it"] },
          });
          autocompleteRef.current = ac;
          ac.addListener("place_changed", () => {
            const place = ac.getPlace();
            const loc = place.geometry?.location;
            if (!loc) {
              onError(
                "Luogo senza coordinate. Scegli un suggerimento dalla lista."
              );
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
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.setMap(null);
        accuracyCircleRef.current = null;
      }
      setPin(null);
      setGeoHint(null);
      setReady(false);
      if (searchInput) searchInput.value = "";
    };
  }, [open, onError, placeMarker]);

  async function locateCurrentPosition() {
    if (!navigator.geolocation) {
      onError("Geolocalizzazione non disponibile su questo browser.");
      return;
    }

    try {
      const perm = await navigator.permissions?.query({
        name: "geolocation" as PermissionName,
      });
      if (perm?.state === "denied") {
        onError(
          "Permesso posizione negato. Nel lucchetto vicino all’URL consenti la posizione per questo sito, poi riprova."
        );
        return;
      }
    } catch {
      // permissions API non ovunque
    }

    setGeoBusy(true);
    setGeoHint(
      "Richiesta permesso e rilevamento GPS in corso… attendi qualche secondo."
    );

    const options: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    };

    const best = await new Promise<GeolocationPosition | null>((resolve) => {
      let settled = false;
      let bestPos: GeolocationPosition | null = null;
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!bestPos || pos.coords.accuracy < bestPos.coords.accuracy) {
            bestPos = pos;
          }
          if (pos.coords.accuracy <= 40) {
            if (settled) return;
            settled = true;
            navigator.geolocation.clearWatch(watchId);
            resolve(pos);
          }
        },
        (err) => {
          if (settled) return;
          settled = true;
          navigator.geolocation.clearWatch(watchId);
          if (err.code === err.PERMISSION_DENIED) {
            onError(
              "Hai negato il permesso di posizione. Abilitalo nel lucchetto vicino all’URL del browser."
            );
          } else if (err.code === err.TIMEOUT) {
            onError(
              "Timeout GPS. Riprova all’aperto o trascina il pin sulla mappa."
            );
          } else {
            onError("Impossibile ottenere la posizione attuale.");
          }
          resolve(null);
        },
        options
      );

      window.setTimeout(() => {
        if (settled) return;
        settled = true;
        navigator.geolocation.clearWatch(watchId);
        resolve(bestPos);
      }, 10000);
    });

    if (!best) {
      setGeoBusy(false);
      return;
    }

    try {
      await placeMarker(
        best.coords.latitude,
        best.coords.longitude,
        "attuale",
        undefined,
        best.coords.accuracy
      );
    } finally {
      setGeoBusy(false);
    }
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
            onClick={() => void locateCurrentPosition()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            <FaLocationCrosshairs size={12} />
            {geoBusy ? "Rilevamento GPS…" : "Usa posizione attuale"}
          </button>
          {geoHint ? (
            <p className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-[11px] text-sky-950">
              {geoHint}
            </p>
          ) : null}
        </div>

        <div
          ref={mapElRef}
          className="w-full bg-slate-100"
          style={{ height: 320 }}
        />

        <div className="space-y-2 border-t border-[var(--border)] px-3 py-3">
          <p className="text-[11px] text-slate-500">
            Digita e scegli un suggerimento, tocca la mappa o trascina il pin.
            Su PC senza GPS la “posizione attuale” può risultare la sede
            aziendale (Wi‑Fi/IP).
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
