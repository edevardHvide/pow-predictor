// MEPS 2.5km wind data from MET Norway THREDDS via Lambda proxy.
// Provides 10m surface wind, 850hPa pressure-level wind, and gusts.

const API_BASE = "/api/meps-wind";

export interface MepsWindStation {
  lat: number;
  lng: number;
  timestamps: number[];       // epoch ms
  windSpeed10m: number[];     // m/s
  windDir10m: number[];       // degrees
  windSpeed850hPa: number[];  // m/s — free-atmosphere wind at ~1500m
  windDir850hPa: number[];    // degrees
  windGust: number[];         // m/s
}

export interface MepsWindResponse {
  source: string;
  model: string;
  stations: MepsWindStation[];
}

/**
 * Fetch MEPS wind for a grid of sample points.
 * Points are passed as semicolon-separated lat,lng pairs.
 * hours: number of hourly forecast steps to fetch (max 62).
 */
export async function fetchMepsWindGrid(
  samplePoints: { lat: number; lng: number }[],
  hours = 24,
): Promise<MepsWindResponse> {
  const pointsParam = samplePoints
    .map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`)
    .join(";");

  const url = `${API_BASE}?points=${encodeURIComponent(pointsParam)}&hours=${hours}`;

  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.text();
    console.warn("MEPS wind fetch failed:", res.status, err);
    throw new Error(`MEPS wind API error: ${res.status}`);
  }

  return res.json();
}
