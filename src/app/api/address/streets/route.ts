import { NextResponse } from "next/server";
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

function buildIndirizzo(item: NominatimItem): string {
  const road =
    item.address?.road ||
    item.address?.pedestrian ||
    item.address?.footway ||
    "";
  const number = item.address?.house_number;
  if (!road) return item.display_name.split(",")[0]?.trim() ?? "";
  return number ? `${road}, ${number}` : road;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cap = (searchParams.get("cap") ?? "").trim();
  const q = (searchParams.get("q") ?? "").trim();
  const citta = (searchParams.get("citta") ?? "").trim();

  if (!/^\d{5}$/.test(cap) || q.length < 3) {
    return NextResponse.json({ suggestions: [] as StreetSuggestion[] });
  }

  const params = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    limit: "8",
    countrycodes: "it",
    "accept-language": "it",
    postalcode: cap,
    street: q,
  });
  if (citta) params.set("city", citta);

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

  if (!response.ok) {
    return NextResponse.json(
      { suggestions: [] as StreetSuggestion[], error: "Servizio vie non disponibile" },
      { status: 502 }
    );
  }

  const data = (await response.json()) as NominatimItem[];
  const suggestions: StreetSuggestion[] = [];
  const seen = new Set<string>();

  for (const item of data) {
    const indirizzo = buildIndirizzo(item);
    if (!indirizzo) continue;
    if (item.address?.postcode && item.address.postcode !== cap) continue;

    const key = indirizzo.toLowerCase();
    if (seen.has(key)) continue;
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
