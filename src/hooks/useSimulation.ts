// src/hooks/useSimulation.ts
import { useState, useCallback, useRef, useEffect } from "react";
import type { ElevationGrid } from "../types/terrain.ts";
import type { WindField, WindParams } from "../types/wind.ts";
import type { SnowDepthGrid } from "../types/snow.ts";
import type { WorkerResponse } from "../simulation/worker-protocol.ts";
import type { CoefficientsOverride } from "../simulation/coefficients.ts";

export interface SimulationState {
  windField: WindField | null;
  snowGrid: SnowDepthGrid | null;
  simulating: boolean;
}

export function useSimulation() {
  const [state, setState] = useState<SimulationState>({
    windField: null,
    snowGrid: null,
    simulating: false,
  });

  const terrainRef = useRef<ElevationGrid | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const terrainSentRef = useRef(false);
  const [workerReady, setWorkerReady] = useState(false);

  // Create worker on mount
  useEffect(() => {
    const worker = new Worker(
      new URL("../simulation/simulation.worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "simulation-result") {
        setState({
          windField: {
            u: msg.windU,
            v: msg.windV,
            w: msg.windW,
            exposure: msg.exposure,
            rows: msg.rows,
            cols: msg.cols,
            layers: msg.layers,
            layerHeights: msg.layerHeights,
          },
          snowGrid: {
            depth: msg.snowDepth,
            isPowderZone: msg.isPowderZone,
            rows: msg.rows,
            cols: msg.cols,
          },
          simulating: false,
        });
      } else if (msg.type === "terrain-ready") {
        terrainSentRef.current = true;
        setWorkerReady(true);
      } else if (msg.type === "error") {
        console.error("Simulation worker error:", msg.message);
        setState((s) => ({ ...s, simulating: false }));
      }
      // historical-progress, historical-result are handled by useHistoricalSim's
      // addEventListener — they fall through here harmlessly
    };

    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  // Send terrain heights to worker (structured clone, not transfer — main thread
  // still needs heights for rendering: wind particles, snow overlay)
  const setTerrain = useCallback((grid: ElevationGrid) => {
    terrainRef.current = grid;
    terrainSentRef.current = false;
    setWorkerReady(false);

    const worker = workerRef.current;
    if (!worker) return;

    worker.postMessage({
      type: "init-terrain",
      heights: grid.heights,
      rows: grid.rows,
      cols: grid.cols,
      bbox: grid.bbox,
      cellSizeMeters: grid.cellSizeMeters,
    });
  }, []);

  const clearSimulation = useCallback(() => {
    setState({ windField: null, snowGrid: null, simulating: false });
  }, []);

  const runSimulation = useCallback((params: WindParams, overrides?: CoefficientsOverride) => {
    const worker = workerRef.current;
    if (!worker || !terrainSentRef.current) return;

    setState((s) => ({ ...s, simulating: true }));
    worker.postMessage({ type: "run-simulation", params, overrides });
  }, []);

  return { state, setTerrain, runSimulation, clearSimulation, terrainRef, workerRef, workerReady };
}
