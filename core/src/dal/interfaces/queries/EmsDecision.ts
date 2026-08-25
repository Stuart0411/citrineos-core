// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { DEFAULT_TENANT_ID, QuerySchema } from '@citrineos/base';

export const EmsDecisionQuerySchema = QuerySchema('EmsDecisionQuerySchema', [
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
    key: 'stationId',
    type: 'string',
  },
  {
    key: 'decisionType',
    type: 'string',
  },
  {
    key: 'intentMessageId',
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

export interface EmsDecisionQuerystring {
  tenantId: number;
  siteId?: string;
  stationId?: string;
  decisionType?: string;
  intentMessageId?: string;
  fromCreatedAt?: string;
  toCreatedAt?: string;
  limit?: number;
}
