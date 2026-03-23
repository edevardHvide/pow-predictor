import type { WindField } from "../types/wind.ts";
import type { ElevationGrid } from "../types/terrain.ts";
import { clamp } from "../utils/math.ts";

const MIN_TERRAIN_HEIGHT = 40; // meters — below this is water/shore/tidal flat
const MAX_AGE = 250;
const DT = 0.08; // ~2.5x real-time at 30fps

export interface Particle {
  row: number;
  col: number;
  layer: number;
  age: number;
  trail: Array<{ lat: number; lng: number; height: number }>;
  speed: number;
}

export interface ParticlePool {
  particles: Particle[];
  rows: number;
  cols: number;
  layers: number;
}

// Pre-computed list of valid (land) cell indices for fast spawning
let landCells: Array<{ row: number; col: number }> | null = null;

function buildLandIndex(terrain: ElevationGrid): void {
  landCells = [];
  for (let r = 1; r < terrain.rows - 1; r++) {
    for (let c = 1; c < terrain.cols - 1; c++) {
      if (terrain.heights[r * terrain.cols + c] >= MIN_TERRAIN_HEIGHT) {
        landCells.push({ row: r, col: c });
      }
    }
  }
  console.log(`Land cells indexed: ${landCells.length}/${terrain.rows * terrain.cols}`);
}

export function createParticlePool(
  count: number,
  wind: WindField,
  terrain: ElevationGrid,
): ParticlePool {
  buildLandIndex(terrain);
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push(spawnParticle(wind, terrain));
  }
  return { particles, rows: wind.rows, cols: wind.cols, layers: wind.layers };
}

function spawnParticle(wind: WindField, terrain: ElevationGrid): Particle {
  // Pick a random land cell
  let row: number, col: number;
  if (landCells && landCells.length > 0) {
    const cell = landCells[Math.floor(Math.random() * landCells.length)];
    row = cell.row + Math.random() - 0.5;
    col = cell.col + Math.random() - 0.5;
  } else {
    row = Math.random() * (wind.rows - 2) + 0.5;
    col = Math.random() * (wind.cols - 2) + 0.5;
  }

  const layer = Math.random() * 1.5;
  const terrainH = sampleTerrainHeight(row, col, terrain);
  const { lat, lng } = fractionalGridToLatLng(row, col, terrain);
  const agl = wind.layerHeights[Math.floor(clamp(layer, 0, wind.layers - 1))];
  const height = terrainH + agl + 10;

  return {
    row, col, layer,
    age: Math.floor(Math.random() * MAX_AGE),
    trail: [{ lat, lng, height }],
    speed: 0,
  };
}

function fractionalGridToLatLng(
  row: number,
  col: number,
  terrain: ElevationGrid,
): { lat: number; lng: number } {
  const { bbox, rows, cols } = terrain;
  return {
    lat: bbox.south + ((row + 0.5) / rows) * (bbox.north - bbox.south),
    lng: bbox.west + ((col + 0.5) / cols) * (bbox.east - bbox.west),
  };
}

function sampleTerrainHeight(row: number, col: number, terrain: ElevationGrid): number {
  const r = clamp(Math.floor(row), 0, terrain.rows - 1);
  const c = clamp(Math.floor(col), 0, terrain.cols - 1);
  return terrain.heights[r * terrain.cols + c];
}

export function advectParticles(
  pool: ParticlePool,
  wind: WindField,
  terrain: ElevationGrid,
): void {
  const { rows, cols, layers } = wind;
  const layerSize = rows * cols;

  for (const p of pool.particles) {
    p.age++;

    // Respawn if out of bounds, too old, or drifted over water
    const terrainH = sampleTerrainHeight(p.row, p.col, terrain);
    if (
      p.age > MAX_AGE ||
      p.row < 0.5 || p.row >= rows - 1.5 ||
      p.col < 0.5 || p.col >= cols - 1.5 ||
      p.layer < 0 || p.layer >= layers - 1 ||
      terrainH < MIN_TERRAIN_HEIGHT
    ) {
      Object.assign(p, spawnParticle(wind, terrain));
      continue;
    }

    // Trilinear interpolation of wind velocity
    const r0 = Math.floor(p.row), r1 = Math.min(r0 + 1, rows - 1);
    const c0 = Math.floor(p.col), c1 = Math.min(c0 + 1, cols - 1);
    const l0 = Math.floor(p.layer), l1 = Math.min(l0 + 1, layers - 1);
    const fr = p.row - r0, fc = p.col - c0, fl = p.layer - l0;

    let pu = 0, pv = 0, pw = 0;
    for (let dl = 0; dl <= 1; dl++) {
      const wl = dl === 0 ? 1 - fl : fl;
      const layerIdx = dl === 0 ? l0 : l1;
      for (let dr = 0; dr <= 1; dr++) {
        const wr = dr === 0 ? 1 - fr : fr;
        const ri = dr === 0 ? r0 : r1;
        for (let dc = 0; dc <= 1; dc++) {
          const wc = dc === 0 ? 1 - fc : fc;
          const ci = dc === 0 ? c0 : c1;
          const idx = layerIdx * layerSize + ri * cols + ci;
          const weight = wl * wr * wc;
          pu += wind.u[idx] * weight;
          pv += wind.v[idx] * weight;
          pw += wind.w[idx] * weight;
        }
      }
    }

    p.speed = Math.sqrt(pu * pu + pv * pv + pw * pw);

    // Move particle: velocity (m/s) → grid cells
    const cellsPerMeter = 1 / terrain.cellSizeMeters;
    p.col += pu * DT * cellsPerMeter;
    p.row += pv * DT * cellsPerMeter;

    // Vertical movement
    const li = clamp(Math.floor(p.layer), 0, layers - 2);
    const layerThickness = wind.layerHeights[li + 1] - wind.layerHeights[li];
    if (layerThickness > 0) {
      p.layer += (pw * DT) / layerThickness;
    }
    p.layer = clamp(p.layer, 0, layers - 1.01);

    // Smooth lat/lng from fractional grid position
    const { lat, lng } = fractionalGridToLatLng(p.row, p.col, terrain);
    const particleAGL = wind.layerHeights[clamp(Math.floor(p.layer), 0, layers - 1)];
    const height = terrainH + particleAGL;

    p.trail.push({ lat, lng, height });
    if (p.trail.length > 4) p.trail.shift();
  }
}
