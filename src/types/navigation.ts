import type { Coordinates } from "./parking";

export type NavigationStep = {
  instruction: string;
  road: string;
  maneuver: string;
  modifier: string;
  location: Coordinates;
  distanceFromStart: number;
};

export type NavigationRoute = {
  coordinates: Coordinates[];
  cumulativeDistances: number[];
  distance: number;
  duration: number;
  steps: NavigationStep[];
};

export type RouteProgress = {
  position: Coordinates;
  traveled: number;
  remaining: number;
  distanceToTurn: number;
  nextStep: NavigationStep;
  heading: number;
  offRouteDistance: number;
  arrived: boolean;
};

export type NavigationStatus = "idle" | "locating" | "routing" | "ready" | "navigating" | "arrived" | "error";
export type NavigationMode = "live" | "preview";

export type NavigationController = {
  status: NavigationStatus;
  mode: NavigationMode;
  route: NavigationRoute | null;
  progress: RouteProgress | null;
  position: Coordinates | null;
  heading: number;
  accuracy: number | null;
  error: string | null;
  notice: string | null;
  gpsStale: boolean;
  rerouting: boolean;
  paused: boolean;
  useLocation: () => void;
  preview: () => void;
  start: () => void;
  togglePause: () => void;
  stop: () => void;
};
