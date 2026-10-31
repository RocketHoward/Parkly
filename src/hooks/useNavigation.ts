import { useCallback, useEffect, useRef, useState } from "react";
import {
  bearingDegrees,
  fetchDrivingRoute,
  pointAtDistance,
  progressAlongRoute,
} from "../services/navigation";
import type { NavigationController, NavigationRoute } from "../types/navigation";
import type { Coordinates, ParkingLocation } from "../types/parking";

type NavigationState = Omit<NavigationController,
  "useLocation" | "preview" | "start" | "togglePause" | "stop">;

const PREVIEW_ORIGIN: Coordinates = { lat: 34.147, lng: -118.126 };
const GPS_STALE_MS = 20_000;
const MAX_ACCURACY_METERS = 80;
const INITIAL_STATE: NavigationState = {
  status: "idle", mode: "live", route: null, progress: null, position: null,
  heading: 0, accuracy: null, error: null, notice: null, gpsStale: false,
  rerouting: false, paused: false,
};

function metersBetween(a: Coordinates, b: Coordinates) {
  const latitude = (a.lat + b.lat) * Math.PI / 360;
  const north = (b.lat - a.lat) * 111_195;
  const east = (b.lng - a.lng) * 111_195 * Math.cos(latitude);
  return Math.hypot(north, east);
}

/** Keep an unwrapped bearing so the map never spins 359 degrees at north. */
function smoothHeading(current: number, next: number) {
  const difference = ((next - current + 540) % 360 + 360) % 360 - 180;
  return current + difference * 0.3;
}

function locationError(code: number) {
  if (code === 1) return "Location access is off. Enable it in your browser settings, or try a route preview.";
  if (code === 3) return "Your location took too long to arrive. Try again outdoors, or preview the route.";
  return "Your current location is unavailable. Check your location settings, or try a route preview.";
}

export function useNavigation(destination: ParkingLocation): NavigationController {
  const [state, setState] = useState<NavigationState>(INITIAL_STATE);
  const current = useRef(state);
  const destinationRef = useRef(destination);
  destinationRef.current = destination;
  const mounted = useRef(true);
  const session = useRef(0);
  const watch = useRef<number | null>(null);
  const request = useRef<AbortController | null>(null);
  const locateTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFixAt = useRef(0);
  const lastFix = useRef<Coordinates | null>(null);
  const lastRouteAt = useRef(0);
  const offRouteSamples = useRef(0);

  const update = useCallback((patch: Partial<NavigationState>) => {
    if (!mounted.current) return;
    current.current = { ...current.current, ...patch };
    setState(current.current);
  }, []);

  const cleanup = useCallback(() => {
    session.current += 1;
    if (watch.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watch.current);
    }
    watch.current = null;
    request.current?.abort();
    request.current = null;
    if (locateTimeout.current !== null) clearTimeout(locateTimeout.current);
    if (previewTimer.current !== null) clearInterval(previewTimer.current);
    locateTimeout.current = null;
    previewTimer.current = null;
    lastFixAt.current = 0;
    lastFix.current = null;
    lastRouteAt.current = 0;
    offRouteSamples.current = 0;
  }, []);

  const stop = useCallback(() => {
    cleanup();
    update(INITIAL_STATE);
  }, [cleanup, update]);

  const routeFrom = useCallback(async (origin: Coordinates, activeSession: number, reroute = false) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    lastRouteAt.current = Date.now();
    update(reroute
      ? { rerouting: true, notice: "Updating your route…", error: null }
      : { status: "routing", error: null });
    try {
      const route: NavigationRoute = await fetchDrivingRoute(
        origin, destinationRef.current.coordinates, controller.signal,
      );
      if (!mounted.current || controller.signal.aborted || activeSession !== session.current) return;
      const position = (current.current.mode === "live" ? lastFix.current : null)
        ?? current.current.position ?? origin;
      const progress = progressAlongRoute(route, position);
      offRouteSamples.current = 0;
      update({
        route, progress,
        position: progress.offRouteDistance > 20 ? position : progress.position,
        heading: progress.heading,
        status: reroute ? "navigating" : "ready", rerouting: false,
        notice: current.current.gpsStale
          ? "GPS signal is delayed. Guidance will resume when your location updates."
          : null,
      });
    } catch (failure) {
      if (!mounted.current || controller.signal.aborted || activeSession !== session.current) return;
      const message = failure instanceof Error ? failure.message : "The route could not load. Please try again.";
      if (reroute) {
        update({ rerouting: false, notice: "The new route could not load. Check your connection; Parkly will retry." });
      } else {
        if (watch.current !== null && navigator.geolocation) {
          navigator.geolocation.clearWatch(watch.current);
          watch.current = null;
        }
        update({ status: "error", error: message, rerouting: false });
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [update]);

  const useLocation = useCallback(() => {
    cleanup();
    update({ ...INITIAL_STATE, status: "locating", mode: "live" });
    if (!navigator.geolocation) {
      update({ status: "error", error: "This browser does not support location. You can still preview a route." });
      return;
    }
    if (!window.isSecureContext) {
      update({ status: "error", error: "Location needs a secure HTTPS connection. Open the published Parkly site, or preview a route." });
      return;
    }
    const activeSession = session.current;
    const isActive = () => mounted.current && activeSession === session.current;
    const initialFailure = (message: string) => {
      if (!isActive()) return;
      cleanup();
      update({ status: "error", error: message, gpsStale: false });
    };
    locateTimeout.current = setTimeout(() => {
      initialFailure("We could not get a precise location. Try again outdoors, or use the route preview.");
    }, 25_000);

    watch.current = navigator.geolocation.watchPosition((fix) => {
      if (!isActive() || current.current.status === "arrived") return;
      const { latitude: lat, longitude: lng, accuracy, heading, speed } = fix.coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (!Number.isFinite(accuracy) || accuracy > MAX_ACCURACY_METERS) {
        update({ accuracy, notice: "Location accuracy is low. Move into an open area for turn guidance." });
        return;
      }
      // A cached or delayed fix must never advance guidance or announce arrival.
      if (Date.now() - fix.timestamp > GPS_STALE_MS) return;
      if (locateTimeout.current !== null) clearTimeout(locateTimeout.current);
      locateTimeout.current = null;
      const position = { lat, lng };
      const previousFix = lastFix.current;
      lastFix.current = position;
      lastFixAt.current = Math.min(Date.now(), fix.timestamp);
      const snapshot = current.current;
      update({ position, accuracy, gpsStale: false, notice: snapshot.rerouting ? snapshot.notice : null });
      if (snapshot.status === "locating") {
        void routeFrom(position, activeSession);
        return;
      }
      if (!snapshot.route || !["ready", "navigating"].includes(snapshot.status)) return;
      const progress = progressAlongRoute(snapshot.route, position, snapshot.progress?.traveled);
      const gpsHeading = heading !== null && Number.isFinite(heading) && speed !== null && speed > 1.2
        ? heading
        : previousFix && metersBetween(previousFix, position) >= 3
          ? bearingDegrees(previousFix, position)
          : progress.heading;
      const nextHeading = smoothHeading(snapshot.heading, gpsHeading);
      const canArrive = progress.arrived && accuracy <= 35 && !snapshot.rerouting;
      update({
        progress: { ...progress, arrived: canArrive },
        position: progress.offRouteDistance > 20 ? position : progress.position,
        heading: nextHeading,
        ...(snapshot.status === "navigating" && canArrive ? { status: "arrived" as const } : {}),
      });
      if (snapshot.status === "navigating" && canArrive && watch.current !== null) {
        navigator.geolocation.clearWatch(watch.current);
        watch.current = null;
      }
      if (snapshot.status !== "navigating" || canArrive || snapshot.rerouting) return;
      const confidentlyOffRoute = accuracy <= 50 && progress.offRouteDistance > Math.max(45, accuracy * 1.25);
      offRouteSamples.current = confidentlyOffRoute ? offRouteSamples.current + 1 : 0;
      if (offRouteSamples.current >= 3 && Date.now() - lastRouteAt.current >= 15_000) {
        offRouteSamples.current = 0;
        void routeFrom(position, activeSession, true);
      }
    }, (failure) => {
      if (!isActive()) return;
      if (failure.code === 1 || !lastFixAt.current) {
        initialFailure(locationError(failure.code));
      } else {
        update({ gpsStale: true, notice: "GPS signal is unavailable. Guidance is paused until your location returns." });
      }
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
  }, [cleanup, routeFrom, update]);

  const preview = useCallback(() => {
    cleanup();
    update({ ...INITIAL_STATE, mode: "preview", position: PREVIEW_ORIGIN });
    void routeFrom(PREVIEW_ORIGIN, session.current);
  }, [cleanup, routeFrom, update]);

  const start = useCallback(() => {
    const snapshot = current.current;
    if (snapshot.status !== "ready" || !snapshot.route) return;
    if (snapshot.mode === "live" && (snapshot.gpsStale
      || Date.now() - lastFixAt.current >= GPS_STALE_MS
      || (snapshot.accuracy !== null && snapshot.accuracy > MAX_ACCURACY_METERS))) {
      update({ notice: "Waiting for a fresh, precise location before starting guidance." });
      return;
    }
    update({ status: "navigating", paused: false });
    if (snapshot.mode !== "preview") return;
    const activeSession = session.current;
    let previousTick = Date.now();
    previewTimer.current = setInterval(() => {
      if (!mounted.current || activeSession !== session.current) return;
      const now = Date.now();
      const elapsed = Math.min(1, (now - previousTick) / 1000);
      previousTick = now;
      const live = current.current;
      if (live.paused || live.status !== "navigating" || !live.route) return;
      const traveled = Math.min(live.route.distance, (live.progress?.traveled ?? 0) + elapsed * 15);
      const position = pointAtDistance(live.route, traveled);
      const progress = progressAlongRoute(live.route, position, traveled);
      const arrived = traveled >= live.route.distance;
      update({
        progress: { ...progress, arrived }, position,
        heading: smoothHeading(live.heading, progress.heading),
        status: arrived ? "arrived" : "navigating",
      });
      if (arrived && previewTimer.current !== null) {
        clearInterval(previewTimer.current);
        previewTimer.current = null;
      }
    }, 300);
  }, [update]);

  const togglePause = useCallback(() => {
    if (current.current.mode === "preview" && current.current.status === "navigating") {
      update({ paused: !current.current.paused });
    }
  }, [update]);

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => {
      const snapshot = current.current;
      if (snapshot.mode !== "live" || !["ready", "navigating"].includes(snapshot.status)) return;
      if (lastFixAt.current && Date.now() - lastFixAt.current >= GPS_STALE_MS && !snapshot.gpsStale) {
        update({ gpsStale: true, notice: "GPS signal is delayed. Guidance will resume when your location updates." });
      }
    }, 1000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      cleanup();
    };
  }, [cleanup, update]);

  useEffect(() => {
    stop();
  }, [destination.id, destination.coordinates.lat, destination.coordinates.lng, stop]);

  return { ...state, useLocation, preview, start, togglePause, stop };
}
