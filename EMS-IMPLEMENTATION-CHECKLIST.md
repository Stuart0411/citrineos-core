# EMS Implementation Checklist (Upstream Reference)

## Objective

Implement and harden the EMS control model using upstream CitrineOS semantics, with explicit ownership of intake, policy arbitration, clamping, SmartCharging execution, and reconciliation.

Related docs:

- [Control Model Draft](EMS-CONTROL-MODEL-DRAFT.md)
- [Sequence Diagrams](EMS-SEQUENCE-DIAGRAMS.md)
- [Clamp Test Matrix](EMS-CLAMP-TEST-MATRIX.md)

## Module Map

Primary implementation files:

- [core/src/modules/EMS/src/module/MqttBridge.ts](core/src/modules/EMS/src/module/MqttBridge.ts)
- [core/src/modules/EMS/src/module/IntentValidation.ts](core/src/modules/EMS/src/module/IntentValidation.ts)
- [core/src/modules/EMS/src/module/PolicyEngine.ts](core/src/modules/EMS/src/module/PolicyEngine.ts)
- [core/src/modules/EMS/src/module/module.ts](core/src/modules/EMS/src/module/module.ts)
- [core/src/modules/EMS/src/module/DataApi.ts](core/src/modules/EMS/src/module/DataApi.ts)

Primary DTO files:

- [packages/types/src/interfaces/dto/ems.site.intent.dto.ts](packages/types/src/interfaces/dto/ems.site.intent.dto.ts)
- [packages/types/src/interfaces/dto/ems.charging.plan.dto.ts](packages/types/src/interfaces/dto/ems.charging.plan.dto.ts)
- [packages/types/src/interfaces/dto/ems.intake.event.dto.ts](packages/types/src/interfaces/dto/ems.intake.event.dto.ts)

## Implementation Phases

## Phase 1: Intake Correctness and Safety

Status: In place, maintain and harden.

1. Keep canonical intent parsing and ODE compatibility normalization in [core/src/modules/EMS/src/module/MqttBridge.ts](core/src/modules/EMS/src/module/MqttBridge.ts).
2. Enforce time and max-power policy checks via [core/src/modules/EMS/src/module/IntentValidation.ts](core/src/modules/EMS/src/module/IntentValidation.ts).
3. Preserve duplicate messageId idempotency handling and intake event publication in [core/src/modules/EMS/src/module/MqttBridge.ts](core/src/modules/EMS/src/module/MqttBridge.ts).
4. Ensure intake decision persistence remains non-blocking and resilient in [core/src/modules/EMS/src/module/MqttBridge.ts](core/src/modules/EMS/src/module/MqttBridge.ts).

Acceptance criteria:

- malformed payloads reject with reasoned intake events
- stale/expired/future-skewed intents reject deterministically
- duplicate messageId does not create duplicate site intent rows

## Phase 2: Policy Arbitration and Budget Allocation

Status: In place, expand for richer arbitration.

1. Keep latest-active-intent selection in [core/src/modules/EMS/src/module/PolicyEngine.ts](core/src/modules/EMS/src/module/PolicyEngine.ts).
2. Keep station eligibility gates (protocol, mode, capability, EVSE, SmartCharging enabled, strategy online rule).
3. Keep equal-share allocation for charge and discharge budgets.
4. Keep V2X overlay with discharge cap clamp using station policy.
5. Add explicit multi-intent ordering rules (priority, emergency, source trust) in [core/src/modules/EMS/src/module/PolicyEngine.ts](core/src/modules/EMS/src/module/PolicyEngine.ts).

Acceptance criteria:

- ineligible stations always return zero effective allocation with reason
- eligible station counts and per-station limits are deterministic
- discharge limit equals minimum of allocation and station cap when both exist

## Phase 3: Intent Normalization and Path Selection

Status: In place.

1. Maintain intentClass and profileOption normalization in [core/src/modules/EMS/src/module/module.ts](core/src/modules/EMS/src/module/module.ts).
2. Keep hard_limit and site_cap on absolute path.
3. Keep optimization_setpoint on dynamic path.
4. Keep purpose and operation mode rewrites deterministic and auditable.

Acceptance criteria:

- normalized request always resolves to a valid purpose/mode/path tuple
- strategy and evse targeting are preserved from request context

## Phase 4: SmartCharging Application Engine

Status: In place, tune for edge behavior.

1. Maintain absolute path SetChargingProfile flow in [core/src/modules/EMS/src/module/module.ts](core/src/modules/EMS/src/module/module.ts).
2. Keep station-level purpose evseId clamp to 0.
3. Keep clear-then-set sequencing for max profiles with configurable delay.
4. Maintain dynamic path UpdateDynamicSchedule flow with active dynamic profile lookup.
5. Preserve setpoint context in dynamic updates when present.
6. Keep discharge-only safety floor behavior.
7. Keep no-change suppression only for absolute path.

Acceptance criteria:

- OCPP 2.1 dynamic requests call UpdateDynamicSchedule with chargingProfileId
- OCPP 2.0.1 fallback path remains absolute SetChargingProfile
- repeated dynamic intents still send updates (drift correction behavior)

## Phase 5: Reconciliation and Drift Detection

Status: In place.

1. Maintain reconcile endpoint and comparison logic in [core/src/modules/EMS/src/module/module.ts](core/src/modules/EMS/src/module/module.ts).
2. Compare planned vs actual for limit and operation mode.
3. Persist reconcile decisions for auditability.

Acceptance criteria:

- missing active profile marks drift
- limit/mode mismatch marks drift with explicit reason
- drift count reflects per-station reconciliation output

## Phase 6: Auto-Apply Runtime Control

Status: In place.

1. Keep per-site auto-apply configuration endpoints in [core/src/modules/EMS/src/module/DataApi.ts](core/src/modules/EMS/src/module/DataApi.ts).
2. Maintain debounce and single in-flight guard in [core/src/modules/EMS/src/module/module.ts](core/src/modules/EMS/src/module/module.ts).
3. Ensure auto-apply reuses the same apply path as manual apply.

Acceptance criteria:

- rapid intent bursts trigger a single apply run per debounce window
- in-flight guard prevents overlapping site apply operations

## Operational Checklist

1. Verify DTO compatibility:
- [base/test/interfaces/EmsSiteIntentDto.test.ts](base/test/interfaces/EmsSiteIntentDto.test.ts)
- [base/test/interfaces/EmsChargingPlanDto.test.ts](base/test/interfaces/EmsChargingPlanDto.test.ts)
- [base/test/interfaces/EmsIntakeEventDto.test.ts](base/test/interfaces/EmsIntakeEventDto.test.ts)

2. Verify module behavior:
- [core/src/modules/EMS/test/module/EmsPolicyEngine.test.ts](core/src/modules/EMS/test/module/EmsPolicyEngine.test.ts)
- [core/src/modules/EMS/test/module/EmsModule.test.ts](core/src/modules/EMS/test/module/EmsModule.test.ts)

3. Verify data API behavior:
- [core/test/modules/EMS/EmsDataApi.test.ts](core/test/modules/EMS/EmsDataApi.test.ts)
- [core/test/modules/EMS/EmsDataApiRoutesRegistration.test.ts](core/test/modules/EMS/EmsDataApiRoutesRegistration.test.ts)

4. Verify MQTT bridge behavior:
- [core/test/modules/EMS/EmsMqttBridge.test.ts](core/test/modules/EMS/EmsMqttBridge.test.ts)

## Priority Backlog (Recommended)

1. Add rampRateWPerSec-aware throttling at policy allocation stage.
2. Add deterministic source-priority arbitration for competing active intents.
3. Add per-station hard capability min/max clamps before apply.
4. Add DER-vs-SmartCharging conflict policy table and resolver.
5. Add end-to-end tests for mixed-source conflicts and fallback transitions.
