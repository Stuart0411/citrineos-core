// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import { EmsPolicyEngine } from '../../../src/modules/EMS/src/module/PolicyEngine.js';

describe('EmsPolicyEngine', () => {
  it('equal-splits the current site budget across online stations', async () => {
    const engine = new EmsPolicyEngine(
      {
        readLatestActiveBySiteId: vi.fn().mockResolvedValue({
          messageId: 'intent-1',
          constraints: { evChargeBudgetW: 12000 },
        }),
      } as any,
      {
        getChargingStationsByIds: vi.fn().mockResolvedValue([
          { id: 'station-a', isOnline: true, protocol: 'ocpp2.1' },
          { id: 'station-b', isOnline: false, protocol: 'ocpp2.1' },
          { id: 'station-c', isOnline: true, protocol: 'ocpp2.0.1' },
        ]),
      } as any,
    );

    const plan = await engine.deriveChargingPlan(1, {
      siteId: 'site-1',
      stationIds: ['station-a', 'station-b', 'station-c'],
      evseId: 1,
      strategy: 'equal_share_online',
      chargingProfilePurpose: 'ChargingStationMaxProfile',
      operationMode: 'ExternalLimits',
    });

    expect(plan).toMatchObject({
      sourceIntentMessageId: 'intent-1',
      totalBudgetW: 12000,
      eligibleStationCount: 2,
    });
    expect(plan?.recommendations).toEqual([
      expect.objectContaining({ stationId: 'station-a', eligible: true, limitW: 6000, protocol: 'ocpp2.1' }),
      expect.objectContaining({ stationId: 'station-b', eligible: false, limitW: 0, protocol: 'ocpp2.1' }),
      expect.objectContaining({ stationId: 'station-c', eligible: true, limitW: 6000, protocol: 'ocpp2.0.1' }),
    ]);
  });
});