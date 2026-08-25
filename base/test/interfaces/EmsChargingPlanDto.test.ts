// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { EmsChargingPlanRequestSchema } from '../../src/interfaces/dto/ems.charging.plan.dto.js';

describe('EmsChargingPlanRequestSchema', () => {
  it('accepts a valid charging plan request', () => {
    const result = EmsChargingPlanRequestSchema.safeParse({
      siteId: 'site-1',
      stationIds: ['station-a', 'station-b'],
      evseId: 1,
      strategy: 'equal_share_online',
      chargingProfilePurpose: 'ChargingStationMaxProfile',
      operationMode: 'ExternalLimits',
    });

    expect(result.success).toBe(true);
  });
});