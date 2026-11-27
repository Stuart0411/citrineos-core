# EMS Sequence Diagrams

This document describes runtime call flow for the two core SmartCharging application paths and reconciliation.

Related docs:

- [Control Model Draft](EMS-CONTROL-MODEL-DRAFT.md)
- [Implementation Checklist](EMS-IMPLEMENTATION-CHECKLIST.md)
- [Clamp Test Matrix](EMS-CLAMP-TEST-MATRIX.md)

## 1) Intake + Auto-Apply (MQTT)

```mermaid
sequenceDiagram
    participant ODE as ODE or HA Producer
    participant MQTT as MQTT Broker
    participant Bridge as EmsMqttBridge
    participant Validate as IntentValidation
    participant IntentRepo as EmsSiteIntentRepository
    participant DecisionRepo as EmsDecisionRepository
    participant EMS as EmsModule

    ODE->>MQTT: publish site intent envelope
    MQTT->>Bridge: message(topic,payload)
    Bridge->>Bridge: normalize payload to canonical intent
    Bridge->>Validate: validateEmsIntentPolicy(intent)

    alt validation passes
      Bridge->>IntentRepo: createSiteIntent
      Bridge->>DecisionRepo: persist intake_result accepted
      Bridge->>EMS: maybeAutoApply(tenantId, siteId)
      EMS->>EMS: debounce and in-flight guard
      EMS->>EMS: applyChargingPlan
    else validation fails or duplicate
      Bridge->>DecisionRepo: persist intake_result rejected
      Bridge->>MQTT: publish reject intake event
    end
```

## 2) Derive Plan (Read-only Policy)

```mermaid
sequenceDiagram
    participant API as EmsDataApi
    participant EMS as EmsModule
    participant Policy as EmsPolicyEngine
    participant IntentRepo as EmsSiteIntentRepository
    participant LocRepo as LocationRepository
    participant DM as DeviceModelRepository
    participant V2XRepo as StationEnergyTransferPolicyRepository

    API->>EMS: deriveChargingPlan(tenantId, request)
    EMS->>Policy: deriveChargingPlan
    Policy->>IntentRepo: readLatestActiveBySiteId

    alt no active intent
      Policy-->>EMS: null
      EMS-->>API: no-plan
    else active intent
      Policy->>LocRepo: getChargingStationsByIds
      loop each requested station
        Policy->>DM: SmartChargingCtrlr.Enabled
        Policy->>V2XRepo: latest export policy
        Policy->>Policy: eligibility checks
      end
      Policy->>Policy: allocate budgets and clamp discharge
      Policy-->>EMS: plan with recommendations
      EMS-->>API: EmsChargingPlanResponse
    end
```

## 3) Apply Plan (Absolute Path)

```mermaid
sequenceDiagram
    participant API as EmsDataApi
    participant EMS as EmsModule
    participant Policy as EmsPolicyEngine
    participant CPRepo as ChargingProfileRepository
    participant OCPP as OCPP Router
    participant CS as Charging Station
    participant DecisionRepo as EmsDecisionRepository

    API->>EMS: applyChargingPlan
    EMS->>Policy: deriveChargingPlan
    loop each recommendation
      alt ineligible
        EMS->>DecisionRepo: apply_skipped(reason)
      else eligible absolute path
        EMS->>EMS: normalize purpose/mode/path
        EMS->>EMS: fingerprint check (skip unchanged absolute)
        alt max profile
          EMS->>OCPP: ClearChargingProfile
          EMS->>EMS: sleep clear-set delay
        end
        EMS->>CPRepo: getNextChargingProfileId and ScheduleId
        EMS->>EMS: clamp evseId for station-level profiles
        EMS->>OCPP: SetChargingProfile(evseId, chargingProfile)
        OCPP->>CS: OCPP Call
        CS-->>OCPP: SetChargingProfileResponse
        EMS->>CPRepo: createOrUpdateChargingProfile
        EMS->>DecisionRepo: apply_result
      end
    end
    EMS-->>API: EmsApplyChargingPlanResponse
```

## 4) Apply Plan (Dynamic Path)

```mermaid
sequenceDiagram
    participant API as EmsDataApi
    participant EMS as EmsModule
    participant Policy as EmsPolicyEngine
    participant CPRepo as ChargingProfileRepository
    participant OCPP as OCPP Router
    participant CS as Charging Station
    participant DecisionRepo as EmsDecisionRepository

    API->>EMS: applyChargingPlan(applicationPath dynamic)
    EMS->>Policy: deriveChargingPlan
    loop each recommendation
      alt protocol not 2.1
        EMS->>DecisionRepo: apply_skipped(dynamic requires 2.1)
      else protocol 2.1
        EMS->>CPRepo: find active Dynamic profile
        alt no active Dynamic profile
          EMS->>DecisionRepo: apply_skipped(no dynamic profile)
        else profile exists
          EMS->>EMS: preserve setpoint context if present
          EMS->>EMS: clamp discharge-only floor
          EMS->>OCPP: UpdateDynamicSchedule(chargingProfileId,scheduleUpdate)
          OCPP->>CS: OCPP Call
          CS-->>OCPP: UpdateDynamicScheduleResponse
          EMS->>DecisionRepo: apply_result
        end
      end
    end
    EMS-->>API: EmsApplyChargingPlanResponse
```

## 5) Reconcile Plan

```mermaid
sequenceDiagram
    participant API as EmsDataApi
    participant EMS as EmsModule
    participant Policy as EmsPolicyEngine
    participant CPRepo as ChargingProfileRepository
    participant DecisionRepo as EmsDecisionRepository

    API->>EMS: reconcileChargingPlan
    EMS->>Policy: deriveChargingPlan
    loop each recommendation
      EMS->>CPRepo: read latest active EMS profile
      EMS->>EMS: compare planned limit and mode vs active
      EMS->>DecisionRepo: reconcile_result(drift true or false)
    end
    EMS-->>API: EmsChargingPlanReconciliationResponse
```
