// MET Norway Locationforecast 2.0 — same data source as yr.no
// Provides accurate terrain-aware wind forecasts from MEPS 2.5km model
// CORS is open (Access-Control-Allow-Origin: *), no proxy needed

import type { WeatherStation } from "./nve.ts";

const MET_API = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
const USER_AGENT = "alpine-wind/1.0 github.com/edevardHvide/alpine-wind";

interface MetTimeseries {
  time: string;
  data: {
    instant: {
      details: {
        air_temperature: number;
        wind_speed: number;
        wind_from_direction: number;
      };
    };
    next_1_hours?: { details: { precipitation_amount: number } };
    next_6_hours?: { details: { precipitation_amount: number } };
  };
}

interface MetResponse {
  geometry: { coordinates: [number, number, number] }; // [lon, lat, altitude]
  properties: {
    timeseries: MetTimeseries[];
  };
}

/**
 * Fetch MET forecast for a single point. Returns null on failure.
 */
async function fetchMetPoint(
  lat: number, lng: number,
): Promise<{ altitude: number; timeseries: MetTimeseries[] } | null> {
  try {
    const res = await fetch(
      `${MET_API}?lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}`,
      { headers: { "User-Agent": USER_AGENT } },
    );
    if (!res.ok) return null;
    const json: MetResponse = await res.json();
    return {
      altitude: json.geometry.coordinates[2] ?? 0,
      timeseries: json.properties.timeseries,
    };
  } catch {
    return null;
  }
}

/**
 * Resample MET timeseries to uniform 3h intervals.
 * MET gives hourly for ~2.5 days, then 6-hourly.
 * We resample to 3h to match NVE's resolution.
 */
function resampleTo3h(
  timeseries: MetTimeseries[],
): { timestamps: Date[]; temp: number[]; precip: number[]; windSpeed: number[]; windDir: number[] } {
  if (timeseries.length === 0) return { timestamps: [], temp: [], precip: [], windSpeed: [], windDir: [] };

  const startTime = new Date(timeseries[0].time).getTime();
  const endTime = new Date(timeseries[timeseries.length - 1].time).getTime();
  const step = 3 * 3600 * 1000; // 3 hours

  const timestamps: Date[] = [];
  const temp: number[] = [];
  const precip: number[] = [];
  const windSpeed: number[] = [];
  const windDir: number[] = [];

  // Build lookup: time -> entry
  const byTime = new Map<number, MetTimeseries>();
  for (const ts of timeseries) {
    byTime.set(new Date(ts.time).getTime(), ts);
  }

  for (let t = startTime; t <= endTime; t += step) {
    // Find nearest entry at or before this time
    let best: MetTimeseries | null = null;
    let bestDist = Infinity;

    for (const ts of timeseries) {
      const tsTime = new Date(ts.time).getTime();
      const dist = Math.abs(tsTime - t);
      if (dist < bestDist) {
        bestDist = dist;
        best = ts;
      }
    }

    if (!best || bestDist > 6 * 3600 * 1000) continue; // skip if gap > 6h

    const d = best.data.instant.details;
    timestamps.push(new Date(t));
    temp.push(d.air_temperature);
    windSpeed.push(d.wind_speed);
    windDir.push(d.wind_from_direction);

    // Precip: prefer 1h (sum 3), else use 6h (÷2 for 3h portion)
    const p1h = best.data.next_1_hours?.details?.precipitation_amount;
    const p6h = best.data.next_6_hours?.details?.precipitation_amount;
    if (p1h !== undefined) {
      // For 3h window, accumulate from hourly entries if available
      let precipSum = 0;
      for (let h = 0; h < 3; h++) {
        const hourEntry = byTime.get(t + h * 3600 * 1000);
        const hp = hourEntry?.data.next_1_hours?.details?.precipitation_amount;
        precipSum += hp ?? (p1h / 3); // fallback: divide evenly
      }
      precip.push(precipSum);
    } else if (p6h !== undefined) {
      precip.push(p6h / 2); // 6h precip ÷ 2 ≈ 3h portion
    } else {
      precip.push(0);
    }
  }

  return { timestamps, temp, precip, windSpeed, windDir };
}

/**
 * Fetch MET forecast for a grid of points and return as WeatherStation[].
 * Timestamps are aligned to 3h intervals to merge with NVE data.
 */
export async function fetchMetForecastGrid(
  samplePoints: { lat: number; lng: number }[],
  onProgress?: (stage: string, progress: number) => void,
): Promise<{ timestamps: Date[]; stations: WeatherStation[] }> {
  let completed = 0;
  const total = samplePoints.length;

  onProgress?.("Fetching MET forecast...", 0);

  const results = await Promise.all(
    samplePoints.map(async (pt) => {
      const result = await fetchMetPoint(pt.lat, pt.lng);
      completed++;
      onProgress?.(`Fetching MET forecast... (${completed}/${total})`, (completed / total) * 100);
      return result ? { ...result, lat: pt.lat, lng: pt.lng } : null;
    }),
  );

  const valid = results.filter((r): r is NonNullable<typeof r> => r !== null);
  if (valid.length === 0) {
    return { timestamps: [], stations: [] };
  }

  // Resample all to 3h and build WeatherStation[]
  const stations: WeatherStation[] = [];
  let timestamps: Date[] = [];

  for (const v of valid) {
    const resampled = resampleTo3h(v.timeseries);
    if (resampled.timestamps.length === 0) continue;

    if (timestamps.length === 0) {
      timestamps = resampled.timestamps;
    }

    // Trim to same length as first station
    const len = Math.min(resampled.temp.length, timestamps.length);
    stations.push({
      lat: v.lat,
      lng: v.lng,
      altitude: v.altitude,
      temp: resampled.temp.slice(0, len),
      precip: resampled.precip.slice(0, len),
      windSpeed: resampled.windSpeed.slice(0, len),
      windDir: resampled.windDir.slice(0, len),
    });
  }

  // Trim timestamps to shortest station
  const minLen = Math.min(...stations.map(s => s.temp.length));
  timestamps = timestamps.slice(0, minLen);
  for (const s of stations) {
    s.temp = s.temp.slice(0, minLen);
    s.precip = s.precip.slice(0, minLen);
    s.windSpeed = s.windSpeed.slice(0, minLen);
    s.windDir = s.windDir.slice(0, minLen);
  }

  console.log(`MET forecast: ${stations.length} stations, ${timestamps.length} timesteps (3h), altitudes: ${stations.map(s => s.altitude + 'm').join(', ')}`);

  return { timestamps, stations };
}
