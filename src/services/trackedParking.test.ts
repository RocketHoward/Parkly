import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bandLabel,
  createTrackedSnapshot,
  getEffectiveLots,
  occupancyBand,
  occupancyLabel,
  POLL_INTERVAL_MS,
  readTrackedSnapshot,
  STALE_AFTER_MS,
  summarizeSpaces,
  TRACKED_LOCATIONS,
  type TrackedSpace,
} from "./trackedParking";

afterEach(() => vi.useRealTimers());

const allSpaces = (time: number) =>
  createTrackedSnapshot(time).lots.flatMap((lot) =>
    lot.levels.flatMap((level) => level.spaces),
  );

describe("tracked garage demonstration adapter", () => {
  it("derives every floor and garage total from its unique space inventory", () => {
    const now = 123_456_789;
    const snapshot = createTrackedSnapshot(now);
    expect(snapshot.source).toBe("demonstration");
    expect(snapshot.receivedAt).toBe(now);
    expect(snapshot.lots.map((lot) => lot.id)).toEqual(
      TRACKED_LOCATIONS.map((location) => location.id),
    );
    expect(snapshot.lots).toHaveLength(7);
    const spaces = allSpaces(now);
    expect(spaces).toHaveLength(504);
    expect(new Set(spaces.map((space) => space.id)).size).toBe(504);
    for (const lot of snapshot.lots) {
      expect(lot.updatedAt).toBe(now);
      expect(lot.levels).toHaveLength(3);
      expect(lot.levels.map((level) => level.level)).toEqual([1, 2, 3]);
      expect(lot).toMatchObject(
        summarizeSpaces(lot.levels.flatMap((level) => level.spaces)),
      );
      expect(lot.capacity).toBe(72);
      expect(lot.occupied! + lot.available!).toBe(lot.capacity);
      expect(lot.occupied).toBe(
        lot.levels.reduce((sum, level) => sum + level.occupied!, 0),
      );
      for (const level of lot.levels) {
        expect(level.id).toBe(`${lot.id}-level-${level.level}`);
        expect(level.spaces).toHaveLength(24);
        expect(level.spaces.map((space) => space.number)).toEqual(
          Array.from({ length: 24 }, (_, index) => index + 1),
        );
        expect(level).toMatchObject(summarizeSpaces(level.spaces));
      }
    }
  });

  it("uses exact capacity thresholds and never labels 95% occupied as full", () => {
    expect(
      [0, 49, 50, 74, 75, 94, 95, 100].map((count) =>
        occupancyBand(count, 100),
      ),
    ).toEqual([
      "green",
      "green",
      "yellow",
      "yellow",
      "orange",
      "orange",
      "red",
      "red",
    ]);
    expect(occupancyBand(17, 35)).toBe("green");
    expect(occupancyBand(18, 35)).toBe("yellow");
    expect(occupancyBand(22, 24)).toBe("orange");
    expect(occupancyBand(23, 24)).toBe("red");
    for (const [occupied, capacity] of [
      [null, 24],
      [0, 0],
      [-1, 24],
      [25, 24],
      [NaN, 24],
      [1, Infinity],
    ]) {
      expect(occupancyBand(occupied, capacity!)).toBe("unknown");
    }
    const occupancy = {
      capacity: 100,
      occupied: 95,
      available: 5,
      percent: 95,
      band: "red" as const,
    };
    expect(occupancyLabel(occupancy)).toBe("Nearly full");
    expect(
      occupancyLabel({
        ...occupancy,
        occupied: 100,
        available: 0,
        percent: 100,
      }),
    ).toBe("Full");
    expect(bandLabel("unknown")).toBe("Availability unknown");
  });

  it("keeps all four occupancy colors visible while a few vehicles change each tick", () => {
    const start = 500 * POLL_INTERVAL_MS;
    let changesSeen = 0;
    let fullSeen = false;
    for (let tick = 0; tick < 72; tick++) {
      const now = start + tick * POLL_INTERVAL_MS;
      const snapshot = createTrackedSnapshot(now);
      expect(snapshot.lots.map((lot) => lot.band)).toEqual([
        "green",
        "yellow",
        "orange",
        "red",
        "green",
        "yellow",
        "orange",
      ]);
      expect(allSpaces(now)).toEqual(allSpaces(now + POLL_INTERVAL_MS - 1));
      const current = allSpaces(now);
      const next = allSpaces(now + POLL_INTERVAL_MS);
      const changes = current.filter(
        (space, index) => space.status !== next[index].status,
      ).length;
      expect(changes).toBeLessThanOrEqual(3 * TRACKED_LOCATIONS.length);
      changesSeen += changes;
      fullSeen ||= snapshot.lots.some((lot) => occupancyLabel(lot) === "Full");
      expect(
        snapshot.lots.some(
          (lot) => new Set(lot.levels.map((level) => level.band)).size > 1,
        ),
      ).toBe(true);
    }
    expect(changesSeen).toBeGreaterThan(0);
    expect(fullSeen).toBe(true);
  });

  it("retains unknown inventory before a feed arrives and at the exact stale boundary", () => {
    const now = 100_000;
    const snapshot = createTrackedSnapshot(now);
    expect(getEffectiveLots(snapshot, now + STALE_AFTER_MS - 1)).toBe(
      snapshot.lots,
    );
    const initial = getEffectiveLots(null, now);
    const stale = getEffectiveLots(snapshot, now + STALE_AFTER_MS);
    for (const lots of [initial, stale]) {
      expect(lots).toHaveLength(7);
      for (const lot of lots) {
        expect(lot).toMatchObject({
          capacity: 72,
          occupied: null,
          available: null,
          percent: null,
          band: "unknown",
        });
        for (const level of lot.levels) {
          expect(level).toMatchObject({
            capacity: 24,
            occupied: null,
            available: null,
            percent: null,
            band: "unknown",
          });
          expect(
            level.spaces.every((space) => space.status === "unknown"),
          ).toBe(true);
        }
      }
    }
    expect(initial.every((lot) => lot.updatedAt === null)).toBe(true);
    expect(stale.every((lot) => lot.updatedAt === now)).toBe(true);
    expect(snapshot.lots.every((lot) => lot.band !== "unknown")).toBe(true);
    expect(
      getEffectiveLots(
        createTrackedSnapshot(now + STALE_AFTER_MS),
        now + STALE_AFTER_MS,
      ).every((lot) => lot.occupied !== null),
    ).toBe(true);
  });

  it("does not turn incomplete observations into available parking", () => {
    const spaces: TrackedSpace[] = [
      { id: "1", number: 1, status: "free" },
      { id: "2", number: 2, status: "occupied" },
      { id: "3", number: 3, status: "unknown" },
    ];
    expect(summarizeSpaces(spaces)).toEqual({
      capacity: 3,
      occupied: null,
      available: null,
      percent: null,
      band: "unknown",
    });
    expect(summarizeSpaces([]).band).toBe("unknown");
    expect(summarizeSpaces(spaces.slice(0, 2))).toEqual({
      capacity: 2,
      occupied: 1,
      available: 1,
      percent: 50,
      band: "yellow",
    });
  });

  it("resolves after simulated latency and aborts without leaving pending timers", async () => {
    vi.useFakeTimers();
    let settled = false;
    const request = readTrackedSnapshot(123_000).then((snapshot) => {
      settled = true;
      return snapshot;
    });
    await vi.advanceTimersByTimeAsync(199);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await request).toEqual(createTrackedSnapshot(123_000));
    const controller = new AbortController();
    const cancelled = readTrackedSnapshot(123_000, controller.signal);
    const rejection = expect(cancelled).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
    await expect(
      readTrackedSnapshot(123_000, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(vi.getTimerCount()).toBe(0);
  });
});
