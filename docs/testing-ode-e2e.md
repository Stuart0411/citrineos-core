# ODE E2E Validation

This page is a GitHub Pages-friendly copy of the Open Dynamic Export to CitrineOS end-to-end validation guide.

For the docs landing page, use [Docs Home](./index.md).

---

## Goal

Validate end-to-end EMS intake from ODE-style MQTT payloads through CitrineOS plan derivation and apply/reconcile APIs.

## Preconditions

1. CitrineOS is running with EMS enabled
2. MQTT broker is reachable by CitrineOS
3. Charger `10919352` is online in CitrineOS
4. Home Assistant or ODE can publish to MQTT

## Configure EMS MQTT Bridge

Set these values in Citrine config:

1. `modules.ems.mqtt.enabled=true`
2. `modules.ems.mqtt.brokerUrl=<your mqtt url>`
3. `modules.ems.mqtt.siteIntentsTopic=citrine/ems/site/+/intent/current`
4. Optional `modules.ems.mqtt.startupMode=non_fatal`
5. Optional ack/reject topic templates

## Start Bridge and Verify Status

1. `GET /data/ems/emsMqttBridge`
2. `POST /data/ems/emsMqttBridge`
3. `GET /data/ems/emsMqttBridge`

Expected:

1. `enabled=true`
2. `started=true`

## Publish ODE-Style Envelope

Topic:

1. `citrine/ems/site/au-site-001/intent/current`

Example payload:

```json
{
  "timestamp": "2026-08-19T07:00:00Z",
  "constraints": {
    "importLimitW": 25000,
    "exportLimitW": 5000,
    "evBudgetW": 11000,
    "dischargeBudgetW": 7000,
    "rampRateWPerSec": 1000
  },
  "operationMode": "ExternalLimits",
  "reason": "ode_live_dynamic_export",
  "flags": {
    "allowDischarge": true,
    "emergencyCurtailment": false
  },
  "metadata": {
    "source": "open-dynamic-export"
  }
}
```

## Verify Intake and Telemetry

1. `GET /data/ems/emsSiteIntent?tenantId=1&siteId=au-site-001&currentOnly=true`
2. `GET /data/ems/emsIntakeTelemetry?tenantId=1&siteId=au-site-001&limit=50`

Expected:

1. Intent exists for `au-site-001`
2. `accepted` count increases

## Derive and Apply Plan

Derive:

1. `POST /data/ems/emsChargingPlan?tenantId=1`

Apply:

1. `PUT /data/ems/emsChargingPlan?tenantId=1`

Example body:

```json
{
  "siteId": "au-site-001",
  "stationIds": ["10919352"],
  "evseId": 1,
  "strategy": "equal_share_online",
  "chargingProfilePurpose": "ChargingStationMaxProfile",
  "operationMode": "ExternalLimits"
}
```

## Verify Runtime State Surfaces

1. `GET /data/v2x/stationEnergyTransferPolicy?tenantId=1&stationId=10919352&summary=true`
2. `POST /ocpp/2.1/getDERControl?identifier=10919352&tenantId=1` with `{"requestId":12345}`

## Troubleshooting

1. If bridge does not start, check broker URL, credentials, and startup mode
2. If intents are rejected, inspect timestamps and reject events
3. If apply fails, confirm station eligibility and online status

## Next Links

1. [Docs Home](./index.md)
2. [MQTT Setup (CSIP-Aus -> CitrineOS -> EV)](./mqtt-setup.md)
3. [Production Runbook](./production-runbook.md)
4. [Dynamic Charging Testing](./testing-dynamic-charging.md)
