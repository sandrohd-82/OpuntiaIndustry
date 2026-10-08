"use client";

import { useEffect } from "react";

/** Le finestre si chiudono solo dai pulsanti: Invio non invia il modulo, Esc non le chiude. */
export function ModalChiusuraSoloTasti() {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const aperta = document.querySelector("[role='dialog'], [aria-modal='true']");
      if (!aperta) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.key !== "Enter") return;
      const el = event.target;
      if (!(el instanceof HTMLElement) || !aperta.contains(el)) return;
      if (el.tagName === "TEXTAREA" || el.tagName === "BUTTON") return;
      if (el.isContentEditable) return;
      if (el.closest("button, a, [role='option'], [role='listbox']")) return;
      event.preventDefault();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
