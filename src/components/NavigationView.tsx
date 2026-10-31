import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpLeft, ArrowUpRight,
  Check, ExternalLink, Flag, LocateFixed, MapPin, Minus, Navigation,
  Pause, Play, Plus, Route, RotateCcw, X,
} from "lucide-react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useNavigation } from "../hooks/useNavigation";
import { formatNavigationDistance } from "../services/navigation";
import { directionsUrl } from "../services/parking";
import type { Coordinates, ParkingLocation } from "../types/parking";
import type { NavigationController, NavigationStep } from "../types/navigation";
import "../styles/navigation.css";

type NavigationViewProps = { destination: ParkingLocation; onClose: () => void };
type Viewport = { width: number; height: number };
type SetupMapInsets = { left: number; bottom: number };

const destinationIcon = L.divIcon({
  className: "navigation-destination-marker",
  html: '<span aria-hidden="true">P</span>',
  iconSize: [42, 42],
  iconAnchor: [21, 21],
});

function durationLabel(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes} min`;
}

function TurnIcon({ step }: { step?: NavigationStep }) {
  const modifier = step?.modifier ?? "";
  if (step?.maneuver === "arrive") return <Flag aria-hidden="true" />;
  if (modifier.includes("uturn")) return <RotateCcw aria-hidden="true" />;
  if (modifier.includes("slight left")) return <ArrowUpLeft aria-hidden="true" />;
  if (modifier.includes("slight right")) return <ArrowUpRight aria-hidden="true" />;
  if (modifier.includes("left")) return <ArrowLeft aria-hidden="true" />;
  if (modifier.includes("right")) return <ArrowRight aria-hidden="true" />;
  if (modifier.includes("reverse")) return <ArrowDown aria-hidden="true" />;
  return <ArrowUp aria-hidden="true" />;
}

function useContinuousHeading(heading: number) {
  const previous = useRef(heading);
  const unwrapped = useRef(heading);
  const [value, setValue] = useState(heading);
  useEffect(() => {
    const delta = ((heading - previous.current + 540) % 360 + 360) % 360 - 180;
    unwrapped.current += delta;
    previous.current = heading;
    setValue(unwrapped.current);
  }, [heading]);
  return value;
}

function NavigationMapSync({ controller, destination, follow, viewport, setupInsets, zoom, onZoom }: {
  controller: NavigationController;
  destination: ParkingLocation;
  follow: boolean;
  viewport: Viewport;
  setupInsets: SetupMapInsets;
  zoom: number;
  onZoom: (zoom: number) => void;
}) {
  const map = useMap();
  const { route, progress, position } = controller;
  const current: Coordinates = position ?? progress?.position ?? destination.coordinates;

  useEffect(() => {
    map.invalidateSize({ animate: false });
    if (follow) return;
    if (route) {
      const mobile = viewport.width < 640;
      const bounds = L.latLngBounds(route.coordinates.map(point => [point.lat, point.lng]));
      bounds.extend([destination.coordinates.lat, destination.coordinates.lng]);
      map.fitBounds(bounds, {
        paddingTopLeft: mobile ? [35, 40] : [setupInsets.left + 30, 70],
        paddingBottomRight: mobile ? [35, setupInsets.bottom + 28] : [70, 70],
        maxZoom: 17,
        animate: false,
      });
    } else {
      map.setView([destination.coordinates.lat, destination.coordinates.lng], 16, { animate: false });
    }
    onZoom(map.getZoom());
  }, [map, route, destination.coordinates.lat, destination.coordinates.lng, follow, viewport.width, viewport.height, setupInsets.left, setupInsets.bottom, onZoom]);

  useEffect(() => {
    if (follow) map.setView([current.lat, current.lng], zoom, { animate: false });
  }, [map, follow, current.lat, current.lng, zoom]);

  useEffect(() => {
    const update = () => onZoom(map.getZoom());
    map.on("zoomend", update);
    return () => { map.off("zoomend", update); };
  }, [map, onZoom]);

  return null;
}

export default function NavigationView({ destination, onClose }: NavigationViewProps) {
  const controller = useNavigation(destination);
  const { status, mode, route, progress, heading, error, notice, rerouting, gpsStale, paused } = controller;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const setupCardRef = useRef<HTMLElement>(null);
  const navigationMapRef = useRef<L.Map | null>(null);
  const stopRef = useRef(controller.stop);
  const onCloseRef = useRef(onClose);
  stopRef.current = controller.stop;
  onCloseRef.current = onClose;
  const [viewport, setViewport] = useState<Viewport>({ width: window.innerWidth, height: window.innerHeight - 72 });
  const [zoom, setZoom] = useState(17);
  const [setupInsets, setSetupInsets] = useState<SetupMapInsets>({ left: 400, bottom: 380 });
  const follow = status === "navigating" || status === "arrived";
  const loading = status === "locating" || status === "routing";
  const smoothHeading = useContinuousHeading(follow ? heading : 0);
  const routePoints = useMemo(() => route?.coordinates.map(point => [point.lat, point.lng] as L.LatLngTuple) ?? [], [route]);
  const side = Math.ceil(Math.hypot(viewport.width, viewport.height)) + 64;
  const remaining = progress?.remaining ?? route?.distance ?? 0;
  const remainingSeconds = route ? route.duration * Math.min(1, remaining / Math.max(1, route.distance)) : 0;
  const eta = new Date(Date.now() + remainingSeconds * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]',
      ) ?? []).filter(element => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); dialogRef.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      stopRef.current();
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown, true);
      requestAnimationFrame(() => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); });
    };
  }, []);

  useEffect(() => {
    const card = setupCardRef.current;
    const mapViewport = viewportRef.current;
    if (follow || !card || !mapViewport) return;
    const measure = () => {
      const cardRect = card.getBoundingClientRect();
      const viewportRect = mapViewport.getBoundingClientRect();
      const next = {
        left: Math.ceil(cardRect.right - viewportRect.left),
        bottom: Math.ceil(viewportRect.bottom - cardRect.top),
      };
      setSetupInsets(previous => previous.left === next.left && previous.bottom === next.bottom ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    observer.observe(mapViewport);
    return () => observer.disconnect();
  }, [follow]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const start = () => { setZoom(17); controller.start(); };
  const close = () => { controller.stop(); onClose(); };
  const mapStyle = {
    "--nav-map-heading": `${follow ? smoothHeading : 0}deg`,
    ...(follow ? { width: side, height: side, transform: `translate(-50%, -50%) rotate(${-smoothHeading}deg)` } : {}),
  } as CSSProperties;

  return createPortal(
    <div className="navigation-overlay" role="dialog" aria-modal="true" aria-labelledby="navigation-title" ref={dialogRef} tabIndex={-1}>
      <header className="navigation-header">
        <div className="navigation-brand"><Navigation size={23} fill="currentColor" aria-hidden="true" /><span>parkly<span>.</span></span></div>
        <div className="navigation-heading"><span>Directions to</span><h1 id="navigation-title">{destination.name}</h1></div>
        <button className="navigation-icon-button navigation-close" type="button" onClick={close} ref={closeRef} aria-label="Close navigation"><X size={22} /></button>
      </header>

      <div className={`navigation-map-viewport${follow ? " is-following" : ""}`} ref={viewportRef}>
        <div className={`navigation-map-rotator${follow ? " is-rotating" : ""}`} style={mapStyle}>
          <MapContainer
            ref={navigationMapRef}
            key={follow ? "follow" : "overview"}
            center={[destination.coordinates.lat, destination.coordinates.lng]}
            zoom={17}
            minZoom={3}
            maxZoom={19}
            className="navigation-map"
            zoomControl={false}
            attributionControl={false}
            keyboard={false}
            dragging={!follow}
            scrollWheelZoom={!follow}
            doubleClickZoom={!follow}
            touchZoom={!follow}
            boxZoom={!follow}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
            {routePoints.length > 0 && <>
              <Polyline positions={routePoints} interactive={false} pathOptions={{ color: "#fff", weight: 12, opacity: 0.94 }} />
              <Polyline positions={routePoints} interactive={false} pathOptions={{ color: "#4b704c", weight: 7, opacity: 1 }} />
              {!follow && <CircleMarker center={routePoints[0]} radius={7} pathOptions={{ color: "#fff", weight: 3, fillColor: "#4b704c", fillOpacity: 1 }} />}
            </>}
            <Marker position={[destination.coordinates.lat, destination.coordinates.lng]} icon={destinationIcon} interactive={false} keyboard={false} />
            <NavigationMapSync controller={controller} destination={destination} follow={follow} viewport={viewport} setupInsets={setupInsets} zoom={zoom} onZoom={setZoom} />
          </MapContainer>
        </div>

        {follow && <div className={`navigation-position${gpsStale ? " is-stale" : ""}`} aria-label="Your direction of travel, pointing ahead">
          <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 53 54 32 44 11 54Z" fill="currentColor" stroke="white" strokeWidth="4" strokeLinejoin="round" /></svg>
        </div>}

        <div className="navigation-map-tools">
          <div className="navigation-compass" title={follow ? "Map follows your direction of travel" : "North up"} aria-label={follow ? "Heading up" : "North up"}>
            <span style={{ transform: `rotate(${-smoothHeading}deg)` }}>N<ArrowUp size={17} /></span>
          </div>
          <div className="navigation-zoom">
            <button type="button" onClick={() => navigationMapRef.current?.zoomIn()} disabled={zoom >= 19} aria-label="Zoom navigation map in"><Plus size={20} /></button>
            <button type="button" onClick={() => navigationMapRef.current?.zoomOut()} disabled={zoom <= 3} aria-label="Zoom navigation map out"><Minus size={20} /></button>
          </div>
        </div>

        {!follow && <section className={`navigation-setup-card${status === "ready" ? " is-ready" : ""}`} aria-label="Plan your route" ref={setupCardRef}>
          <span className="navigation-eyebrow"><Route size={15} /> YOUR WAY TO A SPACE</span>
          <h2>{status === "ready" ? "Your route is ready." : "Let’s get you there."}</h2>
          <p className="navigation-destination"><MapPin size={17} />{destination.name}</p>
          {status === "ready" && route ? <>
            <div className="navigation-route-summary"><strong>{durationLabel(route.duration)}</strong><span>{formatNavigationDistance(route.distance)} · driving</span></div>
            {mode === "preview" && <p className="navigation-preview-note"><Play size={14} /> Route preview · simulated movement</p>}
            <button className="navigation-primary-button" type="button" onClick={start}><Navigation size={19} fill="currentColor" />{mode === "preview" ? "Start route preview" : "Start navigation"}<ArrowRight size={19} /></button>
            <button className="navigation-text-button" type="button" onClick={controller.useLocation}>{mode === "preview" ? "Use my location instead" : "Refresh my location"}</button>
          </> : <>
            <p className="navigation-setup-copy">Share your location for directions, or try a simulated route around campus.</p>
            <button className="navigation-primary-button" type="button" onClick={controller.useLocation} disabled={loading}>
              {loading ? <span className="navigation-spinner" aria-hidden="true" /> : <LocateFixed size={19} />}
              {status === "locating" ? "Finding your location…" : status === "routing" ? "Finding your route…" : "Use my location"}
            </button>
            <button className="navigation-secondary-button" type="button" onClick={controller.preview} disabled={loading}><Play size={17} />Try route preview</button>
          </>}
          {error && <p className="navigation-message is-error" role="alert">{error}</p>}
          {notice && <p className="navigation-message" role="status">{notice}</p>}
          <div className="navigation-setup-footer">
            <p>Directions end at the nearest mapped road. Follow signs for the parking entrance.</p>
            <a href={directionsUrl(destination)} target="_blank" rel="noopener noreferrer">Open in Google Maps <ExternalLink size={13} /></a>
          </div>
        </section>}

        {follow && <>
          <div className="navigation-guidance-stack">
          <section className={`navigation-instruction${status === "arrived" ? " has-arrived" : ""}`} aria-label="Next direction">
            <div className="navigation-turn-symbol">{status === "arrived" ? <Check /> : <TurnIcon step={progress?.nextStep} />}</div>
            <div className="navigation-turn-copy">
              <span className="navigation-turn-distance">{status === "arrived" ? "Destination nearby" : rerouting ? "Updating route…" : `In ${formatNavigationDistance(progress?.distanceToTurn ?? 0)}`}</span>
              <h2>{status === "arrived" ? "Follow signs to the entrance" : progress?.nextStep.instruction ?? "Continue ahead"}</h2>
              {status !== "arrived" && progress?.nextStep.road && <p>{progress.nextStep.road}</p>}
            </div>
          </section>
          {(mode === "preview" || notice || gpsStale) && <div className="navigation-status-stack">
            {mode === "preview" && <div className="navigation-preview-pill"><span className={paused ? "" : "is-playing"} />Route preview · simulated movement{paused ? " · paused" : ""}</div>}
            {(notice || gpsStale) && <p className="navigation-live-notice" role="status">{notice ?? "Waiting for an updated GPS position…"}</p>}
          </div>}
          </div>

          <section className="navigation-trip-footer" aria-label="Trip progress">
            <div className="navigation-trip-stats">
              <strong>{status === "arrived" ? "You’re nearby" : durationLabel(remainingSeconds)}</strong>
              <span>{status === "arrived" ? destination.name : <>{formatNavigationDistance(remaining)} <span aria-hidden="true">·</span> {eta} arrival</>}</span>
            </div>
            <div className="navigation-trip-actions">
              {mode === "preview" && status !== "arrived" && <button className="navigation-pause-button" type="button" onClick={controller.togglePause} aria-label={paused ? "Resume route preview" : "Pause route preview"}>{paused ? <Play size={19} /> : <Pause size={19} />}</button>}
              <button className="navigation-end-button" type="button" onClick={close}>{status === "arrived" ? "Done" : "End"}<X size={16} /></button>
            </div>
          </section>
        </>}

        <div className="navigation-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a><span>Routing: OSRM</span></div>
        <span className="navigation-sr-only" aria-live="polite">{status === "navigating" ? progress?.nextStep.instruction : status === "arrived" ? "Destination nearby. Follow signs for the parking entrance." : status === "ready" ? "Route ready" : ""}</span>
      </div>
    </div>,
    document.body,
  );
}
