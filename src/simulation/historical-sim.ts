import type { ElevationGrid } from "../types/terrain.ts";
import type { SnowDepthGrid } from "../types/snow.ts";
import type { WindField, WindParams } from "../types/wind.ts";
import type { WeatherTimeSeries } from "../api/nve.ts";
import { solveWindField } from "./wind-solver.ts";
import { computeSnowAccumulation } from "./snow-model.ts";

export interface HistoricalStep {
  timestamp: Date;
  temp: number;
  precip: number;
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

// Wind direction difference accounting for wraparound
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

export async function runHistoricalSimulation(
  terrain: ElevationGrid,
  weather: WeatherTimeSeries,
  onProgress?: (stage: string, percent: number) => void,
): Promise<HistoricalStep[]> {
  const { rows, cols } = terrain;
  const cellCount = rows * cols;
  const steps: HistoricalStep[] = [];
  const accumulated = new Float64Array(cellCount);
  const len = weather.timestamps.length;

  // Pre-solve wind fields only at the original 3h data points,
  // and only when wind has changed significantly from the last solve
  console.log(`Historical sim: pre-solving wind fields for ${len} data points...`);
  const windFields: WindField[] = [];
  let lastSolvedDir = -999;
  let lastSolvedSpeed = -999;
  let lastWindField: WindField | null = null;

  for (let t = 0; t < len; t++) {
    const dir = weather.windDir[t];
    const spd = weather.windSpeed[t];

    if (
      !lastWindField ||
      angleDiff(lastSolvedDir, dir) > WIND_DIR_CHANGE_THRESHOLD ||
      Math.abs(lastSolvedSpeed - spd) > WIND_SPEED_CHANGE_THRESHOLD
    ) {
      const params: WindParams = { direction: dir, speed: spd, temperature: weather.temp[t] };
      lastWindField = solveWindField(terrain, params);
      lastSolvedDir = dir;
      lastSolvedSpeed = spd;
    }
    windFields.push(lastWindField);

    // Yield every 5 solves so UI stays responsive
    if (t % 5 === 0) {
      onProgress?.(`Computing wind fields... ${Math.round((t / len) * 100)}%`, (t / len) * 100);
      await yieldToUI();
    }
  }
  console.log(`Historical sim: ${new Set(windFields).size} unique wind solves (of ${len} data points)`);

  // Now generate sub-steps using pre-solved wind fields
  for (let t = 0; t < len - 1; t++) {
    for (let s = 0; s < SUB_STEPS; s++) {
      const frac = s / SUB_STEPS;

      const temp = lerp(weather.temp[t], weather.temp[t + 1], frac);
      const windSpeed = lerp(weather.windSpeed[t], weather.windSpeed[t + 1], frac);
      const windDir = interpolateAngle(weather.windDir[t], weather.windDir[t + 1], frac);
      const precip = weather.precip[t] / SUB_STEPS;
      const timestamp = new Date(weather.timestamps[t].getTime() + frac * THREE_HOURS_MS);

      // Use the wind field from the nearest original data point
      const windField = frac < 0.5 ? windFields[t] : windFields[t + 1];
      const params: WindParams = { direction: windDir, speed: windSpeed, temperature: temp };

      if (temp <= 0 && precip > 0) {
        const snowfallCm = precip * SNOW_WATER_RATIO / 10;
        const delta = computeSnowAccumulation(terrain, windField, params, snowfallCm);
        for (let i = 0; i < cellCount; i++) {
          accumulated[i] += delta.depth[i];
        }
      } else if (temp > 0) {
        const meltMm = Math.max(0, temp) * (MELT_DEGREE_FACTOR / SUB_STEPS) + precip * RAIN_MELT_FACTOR;
        const meltCm = meltMm * 0.1;
        for (let i = 0; i < cellCount; i++) {
          accumulated[i] = Math.max(0, accumulated[i] - meltCm);
        }
      }

      steps.push({
        timestamp,
        temp,
        precip,
        windSpeed,
        windDir,
        snowGrid: { depth: new Float64Array(accumulated), isPowderZone: new Uint8Array(cellCount), rows, cols },
        windField,
      });
    }
  }

  // Final data point
  if (len > 0) {
    const t = len - 1;
    const temp = weather.temp[t];
    const precip = weather.precip[t];
    const windSpeed = weather.windSpeed[t];
    const windDir = weather.windDir[t];
    const windField = windFields[t];
    const params: WindParams = { direction: windDir, speed: windSpeed, temperature: temp };

    if (temp <= 0 && precip > 0) {
      const snowfallCm = precip * SNOW_WATER_RATIO / 10;
      const delta = computeSnowAccumulation(terrain, windField, params, snowfallCm);
      for (let i = 0; i < cellCount; i++) {
        accumulated[i] += delta.depth[i];
      }
    } else if (temp > 0) {
      const meltMm = Math.max(0, temp) * MELT_DEGREE_FACTOR + precip * RAIN_MELT_FACTOR;
      const meltCm = meltMm * 0.1;
      for (let i = 0; i < cellCount; i++) {
        accumulated[i] = Math.max(0, accumulated[i] - meltCm);
      }
    }

    steps.push({
      timestamp: weather.timestamps[t],
      temp, precip, windSpeed, windDir,
      snowGrid: { depth: new Float64Array(accumulated), isPowderZone: new Uint8Array(cellCount), rows, cols },
      windField,
    });
  }

  console.log(`Historical sim: ${steps.length} steps computed (${SUB_STEPS} sub-steps per 3h interval)`);
  return steps;
}
