# Production Runbook

This page is for operators running production releases, incident response, and rollback.

If you are new to this stack, read [Quick Start (10 Minutes)](./quick-start.md) first.

For the landing page, use [Docs Home](./index.md).
For full background and architecture context, use [Deployment Guide (Beginner-Friendly)](./deployment-guide.md).

---

## 1) Purpose and Scope

Use this runbook for:

1. Planned releases
2. Emergency fixes
3. Rollbacks
4. Post-release verification

Services covered:

1. `citrineos-operator-ui`
2. `citrineos-core` (server)

Release model:

1. Immutable image tags
2. GHCR as container registry
3. Docker Compose deployment with health checks

---

## 2) Roles and Ownership

Minimum recommended roles:

1. Release Operator: runs scripts, records outputs
2. Verifier: validates UI and API behavior
3. Incident Owner: decides rollback vs continue

For solo operation, one person can perform all roles, but still follow the decision gates below.

---

## 3) Change Windows and Freeze Rules

Before release:

1. Confirm change window start and end times
2. Confirm no concurrent infra changes on same host
3. Pause unrelated deploys to avoid cross-noise in logs

Avoid deploying if:

1. Registry access is unstable
2. Database migrations are incomplete or unreviewed
3. Active incident already affects same services

---

## 4) Preflight Checklist (Go/No-Go)

Run these checks in order.

## 4.1 Local Workspace State

```powershell
git status
```

Go if:

1. Release changes are committed or intentionally tracked
2. No unknown/unintended edits in release-critical files

## 4.2 Docker Engine Health

```powershell
docker version
docker compose version
docker ps
```

Go if:

1. Docker daemon responds normally
2. Existing containers are not in restart loops

## 4.3 GHCR Auth Variables in Current Shell

```powershell
$env:GHCR_USERNAME
$env:GHCR_TOKEN
```

Go if:

1. Both values are present in current session
2. Token is known-good and not revoked

## 4.4 Required UI Build Variables

```powershell
$env:NEXT_PUBLIC_API_URL
$env:NEXT_PUBLIC_WS_URL
$env:NEXT_PUBLIC_CITRINE_CORE_URL
$env:NEXT_PUBLIC_FILE_SERVER_URL
$env:NEXTAUTH_URL
```

Go if:

1. All values are non-empty
2. URLs point to production endpoints (not localhost)

## 4.5 Runtime Env Files Exist

```powershell
Test-Path .\citrineos-operator-ui\deploy\ui.runtime.env
Test-Path .\citrineos-core\deploy\citrine.runtime.env
```

Go if:

1. Both return `True`

If missing, create from examples and fill real values.

---

## 5) Standard Release Procedure

Recommended order:

1. Build/push UI image
2. Deploy UI image
3. Deploy server image (if included in release)
4. Validate both services

## 5.1 Build and Push Operator UI Image

```powershell
Set-Location .\citrineos-operator-ui
.\deploy\build-and-push.ps1 -Image 'ghcr.io/<owner>/citrineos-operator-ui' -Tag 'YYYY.MM.DD.N'
```

Expected success signals:

1. Build finishes with no errors
2. Push completes
3. Script verifies image manifest successfully

## 5.2 Deploy Operator UI

```powershell
.\deploy\deploy.ps1 -Image 'ghcr.io/<owner>/citrineos-operator-ui' -Tag 'YYYY.MM.DD.N'
```

Expected success signals:

1. Pull succeeds for exact tag
2. Compose up succeeds
3. Container reports `healthy`

## 5.3 Deploy Core Server (If Part of Release)

```powershell
Set-Location ..\citrineos-core
.\deploy\deploy.ps1 -Image 'ghcr.io/<owner>/citrineos-server' -Tag 'YYYY.MM.DD.N'
```

Expected success signals:

1. Pull succeeds for exact tag
2. Compose up succeeds
3. Container reports `healthy`

---

## 6) Verification Gates (Must Pass)

## 6.1 Container/Image Gate

```powershell
docker ps --format "table {{.Names}}`t{{.Image}}`t{{.Status}}" | Select-String 'citrine-ui-citrine-ui-1|citrine-server-citrine-1|NAMES'
```

Pass if:

1. Running images match intended tags
2. Status is healthy/up for both services

## 6.2 UI Functional Gate

Browser checks (hard refresh first):

1. Open Operator UI and log in
2. Open a charging station detail page
3. Confirm Operations tab and Active Profiles tab appear
4. Confirm Smart Charging Control Panel renders
5. Confirm OCPP copy action copies content successfully
6. Confirm Active Profiles includes Get Charging Profiles button
7. For TxProfile, confirm transaction ID auto-populates when active transaction exists

Pass if:

1. No blocking UI errors
2. Critical controls are visible and functional

## 6.3 API/Behavior Gate

Pass if:

1. No new server startup errors
2. Smart-charging calls complete without schema validation regression
3. Transaction and meter views load without GraphQL type errors

---

## 7) Incident Decision Matrix

Use this matrix during release issues.

## 7.1 Build Fails

Symptoms:

1. Missing NEXT_PUBLIC variables
2. GHCR auth errors
3. Buildx failures

Action:

1. Fix environment variables
2. Re-authenticate to GHCR
3. Retry build

Rollback needed:

1. No, because deployment has not changed yet

## 7.2 Deploy Fails Before Healthy

Symptoms:

1. Pull fails
2. Compose up fails
3. Health check timeout

Action:

1. Inspect compose logs
2. Confirm image tag exists in GHCR
3. Fix cause and retry

Rollback needed:

1. Usually no if old container is still serving
2. Yes if service degraded and prior version is not active

## 7.3 Deploy Succeeds but Regression Found

Symptoms:

1. Missing tab/control
2. Runtime errors in UI
3. Core endpoint behavior changed unexpectedly

Action:

1. Confirm running tag really changed
2. Hard refresh browser and retest
3. If still failing, rollback immediately

Rollback needed:

1. Yes when user-impacting critical flow is broken

---

## 8) Rollback Runbook

## 8.1 Rollback Trigger Criteria

Rollback if any one is true:

1. Production login or navigation fails
2. Smart charging critical actions fail consistently
3. Server health fails and does not recover quickly
4. High-severity customer-impacting regression confirmed

## 8.2 UI Rollback Command

```powershell
Set-Location .\citrineos-operator-ui
.\deploy\rollback.ps1 -Image 'ghcr.io/<owner>/citrineos-operator-ui' -Tag '<previous-known-good-tag>'
```

If rollback script cannot be used:

```powershell
.\deploy\deploy.ps1 -Image 'ghcr.io/<owner>/citrineos-operator-ui' -Tag '<previous-known-good-tag>'
```

## 8.3 Server Rollback Pattern

```powershell
Set-Location ..\citrineos-core
.\deploy\deploy.ps1 -Image 'ghcr.io/<owner>/citrineos-server' -Tag '<previous-known-good-tag>'
```

## 8.4 Rollback Verification

1. Confirm containers run previous known-good tags
2. Re-run critical UI/API checks from Section 6
3. Record incident details and root-cause follow-up owner

---

## 9) Post-Release Logging Template

Copy this into your release notes each deployment:

```text
Release ID: YYYY.MM.DD.N
Date/Time (UTC):
Operator:
Verifier:

UI Image:
Server Image:

Preflight: PASS/FAIL
UI Deploy: PASS/FAIL
Server Deploy: PASS/FAIL
Functional Gate: PASS/FAIL

Issues observed:

Rollback performed: YES/NO
If yes, rollback tag(s):

Follow-ups:
```

---

## 10) Security and Credential Hygiene

1. Never commit secrets into repo files
2. Rotate GHCR tokens immediately if exposed
3. Prefer short-lived credentials when possible
4. Keep runtime env files private to deployment host

---

## 11) Known Customizations To Re-Validate Each Release

These are high-value checks for this customized stream:

1. Operations and Active Profiles tabs render in station detail
2. Smart Charging panel supports dynamic update and set profile paths
3. TxProfile transaction ID auto-populate works in station Operations panel
4. TxProfile transaction ID auto-populate works in EMS builder
5. Active Profiles tab refresh button works
6. OCPP message copy fallback works in restricted clipboard contexts
7. OCPP validator compatibility patch still accepts dynamic report quirks

---

## 12) Companion Documents

1. Landing page: [Docs Home](./index.md)
2. Beginner guide: [Deployment Guide (Beginner-Friendly)](./deployment-guide.md)
3. Fast path: [Quick Start (10 Minutes)](./quick-start.md)
4. MQTT setup and flow diagrams: [MQTT Setup (CSIP-Aus -> CitrineOS -> EV)](./mqtt-setup.md)
5. Dynamic charging test details: [Dynamic Charging Testing](./testing-dynamic-charging.md)
6. ODE E2E test plan: [ODE E2E Validation](./testing-ode-e2e.md)
