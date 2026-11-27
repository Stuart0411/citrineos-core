# EMS Control Model Draft (Upstream CitrineOS Baseline)

## Purpose

Define how the EMS module should ingest multiple control sources, normalize them into policy state, arbitrate conflicts, and apply clamped charger-safe commands through OCPP SmartCharging.

This draft uses the whitepaper target model and maps it to current upstream EMS implementation semantics.

## Whitepaper Alignment

The whitepaper recommends:

1. Home Assistant plus ODE publishes site-level intent envelopes.
2. CSMS (CitrineOS) owns protocol semantics and arbitration.
3. SmartCharging handles fast control loops.
4. DER Control handles persistent grid-code posture, not high-rate dispatch.

This draft keeps that separation:

- SmartCharging path: SetChargingProfile and UpdateDynamicSchedule.
- DER path: long-lived controls and policy posture.

## Control Sources (Input Layer)

### Source A: MQTT intent bus (primary asynchronous intake)

Expected envelope fields:

- site identity and messageId
- createdAt and expiresAt
- mode
- constraints (import/export and EV budgets)
- flags (allowDischarge, emergencyCurtailment)
- source metadata

Compatibility intake should also normalize ODE-style payload variants into the canonical intent schema.

### Source B: HTTP intent ingestion

Operator or external service can POST the canonical EMS site intent envelope directly.

### Source C: CSMS internal control APIs

Plan APIs allow derive/apply/reconcile operations and auto-apply config per site.

### Source D: Station and policy context

Not direct intent sources, but critical constraints:

- station protocol and capability metadata
- SmartCharging enabled flag from device model
- station energy transfer policy (export enabled, discharge cap)

## Intake Validation and Guardrails

Apply these checks before intent persistence:

1. Time window guardrails:
- createdAt must be valid
- expiresAt must be valid
- intent age <= maxAgeMs
- future skew <= maxFutureSkewMs
- expiresAt > now

2. Numeric bounds guardrails:
- reject constraints exceeding maxPowerW
- reject malformed numbers

3. Idempotency guardrail:
- unique messageId per tenant
- duplicate messageId is rejected as duplicate intake event

4. Telemetry and audit:
- emit accepted/rejected intake events
- persist intake outcome decision record with reasonCode

## Policy Engine Model (Arbitration Layer)

### Step 1: Select active site intent

- Fetch latest active intent by site.
- If absent, derive/apply/reconcile should return no-plan behavior.

### Step 2: Build candidate station set

- Start from requested stationIds.
- Resolve station metadata via location repository.

### Step 3: Eligibility gates per station

A station is eligible only if all pass:

1. Station exists.
2. Protocol is supported (OCPP 2.0.1 or 2.1 for EMS charging-profile fallback).
3. Requested operation mode is compatible with protocol.
4. ChargingProfile capability is available (strict for 2.0.1, permissive defaults for 2.1 metadata gaps).
5. Requested EVSE is compatible (with legacy metadata compatibility behavior).
6. SmartChargingCtrlr.Enabled is not explicitly false.
7. If strategy is equal_share_online, station must be online.

### Step 4: Budget derivation and first clamp

Derive budgets from active intent constraints:

- totalChargeBudgetW = max(0, evChargeBudgetW or maxImportW or 0)
- totalDischargeBudgetW = max(0, evDischargeBudgetW or maxExportW or 0)

This is the first clamp: never allocate negative budgets.

### Step 5: Allocation

For eligible stations only:

- perStationLimitW = totalChargeBudgetW / eligibleCount
- perStationDischargeAllocationW = totalDischargeBudgetW / eligibleCount

### Step 6: V2X policy overlay and second clamp

For each station, load latest energy transfer policy:

- exportAllowed boolean
- stationDischargeCapW

Resolve effective discharge limit as:

- if allocation and station cap exist: min(allocation, station cap)
- if only allocation exists: allocation
- if only station cap exists: station cap
- else null

This is the second clamp: station policy cap limits EMS-requested discharge.

### Step 7: Output recommendation set

Emit recommendation for each requested station (eligible and ineligible), including:

- eligibility and reason
- protocol
- operation mode
- limitW
- exportAllowed
- dischargeLimitW
- intent linkage

## Intent-Class Normalization Model

Normalize user intent class into profile semantics before apply:

1. hard_limit
- purpose -> ChargingStationExternalConstraints
- operationMode -> ExternalLimits
- applicationPath -> absolute

2. site_cap
- purpose -> ChargingStationMaxProfile
- operationMode -> ExternalLimits
- applicationPath -> absolute

3. priority_boost
- purpose -> PriorityCharging
- operationMode -> ChargingOnly
- applicationPath -> absolute

4. optimization_setpoint
- purpose -> TxProfile
- applicationPath -> dynamic

Profile-option fallbacks should follow the same mapping envelope.

## Apply Engine Model (Execution Layer)

### Path selection

1. dynamic path
- requires OCPP 2.1
- requires an active Dynamic profile to update
- uses UpdateDynamicSchedule

2. absolute path
- uses SetChargingProfile
- supports OCPP 2.1 and fallback OCPP 2.0.1 absolute semantics

### Absolute path behavior

1. Build stable stackLevel from intent class / purpose bands.
2. For station-level purposes, force evseId = 0 (OCPP 2.1 requirement).
3. For ChargingStationMaxProfile, clear old profile first, then wait clear-set delay.
4. Build schedule period:
- limit = planned limitW
- operationMode = planned mode
- dischargeLimit = negative absolute value when discharge is enabled
5. Persist profile and emit decision outcome.

### Dynamic path behavior

1. Locate active Dynamic profile for station/evse.
2. Build scheduleUpdate with:
- limit
- operationMode
- preserved setpoint context when present
- dischargeLimit (negative absolute value) if discharge enabled
3. Send UpdateDynamicSchedule and record result.

### Dynamic safety floor

When dispatch is discharge-only (zero charge limit + discharge requested), use a small positive limit floor to avoid station invalid-profile rejection.

## No-Change Suppression Model

Apply fingerprint-based no-change suppression only for absolute path.

- If absolute fingerprint unchanged, skip re-apply.
- Always send dynamic updates even if unchanged to correct station drift.

## Reconciliation Model

Reconcile compares planned recommendation vs active EMS profile state:

- profile existence
- planned vs actual limitW
- planned vs actual operationMode

Classify each station as drifted/non-drifted and persist reconciliation decision records.

## Auto-Apply Model

When MQTT stores a new intent, optional auto-apply can trigger by site config.

Guardrails:

1. per-site debounce timer (avoid thrash)
2. single in-flight execution per site
3. non-fatal logging on apply failure

Auto-apply should invoke the same derive/apply path to guarantee consistent clamping and audit.

## Clamping Summary (Single View)

1. Intake clamp: temporal validity and maxPowerW bounds.
2. Budget clamp: non-negative site budgets.
3. Eligibility clamp: unsupported/offline/incompatible stations -> zero effective allocation.
4. Discharge clamp: min(intent allocation, station policy cap).
5. Protocol clamp: dynamic semantics only where protocol supports them.
6. EVSE clamp: station-level profiles force evseId 0.
7. Safety clamp: discharge-only floor on schedule limit for station compatibility.
8. Change clamp: suppress unchanged absolute applies.

## Recommended Next Hardening Slices

1. Add explicit priority ordering for multiple concurrent intents (newest, emergency, source trust level).
2. Add ramp-rate aware allocation step (limit delta per cycle using rampRateWPerSec).
3. Add per-station min/max capability clamps in allocation phase.
4. Add deterministic conflict policy between DER posture and SmartCharging dispatch.
5. Add end-to-end tests for each clamp layer and multi-source conflict scenarios.
