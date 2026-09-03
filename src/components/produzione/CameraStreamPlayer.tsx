"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  whepUrl: string;
  label: string;
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

export function CameraStreamPlayer({ whepUrl, label }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;

    async function connect() {
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
        video.srcObject = ev.streams[0] ?? new MediaStream(ev.track ? [ev.track] : []);
        void video.play().catch(() => {
          /* autoplay policy: l’utente ha già cliccato Apri live */
        });
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
        const body = await res.text();
        throw new Error(
          `WebRTC non avviato (${res.status}). Verifica MediaMTX e che il PC sia in LAN. ${body.slice(0, 120)}`
        );
      }
      const answer = await res.text();
      if (cancelled) return;
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    }

    void connect().catch((e) => {
      if (!cancelled) {
        setError(e instanceof Error ? e.message : "Connessione live fallita.");
      }
    });

    return () => {
      cancelled = true;
      const pc = pcRef.current;
      pcRef.current = null;
      if (pc) {
        pc.ontrack = null;
        pc.close();
      }
      if (video) {
        video.srcObject = null;
      }
    };
  }, [whepUrl]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
        <span>LIVE — {label}</span>
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
