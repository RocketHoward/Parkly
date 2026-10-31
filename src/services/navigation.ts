import type { NavigationRoute, NavigationStep, RouteProgress } from "../types/navigation";
import type { Coordinates } from "../types/parking";

const EARTH_RADIUS = 6_371_000;
const ROUTING_TIMEOUT_MS = 15_000;
const SNAP_RADIUS_METERS = 150;
const noRoute = () => new Error("No driving route was found. Try a different starting point or parking lot.");
const radians = (degrees: number) => degrees * Math.PI / 180;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const malformed = () => new Error("Directions are unavailable. Please try another parking lot.");

function distanceBetween(from: Coordinates, to: Coordinates): number {
  const a = Math.sin(radians(to.lat - from.lat) / 2) ** 2
    + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat))
    * Math.sin(radians(to.lng - from.lng) / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function validCoordinates(value: Coordinates): boolean {
  return Number.isFinite(value.lat) && Math.abs(value.lat) <= 90
    && Number.isFinite(value.lng) && Math.abs(value.lng) <= 180;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw malformed();
  return value as Record<string, unknown>;
}

function coordinate(value: unknown): Coordinates {
  if (!Array.isArray(value) || value.length < 2 || typeof value[0] !== "number" || typeof value[1] !== "number") throw malformed();
  const point = { lat: value[1], lng: value[0] };
  if (!validCoordinates(point)) throw malformed();
  return point;
}

function geometry(value: unknown): Coordinates[] {
  const object = record(value);
  if (object.type !== "LineString" || !Array.isArray(object.coordinates) || !object.coordinates.length) throw malformed();
  return object.coordinates.map(coordinate);
}

function cumulativeLengths(coordinates: Coordinates[]): number[] {
  const distances = [0];
  for (let index = 1; index < coordinates.length; index++) {
    distances.push(distances[index - 1] + distanceBetween(coordinates[index - 1], coordinates[index]));
  }
  return distances;
}

export function bearingDegrees(from: Coordinates, to: Coordinates): number {
  const deltaLng = radians(to.lng - from.lng);
  const y = Math.sin(deltaLng) * Math.cos(radians(to.lat));
  const x = Math.cos(radians(from.lat)) * Math.sin(radians(to.lat))
    - Math.sin(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.cos(deltaLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

type Projection = { position: Coordinates; traveled: number; distance: number };

function projections(route: Pick<NavigationRoute, "coordinates" | "cumulativeDistances">, position: Coordinates): Projection[] {
  const latitudeScale = Math.cos(radians(position.lat));
  return route.coordinates.slice(1).map((end, index) => {
    const start = route.coordinates[index];
    const dx = (end.lng - start.lng) * latitudeScale;
    const dy = end.lat - start.lat;
    const px = (position.lng - start.lng) * latitudeScale;
    const py = position.lat - start.lat;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared > 0 ? clamp((px * dx + py * dy) / lengthSquared, 0, 1) : 0;
    const projected = { lat: start.lat + dy * fraction, lng: start.lng + (end.lng - start.lng) * fraction };
    return {
      position: projected,
      traveled: route.cumulativeDistances[index]
        + (route.cumulativeDistances[index + 1] - route.cumulativeDistances[index]) * fraction,
      distance: distanceBetween(position, projected),
    };
  });
}

function instruction(type: string, modifier: string, road: string, exit: unknown): string {
  const onto = road ? ` onto ${road}` : "";
  const on = road ? ` on ${road}` : "";
  if (type === "arrive") return "Arrive at the parking lot";
  if (type === "depart") return `Head straight${on}`;
  if (modifier === "uturn") return `Make a U-turn${onto}`;
  if (type === "roundabout" || type === "rotary") {
    return typeof exit === "number" && Number.isInteger(exit) && exit > 0
      ? `At the roundabout, take exit ${exit}${onto}` : `Enter the roundabout${onto}`;
  }
  if (type === "exit roundabout" || type === "exit rotary") return `Exit the roundabout${onto}`;
  if (type === "merge") return `Merge${modifier === "straight" ? "" : ` ${modifier}`}${onto}`;
  if (type === "on ramp" || type === "off ramp" || type === "ramp") {
    return `Take the ${type === "off ramp" ? "exit" : "ramp"}${modifier === "straight" ? "" : ` ${modifier}`}${onto}`;
  }
  if (type === "fork") return `Keep ${modifier.includes("left") ? "left" : modifier.includes("right") ? "right" : "straight"}${onto}`;
  if (modifier === "straight" || type === "new name") return `Continue${on}`;
  const turn = modifier === "slight left" ? "Bear left" : modifier === "slight right" ? "Bear right"
    : modifier === "sharp left" ? "Turn sharply left" : modifier === "sharp right" ? "Turn sharply right"
    : modifier === "left" ? "Turn left" : modifier === "right" ? "Turn right" : "Continue";
  return `${type === "roundabout turn" ? "At the roundabout, " + turn.toLowerCase() : turn}${onto}`;
}

function parseRoute(payload: unknown, origin: Coordinates, destination: Coordinates): NavigationRoute {
  const result = record(payload);
  if (result.code === "NoRoute" || result.code === "NoSegment") throw noRoute();
  if (result.code !== "Ok" || !Array.isArray(result.routes) || !result.routes.length) throw malformed();
  if (!Array.isArray(result.waypoints) || result.waypoints.length !== 2) throw malformed();
  result.waypoints.forEach((rawWaypoint, index) => {
    const waypoint = record(rawWaypoint);
    const location = coordinate(waypoint.location);
    if (typeof waypoint.distance !== "number" || !Number.isFinite(waypoint.distance) || waypoint.distance < 0) throw malformed();
    if (waypoint.distance > SNAP_RADIUS_METERS || distanceBetween(index === 0 ? origin : destination, location) > SNAP_RADIUS_METERS + 1) throw noRoute();
  });
  const raw = record(result.routes[0]);
  if (typeof raw.distance !== "number" || !Number.isFinite(raw.distance) || raw.distance < 0
    || typeof raw.duration !== "number" || !Number.isFinite(raw.duration) || raw.duration < 0
    || !Array.isArray(raw.legs) || !raw.legs.length) throw malformed();
  const coordinates = geometry(raw.geometry);
  const cumulativeDistances = cumulativeLengths(coordinates);
  const distance = cumulativeDistances.at(-1)!;
  if (coordinates.length < 2 || distance < 1) throw malformed();
  const steps: NavigationStep[] = [];
  let expectedDistance = 0;
  let previousDistance = 0;
  for (const rawLeg of raw.legs) {
    const leg = record(rawLeg);
    if (!Array.isArray(leg.steps) || !leg.steps.length) throw malformed();
    for (const rawStep of leg.steps) {
      const step = record(rawStep);
      const maneuver = record(step.maneuver);
      if (typeof maneuver.type !== "string" || !maneuver.type.trim()
        || (maneuver.modifier !== undefined && typeof maneuver.modifier !== "string")
        || (step.name !== undefined && typeof step.name !== "string")) throw malformed();
      const location = coordinate(maneuver.location);
      const stepGeometry = geometry(step.geometry);
      const candidates = projections({ coordinates, cumulativeDistances }, location)
        .filter((candidate) => candidate.traveled >= previousDistance - 0.5);
      if (!candidates.length) throw malformed();
      const nearest = candidates.reduce((best, candidate) => Math.min(best, candidate.distance), Infinity);
      if (nearest > 30) throw malformed();
      // The step geometries and overview use the same metric. This also identifies
      // the correct visit to a repeated junction without relying on OSRM's rounded distances.
      const projection = candidates.filter((candidate) => candidate.distance <= nearest + 0.5)
        .reduce((best, candidate) => Math.abs(candidate.traveled - expectedDistance) < Math.abs(best.traveled - expectedDistance) ? candidate : best);
      const distanceFromStart = Math.max(previousDistance, projection.traveled);
      const road = typeof step.name === "string" ? step.name.trim() : "";
      const modifier = typeof maneuver.modifier === "string" ? maneuver.modifier : "straight";
      steps.push({ instruction: instruction(maneuver.type, modifier, road, maneuver.exit), road,
        maneuver: maneuver.type, modifier, location, distanceFromStart });
      previousDistance = distanceFromStart;
      expectedDistance = distanceFromStart + cumulativeLengths(stepGeometry).at(-1)!;
    }
  }
  if (!steps.length || steps[0].maneuver !== "depart" || steps.at(-1)?.maneuver !== "arrive") throw malformed();
  steps[0].distanceFromStart = 0;
  steps[steps.length - 1].distanceFromStart = distance;
  return { coordinates, cumulativeDistances, distance, duration: raw.duration, steps };
}

export async function fetchDrivingRoute(origin: Coordinates, destination: Coordinates, signal?: AbortSignal): Promise<NavigationRoute> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (!validCoordinates(origin) || !validCoordinates(destination)) throw new Error("A valid starting point and parking location are needed.");
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, ROUTING_TIMEOUT_MS);
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?steps=true&overview=full&geometries=geojson&alternatives=false&radiuses=${SNAP_RADIUS_METERS};${SNAP_RADIUS_METERS}`;
    const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
    if (!response.ok) {
      let failure: unknown;
      try { failure = await response.json(); } catch { /* An unavailable service may return HTML. */ }
      if (failure && typeof failure === "object" && "code" in failure && (failure.code === "NoRoute" || failure.code === "NoSegment")) throw noRoute();
      throw new Error("The directions service is busy. Please try again.");
    }
    let payload: unknown;
    try { payload = await response.json(); } catch { throw malformed(); }
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return parseRoute(payload, origin, destination);
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (timedOut) throw new Error("Directions timed out. Please try again.");
    if (error instanceof TypeError) throw new Error("Could not connect to directions. Check your connection and try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export function pointAtDistance(route: NavigationRoute, distance: number): Coordinates {
  const target = clamp(distance, 0, route.distance);
  let low = 0;
  let high = route.cumulativeDistances.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (route.cumulativeDistances[middle] < target) low = middle + 1;
    else high = middle;
  }
  if (low === 0) return { ...route.coordinates[0] };
  const start = route.coordinates[low - 1];
  const end = route.coordinates[low];
  const segmentLength = route.cumulativeDistances[low] - route.cumulativeDistances[low - 1];
  const fraction = segmentLength ? (target - route.cumulativeDistances[low - 1]) / segmentLength : 0;
  return { lat: start.lat + (end.lat - start.lat) * fraction, lng: start.lng + (end.lng - start.lng) * fraction };
}

export function progressAlongRoute(route: NavigationRoute, position: Coordinates, previousTraveled?: number): RouteProgress {
  const previous = typeof previousTraveled === "number" && Number.isFinite(previousTraveled)
    ? clamp(previousTraveled, 0, route.distance) : undefined;
  const candidates = projections(route, position);
  let pool = candidates;
  if (previous !== undefined) {
    const nearbyProgress = candidates.filter((candidate) => candidate.traveled >= previous - 35 && candidate.traveled <= previous + 250);
    if (nearbyProgress.some((candidate) => candidate.distance <= 35)) pool = nearbyProgress;
  }
  const nearest = pool.reduce((best, candidate) => Math.min(best, candidate.distance), Infinity);
  // GPS uncertainty can put the car closer to a later pass through an intersection.
  // Prefer the current route section when candidates are spatially indistinguishable.
  const plausible = pool.filter((candidate) => candidate.distance <= nearest + (previous === undefined ? 12 : 5));
  const projection = plausible.reduce((best, candidate) => {
    if (previous === undefined) return candidate.traveled < best.traveled ? candidate : best;
    const score = (point: Projection) => point.distance + Math.abs(point.traveled - previous) * 0.03;
    return score(candidate) < score(best) ? candidate : best;
  });
  const traveled = Math.max(previous ?? 0, projection.traveled);
  const snapped = pointAtDistance(route, traveled);
  const remaining = Math.max(0, route.distance - traveled);
  const offRouteDistance = distanceBetween(position, snapped);
  const nextStep = route.steps.find((step) => step.maneuver !== "depart" && step.distanceFromStart >= traveled - 4)
    ?? route.steps[route.steps.length - 1];
  const behind = pointAtDistance(route, Math.max(0, traveled - (remaining < 5 ? 15 : 2)));
  const ahead = pointAtDistance(route, Math.min(route.distance, traveled + 15));
  return {
    position: snapped, traveled, remaining, nextStep,
    distanceToTurn: Math.max(0, nextStep.distanceFromStart - traveled),
    heading: bearingDegrees(behind, ahead), offRouteDistance,
    arrived: remaining <= 20 && offRouteDistance <= 25
      && distanceBetween(position, route.coordinates[route.coordinates.length - 1]) <= 30,
  };
}

export function formatNavigationDistance(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  const distance = Math.max(0, meters);
  if (distance >= 1_609) return `${(distance / 1_609.344).toFixed(1)} mi`;
  const increment = distance < 100 ? 5 : 10;
  return `${Math.round(distance / increment) * increment} m`;
}
