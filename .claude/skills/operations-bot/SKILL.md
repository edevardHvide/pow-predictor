---
name: operations-bot
description: Check Lambda/API health, process GitHub issues, get Telegram approval from owner, implement, deploy, and celebrate with the requestor
user_invocable: true
---

1. **Lambda health check** — Verify all three Lambdas are healthy:
   a. Check each Lambda for recent errors in CloudWatch (last 2 hours):
      ```
      aws logs filter-log-events --log-group-name /aws/lambda/pow-predictor-nve-proxy --filter-pattern "ERROR" --start-time $(date -v-2H +%s000) --profile pow-predictor --region eu-north-1 --max-items 5
      aws logs filter-log-events --log-group-name /aws/lambda/pow-predictor-conditions-summary --filter-pattern "ERROR" --start-time $(date -v-2H +%s000) --profile pow-predictor --region eu-north-1 --max-items 5
      aws logs filter-log-events --log-group-name /aws/lambda/pow-predictor-feedback --filter-pattern "ERROR" --start-time $(date -v-2H +%s000) --profile pow-predictor --region eu-north-1 --max-items 5
      aws logs filter-log-events --log-group-name /aws/lambda/pow-predictor-frontend-errors --filter-pattern "ERROR" --start-time $(date -v-2H +%s000) --profile pow-predictor --region eu-north-1 --max-items 10
      ```
   b. Smoke-test the NVE proxy API (should return weather data):
      ```
      curl -s -o /dev/null -w "%{http_code}" "https://1uv0uf8m0g.execute-api.eu-north-1.amazonaws.com/api/nve/GridTimeSeries/v2?startDate=$(date +%Y-%m-%d)&endDate=$(date +%Y-%m-%d)&x=19.0&y=69.6&parameterIds=weather_temperature"
      ```
   c. If any Lambda has errors or the API returns non-200, create a GitHub issue:
      ```
      gh issue create --title "Bug: <Lambda name> errors detected" --body "<error details from CloudWatch>" --label bug
      ```
   d. Before creating the issue, check for existing open issues with the same title to avoid duplicates:
      ```
      gh issue list --search "Bug: <Lambda name> errors" --state open
      ```
   e. If everything is healthy, log it and move on.

2. **CloudFront check** — Verify the site is reachable:
   ```
   curl -s -o /dev/null -w "%{http_code}" "https://powpredictor.info"
   ```
   If non-200, create a GitHub issue.

## Frontend Error Triage

When frontend errors are found in `/aws/lambda/pow-predictor-frontend-errors` logs:
- Group errors by `type` and `message` to identify distinct issues
- Check `userAgent` to determine if it's a browser compatibility issue vs a real bug
- Check `source` and `lineno` to identify the failing code
- Errors with `context: "weather-fetch"` or `context: "conditions-summary"` may indicate backend issues — cross-reference with the corresponding Lambda logs
- Only alert on errors that are actionable (not browser extensions, old browsers, etc.)

3. Check GitHub for new issues created in the last hour using `gh issue list`.
4. For each new issue:
   a. Analyze the issue and create an implementation plan.
   b. Send the plan to the owner via Telegram (chat_id: `8777542698`) using the `mcp__plugin_telegram_telegram__reply` tool and ask for an OK before proceeding.
   c. Wait for the owner's approval in Telegram. The owner will reply in Telegram — look for their response in the conversation.
   d. Once approved, implement the changes.
   e. Commit and deploy the changes using the `/deploy` skill.
   f. Send a celebratory email to the feature requestor (the person who created the issue / submitted feedback) describing what was done, in a very celebratory tone.

## Communication

- **Primary channel: Telegram** — chat_id `8777542698`
- Use `mcp__plugin_telegram_telegram__reply` for all owner communication (status updates, approvals, alerts, celebrations)
- Always notify the owner via Telegram when: health checks find issues, new GitHub issues are found, implementation is complete, deploys succeed/fail

## AWS Details

- **Profile:** `pow-predictor` for everything
- **Region:** `eu-north-1`
- **Lambdas:** `pow-predictor-nve-proxy`, `pow-predictor-conditions-summary`, `pow-predictor-feedback`, `pow-predictor-frontend-errors`
- **API Gateway:** `https://1uv0uf8m0g.execute-api.eu-north-1.amazonaws.com`
- **CloudFront:** `E1FX2FUC1H43O2`
- **Site:** `https://powpredictor.info`

## Gotchas — Deployment

- **Always use the `/deploy` skill** for frontend deploys — it handles version bump, build, S3 sync, and CloudFront invalidation.
- **Lambda deploys use `pow-predictor` profile.** Each Lambda is a separate zip — do NOT deploy `conditions_summary.py` to the NVE proxy function or vice versa.
- **Old zip files may not be overwritten.** On macOS, `zip -qr` may append to existing archives rather than replace them. Always `rm` the old zip before creating a new one.
- **Verify Lambda works after deploy.** Check CloudWatch logs for the next invocation. A successful `update-function-code` does NOT mean the code runs — missing deps will crash at import time.

## Gotchas — Email

- **Use `python3` not `python` on macOS.** There is no `python` binary; use `python3` directly.
- **Pipe `echo "send"` to auto-confirm.** Send scripts that prompt for confirmation need `echo "send"` piped in for non-TTY contexts.

## Gotchas — GitHub CLI

- **`gh issue list` has no `--sort` flag.** Use `-L` (limit) and `--json` fields, then sort in post-processing if needed.
