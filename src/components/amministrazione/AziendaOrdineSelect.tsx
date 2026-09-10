"use client";

import { ClienteSelectField } from "@/components/amministrazione/ClienteSelectField";
import { PossibileClienteSelectField } from "@/components/amministrazione/PossibileClienteSelectField";
import { useClienti } from "@/hooks/useClienti";
import type { Cliente } from "@/lib/amministrazione/clienti";
import type { AnagraficaOrdineFonte } from "@/lib/amministrazione/ordine-anagrafica";
import type { ClientePossibile } from "@/lib/promemorie-e-note/types";

export type AziendaOrdineSelection = {
  fonte: AnagraficaOrdineFonte;
  cliente: Cliente | null;
  possibile: ClientePossibile | null;
};

type Props = {
  fonte: AnagraficaOrdineFonte;
  clienteId: string;
  possibileClienteId: string;
  onFonteChange: (fonte: AnagraficaOrdineFonte) => void;
  onChange: (selection: AziendaOrdineSelection) => void;
  autoFocus?: boolean;
  allowFonteSwitch?: boolean;
};

export function AziendaOrdineSelect({
  fonte,
  clienteId,
  possibileClienteId,
  onFonteChange,
  onChange,
  autoFocus,
  allowFonteSwitch = true,
}: Props) {
  const { clienti } = useClienti();

  function setFonte(next: AnagraficaOrdineFonte) {
    if (next === fonte) return;
    onFonteChange(next);
    onChange({ fonte: next, cliente: null, possibile: null });
  }

  return (
    <div className="space-y-3">
      {allowFonteSwitch ? (
        <fieldset className="space-y-2">
          <legend className="mb-1 block text-sm font-medium">
            Seleziona da
          </legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="anagrafica-ordine-fonte"
                checked={fonte === "cliente"}
                onChange={() => setFonte("cliente")}
              />
              Cliente
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="anagrafica-ordine-fonte"
                checked={fonte === "possibile"}
                onChange={() => setFonte("possibile")}
              />
              Possibile cliente
            </label>
          </div>
        </fieldset>
      ) : null}

      {fonte === "cliente" ? (
        <ClienteSelectField
          value={clienteId}
          autoFocus={autoFocus}
          onChange={(cliente) =>
            onChange({ fonte: "cliente", cliente, possibile: null })
          }
        />
      ) : (
        <PossibileClienteSelectField
          value={possibileClienteId}
          autoFocus={autoFocus}
          onChange={(possibile) => {
            const existing =
              possibile?.clienteId
                ? (clienti.find((c) => c.id === possibile.clienteId) ?? null)
                : null;
            onChange({ fonte: "possibile", cliente: existing, possibile });
          }}
        />
      )}

      {fonte === "possibile" ? (
        <p className="text-xs text-[var(--muted)]">
          Alla conferma l’anagrafica diventa cliente (targa e numero ordine) e
          resta tracciata in audit. Se è già convertita, si usa il cliente
          esistente.
        </p>
      ) : null}
    </div>
  );
}
