import type {
  Coordinates,
  Destination,
  ParkingLocation,
  ParkingPreferences,
  ParkingType,
  RankedParking,
} from "../types/parking";

export const SAMPLE_DESTINATION: Destination = {
  lat: 37.7879,
  lng: -122.4075,
  name: "Union Square",
  address: "San Francisco, California",
};

// Fictional examples for exploring the interface, not a directory of legal spaces.
// Replace this source with a provider adapter before serving parking recommendations.
export const DEMO_PARKING: ParkingLocation[] = [
  {
    id: "union",
    name: "Union Square garage",
    address: "Geary Street · sample location",
    coordinates: { lat: 37.7872, lng: -122.4076 },
    type: "lot",
    kind: "Garage",
  },
  {
    id: "sutter",
    name: "Sutter Street garage",
    address: "Sutter Street · sample location",
    coordinates: { lat: 37.7893, lng: -122.4064 },
    type: "lot",
    kind: "Garage",
  },
  {
    id: "post",
    name: "Post Street curbside",
    address: "Post Street · sample location",
    coordinates: { lat: 37.7881, lng: -122.4102 },
    type: "street",
    kind: "Street parking",
  },
  {
    id: "stockton",
    name: "Stockton Street lot",
    address: "Stockton Street · sample location",
    coordinates: { lat: 37.7904, lng: -122.4072 },
    type: "lot",
    kind: "Parking lot",
  },
  {
    id: "mason",
    name: "Mason Street curbside",
    address: "Mason Street · sample location",
    coordinates: { lat: 37.7865, lng: -122.4103 },
    type: "street",
    kind: "Street parking",
  },
  {
    id: "mission",
    name: "Mission Street garage",
    address: "Mission Street · sample location",
    coordinates: { lat: 37.7843, lng: -122.4051 },
    type: "lot",
    kind: "Garage",
  },
  {
    id: "bush",
    name: "Bush Street curbside",
    address: "Bush Street · sample location",
    coordinates: { lat: 37.7904, lng: -122.4101 },
    type: "street",
    kind: "Street parking",
  },
].map((location) => ({
  ...location,
  type: location.type as ParkingType,
  kind: location.kind as ParkingLocation["kind"],
  pricePerHour: null,
  maxDurationMinutes: null,
  openingHours: null,
  availability: null,
  restrictionsVerified: false,
  source: "demonstration",
}));

export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = radians(b.lat - a.lat);
  const deltaLng = radians(b.lng - a.lng);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(a.lat)) *
      Math.cos(radians(b.lat)) *
      Math.sin(deltaLng / 2) ** 2;
  return (
    6371000 *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)))
  );
}

export function formatDistance(meters: number): string {
  return meters < 1000
    ? `${Math.round(meters / 10) * 10} m`
    : `${(meters / 1000).toFixed(1)} km`;
}

export function parsePreferences(input: string): ParkingPreferences {
  const words: Record<string, string> = {
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    ten: "10",
  };
  const text = input
    .toLowerCase()
    .replace(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g,
      (word) => words[word],
    );
  const duration = text.match(
    /(?:for|stay(?:ing)?|need(?: parking for)?)\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)/,
  );
  const preferences: ParkingPreferences = {
    type: /\bstreet|curbside\b/.test(text)
      ? "street"
      : /\bgarage|lots?\b/.test(text)
        ? "lot"
        : undefined,
    freeOnly: /\bfree\b/.test(text),
    cheapest: /\bcheapest|cheaper|lowest price|affordable\b/.test(text),
    verifiedOnly: /\blegal|verified\b/.test(text),
    durationMinutes: duration
      ? Number(duration[1]) * (/^(hour|hr)/.test(duration[2]) ? 60 : 1)
      : undefined,
    walkingTimeRequested: /\bwalk(?:ing)?\b/.test(text),
    recognized: false,
  };
  preferences.recognized = Boolean(
    preferences.type ||
      preferences.freeOnly ||
      preferences.cheapest ||
      preferences.verifiedOnly ||
      preferences.durationMinutes ||
      preferences.walkingTimeRequested ||
      /\bclosest|nearest|nearby\b/.test(text),
  );
  return preferences;
}

export function rankParking(
  locations: ParkingLocation[],
  destination: Coordinates,
  type: ParkingType | "all" = "all",
  preferences = parsePreferences(""),
  maxDistanceMeters = 2500,
): RankedParking[] {
  return locations
    .map((location) => ({
      ...location,
      distanceMeters: distanceMeters(destination, location.coordinates),
    }))
    .filter((location) => location.distanceMeters <= maxDistanceMeters)
    .filter((location) => type === "all" || location.type === type)
    .filter(
      (location) => !preferences.type || location.type === preferences.type,
    )
    .filter((location) => !preferences.freeOnly || location.pricePerHour === 0)
    .filter(
      (location) => !preferences.cheapest || location.pricePerHour !== null,
    )
    .filter(
      (location) => !preferences.verifiedOnly || location.restrictionsVerified,
    )
    .filter(
      (location) =>
        !preferences.durationMinutes ||
        (location.maxDurationMinutes !== null &&
          location.maxDurationMinutes >= preferences.durationMinutes),
    )
    .sort((a, b) =>
      preferences.cheapest
        ? a.pricePerHour! - b.pricePerHour! ||
          a.distanceMeters - b.distanceMeters
        : a.distanceMeters - b.distanceMeters,
    );
}

export function directionsUrl(location: ParkingLocation): string {
  const params = new URLSearchParams({
    api: "1",
    destination: `${location.coordinates.lat},${location.coordinates.lng}`,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params}`;
}
