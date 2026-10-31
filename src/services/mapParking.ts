import type { Coordinates, ParkingLocation } from "../types/parking";
import { distanceMeters } from "./parking";
import { TRACKED_LOCATIONS } from "./trackedParking";

export type ParkingBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

const MAP_ENDPOINT = "https://api.openstreetmap.org/api/0.6/map.json";
const CACHE_TTL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_AREA_SPAN = 0.03;
const cache = new Map<
  string,
  { receivedAt: number; locations: ParkingLocation[] }
>();

// These OSM features already have their own simulated occupancy markers.
const TRACKED_OSM_IDS = new Set([
  "osm-way-30794553",
  "osm-way-30794554",
  "osm-way-30794556",
  "osm-way-30794557",
  "osm-way-30794559",
  "osm-way-215988672",
  "osm-way-215988673",
]);

function validCoordinates(coordinates: Coordinates): boolean {
  return (
    Number.isFinite(coordinates.lat) &&
    Number.isFinite(coordinates.lng) &&
    Math.abs(coordinates.lat) <= 90 &&
    Math.abs(coordinates.lng) <= 180
  );
}

function validBounds(bounds: ParkingBounds): boolean {
  return (
    validCoordinates({ lat: bounds.south, lng: bounds.west }) &&
    validCoordinates({ lat: bounds.north, lng: bounds.east }) &&
    bounds.south < bounds.north &&
    bounds.west < bounds.east
  );
}

export function containsParking(
  bounds: ParkingBounds,
  coordinates: Coordinates,
): boolean {
  return (
    validBounds(bounds) &&
    validCoordinates(coordinates) &&
    coordinates.lat >= bounds.south &&
    coordinates.lat <= bounds.north &&
    coordinates.lng >= bounds.west &&
    coordinates.lng <= bounds.east
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function tag(tags: Record<string, unknown>, key: string): string {
  return typeof tags[key] === "string" ? tags[key].trim().slice(0, 180) : "";
}

function normalizedName(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function boundingCenter(points: Coordinates[]): Record<string, number> | null {
  if (!points.length) return null;
  return {
    lat: (Math.min(...points.map((point) => point.lat)) + Math.max(...points.map((point) => point.lat))) / 2,
    lon: (Math.min(...points.map((point) => point.lng)) + Math.max(...points.map((point) => point.lng))) / 2,
  };
}

/** Normalize untrusted map data without inventing availability or legal access. */
export function normalizeMapParking(
  payload: unknown,
  bounds: ParkingBounds,
): ParkingLocation[] {
  const data = record(payload);
  if (!data || !Array.isArray(data.elements) || data.remark)
    throw new Error("Parking map data is unavailable. Please try refresh again.");

  // The map API returns complete ways and their nodes. Reconstruct their centers
  // so both raw OSM data and an Overpass `out center` fixture use the same IDs.
  const elements = data.elements.map(record).filter((element) => element !== null);
  const nodes = new Map<number, Coordinates>();
  for (const element of elements) {
    if (element.type !== "node" || typeof element.id !== "number" ||
        typeof element.lat !== "number" || typeof element.lon !== "number") continue;
    const coordinates = { lat: element.lat, lng: element.lon };
    if (validCoordinates(coordinates)) nodes.set(element.id, coordinates);
  }
  const ways = new Map<number, Coordinates[]>();
  for (const element of elements) {
    if (element.type !== "way" || typeof element.id !== "number" || !Array.isArray(element.nodes)) continue;
    const points = element.nodes.map((id) => nodes.get(id));
    if (points.length && points.every((point) => point !== undefined)) ways.set(element.id, points);
  }
  const positionFor = (element: Record<string, unknown>) => {
    if (element.type === "node") return element;
    const center = record(element.center);
    if (center) return center;
    if (element.type === "way") return boundingCenter(ways.get(Number(element.id)) || []);
    if (element.type !== "relation" || !Array.isArray(element.members)) return null;
    const points: Coordinates[] = [];
    for (const value of element.members) {
      const member = record(value);
      if (!member) return null;
      const memberPoints = member.type === "node"
        ? [nodes.get(Number(member.ref))].filter((point) => point !== undefined)
        : member.type === "way" ? ways.get(Number(member.ref)) : null;
      if (!memberPoints?.length) return null;
      points.push(...memberPoints);
    }
    return boundingCenter(points);
  };

  const locations: ParkingLocation[] = [];
  const seenIds = new Set<string>();
  for (const element of elements) {
    const tags = record(element.tags);
    if (
      !tags ||
      tags.amenity !== "parking" ||
      !["node", "way", "relation"].includes(String(element.type)) ||
      typeof element.id !== "number" ||
      !Number.isSafeInteger(element.id) ||
      element.id <= 0
    )
      continue;
    const position = positionFor(element);
    if (!position || typeof position.lat !== "number" || typeof position.lon !== "number")
      continue;
    const coordinates = { lat: position.lat, lng: position.lon };
    if (!containsParking(bounds, coordinates)) continue;
    const id = `osm-${element.type}-${element.id}`;
    if (seenIds.has(id) || TRACKED_OSM_IDS.has(id)) continue;
    const explicitName = tag(tags, "name");
    if (
      explicitName &&
      TRACKED_LOCATIONS.some(
        (location) =>
          normalizedName(location.name) === normalizedName(explicitName) &&
          distanceMeters(location.coordinates, coordinates) < 150,
      )
    )
      continue;
    // A named lot can be mapped as both a POI and a polygon.
    if (
      explicitName &&
      locations.some(
        (location) =>
          normalizedName(location.name) === normalizedName(explicitName) &&
          distanceMeters(location.coordinates, coordinates) < 35,
      )
    )
      continue;

    seenIds.add(id);
    const kind = ["multi-storey", "underground"].includes(tag(tags, "parking"))
      ? "Garage"
      : "Parking lot";
    const operator = tag(tags, "operator");
    const street = tag(tags, "addr:street");
    const streetAddress = street
      ? [tag(tags, "addr:housenumber"), street].filter(Boolean).join(" ")
      : "";
    const access = tag(tags, "access");
    const accessLabel =
      access === "private"
        ? "Private parking"
        : access === "customers"
          ? "Customer parking"
          : "Map listing";
    locations.push({
      id,
      name: explicitName || (operator ? `${operator} parking` : kind),
      address: [streetAddress || operator, accessLabel].filter(Boolean).join(" · "),
      coordinates,
      type: "lot",
      kind,
      pricePerHour: tag(tags, "fee") === "no" ? 0 : null,
      accessLabel: access === "yes" ? "Public"
        : access === "private" || access === "no" ? "Restricted"
        : access === "customers" ? "Customers only"
        : access === "permit" ? "Permit required"
        : "Unknown",
      parkingFeeLabel: tag(tags, "fee") === "no" ? "Free"
        : tag(tags, "fee") === "yes" ? "Paid · rate unknown"
        : "Unknown",
      maxDurationMinutes: null,
      openingHours: tag(tags, "opening_hours") || null,
      availability: null,
      restrictionsVerified: false,
      source: "openstreetmap",
    });
  }
  return locations;
}

// Local OSM snapshot for an immediate first view. IDs and bounding-box centers
// match Overpass's `out center` response, so refreshing does not duplicate pins.
// Source: openstreetmap.org/api/0.6/map?bbox=-118.124,34.140,-118.114,34.147
// © OpenStreetMap contributors, retrieved 2026-10-30.
const INITIAL_BOUNDS: ParkingBounds = {
  south: 34.14,
  west: -118.124,
  north: 34.147,
  east: -118.114,
};
const INITIAL_FEATURES = [
  [87247144, 34.1465513, -118.1151268, ""],
  [87247161, 34.1464838, -118.1218783, ""],
  [101206932, 34.1465073, -118.1174285, ""],
  [205868797, 34.1421535, -118.1220086, ""],
  [215988675, 34.1436212, -118.1224866, ""],
  [226940727, 34.1467459, -118.1166786, "customers"],
  [226940729, 34.1464455, -118.1160967, ""],
  [226940730, 34.1463585, -118.1168723, "customers"],
  [226940732, 34.145304, -118.1148267, ""],
  [226940733, 34.1463624, -118.1163569, "customers"],
  [226940734, 34.1453259, -118.1153125, ""],
  [226940735, 34.1469501, -118.1180898, "private"],
  [235050814, 34.1453266, -118.123272, ""],
  [490781197, 34.1466123, -118.123372, "customers"],
  [844355317, 34.1430305, -118.122524, ""],
  [1058026918, 34.140344, -118.1224491, ""],
] as const;

export const INITIAL_AREA_PARKING = normalizeMapParking(
  {
    elements: INITIAL_FEATURES.map(([id, lat, lon, access]) => ({
      type: "way",
      id,
      center: { lat, lon },
      tags: { amenity: "parking", access },
    })),
  },
  INITIAL_BOUNDS,
);

/** Called explicitly when the user refreshes the visible area, never on a timer. */
export async function readMapParking(
  bounds: ParkingBounds,
  signal?: AbortSignal,
): Promise<ParkingLocation[]> {
  if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
  if (!validBounds(bounds)) throw new Error("Move the map to a valid parking area.");
  if (
    bounds.north - bounds.south > MAX_AREA_SPAN ||
    bounds.east - bounds.west > MAX_AREA_SPAN
  )
    throw new Error("Zoom in a little, then refresh to find parking in this area.");

  // Round outward so a cached response always covers every requested coordinate.
  const queryBounds: ParkingBounds = {
    south: Math.floor(bounds.south * 10_000) / 10_000,
    west: Math.floor(bounds.west * 10_000) / 10_000,
    north: Math.ceil(bounds.north * 10_000) / 10_000,
    east: Math.ceil(bounds.east * 10_000) / 10_000,
  };
  const key = Object.values(queryBounds).join(",");
  const cached = cache.get(key);
  if (cached && Date.now() - cached.receivedAt < CACHE_TTL_MS)
    return cached.locations.filter((location) => containsParking(bounds, location.coordinates));

  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, REQUEST_TIMEOUT_MS);
  try {
    const bbox = [queryBounds.west, queryBounds.south, queryBounds.east, queryBounds.north].join(",");
    const response = await fetch(`${MAP_ENDPOINT}?bbox=${bbox}`, {
      signal: controller.signal,
      credentials: "omit",
    });
    if (!response.ok)
      throw new Error("Parking map data is busy. Please try refresh again shortly.");
    const locations = normalizeMapParking(await response.json(), queryBounds);
    if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    cache.set(key, { receivedAt: Date.now(), locations });
    if (cache.size > 20) cache.delete(cache.keys().next().value!);
    return locations.filter((location) => containsParking(bounds, location.coordinates));
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    if (controller.signal.aborted)
      throw new Error("Parking map refresh timed out. Please try again.");
    if (error instanceof Error && error.message.startsWith("Parking map")) throw error;
    throw new Error("Could not refresh this area. Check your connection and try again.");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}
