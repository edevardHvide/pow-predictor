/** Parsed RegObs observation with only the fields we need */
export interface RegObsObservation {
  id: number;
  lat: number;
  lng: number;
  timestamp: string; // ISO 8601
  competencyLevel: number; // 1-5
  elevation?: number;
  registrations: {
    driftObs?: { driftCategory: string; comment?: string };
    snowSurface?: { surfaceType: string; comment?: string };
    dangerSigns?: { signs: string[]; comment?: string };
    avalancheActivity?: { type: string; trigger: string; comment?: string };
    weather?: { comment?: string };
  };
}

/** Observation enriched with relevance data */
export interface ScoredObservation {
  observation: RegObsObservation;
  relevance: number; // 0-1
  distanceKm: number;
  elevationDiff: number;
  aspectDiff: number; // radians
  hoursAgo: number;
}

/** Varsom avalanche forecast */
export interface VarsomForecast {
  dangerLevel: number; // 1-5
  dangerLevelName: string;
  avalancheProblems: string[];
  mountainWeather: string;
  validFrom: string;
  validTo: string;
}

/** Point characteristics from terrain grid */
export interface TerrainPoint {
  lat: number;
  lng: number;
  elevation: number;
  aspect: number; // radians, 0=N clockwise
  slope: number; // radians
}

/** Request body to POST /api/conditions-summary */
export interface ConditionsSummaryRequest {
  point: TerrainPoint;
  observations: ScoredObservation[];
  forecast: VarsomForecast | null;
}

/** Response from /api/conditions-summary */
export interface ConditionsSummary {
  windTransport: string;
  surfaceConditions: string;
  stabilityConcerns: string;
  confidence: string;
}
