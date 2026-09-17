# Dynamic Charging Testing

This page is a GitHub Pages-friendly copy of the dynamic charging testing guide for the docs site.

For the docs landing page, use [Docs Home](./index.md).

---

## Overview

This guide covers testing OCPP 2.1 dynamic charging features in CitrineOS, including:

1. Starting a transaction with a Dynamic charging profile
2. Sending UpdateDynamicSchedule messages to adjust charging in real time
3. Using different operation modes such as CentralSetpoint and ExternalLimits

## Prerequisites

1. CitrineOS running with OCPP 2.1 support
2. A simulator or physical charge point that supports OCPP 2.1 dynamic charging
3. An active charging session or a way to start one

## Start a Transaction with a Dynamic Profile

Using the UI:

1. Open the end-user UI
2. Set Profile Kind to Dynamic (2.1)
3. Choose purpose such as TxDefaultProfile or TxProfile
4. Set EVSE ID and Stack Level
5. Set Dynamic Update Interval to `300`
6. Add a schedule period with a limit such as `11000`
7. Send SetChargingProfile

Example payload:

```json
{
  "evseId": 1,
  "chargingProfile": {
    "id": 101,
    "stackLevel": 0,
    "chargingProfilePurpose": "TxDefaultProfile",
    "chargingProfileKind": "Dynamic",
    "chargingSchedule": [
      {
        "id": 1,
        "chargingRateUnit": "W",
        "operationMode": "CentralSetpoint",
        "chargingSchedulePeriod": [
          {
            "startPeriod": 0,
            "limit": 11000,
            "operationMode": "CentralSetpoint"
          }
        ]
      }
    ],
    "dynamicUpdateInterval": 300
  }
}
```

## Update the Dynamic Schedule

Example REST call:

```bash
curl -X POST http://localhost:8080/ocpp/smartcharging/updateDynamicSchedule \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": ["TEST_STATION_001"],
    "request": {
      "chargingProfileId": 101,
      "scheduleUpdate": {
        "limit": 7000,
        "operationMode": "CentralSetpoint"
      }
    }
  }'
```

## Common Operation Modes

1. `Idle`
2. `ChargingOnly`
3. `CentralSetpoint`
4. `ExternalSetpoint`
5. `ExternalLimits`
6. `CentralFrequency`
7. `LocalFrequency`
8. `LocalLoadBalancing`

## Run the Automated Test Suite

```bash
cd citrineos-core
npm run build
npx vitest run core/src/modules/SmartCharging/test/module/DynamicCharging.test.ts
```

## Expected Results

1. `SetChargingProfile` returns `Accepted`
2. `UpdateDynamicSchedule` returns `Accepted`
3. Invalid profiles return `Rejected` with status info

## Next Links

1. [Docs Home](./index.md)
2. [Deployment Guide (Beginner-Friendly)](./deployment-guide.md)
3. [MQTT Setup (CSIP-Aus -> CitrineOS -> EV)](./mqtt-setup.md)
4. [ODE E2E Validation](./testing-ode-e2e.md)
