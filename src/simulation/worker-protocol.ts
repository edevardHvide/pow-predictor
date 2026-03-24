// src/simulation/worker-protocol.ts
import type { WindParams } from "../types/wind.ts";
import type { BoundingBox } from "../types/terrain.ts";

// ── Messages: Main → Worker ──────────────────────────

export interface InitTerrainMessage {
  type: "init-terrain";
  heights: Float64Array;
  rows: number;
  cols: number;
  bbox: BoundingBox;
  cellSizeMeters: number;
}

export interface RunSimulationMessage {
  type: "run-simulation";
  params: WindParams;
}

export interface RunHistoricalMessage {
  type: "run-historical";
  weather: {
    timestamps: number[];   // epoch ms (Date not transferable)
    temp: Float64Array;
    precip: Float64Array;
    windSpeed: Float64Array;
    windDir: Float64Array;
    altitude: number;
  };
}

export interface CancelMessage {
  type: "cancel";
}

export type WorkerRequest =
  | InitTerrainMessage
  | RunSimulationMessage
  | RunHistoricalMessage
  | CancelMessage;

// ── Messages: Worker → Main ──────────────────────────

export interface TerrainReadyMessage {
  type: "terrain-ready";
}

export interface SimulationResultMessage {
  type: "simulation-result";
  windU: Float64Array;
  windV: Float64Array;
  windW: Float64Array;
  exposure: Float64Array;
  snowDepth: Float64Array;
  isPowderZone: Uint8Array;
  rows: number;
  cols: number;
  layers: number;
  layerHeights: number[];
}

export interface HistoricalProgressMessage {
  type: "historical-progress";
  stage: string;
  percent: number;
}

export interface HistoricalStepData {
  timestamp: number;        // epoch ms
  temp: number;
  precip: number;
  windSpeed: number;
  windDir: number;
  snowDepth: Float64Array;
  isPowderZone: Uint8Array;
  windU: Float64Array;
  windV: Float64Array;
  windW: Float64Array;
  exposure: Float64Array;
}

export interface HistoricalResultMessage {
  type: "historical-result";
  steps: HistoricalStepData[];
  rows: number;
  cols: number;
  layers: number;
  layerHeights: number[];
}

export interface WorkerErrorMessage {
  type: "error";
  message: string;
}

export type WorkerResponse =
  | TerrainReadyMessage
  | SimulationResultMessage
  | HistoricalProgressMessage
  | HistoricalResultMessage
  | WorkerErrorMessage;
