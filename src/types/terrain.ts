export interface BoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface ElevationGrid {
  heights: Float64Array;
  rows: number;
  cols: number;
  bbox: BoundingBox;
  cellSizeMeters: number;
  slopes: Float64Array;
  aspects: Float64Array;
  normalsX: Float64Array;
  normalsY: Float64Array;
  normalsZ: Float64Array;
}

export interface TerrainRegion {
  name: string;
  bbox: BoundingBox;
  cameraPosition: { lng: number; lat: number; height: number };
  cameraPitch: number;
  cameraHeading: number;
}
