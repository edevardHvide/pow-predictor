# RegObs Conditions Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Analyze conditions" button to the snow depth tooltip that fetches RegObs observations and Varsom forecasts, scores them for terrain relevance, and displays a Claude-powered conditions summary.

**Architecture:** Browser fetches RegObs + Varsom APIs directly, scores observations using terrain grid data, POSTs scored data to a new Lambda endpoint (`POST /api/conditions-summary`) that calls Claude Haiku via raw HTTP. Summary appends below existing tooltip content.

**Tech Stack:** React 19, TypeScript, Python 3.11 Lambda (stdlib only), OpenTofu, Anthropic Messages API

**Spec:** `docs/superpowers/specs/2026-03-26-regobs-conditions-summary-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/types/conditions.ts` | TypeScript interfaces for observations, scoring, Lambda request/response |
| `src/utils/relevance.ts` | Single-cell aspect/slope computation + relevance scoring |
| `src/api/regobs.ts` | RegObs v5 Search API client with localStorage cache |
| `src/api/varsom.ts` | Varsom forecast API client with localStorage cache |
| `infra/lambda/conditions_summary.py` | Lambda that calls Claude via urllib |

### Modified files
| File | Changes |
|------|---------|
| `src/components/SnowDepthTooltip.tsx` | Add button, loading state, summary display, scrollable expansion |
| `src/App.tsx` | Wire up analyze flow: fetch, score, POST to Lambda, pass summary to tooltip |
| `infra/apigateway.tf` | Add POST route, update CORS to include POST+OPTIONS, add throttling |
| `infra/lambda.tf` | Add new Lambda resource + IAM + API Gateway permission |
| `vite.config.ts` | Add dev proxy for `/api/conditions-summary` |

---

## Task 1: TypeScript Interfaces

**Files:**
- Create: `src/types/conditions.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/types/conditions.ts

/** Parsed RegObs observation with only the fields we need */
export interface RegObsObservation {
  id: number;
  lat: number;
  lng: number;
  timestamp: string; // ISO 8601
  competencyLevel: number; // 1-5
  elevation?: number;
  registrations: {
    driftObs?: { driftCategory: string; comment?: string };
    snowSurface?: { surfaceType: string; comment?: string };
    dangerSigns?: { signs: string[]; comment?: string };
    avalancheActivity?: { type: string; trigger: string; comment?: string };
    weather?: { comment?: string };
  };
}

/** Observation enriched with relevance data */
export interface ScoredObservation {
  observation: RegObsObservation;
  relevance: number; // 0-1
  distanceKm: number;
  elevationDiff: number;
  aspectDiff: number; // radians
  hoursAgo: number;
}

/** Varsom avalanche forecast */
export interface VarsomForecast {
  dangerLevel: number; // 1-5
  dangerLevelName: string;
  avalancheProblems: string[];
  mountainWeather: string;
  validFrom: string;
  validTo: string;
}

/** Point characteristics from terrain grid */
export interface TerrainPoint {
  lat: number;
  lng: number;
  elevation: number;
  aspect: number; // radians, 0=N clockwise
  slope: number; // radians
}

/** Request body to POST /api/conditions-summary */
export interface ConditionsSummaryRequest {
  point: TerrainPoint;
  observations: ScoredObservation[];
  forecast: VarsomForecast | null;
}

/** Response from /api/conditions-summary */
export interface ConditionsSummary {
  windTransport: string;
  surfaceConditions: string;
  stabilityConcerns: string;
  confidence: string;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors (new file, no imports yet)

- [ ] **Step 3: Commit**

```bash
git add src/types/conditions.ts
git commit -m "feat: add TypeScript interfaces for conditions summary feature"
```

---

## Task 2: Relevance Scoring Module

**Files:**
- Create: `src/utils/relevance.ts`
- Reference: `src/simulation/terrain-processing.ts:14-32` (finite difference math)

- [ ] **Step 1: Create the relevance module**

```typescript
// src/utils/relevance.ts

import type { RegObsObservation, ScoredObservation, TerrainPoint } from "../types/conditions";

/**
 * Compute aspect and slope for a single grid cell using central finite differences.
 * Same math as terrain-processing.ts computeDerivatives, but for one cell only.
 */
export function computeCellAspectSlope(
  heights: Float64Array,
  rows: number,
  cols: number,
  cellSize: number,
  row: number,
  col: number,
): { aspect: number; slope: number } {
  const left = heights[row * cols + Math.max(0, col - 1)];
  const right = heights[row * cols + Math.min(cols - 1, col + 1)];
  const below = heights[Math.max(0, row - 1) * cols + col];
  const above = heights[Math.min(rows - 1, row + 1) * cols + col];

  const dzdx = (right - left) / (2 * cellSize);
  const dzdy = (above - below) / (2 * cellSize);

  const slope = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
  let aspect = Math.atan2(-dzdx, -dzdy);
  if (aspect < 0) aspect += 2 * Math.PI;

  return { aspect, slope };
}

/** Haversine distance in km between two lat/lng points */
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Aspect similarity: cosine of angular difference, 0-1 */
function aspectScore(a1: number, a2: number): number {
  return (1 + Math.cos(a1 - a2)) / 2;
}

/** Gaussian decay: exp(-d^2 / (2 * sigma^2)) */
function gaussianDecay(d: number, sigma: number): number {
  return Math.exp(-(d * d) / (2 * sigma * sigma));
}

/** Exponential decay with half-life in hours */
function recencyScore(hoursAgo: number): number {
  return Math.exp(-hoursAgo * Math.LN2 / 24);
}

/**
 * Score a single observation for relevance to a terrain point.
 * Returns null if below minRelevance threshold.
 */
export function scoreObservation(
  point: TerrainPoint,
  obs: RegObsObservation,
  obsAspect: number | null, // null if outside grid
  obsElevation: number,
  now: Date,
  minRelevance: number = 0.05,
): ScoredObservation | null {
  const dist = distanceKm(point.lat, point.lng, obs.lat, obs.lng);
  const elevDiff = Math.abs(point.elevation - obsElevation);
  const hoursAgo = (now.getTime() - new Date(obs.timestamp).getTime()) / (1000 * 60 * 60);

  const aScore = obsAspect !== null ? aspectScore(point.aspect, obsAspect) : 0.5;
  const eScore = gaussianDecay(elevDiff, 300);
  const rScore = recencyScore(hoursAgo);
  const pScore = gaussianDecay(dist, 15);

  // Combined: aspect^1.5 * elevation^1.2 * recency^1.0 * proximity^0.7
  const relevance = Math.pow(aScore, 1.5) * Math.pow(eScore, 1.2) * rScore * Math.pow(pScore, 0.7);

  if (relevance < minRelevance) return null;

  return {
    observation: obs,
    relevance,
    distanceKm: dist,
    elevationDiff: elevDiff,
    aspectDiff: obsAspect !== null ? Math.acos(Math.cos(point.aspect - obsAspect)) : NaN, // circular angular difference
    hoursAgo,
  };
}

/**
 * Score and filter observations, returning top N sorted by relevance.
 */
export function scoreAndFilterObservations(
  point: TerrainPoint,
  observations: RegObsObservation[],
  heights: Float64Array,
  rows: number,
  cols: number,
  cellSize: number,
  bbox: { north: number; south: number; east: number; west: number },
  now: Date = new Date(),
  maxResults: number = 25,
): ScoredObservation[] {
  const scored: ScoredObservation[] = [];

  for (const obs of observations) {
    // Map observation to grid cell for aspect/elevation
    const obsRow = Math.round(((obs.lat - bbox.south) / (bbox.north - bbox.south)) * rows - 0.5);
    const obsCol = Math.round(((obs.lng - bbox.west) / (bbox.east - bbox.west)) * cols - 0.5);

    let obsAspect: number | null = null;
    let obsElevation = obs.elevation ?? 0;

    if (obsRow >= 0 && obsRow < rows && obsCol >= 0 && obsCol < cols) {
      const gi = obsRow * cols + obsCol;
      obsElevation = heights[gi];
      const { aspect } = computeCellAspectSlope(heights, rows, cols, cellSize, obsRow, obsCol);
      obsAspect = aspect;
    }

    const result = scoreObservation(point, obs, obsAspect, obsElevation, now);
    if (result) scored.push(result);
  }

  scored.sort((a, b) => b.relevance - a.relevance);
  return scored.slice(0, maxResults);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/utils/relevance.ts
git commit -m "feat: add relevance scoring module with single-cell aspect computation"
```

---

## Task 3: RegObs API Client

**Files:**
- Create: `src/api/regobs.ts`
- Reference: `src/api/nve.ts:1-5` (cache pattern, API base URL)

- [ ] **Step 1: Create the RegObs client**

```typescript
// src/api/regobs.ts

import type { RegObsObservation } from "../types/conditions";

const REGOBS_API = "https://api.regobs.no/v5/Search";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Round to 1 decimal for cache key stability */
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
  } catch { /* quota exceeded — ignore */ }
}

/**
 * Parse raw RegObs API response into our trimmed observation format.
 * The v5/Search response has deeply nested registration arrays.
 */
function parseObservations(raw: unknown[]): RegObsObservation[] {
  return raw.map((entry: any) => {
    const regs = entry.Registrations ?? [];
    const obs: RegObsObservation = {
      id: entry.RegId ?? 0,
      lat: entry.ObsLocation?.Latitude ?? 0,
      lng: entry.ObsLocation?.Longitude ?? 0,
      timestamp: entry.DtObsTime ?? "",
      competencyLevel: entry.Observer?.CompetencyLevel ?? 1,
      elevation: entry.ObsLocation?.Height,
      registrations: {},
    };

    for (const reg of regs) {
      const tid = reg.RegistrationTID;
      const full = reg.FullObject;
      if (!full) continue;

      // TID 33 = Snow drift observation
      if (tid === 33) {
        obs.registrations.driftObs = {
          driftCategory: full.DriftExtentName ?? full.DriftExtentTID?.toString() ?? "",
          comment: full.Comment,
        };
      }
      // TID 36 = Snow surface observation
      if (tid === 36) {
        obs.registrations.snowSurface = {
          surfaceType: full.SnowSurfaceName ?? full.SnowSurfaceTID?.toString() ?? "",
          comment: full.Comment,
        };
      }
      // TID 31 = Danger signs
      if (tid === 31) {
        const signs = (full.DangerSigns ?? []).map((s: any) => s.DangerSignName ?? s.DangerSignTID?.toString() ?? "");
        obs.registrations.dangerSigns = {
          signs,
          comment: full.Comment,
        };
      }
      // TID 26 = Avalanche activity (observed)
      if (tid === 26) {
        obs.registrations.avalancheActivity = {
          type: full.AvalancheName ?? full.AvalancheTID?.toString() ?? "",
          trigger: full.AvalancheTriggerName ?? full.AvalancheTriggerTID?.toString() ?? "",
          comment: full.Comment,
        };
      }
      // TID 13 = Weather observation
      if (tid === 13) {
        obs.registrations.weather = { comment: full.Comment };
      }
    }

    return obs;
  }).filter(o => o.lat !== 0 && o.lng !== 0);
}

/**
 * Fetch RegObs snow observations within radius of a point.
 * Returns parsed, trimmed observations. Cached for 1 hour.
 */
export async function fetchRegObsObservations(
  lat: number,
  lng: number,
  radiusKm: number = 30,
  daysBack: number = 7,
  signal?: AbortSignal,
): Promise<RegObsObservation[]> {
  const key = cacheKey(lat, lng);
  const cached = getCache(key);
  if (cached) return cached;

  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - daysBack * 24 * 60 * 60 * 1000);

  const body = {
    SelectedGeoHazards: [10], // Snow
    ObserverCompetence: [],
    FromDate: fromDate.toISOString(),
    ToDate: toDate.toISOString(),
    Radius: radiusKm * 1000, // API expects meters
    Latitude: lat,
    Longitude: lng,
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/api/regobs.ts
git commit -m "feat: add RegObs API client with localStorage cache"
```

---

## Task 4: Varsom API Client

**Files:**
- Create: `src/api/varsom.ts`

- [ ] **Step 1: Create the Varsom client**

```typescript
// src/api/varsom.ts

import type { VarsomForecast } from "../types/conditions";

const VARSOM_API = "https://api.varsom.no/RegionSummary/Detail";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheKey(lat: number, lng: number): string {
  const d = new Date().toISOString().slice(0, 10);
  return `varsom_${lat.toFixed(2)}_${lng.toFixed(2)}_${d}`;
}

function getCache(key: string): VarsomForecast | null {
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

function setCache(key: string, data: VarsomForecast): void {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota exceeded */ }
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch Varsom avalanche forecast for coordinates.
 * Falls back to null if the API is unavailable or returns no data.
 */
export async function fetchVarsomForecast(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<VarsomForecast | null> {
  const key = cacheKey(lat, lng);
  const cached = getCache(key);
  if (cached) return cached;

  const today = new Date();
  const endDate = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
  const url = `${VARSOM_API}/${lat.toFixed(4)}/${lng.toFixed(4)}/2/${formatDate(today)}/${formatDate(endDate)}`;

  try {
    const resp = await fetch(url, { signal });
    if (!resp.ok) return null;

    const data = await resp.json();
    // Varsom returns an array of daily forecasts
    const latest = Array.isArray(data) ? data[0] : data;
    if (!latest) return null;

    const forecast: VarsomForecast = {
      dangerLevel: latest.DangerLevel ?? 0,
      dangerLevelName: latest.DangerLevelName ?? "Unknown",
      avalancheProblems: (latest.AvalancheProblems ?? []).map((p: any) => p.AvalancheProblemTypeName ?? ""),
      mountainWeather: latest.MountainWeather?.Comment ?? "",
      validFrom: latest.ValidFrom ?? "",
      validTo: latest.ValidTo ?? "",
    };

    setCache(key, forecast);
    return forecast;
  } catch {
    // CORS blocked or network error — return null, summary will use observations only
    return null;
  }
}
```

**Note:** If Varsom blocks CORS during testing, we'll add a proxy route later. The client already returns `null` gracefully on failure.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/api/varsom.ts
git commit -m "feat: add Varsom forecast API client with localStorage cache"
```

---

## Task 5: Lambda — Conditions Summary

**Files:**
- Create: `infra/lambda/conditions_summary.py`
- Reference: `infra/lambda/nve_proxy.py` (pattern to follow)

- [ ] **Step 1: Create the Lambda function**

```python
# infra/lambda/conditions_summary.py

import json
import os
import urllib.request

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-haiku-4-5-20251001"
MAX_TOKENS = 1024

SYSTEM_PROMPT = """You are an alpine conditions analyst for a specific terrain point in Norway. You synthesize field observations and forecasts into a concise conditions summary.

The user provides:
- A terrain point with elevation, aspect, and slope
- Nearby field observations scored by relevance (0-1) to that specific terrain
- An optional regional avalanche forecast

Return a JSON object with exactly these 4 keys:
- "windTransport": 1-2 sentences on wind drift conditions at this aspect and elevation
- "surfaceConditions": 1-2 sentences on likely snow surface based on similar-aspect observations
- "stabilityConcerns": 1-2 sentences on danger signs, wind slab, or avalanche activity
- "confidence": 1 sentence stating high/medium/low confidence, number of observations used, and most relevant data source

Prioritize observations with high relevance scores and high observer competency (5=expert, 1=novice). If the most relevant observations conflict, say so. If no observations have relevance above 0.5, state that the assessment is based on limited nearby data and the regional forecast.

Return ONLY valid JSON, no markdown or extra text."""


def build_user_message(body):
    point = body["point"]
    obs = body.get("observations", [])
    forecast = body.get("forecast")

    aspect_deg = round(point["aspect"] * 180 / 3.14159)
    dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    aspect_name = dirs[round(aspect_deg / 45) % 8]

    parts = [
        f"Terrain point: {point['lat']:.4f}N, {point['lng']:.4f}E, "
        f"{round(point['elevation'])}m elevation, {aspect_name}-facing ({aspect_deg} deg), "
        f"slope {round(point['slope'] * 180 / 3.14159)} deg"
    ]

    if forecast:
        parts.append(
            f"\nRegional forecast: Danger level {forecast['dangerLevel']} ({forecast['dangerLevelName']}). "
            f"Problems: {', '.join(forecast['avalancheProblems']) or 'None listed'}. "
            f"Weather: {forecast['mountainWeather'][:300]}"
        )
    else:
        parts.append("\nNo regional avalanche forecast available.")

    if obs:
        parts.append(f"\n{len(obs)} field observations (sorted by relevance):\n")
        for i, o in enumerate(obs[:25]):
            r = o["observation"]["registrations"]
            reg_parts = []
            if r.get("driftObs"):
                reg_parts.append(f"Drift: {r['driftObs']['driftCategory']}")
                if r["driftObs"].get("comment"):
                    reg_parts.append(f"({r['driftObs']['comment'][:100]})")
            if r.get("snowSurface"):
                reg_parts.append(f"Surface: {r['snowSurface']['surfaceType']}")
            if r.get("dangerSigns"):
                reg_parts.append(f"Danger signs: {', '.join(r['dangerSigns']['signs'][:5])}")
            if r.get("avalancheActivity"):
                reg_parts.append(f"Avalanche: {r['avalancheActivity']['type']}, trigger: {r['avalancheActivity']['trigger']}")

            parts.append(
                f"  {i+1}. relevance={o['relevance']:.2f}, "
                f"dist={o['distanceKm']:.1f}km, "
                f"elev_diff={o['elevationDiff']:.0f}m, "
                f"{o['hoursAgo']:.0f}h ago, "
                f"competency={o['observation']['competencyLevel']}/5"
                + (f" | {' | '.join(reg_parts)}" if reg_parts else " | (no snow registrations)")
            )
    else:
        parts.append("\nNo field observations available nearby.")

    return "\n".join(parts)


def lambda_handler(event, context):
    # Handle CORS preflight
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
            "body": "",
        }

    try:
        body = json.loads(event.get("body", "{}"))

        # Basic validation
        if "point" not in body:
            return {
                "statusCode": 400,
                "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                "body": json.dumps({"error": "Missing 'point' in request body"}),
            }

        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        if not api_key:
            return {
                "statusCode": 500,
                "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                "body": json.dumps({"error": "API key not configured"}),
            }

        user_message = build_user_message(body)

        payload = json.dumps({
            "model": MODEL,
            "max_tokens": MAX_TOKENS,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": user_message}],
        }).encode("utf-8")

        req = urllib.request.Request(
            ANTHROPIC_API_URL,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
        )

        with urllib.request.urlopen(req, timeout=25) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        # Extract text from Claude response
        text = result["content"][0]["text"]

        # Try to parse as JSON; fall back to wrapping raw text
        try:
            summary = json.loads(text)
        except json.JSONDecodeError:
            summary = {
                "windTransport": text[:500],
                "surfaceConditions": "",
                "stabilityConcerns": "",
                "confidence": "Low — could not parse structured response",
            }

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
            "body": json.dumps(summary),
        }

    except Exception as e:
        return {
            "statusCode": 502,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json",
            },
            "body": json.dumps({"error": str(e)}),
        }
```

- [ ] **Step 2: Verify syntax**

Run: `python3 -c "import ast; ast.parse(open('infra/lambda/conditions_summary.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add infra/lambda/conditions_summary.py
git commit -m "feat: add conditions summary Lambda (stdlib-only, calls Claude via urllib)"
```

---

## Task 6: Infrastructure — OpenTofu

**Files:**
- Modify: `infra/apigateway.tf`
- Modify: `infra/lambda.tf`

- [ ] **Step 1: Update API Gateway CORS and add route + throttling**

In `infra/apigateway.tf`, make these changes:

1. Update CORS `allow_methods` from `["GET"]` to `["GET", "POST", "OPTIONS"]`
2. Add throttling to the default stage
3. Add the new integration and route for conditions-summary

The full updated file:

```hcl
# --- API Gateway v2 (HTTP API): NVE proxy ---

resource "aws_apigatewayv2_api" "nve_proxy" {
  name          = "${var.project_name}-nve-proxy"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers = ["*"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_origins = ["*"]
  }
}

resource "aws_apigatewayv2_integration" "nve_proxy" {
  api_id                 = aws_apigatewayv2_api.nve_proxy.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.nve_proxy.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 30000
}

resource "aws_apigatewayv2_route" "nve_proxy" {
  api_id    = aws_apigatewayv2_api.nve_proxy.id
  route_key = "GET /api/nve/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.nve_proxy.id}"
}

# --- Conditions Summary route ---

resource "aws_apigatewayv2_integration" "conditions_summary" {
  api_id                 = aws_apigatewayv2_api.nve_proxy.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.conditions_summary.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 30000
}

resource "aws_apigatewayv2_route" "conditions_summary" {
  api_id    = aws_apigatewayv2_api.nve_proxy.id
  route_key = "POST /api/conditions-summary"
  target    = "integrations/${aws_apigatewayv2_integration.conditions_summary.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.nve_proxy.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = 10
    throttling_burst_limit = 100
  }
}
```

- [ ] **Step 2: Add Lambda resource to lambda.tf**

Append to `infra/lambda.tf`:

```hcl
# --- Lambda: Conditions Summary (Claude API) ---

data "archive_file" "conditions_summary" {
  type        = "zip"
  source_file = "${path.module}/lambda/conditions_summary.py"
  output_path = "${path.module}/.build/conditions_summary.zip"
}

resource "aws_lambda_function" "conditions_summary" {
  function_name    = "${var.project_name}-conditions-summary"
  role             = aws_iam_role.lambda.arn
  handler          = "conditions_summary.lambda_handler"
  runtime          = "python3.11"
  timeout          = 30
  memory_size      = 128
  filename         = data.archive_file.conditions_summary.output_path
  source_code_hash = data.archive_file.conditions_summary.output_base64sha256

  environment {
    variables = {
      ANTHROPIC_API_KEY = var.anthropic_api_key
    }
  }
}

resource "aws_lambda_permission" "conditions_summary_apigw" {
  statement_id  = "ApiGatewayInvokeConditionsSummary"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.conditions_summary.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.nve_proxy.execution_arn}/*/*"
}
```

- [ ] **Step 3: Add `*.tfvars` to `.gitignore`**

Ensure `*.tfvars` is in the root `.gitignore` to prevent accidental commit of the API key:

```
# Terraform
*.tfvars
```

- [ ] **Step 4: Add the `anthropic_api_key` variable**

Check if `infra/variables.tf` exists; if so, append to it. If not, create it. Add:

```hcl
variable "anthropic_api_key" {
  description = "Anthropic API key for conditions summary Lambda"
  type        = string
  sensitive   = true
}
```

- [ ] **Step 5: Verify OpenTofu syntax**

Run: `cd infra && tofu validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 6: Commit**

```bash
git add infra/apigateway.tf infra/lambda.tf infra/variables.tf .gitignore
git commit -m "infra: add conditions-summary Lambda, API Gateway route, CORS + throttling"
```

---

## Task 7: Vite Dev Proxy

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Add conditions-summary proxy route**

Add a second proxy entry in the `server.proxy` object. The target is the deployed API Gateway URL (same as in `nve.ts`):

```typescript
proxy: {
  "/api/nve": {
    target: "https://gts.nve.no",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/nve/, "/api"),
  },
  "/api/conditions-summary": {
    target: "https://1uv0uf8m0g.execute-api.eu-north-1.amazonaws.com",
    changeOrigin: true,
  },
},
```

- [ ] **Step 2: Verify Vite config is valid**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "feat: add Vite dev proxy for conditions-summary endpoint"
```

---

## Task 8: SnowDepthTooltip UI Expansion

**Files:**
- Modify: `src/components/SnowDepthTooltip.tsx`

- [ ] **Step 1: Add summary props and state, expand the component**

Update `SnowDepthTooltip.tsx` to accept new props for the analyze flow and display the summary:

```typescript
import type { ConditionsSummary } from "../types/conditions";

interface SnowDepthTooltipProps {
  depthCm: number;
  lat: number;
  lng: number;
  screenX: number;
  screenY: number;
  temp?: number;
  precip?: number;
  windSpeed?: number;
  windDir?: number;
  elevation?: number;
  onClose: () => void;
  // New: conditions analysis
  onAnalyze?: () => void;
  analysisLoading?: boolean;
  analysisError?: string | null;
  summary?: ConditionsSummary | null;
}

function windDirLabel(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

export default function SnowDepthTooltip({
  depthCm,
  lat,
  lng,
  screenX,
  screenY,
  temp,
  precip,
  windSpeed,
  windDir,
  elevation,
  onClose,
  onAnalyze,
  analysisLoading,
  analysisError,
  summary,
}: SnowDepthTooltipProps) {
  const style = {
    left: `${screenX + 16}px`,
    top: `${screenY - 40}px`,
  };

  const hasWeather = temp !== undefined;
  const showAnalyzeButton = onAnalyze && !summary && !analysisLoading;

  return (
    <div
      className="absolute z-30 glass-panel text-white px-4 py-3 pointer-events-auto border-l-[3px] border-l-sky-400 min-w-[180px] max-w-[320px] max-h-[70vh] overflow-y-auto"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-xl font-semibold text-sky-300 tabular-nums">
            {depthCm.toFixed(1)} cm
          </p>
          <p className="text-xs text-slate-400 font-light mt-0.5">
            Predicted snow depth
          </p>

          {hasWeather && (
            <>
              <div className="h-px bg-slate-700/50 my-2" />
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                <div>
                  <span className="text-slate-500">Temp</span>
                  <span className={`ml-1.5 font-medium tabular-nums ${temp! <= 0 ? "text-sky-300" : "text-amber-300"}`}>
                    {temp!.toFixed(1)}°C
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Precip</span>
                  <span className="ml-1.5 font-medium text-blue-300 tabular-nums">
                    {precip!.toFixed(1)} mm
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Wind</span>
                  <span className="ml-1.5 font-medium text-slate-300 tabular-nums">
                    {windSpeed!.toFixed(1)} m/s
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Dir</span>
                  <span className="ml-1.5 font-medium text-slate-300 tabular-nums">
                    {Math.round(windDir!)}° {windDirLabel(windDir!)}
                  </span>
                </div>
              </div>
            </>
          )}

          <div className="h-px bg-slate-700/50 my-1.5" />
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-light tabular-nums">
            <span>{lat.toFixed(4)}°N, {lng.toFixed(4)}°E</span>
            {elevation !== undefined && elevation >= 40 && (
              <span className="text-slate-600">·</span>
            )}
            {elevation !== undefined && elevation >= 40 && (
              <span>{Math.round(elevation)} m</span>
            )}
          </div>

          {/* Analyze conditions button */}
          {showAnalyzeButton && (
            <>
              <div className="h-px bg-slate-700/50 my-2" />
              <button
                onClick={onAnalyze}
                className="w-full text-xs text-sky-400 hover:text-sky-300 hover:bg-sky-400/10 rounded px-2 py-1.5 transition-colors text-center"
              >
                Analyze conditions
              </button>
            </>
          )}

          {/* Loading state */}
          {analysisLoading && (
            <>
              <div className="h-px bg-slate-700/50 my-2" />
              <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                <div className="w-3 h-3 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                Analyzing conditions...
              </div>
            </>
          )}

          {/* Error state */}
          {analysisError && (
            <>
              <div className="h-px bg-slate-700/50 my-2" />
              <button
                onClick={onAnalyze}
                className="w-full text-xs text-amber-400 hover:text-amber-300 rounded px-2 py-1.5 transition-colors text-center"
              >
                {analysisError} — try again
              </button>
            </>
          )}

          {/* Summary display */}
          {summary && (
            <>
              <div className="h-px bg-sky-400/30 my-2" />
              <div className="space-y-2 text-[11px]">
                <div>
                  <p className="font-semibold text-sky-300 mb-0.5">Wind & Transport</p>
                  <p className="text-slate-300 leading-relaxed">{summary.windTransport}</p>
                </div>
                <div>
                  <p className="font-semibold text-sky-300 mb-0.5">Surface</p>
                  <p className="text-slate-300 leading-relaxed">{summary.surfaceConditions}</p>
                </div>
                <div>
                  <p className="font-semibold text-sky-300 mb-0.5">Stability</p>
                  <p className="text-slate-300 leading-relaxed">{summary.stabilityConcerns}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-500 mb-0.5">Confidence</p>
                  <p className="text-slate-400 leading-relaxed italic">{summary.confidence}</p>
                </div>
              </div>
            </>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-full text-slate-500 hover:text-white hover:bg-slate-700/60 text-xs transition-all shrink-0"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors (new props are all optional, existing usage still valid)

- [ ] **Step 3: Commit**

```bash
git add src/components/SnowDepthTooltip.tsx
git commit -m "feat: expand SnowDepthTooltip with analyze button and summary display"
```

---

## Task 9: Wire Up Analysis Flow in App.tsx

**Files:**
- Modify: `src/App.tsx`

This is the integration task: connect the tooltip button to the fetch → score → Lambda pipeline.

- [ ] **Step 1: Export API Gateway URL from nve.ts**

In `src/api/nve.ts`, rename `NVE_PROXY_URL` to `API_GATEWAY_URL` and export it so other modules can reuse it:

```typescript
// Change from:
const NVE_PROXY_URL = "https://1uv0uf8m0g.execute-api.eu-north-1.amazonaws.com";
// To:
export const API_GATEWAY_URL = "https://1uv0uf8m0g.execute-api.eu-north-1.amazonaws.com";
```

Update the one existing usage in the same file to use the new name.

- [ ] **Step 2: Add imports at the top of App.tsx**

After the existing imports, add:

```typescript
import { fetchRegObsObservations } from "./api/regobs.ts";
import { fetchVarsomForecast } from "./api/varsom.ts";
import { API_GATEWAY_URL } from "./api/nve.ts";
import { computeCellAspectSlope, scoreAndFilterObservations } from "./utils/relevance.ts";
import type { ConditionsSummary, TerrainPoint } from "./types/conditions.ts";
```

- [ ] **Step 3: Add state for the analysis flow**

After the existing `depthProbe` state (around line 51), add:

```typescript
// Conditions analysis state
const [conditionsSummary, setConditionsSummary] = useState<ConditionsSummary | null>(null);
const [analysisLoading, setAnalysisLoading] = useState(false);
const [analysisError, setAnalysisError] = useState<string | null>(null);
const analyzeAbortRef = useRef<AbortController | null>(null);
```

- [ ] **Step 4: Clear analysis state when probe clears**

In the existing `useEffect` that clears the probe on step change (around line 464), also clear analysis state:

```typescript
useEffect(() => {
  setDepthProbe(null);
  setConditionsSummary(null);
  setAnalysisLoading(false);
  setAnalysisError(null);
  if (analyzeAbortRef.current) {
    analyzeAbortRef.current.abort();
    analyzeAbortRef.current = null;
  }
}, [historicalSim.currentStep]);
```

- [ ] **Step 5: Add the handleAnalyze callback**

After `handleProbeClick`, add:

```typescript
const handleAnalyze = useCallback(async () => {
  if (!depthProbe || !terrainRef.current) return;
  const terrain = terrainRef.current;

  // Abort any in-flight request
  if (analyzeAbortRef.current) analyzeAbortRef.current.abort();
  const controller = new AbortController();
  analyzeAbortRef.current = controller;

  setAnalysisLoading(true);
  setAnalysisError(null);
  setConditionsSummary(null);

  try {
    // Compute aspect/slope for clicked cell
    const { bbox } = terrain;
    const row = Math.round(((depthProbe.lat - bbox.south) / (bbox.north - bbox.south)) * terrain.rows - 0.5);
    const col = Math.round(((depthProbe.lng - bbox.west) / (bbox.east - bbox.west)) * terrain.cols - 0.5);
    const { aspect, slope } = computeCellAspectSlope(
      terrain.heights, terrain.rows, terrain.cols, terrain.cellSizeMeters, row, col,
    );

    const point: TerrainPoint = {
      lat: depthProbe.lat,
      lng: depthProbe.lng,
      elevation: depthProbe.elevation ?? terrain.heights[row * terrain.cols + col],
      aspect,
      slope,
    };

    // Fetch RegObs + Varsom in parallel
    const [observations, forecast] = await Promise.all([
      fetchRegObsObservations(point.lat, point.lng, 30, 7, controller.signal),
      fetchVarsomForecast(point.lat, point.lng, controller.signal),
    ]);

    // Score observations using terrain grid
    const scored = scoreAndFilterObservations(
      point, observations, terrain.heights, terrain.rows, terrain.cols,
      terrain.cellSizeMeters, bbox,
    );

    // POST to Lambda (API_GATEWAY_URL is exported from nve.ts)
    const apiBase = import.meta.env.DEV
      ? "/api/conditions-summary"
      : `${API_GATEWAY_URL}/api/conditions-summary`;

    const resp = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ point, observations: scored, forecast }),
      signal: controller.signal,
    });

    if (!resp.ok) throw new Error(`${resp.status}`);
    const summary: ConditionsSummary = await resp.json();

    setConditionsSummary(summary);
    setAnalysisLoading(false);
  } catch (err: any) {
    if (err.name === "AbortError") return; // cancelled, not an error
    setAnalysisError("Could not load");
    setAnalysisLoading(false);
  }
}, [depthProbe, terrainRef]);
```

- [ ] **Step 6: Pass new props to SnowDepthTooltip**

Find the `<SnowDepthTooltip` JSX in App.tsx and add the new props:

```tsx
<SnowDepthTooltip
  {...depthProbe}
  onClose={() => setDepthProbe(null)}
  onAnalyze={handleAnalyze}
  analysisLoading={analysisLoading}
  analysisError={analysisError}
  summary={conditionsSummary}
/>
```

- [ ] **Step 7: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/api/nve.ts src/App.tsx
git commit -m "feat: wire up conditions analysis flow — fetch, score, Lambda call"
```

---

## Task 10: Manual Integration Test

**Files:** None (testing only)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: Server starts on http://localhost:5173

- [ ] **Step 2: Test the full flow**

1. Open the app, search for a mountain (e.g. "Galdhopiggen")
2. Run historical simulation
3. Click a point on the snow overlay — verify tooltip shows depth + weather
4. Verify "Analyze conditions" button appears
5. Click the button — verify spinner shows "Analyzing conditions..."
6. Verify summary sections appear below the existing data
7. Click elsewhere — verify tooltip dismisses cleanly
8. Click a new point and analyze again — verify the previous analysis is cleared

- [ ] **Step 3: Test error handling**

1. Disconnect network / block the Lambda URL — click Analyze
2. Verify error message appears with "try again" option
3. Reconnect — click "try again" — verify it works

- [ ] **Step 4: Test mobile layout**

Open dev tools responsive mode at 375px width. Verify tooltip is readable and scrollable when expanded with the summary.

---

## Task 11: Deploy Infrastructure

**Files:** None (deploy only)

- [ ] **Step 1: Set the Anthropic API key variable**

Create or update `infra/terraform.tfvars` (this file should be in `.gitignore`):

```
anthropic_api_key = "<key from environment>"
```

Or pass via command line: `tofu apply -var="anthropic_api_key=$ANTHROPIC_API_KEY"`

- [ ] **Step 2: Plan and review**

Run: `cd infra && tofu plan`
Expected: Shows new Lambda + API Gateway route + updated CORS. Review carefully.

- [ ] **Step 3: Apply**

Run: `cd infra && tofu apply`
Expected: Resources created successfully.

- [ ] **Step 4: Verify Lambda is reachable**

Run: `curl -X POST https://1uv0uf8m0g.execute-api.eu-north-1.amazonaws.com/api/conditions-summary -H "Content-Type: application/json" -d '{"point":{"lat":61.6,"lng":8.3,"elevation":1200,"aspect":3.14,"slope":0.5}}'`
Expected: JSON response with summary sections (or error about no observations — both are valid)

- [ ] **Step 5: Commit tfvars to gitignore if not already**

Verify `terraform.tfvars` is in `.gitignore`. If not, add it.
