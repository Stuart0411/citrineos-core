// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { DEFAULT_TENANT_ID, QuerySchema } from '@citrineos/base';

export const StationDerCapabilityQuerySchema = QuerySchema('StationDerCapabilityQuerySchema', [
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
    key: 'supportedControlType',
    type: 'string',
  },
  {
    key: 'hasDeviceModelSnapshot',
    type: 'boolean',
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
]);

export interface StationDerCapabilityQuerystring {
  tenantId: number;
  stationId?: string;
  supportedControlType?: string;
  hasDeviceModelSnapshot?: boolean;
  fromUpdatedAt?: string;
  toUpdatedAt?: string;
  limit?: number;
}
