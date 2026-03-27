import json
import os
import time
import urllib.request
import urllib.error
import boto3

REGION = "eu-north-1"
LAMBDA_LOG_GROUPS = [
    "/aws/lambda/pow-predictor-nve-proxy",
    "/aws/lambda/pow-predictor-conditions-summary",
    "/aws/lambda/pow-predictor-feedback",
    "/aws/lambda/pow-predictor-frontend-errors",
]
SITE_URL = "https://powpredictor.info"
# Hit API GW root — expect 404 (no route), but proves gateway is up. 5xx or connection error = problem.
API_GW_URL = "https://1uv0uf8m0g.execute-api.eu-north-1.amazonaws.com/"


def lambda_handler(event, context):
    logs_client = boto3.client("logs", region_name=REGION)
    two_hours_ago = int((time.time() - 7200) * 1000)
    results = {"errors": {}, "smoke": {}, "healthy": True}

    # Check CloudWatch logs for errors
    for log_group in LAMBDA_LOG_GROUPS:
        name = log_group.split("/")[-1]
        try:
            resp = logs_client.filter_log_events(
                logGroupName=log_group,
                filterPattern="ERROR",
                startTime=two_hours_ago,
                limit=10,
            )
            events = resp.get("events", [])
            if events:
                results["errors"][name] = [
                    {"message": e["message"].strip(), "timestamp": e["timestamp"]}
                    for e in events
                ]
                results["healthy"] = False
        except logs_client.exceptions.ResourceNotFoundException:
            pass  # Log group doesn't exist yet — no invocations, that's fine
        except Exception as e:
            results["errors"][name] = [{"message": f"Log check failed: {str(e)}", "timestamp": int(time.time() * 1000)}]
            results["healthy"] = False

    # Smoke test site
    for label, url in [("site", SITE_URL), ("api", API_GW_URL)]:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "pow-predictor-monitor"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                results["smoke"][label] = {"status": resp.status, "ok": True}
        except urllib.error.HTTPError as e:
            # 4xx = server is up but bad request/route — that's fine for smoke test
            is_ok = 400 <= e.code < 500
            results["smoke"][label] = {"status": e.code, "ok": is_ok}
            if not is_ok:
                results["healthy"] = False
        except Exception as e:
            results["smoke"][label] = {"status": 0, "ok": False, "error": str(e)[:200]}
            results["healthy"] = False

    return {
        "statusCode": 200,
        "body": json.dumps(results),
    }
