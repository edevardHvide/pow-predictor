import type { BoundingBox } from "../types/terrain.ts";

const METERS_PER_DEGREE_LAT = 111_320;

export function metersPerDegreeLng(lat: number): number {
  return METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
}

export function gridDimensions(
  bbox: BoundingBox,
  cellSizeMeters: number,
): { rows: number; cols: number } {
  const midLat = (bbox.south + bbox.north) / 2;
  const widthMeters = (bbox.east - bbox.west) * metersPerDegreeLng(midLat);
  const heightMeters = (bbox.north - bbox.south) * METERS_PER_DEGREE_LAT;
  return {
    cols: Math.round(widthMeters / cellSizeMeters),
    rows: Math.round(heightMeters / cellSizeMeters),
  };
}

export function gridToLatLng(
  row: number,
  col: number,
  bbox: BoundingBox,
  rows: number,
  cols: number,
): { lat: number; lng: number } {
  return {
    lat: bbox.south + ((row + 0.5) / rows) * (bbox.north - bbox.south),
    lng: bbox.west + ((col + 0.5) / cols) * (bbox.east - bbox.west),
  };
}
