// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { DEFAULT_TENANT_ID, QuerySchema } from '@citrineos/base';

export const StationEnergyTransferPolicyQuerySchema = QuerySchema(
  'StationEnergyTransferPolicyQuerySchema',
  [
    {
      key: 'tenantId',
      type: 'number',
      required: true,
      defaultValue: String(DEFAULT_TENANT_ID),
    },
    {
      key: 'stationId',
      type: 'string',
    },
    {
      key: 'transactionId',
      type: 'string',
    },
    {
      key: 'exportEnabled',
      type: 'boolean',
    },
    {
      key: 'allowedMode',
      type: 'string',
    },
    {
      key: 'fromUpdatedAt',
      type: 'string',
    },
    {
      key: 'toUpdatedAt',
      type: 'string',
    },
    {
      key: 'limit',
      type: 'number',
    },
    {
      key: 'includeDiagnostics',
      type: 'boolean',
    },
    {
      key: 'summary',
      type: 'boolean',
    },
  ],
);

export interface StationEnergyTransferPolicyQuerystring {
  tenantId: number;
  stationId?: string;
  transactionId?: string;
  exportEnabled?: boolean;
  allowedMode?: string;
  fromUpdatedAt?: string;
  toUpdatedAt?: string;
  limit?: number;
  includeDiagnostics?: boolean;
  summary?: boolean;
}
