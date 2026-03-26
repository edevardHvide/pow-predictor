---
name: deploy
description: Build and deploy Pow Predictor to AWS (S3 + CloudFront)
user_invocable: true
---

# /deploy — Deploy Pow Predictor to AWS

Build the Vite app and deploy to S3 with CloudFront cache invalidation.

## AWS Resources

- **S3 Bucket:** `pow-predictor-frontend`
- **CloudFront Distribution:** `E1FX2FUC1H43O2`
- **Domain:** `https://d1y1xbjzzgjck0.cloudfront.net`
- **NVE Proxy API:** `https://1uv0uf8m0g.execute-api.eu-north-1.amazonaws.com` (API Gateway + Lambda)
- **Region:** `eu-north-1`
- **AWS Profile:** `pow-predictor`

## Steps

### 1. Commit Pending Changes

Before deploying, commit all staged and unstaged changes. Review the diff, write a descriptive commit message, and commit. If there are no changes, skip this step.

### 2. Bump Version

Bump the patch version in `package.json` using `npm version patch --no-git-tag-version`. This increments the version (e.g. `0.0.1` → `0.0.2`) which is displayed in the UI via `__APP_VERSION__` (defined in `vite.config.ts`, shown in `ControlPanel.tsx`).

```bash
cd /Users/edevard/pow-predictor && npm version patch --no-git-tag-version
```

Then commit the version bump:

```bash
git add package.json package-lock.json && git commit -m "chore: bump version to $(node -p 'require(\"./package.json\").version')"
```

### 3. Build

```bash
cd /Users/edevard/pow-predictor && npm run build
```

Verify the build succeeds (TypeScript + Vite). Output goes to `dist/`.

### 4. Sync to S3

```bash
aws s3 sync dist/ s3://pow-predictor-frontend \
  --delete \
  --profile pow-predictor \
  --region eu-north-1
```

The `--delete` flag removes files from S3 that are no longer in `dist/`.

### 5. Invalidate CloudFront Cache

```bash
aws cloudfront create-invalidation \
  --distribution-id E1FX2FUC1H43O2 \
  --paths "/*" \
  --profile pow-predictor \
  --query 'Invalidation.Status' --output text
```

### 6. Confirm

Report the deployment URL: `https://d1y1xbjzzgjck0.cloudfront.net`

Note: CloudFront invalidation takes 1-2 minutes to propagate. The site will show old content until propagation completes.

### 7. Update README if needed

If features were added or changed, update `README.md` to reflect the current state. Key sections to check:
- Features list
- Weather data sources
- Tech stack
- Usage instructions

## Important

- Always run from the pow-predictor project root
- The build requires `VITE_CESIUM_ION_TOKEN` env var for production Cesium access (falls back to demo token if not set)
- Cesium assets are ~12MB — S3 sync may take 30-60 seconds
- Do NOT change the `--delete` flag — it keeps S3 clean
- The app is a PWA — after deploy, users may need to clear cache or reinstall from home screen to get updates
