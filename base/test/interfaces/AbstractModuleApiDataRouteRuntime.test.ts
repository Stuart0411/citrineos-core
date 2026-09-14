// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { AbstractModuleApi } from '../../src/interfaces/api/AbstractModuleApi.js';
import { AsDataEndpoint } from '../../src/interfaces/api/AsDataEndpoint.js';
import { HttpMethod } from '../../src/interfaces/api/HttpMethods.js';
import { Namespace } from '../../src/ocpp/persistence/namespace.js';
import type { IModule } from '../../src/interfaces/modules/Module.js';

const RuntimeBodySchema = {
  $id: 'RuntimeBodySchema',
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    siteId: { type: 'string' },
  },
  required: ['siteId'],
  additionalProperties: false,
};

class RuntimeDataApi extends AbstractModuleApi<IModule> {
  constructor(module: IModule, server: ReturnType<typeof Fastify>) {
    super(module, server, null);
  }

  @AsDataEndpoint(Namespace.EmsChargingPlan, HttpMethod.Post, undefined, RuntimeBodySchema)
  createChargingPlan(
    request: FastifyRequest<{
      Body: {
        siteId: string;
      };
    }>,
  ) {
    return {
      siteId: request.body.siteId,
      accepted: true,
    };
  }
}

const servers: ReturnType<typeof Fastify>[] = [];

const makeApi = async () => {
  const server = Fastify();
  servers.push(server);

  const module = {
    config: {
      util: {
        swagger: {
          exposeData: true,
        },
      },
    },
  } as unknown as IModule;

  new RuntimeDataApi(module, server);
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

describe('AbstractModuleApi data route runtime validation', () => {
  it('enforces request body validation for decorated routes when exposeData is enabled', async () => {
    const server = await makeApi();

    const invalid = await server.inject({
      method: 'POST',
      url: '/data/emsChargingPlan',
      payload: {},
    });

    expect(invalid.statusCode).toBe(400);
    expect(invalid.body).toContain('siteId');

    const valid = await server.inject({
      method: 'POST',
      url: '/data/emsChargingPlan',
      payload: {
        siteId: 'site-runtime-test',
      },
    });

    expect(valid.statusCode).toBe(200);
    expect(valid.json()).toEqual({
      siteId: 'site-runtime-test',
      accepted: true,
    });
  });
});
