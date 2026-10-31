import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import type { ParkingLocation } from "../types/parking";

export default function ParkingTerms({ location, compact = false, footerAction }: {
  location: ParkingLocation;
  compact?: boolean;
  footerAction?: ReactNode;
}) {
  return (
    <span className={`parking-terms ${compact ? "is-compact" : ""}`}>
      <span className="parking-term"><span>Access</span><strong>{location.accessLabel || "Unknown"}</strong></span>
      <span className="parking-term">
        <span>Parking fee</span>
        <strong>
          {location.parkingFeeLabel || "Unknown"}
          {!compact && location.permitPurchaseUrl && (
            <span className="parking-permit-purchase">
              <a href={location.permitPurchaseUrl} target="_blank" rel="noopener noreferrer">
                Buy student parking permit <ExternalLink size={12} aria-hidden="true" />
              </a>
              <small>PayMyCite · PCC semester parking permit.</small>
            </span>
          )}
        </strong>
      </span>
      {footerAction ? (
        <span className="parking-terms-footer">
          {location.source === "demonstration" && <small>Demo access & pricing</small>}
          {footerAction}
        </span>
      ) : location.source === "demonstration" && <small>Demo access & pricing</small>}
    </span>
  );
}
