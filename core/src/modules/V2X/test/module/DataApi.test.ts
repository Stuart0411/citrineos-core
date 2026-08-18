// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { BadRequestError, DEFAULT_TENANT_ID } from '@citrineos/base';
import { Op } from 'sequelize';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V2XDataApi } from '../../src/module/DataApi.js';

vi.spyOn(Reflect, 'getMetadata').mockReturnValue([]);

describe('V2XDataApi', () => {
  let stationEnergyTransferPolicyRepository: { readAllByQuery: ReturnType<typeof vi.fn> };
  let api: V2XDataApi;

  beforeEach(() => {
    vi.clearAllMocks();

    stationEnergyTransferPolicyRepository = {
      readAllByQuery: vi.fn().mockResolvedValue([]),
    };

    const moduleMock = {
      config: {
        modules: {
          v2x: {
            endpointPrefix: 'v2x',
          },
        },
      },
      stationEnergyTransferPolicyRepository,
    } as any;

    api = new V2XDataApi(moduleMock, {} as any);
  });

  it('maps station energy transfer policy filters into repository query with bounded limit', async () => {
    await api.getStationEnergyTransferPolicies({
      query: {
        tenantId: 7,
        stationId: 'cs-v2x-7',
        transactionId: 'tx-7',
        exportEnabled: true,
        allowedMode: 'AC_BPT_DER',
        fromUpdatedAt: '2026-08-18T18:00:00.000Z',
        toUpdatedAt: '2026-08-18T19:00:00.000Z',
        limit: 5000,
      },
    } as any);

    expect(stationEnergyTransferPolicyRepository.readAllByQuery).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        where: expect.objectContaining({
          stationId: 'cs-v2x-7',
          transactionId: 'tx-7',
          exportEnabled: true,
          allowedModesJson: expect.any(Object),
        }),
        order: [['updatedAt', 'DESC']],
        limit: 1000,
      }),
    );

    const call = stationEnergyTransferPolicyRepository.readAllByQuery.mock.calls[0][1];
    const allowedModeFilter = call.where.allowedModesJson as Record<symbol, string[]>;
    expect(allowedModeFilter[Op.contains]).toEqual(['AC_BPT_DER']);
  });

  it('uses default tenant and validates policy date windows', async () => {
    await api.getStationEnergyTransferPolicies({
      query: {
        limit: 0,
      },
    } as any);

    expect(stationEnergyTransferPolicyRepository.readAllByQuery).toHaveBeenCalledWith(
      DEFAULT_TENANT_ID,
      expect.objectContaining({
        where: {},
        limit: 1,
      }),
    );

    await expect(
      api.getStationEnergyTransferPolicies({
        query: {
          tenantId: 1,
          fromUpdatedAt: 'bad-date',
        },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});
