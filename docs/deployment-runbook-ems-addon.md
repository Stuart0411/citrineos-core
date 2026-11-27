# EMS Add-on Deployment Runbook

## Objective

Deploy CitrineOS with EMS add-on as a sidecar service so EMS orchestration is independent from core OCPP responsibilities.

## Preconditions

1. Keep at least 20 GB free disk on the Docker host.
2. Use pinned image tags for all services.
3. Keep runtime data out of the git workspace.
4. Verify `pnpm --filter @citrineos/ocpp-server... run build` passes.

## Recommended Profiles

1. Local dev: `docker-compose.local.yml` + `docker-compose.ems-addon.yml`.
2. Staging: `docker-compose.yml` + `docker-compose.ems-addon.yml` with pinned tags.
3. Production: same as staging with immutable digest pins and approved env files.

## Start Commands

### Staging-style (published images)

```bash
pnpm citrine --ems-addon
```

### Local-source (dev)

```bash
pnpm citrine --local --ems-addon
```

Equivalent explicit Docker Compose commands are still valid when needed.

## Rollout Sequence

1. Deploy add-on in `EMS_ADDON_DRY_RUN=true` mode.
2. Validate incoming intents and generated plans via logs/metrics.
3. Enable publish (`EMS_ADDON_DRY_RUN=false`) for a canary station set.
4. Expand to full station cohort after stability window.

## Health and Verification

1. Verify container healthchecks all pass.
2. Verify EMS add-on UI opens at `/` on port 8095.
3. Verify `GET /health` responds from ems-addon.
4. Verify `POST /intents` accepts a sample envelope in dry-run mode.
5. Verify intent freshness filtering and stale intent rejection.
6. Verify station plan generation latency and publish success rates.
7. Verify fallback behavior when MQTT ingress is unavailable.

## Rollback

1. Set `EMS_ADDON_DRY_RUN=true` and redeploy.
2. If required, remove ems-addon profile from compose invocation.
3. Keep Citrine core running unchanged during EMS add-on rollback.

## Maintenance

1. Weekly `docker system df` review.
2. Prune unused images/volumes on schedule in non-production windows.
3. Keep image and migration runbooks versioned with release tags.
