// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { DEFAULT_TENANT_ID, QuerySchema } from '@citrineos/base';

export const DerControlQuerySchema = QuerySchema('DerControlQuerySchema', [
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
    key: 'controlId',
    type: 'string',
  },
  {
    key: 'controlType',
    type: 'string',
  },
  {
    key: 'isDefault',
    type: 'boolean',
  },
  {
    key: 'isSuperseded',
    type: 'boolean',
  },
  {
    key: 'status',
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
]);

export interface DerControlQuerystring {
  tenantId: number;
  stationId?: string;
  controlId?: string;
  controlType?: string;
  isDefault?: boolean;
  isSuperseded?: boolean;
  status?: string;
  fromUpdatedAt?: string;
  toUpdatedAt?: string;
  limit?: number;
}
