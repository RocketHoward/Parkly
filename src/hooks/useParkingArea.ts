import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  INITIAL_AREA_PARKING,
  containsParking,
  readMapParking,
  type ParkingBounds,
} from "../services/mapParking";
import { PCC_DESTINATION, TRACKED_LOCATIONS } from "../services/trackedParking";
import type { ParkingLocation } from "../types/parking";

function sameArea(a: ParkingBounds | null, b: ParkingBounds | null) {
  return a !== null && b !== null &&
    (Object.keys(a) as (keyof ParkingBounds)[]).every(
      (key) => Math.abs(a[key] - b[key]) < 0.00001,
    );
}

/** Map movement changes the proposed area; only an explicit refresh commits it. */
export function useParkingArea() {
  const [viewport, setViewport] = useState<ParkingBounds | null>(null);
  const [area, setArea] = useState<ParkingBounds | null>(null);
  const [directory, setDirectory] = useState<ParkingLocation[]>(
    INITIAL_AREA_PARKING,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);

  const refresh = useCallback(async (bounds: ParkingBounds) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const locations = await readMapParking(bounds, controller.signal);
      if (controller.signal.aborted) return;
      setArea(bounds);
      setDirectory((previous) => [
        ...previous.filter(
          (location) => !containsParking(bounds, location.coordinates),
        ),
        ...locations,
      ]);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure instanceof Error
        ? failure.message
        : "Parking could not refresh. Try again.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => () => request.current?.abort(), []);

  const locations = useMemo(
    () => [...TRACKED_LOCATIONS, ...directory].filter(
      (location) => !area || containsParking(area, location.coordinates),
    ),
    [directory, area],
  );
  const center = useMemo(
    () => area
      ? { lat: (area.south + area.north) / 2, lng: (area.west + area.east) / 2 }
      : PCC_DESTINATION,
    [area],
  );

  return {
    locations, center, viewport, setViewport, refresh, loading, error,
    dirty: area !== null && viewport !== null && !sameArea(viewport, area),
  };
}
