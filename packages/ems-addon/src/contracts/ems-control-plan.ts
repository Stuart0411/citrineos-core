// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { EmsOperationMode } from './ems-site-intent.js';

export interface EmsStationSnapshot {
  stationId: string;
  online: boolean;
  supportsV2x: boolean;
  maxChargeW?: number;
  maxDischargeW?: number;
}

export interface EmsStationControlTarget {
  stationId: string;
  evseId: number;
  operationMode: EmsOperationMode;
  chargeLimitW?: number;
  dischargeLimitW?: number;
}

export interface EmsDerControlAction {
  stationId: string;
  action: 'SetDefaultControl' | 'SetTargetPower' | 'ApplyGridCodePolicy';
  parameters: Record<string, unknown>;
}

export interface EmsControlPlan {
  siteId: string;
  tenantId: number;
  createdAt: string;
  intentTimestamp: string;
  stationTargets: EmsStationControlTarget[];
  derActions: EmsDerControlAction[];
}
