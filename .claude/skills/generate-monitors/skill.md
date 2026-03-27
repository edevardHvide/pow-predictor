---
name: generate-monitors
description: Analyze deploy diff for risk, generate/update monitoring rules. Run after /deploy to create production monitors for new code.
user_invocable: true
---

# /generate-monitors — Post-Deploy Monitor Generation

Analyze the code changes in the latest deploy and generate monitoring rules for production. Only creates monitors for substantial/risky changes — skips UI-only deploys.

## When to Run

After every `/deploy`. Can also be run manually to regenerate rules.

## Steps

### 1. Determine what changed

Get the diff since the last monitored deploy:

```bash
# Read the last deploy commit from rules.json
LAST_COMMIT=$(python3 -c "import json; print(json.load(open('monitoring/rules.json')).get('deploy_commit', 'HEAD~5'))" 2>/dev/null || echo "HEAD~5")
git diff --name-only $LAST_COMMIT..HEAD
```

### 2. Classify risk level

Categorize each changed file:

**High risk (generate monitors):**
- `infra/lambda/*.py` — Lambda code changes
- `infra/*.tf` — Infrastructure changes
- `src/api/*.ts` — API client changes
- `src/simulation/*.ts` — Worker/simulation logic
- `src/hooks/*.ts` — Core app hooks
- `package.json` — New dependencies

**Low risk (skip):**
- `src/components/*.tsx` — UI components (unless they contain API calls or error handling)
- `src/rendering/*.ts` — Visual rendering
- `*.css`, `*.md`, `docs/`, `.claude/` — Styling, docs, config
- `package.json` version-only bumps
- `vite.config.ts` — Build config

If ALL changed files are low risk → log "Low risk deploy, no monitor updates needed" and stop.

### 3. Analyze high-risk changes

For each high-risk file, read the diff and determine:
- What could break? (new endpoints, changed request formats, new error paths)
- What metric would show the breakage? (`error_rate`, `total_errors`, `avg_duration`, smoke test status)
- What's a reasonable threshold?

### 4. Generate/update rules

Read the existing `monitoring/rules.json`. For each high-risk change:
- If a rule already exists for that source file → update it
- If no rule exists → create a new one
- If a source file was deleted → remove its rule

**Rule template:**
```json
{
  "id": "<lambda-or-component>-<metric>",
  "name": "Human readable description",
  "metric": "error_rate | total_errors | avg_duration | smoke.site.ok | smoke.api.ok",
  "lambda": "pow-predictor-<name>",
  "condition": "< 5",
  "sensitivity": 2,
  "consecutive_violations": 0,
  "source": "path/to/source/file.ts",
  "created_by_commit": "<current HEAD>",
  "last_tuned": null
}
```

**Condition operators:** `< N` (less than), `> N` (greater than), `== true` (equals), `!= 0` (not zero)

**Sensitivity:** Start at 2 (require 2 consecutive violations before alerting). Operations bot increases this on false positives.

### 5. Write and commit

Update `monitoring/rules.json` with:
- `generated_at`: current ISO timestamp
- `deploy_commit`: current HEAD sha
- `rules`: merged rule array

```bash
git add monitoring/rules.json
git commit -m "monitoring: update rules for $(git rev-parse --short HEAD)"
git push
```

### 6. Report

Log what was generated:
- How many files analyzed
- How many rules created/updated/removed
- List of active rules

## Important

- Do NOT create rules for things the monitor Lambda doesn't track. Only use metrics available from `/api/monitor`: `error_rate`, `total_errors`, `total_invocations`, `avg_duration`, `invocations[]`, `errors[]`, `smoke.site.ok`, `smoke.api.ok`
- Keep rules minimal — better to have 5 meaningful rules than 50 noisy ones
- Use conservative thresholds — false positives waste time and erode trust
- The operations bot will auto-tune sensitivity on false positives
