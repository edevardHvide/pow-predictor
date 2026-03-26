import json
import os
import urllib.request

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-haiku-4-5-20251001"
MAX_TOKENS = 400

SYSTEM_PROMPT = """You are an alpine conditions analyst. Be extremely concise — each field must be 1 short sentence max (under 20 words).

Return a JSON object with exactly these 4 keys:
- "dataNotice": If no relevant field observations (relevance > 0.3) exist, say "No nearby field observations." Otherwise leave empty string.
- "windTransport": 1 short sentence on drift at this aspect/elevation.
- "surfaceConditions": 1 short sentence on likely snow surface.
- "stabilityConcerns": 1 short sentence on stability issues or "No data."

Prioritize high-relevance, high-competency observations. Be direct, no hedging.

Return ONLY raw JSON, no markdown."""


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
            nick = o["observation"].get("nickName", "")
            reg_parts = []
            if r.get("snowSurface"):
                s = r["snowSurface"]
                reg_parts.append(f"Surface: {s['surfaceType']}")
                if s.get("driftName"):
                    reg_parts.append(f"Drift: {s['driftName']}")
                if s.get("comment"):
                    reg_parts.append(f"({s['comment'][:100]})")
            if r.get("dangerSigns"):
                reg_parts.append(f"Danger signs: {', '.join(r['dangerSigns']['signs'][:5])}")
            if r.get("avalancheObs"):
                a = r["avalancheObs"]
                reg_parts.append(f"Avalanche: {a['type']}, size {a['size']}, trigger: {a['trigger']}")
            if r.get("avalancheActivity"):
                for ae in r["avalancheActivity"].get("entries", [])[:3]:
                    reg_parts.append(f"Activity: {ae['type']}, {ae['size']}, trigger: {ae['trigger']}")
            if r.get("avalancheEval"):
                ev = r["avalancheEval"]
                reg_parts.append(f"Danger: {ev['dangerLevel']}")
                if ev.get("evaluation"):
                    reg_parts.append(f"Eval: {ev['evaluation'][:150]}")
            if r.get("weather"):
                w = r["weather"]
                wx = []
                if w.get("temp") is not None:
                    wx.append(f"{w['temp']}°C")
                if w.get("precipName"):
                    wx.append(w["precipName"])
                if w.get("windDirName") or w.get("windSpeedName"):
                    wx.append(f"wind {w.get('windDirName', '')} {w.get('windSpeedName', '')}".strip())
                if wx:
                    reg_parts.append(f"Weather: {', '.join(wx)}")
            if r.get("general") and r["general"].get("comment"):
                reg_parts.append(f"Note: {r['general']['comment'][:120]}")

            parts.append(
                f"  {i+1}. relevance={o['relevance']:.2f}, "
                f"dist={o['distanceKm']:.1f}km, "
                f"elev_diff={o['elevationDiff']:.0f}m, "
                f"{o['hoursAgo']:.0f}h ago"
                + (f", observer={nick}" if nick else "")
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

        # Strip markdown code fences if present
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

        # Try to parse as JSON; fall back to wrapping raw text
        try:
            summary = json.loads(cleaned)
        except json.JSONDecodeError:
            summary = {
                "dataNotice": "",
                "windTransport": text[:200],
                "surfaceConditions": "",
                "stabilityConcerns": "",
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
