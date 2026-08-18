// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { BadRequestError, DEFAULT_TENANT_ID, OCPPVersion } from '@citrineos/base';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DerControlOcpp2Api } from '../../src/module/2/MessageApi.js';

const packageGroupCallMock = vi.fn();

vi.mock('@util/index.js', () => ({
  packageGroupCall: (...args: unknown[]) => packageGroupCallMock(...args),
}));

vi.spyOn(Reflect, 'getMetadata').mockReturnValue([]);

describe('DerControlOcpp2Api', () => {
  let api: DerControlOcpp2Api;
  let moduleMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    packageGroupCallMock.mockResolvedValue([{ success: true, payload: 'ok' }]);

    moduleMock = {
      config: {
        modules: {
          dercontrol: {
            endpointPrefix: 'dercontrol',
          },
        },
      },
      validateSetDERControlRequest: vi.fn(),
      validateClearDERControlRequest: vi.fn(),
    };

    api = new DerControlOcpp2Api(moduleMock, {} as any, OCPPVersion.OCPP2_1);
  });

  it('validates and dispatches SetDERControl when policy allows the request', async () => {
    const request = {
      controlId: 'ctrl-1',
      controlType: 'Gradients',
      isDefault: true,
      gradient: {
        gradient: 15,
      },
    } as any;

    const result = await api.setDERControl(['cs-1'], request, undefined, 9);

    expect(moduleMock.validateSetDERControlRequest).toHaveBeenCalledWith(request);
    expect(packageGroupCallMock).toHaveBeenCalledWith(
      moduleMock,
      ['cs-1'],
      9,
      OCPPVersion.OCPP2_1,
      'SetDERControl',
      request,
      undefined,
    );
    expect(result).toEqual([{ success: true, payload: 'ok' }]);
  });

  it('blocks SetDERControl when module validation rejects control type', async () => {
    moduleMock.validateSetDERControlRequest.mockImplementation(() => {
      throw new BadRequestError('Unsupported DER control type(s) requested: FreqWatt');
    });

    expect(() =>
      api.setDERControl(['cs-1'], {
        controlId: 'ctrl-1',
        controlType: 'FreqWatt',
        isDefault: true,
        curve: {
          priority: 0,
          yUnit: 'PctMaxW',
          curveData: [{ x: 0, y: 0 }],
        },
      } as any),
    ).toThrow(BadRequestError);

    expect(packageGroupCallMock).not.toHaveBeenCalled();
  });

  it('validates and dispatches ClearDERControl with selector', async () => {
    const request = {
      isDefault: true,
      controlType: 'Curve',
    } as any;

    await api.clearDERControl(['cs-7'], request);

    expect(moduleMock.validateClearDERControlRequest).toHaveBeenCalledWith(request);
    expect(packageGroupCallMock).toHaveBeenCalledWith(
      moduleMock,
      ['cs-7'],
      DEFAULT_TENANT_ID,
      OCPPVersion.OCPP2_1,
      'ClearDERControl',
      request,
      undefined,
    );
  });

  it('blocks ClearDERControl when no control selector is provided', async () => {
    moduleMock.validateClearDERControlRequest.mockImplementation(() => {
      throw new BadRequestError('ClearDERControl requires controlId or controlType');
    });

    expect(() =>
      api.clearDERControl(['cs-7'], {
        isDefault: false,
      } as any),
    ).toThrow(BadRequestError);

    expect(packageGroupCallMock).not.toHaveBeenCalled();
  });
});
