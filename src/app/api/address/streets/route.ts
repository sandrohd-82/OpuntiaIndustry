import { NextResponse } from "next/server";
import {
  joinStreetAndCivico,
  normalizeStreetQuery,
  splitStreetAndCivico,
} from "@/lib/address/street";
import type { StreetSuggestion } from "@/lib/address/types";

type NominatimItem = {
  place_id: number;
  display_name: string;
  address?: {
    road?: string;
    pedestrian?: string;
    footway?: string;
    house_number?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
  };
};

function roadName(item: NominatimItem): string {
  return (
    item.address?.road ||
    item.address?.pedestrian ||
    item.address?.footway ||
    item.display_name.split(",")[0]?.trim() ||
    ""
  );
}

function buildIndirizzo(item: NominatimItem, civicoHint: string): string {
  const road = roadName(item);
  if (!road) return "";
  const civico = item.address?.house_number || civicoHint;
  return joinStreetAndCivico(road, civico);
}

async function nominatimSearch(params: URLSearchParams) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "OpuntiaIndustry/1.0 (gestionale; address-autocomplete)",
      },
      next: { revalidate: 0 },
    }
  );
  if (!response.ok) return [] as NominatimItem[];
  return (await response.json()) as NominatimItem[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cap = (searchParams.get("cap") ?? "").trim();
  const q = (searchParams.get("q") ?? "").trim();
  const citta = (searchParams.get("citta") ?? "").trim();

  const { street, civico } = splitStreetAndCivico(q);
  const streetQuery = normalizeStreetQuery(street);

  if (!/^\d{5}$/.test(cap) || streetQuery.length < 3) {
    return NextResponse.json({ suggestions: [] as StreetSuggestion[] });
  }

  const structured = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    limit: "8",
    countrycodes: "it",
    "accept-language": "it",
    postalcode: cap,
    // Nominatim tratta la via senza distinzione maiuscole/minuscole
    street: streetQuery,
  });
  if (citta) structured.set("city", citta.toLocaleLowerCase("it-IT"));

  const freeText = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    limit: "8",
    countrycodes: "it",
    "accept-language": "it",
    q: [streetQuery, citta, cap, "Italia"].filter(Boolean).join(", "),
  });

  const [structuredResults, freeTextResults] = await Promise.all([
    nominatimSearch(structured),
    nominatimSearch(freeText),
  ]);

  const data = [...structuredResults, ...freeTextResults];
  const suggestions: StreetSuggestion[] = [];
  const seen = new Set<string>();

  for (const item of data) {
    const road = roadName(item);
    if (!road) continue;

    // Filtra per CAP se presente; altrimenti accetta risultati nella stessa città
    if (item.address?.postcode && item.address.postcode !== cap) continue;

    const normalizedRoad = normalizeStreetQuery(road);
    if (!normalizedRoad.includes(streetQuery) && !streetQuery.includes(normalizedRoad)) {
      // accetta comunque se la query è prefisso di "via …"
      const withoutPrefix = streetQuery.replace(/^(via|viale|corso|piazza|piazzale|vicolo|largo)\s+/i, "");
      if (withoutPrefix.length >= 3 && !normalizedRoad.includes(withoutPrefix)) {
        continue;
      }
    }

    const indirizzo = buildIndirizzo(item, civico);
    const key = normalizeStreetQuery(indirizzo);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    suggestions.push({
      id: String(item.place_id),
      label: indirizzo,
      indirizzo,
      cap: item.address?.postcode ?? cap,
      citta:
        item.address?.city ||
        item.address?.town ||
        item.address?.village ||
        item.address?.municipality ||
        citta,
      provincia: item.address?.county || item.address?.state || "",
      nazione: item.address?.country || "Italia",
    });
  }

  return NextResponse.json({ suggestions });
}
