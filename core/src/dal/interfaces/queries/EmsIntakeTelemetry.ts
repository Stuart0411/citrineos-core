// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { DEFAULT_TENANT_ID, QuerySchema } from '@citrineos/base';

export const EmsIntakeTelemetryQuerySchema = QuerySchema('EmsIntakeTelemetryQuerySchema', [
  {
    key: 'tenantId',
    type: 'number',
    required: true,
    defaultValue: String(DEFAULT_TENANT_ID),
  },
  {
    key: 'siteId',
    type: 'string',
  },
  {
    key: 'fromCreatedAt',
    type: 'string',
  },
  {
    key: 'toCreatedAt',
    type: 'string',
  },
  {
    key: 'limit',
    type: 'number',
  },
]);

export interface EmsIntakeTelemetryQuerystring {
  tenantId: number;
  siteId?: string;
  fromCreatedAt?: string;
  toCreatedAt?: string;
  limit?: number;
}