import type { RegObsObservation, ScoredObservation, TerrainPoint } from "../types/conditions";

/**
 * Compute aspect and slope for a single grid cell using central finite differences.
 * Same math as terrain-processing.ts computeDerivatives, but for one cell only.
 */
export function computeCellAspectSlope(
  heights: Float64Array,
  rows: number,
  cols: number,
  cellSize: number,
  row: number,
  col: number,
): { aspect: number; slope: number } {
  const left = heights[row * cols + Math.max(0, col - 1)];
  const right = heights[row * cols + Math.min(cols - 1, col + 1)];
  const below = heights[Math.max(0, row - 1) * cols + col];
  const above = heights[Math.min(rows - 1, row + 1) * cols + col];

  const dzdx = (right - left) / (2 * cellSize);
  const dzdy = (above - below) / (2 * cellSize);

  const slope = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
  let aspect = Math.atan2(-dzdx, -dzdy);
  if (aspect < 0) aspect += 2 * Math.PI;

  return { aspect, slope };
}

/** Haversine distance in km between two lat/lng points */
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Aspect similarity: cosine of angular difference, 0-1 */
function aspectScore(a1: number, a2: number): number {
  return (1 + Math.cos(a1 - a2)) / 2;
}

/** Gaussian decay: exp(-d^2 / (2 * sigma^2)) */
function gaussianDecay(d: number, sigma: number): number {
  return Math.exp(-(d * d) / (2 * sigma * sigma));
}

/** Exponential decay with half-life in hours */
function recencyScore(hoursAgo: number): number {
  return Math.exp(-hoursAgo * Math.LN2 / 24);
}

/**
 * Score a single observation for relevance to a terrain point.
 * Returns null if below minRelevance threshold.
 */
export function scoreObservation(
  point: TerrainPoint,
  obs: RegObsObservation,
  obsAspect: number | null, // null if outside grid
  obsElevation: number,
  now: Date,
  minRelevance: number = 0.01,
): ScoredObservation | null {
  const dist = distanceKm(point.lat, point.lng, obs.lat, obs.lng);
  const elevDiff = Math.abs(point.elevation - obsElevation);
  const hoursAgo = (now.getTime() - new Date(obs.timestamp).getTime()) / (1000 * 60 * 60);

  const aScore = obsAspect !== null ? aspectScore(point.aspect, obsAspect) : 0.7;
  const eScore = gaussianDecay(elevDiff, 500);
  const rScore = recencyScore(hoursAgo);
  const pScore = gaussianDecay(dist, 30);

  // Combined: aspect * elevation * recency * proximity (moderate exponents)
  const relevance = Math.pow(aScore, 1.0) * Math.pow(eScore, 0.8) * rScore * Math.pow(pScore, 0.5);

  if (relevance < minRelevance) return null;

  return {
    observation: obs,
    relevance,
    distanceKm: dist,
    elevationDiff: elevDiff,
    aspectDiff: obsAspect !== null ? Math.acos(Math.cos(point.aspect - obsAspect)) : NaN,
    hoursAgo,
  };
}

/**
 * Score and filter observations, returning top N sorted by relevance.
 */
export function scoreAndFilterObservations(
  point: TerrainPoint,
  observations: RegObsObservation[],
  heights: Float64Array,
  rows: number,
  cols: number,
  cellSize: number,
  bbox: { north: number; south: number; east: number; west: number },
  now: Date = new Date(),
  maxResults: number = 25,
): ScoredObservation[] {
  const scored: ScoredObservation[] = [];

  for (const obs of observations) {
    const obsRow = Math.round(((obs.lat - bbox.south) / (bbox.north - bbox.south)) * rows - 0.5);
    const obsCol = Math.round(((obs.lng - bbox.west) / (bbox.east - bbox.west)) * cols - 0.5);

    let obsAspect: number | null = null;
    let obsElevation = obs.elevation ?? 0;

    if (obsRow >= 0 && obsRow < rows && obsCol >= 0 && obsCol < cols) {
      const gi = obsRow * cols + obsCol;
      obsElevation = heights[gi];
      const { aspect } = computeCellAspectSlope(heights, rows, cols, cellSize, obsRow, obsCol);
      obsAspect = aspect;
    }

    const result = scoreObservation(point, obs, obsAspect, obsElevation, now);
    if (result) scored.push(result);
  }

  scored.sort((a, b) => b.relevance - a.relevance);
  return scored.slice(0, maxResults);
}
