// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { EmsSiteIntentSchema } from '../../src/interfaces/dto/ems.site.intent.dto.js';

describe('EmsSiteIntentSchema', () => {
  it('accepts a valid Home Assistant and Open Dynamic Export site intent', () => {
    const result = EmsSiteIntentSchema.safeParse({
      messageId: '7f3f8b10-0c30-4f9d-bf81-79269ae7b8ea',
      tenantId: 1,
      siteId: 'au-site-001',
      source: {
        system: 'home-assistant',
        component: 'open-dynamic-export',
        instance: 'ha-main',
      },
      createdAt: '2026-08-17T10:00:00.000Z',
      expiresAt: '2026-08-17T10:00:30.000Z',
      mode: 'ExternalLimits',
      constraints: {
        maxImportW: 25000,
        maxExportW: 5000,
        evChargeBudgetW: 11000,
        evDischargeBudgetW: 7000,
        rampRateWPerSec: 1000,
      },
      flags: {
        allowDischarge: true,
        emergencyCurtailment: false,
      },
      reason: 'csip-aus_dynamic_export',
      metadata: {
        tariffMode: 'two_way',
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects intents whose expiry is not after creation', () => {
    const result = EmsSiteIntentSchema.safeParse({
      messageId: '7f3f8b10-0c30-4f9d-bf81-79269ae7b8ea',
      siteId: 'au-site-001',
      source: {
        system: 'home-assistant',
        component: 'open-dynamic-export',
        instance: 'ha-main',
      },
      createdAt: '2026-08-17T10:00:30.000Z',
      expiresAt: '2026-08-17T10:00:00.000Z',
      mode: 'ExternalLimits',
      constraints: {},
      reason: 'expired_example',
    });

    expect(result.success).toBe(false);
  });
});