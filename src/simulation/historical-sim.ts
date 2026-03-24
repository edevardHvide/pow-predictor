import type { ElevationGrid } from "../types/terrain.ts";
import type { SnowDepthGrid } from "../types/snow.ts";
import type { WindField, WindParams } from "../types/wind.ts";
import type { SpatialWeatherTimeSeries, WeatherStation } from "../api/nve.ts";
import { solveWindField } from "./wind-solver.ts";
import { computeSnowAccumulation } from "./snow-model.ts";

export interface HistoricalStep {
  timestamp: Date;
  temp: number;        // domain-average for display
  precip: number;      // domain-average for display
  windSpeed: number;
  windDir: number;
  snowGrid: SnowDepthGrid;
  windField: WindField;
}

const SNOW_WATER_RATIO = 10; // 1mm water = 10mm (1cm) snow
const MELT_DEGREE_FACTOR = 0.5; // mm water equiv per °C per 3h step
const RAIN_MELT_FACTOR = 0.2; // mm additional melt per mm rain
const SUB_STEPS = 4; // sub-steps per 3h interval for smooth playback
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

const WIND_DIR_CHANGE_THRESHOLD = 15; // degrees
const WIND_SPEED_CHANGE_THRESHOLD = 2; // m/s

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolateAngle(a: number, b: number, t: number): number {
  let diff = ((b - a) % 360 + 540) % 360 - 180;
  return ((a + diff * t) % 360 + 360) % 360;
}

function angleDiff(a: number, b: number): number {
  return Math.abs(((b - a) % 360 + 540) % 360 - 180);
}

// Yield to the event loop so UI can update
const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0));

// ── IDW interpolation with lapse-rate downscaling ────

// Environmental lapse rate: -6.5°C per 1000m elevation gain
const LAPSE_RATE = -6.5 / 1000;
// Orographic precipitation enhancement: +8% per 100m above reference
const PRECIP_ELEV_FACTOR = 0.08 / 100;

interface IDWWeights {
  /** For each grid cell: array of { stationIndex, weight } */
  cellWeights: { idx: number; w: number }[][];
  /** IDW-weighted station altitude per cell (for lapse-rate correction) */
  refAltitude: Float64Array;
  rows: number;
  cols: number;
}

/**
 * Precompute inverse-distance-weighted interpolation weights
 * from grid cells to weather stations. Also precomputes the
 * IDW-weighted reference altitude per cell for lapse rate correction.
 */
function computeIDWWeights(
  terrain: ElevationGrid,
  stations: WeatherStation[],
): IDWWeights {
  const { rows, cols, bbox } = terrain;
  const n = rows * cols;
  const cellWeights: { idx: number; w: number }[][] = new Array(n);
  const refAltitude = new Float64Array(n);
  const power = 2;

  if (stations.length === 1) {
    const entry = [{ idx: 0, w: 1.0 }];
    const alt = stations[0].altitude;
    for (let i = 0; i < n; i++) {
      cellWeights[i] = entry;
      refAltitude[i] = alt;
    }
    return { cellWeights, refAltitude, rows, cols };
  }

  for (let r = 0; r < rows; r++) {
    const lat = bbox.south + ((r + 0.5) / rows) * (bbox.north - bbox.south);
    for (let c = 0; c < cols; c++) {
      const lng = bbox.west + ((c + 0.5) / cols) * (bbox.east - bbox.west);
      const gi = r * cols + c;

      let totalW = 0;
      const weights: { idx: number; w: number }[] = [];

      for (let s = 0; s < stations.length; s++) {
        const dlat = lat - stations[s].lat;
        const dlng = (lng - stations[s].lng) * Math.cos(lat * Math.PI / 180);
        const dist2 = dlat * dlat + dlng * dlng;

        if (dist2 < 1e-10) {
          weights.length = 0;
          weights.push({ idx: s, w: 1.0 });
          totalW = 1.0;
          break;
        }

        const w = 1.0 / Math.pow(dist2, power / 2);
        weights.push({ idx: s, w });
        totalW += w;
      }

      // Normalize
      for (const entry of weights) entry.w /= totalW;
      cellWeights[gi] = weights;

      // Precompute IDW-weighted reference altitude
      let alt = 0;
      for (const { idx, w } of weights) alt += stations[idx].altitude * w;
      refAltitude[gi] = alt;
    }
  }

  return { cellWeights, refAltitude, rows, cols };
}

/**
 * Interpolate temperature at timestep t with lapse-rate correction.
 * 1. IDW-interpolate from station temperatures
 * 2. Adjust for elevation difference: cell altitude vs IDW-weighted station altitude
 */
function interpolateTemp(
  stations: WeatherStation[],
  t: number,
  terrain: ElevationGrid,
  idw: IDWWeights,
): Float64Array {
  const n = idw.rows * idw.cols;
  const result = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let val = 0;
    for (const { idx, w } of idw.cellWeights[i]) {
      val += stations[idx].temp[t] * w;
    }
    // Lapse rate correction: cooler at higher elevation, warmer in valleys
    const dElev = terrain.heights[i] - idw.refAltitude[i];
    result[i] = val + dElev * LAPSE_RATE;
  }
  return result;
}

/** Interpolate temperature between two timesteps with lapse-rate correction */
function interpolateTempLerp(
  stations: WeatherStation[],
  t0: number,
  t1: number,
  frac: number,
  terrain: ElevationGrid,
  idw: IDWWeights,
): Float64Array {
  const n = idw.rows * idw.cols;
  const result = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let v0 = 0, v1 = 0;
    for (const { idx, w } of idw.cellWeights[i]) {
      v0 += stations[idx].temp[t0] * w;
      v1 += stations[idx].temp[t1] * w;
    }
    const base = v0 + (v1 - v0) * frac;
    const dElev = terrain.heights[i] - idw.refAltitude[i];
    result[i] = base + dElev * LAPSE_RATE;
  }
  return result;
}

/**
 * Interpolate precipitation at timestep t with orographic enhancement.
 * Higher terrain cells get proportionally more precipitation.
 */
function interpolatePrecip(
  stations: WeatherStation[],
  t: number,
  terrain: ElevationGrid,
  idw: IDWWeights,
): Float64Array {
  const n = idw.rows * idw.cols;
  const result = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let val = 0;
    for (const { idx, w } of idw.cellWeights[i]) {
      val += stations[idx].precip[t] * w;
    }
    // Orographic enhancement: more precip at higher elevations
    const dElev = terrain.heights[i] - idw.refAltitude[i];
    const factor = 1 + Math.max(dElev, 0) * PRECIP_ELEV_FACTOR;
    result[i] = val * factor;
  }
  return result;
}

/** Domain-average of a station field at timestep t */
function stationMean(
  stations: WeatherStation[],
  field: "temp" | "precip" | "windSpeed" | "windDir",
  t: number,
): number {
  let sum = 0;
  for (const s of stations) sum += s[field][t];
  return sum / stations.length;
}

/**
 * Altitude-corrected wind speed for the solver.
 * Uses highest-altitude station wind as base, since ridges/peaks see
 * free-atmosphere wind. The solver adds sheltering via Sx.
 * If multiple high stations exist, average them to smooth outliers.
 */
function stationWindForSolver(
  stations: WeatherStation[],
  t: number,
): number {
  if (stations.length <= 1) return stations[0]?.windSpeed[t] ?? 0;

  // Sort stations by altitude descending, take top 1/3 (at least 1)
  const sorted = [...stations].sort((a, b) => b.altitude - a.altitude);
  const topCount = Math.max(1, Math.floor(stations.length / 3));
  let sum = 0;
  for (let i = 0; i < topCount; i++) sum += sorted[i].windSpeed[t];
  return sum / topCount;
}


/** Domain-average wind direction (circular mean) */
function stationMeanWindDir(stations: WeatherStation[], t: number): number {
  let sinSum = 0, cosSum = 0;
  for (const s of stations) {
    const rad = s.windDir[t] * Math.PI / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  return ((Math.atan2(sinSum, cosSum) * 180 / Math.PI) + 360) % 360;
}

export async function runHistoricalSimulation(
  terrain: ElevationGrid,
  weather: SpatialWeatherTimeSeries,
  onProgress?: (stage: string, percent: number) => void,
): Promise<HistoricalStep[]> {
  const { rows, cols } = terrain;
  const cellCount = rows * cols;
  const steps: HistoricalStep[] = [];
  const accumulated = new Float64Array(cellCount);
  const len = weather.timestamps.length;
  const stations = weather.stations;

  // Precompute IDW weights
  const idw = computeIDWWeights(terrain, stations);
  console.log(`Historical sim: ${stations.length} weather stations, IDW weights computed`);

  // Pre-solve wind fields at original 3h data points
  // Wind: use highest-altitude stations for solver input (represents free-atmosphere wind)
  // The solver adds terrain sheltering/exposure via Winstral Sx
  console.log(`Historical sim: pre-solving wind fields for ${len} data points...`);
  const windFields: WindField[] = [];
  let lastSolvedDir = -999;
  let lastSolvedSpeed = -999;
  let lastWindField: WindField | null = null;

  for (let t = 0; t < len; t++) {
    const dir = stationMeanWindDir(stations, t);
    const spd = stationWindForSolver(stations, t);

    if (
      !lastWindField ||
      angleDiff(lastSolvedDir, dir) > WIND_DIR_CHANGE_THRESHOLD ||
      Math.abs(lastSolvedSpeed - spd) > WIND_SPEED_CHANGE_THRESHOLD
    ) {
      const avgTemp = stationMean(stations, "temp", t);
      const params: WindParams = { direction: dir, speed: spd, temperature: avgTemp };
      lastWindField = solveWindField(terrain, params);
      lastSolvedDir = dir;
      lastSolvedSpeed = spd;
    }
    windFields.push(lastWindField);

    if (t % 5 === 0) {
      onProgress?.(`Computing wind fields... ${Math.round((t / len) * 100)}%`, (t / len) * 100);
      await yieldToUI();
    }
  }
  console.log(`Historical sim: ${new Set(windFields).size} unique wind solves (of ${len} data points)`);

  // Generate sub-steps with spatially-interpolated weather
  for (let t = 0; t < len - 1; t++) {
    for (let s = 0; s < SUB_STEPS; s++) {
      const frac = s / SUB_STEPS;

      // Domain averages for display and wind solver
      const avgTemp = lerp(stationMean(stations, "temp", t), stationMean(stations, "temp", t + 1), frac);
      const avgPrecip = stationMean(stations, "precip", t) / SUB_STEPS;
      const avgWindSpeed = lerp(stationMean(stations, "windSpeed", t), stationMean(stations, "windSpeed", t + 1), frac);
      const avgWindDir = interpolateAngle(
        stationMeanWindDir(stations, t),
        stationMeanWindDir(stations, t + 1),
        frac,
      );
      const timestamp = new Date(weather.timestamps[t].getTime() + frac * THREE_HOURS_MS);

      const windField = frac < 0.5 ? windFields[t] : windFields[t + 1];
      const params: WindParams = { direction: avgWindDir, speed: avgWindSpeed, temperature: avgTemp };

      // Per-cell interpolated temp (with lapse-rate) and precip (with orographic enhancement)
      const cellTemp = interpolateTempLerp(stations, t, t + 1, frac, terrain, idw);
      const cellPrecip = interpolatePrecip(stations, t, terrain, idw);

      // Apply snowfall/melt per cell using spatially-varying weather
      // Build per-cell snowfall array: only where temp <= 0 and precip > 0
      let hasSnow = false;
      let hasMelt = false;
      const cellSnowfall = new Float64Array(cellCount);

      for (let i = 0; i < cellCount; i++) {
        const temp_i = cellTemp[i];
        const precip_i = cellPrecip[i] / SUB_STEPS;

        if (temp_i <= 0 && precip_i > 0) {
          cellSnowfall[i] = precip_i * SNOW_WATER_RATIO / 10;
          hasSnow = true;
        } else if (temp_i > 0) {
          // Melt directly
          const meltMm = Math.max(0, temp_i) * (MELT_DEGREE_FACTOR / SUB_STEPS) + precip_i * RAIN_MELT_FACTOR;
          const meltCm = meltMm * 0.1;
          accumulated[i] = Math.max(0, accumulated[i] - meltCm);
          hasMelt = true;
        }
      }

      if (hasSnow) {
        const delta = computeSnowAccumulation(terrain, windField, params, cellSnowfall);
        for (let i = 0; i < cellCount; i++) {
          accumulated[i] += delta.depth[i];
        }
      }

      // For cells above freezing that didn't get snow, melt was already applied above
      // (hasMelt branch in the per-cell loop)
      void hasMelt;

      steps.push({
        timestamp,
        temp: avgTemp,
        precip: avgPrecip,
        windSpeed: avgWindSpeed,
        windDir: avgWindDir,
        snowGrid: { depth: new Float64Array(accumulated), isPowderZone: new Uint8Array(cellCount), rows, cols },
        windField,
      });
    }
  }

  // Final data point
  if (len > 0) {
    const t = len - 1;
    const avgTemp = stationMean(stations, "temp", t);
    const avgPrecip = stationMean(stations, "precip", t);
    const avgWindSpeed = stationMean(stations, "windSpeed", t);
    const avgWindDir = stationMeanWindDir(stations, t);
    const windField = windFields[t];
    const params: WindParams = { direction: avgWindDir, speed: avgWindSpeed, temperature: avgTemp };

    const cellTemp = interpolateTemp(stations, t, terrain, idw);
    const cellPrecip = interpolatePrecip(stations, t, terrain, idw);

    let hasSnow = false;
    const cellSnowfall = new Float64Array(cellCount);

    for (let i = 0; i < cellCount; i++) {
      const temp_i = cellTemp[i];
      const precip_i = cellPrecip[i];

      if (temp_i <= 0 && precip_i > 0) {
        cellSnowfall[i] = precip_i * SNOW_WATER_RATIO / 10;
        hasSnow = true;
      } else if (temp_i > 0) {
        const meltMm = Math.max(0, temp_i) * MELT_DEGREE_FACTOR + precip_i * RAIN_MELT_FACTOR;
        const meltCm = meltMm * 0.1;
        accumulated[i] = Math.max(0, accumulated[i] - meltCm);
      }
    }

    if (hasSnow) {
      const delta = computeSnowAccumulation(terrain, windField, params, cellSnowfall);
      for (let i = 0; i < cellCount; i++) {
        accumulated[i] += delta.depth[i];
      }
    }

    steps.push({
      timestamp: weather.timestamps[t],
      temp: avgTemp,
      precip: avgPrecip,
      windSpeed: avgWindSpeed,
      windDir: avgWindDir,
      snowGrid: { depth: new Float64Array(accumulated), isPowderZone: new Uint8Array(cellCount), rows, cols },
      windField,
    });
  }

  console.log(`Historical sim: ${steps.length} steps computed (${SUB_STEPS} sub-steps per 3h interval)`);
  return steps;
}
