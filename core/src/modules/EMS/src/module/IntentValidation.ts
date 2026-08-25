// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { EmsSiteIntentCreate, SystemConfig } from '@citrineos/base';

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;
const DEFAULT_MAX_FUTURE_SKEW_MS = 30 * 1000;
const DEFAULT_MAX_POWER_W = 1_000_000;

export function validateEmsIntentPolicy(
  config: SystemConfig,
  intent: EmsSiteIntentCreate,
  now: Date = new Date(),
): void {
  const settings = config.modules.ems?.intentValidation;
  const maxAgeMs = settings?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const maxFutureSkewMs = settings?.maxFutureSkewMs ?? DEFAULT_MAX_FUTURE_SKEW_MS;
  const maxPowerW = settings?.maxPowerW ?? DEFAULT_MAX_POWER_W;

  const createdAt = new Date(intent.createdAt);
  const expiresAt = new Date(intent.expiresAt);

  if (Number.isNaN(createdAt.getTime())) {
    throw new Error('createdAt must be a valid datetime string');
  }
  if (Number.isNaN(expiresAt.getTime())) {
    throw new Error('expiresAt must be a valid datetime string');
  }

  const ageMs = now.getTime() - createdAt.getTime();
  if (ageMs > maxAgeMs) {
    throw new Error(`EMS intent is stale by ${ageMs - maxAgeMs}ms`);
  }

  const futureSkewMs = createdAt.getTime() - now.getTime();
  if (futureSkewMs > maxFutureSkewMs) {
    throw new Error(`EMS intent createdAt is too far in the future by ${futureSkewMs - maxFutureSkewMs}ms`);
  }

  if (expiresAt.getTime() <= now.getTime()) {
    throw new Error('EMS intent expiresAt is already in the past');
  }

  const boundedPowerFields = [
    ['maxImportW', intent.constraints.maxImportW],
    ['maxExportW', intent.constraints.maxExportW],
    ['evChargeBudgetW', intent.constraints.evChargeBudgetW],
    ['evDischargeBudgetW', intent.constraints.evDischargeBudgetW],
    ['rampRateWPerSec', intent.constraints.rampRateWPerSec],
  ] as const;

  for (const [fieldName, value] of boundedPowerFields) {
    if (value == null) {
      continue;
    }
    if (value > maxPowerW) {
      throw new Error(`${fieldName} exceeds configured maxPowerW (${maxPowerW})`);
    }
  }
}
