# CitrineOS Docs Home

This is the landing page for the CitrineOS documentation set in this workspace.

Use this page to choose the right guide based on what you are trying to do.

---

## Start Here

1. New to this deployment flow: [Deployment Guide (Beginner-Friendly)](./deployment-guide.md)
2. Need the shortest path: [Quick Start (10 Minutes)](./quick-start.md)
3. Running a production release: [Production Runbook](./production-runbook.md)
4. Setting up EMS MQTT and CSIP-Aus flow: [MQTT Setup (CSIP-Aus -> CitrineOS -> EV)](./mqtt-setup.md)
5. Testing dynamic charging: [Dynamic Charging Testing](./testing-dynamic-charging.md)
6. Validating ODE live flow: [ODE E2E Validation](./testing-ode-e2e.md)

---

## What These Docs Cover

1. GitHub and GHCR setup for beginners
2. Building and publishing immutable UI images
3. Deploying CitrineOS UI and server containers
4. Rollback and production release handling
5. MQTT setup between Open Dynamic Export, CitrineOS, and chargers
6. Summary of custom changes made relative to the original upstream repos

---

## Suggested Reading Order

1. Read [Deployment Guide (Beginner-Friendly)](./deployment-guide.md) for the full picture
2. Use [Quick Start (10 Minutes)](./quick-start.md) when you just need the minimal release flow
3. Use [Production Runbook](./production-runbook.md) during real releases and incidents
4. Use [MQTT Setup (CSIP-Aus -> CitrineOS -> EV)](./mqtt-setup.md) when wiring EMS intent flow

---

## Publishing This Docs Site

GitHub Pages should point to the `/docs` folder so this page becomes the docs homepage.

```powershell
Set-Location <repo-root>
git add docs/index.md docs/deployment-guide.md docs/quick-start.md docs/production-runbook.md docs/mqtt-setup.md docs/testing-dynamic-charging.md docs/testing-ode-e2e.md docs/assets/css/style.scss docs/_config.yml
git commit -m "docs: add docs homepage and deployment documentation set"
git push
```

Then on GitHub:

1. Open Settings -> Pages
2. Set Source to Deploy from a branch
3. Select your main branch
4. Select the `/docs` folder
5. Save
