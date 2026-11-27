# EMS Clamp to Test Matrix

This matrix maps each control clamp to its implementation anchor and current or recommended test coverage.

Related docs:

- [Control Model Draft](EMS-CONTROL-MODEL-DRAFT.md)
- [Implementation Checklist](EMS-IMPLEMENTATION-CHECKLIST.md)
- [Sequence Diagrams](EMS-SEQUENCE-DIAGRAMS.md)

## Matrix

| Clamp | Implementation Anchor | Current Coverage | Coverage Status | Suggested Additional Test |
|---|---|---|---|---|
| Time-window clamp (stale/future/expired) | [core/src/modules/EMS/src/module/IntentValidation.ts](core/src/modules/EMS/src/module/IntentValidation.ts) | [core/test/modules/EMS/EmsMqttBridge.test.ts](core/test/modules/EMS/EmsMqttBridge.test.ts) and intake event DTO tests | Partial | Add explicit stale-by-ms and future-skew boundary cases |
| Max-power bounds clamp | [core/src/modules/EMS/src/module/IntentValidation.ts](core/src/modules/EMS/src/module/IntentValidation.ts) | existing bridge validation tests | Partial | Add maxPowerW + 1 assertions for each bounded field |
| Idempotency clamp (duplicate messageId) | [core/src/modules/EMS/src/module/MqttBridge.ts](core/src/modules/EMS/src/module/MqttBridge.ts) | [core/test/modules/EMS/EmsMqttBridge.test.ts](core/test/modules/EMS/EmsMqttBridge.test.ts) | Present | Add duplicate via HTTP intake path in [core/src/modules/EMS/src/module/DataApi.ts](core/src/modules/EMS/src/module/DataApi.ts) |
| Non-negative budget clamp | [core/src/modules/EMS/src/module/PolicyEngine.ts](core/src/modules/EMS/src/module/PolicyEngine.ts) | [core/src/modules/EMS/test/module/EmsPolicyEngine.test.ts](core/src/modules/EMS/test/module/EmsPolicyEngine.test.ts) (allocation behavior) | Partial | Add negative budget input and assert zero allocation |
| Eligibility clamp: unsupported protocol | [core/src/modules/EMS/src/module/PolicyEngine.ts](core/src/modules/EMS/src/module/PolicyEngine.ts) | [core/src/modules/EMS/test/module/EmsPolicyEngine.test.ts](core/src/modules/EMS/test/module/EmsPolicyEngine.test.ts) | Present | Add mixed strategy coverage for equal_share_all vs equal_share_online |
| Eligibility clamp: unsupported operation mode on 2.0.1 | [core/src/modules/EMS/src/module/PolicyEngine.ts](core/src/modules/EMS/src/module/PolicyEngine.ts) | [core/src/modules/EMS/test/module/EmsPolicyEngine.test.ts](core/src/modules/EMS/test/module/EmsPolicyEngine.test.ts) | Present | Add all dynamic-only modes table-driven test |
| Eligibility clamp: EVSE mismatch | [core/src/modules/EMS/src/module/PolicyEngine.ts](core/src/modules/EMS/src/module/PolicyEngine.ts) | [core/src/modules/EMS/test/module/EmsPolicyEngine.test.ts](core/src/modules/EMS/test/module/EmsPolicyEngine.test.ts) | Present | Add station with empty evse metadata fallback case |
| Eligibility clamp: SmartCharging disabled | [core/src/modules/EMS/src/module/PolicyEngine.ts](core/src/modules/EMS/src/module/PolicyEngine.ts) | [core/src/modules/EMS/test/module/EmsPolicyEngine.test.ts](core/src/modules/EMS/test/module/EmsPolicyEngine.test.ts) | Present | Add explicit true and missing-value tolerance cases |
| Strategy clamp: offline exclusion for equal_share_online | [core/src/modules/EMS/src/module/PolicyEngine.ts](core/src/modules/EMS/src/module/PolicyEngine.ts) | [core/src/modules/EMS/test/module/EmsPolicyEngine.test.ts](core/src/modules/EMS/test/module/EmsPolicyEngine.test.ts) | Present | Add larger station set with mixed online state |
| Discharge clamp min(allocation, station cap) | [core/src/modules/EMS/src/module/PolicyEngine.ts](core/src/modules/EMS/src/module/PolicyEngine.ts) | policy engine V2X test | Partial | Add explicit assertions for allocation-only, cap-only, both, none |
| Intent-class normalization clamp | [core/src/modules/EMS/src/module/module.ts](core/src/modules/EMS/src/module/module.ts) | [core/src/modules/EMS/test/module/EmsModule.test.ts](core/src/modules/EMS/test/module/EmsModule.test.ts) | Partial | Add all intentClass values in one table-driven normalization test |
| Protocol/path clamp (dynamic requires 2.1) | [core/src/modules/EMS/src/module/module.ts](core/src/modules/EMS/src/module/module.ts) | module apply tests | Partial | Add explicit OCPP 2.0.1 dynamic-path rejection test |
| EVSE clamp to 0 for station-level profile purpose | [core/src/modules/EMS/src/module/module.ts](core/src/modules/EMS/src/module/module.ts) | [core/src/modules/EMS/test/module/EmsModule.test.ts](core/src/modules/EMS/test/module/EmsModule.test.ts) | Present | Add ChargingStationMaxProfile and ExternalConstraints both |
| Clear-then-set clamp for max profile race | [core/src/modules/EMS/src/module/module.ts](core/src/modules/EMS/src/module/module.ts) | not explicit | Missing | Add test asserting ClearChargingProfile called before SetChargingProfile and delay respected |
| Dynamic schedule setpoint preservation clamp | [core/src/modules/EMS/src/module/module.ts](core/src/modules/EMS/src/module/module.ts) | [core/src/modules/EMS/test/module/EmsModule.test.ts](core/src/modules/EMS/test/module/EmsModule.test.ts) | Present | Add null-setpoint and malformed-setpoint fallback cases |
| Discharge-only safety floor clamp | [core/src/modules/EMS/src/module/module.ts](core/src/modules/EMS/src/module/module.ts) | not explicit | Missing | Add dynamic and absolute tests where limit is 0 and dischargeLimitW is present |
| No-change suppression clamp (absolute only) | [core/src/modules/EMS/src/module/module.ts](core/src/modules/EMS/src/module/module.ts) | [core/src/modules/EMS/test/module/EmsModule.test.ts](core/src/modules/EMS/test/module/EmsModule.test.ts) | Present | Add explicit absolute unchanged skip assertion |
| Dynamic no-skip drift-correction behavior | [core/src/modules/EMS/src/module/module.ts](core/src/modules/EMS/src/module/module.ts) | [core/src/modules/EMS/test/module/EmsModule.test.ts](core/src/modules/EMS/test/module/EmsModule.test.ts) | Present | Add high-frequency repeated update simulation |
| Reconciliation drift clamp (mode and limit mismatch) | [core/src/modules/EMS/src/module/module.ts](core/src/modules/EMS/src/module/module.ts) | minimal direct tests | Partial | Add reconcile tests for missing profile, limit drift, mode drift |
| Auto-apply debounce and in-flight clamp | [core/src/modules/EMS/src/module/module.ts](core/src/modules/EMS/src/module/module.ts) | [core/src/modules/EMS/test/module/EmsModule.test.ts](core/src/modules/EMS/test/module/EmsModule.test.ts) | Present | Add in-flight overlap test with delayed apply promise |

## Suggested Test Execution Pack

Run this focused EMS pack during development:

1. [core/src/modules/EMS/test/module/EmsModule.test.ts](core/src/modules/EMS/test/module/EmsModule.test.ts)
2. [core/src/modules/EMS/test/module/EmsPolicyEngine.test.ts](core/src/modules/EMS/test/module/EmsPolicyEngine.test.ts)
3. [core/test/modules/EMS/EmsMqttBridge.test.ts](core/test/modules/EMS/EmsMqttBridge.test.ts)
4. [core/test/modules/EMS/EmsDataApi.test.ts](core/test/modules/EMS/EmsDataApi.test.ts)
5. [base/test/interfaces/EmsChargingPlanDto.test.ts](base/test/interfaces/EmsChargingPlanDto.test.ts)
6. [base/test/interfaces/EmsSiteIntentDto.test.ts](base/test/interfaces/EmsSiteIntentDto.test.ts)
7. [base/test/interfaces/EmsIntakeEventDto.test.ts](base/test/interfaces/EmsIntakeEventDto.test.ts)
