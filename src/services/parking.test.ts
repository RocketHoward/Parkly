import { describe, expect, it } from "vitest";
import {
  DEMO_PARKING,
  distanceMeters,
  parsePreferences,
  rankParking,
  SAMPLE_DESTINATION,
} from "./parking";
import type { ParkingLocation } from "../types/parking";

describe("parking recommendation integrity", () => {
  it("does not present unknown prices as free or cheapest", () => {
    expect(
      rankParking(
        DEMO_PARKING,
        SAMPLE_DESTINATION,
        "all",
        parsePreferences("free parking"),
      ),
    ).toEqual([]);
    expect(
      rankParking(
        DEMO_PARKING,
        SAMPLE_DESTINATION,
        "all",
        parsePreferences("cheapest parking"),
      ),
    ).toEqual([]);
  });
  it("does not satisfy legal or duration constraints with unverified examples", () => {
    expect(
      rankParking(
        DEMO_PARKING,
        SAMPLE_DESTINATION,
        "all",
        parsePreferences("legal parking"),
      ),
    ).toEqual([]);
    expect(
      rankParking(
        DEMO_PARKING,
        SAMPLE_DESTINATION,
        "all",
        parsePreferences("parking for three hours"),
      ),
    ).toEqual([]);
  });
  it("limits samples to their actual region and honors the type filter", () => {
    expect(rankParking(DEMO_PARKING, { lat: 40.7128, lng: -74.006 })).toEqual(
      [],
    );
    expect(
      rankParking(DEMO_PARKING, SAMPLE_DESTINATION, "street").every(
        (spot) => spot.type === "street",
      ),
    ).toBe(true);
  });
  it("ranks known prices and filters duration using actual fields", () => {
    const locations: ParkingLocation[] = [
      {
        ...DEMO_PARKING[0],
        id: "paid",
        pricePerHour: 5,
        maxDurationMinutes: 240,
        restrictionsVerified: true,
      },
      {
        ...DEMO_PARKING[1],
        id: "free",
        pricePerHour: 0,
        maxDurationMinutes: 120,
        restrictionsVerified: true,
      },
      DEMO_PARKING[2],
    ];
    expect(
      rankParking(
        locations,
        SAMPLE_DESTINATION,
        "all",
        parsePreferences("cheapest legal parking"),
      ).map((spot) => spot.id),
    ).toEqual(["free", "paid"]);
    expect(
      rankParking(
        locations,
        SAMPLE_DESTINATION,
        "all",
        parsePreferences("for three hours"),
      ).map((spot) => spot.id),
    ).toEqual(["paid"]);
  });
  it("can rank an entire refreshed viewport without the nearby distance cutoff", () => {
    const distantLot: ParkingLocation = {
      ...DEMO_PARKING[0],
      coordinates: { lat: SAMPLE_DESTINATION.lat + 0.04, lng: SAMPLE_DESTINATION.lng },
    };
    expect(rankParking([distantLot], SAMPLE_DESTINATION)).toEqual([]);
    expect(rankParking(
      [distantLot], SAMPLE_DESTINATION, "all", parsePreferences(""), Infinity,
    )).toHaveLength(1);
  });
  it("does not invent walking times and sorts straight-line estimates", () => {
    expect(
      parsePreferences("within a 10-minute walk").walkingTimeRequested,
    ).toBe(true);
    const spots = rankParking(DEMO_PARKING, SAMPLE_DESTINATION);
    expect(spots[0].distanceMeters).toBeLessThanOrEqual(
      spots[1].distanceMeters,
    );
    expect(distanceMeters(SAMPLE_DESTINATION, SAMPLE_DESTINATION)).toBe(0);
  });
});
