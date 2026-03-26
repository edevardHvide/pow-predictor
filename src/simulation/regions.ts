import type { TerrainRegion } from "../types/terrain.ts";

// ~25km bounding box centered on coordinates (matches preset region sizes)
export function regionFromCoordinates(name: string, lat: number, lng: number): TerrainRegion {
  const latSpan = 0.2; // ~22km north-south
  // At high latitudes, longitude degrees shrink. Cap the span to avoid enormous grids.
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.3);
  const lngSpan = Math.min(0.5 / cosLat, 0.6); // ~25km but capped at 0.6° max
  return {
    name,
    bbox: {
      west: lng - lngSpan / 2,
      south: lat - latSpan / 2,
      east: lng + lngSpan / 2,
      north: lat + latSpan / 2,
    },
    cameraPosition: { lng, lat, height: 800 },
    cameraPitch: -30,
    cameraHeading: 0,
  };
}

export const REGIONS: TerrainRegion[] = [
  {
    name: "Lofoten",
    bbox: { west: 14.15, south: 68.08, east: 14.65, north: 68.28 },
    cameraPosition: { lng: 14.4, lat: 68.08, height: 6000 },
    cameraPitch: -25,
    cameraHeading: 0,
  },
  {
    name: "Lyngen Alps",
    bbox: { west: 20.0, south: 69.55, east: 20.45, north: 69.75 },
    cameraPosition: { lng: 20.2, lat: 69.55, height: 7000 },
    cameraPitch: -25,
    cameraHeading: 0,
  },
  {
    name: "Narvik / Narvikfjellet",
    bbox: { west: 17.3, south: 68.38, east: 17.6, north: 68.52 },
    cameraPosition: { lng: 17.45, lat: 68.38, height: 5000 },
    cameraPitch: -25,
    cameraHeading: 0,
  },
];
