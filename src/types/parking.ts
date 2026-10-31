export type Coordinates = { lat: number; lng: number };
export type ParkingType = "lot" | "street";

export interface ParkingLocation {
  id: string;
  name: string;
  address: string;
  coordinates: Coordinates;
  type: ParkingType;
  kind: "Garage" | "Parking lot" | "Street parking";
  pricePerHour: number | null;
  accessLabel?: string;
  parkingFeeLabel?: string;
  permitPurchaseUrl?: string;
  maxDurationMinutes: number | null;
  openingHours: string | null;
  availability: string | null;
  restrictionsVerified: boolean;
  source: "demonstration" | "verified-provider" | "openstreetmap";
}

export interface Destination extends Coordinates {
  name: string;
  address: string;
}

export interface ParkingPreferences {
  type?: ParkingType;
  freeOnly: boolean;
  cheapest: boolean;
  verifiedOnly: boolean;
  durationMinutes?: number;
  walkingTimeRequested: boolean;
  recognized: boolean;
}

export interface RankedParking extends ParkingLocation {
  distanceMeters: number;
}
