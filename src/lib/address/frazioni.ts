import type { PaeseSuggestion } from "@/lib/address/types";

type NominatimItem = {
  place_id: number;
  name?: string;
  display_name: string;
  type?: string;
  class?: string;
  address?: Record<string, string | undefined>;
};

const LOCALITY_TYPES = new Set([
  "village",
  "hamlet",
  "suburb",
  "neighbourhood",
  "neighborhood",
  "locality",
  "isolated_dwelling",
  "quarter",
  "city_block",
  "town",
  "city",
  "municipality",
  "administrative",
]);

function localityName(item: NominatimItem): string {
  const a = item.address ?? {};
  return (
    a.village ||
    a.hamlet ||
    a.suburb ||
    a.neighbourhood ||
    a.neighborhood ||
    a.locality ||
    a.isolated_dwelling ||
    a.quarter ||
    item.name ||
    item.display_name.split(",")[0]?.trim() ||
    ""
  );
}

function parentComune(item: NominatimItem, locality: string): string {
  const a = item.address ?? {};
  const candidates = [
    a.municipality,
    a.city,
    a.town,
    a.city_district,
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    if (c.toLocaleLowerCase("it-IT") !== locality.toLocaleLowerCase("it-IT")) {
      return c;
    }
  }

  // Fallback: seconda parte del display_name (spesso il comune madre)
  const parts = item.display_name.split(",").map((p) => p.trim());
  if (parts.length >= 2) {
    const second = parts[1];
    const provincia = a.county || a.state || "";
    if (
      second &&
      second.toLocaleLowerCase("it-IT") !== locality.toLocaleLowerCase("it-IT") &&
      second.toLocaleLowerCase("it-IT") !== provincia.toLocaleLowerCase("it-IT")
    ) {
      return second;
    }
  }

  return "";
}

function siglaFromAddress(item: NominatimItem): string {
  const iso = item.address?.["ISO3166-2-lvl6"];
  if (iso?.startsWith("IT-") && iso.length === 5) return iso.slice(3);
  return "";
}

function isLocalityResult(item: NominatimItem): boolean {
  if (item.type && LOCALITY_TYPES.has(item.type)) return true;
  if (item.class === "place") return true;
  const a = item.address ?? {};
  return Boolean(
    a.village || a.hamlet || a.suburb || a.locality || a.neighbourhood
  );
}

export async function searchFrazioniByName(
  query: string,
  limit = 12
): Promise<PaeseSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const params = new URLSearchParams({
    q,
    countrycodes: "it",
    format: "jsonv2",
    addressdetails: "1",
    limit: String(limit),
    "accept-language": "it",
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "OpuntiaIndustry/1.0 (gestionale; frazioni-autocomplete)",
      },
      next: { revalidate: 0 },
    }
  );

  if (!response.ok) return [];

  const data = (await response.json()) as NominatimItem[];
  const suggestions: PaeseSuggestion[] = [];
  const seen = new Set<string>();

  for (const item of data) {
    if (!isLocalityResult(item)) continue;

    const paese = localityName(item);
    if (!paese) continue;

    const comune = parentComune(item, paese);
    const provincia = item.address?.county || item.address?.state || "";
    const sigla = siglaFromAddress(item);
    const cap = item.address?.postcode || "";
    const kind =
      comune &&
      comune.toLocaleLowerCase("it-IT") !== paese.toLocaleLowerCase("it-IT")
        ? "frazione"
        : "comune";

    const key = `${paese}|${comune}|${provincia}|${cap}`.toLocaleLowerCase(
      "it-IT"
    );
    if (seen.has(key)) continue;
    seen.add(key);

    const labelParts = [
      paese,
      kind === "frazione" && comune ? `frazione di ${comune}` : null,
      sigla ? `(${sigla})` : provincia ? `(${provincia})` : null,
      cap ? `CAP ${cap}` : null,
    ].filter(Boolean);

    suggestions.push({
      id: `osm-${item.place_id}`,
      cap,
      caps: cap ? [cap] : [],
      paese,
      citta: paese,
      provincia,
      siglaProvincia: sigla,
      nazione: item.address?.country || "Italia",
      label: labelParts.join(" · "),
      kind,
      comune: comune || undefined,
    });
  }

  return suggestions;
}
