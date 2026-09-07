import {
  validitaDocumentoLabel,
  type ValiditaDocumento,
} from "@/lib/amministrazione/organigramma";

export function ValiditaDocumentoBadge({
  stato,
}: {
  stato: ValiditaDocumento;
}) {
  const scaduto = stato === "scaduto";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
        scaduto
          ? "bg-red-100 text-red-700"
          : "bg-emerald-100 text-emerald-800"
      }`}
    >
      {validitaDocumentoLabel(stato)}
    </span>
  );
}
