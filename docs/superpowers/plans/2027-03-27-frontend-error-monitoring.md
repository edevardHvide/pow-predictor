# Frontend Error Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catch all user-facing errors (frontend JS crashes + backend Lambda failures) and have a scheduled agent review logs, create fix plans, and request Telegram approval before deploying fixes.

**Architecture:** A new frontend error reporter POSTs errors to a new Lambda (`pow-predictor-frontend-errors`) which writes structured JSON to CloudWatch. The operations-bot skill is updated to also check this log group. A `/schedule` trigger runs the operations-bot every 30 minutes.

**Tech Stack:** Python 3.11 (Lambda), TypeScript (frontend error handler), OpenTofu (infra), Claude Code `/schedule` (agent trigger)

---

### Task 1: Create Frontend Error Ingestion Lambda

**Files:**
- Create: `infra/lambda/frontend_errors.py`

- [ ] **Step 1: Write the Lambda handler**

```python
import json

# CORS is handled by API Gateway cors_configuration — no manual headers needed.

def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return {"statusCode": 400, "body": json.dumps({"error": "Invalid JSON"})}

    errors = body.get("errors", [])
    if not errors or not isinstance(errors, list):
        return {"statusCode": 400, "body": json.dumps({"error": "errors array required"})}

    # Write structured JSON to stdout → CloudWatch Logs
    for err in errors[:10]:  # Cap at 10 per batch
        print(json.dumps({
            "level": "ERROR",
            "type": err.get("type", "unknown"),
            "message": err.get("message", ""),
            "source": err.get("source", ""),
            "lineno": err.get("lineno"),
            "colno": err.get("colno"),
            "stack": err.get("stack", "")[:2000],
            "url": err.get("url", ""),
            "userAgent": err.get("userAgent", ""),
            "timestamp": err.get("timestamp", ""),
        }))

    return {"statusCode": 200, "body": json.dumps({"ok": True, "count": len(errors)})}
```

- [ ] **Step 2: Commit**

```bash
git add infra/lambda/frontend_errors.py
git commit -m "feat: add frontend error ingestion Lambda handler"
```

---

### Task 2: Add Lambda + API Gateway Route in OpenTofu

**Files:**
- Modify: `infra/lambda.tf` (append new Lambda resource)
- Modify: `infra/apigateway.tf` (append new route)
- Modify: `infra/iam.tf` (add new Lambda ARN to LambdaManage resource list)

- [ ] **Step 1: Add Lambda resource to `infra/lambda.tf`**

Append after the feedback Lambda block (after line 112):

```hcl
# --- Lambda: Frontend Error Ingestion ---

data "archive_file" "frontend_errors" {
  type        = "zip"
  source_file = "${path.module}/lambda/frontend_errors.py"
  output_path = "${path.module}/.build/frontend_errors.zip"
}

resource "aws_lambda_function" "frontend_errors" {
  function_name    = "${var.project_name}-frontend-errors"
  role             = aws_iam_role.lambda.arn
  handler          = "frontend_errors.lambda_handler"
  runtime          = "python3.11"
  timeout          = 5
  memory_size      = 128
  filename         = data.archive_file.frontend_errors.output_path
  source_code_hash = data.archive_file.frontend_errors.output_base64sha256
}

resource "aws_lambda_permission" "frontend_errors_apigw" {
  statement_id  = "ApiGatewayInvokeFrontendErrors"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.frontend_errors.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.nve_proxy.execution_arn}/*/*"
}
```

- [ ] **Step 2: Add API Gateway route to `infra/apigateway.tf`**

Append after the feedback route block (after line 61):

```hcl
# --- Frontend Errors route ---

resource "aws_apigatewayv2_integration" "frontend_errors" {
  api_id                 = aws_apigatewayv2_api.nve_proxy.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.frontend_errors.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 5000
}

resource "aws_apigatewayv2_route" "frontend_errors" {
  api_id    = aws_apigatewayv2_api.nve_proxy.id
  route_key = "POST /api/errors"
  target    = "integrations/${aws_apigatewayv2_integration.frontend_errors.id}"
}
```

- [ ] **Step 3: Add new Lambda ARN to IAM deploy policy in `infra/iam.tf`**

Add `aws_lambda_function.frontend_errors.arn` to the `LambdaManage` Resource list (after line 48):

```hcl
Resource = [
  aws_lambda_function.nve_proxy.arn,
  aws_lambda_function.conditions_summary.arn,
  aws_lambda_function.feedback.arn,
  aws_lambda_function.frontend_errors.arn,
]
```

- [ ] **Step 4: Run `tofu plan` to verify**

```bash
cd infra && tofu plan
```

Expected: 4 new resources (Lambda, permission, integration, route). No destroys.

- [ ] **Step 5: Run `tofu apply` to deploy**

```bash
cd infra && tofu apply -auto-approve
```

- [ ] **Step 6: Commit**

```bash
git add infra/lambda.tf infra/apigateway.tf infra/iam.tf
git commit -m "infra: add frontend-errors Lambda and API Gateway route"
```

---

### Task 3: Add Frontend Error Reporter

**Files:**
- Create: `src/utils/error-reporter.ts`
- Modify: `src/main.tsx` (initialize error reporter)

- [ ] **Step 1: Create error reporter module**

Create `src/utils/error-reporter.ts`:

```typescript
import { API_GATEWAY_URL } from "../api/nve.ts";

const ERRORS_ENDPOINT = import.meta.env.DEV
  ? "/api/errors"
  : `${API_GATEWAY_URL}/api/errors`;

const MAX_ERRORS_PER_SESSION = 10;
let errorCount = 0;
const errorQueue: Record<string, unknown>[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const seen = new Set<string>();

function dedupeKey(error: Record<string, unknown>): string {
  return `${error.message}|${error.source}|${error.lineno}`;
}

function enqueue(error: Record<string, unknown>) {
  if (errorCount >= MAX_ERRORS_PER_SESSION) return;
  const key = dedupeKey(error);
  if (seen.has(key)) return;
  seen.add(key);
  errorCount++;
  errorQueue.push(error);

  // Batch: flush after 2s or when queue hits 5
  if (!flushTimer) {
    flushTimer = setTimeout(flush, 2000);
  }
  if (errorQueue.length >= 5) {
    flush();
  }
}

function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (errorQueue.length === 0) return;

  const batch = errorQueue.splice(0);
  fetch(ERRORS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ errors: batch }),
    keepalive: true,
  }).catch(() => {
    // Silently fail — don't create error loops
  });
}

export function initErrorReporter() {
  window.addEventListener("error", (event) => {
    enqueue({
      type: "uncaught",
      message: event.message,
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack || "",
      url: location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    enqueue({
      type: "unhandledrejection",
      message: reason?.message || String(reason),
      stack: reason?.stack || "",
      url: location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    });
  });
}

/** Report a caught error explicitly. Named sendErrorReport to avoid collision with window.reportError. */
export function sendErrorReport(error: Error, context?: string) {
  enqueue({
    type: "caught",
    message: error.message,
    stack: error.stack || "",
    context: context || "",
    url: location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  });
}
```

- [ ] **Step 2: Initialize in `src/main.tsx`**

Add before the `createRoot` call:

```typescript
import { initErrorReporter } from "./utils/error-reporter.ts";

initErrorReporter();
```

Full file should be:

```typescript
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initErrorReporter } from "./utils/error-reporter.ts";

initErrorReporter();

// No StrictMode — Cesium's Viewer does direct DOM manipulation
// that conflicts with React's double-mount in development
createRoot(document.getElementById("root")!).render(<App />);
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/error-reporter.ts src/main.tsx
git commit -m "feat: add frontend error reporter with batching and session cap"
```

---

### Task 4: Add `sendErrorReport` to Key API Calls

**Files:**
- Modify: `src/App.tsx` (wrap critical catch blocks)

- [ ] **Step 1: Add import to `src/App.tsx`**

Add to imports:
```typescript
import { sendErrorReport } from "./utils/error-reporter.ts";
```

- [ ] **Step 2: Add `reportError` to the conditions-summary fetch catch block**

Find the `.catch` block for the conditions-summary fetch (around line 600) and add `reportError`:

```typescript
.catch((err) => {
  sendErrorReport(err, "conditions-summary");
  // ... existing error handling
});
```

- [ ] **Step 3: Add `reportError` to the historical sim failure handler**

Find the `console.error("Historical sim failed:", err)` line (around line 396) and add:

```typescript
console.error("Historical sim failed:", err);
sendErrorReport(err instanceof Error ? err : new Error(String(err)), "historical-sim");
```

- [ ] **Step 4: Add `sendErrorReport` to weather fetch failures**

Find the `fetchSpatialWeather` call's `.catch` block and add `sendErrorReport(err instanceof Error ? err : new Error(String(err)), "weather-fetch")`.

- [ ] **Step 5: Verify build passes**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: report caught errors from API calls and simulation failures"
```

---

### Task 5: Add Vite Dev Server Proxy for `/api/errors`

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Add proxy entry for `/api/errors`**

In the Vite config `server.proxy` section, add:

```typescript
"/api/errors": {
  target: "https://1uv0uf8m0g.execute-api.eu-north-1.amazonaws.com",
  changeOrigin: true,
},
```

- [ ] **Step 2: Commit**

```bash
git add vite.config.ts
git commit -m "chore: add dev proxy for /api/errors endpoint"
```

---

### Task 6: Update Operations Bot Skill to Check Frontend Errors

**Files:**
- Modify: `.claude/skills/operations-bot/skill.md`

- [ ] **Step 1: Add frontend error log check to health check section**

In step 1a, add a fourth CloudWatch check:

```
aws logs filter-log-events --log-group-name /aws/lambda/pow-predictor-frontend-errors --filter-pattern "ERROR" --start-time $(date -v-2H +%s000) --profile pow-predictor --region eu-north-1 --max-items 10
```

- [ ] **Step 2: Add the new Lambda to the AWS Details section**

Update Lambdas list:
```
- **Lambdas:** `pow-predictor-nve-proxy`, `pow-predictor-conditions-summary`, `pow-predictor-feedback`, `pow-predictor-frontend-errors`
```

- [ ] **Step 3: Add frontend error triage guidance**

Add a new section after the CloudFront check:

```markdown
## Frontend Error Triage

When frontend errors are found in `/aws/lambda/pow-predictor-frontend-errors` logs:
- Group errors by `type` and `message` to identify distinct issues
- Check `userAgent` to determine if it's a browser compatibility issue vs a real bug
- Check `source` and `lineno` to identify the failing code
- Errors with `context: "weather-fetch"` or `context: "conditions-summary"` may indicate backend issues — cross-reference with the corresponding Lambda logs
- Only alert on errors that are actionable (not browser extensions, old browsers, etc.)
```

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/operations-bot/skill.md
git commit -m "feat: update operations-bot to monitor frontend error logs"
```

---

### Task 7: Update CLAUDE.md with New Lambda

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add frontend-errors Lambda to Architecture/Infrastructure sections**

Add to the Lambda list in the Infrastructure section:
```
- **Lambda:** `pow-predictor-frontend-errors` (Python 3.11, ingests frontend JS errors to CloudWatch)
```

Add to the API Gateway routes:
```
`POST /api/errors` — frontend error ingestion
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add frontend-errors Lambda to CLAUDE.md"
```

---

### Task 8: Deploy Frontend and Set Up Scheduled Agent

**Files:** None (operational steps)

- [ ] **Step 1: Build and deploy frontend**

Use the `/deploy` skill to build and deploy the frontend with the new error reporter.

- [ ] **Step 2: Verify the error endpoint works**

```bash
curl -s -X POST "https://1uv0uf8m0g.execute-api.eu-north-1.amazonaws.com/api/errors" \
  -H "Content-Type: application/json" \
  -d '{"errors":[{"type":"test","message":"monitoring setup verification","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}]}' | jq .
```

Expected: `{"ok": true, "count": 1}`

- [ ] **Step 3: Verify the error appears in CloudWatch**

```bash
aws logs filter-log-events --log-group-name /aws/lambda/pow-predictor-frontend-errors \
  --filter-pattern "monitoring setup verification" \
  --start-time $(date -v-5M +%s000) \
  --profile pow-predictor --region eu-north-1
```

Expected: One event with the test error.

- [ ] **Step 4: Set up scheduled agent**

Use `/schedule` to create a trigger that runs the operations-bot every 30 minutes. The agent should:
1. Run the operations-bot skill (Lambda health + CloudFront + frontend error checks)
2. Only message via Telegram when actionable errors are found
3. Include a fix plan and wait for approval before implementing

- [ ] **Step 5: Final verification commit (if any unstaged changes remain)**

Stage only specific changed files — do not use `git add -A`.
