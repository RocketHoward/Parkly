import { afterEach, describe, expect, it, vi } from "vitest";
import {
  containsParking,
  INITIAL_AREA_PARKING,
  normalizeMapParking,
  readMapParking,
  type ParkingBounds,
} from "./mapParking";

const bounds: ParkingBounds = {
  south: 34.14,
  west: -118.124,
  north: 34.147,
  east: -118.114,
};

const feature = (id: number, extra = {}) => ({
  type: "way",
  id,
  center: { lat: 34.145, lon: -118.12 },
  tags: { amenity: "parking" },
  ...extra,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("map area parking", () => {
  it("keeps valid map lots inside the viewport and leaves occupancy unknown", () => {
    const locations = normalizeMapParking(
      {
        elements: [
          feature(1, {
            tags: {
              amenity: "parking",
              name: "Library garage",
              parking: "multi-storey",
              "addr:housenumber": "12",
              "addr:street": "Main Street",
              access: "customers",
              fee: "no",
              capacity: "100",
            },
          }),
          { type: "node", id: 2, lat: bounds.south, lon: bounds.west, tags: { amenity: "parking" } },
          feature(3, { center: { lat: 34.15, lon: -118.12 } }),
          feature(4, { center: { lat: NaN, lon: -118.12 } }),
          feature(5, { center: { lat: 34.145, lon: "-118.12" } }),
          feature(6, { center: undefined }),
          feature(7, { type: "invalid" }),
          feature(-1),
          feature(8, { tags: { amenity: "restaurant" } }),
          null,
        ],
      },
      bounds,
    );
    expect(locations.map((location) => location.id)).toEqual(["osm-way-1", "osm-node-2"]);
    expect(locations[0]).toMatchObject({
      name: "Library garage",
      address: "12 Main Street · Customer parking",
      kind: "Garage",
      source: "openstreetmap",
      availability: null,
      pricePerHour: 0,
      accessLabel: "Customers only",
      parkingFeeLabel: "Free",
      restrictionsVerified: false,
    });
    expect(locations[1]).toMatchObject({
      accessLabel: "Unknown", parkingFeeLabel: "Unknown", pricePerHour: null,
    });
    expect(containsParking(bounds, { lat: Infinity, lng: -118.12 })).toBe(false);
    expect(containsParking({ ...bounds, north: bounds.south }, { lat: bounds.south, lng: bounds.west })).toBe(false);
  });

  it("removes duplicate POIs and tracked PCC features without hiding distant namesakes", () => {
    const locations = normalizeMapParking(
      {
        elements: [
          feature(30794554), // The existing Student Lot 3 overlay.
          feature(2, {
            center: { lat: 34.14269, lon: -118.12085 },
            tags: { amenity: "parking", name: "Student Parking Lot No. 3" },
          }),
          feature(3, { tags: { amenity: "parking", name: "Student Parking Lot No.3" } }),
          feature(4, { tags: { amenity: "parking", name: "Library parking" } }),
          feature(4),
          { type: "node", id: 5, lat: 34.14501, lon: -118.12, tags: { amenity: "parking", name: "Library parking" } },
          feature(6, {
            center: { lat: 34.146, lon: -118.12 },
            tags: { amenity: "parking", name: "Library parking" },
          }),
        ],
      },
      bounds,
    );
    expect(locations.map((location) => location.id)).toEqual(["osm-way-3", "osm-way-4", "osm-way-6"]);
    expect(INITIAL_AREA_PARKING).toHaveLength(16);
    expect(new Set(INITIAL_AREA_PARKING.map((location) => location.id)).size).toBe(16);
    expect(INITIAL_AREA_PARKING.every((location) => containsParking(bounds, location.coordinates))).toBe(true);
  });

  it("rejects malformed or incomplete API results instead of showing an empty area", () => {
    for (const payload of [null, {}, { elements: null }, { elements: [], remark: "runtime error: query timed out" }])
      expect(() => normalizeMapParking(payload, bounds)).toThrow("Parking map data is unavailable");
    expect(normalizeMapParking({ elements: [] }, bounds)).toEqual([]);
  });

  it("reconstructs complete ways and relations from the OSM map API", () => {
    const locations = normalizeMapParking({ elements: [
      { type: "node", id: 10, lat: 34.144, lon: -118.121 },
      { type: "node", id: 11, lat: 34.146, lon: -118.119 },
      feature(20, { center: undefined, nodes: [10, 11, 10] }),
      feature(21, { center: undefined, nodes: [10, 999] }),
      { type: "relation", id: 30, members: [{ type: "way", ref: 20 }], tags: { amenity: "parking", name: "Campus visitor lot" } },
      { type: "relation", id: 31, members: [{ type: "way", ref: 999 }], tags: { amenity: "parking" } },
    ] }, bounds);
    expect(locations.map((location) => location.id)).toEqual(["osm-way-20", "osm-relation-30"]);
    expect(locations[0].coordinates.lat).toBeCloseTo(34.145);
    expect(locations[0].coordinates.lng).toBeCloseTo(-118.12);
  });

  it("reuses a recent viewport response and filters to its exact requested edges", async () => {
    const area = { south: 34.14001, west: -118.12401, north: 34.14699, east: -118.11401 };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ elements: [feature(1001), feature(1002, { center: { lat: 34.147, lon: -118.12 } })] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    expect((await readMapParking(area)).map((location) => location.id)).toEqual(["osm-way-1001"]);
    expect((await readMapParking(area)).map((location) => location.id)).toEqual(["osm-way-1001"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0][1];
    expect(fetchMock.mock.calls[0][0]).toContain('bbox=-118.1241,34.14,-118.114,34.147');
    expect(request.credentials).toBe("omit");
  });

  it("does not request overly large areas or cancelled refreshes", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(readMapParking({ ...bounds, north: 35 })).rejects.toThrow("Zoom in");
    const controller = new AbortController();
    controller.abort();
    await expect(readMapParking(bounds, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows a failed response to be retried and aborts an in-flight request", async () => {
    const area = { south: 34.15, west: -118.124, north: 34.157, east: -118.114 };
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false }).mockImplementationOnce((_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(readMapParking(area)).rejects.toThrow("Parking map data is busy");
    const controller = new AbortController();
    const pending = readMapParking(area, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
