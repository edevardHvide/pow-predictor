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
- **AWS Profile:** `tennis-bot`

## Steps

### 1. Build

```bash
cd /Users/edevard/alpine-wind && npm run build
```

Verify the build succeeds (TypeScript + Vite). Output goes to `dist/`.

### 2. Sync to S3

```bash
aws s3 sync dist/ s3://pow-predictor-frontend \
  --delete \
  --profile tennis-bot \
  --region eu-north-1
```

The `--delete` flag removes files from S3 that are no longer in `dist/`.

### 3. Invalidate CloudFront Cache

```bash
aws cloudfront create-invalidation \
  --distribution-id E1FX2FUC1H43O2 \
  --paths "/*" \
  --profile tennis-bot \
  --query 'Invalidation.Status' --output text
```

### 4. Confirm

Report the deployment URL: `https://d1y1xbjzzgjck0.cloudfront.net`

Note: CloudFront invalidation takes 1-2 minutes to propagate. The site will show old content until propagation completes.

## Important

- Always run from the alpine-wind project root
- The build requires `VITE_CESIUM_ION_TOKEN` env var for production Cesium access (falls back to demo token if not set)
- Cesium assets are ~12MB — S3 sync may take 30-60 seconds
- Do NOT change the `--delete` flag — it keeps S3 clean
