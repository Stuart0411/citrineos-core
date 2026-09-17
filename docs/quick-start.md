# Quick Start (10 Minutes)

Use this page if you want the fastest safe path to build, publish, and deploy CitrineOS Operator UI and Core Server.

For the landing page, use [Docs Home](./index.md).
For full details, use the main guide at [Deployment Guide (Beginner-Friendly)](./deployment-guide.md).

---

## Before You Start

You need:

1. Docker Desktop installed and running
2. PowerShell open
3. Access to the target GitHub repo and GHCR package namespace
4. A GitHub token with package permissions (`read:packages`, `write:packages`)

Verify tools:

```powershell
docker --version
docker compose version
git --version
```

---

## Step 1: Set GHCR Credentials (Current Terminal)

```powershell
$env:GHCR_USERNAME='your-github-username'
$env:GHCR_TOKEN='your-github-token'
```

If this fails later with auth errors, regenerate your token and repeat this step.

---

## Step 2: Set Operator UI Build Variables

Run in the same terminal where you will call build-and-push:

```powershell
$env:NEXT_PUBLIC_API_URL='https://hasura.example.com/v1/graphql'
$env:NEXT_PUBLIC_WS_URL='wss://hasura.example.com/v1/graphql'
$env:NEXT_PUBLIC_CITRINE_CORE_URL='https://core.example.com'
$env:NEXT_PUBLIC_FILE_SERVER_URL='https://files.example.com'
$env:NEXTAUTH_URL='https://ui.example.com'
```

If any value is missing, UI build will fail.

---

## Step 3: Build and Push Operator UI Image

```powershell
Set-Location .\citrineos-operator-ui
.\deploy\build-and-push.ps1 -Image 'ghcr.io/<owner>/citrineos-operator-ui' -Tag '2026.08.28.5'
```

What success looks like:

1. Script completes without error
2. It prints a "Done. Published image" message

---

## Step 4: Deploy Operator UI

```powershell
.\deploy\deploy.ps1 -Image 'ghcr.io/<owner>/citrineos-operator-ui' -Tag '2026.08.28.5'
```

If port 3000 is used:

```powershell
$env:UI_HOST_PORT='3001'
.\deploy\deploy.ps1 -Image 'ghcr.io/<owner>/citrineos-operator-ui' -Tag '2026.08.28.5'
```

What success looks like:

1. Image pull succeeds
2. Container becomes healthy

---

## Step 5: Deploy CitrineOS Core Server

First-time only (if missing):

```powershell
Set-Location ..\citrineos-core
Copy-Item .\deploy\citrine.runtime.env.example .\deploy\citrine.runtime.env
```

Then deploy:

```powershell
.\deploy\deploy.ps1 -Image 'ghcr.io/<owner>/citrineos-server' -Tag '2026.08.28.2'
```

What success looks like:

1. Image pull succeeds
2. Container becomes healthy

---

## Step 6: Verify Running Versions

```powershell
docker ps --format "table {{.Names}}`t{{.Image}}`t{{.Status}}" | Select-String 'citrine-ui-citrine-ui-1|citrine-server-citrine-1|NAMES'
```

Browser checks:

1. Open Operator UI
2. Hard refresh (`Ctrl+F5`)
3. Open a charging station detail page
4. Confirm Operations and Active Profiles tabs are visible

---

## Step 7: Basic Functional Checks

Check these quickly:

1. Smart Charging panel appears under Operations
2. TxProfile auto-populates Transaction ID when active transaction exists
3. Active Profiles tab has Get Charging Profiles button
4. OCPP message copy button works

---

## Step 8: Rollback If Needed

UI rollback to previous known-good tag:

```powershell
Set-Location .\citrineos-operator-ui
.\deploy\rollback.ps1 -Image 'ghcr.io/<owner>/citrineos-operator-ui' -Tag '2026.08.28.4'
```

If rollback script is not available for a service, re-run deploy with previous tag.

---

## Fast Troubleshooting

Build says missing NEXT_PUBLIC variable:

1. Re-run Step 2 in the same terminal
2. Retry build-and-push

Push says GHCR credentials missing:

1. Re-run Step 1
2. Retry build-and-push

Deploy shows old UI:

1. Confirm deployed image tag in `docker ps`
2. Hard refresh browser

---

## Where To Go Next

1. Landing page: [Docs Home](./index.md)
2. Full deployment guide: [Deployment Guide (Beginner-Friendly)](./deployment-guide.md)
3. Production operations flow: [Production Runbook](./production-runbook.md)
4. MQTT setup and CSIP-Aus flow: [MQTT Setup (CSIP-Aus -> CitrineOS -> EV)](./mqtt-setup.md)
5. Dynamic charging testing details: [Dynamic Charging Testing](./testing-dynamic-charging.md)
6. ODE end-to-end flow: [ODE E2E Validation](./testing-ode-e2e.md)
