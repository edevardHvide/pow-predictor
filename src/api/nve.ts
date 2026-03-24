// Proxied through Vite dev server to avoid CORS (NVE doesn't set CORS headers)
const API_BASE = "/api/nve/GridTimeSeries";

export interface WeatherTimeSeries {
  timestamps: Date[];
  precip: number[];    // mm per 3h
  temp: number[];      // °C
  windSpeed: number[]; // m/s
  windDir: number[];   // degrees
  altitude: number;    // m
}

// WGS84 lat/lng → UTM Zone 33N (EPSG:32633)
export function latLngToUtm33(lat: number, lng: number): { x: number; y: number } {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const n = f / (2 - f);
  const k0 = 0.9996;
  const lon0 = 15.0; // central meridian zone 33

  const latR = (lat * Math.PI) / 180;
  const lonR = (lng * Math.PI) / 180;
  const lon0R = (lon0 * Math.PI) / 180;

  const A = (a / (1 + n)) * (1 + n * n / 4 + (n * n * n * n) / 64);

  const alpha1 = n / 2 - (2 * n * n) / 3 + (5 * n * n * n) / 16;
  const alpha2 = (13 * n * n) / 48 - (3 * n * n * n) / 5;

  const atanh_sin = Math.atanh(Math.sin(latR));
  const correction = (2 * Math.sqrt(n)) / (1 + n);
  const t = Math.sinh(atanh_sin - correction * Math.atanh(correction * Math.sin(latR)));
  const xiPrime = Math.atan2(t, Math.cos(lonR - lon0R));
  const etaPrime = Math.atanh(Math.sin(lonR - lon0R) / Math.sqrt(1 + t * t));

  const xi = xiPrime
    + alpha1 * Math.sin(2 * xiPrime) * Math.cosh(2 * etaPrime)
    + alpha2 * Math.sin(4 * xiPrime) * Math.cosh(4 * etaPrime);
  const eta = etaPrime
    + alpha1 * Math.cos(2 * xiPrime) * Math.sinh(2 * etaPrime)
    + alpha2 * Math.cos(4 * xiPrime) * Math.sinh(4 * etaPrime);

  return {
    x: Math.round(k0 * A * eta + 500000),
    y: Math.round(k0 * A * xi),
  };
}

async function fetchTheme(
  x: number, y: number, start: string, end: string, theme: string,
): Promise<{ data: number[]; altitude: number }> {
  const url = `${API_BASE}/${x}/${y}/${start}/${end}/${theme}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NVE API error: ${res.status} for ${theme}`);
  const json = await res.json();
  // Replace NoDataValue with 0
  const noData = json.NoDataValue ?? 65535;
  const data = (json.Data as number[]).map((v) => (v === noData ? 0 : v));
  return { data, altitude: json.Altitude ?? 0 };
}

// Try fetching from center point, fall back to nearby offsets if center is ocean
async function findValidUtm(lat: number, lng: number): Promise<{ x: number; y: number }> {
  const offsets = [
    [0, 0], [0.01, 0], [-0.01, 0], [0, 0.02], [0, -0.02],
    [0.02, 0.02], [-0.02, 0.02], [0.02, -0.02], [-0.02, -0.02],
    [0.03, 0], [-0.03, 0], [0, 0.05], [0, -0.05],
  ];
  for (const [dlat, dlng] of offsets) {
    const { x, y } = latLngToUtm33(lat + dlat, lng + dlng);
    try {
      const url = `${API_BASE}/${x}/${y}/2026-01-01/2026-01-02/tm.json`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (!json.Error) {
          console.log(`NVE: valid cell at UTM (${x}, ${y}), offset (${dlat}, ${dlng})`);
          return { x, y };
        }
      }
    } catch { /* try next */ }
  }
  // Last resort: use center
  return latLngToUtm33(lat, lng);
}

export async function fetchWeatherTimeSeries(
  lat: number, lng: number, daysBack = 7, daysForward = 5,
  onProgress?: (stage: string, progress: number) => void,
): Promise<WeatherTimeSeries> {
  const { x, y } = await findValidUtm(lat, lng);

  const now = new Date();
  const start = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + daysForward * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  console.log(`NVE: fetching ${daysBack}d back + ${daysForward}d forward for UTM33 (${x}, ${y}), ${fmt(start)} to ${fmt(end)}`);

  let completed = 0;
  const total = 4;
  const trackFetch = async (theme: string, label: string) => {
    onProgress?.(label, (completed / total) * 100);
    const result = await fetchTheme(x, y, fmt(start), fmt(end), theme);
    completed++;
    onProgress?.(label, (completed / total) * 100);
    return result;
  };

  const [precip, temp, windSpeed, windDir] = await Promise.all([
    trackFetch("rr3h", "Fetching precipitation data..."),
    trackFetch("tm3h", "Fetching temperature data..."),
    trackFetch("windSpeed10m3h", "Fetching wind speed data..."),
    trackFetch("windDirection10m3h", "Fetching wind direction data..."),
  ]);

  // Build timestamps (3-hourly from start)
  const len = precip.data.length;
  const timestamps: Date[] = [];
  for (let i = 0; i < len; i++) {
    timestamps.push(new Date(start.getTime() + i * 3 * 60 * 60 * 1000));
  }

  console.log(`NVE: ${len} timesteps, altitude=${precip.altitude}m`);

  return {
    timestamps,
    precip: precip.data,
    temp: temp.data,
    windSpeed: windSpeed.data,
    windDir: windDir.data,
    altitude: precip.altitude,
  };
}
