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
                "confidence": "Low -- could not parse structured response",
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
