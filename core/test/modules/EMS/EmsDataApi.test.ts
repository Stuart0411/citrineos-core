// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import type { ICache, IMessageHandler, IMessageSender, SystemConfig } from '@citrineos/base';
import { BadRequestError, HttpMethod, Namespace } from '@citrineos/base';
import { UniqueConstraintError } from 'sequelize';
import { Logger } from 'tslog';
import { EmsDataApi } from '../../../src/modules/EMS/src/module/DataApi.js';
import { EmsModule } from '../../../src/modules/EMS/src/module/module.js';
import { METADATA_DATA_ENDPOINTS } from '@interfaces/api/metadata.js';

describe('EmsDataApi', () => {
  const makeModule = () => {
    const repo = {
      createSiteIntent: vi.fn(),
      readLatestActiveBySiteId: vi.fn(),
      readAllBySiteId: vi.fn(),
      readOnlyOneByQuery: vi.fn(),
      readAllByQuery: vi.fn(),
    } as any;
    const locationRepository = {
      getChargingStationsByIds: vi.fn().mockResolvedValue([]),
    } as any;
    const emsDecisionRepository = {
      createDecision: vi.fn().mockResolvedValue(undefined),
      readAllByQuery: vi.fn().mockResolvedValue([]),
    } as any;
    const chargingProfileRepository = {
      getNextChargingProfileId: vi.fn().mockResolvedValue(100),
      getNextChargingScheduleId: vi.fn().mockResolvedValue(200),
      getNextStackLevel: vi.fn().mockResolvedValue(0),
      createOrUpdateChargingProfile: vi.fn().mockResolvedValue(undefined),
    } as any;
    const idGenerator = {
      generateRequestId: vi.fn().mockResolvedValue(9001),
    } as any;

    const config: SystemConfig = {
      util: { cache: { redis: { host: 'localhost', port: 6379 } } },
      logLevel: 2,
      modules: {
        ems: {
          endpointPrefix: 'ems',
          requests: [],
          responses: [],
        },
      },
    } as any;

    const module = new EmsModule(
      config,
      { set: vi.fn(), get: vi.fn() } as any as ICache,
      { send: vi.fn() } as any as IMessageSender,
      { handle: vi.fn() } as any as IMessageHandler,
      new Logger({ name: 'EmsDataApiTest' }),
      undefined,
      repo,
      emsDecisionRepository,
      locationRepository,
      chargingProfileRepository,
      idGenerator,
    );

    vi.spyOn(module, 'startMqttBridge').mockResolvedValue(undefined);
    vi.spyOn(module, 'stopMqttBridge').mockResolvedValue(undefined);
    vi.spyOn(module, 'deriveChargingPlan').mockResolvedValue({
      siteId: 'site-1',
      sourceIntentMessageId: 'intent-1',
      totalBudgetW: 10000,
      eligibleStationCount: 1,
      strategy: 'equal_share_online',
      recommendations: [],
    } as any);
    vi.spyOn(module, 'applyChargingPlan').mockResolvedValue({
      siteId: 'site-1',
      sourceIntentMessageId: 'intent-1',
      appliedCount: 1,
      results: [
        {
          stationId: 'station-a',
          applied: true,
          success: true,
          profileId: 100,
          scheduleId: 200,
        },
      ],
    } as any);
    vi.spyOn(module, 'reconcileChargingPlan').mockResolvedValue({
      siteId: 'site-1',
      sourceIntentMessageId: 'intent-1',
      comparedCount: 1,
      driftedCount: 0,
      results: [
        {
          stationId: 'station-a',
          eligible: true,
          hasActiveProfile: true,
          drifted: false,
          plannedLimitW: 10000,
          actualLimitW: 10000,
          plannedOperationMode: 'ExternalLimits',
          actualOperationMode: 'ExternalLimits',
        },
      ],
    } as any);
    vi.spyOn(module, 'getMqttBridgeStatus').mockReturnValue({
      enabled: true,
      started: false,
      startupMode: 'non_fatal',
      siteIntentsTopic: 'citrine/ems/site/+/intent/current',
    });

    return { module, repo };
  };

  it('rejects mismatched tenant ids between query and body', async () => {
    const { module } = makeModule();
    const api = Object.create(EmsDataApi.prototype) as EmsDataApi;
    (api as any)._module = module;

    await expect(
      api.createSiteIntent({
        query: { tenantId: 1 },
        body: {
          tenantId: 2,
          messageId: '7f3f8b10-0c30-4f9d-bf81-79269ae7b8ea',
          siteId: 'site-1',
          source: { system: 'ha', component: 'ode', instance: 'main' },
          createdAt: '2026-08-17T10:00:00.000Z',
          expiresAt: '2026-08-17T10:00:30.000Z',
          mode: 'ExternalLimits',
          constraints: {},
          flags: { allowDischarge: false, emergencyCurtailment: false },
          reason: 'test',
        },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects stale EMS site intents', async () => {
    const { module } = makeModule();
    const api = Object.create(EmsDataApi.prototype) as EmsDataApi;
    (api as any)._module = module;

    await expect(
      api.createSiteIntent({
        query: { tenantId: 1 },
        body: {
          tenantId: 1,
          messageId: '7f3f8b10-0c30-4f9d-bf81-79269ae7b8ea',
          siteId: 'site-1',
          source: { system: 'ha', component: 'ode', instance: 'main' },
          createdAt: '2025-01-01T00:00:00.000Z',
          expiresAt: '2026-08-17T10:00:30.000Z',
          mode: 'ExternalLimits',
          constraints: { maxImportW: 5000 },
          flags: { allowDischarge: false, emergencyCurtailment: false },
          reason: 'stale-test',
        },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects duplicate EMS site intent message ids', async () => {
    const { module, repo } = makeModule();
    repo.createSiteIntent.mockRejectedValue(
      new UniqueConstraintError({ message: 'duplicate', errors: [] }),
    );
    const api = Object.create(EmsDataApi.prototype) as EmsDataApi;
    (api as any)._module = module;

    await expect(
      api.createSiteIntent({
        query: { tenantId: 1 },
        body: {
          tenantId: 1,
          messageId: '7f3f8b10-0c30-4f9d-bf81-79269ae7b8ea',
          siteId: 'site-1',
          source: { system: 'ha', component: 'ode', instance: 'main' },
          createdAt: '2026-08-17T10:00:00.000Z',
          expiresAt: '2099-08-17T10:00:30.000Z',
          mode: 'ExternalLimits',
          constraints: { maxImportW: 5000 },
          flags: { allowDischarge: false, emergencyCurtailment: false },
          reason: 'duplicate-test',
        },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('returns a singleton array for current site intent requests', async () => {
    const { module, repo } = makeModule();
    repo.readLatestActiveBySiteId.mockResolvedValue({ messageId: 'current-intent' });
    const api = Object.create(EmsDataApi.prototype) as EmsDataApi;
    (api as any)._module = module;

    const result = await api.getSiteIntents({
      query: { tenantId: 1, siteId: 'site-1', currentOnly: true },
    } as any);

    expect(repo.readLatestActiveBySiteId).toHaveBeenCalledWith(1, 'site-1');
    expect(result).toEqual([{ messageId: 'current-intent' }]);
  });

  it('returns MQTT bridge status and supports start/stop controls', async () => {
    const { module } = makeModule();
    const api = Object.create(EmsDataApi.prototype) as EmsDataApi;
    (api as any)._module = module;

    expect(api.getMqttBridgeStatus()).toEqual({
      enabled: true,
      started: false,
      startupMode: 'non_fatal',
      siteIntentsTopic: 'citrine/ems/site/+/intent/current',
    });

    await expect(api.startMqttBridge()).resolves.toEqual({
      enabled: true,
      started: false,
      startupMode: 'non_fatal',
      siteIntentsTopic: 'citrine/ems/site/+/intent/current',
    });
    await expect(api.stopMqttBridge()).resolves.toEqual({
      enabled: true,
      started: false,
      startupMode: 'non_fatal',
      siteIntentsTopic: 'citrine/ems/site/+/intent/current',
    });
  });

  it('derives a charging plan from the current EMS site intent', async () => {
    const { module } = makeModule();
    const api = Object.create(EmsDataApi.prototype) as EmsDataApi;
    (api as any)._module = module;

    await expect(
      api.deriveChargingPlan({
        query: { tenantId: 1 },
        body: {
          siteId: 'site-1',
          stationIds: ['station-a'],
          evseId: 1,
          strategy: 'equal_share_online',
          chargingProfilePurpose: 'ChargingStationMaxProfile',
          operationMode: 'ExternalLimits',
        },
      } as any),
    ).resolves.toMatchObject({
      siteId: 'site-1',
      sourceIntentMessageId: 'intent-1',
    });
  });

  it('applies a charging plan through the EMS module', async () => {
    const { module } = makeModule();
    const api = Object.create(EmsDataApi.prototype) as EmsDataApi;
    (api as any)._module = module;

    await expect(
      api.applyChargingPlan({
        query: { tenantId: 1 },
        body: {
          siteId: 'site-1',
          stationIds: ['station-a'],
          evseId: 1,
          strategy: 'equal_share_online',
          chargingProfilePurpose: 'ChargingStationMaxProfile',
          operationMode: 'ExternalLimits',
        },
      } as any),
    ).resolves.toMatchObject({
      siteId: 'site-1',
      appliedCount: 1,
    });
  });

  it('reconciles a charging plan against current EMS charger state', async () => {
    const { module } = makeModule();
    const api = Object.create(EmsDataApi.prototype) as EmsDataApi;
    (api as any)._module = module;

    await expect(
      api.reconcileChargingPlan({
        query: { tenantId: 1 },
        body: {
          siteId: 'site-1',
          stationIds: ['station-a'],
          evseId: 1,
          strategy: 'equal_share_online',
          chargingProfilePurpose: 'ChargingStationMaxProfile',
          operationMode: 'ExternalLimits',
        },
      } as any),
    ).resolves.toMatchObject({
      siteId: 'site-1',
      driftedCount: 0,
    });
  });

  it('returns EMS decision records with filters and bounded limit', async () => {
    const { module } = makeModule();
    const api = Object.create(EmsDataApi.prototype) as EmsDataApi;
    (api as any)._module = module;

    await api.getDecisions({
      query: {
        tenantId: 1,
        siteId: 'site-1',
        stationId: 'station-a',
        decisionType: 'apply_result',
        intentMessageId: 'intent-1',
        limit: 999,
      },
    } as any);

    expect((module as any).emsDecisionRepository.readAllByQuery).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          siteId: 'site-1',
          stationId: 'station-a',
          decisionType: 'apply_result',
          intentMessageId: 'intent-1',
        }),
        order: [['createdAt', 'DESC']],
        limit: 500,
      }),
    );
  });

  it('rejects invalid decision query datetime ranges', async () => {
    const { module } = makeModule();
    const api = Object.create(EmsDataApi.prototype) as EmsDataApi;
    (api as any)._module = module;

    await expect(
      api.getDecisions({
        query: {
          tenantId: 1,
          fromCreatedAt: '2026-08-17T10:01:00.000Z',
          toCreatedAt: '2026-08-17T10:00:00.000Z',
        },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('returns intake telemetry summary aggregated by reason code', async () => {
    const { module } = makeModule();
    module.emsDecisionRepository.readAllByQuery = vi.fn().mockResolvedValue([
      {
        createdAt: '2026-08-17T10:00:10.000Z',
        decisionJson: { status: 'accepted', reasonCode: 'stored' },
      },
      {
        createdAt: '2026-08-17T10:00:09.000Z',
        decisionJson: { status: 'rejected', reasonCode: 'duplicate_message_id' },
      },
      {
        createdAt: '2026-08-17T10:00:08.000Z',
        decisionJson: { status: 'rejected', reasonCode: 'invalid_payload' },
      },
      {
        createdAt: '2026-08-17T10:00:07.000Z',
        decisionJson: { status: 'rejected', reasonCode: 'invalid_payload' },
      },
    ]);

    const api = Object.create(EmsDataApi.prototype) as EmsDataApi;
    (api as any)._module = module;

    const result = await api.getIntakeTelemetrySummary({
      query: { tenantId: 1, siteId: 'site-1', limit: 100 },
    } as any);

    expect(result).toMatchObject({
      tenantId: 1,
      siteId: 'site-1',
      total: 4,
      accepted: 1,
      rejected: 3,
      byReasonCode: {
        stored: 1,
        duplicate_message_id: 1,
        invalid_payload: 2,
      },
      latestCreatedAt: '2026-08-17T10:00:10.000Z',
    });
  });

  it('rejects invalid intake telemetry datetime ranges', async () => {
    const { module } = makeModule();
    const api = Object.create(EmsDataApi.prototype) as EmsDataApi;
    (api as any)._module = module;

    await expect(
      api.getIntakeTelemetrySummary({
        query: {
          tenantId: 1,
          fromCreatedAt: '2026-08-18T00:00:00.000Z',
          toCreatedAt: '2026-08-17T00:00:00.000Z',
        },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('normalizes data route path when ems endpointPrefix is slash-padded', () => {
    const { module } = makeModule();
    module.config.modules.ems.endpointPrefix = '/ems/';

    const api = Object.create(EmsDataApi.prototype) as EmsDataApi;
    (api as any)._module = module;

    const route = (api as any)._toDataPath(Namespace.EmsSiteIntent);
    expect(route).toBe('/data/ems/emsSiteIntent');
  });

  it('uses base data route path when ems endpointPrefix is empty', () => {
    const { module } = makeModule();
    module.config.modules.ems.endpointPrefix = '';

    const api = Object.create(EmsDataApi.prototype) as EmsDataApi;
    (api as any)._module = module;

    const route = (api as any)._toDataPath(Namespace.EmsSiteIntent);
    expect(route).toBe('/data/emsSiteIntent');
  });

  it('exposes EMS POST/PUT/PATCH routes with body schemas in decorator metadata', () => {
    const endpoints = Reflect.getMetadata(METADATA_DATA_ENDPOINTS, EmsDataApi) as Array<any>;

    const siteIntentPost = endpoints.find(
      (endpoint) =>
        endpoint.namespace === Namespace.EmsSiteIntent && endpoint.httpMethod === HttpMethod.Post,
    );
    expect(siteIntentPost?.bodySchema).toBeDefined();
    expect(siteIntentPost.bodySchema.$id).toBe('EmsSiteIntentCreateBodySchema');

    const chargingPlanMethods = [HttpMethod.Post, HttpMethod.Put, HttpMethod.Patch];
    for (const method of chargingPlanMethods) {
      const chargingPlanEndpoint = endpoints.find(
        (endpoint) =>
          endpoint.namespace === Namespace.EmsChargingPlan && endpoint.httpMethod === method,
      );
      expect(chargingPlanEndpoint?.bodySchema).toBeDefined();
      expect(chargingPlanEndpoint.bodySchema.$id).toBe('EmsChargingPlanRequestBodySchema');
    }
  });
});