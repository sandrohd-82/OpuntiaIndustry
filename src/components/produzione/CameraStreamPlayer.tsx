"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

type Props = {
  label: string;
  hlsUrl: string;
  whepUrl?: string | null;
};

async function waitIceGathering(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const to = window.setTimeout(resolve, 2500);
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete") {
        window.clearTimeout(to);
        resolve();
      }
    };
  });
}

export function CameraStreamPlayer({ label, hlsUrl, whepUrl }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"hls" | "webrtc">("hls");

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    if (!video) return;

    function cleanup() {
      const pc = pcRef.current;
      pcRef.current = null;
      if (pc) {
        pc.ontrack = null;
        pc.close();
      }
      const hls = hlsRef.current;
      hlsRef.current = null;
      if (hls) hls.destroy();
      if (video) {
        video.srcObject = null;
        video.removeAttribute("src");
        video.load();
      }
    }

    async function playHls() {
      const el = videoRef.current;
      if (!el) return;
      setMode("hls");
      setError(null);
      setReady(false);
      if (el.canPlayType("application/vnd.apple.mpegurl")) {
        el.src = hlsUrl;
        await el.play();
        if (!cancelled) setReady(true);
        return;
      }
      if (!Hls.isSupported()) {
        throw new Error("Questo browser non riproduce HLS. Usa Safari, Chrome o Edge aggiornati.");
      }
      const hls = new Hls({
        lowLatencyMode: true,
        enableWorker: true,
      });
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        void el.play().then(() => {
          if (!cancelled) setReady(true);
        });
      });
      hls.on(Hls.Events.ERROR, (_ev, data) => {
        if (!data.fatal || cancelled) return;
        setError(
          `HLS non disponibile (${data.details}). Verifica Tunnel Cloudflare e MediaMTX in officina.`
        );
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(el);
    }

    async function playWhep() {
      if (!whepUrl) return;
      setMode("webrtc");
      cleanup();
      setError(null);
      setReady(false);
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });
      pc.ontrack = (ev) => {
        if (!video || cancelled) return;
        video.srcObject = ev.streams[0] ?? new MediaStream([ev.track]);
        void video.play().catch(() => undefined);
        setReady(true);
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitIceGathering(pc);
      const sdp = pc.localDescription?.sdp;
      if (!sdp || cancelled) return;
      const res = await fetch(whepUrl, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: sdp,
      });
      if (!res.ok) {
        throw new Error(`WebRTC LAN non avviato (${res.status}).`);
      }
      await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
    }

    cleanup();
    void playHls().catch((e) => {
      if (cancelled) return;
      if (whepUrl) {
        void playWhep().catch((we) => {
          if (!cancelled) {
            setError(
              e instanceof Error ? e.message : we instanceof Error ? we.message : "Live fallito."
            );
          }
        });
        return;
      }
      setError(e instanceof Error ? e.message : "Live HLS fallito.");
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [hlsUrl, whepUrl]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
        <span>
          LIVE — {label}
          <span className="ml-2 text-xs font-normal text-[var(--muted)]">
            {mode === "hls" ? "HLS (remoto / Tunnel)" : "WebRTC (LAN)"}
          </span>
        </span>
      </div>
      <video
        ref={videoRef}
        className="aspect-video w-full rounded-lg bg-slate-950 object-contain"
        playsInline
        muted
        autoPlay
        controls
      />
      {!ready && !error ? (
        <p className="text-xs text-[var(--muted)]">
          Apertura stream on-demand verso la ieGeek…
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
