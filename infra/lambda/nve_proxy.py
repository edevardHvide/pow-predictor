import json
import urllib.request
import urllib.parse

def lambda_handler(event, context):
    # Get the path and query from the request
    raw_path = event.get("rawPath", "")
    raw_query = event.get("rawQueryString", "")

    # Strip /api/nve prefix
    nve_path = raw_path.replace("/api/nve", "/api", 1)
    url = f"https://gts.nve.no{nve_path}"
    if raw_query:
        url += f"?{raw_query}"

    try:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "PowPredictor/1.0")
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                    "Cache-Control": "public, max-age=1800",
                },
                "body": body,
            }
    except Exception as e:
        return {
            "statusCode": 502,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({"error": str(e)}),
        }
