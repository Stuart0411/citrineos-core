// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { AbstractModuleApi } from '../../src/interfaces/api/AbstractModuleApi.js';
import type { IModule } from '../../src/interfaces/modules/Module.js';

class TestModuleApi extends AbstractModuleApi<IModule> {
  registerSchemaForTest(schema: any, schemaIdPrefix?: string): object | null {
    return this.registerSchema(this._server, schema, schemaIdPrefix);
  }
}

const fakeModule = {
  config: {
    util: {
      swagger: {
        exposeData: false,
      },
    },
  },
} as unknown as IModule;

const servers: FastifyInstance[] = [];

const createApi = (): TestModuleApi => {
  const server = Fastify();
  servers.push(server);
  return new TestModuleApi(fakeModule, server, null);
};

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) {
      await server.close();
    }
  }
});

describe('AbstractModuleApi.registerSchema', () => {
  it('registers schemas that include draft-2020-12 metadata by stripping unsupported $schema', () => {
    const api = createApi();

    const schema = {
      $id: 'EmsIntentBody',
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        siteId: { type: 'string' },
      },
      required: ['siteId'],
      additionalProperties: false,
    };

    const result = api.registerSchemaForTest(schema);

    expect(result).toEqual({ $ref: 'EmsIntentBody' });

    const registered = (api as any)._server.getSchema('EmsIntentBody') as Record<string, unknown>;
    expect(registered).toBeDefined();
    expect(registered.$schema).toBeUndefined();
    expect((registered.properties as Record<string, unknown>).siteId).toEqual({ type: 'string' });
  });

  it('rewrites definition refs with schema id prefix during registration', () => {
    const api = createApi();

    const schema = {
      $id: 'WrappedSchema',
      type: 'object',
      properties: {
        payload: {
          $ref: '#/definitions/InnerPayload',
        },
      },
      definitions: {
        InnerPayload: {
          type: 'object',
          properties: {
            value: { type: 'number' },
          },
        },
      },
    };

    const result = api.registerSchemaForTest(schema, 'ocpp2.1-');

    expect(result).toEqual({ $ref: 'ocpp2.1-WrappedSchema' });

    const wrapped = (api as any)._server.getSchema('ocpp2.1-WrappedSchema') as Record<string, any>;
    expect(wrapped).toBeDefined();
    expect(wrapped.properties.payload.$ref).toBe('ocpp2.1-InnerPayload');

    const inner = (api as any)._server.getSchema('ocpp2.1-InnerPayload') as Record<string, any>;
    expect(inner).toBeDefined();
    expect(inner.type).toBe('object');
  });
});
