export interface SnowDepthGrid {
  depth: Float64Array; // snow depth in cm
  isPowderZone: Uint8Array; // 1 = prime powder
  rows: number;
  cols: number;
}
