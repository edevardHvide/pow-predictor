export interface SnowDepthGrid {
  depth: Float64Array; // relative depth 0..1
  isPowderZone: Uint8Array; // 1 = prime powder
  rows: number;
  cols: number;
}
