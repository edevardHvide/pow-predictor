import json
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import boto3

REGION = "eu-north-1"
LAMBDA_FUNCTIONS = [
    "pow-predictor-nve-proxy",
    "pow-predictor-conditions-summary",
    "pow-predictor-feedback",
    "pow-predictor-frontend-errors",
]
LAMBDA_LOG_GROUPS = [f"/aws/lambda/{fn}" for fn in LAMBDA_FUNCTIONS]
SITE_URL = "https://d1y1xbjzzgjck0.cloudfront.net"
# Hit API GW root — expect 404 (no route), but proves gateway is up. 5xx or connection error = problem.
API_GW_URL = "https://1uv0uf8m0g.execute-api.eu-north-1.amazonaws.com/"

METRIC_PERIOD = 300  # 5 minutes
METRIC_WINDOW = 1800  # 30 minutes (6 data points)


def collect_errors(logs_client, two_hours_ago):
    """Scan CloudWatch logs for ERROR patterns."""
    errors = {}
    healthy = True
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
                errors[name] = [
                    {"message": e["message"].strip(), "timestamp": e["timestamp"]}
                    for e in events
                ]
                healthy = False
        except logs_client.exceptions.ResourceNotFoundException:
            pass
        except Exception as e:
            errors[name] = [{"message": f"Log check failed: {str(e)}", "timestamp": int(time.time() * 1000)}]
            healthy = False
    return errors, healthy


def collect_metrics(cw_client):
    """Fetch invocation count, error count, and avg duration for each Lambda."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(seconds=METRIC_WINDOW)

    queries = []
    for i, fn in enumerate(LAMBDA_FUNCTIONS):
        for j, (metric, stat) in enumerate([
            ("Invocations", "Sum"),
            ("Errors", "Sum"),
            ("Duration", "Average"),
        ]):
            queries.append({
                "Id": f"m{i}_{j}",
                "MetricStat": {
                    "Metric": {
                        "Namespace": "AWS/Lambda",
                        "MetricName": metric,
                        "Dimensions": [{"Name": "FunctionName", "Value": fn}],
                    },
                    "Period": METRIC_PERIOD,
                    "Stat": stat,
                },
                "ReturnData": True,
            })

    try:
        resp = cw_client.get_metric_data(
            MetricDataQueries=queries,
            StartTime=start,
            EndTime=now,
            ScanBy="TimestampAscending",
        )
    except Exception as e:
        return {"error": str(e)[:200]}

    metrics = {}
    results_map = {r["Id"]: r for r in resp["MetricDataResults"]}

    for i, fn in enumerate(LAMBDA_FUNCTIONS):
        inv_values = results_map.get(f"m{i}_0", {}).get("Values", [])
        err_values = results_map.get(f"m{i}_1", {}).get("Values", [])
        dur_values = results_map.get(f"m{i}_2", {}).get("Values", [])

        total_inv = sum(inv_values) if inv_values else 0
        total_err = sum(err_values) if err_values else 0

        metrics[fn] = {
            "invocations": [int(v) for v in inv_values],
            "errors": [int(v) for v in err_values],
            "avg_duration": [round(v) for v in dur_values],
            "period_seconds": METRIC_PERIOD,
            "total_invocations": int(total_inv),
            "total_errors": int(total_err),
            "error_rate": round(total_err / total_inv * 100, 1) if total_inv > 0 else 0,
        }

    return metrics


def smoke_test():
    """HTTP smoke tests with latency measurement."""
    smoke = {}
    for label, url in [("site", SITE_URL), ("api", API_GW_URL)]:
        start = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "pow-predictor-monitor"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                latency = round((time.time() - start) * 1000)
                smoke[label] = {"status": resp.status, "ok": True, "latency_ms": latency}
        except urllib.error.HTTPError as e:
            latency = round((time.time() - start) * 1000)
            is_ok = 400 <= e.code < 500
            smoke[label] = {"status": e.code, "ok": is_ok, "latency_ms": latency}
        except Exception as e:
            latency = round((time.time() - start) * 1000)
            smoke[label] = {"status": 0, "ok": False, "error": str(e)[:200], "latency_ms": latency}
    return smoke


def lambda_handler(event, context):
    logs_client = boto3.client("logs", region_name=REGION)
    cw_client = boto3.client("cloudwatch", region_name=REGION)
    two_hours_ago = int((time.time() - 7200) * 1000)

    with ThreadPoolExecutor(max_workers=3) as pool:
        errors_future = pool.submit(collect_errors, logs_client, two_hours_ago)
        metrics_future = pool.submit(collect_metrics, cw_client)
        smoke_future = pool.submit(smoke_test)

        errors, logs_healthy = errors_future.result()
        metrics = metrics_future.result()
        smoke = smoke_future.result()

    smoke_healthy = all(s.get("ok", False) for s in smoke.values())

    return {
        "statusCode": 200,
        "body": json.dumps({
            "errors": errors,
            "smoke": smoke,
            "metrics": metrics,
            "healthy": logs_healthy and smoke_healthy,
        }),
    }
