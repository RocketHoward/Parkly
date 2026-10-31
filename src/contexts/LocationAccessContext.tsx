import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { LoaderCircle, LocateFixed, MapPin } from "lucide-react";
import type { Coordinates } from "../types/parking";
import "../styles/location-access.css";

const PROMPT_KEY = "parkly.location-introduction.v1";
const LocationAccessContext = createContext<{ position: Coordinates | null }>({ position: null });

export const useLocationAccess = () => useContext(LocationAccessContext);

export default function LocationAccessProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(() => {
    try { return !localStorage.getItem(PROMPT_KEY); } catch { return true; }
  });
  const [position, setPosition] = useState<Coordinates | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const requestVersion = useRef(0);

  const dismiss = useCallback(() => {
    requestVersion.current += 1;
    try { localStorage.setItem(PROMPT_KEY, "seen"); } catch { /* Browser storage may be disabled. */ }
    setOpen(false);
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    function trap(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); dismiss(); }
      if (event.key !== "Tab") return;
      const nodes = dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      if (!nodes?.length) { event.preventDefault(); return; }
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
    document.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", trap);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, dismiss]);

  useEffect(() => () => { requestVersion.current += 1; }, []);

  function shareLocation() {
    setError("");
    if (!navigator.geolocation) {
      setError("Location is unavailable in this browser. You can still search for parking.");
      return;
    }
    const version = ++requestVersion.current;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (version !== requestVersion.current) return;
      setPosition({ lat: coords.latitude, lng: coords.longitude });
      dismiss();
    }, (failure) => {
      if (version !== requestVersion.current) return;
      setBusy(false);
      setError(failure.code === 1
        ? "Location was not allowed. You can enable it in your browser settings or continue without it."
        : "We couldn’t get your location. Try again or continue without it.");
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }

  return (
    <LocationAccessContext.Provider value={{ position }}>
      <div inert={open ? true : undefined}>{children}</div>
      {open && <div className="location-welcome-backdrop">
        <div className="location-welcome" role="dialog" aria-modal="true"
          aria-labelledby="location-welcome-title" aria-describedby="location-welcome-description"
          ref={dialog} tabIndex={-1}>
          <span className="location-welcome-icon"><MapPin size={29} strokeWidth={1.6} /></span>
          <span className="location-welcome-eyebrow">WELCOME TO PARKLY</span>
          <h2 id="location-welcome-title">Find parking around you.</h2>
          <p id="location-welcome-description">Share your current location to find nearby parking and get directions to your spot.</p>
          <p className="location-welcome-note">Your browser will ask for permission. You can also explore the map without sharing.</p>
          {error && <p className="location-welcome-error" role="alert">{error}</p>}
          <button type="button" className="location-welcome-share" disabled={busy} onClick={shareLocation}>
            {busy ? <LoaderCircle size={18} className="spin" /> : <LocateFixed size={18} />}
            {busy ? "Finding your location…" : "Share location"}
          </button>
          <button type="button" className="location-welcome-later" onClick={dismiss}>Not now</button>
        </div>
      </div>}
    </LocationAccessContext.Provider>
  );
}
