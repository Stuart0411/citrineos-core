// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

export type EmsOperationMode =
  | 'Idle'
  | 'ChargingOnly'
  | 'CentralSetpoint'
  | 'ExternalSetpoint'
  | 'ExternalLimits'
  | 'CentralFrequency'
  | 'LocalFrequency'
  | 'LocalLoadBalancing';

export interface EmsIntentConstraints {
  maxImportW?: number;
  maxExportW?: number;
  evChargeBudgetW?: number;
  evDischargeBudgetW?: number;
  rampRateWPerSec?: number;
}

export interface EmsSourceMetadata {
  sourceSystem?: string;
  reason?: string;
  emergencyCurtailed?: boolean;
}

export interface EmsSiteIntent {
  siteId: string;
  tenantId: number;
  timestamp: string;
  expiresAt: string;
  operationMode: EmsOperationMode;
  constraints: EmsIntentConstraints;
  metadata?: EmsSourceMetadata;
}
