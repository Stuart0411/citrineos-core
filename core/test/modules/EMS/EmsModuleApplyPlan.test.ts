// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import { Logger } from 'tslog';
import type { ICache, IMessageHandler, IMessageSender, SystemConfig } from '@citrineos/base';
import { ChargingLimitSourceEnum, OCPPVersion } from '@citrineos/base';
import { EmsModule } from '../../../src/modules/EMS/src/module/module.js';

describe('EmsModule.applyChargingPlan', () => {
  it('applies to eligible OCPP 2.1 and OCPP 2.0.1 stations with fallback', async () => {
    const emsRepo = {
      readLatestActiveBySiteId: vi.fn().mockResolvedValue({
        messageId: 'intent-1',
        constraints: { evChargeBudgetW: 10000 },
      }),
      createSiteIntent: vi.fn(),
      readAllBySiteId: vi.fn(),
      readOnlyOneByQuery: vi.fn(),
      readAllByQuery: vi.fn(),
    } as any;
    const locationRepo = {
      getChargingStationsByIds: vi.fn().mockResolvedValue([
        { id: 'station-a', isOnline: true, protocol: 'ocpp2.1' },
        { id: 'station-b', isOnline: true, protocol: 'ocpp2.0.1' },
      ]),
    } as any;
    const emsDecisionRepo = {
      createDecision: vi.fn().mockResolvedValue(undefined),
    } as any;
    const chargingProfileRepo = {
      getNextChargingProfileId: vi.fn().mockResolvedValue(101),
      getNextChargingScheduleId: vi.fn().mockResolvedValue(201),
      getNextStackLevel: vi.fn().mockResolvedValue(0),
      createOrUpdateChargingProfile: vi.fn().mockResolvedValue(undefined),
    } as any;
    const cache = {
      get: vi
        .fn()
        .mockResolvedValueOnce(JSON.stringify({ protocol: 'ocpp2.1' }))
        .mockResolvedValueOnce(JSON.stringify({ protocol: 'ocpp2.0.1' })),
      set: vi.fn(),
    } as any as ICache;
    const sender = {
      sendRequest: vi.fn().mockResolvedValue({ success: true, payload: 'queued' }),
      sendResponse: vi.fn(),
      send: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
    } as any as IMessageSender;
    const handler = {
      handle: vi.fn(),
      subscribe: vi.fn().mockResolvedValue(true),
      shutdown: vi.fn().mockResolvedValue(undefined),
      module: undefined,
    } as any as IMessageHandler;

    const module = new EmsModule(
      {
        env: 'development',
        logLevel: 2,
        maxCachingSeconds: 60,
        modules: {
          ems: { endpointPrefix: 'ems', requests: [], responses: [] },
        },
      } as any as SystemConfig,
      cache,
      sender,
      handler,
      new Logger({ name: 'EmsModuleApplyPlanTest' }),
      undefined,
      emsRepo,
      emsDecisionRepo,
      locationRepo,
      chargingProfileRepo,
      { generateRequestId: vi.fn().mockResolvedValue(7001) } as any,
    );

    const response = await module.applyChargingPlan(1, {
      siteId: 'site-1',
      stationIds: ['station-a', 'station-b'],
      evseId: 1,
      strategy: 'equal_share_online',
      chargingProfilePurpose: 'ChargingStationMaxProfile',
      operationMode: 'ExternalLimits',
    });

    expect(sender.sendRequest).toHaveBeenCalledTimes(2);
    expect(response).toMatchObject({
      appliedCount: 2,
      results: [
        expect.objectContaining({ stationId: 'station-a', applied: true }),
        expect.objectContaining({
          stationId: 'station-b',
          applied: true,
          reason: 'Applied OCPP 2.0.1 Absolute-profile fallback',
        }),
      ],
    });
    expect(emsDecisionRepo.createDecision).toHaveBeenCalledTimes(2);
  });

  it('skips stations that are not compatible with EMS charging-profile fallback', async () => {
    const emsRepo = {
      readLatestActiveBySiteId: vi.fn().mockResolvedValue({
        messageId: 'intent-1',
        constraints: { evChargeBudgetW: 10000 },
      }),
      createSiteIntent: vi.fn(),
      readAllBySiteId: vi.fn(),
      readOnlyOneByQuery: vi.fn(),
      readAllByQuery: vi.fn(),
    } as any;
    const locationRepo = {
      getChargingStationsByIds: vi.fn().mockResolvedValue([
        { id: 'station-c', isOnline: true, protocol: 'ocpp1.6' },
      ]),
    } as any;
    const emsDecisionRepo = {
      createDecision: vi.fn().mockResolvedValue(undefined),
    } as any;
    const chargingProfileRepo = {
      getNextChargingProfileId: vi.fn(),
      getNextChargingScheduleId: vi.fn(),
      getNextStackLevel: vi.fn(),
      createOrUpdateChargingProfile: vi.fn(),
    } as any;
    const sender = {
      sendRequest: vi.fn().mockResolvedValue({ success: true, payload: 'queued' }),
      sendResponse: vi.fn(),
      send: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
    } as any as IMessageSender;
    const handler = {
      handle: vi.fn(),
      subscribe: vi.fn().mockResolvedValue(true),
      shutdown: vi.fn().mockResolvedValue(undefined),
      module: undefined,
    } as any as IMessageHandler;

    const module = new EmsModule(
      {
        env: 'development',
        logLevel: 2,
        maxCachingSeconds: 60,
        modules: {
          ems: { endpointPrefix: 'ems', requests: [], responses: [] },
        },
      } as any as SystemConfig,
      { get: vi.fn(), set: vi.fn() } as any,
      sender,
      handler,
      new Logger({ name: 'EmsModuleApplyPlanTest' }),
      undefined,
      emsRepo,
      emsDecisionRepo,
      locationRepo,
      chargingProfileRepo,
      { generateRequestId: vi.fn().mockResolvedValue(7001) } as any,
    );

    const response = await module.applyChargingPlan(1, {
      siteId: 'site-1',
      stationIds: ['station-c'],
      evseId: 1,
      strategy: 'equal_share_online',
      chargingProfilePurpose: 'ChargingStationMaxProfile',
      operationMode: 'ExternalLimits',
    });

    expect(sender.sendRequest).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      appliedCount: 0,
      results: [
        expect.objectContaining({
          stationId: 'station-c',
          applied: false,
          success: false,
          reason:
            'Station protocol ocpp1.6 is not compatible with EMS charging-profile fallback',
        }),
      ],
    });
    expect(emsDecisionRepo.createDecision).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        siteId: 'site-1',
        stationId: 'station-c',
        decisionType: 'apply_skipped',
      }),
    );
  });

  it('requests EMS charging-profile reconciliation after a successful SetChargingProfile response', async () => {
    const chargingProfileRepo = {
      updateAllByQuery: vi.fn().mockResolvedValue([]),
    } as any;
    const emsDecisionRepo = {
      createDecision: vi.fn().mockResolvedValue(undefined),
    } as any;
    const handler = {
      handle: vi.fn(),
      subscribe: vi.fn().mockResolvedValue(true),
      shutdown: vi.fn().mockResolvedValue(undefined),
      module: undefined,
    } as any as IMessageHandler;
    const sender = {
      sendRequest: vi.fn().mockResolvedValue({ success: true, payload: 'queued' }),
      sendResponse: vi.fn(),
      send: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
    } as any as IMessageSender;
    const cache = {
      get: vi.fn().mockResolvedValue(JSON.stringify({ protocol: 'ocpp2.1' })),
      set: vi.fn(),
    } as any as ICache;

    const module = new EmsModule(
      {
        env: 'development',
        logLevel: 2,
        maxCachingSeconds: 60,
        modules: {
          ems: { endpointPrefix: 'ems', requests: [], responses: [] },
        },
      } as any as SystemConfig,
      cache,
      sender,
      handler,
      new Logger({ name: 'EmsModuleApplyPlanTest' }),
      undefined,
      {} as any,
      emsDecisionRepo,
      {} as any,
      chargingProfileRepo,
      { generateRequestId: vi.fn().mockResolvedValue(7002) } as any,
    );

    await (module as any)._handleSetChargingProfile({
      context: {
        tenantId: 1,
        stationId: 'station-a',
      },
      payload: { status: 'Accepted' },
      protocol: OCPPVersion.OCPP2_1,
    });

    expect(chargingProfileRepo.updateAllByQuery).toHaveBeenCalledWith(
      1,
      { isActive: false },
      expect.objectContaining({
        where: expect.objectContaining({
          stationId: 'station-a',
          chargingLimitSource: ChargingLimitSourceEnum.EMS,
        }),
      }),
    );
    expect(sender.sendRequest).toHaveBeenCalledTimes(1);
  });

  it('detects drift when reported EMS profile state differs from the current plan', async () => {
    const emsRepo = {
      readLatestActiveBySiteId: vi.fn().mockResolvedValue({
        messageId: 'intent-1',
        constraints: { evChargeBudgetW: 9000 },
      }),
    } as any;
    const locationRepo = {
      getChargingStationsByIds: vi.fn().mockResolvedValue([
        { id: 'station-a', isOnline: true, protocol: 'ocpp2.1' },
      ]),
    } as any;
    const emsDecisionRepo = {
      createDecision: vi.fn().mockResolvedValue(undefined),
    } as any;
    const chargingProfileRepo = {
      readAllByQuery: vi.fn().mockResolvedValue([
        {
          id: 555,
          chargingSchedule: [
            {
              chargingSchedulePeriod: [{ limit: 5000, operationMode: 'ExternalLimits' }],
            },
          ],
        },
      ]),
    } as any;

    const module = new EmsModule(
      {
        env: 'development',
        logLevel: 2,
        maxCachingSeconds: 60,
        modules: {
          ems: { endpointPrefix: 'ems', requests: [], responses: [] },
        },
      } as any as SystemConfig,
      { get: vi.fn(), set: vi.fn() } as any,
      { sendRequest: vi.fn(), sendResponse: vi.fn(), send: vi.fn(), shutdown: vi.fn() } as any,
      { handle: vi.fn(), subscribe: vi.fn().mockResolvedValue(true), shutdown: vi.fn(), module: undefined } as any,
      new Logger({ name: 'EmsModuleApplyPlanTest' }),
      undefined,
      emsRepo,
      emsDecisionRepo,
      locationRepo,
      chargingProfileRepo,
      { generateRequestId: vi.fn().mockResolvedValue(1) } as any,
    );

    const response = await module.reconcileChargingPlan(1, {
      siteId: 'site-1',
      stationIds: ['station-a'],
      evseId: 1,
      strategy: 'equal_share_online',
      chargingProfilePurpose: 'ChargingStationMaxProfile',
      operationMode: 'ExternalLimits',
    });

    expect(response).toMatchObject({
      driftedCount: 1,
      results: [expect.objectContaining({ stationId: 'station-a', drifted: true, plannedLimitW: 9000, actualLimitW: 5000 })],
    });
    expect(emsDecisionRepo.createDecision).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        siteId: 'site-1',
        stationId: 'station-a',
        decisionType: 'reconcile_result',
      }),
    );
  });
});