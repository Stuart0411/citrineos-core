<!-- SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Merge Changelog 2026-09-16

## Summary

This merge stabilizes the CitrineOS runtime after branch integration drift across `packages/base`, `packages/core`, `packages/types`, and `apps/ocpp-server`. The main outcomes are:

- restored clean builds for the runtime package chain
- repaired OCPP router/runtime compatibility after message-model changes
- removed stale-dist dependence from the security-event e2e harness
- fixed WebSocket test-port collisions that masked the real runtime behavior
- restored green end-to-end `SecurityEventNotification` flows for both Sequelize and Drizzle
- revalidated adjacent router, RabbitMQ, and DAL behavior with targeted Vitest coverage

## Major Change Areas

### 1. Build and Runtime Chain Stabilization

- Made the OCPP server build script Windows-safe by switching the nested build call to `corepack pnpm run copy-assets`.
- Restored compatibility in `packages/base` so downstream `packages/core` APIs compile against the updated base abstractions.
- Re-established a clean build path for:
  - `@citrineos/base`
  - `@citrineos/core`
  - `@citrineos/ocpp-server`
- Added missing type and DTO exports in `packages/types` needed by core Sequelize and Drizzle layers.

### 2. Base-Layer Compatibility Fixes

Updated `packages/base` to match the new runtime message model and module API behavior:

- `AbstractModuleApi`
  - restored version-aware route path generation
  - reintroduced `_ocppVersion` compatibility state for versioned module APIs
- `AbstractRouter`
  - fixed call validation to use named `Call` fields instead of tuple indexing
  - preserved sanitized payloads on the `Call` object itself
- `AbstractModule`
  - fixed module-config indexing for excluded request/response action lists

These changes were required because the router and message APIs were partly updated to object-style OCPP messages while some validation logic still assumed tuple-style frames.

### 3. Core Repository and Model Corrections

Updated repository and model code in `packages/core` to remove branch-integration drift and stale type sources:

- fixed multiple imports that incorrectly sourced runtime enums and DTO types from `@citrineos/base` instead of `@citrineos/types`
- aligned repository constructors with the current destructured dependency pattern
- corrected charging-station contract drift between DTO shape and persistence model shape
- updated charging profile persistence to use `ocppConnectionName` rather than stale `stationId` usage in the affected code paths
- updated RabbitMQ connection/channel manager typing so the message transport layer builds and runs correctly

### 4. Safer Sequelize Create Behavior

Adjusted shared Sequelize repository create behavior:

- create operations now save with `returning: false`
- reload is only attempted when the model has a resolvable primary key

This preserved the workaround needed for stale-returning metadata while avoiding reload failures on models such as `EventData` that do not expose a reloadable primary key in the same way.

### 5. OCPP Security Event End-to-End Repair

The security-event e2e failures were caused by more than one issue:

- stale compiled artifacts could be exercised even after source fixes
- the harness used a fixed OCPP WebSocket port (`8081`), which allowed stale listeners to intercept test traffic
- router call validation still treated `Call` messages as arrays, producing `FormatViolation` before the request reached the handler

The e2e harness was updated to:

- rebuild `@citrineos/base`, `@citrineos/core`, and `@citrineos/ocpp-server` before starting the compiled server
- allocate a dynamic HTTP port
- allocate a dynamic WebSocket port
- inject those ports into the generated local config
- align startup timeout budgets with the rebuilt server startup path

After these changes, the test traffic reliably hits the freshly built server instance, and both repository modes acknowledge and persist security events correctly.

### 6. Test Maintenance and Regression Fixes

Updated targeted tests around the repaired paths:

- fixed `VariableMonitoring.EventData.test.ts` to assert stable business-key identity instead of a missing/unstable model `id`
- kept the router tests green after the `Call` model validation change
- kept RabbitMQ connection-manager tests green after connection typing fixes

### 7. Generated Dist Config Noise Reduction

Updated generated `dist/tsconfig.json` files so local tooling no longer misreads relative `extends` and `references` paths during representative Vitest runs.

This reduced false `tsconfig-paths` parse warnings from generated artifacts, improving merge-readiness signal without changing runtime behavior.

## Validation Performed

### Package Builds

Verified successful builds for:

- `@citrineos/base`
- `@citrineos/core`
- `@citrineos/ocpp-server`

### End-to-End Validation

Verified:

- `packages/core/test/dal/e2e/security-event.e2e.test.ts`
  - Sequelize scenario passed
  - Drizzle scenario passed

### Targeted Regression Slice

Verified successful runs for:

- `packages/core/test/modules/OcppRouter/module/MessageRouterImpl.test.ts`
- `packages/core/test/util/queue/rabbit-mq/ConnectionManager.test.ts`
- `packages/core/test/util/queue/rabbit-mq/receiver.test.ts`
- `packages/core/src/dal/layers/sequelize/repository/DerRepositories.test.ts`
- `packages/core/src/dal/layers/sequelize/repository/ChargingProfile.DynamicFields.test.ts`
- `packages/core/src/dal/layers/sequelize/repository/VariableMonitoring.EventData.test.ts`

## Files with Notable Functional Changes

- `apps/ocpp-server/package.json`
- `apps/ocpp-server/src/container.ts`
- `packages/base/src/interfaces/api/AbstractModuleApi.ts`
- `packages/base/src/interfaces/router/AbstractRouter.ts`
- `packages/base/src/interfaces/modules/AbstractModule.ts`
- `packages/core/src/dal/interfaces/repositories.ts`
- `packages/core/src/dal/layers/sequelize/repository/Base.ts`
- `packages/core/src/dal/layers/sequelize/repository/OCPPMessage.ts`
- `packages/core/src/dal/layers/sequelize/repository/SecurityEvent.ts`
- `packages/core/src/dal/layers/sequelize/repository/VariableMonitoring.ts`
- `packages/core/src/modules/OcppRouter/src/module/router.ts`
- `packages/core/src/util/queue/rabbit-mq/ChannelManager.ts`
- `packages/core/src/util/queue/rabbit-mq/ConnectionManager.ts`
- `packages/core/src/util/queue/rabbit-mq/receiver.ts`
- `packages/core/test/dal/e2e/security-event.e2e.test.ts`
- `packages/types/index.ts`
- `packages/types/src/ocpp/rpc/message.ts`

## Residual Notes

- The local environment still reports an engine warning because the workspace requests Node `>=24.16.0` while validation here ran on `24.15.0`.
- Targeted validation is green, but this changelog does not claim a full-repo test-suite pass.