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

export function runHistoricalSimulation(
  terrain: ElevationGrid,
  weather: WeatherTimeSeries,
): HistoricalStep[] {
  const { rows, cols } = terrain;
  const steps: HistoricalStep[] = [];
  const accumulated = new Float64Array(rows * cols);

  for (let t = 0; t < weather.timestamps.length; t++) {
    const temp = weather.temp[t];
    const precip = weather.precip[t];
    const windSpeed = weather.windSpeed[t];
    const windDir = weather.windDir[t];

    const params: WindParams = { direction: windDir, speed: windSpeed, temperature: temp };
    const windField = solveWindField(terrain, params);

    if (temp <= 0 && precip > 0) {
      // Snow accumulation: convert mm precipitation to cm snow
      const snowfallCm = precip * SNOW_WATER_RATIO / 10; // mm * 10 / 10 = mm → cm
      const delta = computeSnowAccumulation(terrain, windField, params, snowfallCm);

      for (let i = 0; i < rows * cols; i++) {
        accumulated[i] += delta.depth[i];
      }
    } else if (temp > 0) {
      // Rain-on-snow melt
      const meltMm = Math.max(0, temp) * MELT_DEGREE_FACTOR + precip * RAIN_MELT_FACTOR;
      const meltCm = meltMm * 0.1; // mm water → cm snow (roughly)

      for (let i = 0; i < rows * cols; i++) {
        accumulated[i] = Math.max(0, accumulated[i] - meltCm);
      }
    }
    // If temp <= 0 and precip == 0: nothing happens, snow stays

    // Build snapshot for this step
    const depth = new Float64Array(accumulated);
    const isPowderZone = new Uint8Array(rows * cols);

    // Mark powder zones: cold, sheltered, skiable slopes with snow
    if (temp <= -5) {
      const slopes = terrain.slopes;
      for (let i = 0; i < rows * cols; i++) {
        const slopeDeg = slopes[i] * (180 / Math.PI);
        if (depth[i] > 5 && slopeDeg >= 25 && slopeDeg <= 45) {
          isPowderZone[i] = 1;
        }
      }
    }

    steps.push({
      timestamp: weather.timestamps[t],
      temp,
      precip,
      windSpeed,
      windDir,
      snowGrid: { depth, isPowderZone, rows, cols },
      windField,
    });
  }

  console.log(`Historical sim: ${steps.length} steps computed`);
  return steps;
}
