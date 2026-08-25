// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { EmsIntakeEventSchema } from '../../src/interfaces/dto/ems.intake.event.dto.js';

describe('EmsIntakeEventSchema', () => {
  it('accepts a valid accepted intake event payload', () => {
    const result = EmsIntakeEventSchema.safeParse({
      status: 'accepted',
      reasonCode: 'stored',
      reason: 'Intent persisted',
      receivedTopic: 'citrine/ems/site/site-1/intent/current',
      receivedAt: '2026-08-17T10:00:00.000Z',
      messageId: '7f3f8b10-0c30-4f9d-bf81-79269ae7b8ea',
      siteId: 'site-1',
      tenantId: 1,
    });

    expect(result.success).toBe(true);
  });

  it('rejects unknown intake event reason codes', () => {
    const result = EmsIntakeEventSchema.safeParse({
      status: 'rejected',
      reasonCode: 'bad_reason_code',
      reason: 'test',
      receivedTopic: 'citrine/ems/site/site-1/intent/current',
      receivedAt: '2026-08-17T10:00:00.000Z',
      siteId: 'site-1',
    });

    expect(result.success).toBe(false);
  });
});