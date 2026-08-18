// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { DEFAULT_TENANT_ID, QuerySchema } from '@citrineos/base';

export const DerEventQuerySchema = QuerySchema('DerEventQuerySchema', [
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
    key: 'eventType',
    type: 'string',
  },
  {
    key: 'fromOccurredAt',
    type: 'string',
  },
  {
    key: 'toOccurredAt',
    type: 'string',
  },
  {
    key: 'limit',
    type: 'number',
  },
]);

export interface DerEventQuerystring {
  tenantId: number;
  stationId?: string;
  controlId?: string;
  eventType?: string;
  fromOccurredAt?: string;
  toOccurredAt?: string;
  limit?: number;
}
