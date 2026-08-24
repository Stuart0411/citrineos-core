<!--
SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project

SPDX-License-Identifier: Apache-2.0
-->

# Operator UI Deployment (Immutable Image Flow)

This guide upgrades deployment from host-side rebuilds to tagged immutable images.

## Why this flow

- Faster updates and rollbacks
- No host drift from local source differences
- Predictable releases using image tags
- Better safety with post-deploy health checks

## Files added

- `deploy/docker-compose.release.yml`
- `deploy/ui.runtime.env.example`
- `deploy/build-and-push.ps1`
- `deploy/deploy.ps1`
- `deploy/rollback.ps1`
- `.github/workflows/release-image.yml`

## GitHub Actions release pipeline

The repository now includes `.github/workflows/release-image.yml`.

It supports two modes:

- Manual run: Actions -> Release UI Image -> Run workflow
- Tag push: pushing a tag like `ui-v2026.08.24.1`

Required repository variables:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_WS_URL`
- `NEXT_PUBLIC_CITRINE_CORE_URL`
- `NEXT_PUBLIC_FILE_SERVER_URL`
- `NEXTAUTH_URL`

The workflow publishes:

- `ghcr.io/<owner>/citrineos-operator-ui:<tag>`
- Optional `:latest` alias

## One-time setup

1. Copy runtime env template.

```powershell
Copy-Item .\deploy\ui.runtime.env.example .\deploy\ui.runtime.env
```

2. Edit `deploy/ui.runtime.env` with real values (`NEXTAUTH_SECRET`, `HASURA_ADMIN_SECRET`, etc.).

3. Sign in to your container registry.

```powershell
docker login <your-registry>
```

## Build and push a release image

Set build-time variables (example values below):

```powershell
$env:NEXT_PUBLIC_API_URL='http://192.168.1.60:8090/v1/graphql'
$env:NEXT_PUBLIC_WS_URL='ws://192.168.1.60:8090/v1/graphql'
$env:NEXT_PUBLIC_CITRINE_CORE_URL='http://192.168.1.60:8080'
$env:NEXT_PUBLIC_FILE_SERVER_URL='http://192.168.1.60:8050'
$env:NEXTAUTH_URL='http://192.168.1.60:3000'
```

Build and push:

```powershell
.\deploy\build-and-push.ps1 -Image 'ghcr.io/<org>/citrineos-operator-ui' -Tag '2026.08.24.1' -AlsoTagLatest
```

## Deploy a tagged image

```powershell
.\deploy\deploy.ps1 -Image 'ghcr.io/<org>/citrineos-operator-ui' -Tag '2026.08.24.1'
```

The script will:

- Pull the requested image tag
- Recreate `citrine-ui`
- Wait until health status is `healthy`

## Rollback

```powershell
.\deploy\rollback.ps1 -Image 'ghcr.io/<org>/citrineos-operator-ui' -Tag '2026.08.23.2'
```

## Verify after deploy

```powershell
docker compose -f .\deploy\docker-compose.release.yml ps
docker compose -f .\deploy\docker-compose.release.yml logs --tail=80 citrine-ui
```

Then open:

- `http://localhost:3000/ems-plan-builder`

## Notes on cache and chunk stability

`next.config.mjs` now sends:

- `Cache-Control: no-store` for HTML responses
- `Cache-Control: public, max-age=31536000, immutable` for `/_next/static/*`

This reduces stale HTML + stale chunk mismatch during updates.
