# EMS Add-on Roadmap

## Goal

Run CitrineOS as the protocol authority while treating EMS logic as an additive control layer. The EMS add-on should ingest normalized site intents and produce protocol-safe station plans for OCPP 2.1 SmartCharging and DER controls.

## Architectural Rule

Citrine core owns:

- OCPP message semantics and sequencing
- station connectivity and protocol compatibility
- persistence and audit for outbound OCPP interactions

EMS add-on owns:

- external intent ingestion
- site-level policy and arbitration
- station target planning
- dispatch decisions that are then translated by Citrine publishers

## Phase Plan

### Phase 1: Foundation (done)

- Create new clean repo from upstream v2.1.0
- Add new package: packages/ems-addon
- Define site intent, station snapshot, and control plan contracts
- Add validator, allocation strategy, policy engine, and control-loop scaffold

### Phase 2: Ingress Adapters (scaffold complete)

- Add MQTT ingress adapter for Home Assistant and ODE envelopes
- Add REST ingestion adapter for testing and fallback
- Add replay-safe intent deduplication keys
- Validate `expiresAt` and reject stale intents by policy

### Phase 3: Publisher Adapter

- Implement `ICitrineControlPublisher` with OCPP message API calls
- Map station targets to SetChargingProfile and UpdateDynamicSchedule
- Map DER actions to block R endpoints where supported
- Add fallback strategy per station capability and protocol version

### Phase 4: Observability and Governance

- Persist raw intent, normalized intent, generated plan, publish results
- Add metrics: accepted, rejected, stale, publish failures, per-station latency
- Add command conflict resolution and precedence policy
- Add safe fallback mode when ingress is unavailable

### Phase 5: Gradual Cutover

- Shadow mode: generate plans without publishing
- Canary mode: one site or station cohort
- Full mode: controlled rollout with rollback toggle to legacy behavior

## White-Paper Control Model Mapping

1. Grid and market layer: external, feeds EMS constraints.
2. EMS orchestration layer: Home Assistant and ODE produce site intent.
3. CSMS control layer: EMS add-on runs policy, Citrine core executes OCPP.
4. Station execution layer: station applies accepted profiles and DER controls.

## Immediate Next Tasks

1. Add JSON schema/Zod validation for inbound envelope contracts.
2. Implement first `ICitrineControlPublisher` adapter for OCPP 2.1 dynamic schedule updates.
3. Add integration tests using fixture intents and mocked station snapshots.
4. Add audit persistence schema using a forward-only migration.
