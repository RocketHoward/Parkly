import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getEffectiveLots,
  POLL_INTERVAL_MS,
  readTrackedSnapshot,
  STALE_AFTER_MS,
  type TrackedSnapshot,
} from "../services/trackedParking";

/** Polls the demonstration adapter; no real campus service is connected. */
export function useTrackedParking() {
  const [snapshot, setSnapshot] = useState<TrackedSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(Date.now);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const snapshotRef = useRef<TrackedSnapshot | null>(null);
  const controller = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);

  const invalidateRequest = useCallback(() => {
    requestVersion.current += 1;
    controller.current?.abort();
    controller.current = null;
  }, []);

  const refresh = useCallback(async () => {
    if (!mounted.current) return;
    invalidateRequest();
    if (!navigator.onLine) {
      setLoading(false);
      setError("You are offline. Waiting to reconnect.");
      return;
    }
    const version = requestVersion.current;
    const requestController = new AbortController();
    controller.current = requestController;
    setLoading(snapshotRef.current === null);
    try {
      const next = await readTrackedSnapshot(
        Date.now(),
        requestController.signal,
      );
      if (!mounted.current || version !== requestVersion.current) return;
      snapshotRef.current = next;
      setSnapshot(next);
      setClock(Date.now());
      setError(null);
    } catch (failure) {
      if (
        !mounted.current ||
        version !== requestVersion.current ||
        requestController.signal.aborted
      )
        return;
      setError(
        failure instanceof Error
          ? failure.message
          : "The parking feed could not refresh.",
      );
    } finally {
      if (mounted.current && version === requestVersion.current) {
        controller.current = null;
        setLoading(false);
      }
    }
  }, [invalidateRequest]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const poller = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    const ticker = setInterval(() => setClock(Date.now()), 1_000);
    const onOffline = () => {
      invalidateRequest();
      setLoading(false);
      setClock(Date.now());
      setError("You are offline. Waiting to reconnect.");
    };
    const onOnline = () => {
      void refresh();
    };
    const onVisibilityChange = () => {
      setClock(Date.now());
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      mounted.current = false;
      clearInterval(poller);
      clearInterval(ticker);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      invalidateRequest();
    };
  }, [refresh, invalidateRequest]);

  const stale =
    snapshot !== null && clock - snapshot.receivedAt >= STALE_AFTER_MS;
  const lots = useMemo(
    () => getEffectiveLots(snapshot, clock),
    [snapshot, clock],
  );

  return {
    lots,
    loading,
    lastUpdated: snapshot?.receivedAt ?? null,
    ageSeconds: snapshot
      ? Math.max(0, Math.floor((clock - snapshot.receivedAt) / 1_000))
      : null,
    stale,
    error,
    refresh,
  };
}
