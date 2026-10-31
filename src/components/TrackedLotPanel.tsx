import { useState } from "react";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  Clock3,
  Layers3,
  Navigation2,
  Radio,
} from "lucide-react";
import type { RankedParking } from "../types/parking";
import ParkingTerms from "./ParkingTerms";
import { occupancyLabel, type TrackedLot } from "../services/trackedParking";
import "../styles/tracked-parking.css";

type TrackedLotPanelProps = {
  location: RankedParking;
  lot: TrackedLot;
  ageSeconds: number | null;
  onBack: () => void;
  onNavigate: () => void;
  stale: boolean;
  feedError?: string | null;
};

export default function TrackedLotPanel({
  location,
  lot,
  ageSeconds,
  onBack,
  onNavigate,
  stale,
  feedError,
}: TrackedLotPanelProps) {
  const [expanded, setExpanded] = useState<{
    lotId: string;
    levelId: string;
  } | null>(null);
  const updatedLabel =
    ageSeconds === null
      ? "Waiting for an update"
      : ageSeconds < 2
        ? "Updated just now"
        : `Updated ${ageSeconds}s ago`;

  return (
    <section
      className="tracked-detail"
      aria-label={`${location.name} occupancy`}
    >
      <div className="tracked-toolbar">
        <button className="tracked-back" onClick={onBack}>
          <ArrowLeft size={16} /> All parking
        </button>
        <span
          className={`tracked-api-badge ${stale || feedError ? "is-delayed" : ""}`}
        >
          <span />{" "}
          {lot.updatedAt === null
            ? "Waiting for feed"
            : stale
              ? "Feed delayed"
              : feedError
                ? "Reconnecting"
                : "API connected"}{" "}
          · simulated
        </span>
      </div>

      <div className="tracked-detail-heading">
        <span className={`tracked-garage-icon occupancy-${lot.band}`}>
          <Building2 size={24} strokeWidth={1.6} />
        </span>
        <div>
          <h2>{location.name}</h2>
          <p className="tracked-address">{location.address}</p>
        </div>
      </div>

      <div className={`tracked-summary occupancy-${lot.band}`}>
        <div className="tracked-summary-top">
          <span>Lot occupancy</span>
          <strong>{occupancyLabel(lot)}</strong>
        </div>
        <div className="tracked-summary-counts">
          <div>
            <strong>{lot.occupied ?? "—"}</strong>
            <span>/ {lot.capacity} parked</span>
          </div>
          <div className="tracked-available">
            <strong>{lot.available ?? "—"}</strong>
            <span>spaces free</span>
          </div>
        </div>
        <div className="tracked-meter" aria-hidden="true">
          <span style={{ width: `${lot.percent ?? 0}%` }} />
        </div>
        <div className="tracked-summary-bottom">
          <span>
            {lot.percent === null
              ? "Occupancy unknown"
              : `${Math.round(lot.percent)}% full`}
          </span>
          <span>
            <Clock3 size={11} /> {updatedLabel}
          </span>
        </div>
        <ParkingTerms location={location} footerAction={
          <button type="button" className="parking-go-button" onClick={onNavigate}
            aria-label={`Go to ${location.name}`}>
            <Navigation2 size={17} aria-hidden="true" /> Go
          </button>
        } />
      </div>

      <div className="tracked-levels-heading">
        <h3>
          <Layers3 size={15} /> Parking levels
        </h3>
        <span>{lot.levels.length} levels</span>
      </div>
      <p className="tracked-level-hint">
        Choose a level to see its available spaces.
      </p>

      <div className="tracked-level-list">
        {lot.levels.map((level) => {
          const isExpanded =
            expanded?.lotId === lot.id && expanded.levelId === level.id;
          const gridId = `spaces-${level.id}`;
          return (
            <article
              className={`tracked-level occupancy-${level.band} ${isExpanded ? "is-expanded" : ""}`}
              key={level.id}
            >
              <button
                className="tracked-level-toggle"
                aria-expanded={isExpanded}
                aria-controls={gridId}
                onClick={() =>
                  setExpanded(
                    isExpanded ? null : { lotId: lot.id, levelId: level.id },
                  )
                }
              >
                <span className="tracked-level-main">
                  <span className="tracked-level-number">
                    <small>LEVEL</small>
                    <strong>{String(level.level).padStart(2, "0")}</strong>
                  </span>
                  <span className="tracked-level-count">
                    <span>
                      <strong>{level.occupied ?? "—"}</strong> /{" "}
                      {level.capacity}
                    </span>
                    <small>cars parked</small>
                  </span>
                  <ChevronDown className="tracked-level-chevron" size={17} />
                </span>
                <span className="tracked-meter" aria-hidden="true">
                  <span style={{ width: `${level.percent ?? 0}%` }} />
                </span>
                <span className="tracked-level-status">
                  <span>
                    {level.percent === null
                      ? "Occupancy unknown"
                      : `${Math.round(level.percent)}% full`}
                  </span>
                  <strong>
                    {level.available === null
                      ? "Availability unknown"
                      : level.available === 0
                        ? "Full"
                        : `${level.available} spaces free`}
                  </strong>
                </span>
              </button>
              <div
                id={gridId}
                className="tracked-space-detail"
                hidden={!isExpanded}
              >
                <div className="tracked-space-heading">
                  <span>
                    LEVEL {String(level.level).padStart(2, "0")} · SPACES
                  </span>
                  <span>Illustrative layout</span>
                </div>
                <div
                  className="tracked-space-grid"
                  role="list"
                  aria-label={`Level ${level.level} parking spaces`}
                >
                  {level.spaces.map((space) => (
                    <span
                      key={space.id}
                      className={`tracked-space is-${space.status}`}
                      role="listitem"
                      aria-label={`Space ${space.number}: ${space.status === "free" ? "available" : space.status}`}
                      title={`Space ${space.number} · ${space.status === "free" ? "Available" : space.status === "occupied" ? "Occupied" : "Unknown"}`}
                    >
                      <span aria-hidden="true">
                        {String(space.number).padStart(2, "0")}
                      </span>
                      <i aria-hidden="true" />
                    </span>
                  ))}
                </div>
                <div className="tracked-space-legend" aria-hidden="true">
                  <span>
                    <i className="is-free" />
                    Free
                  </span>
                  <span>
                    <i className="is-occupied" />
                    Occupied
                  </span>
                  <span>
                    <i className="is-unknown" />
                    Unknown
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <p
        className={`tracked-feed-note ${stale || feedError ? "is-delayed" : ""}`}
      >
        <Radio size={14} />
        <span>
          {stale
            ? "Updates are delayed. Availability stays unknown until a fresh update arrives."
            : feedError
              ? "Connection interrupted. Showing the last observation; stale counts become unknown."
              : "Simulated API feed · refreshes every 5 seconds. Levels and counts are illustrative."}
        </span>
      </p>
    </section>
  );
}
