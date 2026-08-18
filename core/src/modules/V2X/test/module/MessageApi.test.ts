// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { DEFAULT_TENANT_ID, OCPPVersion } from '@citrineos/base';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V2XOcpp2Api } from '../../src/module/2/MessageApi.js';

const packageGroupCallMock = vi.fn();

vi.mock('@util/index.js', () => ({
  packageGroupCall: (...args: unknown[]) => packageGroupCallMock(...args),
}));

vi.spyOn(Reflect, 'getMetadata').mockReturnValue([]);

describe('V2XOcpp2Api', () => {
  let api: V2XOcpp2Api;
  let moduleMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    packageGroupCallMock.mockResolvedValue([{ success: true, payload: 'ok' }]);

    moduleMock = {
      config: {
        modules: {
          v2x: {
            endpointPrefix: 'v2x',
          },
        },
      },
    };

    api = new V2XOcpp2Api(moduleMock, {} as any, OCPPVersion.OCPP2_1);
  });

  it('dispatches AFRRSignal to grouped stations', async () => {
    const request = {
      timestamp: '2026-08-18T18:45:00.000Z',
      signal: 12,
    } as any;

    const result = await api.afrrSignal(['cs-v2x-1'], request);

    expect(packageGroupCallMock).toHaveBeenCalledWith(
      moduleMock,
      ['cs-v2x-1'],
      DEFAULT_TENANT_ID,
      OCPPVersion.OCPP2_1,
      'AFRRSignal',
      request,
      undefined,
    );
    expect(result).toEqual([{ success: true, payload: 'ok' }]);
  });
});
