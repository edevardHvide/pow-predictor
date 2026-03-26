import type { RegObsObservation } from "../types/conditions";

const REGOBS_API = "https://api.regobs.no/v5/Search";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * RegObs v5 Search requires SelectedRegions (forecast region IDs), not lat/lng.
 * Map from NVE avalanche forecast region ID to approximate bounding box center.
 * Source: api.regobs.no/v5/Search responses with ForecastRegionTID.
 */
const FORECAST_REGIONS: { id: number; name: string; lat: number; lng: number }[] = [
  { id: 3001, name: "Svalbard øst", lat: 78.5, lng: 20.0 },
  { id: 3002, name: "Svalbard vest", lat: 78.2, lng: 15.0 },
  { id: 3003, name: "Nordenskiöld Land", lat: 78.2, lng: 16.0 },
  { id: 3004, name: "Svalbard sør", lat: 77.5, lng: 16.0 },
  { id: 3006, name: "Finnmarkskysten", lat: 70.5, lng: 26.0 },
  { id: 3007, name: "Vest-Finnmark", lat: 70.0, lng: 24.0 },
  { id: 3009, name: "Nord-Troms", lat: 69.8, lng: 19.5 },
  { id: 3010, name: "Lyngen", lat: 69.6, lng: 20.1 },
  { id: 3011, name: "Tromsø", lat: 69.6, lng: 19.0 },
  { id: 3012, name: "Sør-Troms", lat: 68.8, lng: 17.5 },
  { id: 3013, name: "Indre Troms", lat: 68.9, lng: 18.5 },
  { id: 3014, name: "Lofoten og Vesterålen", lat: 68.3, lng: 15.0 },
  { id: 3015, name: "Ofoten", lat: 68.4, lng: 17.0 },
  { id: 3016, name: "Salten", lat: 67.2, lng: 15.5 },
  { id: 3017, name: "Svartisen", lat: 66.7, lng: 14.0 },
  { id: 3018, name: "Helgeland", lat: 65.5, lng: 14.0 },
  { id: 3022, name: "Trollheimen", lat: 62.8, lng: 9.5 },
  { id: 3023, name: "Romsdal", lat: 62.4, lng: 7.5 },
  { id: 3024, name: "Sunnmøre", lat: 62.1, lng: 6.8 },
  { id: 3025, name: "Nord-Gudbrandsdalen", lat: 61.8, lng: 8.5 },
  { id: 3027, name: "Indre Fjordane", lat: 61.5, lng: 7.0 },
  { id: 3028, name: "Jotunheimen", lat: 61.5, lng: 8.3 },
  { id: 3029, name: "Indre Sogn", lat: 61.2, lng: 7.5 },
  { id: 3031, name: "Voss", lat: 60.6, lng: 6.5 },
  { id: 3032, name: "Hallingdal", lat: 60.6, lng: 8.5 },
  { id: 3034, name: "Hardanger", lat: 60.0, lng: 7.0 },
  { id: 3035, name: "Vest-Telemark", lat: 59.5, lng: 7.5 },
  { id: 3037, name: "Heiane", lat: 59.0, lng: 6.8 },
  { id: 3042, name: "Oppland sør", lat: 61.0, lng: 9.5 },
  { id: 3043, name: "Hedmark", lat: 61.5, lng: 11.0 },
];

/** Find closest forecast region(s) for a lat/lng. Returns 1-2 region IDs. */
function findRegionIds(lat: number, lng: number): number[] {
  const scored = FORECAST_REGIONS.map(r => {
    const dLat = r.lat - lat;
    const dLng = (r.lng - lng) * Math.cos(lat * Math.PI / 180);
    return { id: r.id, dist: Math.sqrt(dLat * dLat + dLng * dLng) };
  }).sort((a, b) => a.dist - b.dist);

  // Always include closest region; include second if it's within 1.5 degrees
  const ids = [scored[0].id];
  if (scored[1].dist < 1.5) ids.push(scored[1].id);
  return ids;
}

function cacheKey(lat: number, lng: number): string {
  const d = new Date().toISOString().slice(0, 10);
  return `regobs_${lat.toFixed(1)}_${lng.toFixed(1)}_${d}`;
}

function getCache(key: string): RegObsObservation[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCache(key: string, data: RegObsObservation[]): void {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota exceeded -- ignore */ }
}

/**
 * Parse raw RegObs v5/Search response into our trimmed observation format.
 * v5 uses top-level fields (SnowSurfaceObservation, WeatherObservation, etc.)
 * NOT the nested Registrations[].FullObject pattern.
 */
function parseObservations(raw: unknown[]): RegObsObservation[] {
  return (raw as any[]).map((entry) => {
    const obs: RegObsObservation = {
      id: entry.RegId ?? 0,
      lat: entry.ObsLocation?.Latitude ?? 0,
      lng: entry.ObsLocation?.Longitude ?? 0,
      timestamp: entry.DtObsTime ?? "",
      competencyLevel: entry.Observer?.CompetenceLevelTID ?? 0,
      elevation: entry.ObsLocation?.Height ?? undefined,
      nickName: entry.Observer?.NickName,
      registrations: {},
    };

    // Snow surface observation
    const ss = entry.SnowSurfaceObservation;
    if (ss) {
      obs.registrations.snowSurface = {
        surfaceType: ss.SnowSurfaceName ?? "",
        driftName: ss.SnowDriftName,
        comment: ss.Comment,
      };
    }

    // Danger signs
    const dangerObs: any[] = entry.DangerObs ?? [];
    if (dangerObs.length > 0) {
      obs.registrations.dangerSigns = {
        signs: dangerObs.map((d: any) => d.DangerSignName ?? "").filter(Boolean),
        comment: dangerObs.map((d: any) => d.Comment).filter(Boolean).join("; ") || undefined,
      };
    }

    // Avalanche observation (single event)
    const ao = entry.AvalancheObs;
    if (ao) {
      obs.registrations.avalancheObs = {
        size: ao.DestructiveSizeName ?? "",
        trigger: ao.AvalancheTriggerName ?? "",
        type: ao.AvalancheName ?? "",
        comment: ao.Comment,
      };
    }

    // Avalanche activity (multiple observed events)
    const aa: any[] = entry.AvalancheActivityObs2 ?? [];
    if (aa.length > 0) {
      obs.registrations.avalancheActivity = {
        entries: aa.map((a: any) => ({
          type: a.AvalancheName ?? "",
          trigger: a.AvalTriggerSimpleName ?? "",
          size: a.DestructiveSizeName ?? "",
        })),
      };
    }

    // Avalanche evaluation / danger assessment
    const ae = entry.AvalancheEvaluation3;
    if (ae) {
      obs.registrations.avalancheEval = {
        dangerLevel: ae.AvalancheDangerName ?? "",
        evaluation: ae.AvalancheEvaluation || undefined,
        development: ae.AvalancheDevelopment || undefined,
        forecastComment: ae.ForecastComment || undefined,
      };
    }

    // Weather observation
    const wo = entry.WeatherObservation;
    if (wo) {
      obs.registrations.weather = {
        temp: wo.AirTemperature ?? undefined,
        precipName: wo.PrecipitationName || undefined,
        windSpeedName: wo.WindSpeedName || undefined,
        windDirName: wo.WindDirectionName || undefined,
        cloudCoverName: wo.CloudCoverName || undefined,
        comment: wo.Comment || undefined,
      };
    }

    // General observation / notes
    const go = entry.GeneralObservation;
    if (go?.ObsComment) {
      obs.registrations.general = { comment: go.ObsComment };
    }

    return obs;
  }).filter(o => o.lat !== 0 && o.lng !== 0);
}

/**
 * Fetch RegObs snow observations for the forecast region(s) nearest to a point.
 * The v5/Search endpoint filters by SelectedRegions, not by lat/lng radius.
 */
export async function fetchRegObsObservations(
  lat: number,
  lng: number,
  _radiusKm: number = 30,
  daysBack: number = 7,
  signal?: AbortSignal,
): Promise<RegObsObservation[]> {
  const key = cacheKey(lat, lng);
  const cached = getCache(key);
  if (cached) return cached;

  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const regionIds = findRegionIds(lat, lng);

  const body = {
    SelectedGeoHazards: [10], // Snow
    SelectedRegions: regionIds,
    FromDate: fromDate.toISOString(),
    ToDate: toDate.toISOString(),
    NumberOfRecords: 100,
    LangKey: 2, // English
  };

  const resp = await fetch(REGOBS_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) throw new Error(`RegObs API error: ${resp.status}`);

  const raw = await resp.json();
  const observations = parseObservations(raw);
  setCache(key, observations);
  return observations;
}
