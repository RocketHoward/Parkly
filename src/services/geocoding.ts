import type { Destination } from "../types/parking";

const endpoint =
  import.meta.env.VITE_GEOCODING_URL || "https://photon.komoot.io/api/";
const cache = new Map<string, Destination[]>();

// Photon-compatible GeoJSON endpoint. Search only on explicit form submission;
// cache repeated queries and cancel superseded requests to keep demo usage modest.
export async function searchDestinations(
  query: string,
  signal: AbortSignal,
): Promise<Destination[]> {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 3)
    throw new Error("Enter at least 3 characters to search for a destination.");
  if (cache.has(normalized)) return cache.get(normalized)!;
  const url = new URL(endpoint, window.location.origin);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("limit", "5");
  url.searchParams.set("lang", "en");
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      "Could not reach destination search. Check your connection and try again.",
    );
  }
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Destination search is busy. Please try again in a moment."
        : "Destination search is unavailable. Please try again.",
    );
  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== "object" ||
    !("features" in data) ||
    !Array.isArray(data.features)
  )
    throw new Error("Destination search returned an unexpected response.");
  const results: Destination[] = data.features.flatMap((feature: unknown) => {
    if (!feature || typeof feature !== "object") return [];
    const item = feature as {
      geometry?: { coordinates?: unknown };
      properties?: Record<string, unknown>;
    };
    const coordinates = item.geometry?.coordinates;
    if (
      !Array.isArray(coordinates) ||
      typeof coordinates[0] !== "number" ||
      typeof coordinates[1] !== "number" ||
      Math.abs(coordinates[0]) > 180 ||
      Math.abs(coordinates[1]) > 90
    )
      return [];
    const properties = item.properties || {};
    const string = (key: string) =>
      typeof properties[key] === "string" ? (properties[key] as string) : "";
    const street = [string("housenumber"), string("street")]
      .filter(Boolean)
      .join(" ");
    const name = string("name") || street || string("city") || query.trim();
    const address = [
      ...new Set(
        [street, string("city"), string("state"), string("country")].filter(
          (part) => part && part !== name,
        ),
      ),
    ].join(", ");
    return [
      {
        name,
        address: address || "OpenStreetMap location",
        lng: coordinates[0],
        lat: coordinates[1],
      },
    ];
  });
  if (cache.size >= 30) cache.delete(cache.keys().next().value!);
  cache.set(normalized, results);
  return results;
}
