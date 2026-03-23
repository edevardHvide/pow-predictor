import type { TerrainRegion } from "../types/terrain.ts";

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
