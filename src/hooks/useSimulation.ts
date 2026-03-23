import { useState, useCallback, useRef } from "react";
import type { ElevationGrid } from "../types/terrain.ts";
import type { WindField, WindParams } from "../types/wind.ts";
import type { SnowDepthGrid } from "../types/snow.ts";
import type { ParticlePool } from "../simulation/wind-particles.ts";
import { solveWindField } from "../simulation/wind-solver.ts";
import { computeSnowAccumulation } from "../simulation/snow-model.ts";
import { createParticlePool, advectParticles } from "../simulation/wind-particles.ts";

const PARTICLE_COUNT = 800;

export interface SimulationState {
  windField: WindField | null;
  snowGrid: SnowDepthGrid | null;
  particlePool: ParticlePool | null;
  simulating: boolean;
}

export function useSimulation() {
  const [state, setState] = useState<SimulationState>({
    windField: null,
    snowGrid: null,
    particlePool: null,
    simulating: false,
  });

  const terrainRef = useRef<ElevationGrid | null>(null);
  const windFieldRef = useRef<WindField | null>(null);
  const poolRef = useRef<ParticlePool | null>(null);

  const setTerrain = useCallback((grid: ElevationGrid) => {
    terrainRef.current = grid;
  }, []);

  const runSimulation = useCallback((params: WindParams) => {
    const terrain = terrainRef.current;
    if (!terrain) return;

    setState((s) => ({ ...s, simulating: true }));

    // Run synchronously (could move to Web Worker later)
    requestAnimationFrame(() => {
      const t0 = performance.now();
      const windField = solveWindField(terrain, params);
      const snowGrid = computeSnowAccumulation(terrain, windField, params);
      const particlePool = createParticlePool(PARTICLE_COUNT, windField, terrain);

      windFieldRef.current = windField;
      poolRef.current = particlePool;

      console.log(`Simulation completed in ${(performance.now() - t0).toFixed(0)}ms`);

      setState({
        windField,
        snowGrid,
        particlePool,
        simulating: false,
      });
    });
  }, []);

  const advect = useCallback(() => {
    const wind = windFieldRef.current;
    const pool = poolRef.current;
    const terrain = terrainRef.current;
    if (!wind || !pool || !terrain) return null;

    advectParticles(pool, wind, terrain);
    return pool;
  }, []);

  return { state, setTerrain, runSimulation, advect, terrainRef };
}
