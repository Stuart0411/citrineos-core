// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { AbstractModuleApi } from '../../src/interfaces/api/AbstractModuleApi.js';
import { Namespace } from '../../src/ocpp/persistence/namespace.js';
import { OCPP_CallAction } from '../../src/ocpp/rpc/message.js';
import type { IModule } from '../../src/interfaces/modules/Module.js';

class PathProbeApi extends AbstractModuleApi<IModule> {
  toDataPathProbe(input: Namespace, prefix?: string): string {
    return this._toDataPath(input, prefix);
  }

  toMessagePathProbe(input: OCPP_CallAction, prefix?: string): string {
    return this._toMessagePath(input, prefix);
  }
}

const servers: ReturnType<typeof Fastify>[] = [];

const createApi = () => {
  const server = Fastify();
  servers.push(server);

  const module = {
    config: {
      util: {
        swagger: {
          exposeData: false,
        },
      },
    },
  } as unknown as IModule;

  return new PathProbeApi(module, server, null);
};

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) {
      await server.close();
    }
  }
});

describe('AbstractModuleApi path normalization', () => {
  it('normalizes data paths for empty and slash-padded prefixes', () => {
    const api = createApi();

    expect(api.toDataPathProbe(Namespace.EmsChargingPlan)).toBe('/data/emsChargingPlan');
    expect(api.toDataPathProbe(Namespace.EmsChargingPlan, 'ems')).toBe('/data/ems/emsChargingPlan');
    expect(api.toDataPathProbe(Namespace.EmsChargingPlan, '/ems/')).toBe(
      '/data/ems/emsChargingPlan',
    );
  });

  it('normalizes message paths for empty and slash-padded prefixes', () => {
    const api = createApi();

    expect(api.toMessagePathProbe(OCPP_CallAction.BootNotification)).toBe(
      '/ocpp/2.0.1/bootNotification',
    );
    expect(api.toMessagePathProbe(OCPP_CallAction.BootNotification, 'router')).toBe(
      '/ocpp/2.0.1/router/bootNotification',
    );
    expect(api.toMessagePathProbe(OCPP_CallAction.BootNotification, '/router/')).toBe(
      '/ocpp/2.0.1/router/bootNotification',
    );
  });
});
