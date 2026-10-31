import { afterEach, describe, expect, it, vi } from "vitest";
import type { NavigationRoute } from "../types/navigation";
import type { Coordinates } from "../types/parking";
import { bearingDegrees, fetchDrivingRoute, formatNavigationDistance, pointAtDistance, progressAlongRoute } from "./navigation";

const points: Coordinates[] = [
  { lat: 0, lng: 0 }, { lat: 0, lng: 0.001 },
  { lat: 0.001, lng: 0.001 }, { lat: 0.001, lng: 0.002 },
];
const line = (coordinates: Coordinates[]) => ({ type: "LineString", coordinates: coordinates.map(({ lat, lng }) => [lng, lat]) });

function payload(coordinates = points, modifiers = ["straight", "left", "right", "straight"]) {
  return {
    code: "Ok",
    waypoints: [coordinates[0], coordinates[coordinates.length - 1]].map(({ lat, lng }) => ({ location: [lng, lat], distance: 0 })),
    routes: [{
      distance: 9000, duration: 120, geometry: line(coordinates),
      legs: [{ steps: coordinates.map((point, index) => ({
        name: index === 1 ? "Main Street" : "Campus Road",
        distance: index === coordinates.length - 1 ? 0 : 3000,
        duration: 40,
        geometry: line(index < coordinates.length - 1 ? [point, coordinates[index + 1]] : [point, point]),
        maneuver: {
          type: index === 0 ? "depart" : index === coordinates.length - 1 ? "arrive" : "turn",
          modifier: modifiers[index] ?? "straight", location: [point.lng, point.lat],
        } as { type: string; modifier: string; location: number[]; exit?: number },
      })) }],
    }],
  };
}

async function routeWith(coordinates = points): Promise<NavigationRoute> {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload(coordinates) }));
  return fetchDrivingRoute(coordinates[0], coordinates[coordinates.length - 1]);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("driving route normalization", () => {
  it("uses GeoJSON longitude/latitude and aligns turn distances to geometry rather than rounded API distances", async () => {
    const route = await routeWith();
    expect(route.coordinates).toEqual(points);
    expect(route.distance).toBeCloseTo(333.585, 2);
    expect(route.duration).toBe(120);
    expect(route.steps.map((step) => step.distanceFromStart)).toEqual(route.cumulativeDistances);
    expect(route.steps[1].instruction).toBe("Turn left onto Main Street");
    expect(route.steps[2].instruction).toBe("Turn right onto Campus Road");
    expect(route.steps[0].instruction).toBe("Head straight on Campus Road");
    expect(route.steps.at(-1)?.instruction).toBe("Arrive at the parking lot");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/driving/0,0;0.002,0.001?steps=true&overview=full&geometries=geojson"),
      expect.objectContaining({ credentials: "omit", signal: expect.any(AbortSignal) }),
    );
  });

  it("maps a second visit to the same intersection to the later point on the geometry", async () => {
    const loop = [...points.slice(0, 3), { lat: 0.001, lng: 0 }, points[0], { lat: -0.001, lng: 0 }];
    const route = await routeWith(loop);
    expect(route.steps[4].distanceFromStart).toBeCloseTo(route.cumulativeDistances[4], 5);
    expect(route.steps[4].distanceFromStart).toBeGreaterThan(440);
  });

  it.each([
    ["turn", "uturn", undefined, "Make a U-turn onto Main Street"],
    ["roundabout", "right", 3, "At the roundabout, take exit 3 onto Main Street"],
    ["exit roundabout", "right", undefined, "Exit the roundabout onto Main Street"],
    ["fork", "slight left", undefined, "Keep left onto Main Street"],
    ["turn", "sharp right", undefined, "Turn sharply right onto Main Street"],
  ])("describes %s / %s maneuvers", async (type, modifier, exit, expected) => {
    const response = payload();
    Object.assign(response.routes[0].legs[0].steps[1].maneuver, { type, modifier, exit });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => response }));
    const route = await fetchDrivingRoute(points[0], points[3]);
    expect(route.steps[1].instruction).toBe(expected);
  });
});

describe("route progress", () => {
  it("projects GPS onto the current road and reports the next turn in meters", async () => {
    const route = await routeWith();
    const progress = progressAlongRoute(route, { lat: 0.00004, lng: 0.0005 }, 40);
    expect(progress.position.lat).toBeCloseTo(0);
    expect(progress.position.lng).toBeCloseTo(0.0005);
    expect(progress.traveled).toBeCloseTo(55.597, 2);
    expect(progress.distanceToTurn).toBeCloseTo(55.597, 2);
    expect(progress.nextStep.modifier).toBe("left");
    expect(progress.offRouteDistance).toBeCloseTo(4.448, 2);
    expect(progress.heading).toBeCloseTo(90, 1);
    expect(progress.arrived).toBe(false);
  });

  it("advances to the following maneuver after the turn and looks ahead along the new road", async () => {
    const route = await routeWith();
    const progress = progressAlongRoute(route, { lat: 0.0003, lng: 0.001 }, 110);
    expect(progress.nextStep.modifier).toBe("right");
    expect(progress.distanceToTurn).toBeCloseTo(77.836, 2);
    expect(progress.heading).toBeCloseTo(0, 1);
  });

  it("does not backtrack for GPS jitter and reports distance from preserved route progress", async () => {
    const route = await routeWith();
    const progress = progressAlongRoute(route, { lat: 0, lng: 0.0007 }, 85);
    expect(progress.traveled).toBe(85);
    expect(progress.offRouteDistance).toBeGreaterThan(7);
    expect(progress.distanceToTurn).toBeCloseTo(route.steps[1].distanceFromStart - 85);
  });

  it("does not arrive early when a loop passes close to its destination", async () => {
    const loop = [points[0], { lat: 0, lng: 0.003 }, { lat: 0.003, lng: 0.003 }, { lat: 0.003, lng: 0 }, { lat: 0.00008, lng: 0 }];
    const route = await routeWith(loop);
    const start = progressAlongRoute(route, loop[4]);
    const justStarted = progressAlongRoute(route, loop[4], 1);
    expect(start.arrived).toBe(false);
    expect(start.remaining).toBeGreaterThan(1200);
    expect(justStarted.arrived).toBe(false);
    const nearEnd = progressAlongRoute(route, loop[4], route.distance - 25);
    expect(nearEnd.arrived).toBe(true);
  });

  it("requires actual endpoint proximity for arrival, even when a distant GPS sample projects to the end", async () => {
    const route = await routeWith();
    const farAway = progressAlongRoute(route, { lat: 0.0015, lng: 0.0025 }, route.distance - 15);
    expect(farAway.remaining).toBe(0);
    expect(farAway.offRouteDistance).toBeGreaterThan(70);
    expect(farAway.arrived).toBe(false);
    const arrived = progressAlongRoute(route, { lat: 0.001, lng: 0.00195 }, route.distance - 15);
    expect(arrived.arrived).toBe(true);
    expect(arrived.nextStep.maneuver).toBe("arrive");
    expect(arrived.heading).toBeCloseTo(90, 1);
  });

  it("interpolates a route preview by distance and clamps endpoints", async () => {
    const route = await routeWith();
    expect(pointAtDistance(route, -10)).toEqual(points[0]);
    expect(pointAtDistance(route, route.distance + 20)).toEqual(points[3]);
    expect(pointAtDistance(route, route.cumulativeDistances[1] / 2)).toEqual({ lat: 0, lng: 0.0005 });
    expect(bearingDegrees(points[0], points[1])).toBeCloseTo(90);
    expect(bearingDegrees(points[1], points[0])).toBeCloseTo(270);
  });

  it("formats short distances as meters and longer distances as miles", () => {
    expect(formatNavigationDistance(48)).toBe("50 m");
    expect(formatNavigationDistance(146)).toBe("150 m");
    expect(formatNavigationDistance(1600)).toBe("1600 m");
    expect(formatNavigationDistance(1609)).toBe("1.0 mi");
    expect(formatNavigationDistance(4023.36)).toBe("2.5 mi");
    expect(formatNavigationDistance(-5)).toBe("0 m");
    expect(formatNavigationDistance(Number.NaN)).toBe("—");
  });
});

describe("routing failures and cancellation", () => {
  it.each([
    null,
    { code: "Ok", routes: [] },
    { code: "InvalidQuery" },
    { ...payload(), routes: [{ ...payload().routes[0], geometry: line([{ lat: NaN, lng: 0 }, points[1]]) }] },
    { ...payload(), routes: [{ ...payload().routes[0], legs: [{ steps: [] }] }] },
    { ...payload(), routes: [{ ...payload().routes[0], duration: -1 }] },
  ])("rejects malformed route responses: %j", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => response }));
    await expect(fetchDrivingRoute(points[0], points[3])).rejects.toThrow("Directions are unavailable");
  });

  it("reports no-route and network failures without inventing a straight-line route", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: "NoRoute" }) })
      .mockResolvedValueOnce({ ok: false })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError("JSON"); } });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchDrivingRoute(points[0], points[3])).rejects.toThrow("No driving route");
    await expect(fetchDrivingRoute(points[0], points[3])).rejects.toThrow("service is busy");
    await expect(fetchDrivingRoute(points[0], points[3])).rejects.toThrow("Check your connection");
    await expect(fetchDrivingRoute(points[0], points[3])).rejects.toThrow("Directions are unavailable");
  });

  it("limits road snapping and rejects a route that starts or ends far from the requested location", async () => {
    const tooFar = payload();
    tooFar.waypoints[1].distance = 200;
    const wrongLocation = payload();
    wrongLocation.waypoints[0].location = [1, 1];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => tooFar })
      .mockResolvedValueOnce({ ok: true, json: async () => wrongLocation })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ code: "NoSegment" }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchDrivingRoute(points[0], points[3])).rejects.toThrow("No driving route");
    await expect(fetchDrivingRoute(points[0], points[3])).rejects.toThrow("No driving route");
    await expect(fetchDrivingRoute(points[0], points[3])).rejects.toThrow("No driving route");
    expect(fetchMock.mock.calls[0][0]).toContain("radiuses=150;150");
  });

  it("does not fetch for invalid coordinates or already-cancelled requests", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(fetchDrivingRoute(points[0], points[3], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(fetchDrivingRoute({ lat: 91, lng: 0 }, points[3])).rejects.toThrow("valid starting point");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts an in-flight route request when the caller cancels", async () => {
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })));
    const controller = new AbortController();
    const pending = fetchDrivingRoute(points[0], points[3], controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("times out a stalled routing service and frees the request", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
      requestSignal = options.signal;
      options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })));
    const rejected = expect(fetchDrivingRoute(points[0], points[3])).rejects.toThrow("Directions timed out");
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
