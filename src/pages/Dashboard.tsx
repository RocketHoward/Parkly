import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDownUp,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Info,
  Leaf,
  LoaderCircle,
  LocateFixed,
  LogOut,
  MapPin,
  ParkingCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import L from "leaflet";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  ZoomControl,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import Logo from "../components/Logo";
import { useAuth } from "../contexts/AuthContext";
import {
  directionsUrl,
  formatDistance,
  parsePreferences,
  rankParking,
} from "../services/parking";
import { searchDestinations } from "../services/geocoding";
import type { Destination, ParkingLocation, ParkingType, RankedParking } from "../types/parking";
import "../styles/dashboard.css";
import TrackedLotPanel from "../components/TrackedLotPanel";
import ParkingTerms from "../components/ParkingTerms";
import NavigationView from "../components/NavigationView";
import { useLocationAccess } from "../contexts/LocationAccessContext";
import { useTrackedParking } from "../hooks/useTrackedParking";
import { useParkingArea } from "../hooks/useParkingArea";
import type { ParkingBounds } from "../services/mapParking";
import {
  PCC_DESTINATION,
  TRACKED_LOCATIONS,
  occupancyLabel,
} from "../services/trackedParking";
import type { TrackedLot } from "../services/trackedParking";
import "../styles/tracked-parking.css";
import "../styles/dashboard-integration.css";

const trackedIcon = (lot: TrackedLot, selected: boolean) =>
  L.divIcon({
    className: "parkly-marker-wrapper tracked-marker-wrapper",
    html: `<span class="tracked-map-pin occupancy-${lot.band} ${selected ? "is-selected" : ""}"><span>P</span><strong>${lot.available ?? "—"}</strong><small>free</small></span>`,
    iconSize: [76, 38],
    iconAnchor: [38, 19],
  });
const parkingIcon = (selected: boolean, street: boolean) =>
  L.divIcon({
    className: "parkly-marker-wrapper untracked-marker-wrapper",
    html: `<span class="parkly-map-pin ${selected ? "is-selected" : ""} ${street ? "is-street" : ""}"><span>P</span>${street ? "<i></i>" : ""}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -19],
  });
const destinationIcon = L.divIcon({
  className: "parkly-destination-wrapper",
  html: '<span class="parkly-destination-pin"><span></span></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function MapPosition({
  destination,
  onViewportChange,
}: {
  destination: Destination;
  onViewportChange: (bounds: ParkingBounds, refresh?: boolean) => void;
}) {
  const map = useMap();
  const reportViewport = useCallback(
    (refresh = false) => {
      const bounds = map.getBounds();
      onViewportChange({
        south: bounds.getSouth(), west: bounds.getWest(),
        north: bounds.getNorth(), east: bounds.getEast(),
      }, refresh);
    },
    [map, onViewportChange],
  );

  useEffect(() => {
    // Release the old viewport's floor before fitting a new destination.
    map.setMinZoom(0);
    map.invalidateSize();
    const mobile = window.matchMedia("(max-width: 680px)").matches;
    if (
      destination.lat === PCC_DESTINATION.lat &&
      destination.lng === PCC_DESTINATION.lng
    ) {
      map.fitBounds(
        TRACKED_LOCATIONS.map(({ coordinates }) =>
          [coordinates.lat, coordinates.lng] as [number, number]),
        {
          paddingTopLeft: [mobile ? 35 : 50, 70],
          paddingBottomRight: [mobile ? 35 : 50, 80],
          maxZoom: 17,
          animate: false,
        },
      );
    } else {
      map.setView([destination.lat, destination.lng], mobile ? 16 : 17, {
        animate: false,
      });
    }
    map.setMinZoom(map.getZoom());
    reportViewport(true);
  }, [destination, map, reportViewport]);

  useEffect(() => {
    const update = () => reportViewport();
    map.on("moveend", update);
    return () => {
      map.off("moveend", update);
    };
  }, [map, reportViewport]);

  useEffect(() => {
    map.getContainer().setAttribute("role", "region");
    map.getContainer().setAttribute("aria-label", "Parking map");
    map.getContainer().setAttribute("aria-describedby", "map-keyboard-help");
    const updateMarkerSize = () =>
      map.getContainer().classList.toggle("is-overview", map.getZoom() < 17);
    updateMarkerSize();
    map.on("zoomend", updateMarkerSize);
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      const mobile = window.matchMedia("(max-width: 680px)").matches;
      // Recalculate the same overview limit after a screen-size change.
      map.setMinZoom(0);
      const floor = Math.min(17, map.getBoundsZoom(
        L.latLngBounds(TRACKED_LOCATIONS.map(({ coordinates }) =>
          [coordinates.lat, coordinates.lng] as [number, number])),
        false,
        L.point(mobile ? 70 : 100, 150),
      ));
      map.setMinZoom(floor);
    });
    observer.observe(map.getContainer());
    return () => {
      observer.disconnect();
      map.off("zoomend", updateMarkerSize);
    };
  }, [map]);
  return null;
}

function ParkingMarker({
  location,
  selected,
  onSelect,
  tracked,
}: {
  location: RankedParking;
  selected: boolean;
  onSelect: () => void;
  tracked?: TrackedLot;
}) {
  const marker = useRef<L.Marker>(null);
  const icon = useMemo(
    () =>
      tracked
        ? trackedIcon(tracked, selected)
        : parkingIcon(selected, location.type === "street"),
    [selected, location.type, tracked],
  );
  useEffect(() => {
    marker.current
      ?.getElement()
      ?.setAttribute(
        "title",
        tracked
          ? `${location.name} · ${tracked.available ?? "Unknown"} free · simulated API`
          : `${location.name}, availability not connected`,
      );
    marker.current
      ?.getElement()
      ?.setAttribute(
        "aria-label",
        tracked
          ? `${location.name}, ${tracked.available ?? "unknown"} available, ${occupancyLabel(tracked)}. Open levels.`
          : `${location.name}, untracked location. Open parking details.`,
      );
    if (!tracked) {
      if (selected) marker.current?.openPopup();
      else marker.current?.closePopup();
    }
  }, [selected, location.name, tracked]);
  return (
    <Marker
      ref={marker}
      autoPanOnFocus={false}
      position={[location.coordinates.lat, location.coordinates.lng]}
      icon={icon}
      eventHandlers={{
        click: onSelect,
        keydown: (event) => {
          if (
            event.originalEvent.key === "Enter" ||
            event.originalEvent.key === " "
          ) {
            L.DomEvent.stop(event.originalEvent);
            onSelect();
            if (!tracked) marker.current?.openPopup();
          }
        },
      }}
      title={
        tracked
          ? `${location.name} · ${tracked.available ?? "Unknown"} free · simulated API`
          : `${location.name}, availability not connected`
      }
      zIndexOffset={selected ? 1000 : 0}
    >
      {!tracked && (
        <Popup autoPan={false}>
          <div className="parking-popup">
            <span className="popup-eyebrow">NOT CONNECTED</span>
            <strong>{location.name}</strong>
            <p>
              {location.kind} · {formatDistance(location.distanceMeters)}{" "}
              straight-line
            </p>
            <ParkingTerms location={location} compact />
            <p>Availability & restrictions: Unknown</p>
            <a
              href={directionsUrl(location)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open directions <ArrowRight size={14} />
            </a>
          </div>
        </Popup>
      )}
    </Marker>
  );
}

export default function Dashboard({ demo = false }: { demo?: boolean }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { position: sharedLocation } = useLocationAccess();
  const appliedSharedLocation = useRef<typeof sharedLocation>(null);
  const [navigationDestination, setNavigationDestination] = useState<ParkingLocation | null>(null);
  const [destination, setDestination] = useState<Destination>(PCC_DESTINATION);
  const [query, setQuery] = useState(PCC_DESTINATION.name);
  const [searchResults, setSearchResults] = useState<Destination[] | null>(
    null,
  );
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [type, setType] = useState<ParkingType | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preference, setPreference] = useState("");
  const [appliedPreference, setAppliedPreference] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [tileErrors, setTileErrors] = useState(0);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const searchRequest = useRef<AbortController | null>(null);
  const locationRequestVersion = useRef(0);
  const searchPanel = useRef<HTMLDivElement>(null);
  const discoveryPanel = useRef<HTMLElement>(null);
  const feed = useTrackedParking();
  const parkingArea = useParkingArea();
  const { refresh: refreshArea, setViewport } = parkingArea;
  const onViewportChange = useCallback((bounds: ParkingBounds, refresh = false) => {
    setViewport(bounds);
    if (refresh) void refreshArea(bounds);
  }, [refreshArea, setViewport]);
  function refreshMapArea() {
    if (!parkingArea.viewport) return;
    setSelectedId(null);
    void refreshArea(parkingArea.viewport);
    void feed.refresh();
  }
  const feedUnavailable = feed.stale || feed.lastUpdated === null;
  const [availableOnly, setAvailableOnly] = useState(false);
  const trackedById = useMemo(
    () => new Map(feed.lots.map((lot) => [lot.id, lot])),
    [feed.lots],
  );
  const menuPanel = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const preferences = useMemo(
    () => parsePreferences(appliedPreference),
    [appliedPreference],
  );
  const results = useMemo(
    () => rankParking(parkingArea.locations, parkingArea.center, type, preferences, Infinity),
    [parkingArea.locations, parkingArea.center, type, preferences],
  );
  const nearbyCount = parkingArea.locations.length;
  const selected = results.find((location) => location.id === selectedId);
  const selectedTracked = selectedId ? trackedById.get(selectedId) : undefined;
  const visibleResults = availableOnly
    ? results.filter(
        (location) => (trackedById.get(location.id)?.available ?? 0) > 0,
      )
    : results;
  function selectParking(id: string | null) {
    setSelectedId(id);
    discoveryPanel.current?.scrollTo({ top: 0, behavior: "instant" });
  }
  const displayName =
    typeof user?.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.split(" ")[0]
      : "Your account";

  useEffect(() => {
    mounted.current = true;
    function closePanels(event: PointerEvent) {
      if (
        searchPanel.current &&
        !searchPanel.current.contains(event.target as Node)
      )
        setSearchResults(null);
      if (
        menuPanel.current &&
        !menuPanel.current.contains(event.target as Node)
      )
        setUserMenuOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSearchResults(null);
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", closePanels);
    document.addEventListener("keydown", escape);
    return () => {
      mounted.current = false;
      searchRequest.current?.abort();
      document.removeEventListener("pointerdown", closePanels);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  const chooseDestination = useCallback((next: Destination) => {
    locationRequestVersion.current += 1;
    setLocating(false);
    searchRequest.current?.abort();
    setSearching(false);
    setDestination(next);
    setQuery(next.name);
    setSearchResults(null);
    setSelectedId(null);
    setSearchError("");
    setLocationError("");
  }, []);

  useEffect(() => {
    if (!sharedLocation) return;
    // A first-visit grant also applies after moving from sign-in to the map.
    if (appliedSharedLocation.current === sharedLocation) return;
    appliedSharedLocation.current = sharedLocation;
    chooseDestination({ ...sharedLocation, name: "Your current location", address: "Location shared by your device" });
  }, [sharedLocation, chooseDestination]);

  async function submitSearch(event: FormEvent) {
    event.preventDefault();
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setSearching(true);
    setSearchError("");
    setSearchResults(null);
    const timeout = window.setTimeout(() => controller.abort("timeout"), 12000);
    try {
      const found = await searchDestinations(query, controller.signal);
      if (!controller.signal.aborted && mounted.current)
        setSearchResults(found);
    } catch (error) {
      if (
        mounted.current &&
        (!controller.signal.aborted || controller.signal.reason === "timeout")
      )
        setSearchError(
          controller.signal.reason === "timeout"
            ? "Search took too long. Please try again."
            : error instanceof Error
              ? error.message
              : "Could not search destinations. Check your connection and try again.",
        );
    } finally {
      window.clearTimeout(timeout);
      if (searchRequest.current === controller && mounted.current)
        setSearching(false);
    }
  }

  function locateMe() {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError(
        "Your browser does not support location access. Search for a destination instead.",
      );
      return;
    }
    const requestVersion = ++locationRequestVersion.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (
          !mounted.current ||
          requestVersion !== locationRequestVersion.current
        )
          return;
        chooseDestination({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          name: "Your current location",
          address: "Location shared by your device",
        });
        setLocating(false);
      },
      (error) => {
        if (
          !mounted.current ||
          requestVersion !== locationRequestVersion.current
        )
          return;
        setLocating(false);
        setLocationError(
          error.code === 1
            ? "Location access was not allowed. You can search for a destination instead."
            : "We could not find your location. Try again or search for a destination.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function logOut() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch {
      setLogoutError("We could not sign you out. Please try again.");
      setLoggingOut(false);
    }
  }

  function clearFilters() {
    setType("all");
    setPreference("");
    setAppliedPreference("");
    setSelectedId(null);
    setAvailableOnly(false);
  }

  return (
    <>
    <div className="dashboard" inert={navigationDestination ? true : undefined}>
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <Logo />
          <span className="dashboard-header-divider" />
          <span className="explore-label">Explore</span>
        </div>
        <div className="destination-search" ref={searchPanel}>
          <form onSubmit={submitSearch} role="search">
            <Search size={19} aria-hidden="true" />
            <label className="sr-only" htmlFor="destination-search">
              Search destination
            </label>
            <input
              id="destination-search"
              value={query}
              onChange={(event) => {
                searchRequest.current?.abort();
                setSearching(false);
                setQuery(event.target.value);
                setSearchError("");
                setSearchResults(null);
              }}
              placeholder="Where are you headed?"
              autoComplete="off"
              maxLength={180}
            />
            <button
              type="submit"
              className="search-submit"
              disabled={searching || query.trim().length < 3}
              aria-label="Search destination"
            >
              {searching ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <ArrowRight size={18} />
              )}
            </button>
          </form>
          {searchError && (
            <div className="search-feedback" role="alert">
              {searchError}
            </div>
          )}
          {searchResults !== null && (
            <div className="destination-results">
              <div className="search-results-heading">
                {searchResults.length
                  ? "Choose your destination"
                  : "No destinations found. Try a city or full address."}
                <button
                  onClick={() => setSearchResults(null)}
                  aria-label="Close search results"
                >
                  <X size={16} />
                </button>
              </div>
              {searchResults.map((place, index) => (
                <button
                  key={`${place.lat}-${place.lng}-${index}`}
                  onClick={() => chooseDestination(place)}
                >
                  <MapPin size={18} />
                  <span>
                    <strong>{place.name}</strong>
                    <small>{place.address}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
              <span className="geocoding-credit">
                Search by Photon · OpenStreetMap
              </span>
            </div>
          )}
        </div>
        <div className="dashboard-account" ref={menuPanel}>
          {demo && (
            <span className="demo-header-badge">
              <span />
              API preview
            </span>
          )}
          <button
            className="account-trigger"
            aria-expanded={userMenuOpen}
            aria-label="Open account menu"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
          >
            <span className="avatar">
              {demo ? <UserRound size={19} /> : displayName[0].toUpperCase()}
            </span>
            <span className="account-name">{demo ? "Guest" : displayName}</span>
            <ChevronDown size={15} />
          </button>
          {userMenuOpen && (
            <div className="account-menu">
              <span>{demo ? "You’re exploring Parkly" : user?.email}</span>
              {demo ? (
                <Link to="/login">
                  <UserRound size={17} />
                  Sign in to your account
                </Link>
              ) : (
                <>
                  <Link to="/profile">
                    <UserRound size={17} />
                    Profile & settings
                  </Link>
                  <button onClick={logOut} disabled={loggingOut}>
                    {loggingOut ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <LogOut size={17} />
                    )}
                    {loggingOut ? "Signing out…" : "Sign out"}
                  </button>
                </>
              )}
              {logoutError && <p role="alert">{logoutError}</p>}
            </div>
          )}
        </div>
      </header>

      <main className="dashboard-main">
        <aside
          className={`discovery-panel ${selected && selectedTracked ? "showing-levels" : ""}`}
          ref={discoveryPanel}
          aria-label="Parking discovery"
        >
          {selected && selectedTracked ? (
            <TrackedLotPanel
              key={selected.id}
              location={selected}
              lot={selectedTracked}
              ageSeconds={feed.ageSeconds}
              stale={feedUnavailable}
              feedError={feed.error}
              onBack={() => selectParking(null)}
              onNavigate={() => setNavigationDestination(selected)}
            />
          ) : (
            <>
              <div className="area-heading">
                <h1>Parking nearby</h1>
                <p>Move the map, then refresh this area.</p>
                <span>{parkingArea.locations.length} lots in this area · {parkingArea.locations.filter((lot) => trackedById.has(lot.id)).length} connected</span>
              </div>
              {parkingArea.error && <p className="area-feedback" role="alert">{parkingArea.error}</p>}
              {parkingArea.dirty && <p className="area-feedback" role="status">Map moved. Refresh to update the parking list.</p>}
              <div className="parking-filters" aria-label="Parking type">
                <button
                  className={type === "all" ? "active" : ""}
                  aria-pressed={type === "all"}
                  onClick={() => {
                    setType("all");
                    setSelectedId(null);
                  }}
                >
                  <ParkingCircle size={16} />
                  All parking
                </button>
                <button
                  className={type === "lot" ? "active" : ""}
                  aria-pressed={type === "lot"}
                  onClick={() => {
                    setType("lot");
                    setSelectedId(null);
                  }}
                >
                  <Building2 size={16} />
                  Lots & garages
                </button>
                <button
                  className={type === "street" ? "active" : ""}
                  aria-pressed={type === "street"}
                  onClick={() => {
                    setType("street");
                    setSelectedId(null);
                  }}
                >
                  Street
                </button>
              </div>
              <section
                className={`parking-assistant ${assistantOpen ? "expanded" : ""}`}
              >
                <button
                  className="assistant-toggle"
                  onClick={() => setAssistantOpen(!assistantOpen)}
                  aria-expanded={assistantOpen}
                >
                  <span className="assistant-icon">
                    <SlidersHorizontal size={18} />
                  </span>
                  <span>
                    <strong>A spot that fits your plans</strong>
                    <small>Tell us what matters to you</small>
                  </span>
                  <ChevronDown
                    className={assistantOpen ? "rotated" : ""}
                    size={16}
                  />
                </button>
                {assistantOpen && (
                  <form
                    className="assistant-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setAppliedPreference(preference.trim());
                      setSelectedId(null);
                    }}
                  >
                    <label htmlFor="parking-preference">
                      Your parking preferences
                    </label>
                    <textarea
                      id="parking-preference"
                      placeholder="e.g. A garage near my destination"
                      value={preference}
                      onChange={(event) => setPreference(event.target.value)}
                      rows={2}
                      maxLength={240}
                    />
                    <div>
                      <small>
                        Simple rules, no AI. Try “street”, “free”, or “for 3
                        hours”.
                      </small>
                      <button
                        type="submit"
                        aria-label="Apply parking preferences"
                      >
                        <ArrowRight size={18} />
                      </button>
                    </div>
                  </form>
                )}
              </section>
              {appliedPreference && (
                <div className="applied-preference">
                  <span>
                    <Check size={14} />
                    {appliedPreference}
                  </span>
                  <button
                    onClick={() => {
                      setAppliedPreference("");
                      setPreference("");
                    }}
                    aria-label="Clear parking preferences"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {appliedPreference && !preferences.recognized && (
                <p className="preference-note">
                  That preference isn’t supported yet. Results are sorted by
                  distance. Try “garage”, “street”, “free”, or “for 3 hours”.
                </p>
              )}
              {preferences.walkingTimeRequested && (
                <p className="preference-note">
                  Walking routes aren’t connected yet, so a walking-time limit
                  can’t be verified. Distances below are straight-line
                  estimates.
                </p>
              )}

              <div className="results-heading">
                <h2>
                  {visibleResults.length} parking{" "}
                  {visibleResults.length === 1 ? "location" : "locations"}
                </h2>
                <span>
                  <ArrowDownUp size={13} />
                  {preferences.cheapest ? "Known price" : "Nearest first"}
                </span>
              </div>
              <div className="availability-tools">
                <button
                  className={availableOnly ? "active" : ""}
                  aria-pressed={availableOnly}
                  onClick={() => setAvailableOnly(!availableOnly)}
                >
                  <Check size={13} />
                  Available only
                </button>
                <span className={feedUnavailable ? "feed-unavailable" : ""}>
                  <i />
                  {feed.loading
                    ? "Connecting…"
                    : feedUnavailable
                      ? "Feed unavailable"
                      : `Updated ${feed.ageSeconds ?? 0}s ago`}
                </span>
              </div>
              {(feed.stale || feed.error) && (
                <div className="tracking-feed-warning" role="status">
                  {feed.error ||
                    "Availability is unknown until a fresh update arrives."}{" "}
                  <button onClick={() => void feed.refresh()}>Retry</button>
                </div>
              )}
              <div className="parking-results">
                {visibleResults.map((location) => {
                  const tracked = trackedById.get(location.id);
                  return (
                    <article
                      className={`parking-result connected-result ${tracked ? "" : "untracked-result"} ${selectedId === location.id ? "selected" : ""} occupancy-${tracked?.band ?? "unknown"}`}
                      key={location.id}
                    >
                      <button
                        className="parking-result-main"
                        onClick={() => selectParking(location.id)}
                        aria-label={`View ${location.name} ${tracked ? "levels" : "details"}`}
                      >
                        <span className="parking-result-icon">
                          <Building2 size={22} />
                        </span>
                        <span className="parking-result-body">
                          <span className="parking-result-category">
                            {tracked ? (
                              <>
                                <i className="connection-dot" />
                                {feedUnavailable
                                  ? "Waiting for feed"
                                  : feed.error
                                    ? "Reconnecting"
                                    : "API connected"}{" "}
                                <span className="source-mini">simulated</span>
                              </>
                            ) : (
                              "Not tracked"
                            )}
                          </span>
                          <strong>{location.name}</strong>
                          <span className="parking-address">
                            {tracked
                              ? `${tracked.levels.length} levels · ${tracked.capacity} spaces`
                              : location.address}
                          </span>
                          <ParkingTerms location={location} compact />
                          <span className="parking-result-meta">
                            <span>
                              <MapPin size={12} />
                              {formatDistance(location.distanceMeters)} from map center
                            </span>
                            <span>
                              {tracked
                                ? occupancyLabel(tracked)
                                : "Availability unknown"}
                            </span>
                          </span>
                        </span>
                        <span className="lot-free-count">
                          <strong>{tracked?.available ?? "—"}</strong>
                          <small>free</small>
                          <ChevronRight size={14} />
                        </span>
                      </button>
                      {tracked && (
                        <div
                          className="lot-fill-meter"
                          aria-label={`${tracked.percent === null ? "Unknown" : Math.round(tracked.percent)} percent occupied`}
                        >
                          <span style={{ width: `${tracked.percent ?? 0}%` }} />
                        </div>
                      )}
                      {selectedId === location.id && !tracked && (
                        <div className="parking-detail">
                          <p>
                            Availability and restrictions are unknown
                            for this parking lot.
                          </p>
                          <a
                            href={directionsUrl(location)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open directions
                            <ArrowRight size={14} />
                          </a>
                        </div>
                      )}
                    </article>
                  );
                })}
                {!visibleResults.length && (
                  <div className="empty-parking">
                    <span>
                      <Search size={25} />
                    </span>
                    <h3>
                      {nearbyCount
                        ? "No matching parking"
                        : parkingArea.loading ? "Finding parking…" : "No parking in this area"}
                    </h3>
                    <p>
                      {nearbyCount
                        ? "Try another filter. Unknown availability is never counted as free."
                        : "Move or zoom the map, then refresh to find parking in that area."}
                    </p>
                    <button
                      onClick={() => {
                        if (nearbyCount) clearFilters();
                        else refreshMapArea();
                      }}
                    >
                      {nearbyCount ? "Clear filters" : "Refresh this area"}
                      <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              </div>
              <p className="integrated-source-note">
                <Info size={13} />
                Levels and occupancy are simulated for this API preview.
              </p>
              <footer className="discovery-footer">
                <Leaf size={16} />
                <span>A little less circling. A little more living.</span>
              </footer>
            </>
          )}
        </aside>

        <section className="parking-map" aria-label="Interactive parking map">
          <p className="sr-only" id="map-keyboard-help">
            Use arrow keys to pan and plus or minus to zoom. Tab to a parking
            marker and press Enter to open its details. The same parking
            locations are available in the results list.
          </p>
          <MapContainer
            center={[PCC_DESTINATION.lat, PCC_DESTINATION.lng]}
            zoom={16}
            bounceAtZoomLimits={false}
            zoomControl={false}
            className="parkly-leaflet"
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              eventHandlers={{
                tileerror: () => setTileErrors((count) => count + 1),
                tileload: () => setTilesLoaded(true),
              }}
            />
            <MapPosition destination={destination} onViewportChange={onViewportChange} />
            <Circle
              center={[destination.lat, destination.lng]}
              radius={240}
              pathOptions={{
                color: "#829f69",
                weight: 1,
                dashArray: "4 6",
                fillColor: "#a8c686",
                fillOpacity: 0.1,
              }}
            />
            <Marker
              key={`${destination.name}:${destination.lat}:${destination.lng}`}
              position={[destination.lat, destination.lng]}
              icon={destinationIcon}
              title={`Destination: ${destination.name}`}
            >
              <Popup>
                <div className="parking-popup">
                  <span className="popup-eyebrow">YOUR DESTINATION</span>
                  <strong>{destination.name}</strong>
                  <p>{destination.address}</p>
                </div>
              </Popup>
            </Marker>
            {visibleResults.map((location) => (
              <ParkingMarker
                key={location.id}
                location={location}
                selected={location.id === selectedId}
                tracked={trackedById.get(location.id)}
                onSelect={() => selectParking(location.id)}
              />
            ))}
            <ZoomControl position="bottomright" />
          </MapContainer>
          <button
            className={`map-refresh-button ${parkingArea.dirty ? "is-dirty" : ""}`}
            onClick={refreshMapArea}
            disabled={parkingArea.loading || !parkingArea.viewport}
            aria-label="Refresh parking in this map area"
          >
            <RefreshCw size={16} className={parkingArea.loading ? "spin" : ""} />
            {parkingArea.loading ? "Refreshing…" : parkingArea.dirty ? "Refresh this area" : "Refresh"}
          </button>
          <button
            className="locate-button"
            onClick={locateMe}
            disabled={locating}
            aria-label="Use my current location"
            title="Use my current location"
          >
            {locating ? (
              <LoaderCircle size={21} className="spin" />
            ) : (
              <LocateFixed size={21} />
            )}
          </button>
          {(locationError || (tileErrors > 3 && !tilesLoaded)) && (
            <div className="map-error" role="alert">
              <Info size={16} />
              <span>
                {locationError ||
                  "Map tiles could not load. Check your connection; the parking list is still available."}
              </span>
              <button
                onClick={() => {
                  setLocationError("");
                  setTileErrors(0);
                }}
                aria-label="Dismiss map message"
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div
            className="map-legend occupancy-legend"
            aria-label="Occupancy color legend"
          >
            <strong>Occupancy</strong>
            <span className="occupancy-green">
              <i />
              0–49%
            </span>
            <span className="occupancy-yellow">
              <i />
              50–74%
            </span>
            <span className="occupancy-orange">
              <i />
              75–94%
            </span>
            <span className="occupancy-red">
              <i />
              95–100%
            </span>
            <span className="occupancy-untracked">
              <i />
              Not connected
            </span>
            {feedUnavailable && <span className="occupancy-unknown"><i /> Feed unavailable</span>}
          </div>
          <div className="map-corner-note">
            <Compass size={15} />
            <span>API occupancy · Simulated feed</span>
          </div>
        </section>
      </main>
      {demo && (
        <div className="demo-bottom-bar">
          <Sparkles size={15} />
          <p>
            PCC parking preview · Simulated API data updates every 5 seconds.
          </p>
          <Link to="/signup">
            Make yourself at home
            <ArrowRight size={15} />
          </Link>
        </div>
      )}
    </div>
    {navigationDestination && <NavigationView destination={navigationDestination} onClose={() => setNavigationDestination(null)} />}
    </>
  );
}
