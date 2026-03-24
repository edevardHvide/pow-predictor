import { computeSx } from "./wind-solver.ts";

export function computeDerivatives(
  heights: Float64Array,
  rows: number,
  cols: number,
  cellSize: number,
  slopes: Float64Array,
  aspects: Float64Array,
  nx: Float64Array,
  ny: Float64Array,
  nz: Float64Array,
): void {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;

      // Central finite differences (clamp at edges)
      const left = heights[r * cols + Math.max(0, c - 1)];
      const right = heights[r * cols + Math.min(cols - 1, c + 1)];
      const below = heights[Math.max(0, r - 1) * cols + c];
      const above = heights[Math.min(rows - 1, r + 1) * cols + c];

      const dzdx = (right - left) / (2 * cellSize);
      const dzdy = (above - below) / (2 * cellSize);

      // Slope angle in radians
      slopes[idx] = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));

      // Aspect: direction the slope faces (0=N, clockwise)
      aspects[idx] = Math.atan2(-dzdx, -dzdy);
      if (aspects[idx] < 0) aspects[idx] += 2 * Math.PI;

      // Surface normal (unnormalized: [-dzdx, -dzdy, 1], then normalize)
      const len = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
      nx[idx] = -dzdx / len;
      ny[idx] = -dzdy / len;
      nz[idx] = 1 / len;
    }
  }
}

export function precomputeSxSectors(
  heights: Float64Array,
  rows: number,
  cols: number,
  cellSize: number,
): Float64Array[] {
  const sectors: Float64Array[] = [];
  for (let s = 0; s < 8; s++) {
    const dirRad = s * (Math.PI / 4);
    const wdx = Math.sin(dirRad);
    const wdy = Math.cos(dirRad);
    const sx = new Float64Array(rows * cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        sx[r * cols + c] = computeSx(heights, r, c, rows, cols, wdx, wdy, cellSize);
      }
    }
    sectors.push(sx);
  }
  return sectors;
}
