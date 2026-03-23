import { useState, useCallback, useRef } from "react";
import type { ElevationGrid } from "../types/terrain.ts";
import type { WindField, WindParams } from "../types/wind.ts";
import type { SnowDepthGrid } from "../types/snow.ts";
import { solveWindField } from "../simulation/wind-solver.ts";
import { computeSnowAccumulation } from "../simulation/snow-model.ts";

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

  const setTerrain = useCallback((grid: ElevationGrid) => {
    terrainRef.current = grid;
  }, []);

  const runSimulation = useCallback((params: WindParams) => {
    const terrain = terrainRef.current;
    if (!terrain) return;

    setState((s) => ({ ...s, simulating: true }));

    requestAnimationFrame(() => {
      const t0 = performance.now();
      const windField = solveWindField(terrain, params);
      const snowGrid = computeSnowAccumulation(terrain, windField, params);

      console.log(`Simulation completed in ${(performance.now() - t0).toFixed(0)}ms`);

      setState({ windField, snowGrid, simulating: false });
    });
  }, []);

  return { state, setTerrain, runSimulation, terrainRef };
}
