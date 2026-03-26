/** Parsed RegObs observation with only the fields we need */
export interface RegObsObservation {
  id: number;
  lat: number;
  lng: number;
  timestamp: string; // ISO 8601
  competencyLevel: number; // 1-5
  elevation?: number;
  nickName?: string;
  registrations: {
    snowSurface?: { surfaceType: string; driftName?: string; comment?: string };
    dangerSigns?: { signs: string[]; comment?: string };
    avalancheObs?: { size: string; trigger: string; type: string; comment?: string };
    avalancheActivity?: { entries: { type: string; trigger: string; size: string }[] };
    avalancheEval?: { dangerLevel: string; evaluation?: string; development?: string; forecastComment?: string };
    weather?: { temp?: number; precipName?: string; windSpeedName?: string; windDirName?: string; cloudCoverName?: string; comment?: string };
    general?: { comment?: string };
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
  dataNotice: string;
  windTransport: string;
  surfaceConditions: string;
  stabilityConcerns: string;
}
