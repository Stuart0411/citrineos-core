// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ICache, IMessageHandler, IMessageSender, SystemConfig } from '@citrineos/base';
import { Logger } from 'tslog';
import { EmsDataApi } from '../../../src/modules/EMS/src/module/DataApi.js';
import { EmsModule } from '../../../src/modules/EMS/src/module/module.js';

const servers: FastifyInstance[] = [];

const createServerWithEmsApi = async (endpointPrefix: string | undefined): Promise<FastifyInstance> => {
  const server = Fastify();
  servers.push(server);

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
    util: {
      cache: { redis: { host: 'localhost', port: 6379 } },
      swagger: { exposeData: true },
    },
    logLevel: 2,
    modules: {
      ems: {
        endpointPrefix,
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
    new Logger({ name: 'EmsRouteRegistrationTest' }),
    undefined,
    repo,
    emsDecisionRepository,
    locationRepository,
    chargingProfileRepository,
    idGenerator,
  );

  new EmsDataApi(module, server, new Logger({ name: 'EmsRouteRegistrationApi' }));
  await server.ready();
  return server;
};

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) {
      await server.close();
    }
  }
});

describe('EmsDataApi route registration', () => {
  it('registers EMS POST/PUT/PATCH routes for endpointPrefix variants', async () => {
    const variants = [
      { endpointPrefix: undefined, pathPrefix: '/data' },
      { endpointPrefix: 'ems', pathPrefix: '/data/ems' },
      { endpointPrefix: '/ems/', pathPrefix: '/data/ems' },
    ];

    for (const variant of variants) {
      const server = await createServerWithEmsApi(variant.endpointPrefix);

      const siteIntent = await server.inject({
        method: 'POST',
        url: `${variant.pathPrefix}/emsSiteIntent?tenantId=1`,
        payload: {},
      });
      expect(siteIntent.statusCode).toBe(400);

      for (const method of ['POST', 'PUT', 'PATCH'] as const) {
        const chargingPlan = await server.inject({
          method,
          url: `${variant.pathPrefix}/emsChargingPlan?tenantId=1`,
          payload: {},
        });
        expect(chargingPlan.statusCode).toBe(400);
      }

      if (!variant.endpointPrefix) {
        const malformedDoubleSlash = await server.inject({
          method: 'POST',
          url: '/data//emsSiteIntent?tenantId=1',
          payload: {},
        });
        expect(malformedDoubleSlash.statusCode).toBe(404);
      }
    }
  });
});
