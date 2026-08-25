// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { DEFAULT_TENANT_ID, QuerySchema } from '@citrineos/base';

export const CreateEmsSiteIntentQuerySchema = QuerySchema('CreateEmsSiteIntentQuerySchema', [
  {
    key: 'tenantId',
    type: 'number',
    required: true,
    defaultValue: String(DEFAULT_TENANT_ID),
  },
]);

export interface CreateEmsSiteIntentQuerystring {
  tenantId: number;
}

export const EmsSiteIntentQuerySchema = QuerySchema('EmsSiteIntentQuerySchema', [
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
    key: 'messageId',
    type: 'string',
  },
  {
    key: 'currentOnly',
    type: 'boolean',
  },
]);

export interface EmsSiteIntentQuerystring {
  tenantId: number;
  siteId?: string;
  messageId?: string;
  currentOnly?: boolean;
}