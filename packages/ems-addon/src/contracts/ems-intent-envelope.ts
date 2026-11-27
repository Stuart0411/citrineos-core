// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { EmsIntentConstraints, EmsOperationMode } from './ems-site-intent.js';

export interface EmsIntentEnvelope {
  siteId: string;
  tenantId: number;
  timestamp?: string;
  expiresAt?: string;
  operationMode?: EmsOperationMode;
  constraints: EmsIntentConstraints;
  source?: string;
  reason?: string;
  dedupeKey?: string;
  emergencyCurtailed?: boolean;
}

export interface TopicValueMessage {
  siteId: string;
  tenantId: number;
  value: number | boolean | string;
  timestamp?: string;
  expiresAt?: string;
  source?: string;
  reason?: string;
  dedupeKey?: string;
}
