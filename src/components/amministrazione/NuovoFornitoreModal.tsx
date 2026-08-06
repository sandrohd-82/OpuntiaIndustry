"use client";

import { FornitoreFormModal } from "@/components/amministrazione/FornitoreFormModal";
import type { FornitoreInput } from "@/lib/amministrazione/fornitori";

type Props = {
  onClose: () => void;
  onCreate: (values: FornitoreInput) => void | Promise<void>;
};

/** Compatibilità: nuova scheda fornitore. */
export function NuovoFornitoreModal({ onClose, onCreate }: Props) {
  return (
    <FornitoreFormModal mode="create" onClose={onClose} onSave={onCreate} />
  );
}
