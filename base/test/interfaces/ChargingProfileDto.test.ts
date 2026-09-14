// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { ChargingProfileSchema } from '../../src/interfaces/dto/charging.profile.dto.js';

describe('ChargingProfileSchema', () => {
  it('accepts OCPP 2.1 Dynamic profile kinds and purposes', () => {
    const result = ChargingProfileSchema.safeParse({
      databaseId: 1,
      stationId: 'STATION_001',
      id: 42,
      chargingProfileKind: 'Dynamic',
      chargingProfilePurpose: 'PriorityCharging',
      dynUpdateInterval: 30,
      dynUpdateTime: '2026-08-17T12:00:00.000Z',
      stackLevel: 0,
      isActive: false,
      chargingLimitSource: 'EMS',
      chargingSchedule: [
        {
          databaseId: 10,
          id: 11,
          stationId: 'STATION_001',
          chargingRateUnit: 'W',
          chargingSchedulePeriod: [
            {
              startPeriod: 0,
              limit: 11000,
              operationMode: 'ExternalLimits',
              dischargeLimit: -7000,
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dynUpdateInterval).toBe(30);
      expect(result.data.dynUpdateTime).toBe('2026-08-17T12:00:00.000Z');
    }
  });
});