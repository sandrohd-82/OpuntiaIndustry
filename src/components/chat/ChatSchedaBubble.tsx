import { schedaEntityLabel } from "@/lib/chat/types";

type SchedaBubblePayload = {
  entityType?: unknown;
  title?: unknown;
  subtitle?: unknown;
  fields?: unknown;
  referenti?: unknown;
  includePrice?: unknown;
  priceLabel?: unknown;
  priceValue?: unknown;
};

type Props = {
  payload: SchedaBubblePayload;
  contentFallback?: string;
};

function asFieldList(
  raw: unknown
): Array<{ label: string; value: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const label = String(o.label ?? "").trim();
      const value = String(o.value ?? "").trim();
      if (!label || !value) return null;
      return { label, value };
    })
    .filter((x): x is { label: string; value: string } => Boolean(x));
}

function asReferenti(
  raw: unknown
): Array<{ label: string; dettaglio: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const label = String(o.label ?? "").trim();
      if (!label) return null;
      return {
        label,
        dettaglio: String(o.dettaglio ?? "").trim(),
      };
    })
    .filter((x): x is { label: string; dettaglio: string } => Boolean(x));
}

export function ChatSchedaBubble({ payload, contentFallback }: Props) {
  const entityKey = String(payload.entityType ?? "");
  const fields = asFieldList(payload.fields);
  const referenti = asReferenti(payload.referenti);
  const includePrice = Boolean(payload.includePrice);
  const priceLabel = String(payload.priceLabel ?? "").trim();
  const priceValue = String(payload.priceValue ?? "").trim();
  const hasDetails =
    fields.length > 0 ||
    referenti.length > 0 ||
    (includePrice && priceValue);

  return (
    <div className="relative space-y-1.5 text-sm">
      <p className="text-[10px] uppercase tracking-wide opacity-80">
        Scheda {schedaEntityLabel[entityKey] ?? entityKey}
      </p>
      <p className="font-medium">
        {String(payload.title ?? contentFallback ?? "")}
      </p>
      {payload.subtitle ? (
        <p className="text-xs opacity-90">{String(payload.subtitle)}</p>
      ) : null}

      {hasDetails ? (
        <dl className="mt-1 space-y-1 border-t border-current/15 pt-1.5 text-xs">
          {fields.map((f) => (
            <div key={`${f.label}:${f.value.slice(0, 24)}`}>
              <dt className="font-semibold opacity-80">{f.label}</dt>
              <dd className="whitespace-pre-wrap break-words opacity-95">
                {f.value}
              </dd>
            </div>
          ))}
          {referenti.map((r) => (
            <div key={r.label}>
              <dt className="font-semibold opacity-80">Referente</dt>
              <dd className="opacity-95">
                {r.label}
                {r.dettaglio ? (
                  <span className="block opacity-80">{r.dettaglio}</span>
                ) : null}
              </dd>
            </div>
          ))}
          {includePrice && priceValue ? (
            <div>
              <dt className="font-semibold opacity-80">
                {priceLabel || "Prezzo"}
              </dt>
              <dd className="opacity-95">{priceValue}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
