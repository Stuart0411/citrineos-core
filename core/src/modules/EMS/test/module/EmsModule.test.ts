// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { OCPPVersion } from '@citrineos/base';
import { Logger } from 'tslog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmsModule } from '../../src/module/module.js';

describe('EmsModule applyChargingPlan', () => {
  let emsSiteIntentRepository: any;
  let emsDecisionRepository: any;
  let locationRepository: any;
  let chargingProfileRepository: any;
  let deviceModelRepository: any;
  let stationEnergyTransferPolicyRepository: any;
  let module: EmsModule;

  beforeEach(() => {
    vi.clearAllMocks();

    emsSiteIntentRepository = {};
    emsDecisionRepository = {
      createDecision: vi.fn().mockResolvedValue(undefined),
    };
    locationRepository = {};
    chargingProfileRepository = {
      getNextChargingProfileId: vi.fn().mockResolvedValue(1001),
      getNextChargingScheduleId: vi.fn().mockResolvedValue(2001),
      getNextStackLevel: vi.fn().mockResolvedValue(1),
      createOrUpdateChargingProfile: vi.fn().mockResolvedValue(undefined),
    };
    deviceModelRepository = {
      readAllByQuerystring: vi.fn().mockResolvedValue([]),
    };
    stationEnergyTransferPolicyRepository = {
      readOnlyOneByQuery: vi.fn().mockResolvedValue(undefined),
    };

    module = new EmsModule(
      {
        env: 'test',
        logLevel: 3,
        maxCachingSeconds: 60,
        modules: {
          ems: {
            requests: [],
            responses: [],
          },
        },
      } as any,
      {
        get: vi.fn(),
        set: vi.fn(),
      } as any,
      {
        sendRequest: vi.fn(),
        sendResponse: vi.fn(),
        shutdown: vi.fn(),
      } as any,
      {
        module: null,
        subscribe: vi.fn().mockResolvedValue(true),
        shutdown: vi.fn(),
      } as any,
      new Logger({ name: 'EmsModuleTest', minLevel: 7 }),
      undefined,
      emsSiteIntentRepository,
      emsDecisionRepository,
      locationRepository,
      chargingProfileRepository,
      {
        generateRequestId: vi.fn().mockResolvedValue(7001),
      } as any,
      deviceModelRepository,
      stationEnergyTransferPolicyRepository,
    );
  });

  it('includes dischargeLimit in OCPP 2.1 charging profile when export is allowed', async () => {
    vi.spyOn(module, 'deriveChargingPlan').mockResolvedValue({
      siteId: 'site-1',
      sourceIntentMessageId: 'intent-apply-1',
      totalBudgetW: 10000,
      eligibleStationCount: 1,
      strategy: 'equal_share_online',
      recommendations: [
        {
          stationId: 'cs-apply-1',
          isOnline: true,
          protocol: OCPPVersion.OCPP2_1,
          eligible: true,
          eligibilityReason: null,
          evseId: 1,
          chargingProfilePurpose: 'ChargingStationMaxProfile',
          chargingProfileKind: 'Dynamic',
          chargingRateUnit: 'W',
          operationMode: 'ExternalLimits',
          limitW: 5000,
          exportAllowed: true,
          dischargeLimitW: 3200,
          sourceIntentMessageId: 'intent-apply-1',
        },
      ],
    } as any);

    const sendCallSpy = vi.spyOn(module, 'sendCall').mockResolvedValue({
      success: true,
      payload: { status: 'Accepted' },
    } as any);

    const result = await module.applyChargingPlan(1, {
      siteId: 'site-1',
      stationIds: ['cs-apply-1'],
      evseId: 1,
      strategy: 'equal_share_online',
      chargingProfilePurpose: 'ChargingStationMaxProfile',
      operationMode: 'ExternalLimits',
    });

    const createdProfile = chargingProfileRepository.createOrUpdateChargingProfile.mock.calls[0][1];
    expect(createdProfile.chargingSchedule[0].chargingSchedulePeriod[0]).toEqual(
      expect.objectContaining({
        limit: 5000,
        operationMode: 'ExternalLimits',
        dischargeLimit: 3200,
      }),
    );

    const outboundRequest = sendCallSpy.mock.calls[0][4] as any;
    expect(outboundRequest.chargingProfile.chargingSchedule[0].chargingSchedulePeriod[0]).toEqual(
      expect.objectContaining({
        limit: 5000,
        operationMode: 'ExternalLimits',
        dischargeLimit: 3200,
      }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        appliedCount: 1,
      }),
    );
  });
});
