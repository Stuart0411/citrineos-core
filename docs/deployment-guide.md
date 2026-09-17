# CitrineOS Deployment Guide (Beginner-Friendly)

This page is the full step-by-step deployment guide.

Need the short path first? Start here: [Quick Start (10 Minutes)](./quick-start.md).
Running production releases? Use [Production Runbook](./production-runbook.md).
Setting up CSIP-Aus MQTT flow? Use [MQTT Setup (CSIP-Aus -> CitrineOS -> EV)](./mqtt-setup.md).
Return to the landing page: [Docs Home](./index.md).

It covers:

1. First-time GitHub and token setup
2. Building and publishing the Operator UI image
3. Deploying the Operator UI image
4. Deploying the CitrineOS server image
5. Verifying the deployment
6. Rolling back safely
7. Troubleshooting common failures
8. Summary of custom changes vs original upstream repos

---

## 1) What You Are Deploying

This workspace includes two deployable parts:

1. `citrineos-operator-ui` (Next.js operator web app)
2. `citrineos-core` (CitrineOS server)

Both use immutable image deployment in this workflow:

1. Build image with a unique tag
2. Push image to GHCR (`ghcr.io`)
3. Pull and run that exact image on the host

---

## 2) One-Time Prerequisites

## 2.1 Install Required Tools

On Windows, install and verify:

1. Git
2. Docker Desktop
3. PowerShell 7+ (Windows PowerShell also works for these scripts)

Verify:

```powershell
git --version
docker --version
docker compose version
```

## 2.2 Create GitHub Personal Access Token (PAT) for GHCR

You need this to push images.

1. Open GitHub -> Settings -> Developer settings -> Personal access tokens
2. Create a token (classic is simplest for this workflow)
3. Give it at least:
   - `read:packages`
   - `write:packages`
   - `delete:packages` (optional but useful)
4. Copy the token immediately (you cannot view it again)

Security note:

1. If a token is ever shown in terminal/chat logs, revoke it immediately and create a new one.

## 2.3 Set GHCR Environment Variables

In PowerShell (current terminal session):

```powershell
$env:GHCR_USERNAME = 'your-github-username'
$env:GHCR_TOKEN = 'your-token-value'
```

Optional persistent user environment (new terminals only):

```powershell
setx GHCR_USERNAME "your-github-username"
setx GHCR_TOKEN "your-token-value"
```

Important:

1. `setx` does not update already-open terminals.
2. Re-open PowerShell after `setx`, or set `$env:` values in current shell.

---

## 3) Repository Setup (If You Are New to GitHub)

## 3.1 Fork and Clone

1. Fork upstream repos to your GitHub account.
2. Clone your fork(s) locally.
3. Open in VS Code.

Example:

```powershell
git clone https://github.com/<your-user>/citrineos-core.git
git clone https://github.com/<your-user>/citrineos-operator-ui.git
```

In this workspace, those projects are already under:

1. `citrineos-core`
2. `citrineos-operator-ui`

## 3.2 Keep a Clean Commit History

Before release:

```powershell
git status
```

1. Commit or stash unrelated local changes.
2. Tag releases clearly (`YYYY.MM.DD.N` pattern is already in use).

---

## 4) Operator UI Deployment (Detailed)

Scripts used:

1. `citrineos-operator-ui/deploy/build-and-push.ps1`
2. `citrineos-operator-ui/deploy/deploy.ps1`
3. `citrineos-operator-ui/deploy/rollback.ps1`

## 4.1 Create Runtime Env File

From `citrineos-operator-ui`:

```powershell
Copy-Item .\deploy\ui.runtime.env.example .\deploy\ui.runtime.env
```

Edit `deploy/ui.runtime.env` and set real values (especially secrets and endpoint URLs).

## 4.2 Set Required Build-Time Variables

The build script requires all of these in the current process:

1. `NEXT_PUBLIC_API_URL`
2. `NEXT_PUBLIC_WS_URL`
3. `NEXT_PUBLIC_CITRINE_CORE_URL`
4. `NEXT_PUBLIC_FILE_SERVER_URL`
5. `NEXTAUTH_URL`

Example:

```powershell
$env:NEXT_PUBLIC_API_URL='https://hasura.example.com/v1/graphql'
$env:NEXT_PUBLIC_WS_URL='wss://hasura.example.com/v1/graphql'
$env:NEXT_PUBLIC_CITRINE_CORE_URL='https://core.example.com'
$env:NEXT_PUBLIC_FILE_SERVER_URL='https://files.example.com'
$env:NEXTAUTH_URL='https://ui.example.com'
```

## 4.3 Build and Push UI Image

```powershell
Set-Location .\citrineos-operator-ui
.\deploy\build-and-push.ps1 -Image 'ghcr.io/<owner>/citrineos-operator-ui' -Tag '2026.08.28.5'
```

Optional latest alias:

```powershell
.\deploy\build-and-push.ps1 -Image 'ghcr.io/<owner>/citrineos-operator-ui' -Tag '2026.08.28.5' -AlsoTagLatest
```

What the script does:

1. Validates required `NEXT_PUBLIC_*` and `NEXTAUTH_URL` vars
2. Authenticates to GHCR using `GHCR_USERNAME` + `GHCR_TOKEN`
3. Builds `linux/amd64` image with Docker Buildx
4. Pushes tag to GHCR
5. Verifies push using `docker buildx imagetools inspect`

## 4.4 Deploy UI Image

```powershell
.\deploy\deploy.ps1 -Image 'ghcr.io/<owner>/citrineos-operator-ui' -Tag '2026.08.28.5'
```

If port 3000 is already used:

```powershell
$env:UI_HOST_PORT='3001'
.\deploy\deploy.ps1 -Image 'ghcr.io/<owner>/citrineos-operator-ui' -Tag '2026.08.28.5'
```

What deploy script does:

1. Pulls the exact image tag
2. Starts/recreates compose stack (`citrine-ui`)
3. Waits for container health to become `healthy`

---

## 5) CitrineOS Core Server Deployment (Detailed)

Script used:

1. `citrineos-core/deploy/deploy.ps1`

## 5.1 Create Runtime Env File

From `citrineos-core`:

```powershell
Copy-Item .\deploy\citrine.runtime.env.example .\deploy\citrine.runtime.env
```

Edit values in `deploy/citrine.runtime.env`.

Minimum critical values to review first:

1. `DB_STRATEGY`
2. `BOOTSTRAP_CITRINEOS_DATABASE_*`
3. `BOOTSTRAP_CITRINEOS_FILE_ACCESS_TYPE`
4. `AWS_*` (if using S3/MinIO)

## 5.2 Deploy Server Image

```powershell
Set-Location .\citrineos-core
.\deploy\deploy.ps1 -Image 'ghcr.io/<owner>/citrineos-server' -Tag '2026.08.28.2'
```

If needed, override host port:

```powershell
$env:CITRINE_HOST_PORT='8080'
.\deploy\deploy.ps1 -Image 'ghcr.io/<owner>/citrineos-server' -Tag '2026.08.28.2'
```

What server deploy script does:

1. Ensures runtime env file exists
2. Pulls selected tag
3. Recreates compose stack (`citrine-server`)
4. Waits for `healthy` container state

---

## 6) Post-Deploy Verification Checklist

Run:

```powershell
# UI container
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | Select-String 'citrine-ui-citrine-ui-1|NAMES'

# Server container
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | Select-String 'citrine-server-citrine-1|NAMES'
```

In browser:

1. Hard refresh (`Ctrl+F5`)
2. Open Charging Station details
3. Confirm tabs include Operations and Active Profiles
4. Confirm Smart Charging Control Panel is visible
5. Confirm copy button works in OCPP message content
6. Test TxProfile flow and verify transaction id auto-populates
7. In Active Profiles tab, use Get Charging Profiles button to refresh list

Optional chunk-marker verification for UI rollout confidence:

```powershell
$chunkPath = ([regex]::Matches((Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/charging-stations/7?tab=operations').Content, 'src="([^"]+charging-stations/%5Bid%5D/page-[^"]+\.js)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -First 1)
$url = 'http://localhost:3000' + $chunkPath
$js = (Invoke-WebRequest -UseBasicParsing $url).Content
[regex]::Matches($js, 'Operations|Active Profiles|Smart Charging Control Panel|Update active Dynamic profile|Create and apply profile') | ForEach-Object { $_.Value } | Sort-Object -Unique
```

---

## 7) Rollback Procedure

UI rollback:

```powershell
Set-Location .\citrineos-operator-ui
.\deploy\rollback.ps1 -Image 'ghcr.io/<owner>/citrineos-operator-ui' -Tag '2026.08.28.4'
```

If rollback script is unavailable for a component, redeploy prior known-good tag:

```powershell
.\deploy\deploy.ps1 -Image 'ghcr.io/<owner>/citrineos-operator-ui' -Tag '2026.08.28.4'
```

Server rollback pattern is the same idea with previous server tag.

Rollback best practices:

1. Keep a short list of known-good tags
2. Record why rollback happened
3. Re-verify health and critical UI flows immediately after rollback

---

## 8) Troubleshooting (Common Errors)

## 8.1 "Missing required build arg environment variable"

Cause:

1. One of required build vars is not set in current shell.

Fix:

1. Set all required `NEXT_PUBLIC_*` and `NEXTAUTH_URL` with `$env:`
2. Rerun build script in same terminal session

## 8.2 "Missing GHCR credentials for image push"

Cause:

1. `GHCR_USERNAME` or `GHCR_TOKEN` is missing in process env.

Fix:

1. Set both with `$env:` and rerun

## 8.3 GHCR 403 / Push denied

Cause:

1. Token permissions missing package scopes, or package ownership mismatch.

Fix:

1. Regenerate token with package scopes
2. Ensure image path owner matches account/org token can publish to
3. Retry `docker login ghcr.io` and build-and-push

## 8.4 Deployment succeeds but old UI still appears

Cause:

1. Browser cache or older bundle/chunk still in memory
2. Wrong image tag deployed

Fix:

1. Hard refresh browser
2. Confirm running container image tag with `docker ps`
3. Verify chunk markers with script above

## 8.5 GraphQL parse failures on stationId type

Known resolved issue in this customization stream:

1. Some UI queries previously sent Number where Hasura expected String.
2. Fix was to coerce stationId to String in affected query variables.

---

## 9) Summary of Changes vs Original Upstream Repos

This section summarizes the main customization stream captured in this workspace/session.

## 9.1 Operator UI Enhancements

Repository: `citrineos-operator-ui`

Key functional changes:

1. Added and stabilized Charging Station Operations and Active Profiles tabs
2. Fixed stationId GraphQL variable typing for Transactions-related requests
3. Added scrollable tabs behavior to avoid hidden tabs
4. Added robust clipboard copy fallback for OCPP message content
5. Added user-friendly Smart Charging Control Panel with conditional fields
6. Added telemetry cards (latest SoC and charging rate kW from recent logs)
7. Added Active Profiles actions:
   - clear per profile
   - clear all active
   - Get Charging Profiles button for manual refresh
8. Added TxProfile transaction id auto-fill in station Operations smart panel
9. Added matching TxProfile transaction id auto-fill support in EMS Operations builder

Main files touched in this stream (non-exhaustive):

1. `citrineos-operator-ui/src/lib/client/pages/charging-stations/detail/charging.station.detail.tabs.card.tsx`
2. `citrineos-operator-ui/src/lib/client/pages/charging-stations/detail/charging.station.operations.tab.tsx`
3. `citrineos-operator-ui/src/lib/client/pages/charging-stations/detail/charging.station.smart.charging.panel.tsx`
4. `citrineos-operator-ui/src/lib/client/pages/charging-stations/detail/charging.station.active.profiles.tab.tsx`
5. `citrineos-operator-ui/src/lib/client/pages/charging-stations/detail/ocpp.messages.export.dialog.tsx`
6. `citrineos-operator-ui/src/lib/client/pages/overview/ems-operations/ems.operations.card.tsx`
7. `citrineos-operator-ui/src/lib/queries/charging.profiles.ts`
8. `citrineos-operator-ui/src/lib/utils/copy.ts`
9. `citrineos-operator-ui/deploy/build-and-push.ps1`

## 9.2 Core Server and OCPP Compatibility Changes

Repository: `citrineos-core`

Key functional changes:

1. OCPP 2.1 dynamic charging support and endpoint wiring (UpdateDynamicSchedule)
2. Runtime compatibility patching in validator for charging-profile report payload quirks
3. Added workaround stripping misplaced `dynUpdateTime` from `chargingSchedulePeriod`
4. Existing compatibility behavior for `evseId = 0` remap retained
5. Additional prior hardening in this workspace includes meter normalization and NotifyEvent idempotency fixes

Main files touched in this stream (non-exhaustive):

1. `citrineos-core/base/src/interfaces/modules/OCPPValidator.ts`
2. `citrineos-core/core/src/modules/SmartCharging/src/module/module.ts`
3. `citrineos-core/core/src/modules/SmartCharging/src/module/2/MessageApi.ts`
4. `citrineos-core/base/src/interfaces/schema/MappingSchema.ts`
5. `citrineos-core/base/src/ocpp/rpc/2/schemas.ts`

## 9.3 Deployment and Release Flow Changes

Key differences from original host-rebuild style:

1. Immutable tag-based release flow for operator UI
2. GHCR authentication preflight in build script
3. Required build-arg validation before Docker build
4. Post-push manifest verification to catch failed publications early
5. Health-check-based deploy scripts for both UI and server

## 9.4 Home Assistant Integration Repo Status

Repository: `CitrineOS-HA-Integration-main`

1. No confirmed code modifications were part of this specific deployment hardening stream.
2. Treat this repo as separate unless you intentionally update and release it.

---

## 10) How To Publish This Guide as GitHub Pages

This guide lives at `docs/deployment-guide.md`.

## 10.1 Push to GitHub

```powershell
Set-Location <repo-root>
git add docs/index.md docs/deployment-guide.md docs/quick-start.md docs/production-runbook.md docs/mqtt-setup.md docs/testing-dynamic-charging.md docs/testing-ode-e2e.md docs/assets/css/style.scss docs/_config.yml
git commit -m "docs: add docs homepage and deployment documentation set"
git push
```

## 10.2 Enable GitHub Pages

1. Open repository on GitHub
2. Go to Settings -> Pages
3. Under Build and deployment:
   - Source: Deploy from a branch
   - Branch: `main` (or your default)
   - Folder: `/docs`
4. Save

GitHub will publish at a URL like:

1. `https://<owner>.github.io/<repo-name>/`

## 10.3 Verify Published Page

1. Wait 1-3 minutes after saving Pages settings
2. Open the published URL
3. Confirm sections render correctly and code blocks are readable

---

## 11) Recommended Operational Habits

1. Always deploy explicit tags, not ad-hoc local images
2. Keep one release note entry per production deployment
3. Rotate credentials immediately if exposed
4. Use hard refresh after UI deploy before concluding a regression
5. Record both image tag and digest in deployment notes

---

Additional companion pages:

1. [Docs Home](./index.md)
2. [Quick Start (10 Minutes)](./quick-start.md)
3. [Production Runbook](./production-runbook.md)
4. [MQTT Setup (CSIP-Aus -> CitrineOS -> EV)](./mqtt-setup.md)
