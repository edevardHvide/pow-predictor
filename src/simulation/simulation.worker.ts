/// <reference lib="webworker" />
// src/simulation/simulation.worker.ts
declare const self: DedicatedWorkerGlobalScope;

import type { ElevationGrid } from "../types/terrain.ts";
import type { WorkerRequest, HistoricalStepData } from "./worker-protocol.ts";
import { computeDerivatives, precomputeSxSectors } from "./terrain-processing.ts";
import { solveWindField } from "./wind-solver.ts";
import { computeSnowAccumulation } from "./snow-model.ts";
import { runHistoricalSimulation } from "./historical-sim.ts";
import type { SpatialWeatherTimeSeries, WeatherStation } from "../api/nve.ts";

let terrain: ElevationGrid | null = null;
let cancelled = false;

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    const msg = e.data;

    if (msg.type === "cancel") {
      cancelled = true;
      return;
    }

    if (msg.type === "init-terrain") {
      const { heights, rows, cols, bbox, cellSizeMeters } = msg;
      const n = rows * cols;

      const slopes = new Float64Array(n);
      const aspects = new Float64Array(n);
      const normalsX = new Float64Array(n);
      const normalsY = new Float64Array(n);
      const normalsZ = new Float64Array(n);
      computeDerivatives(heights, rows, cols, cellSizeMeters, slopes, aspects, normalsX, normalsY, normalsZ);

      const sxSectors = precomputeSxSectors(heights, rows, cols, cellSizeMeters);

      terrain = { heights, rows, cols, bbox, cellSizeMeters, slopes, aspects, normalsX, normalsY, normalsZ, sxSectors };
      self.postMessage({ type: "terrain-ready" });
    }

    else if (msg.type === "run-simulation") {
      if (!terrain) throw new Error("Terrain not initialized");
      const windField = solveWindField(terrain, msg.params, msg.overrides);

      // Simulate a 24h storm: spread total snowfall over 8 sub-steps
      // so redistribution compounds realistically (like historical mode)
      const EXPLORATION_STEPS = 8;
      const { rows, cols } = terrain;
      const cellCount = rows * cols;
      const totalCm = msg.overrides?.BASE_SNOWFALL_CM ?? 50;
      const perStepCm = totalCm / EXPLORATION_STEPS;
      const accumulated = new Float64Array(cellCount);

      for (let step = 0; step < EXPLORATION_STEPS; step++) {
        // Build uniform per-cell snowfall for this sub-step
        const cellSnowfall = new Float64Array(cellCount);
        for (let i = 0; i < cellCount; i++) {
          if (terrain.heights[i] >= 40) cellSnowfall[i] = perStepCm;
        }
        const delta = computeSnowAccumulation(terrain, windField, msg.params, cellSnowfall, msg.overrides);
        for (let i = 0; i < cellCount; i++) {
          accumulated[i] += delta.depth[i];
        }
      }

      const snowGrid = {
        depth: accumulated,
        isPowderZone: new Uint8Array(cellCount),
        rows,
        cols,
      };

      self.postMessage({
        type: "simulation-result",
        windU: windField.u,
        windV: windField.v,
        windW: windField.w,
        exposure: windField.exposure,
        snowDepth: snowGrid.depth,
        isPowderZone: snowGrid.isPowderZone,
        rows: windField.rows,
        cols: windField.cols,
        layers: windField.layers,
        layerHeights: windField.layerHeights,
      }, [
        windField.u.buffer,
        windField.v.buffer,
        windField.w.buffer,
        windField.exposure.buffer,
        snowGrid.depth.buffer,
        snowGrid.isPowderZone.buffer,
      ] as unknown as Transferable[]);
    }

    else if (msg.type === "run-historical") {
      if (!terrain) throw new Error("Terrain not initialized");
      cancelled = false;

      // Convert worker message format to SpatialWeatherTimeSeries
      const stations: WeatherStation[] = msg.weather.stations.map((s) => ({
        lat: s.lat,
        lng: s.lng,
        altitude: s.altitude,
        temp: Array.from(s.temp),
        precip: Array.from(s.precip),
        windSpeed: Array.from(s.windSpeed),
        windDir: Array.from(s.windDir),
      }));

      const weather: SpatialWeatherTimeSeries = {
        timestamps: msg.weather.timestamps.map((t: number) => new Date(t)),
        stations,
      };

      const steps = await runHistoricalSimulation(terrain, weather,
        (stage, percent) => {
          if (cancelled) return;
          self.postMessage({ type: "historical-progress", stage, percent });
        },
      );

      if (cancelled) return;

      // Convert to transferable format
      const stepData: HistoricalStepData[] = steps.map((s) => ({
        timestamp: s.timestamp.getTime(),
        temp: s.temp,
        precip: s.precip,
        windSpeed: s.windSpeed,
        windDir: s.windDir,
        snowDepth: s.snowGrid.depth,
        isPowderZone: s.snowGrid.isPowderZone,
        windU: s.windField.u,
        windV: s.windField.v,
        windW: s.windField.w,
        exposure: s.windField.exposure,
      }));

      // CRITICAL: Clone shared wind field buffers before transfer.
      // historical-sim.ts reuses the same WindField object across steps
      // when wind hasn't changed significantly. If we transfer a buffer
      // that's shared by multiple steps, all other references become detached.
      const seen = new Set<ArrayBufferLike>();
      for (const s of stepData) {
        for (const key of ["windU", "windV", "windW", "exposure"] as const) {
          if (seen.has(s[key].buffer)) {
            s[key] = new Float64Array(s[key]);
          }
          seen.add(s[key].buffer);
        }
      }

      // Now collect all unique buffers for zero-copy transfer
      const bufferSet = new Set<ArrayBuffer>();
      for (const s of stepData) {
        bufferSet.add(s.snowDepth.buffer as ArrayBuffer);
        bufferSet.add(s.isPowderZone.buffer as ArrayBuffer);
        bufferSet.add(s.windU.buffer as ArrayBuffer);
        bufferSet.add(s.windV.buffer as ArrayBuffer);
        bufferSet.add(s.windW.buffer as ArrayBuffer);
        bufferSet.add(s.exposure.buffer as ArrayBuffer);
      }

      self.postMessage({
        type: "historical-result",
        steps: stepData,
        rows: terrain.rows,
        cols: terrain.cols,
        layers: 2,
        layerHeights: [10, 50],
      }, Array.from(bufferSet) as unknown as Transferable[]);
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
