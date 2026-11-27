// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { IEmsIntentValidator } from '../interfaces/i-ems-intent-validator.js';
import type { EmsSiteIntent } from '../contracts/ems-site-intent.js';

export class DefaultEmsIntentValidator implements IEmsIntentValidator {
  validate(intent: EmsSiteIntent): string[] {
    const issues: string[] = [];

    if (!intent.siteId) {
      issues.push('siteId is required');
    }

    if (!Number.isInteger(intent.tenantId) || intent.tenantId <= 0) {
      issues.push('tenantId must be a positive integer');
    }

    if (!intent.timestamp || Number.isNaN(Date.parse(intent.timestamp))) {
      issues.push('timestamp must be an ISO datetime');
    }

    if (!intent.expiresAt || Number.isNaN(Date.parse(intent.expiresAt))) {
      issues.push('expiresAt must be an ISO datetime');
    }

    return issues;
  }

  isFresh(intent: EmsSiteIntent, nowIso = new Date().toISOString()): boolean {
    const now = Date.parse(nowIso);
    const expiresAt = Date.parse(intent.expiresAt);
    return Number.isFinite(expiresAt) && now < expiresAt;
  }
}
