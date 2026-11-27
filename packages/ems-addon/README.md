# EMS Add-on for CitrineOS

This package treats EMS behavior as an add-on layer to CitrineOS, not a replacement for core OCPP responsibilities.

## Purpose

The add-on receives site-level EMS intents and translates them into station-level control plans:

- Ingestion: accepts normalized site intents from external EMS systems such as Home Assistant and Open Dynamic Export.
- Policy: validates freshness, applies control strategy, and resolves conflict at site level.
- Dispatch planning: emits station-level targets and DER actions for downstream OCPP command publishers.

## White-Paper Alignment

This package follows the four-layer model:

1. Grid and market layer: external signals and export constraints remain outside CitrineOS.
2. EMS orchestration layer: Home Assistant computes site intent.
3. CSMS control layer: this add-on executes policy and planning, while Citrine core remains protocol authority.
4. Station execution layer: charging stations enforce accepted controls.

## Current Foundation

The initial implementation includes:

- EMS site intent contracts
- ingress intent envelope contracts
- station snapshot and control-plan contracts
- default intent validator
- REST ingress adapter for normalized intent envelopes
- MQTT ingress adapter for topic-based control messages and state hydration
- equal-share allocation strategy
- default policy engine
- control loop orchestrator
- OCPP 2.1 dynamic schedule publisher adapter
	- supports DER action routing with fallback endpoint chains

## Contract Tests

Current integration coverage includes:

- topic/envelope ingress into policy plan generation
- OCPP dynamic schedule publishing
- DER action endpoint fallback behavior
- ingress to publish contract flow with mocked Citrine responses

## Runtime Entrypoint

The package now includes a runtime process for sidecar operation:

- Admin web UI: `GET /`
- HTTP health endpoint: `GET /health`
- REST ingress endpoint: `POST /intents`
- Runtime snapshot: `GET /admin/state`
- Runtime config: `GET /admin/config`, `PATCH /admin/config`
- Optional restart endpoint: `POST /admin/restart` (requires `EMS_ADDON_ENABLE_RESTART_ENDPOINT=true`)
- MQTT subscriber: `<EMS_ADDON_MQTT_TOPIC_PREFIX>/<topic>`

Supported topic suffixes:

- `import_limit_w`
- `export_limit_w`
- `ev_budget_w`
- `ev_discharge_budget_w`
- `operation_mode`
- `emergency_curtailed`

Run locally after build:

```bash
pnpm --filter @citrineos/ems-addon run build
pnpm --filter @citrineos/ems-addon run start
```

## Ingress Topics (prototype)

The MQTT adapter currently supports these topics:

- `ems/site/import_limit_w`
- `ems/site/export_limit_w`
- `ems/site/ev_budget_w`
- `ems/site/ev_discharge_budget_w`
- `ems/site/operation_mode`
- `ems/site/emergency_curtailed`

## Next Integration Steps

1. Add schema validation (Zod/JSON schema) for inbound envelopes and topic payloads.
2. Expand publisher support to DER block R actions and capability-aware fallback routing.
3. Add persistence for intent history and applied plan audit trails.
4. Add policy plugins for tariff-aware optimization and V2X constraints.
