import type { Destination, ParkingLocation } from "../types/parking";

/**
 * Demonstration adapter for a future parking occupancy API. Names and positions
 * follow the campus map; levels, inventories and occupancy are simulated.
 * Every observation is generated in the browser; no school API is connected.
 */
export type OccupancyBand = "green" | "yellow" | "orange" | "red" | "unknown";

export type Occupancy = {
  capacity: number;
  occupied: number | null;
  available: number | null;
  percent: number | null;
  band: OccupancyBand;
};

export type TrackedSpace = {
  id: string;
  number: number;
  status: "free" | "occupied" | "unknown";
};

export type TrackedLevel = Occupancy & {
  id: string;
  level: number;
  spaces: TrackedSpace[];
};

export type TrackedLot = Occupancy & {
  id: string;
  levels: TrackedLevel[];
  updatedAt: number | null;
};

export type TrackedSnapshot = {
  lots: TrackedLot[];
  receivedAt: number;
  source: "demonstration";
};

export const PCC_DESTINATION: Destination = {
  lat: 34.144,
  lng: -118.1185,
  name: "Pasadena City College",
  address: "Pasadena, California",
};

const STUDENT_PERMIT_LOTS = new Set(["pcc-student-3", "pcc-student-5"]);
const PCC_PERMIT_PURCHASE_URL = "https://paymycite.com/pcc/parkingpermit.aspx";

export const TRACKED_LOCATIONS: ParkingLocation[] = [
  {
    id: "pcc-student-3",
    name: "Student Parking Lot No.3",
    address: "Pasadena City College · Student parking",
    coordinates: { lat: 34.1426281, lng: -118.1208558 },
  },
  {
    id: "pcc-student-5",
    name: "Student Parking Lot No.5",
    address: "Pasadena City College · Student parking",
    // Align the colored badge with the map's rendered parking symbol.
    coordinates: { lat: 34.1431875, lng: -118.1163650 },
  },
  {
    id: "pcc-staff-4",
    name: "Staff Parking Lot No.4",
    address: "Pasadena City College · Staff parking",
    coordinates: { lat: 34.1424729, lng: -118.1198308 },
  },
  {
    id: "pcc-staff-1",
    name: "Staff Parking Lot No.1",
    address: "Pasadena City College · Staff parking",
    coordinates: { lat: 34.1453098, lng: -118.1208530 },
  },
  {
    id: "pcc-staff-7",
    name: "Staff Parking Lot No.7",
    address: "Pasadena City College · Staff parking",
    coordinates: { lat: 34.1453186, lng: -118.1161071 },
  },
  {
    id: "pcc-student-10",
    name: "Student Parking Lot No.10",
    address: "Pasadena City College · Student parking",
    coordinates: { lat: 34.1449941, lng: -118.1224407 },
  },
  {
    id: "pcc-student-11",
    name: "Student Parking Lot No.11",
    address: "Pasadena City College · Student parking",
    coordinates: { lat: 34.1442479, lng: -118.1224344 },
  },
].map((location) => ({
  ...location,
  type: "lot",
  kind: "Garage",
  // Illustrative access and tariffs for the demo, not PCC's actual policy.
  accessLabel: location.id.startsWith("pcc-staff-") ? "Staff only" : "Students only",
  parkingFeeLabel: STUDENT_PERMIT_LOTS.has(location.id)
    ? "Student parking permit required"
    : "Free for 90 min · then $2/hour",
  permitPurchaseUrl: STUDENT_PERMIT_LOTS.has(location.id)
    ? PCC_PERMIT_PURCHASE_URL
    : undefined,
  pricePerHour: STUDENT_PERMIT_LOTS.has(location.id) ? null : 2,
  maxDurationMinutes: null,
  openingHours: null,
  availability: null,
  restrictionsVerified: false,
  source: "demonstration",
}));

export const POLL_INTERVAL_MS = 5_000;
export const STALE_AFTER_MS = 15_000;
const SIMULATED_LATENCY_MS = 200;
const SPACES_PER_LEVEL = 24;

/** Compare exact ratios, so display rounding cannot move a lot into a band. */
export function occupancyBand(
  occupied: number | null,
  capacity: number,
): OccupancyBand {
  if (
    occupied === null ||
    !Number.isFinite(occupied) ||
    !Number.isFinite(capacity) ||
    capacity <= 0 ||
    occupied < 0 ||
    occupied > capacity
  )
    return "unknown";
  const ratio = occupied / capacity;
  if (ratio < 0.5) return "green";
  if (ratio < 0.75) return "yellow";
  if (ratio < 0.95) return "orange";
  return "red";
}

export function bandLabel(band: OccupancyBand): string {
  return {
    green: "Plenty of space",
    yellow: "Filling up",
    orange: "Almost full",
    red: "Nearly full",
    unknown: "Availability unknown",
  }[band];
}

export function occupancyLabel(occupancy: Occupancy): string {
  if (occupancy.band === "unknown") return bandLabel("unknown");
  if (occupancy.capacity > 0 && occupancy.occupied === occupancy.capacity)
    return "Full";
  return bandLabel(occupancy.band);
}

/** A partial observation cannot establish complete availability or occupancy. */
export function summarizeSpaces(spaces: TrackedSpace[]): Occupancy {
  const capacity = spaces.length;
  if (!capacity || spaces.some((space) => space.status === "unknown"))
    return {
      capacity,
      occupied: null,
      available: null,
      percent: null,
      band: "unknown",
    };
  const occupied = spaces.filter((space) => space.status === "occupied").length;
  return {
    capacity,
    occupied,
    available: capacity - occupied,
    percent: (occupied / capacity) * 100,
    band: occupancyBand(occupied, capacity),
  };
}

const BASE_OCCUPANCY = [
  [3, 7, 20],
  [8, 17, 20],
  [14, 23, 24],
  [22, 24, 24],
  [3, 7, 20],
  [8, 17, 20],
  [14, 23, 24],
];

function modulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

/**
 * Stable within a five-second observation tick. A few vehicles enter or leave
 * instead of randomizing whole garages. Each garage keeps a distinct map band.
 */
export function createTrackedSnapshot(now = Date.now()): TrackedSnapshot {
  const tick = Math.floor(now / POLL_INTERVAL_MS);
  const lots = TRACKED_LOCATIONS.map((location, lotIndex): TrackedLot => {
    const activeLevel = modulo(Math.floor(tick / 12) + lotIndex, 3);
    const variation = [0, 1, 2, 1][modulo(tick + lotIndex, 4)];
    const levels = BASE_OCCUPANCY[lotIndex].map(
      (base, levelIndex): TrackedLevel => {
        const id = `${location.id}-level-${levelIndex + 1}`;
        const occupied = Math.min(
          SPACES_PER_LEVEL,
          base + (levelIndex === activeLevel ? variation : 0),
        );
        const spaces = Array.from(
          { length: SPACES_PER_LEVEL },
          (_, index): TrackedSpace => ({
            id: `${id}-space-${String(index + 1).padStart(2, "0")}`,
            number: index + 1,
            // Seven permutes the 24 spaces, distributing vehicles across the grid.
            status:
              modulo(
                index * 7 + lotIndex * 3 + levelIndex * 5,
                SPACES_PER_LEVEL,
              ) < occupied
                ? "occupied"
                : "free",
          }),
        );
        return {
          id,
          level: levelIndex + 1,
          spaces,
          ...summarizeSpaces(spaces),
        };
      },
    );
    return {
      id: location.id,
      levels,
      updatedAt: now,
      ...summarizeSpaces(levels.flatMap((level) => level.spaces)),
    };
  });
  return { lots, receivedAt: now, source: "demonstration" };
}

/** Replace this adapter with a validated provider response for a real feed. */
export function readTrackedSnapshot(
  now = Date.now(),
  signal?: AbortSignal,
): Promise<TrackedSnapshot> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(
        new DOMException("The occupancy request was cancelled.", "AbortError"),
      );
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve(createTrackedSnapshot(now));
    }, SIMULATED_LATENCY_MS);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

function unknownLots(lots: TrackedLot[], unobserved = false): TrackedLot[] {
  return lots.map((lot) => {
    const levels = lot.levels.map((level) => {
      const spaces = level.spaces.map(
        (space): TrackedSpace => ({ ...space, status: "unknown" }),
      );
      return { ...level, spaces, ...summarizeSpaces(spaces) };
    });
    return {
      ...lot,
      levels,
      updatedAt: unobserved ? null : lot.updatedAt,
      ...summarizeSpaces(levels.flatMap((level) => level.spaces)),
    };
  });
}

const INITIAL_LOTS = unknownLots(createTrackedSnapshot(0).lots, true);

/** Preserve inventory while removing all stale claims that a space is free. */
export function getEffectiveLots(
  snapshot: TrackedSnapshot | null,
  now = Date.now(),
): TrackedLot[] {
  if (!snapshot) return INITIAL_LOTS;
  if (now - snapshot.receivedAt < STALE_AFTER_MS) return snapshot.lots;
  return unknownLots(snapshot.lots);
}
