// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { BadRequestError, DEFAULT_TENANT_ID } from '@citrineos/base';
import { Op } from 'sequelize';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V2XDataApi } from '../../src/module/DataApi.js';

vi.spyOn(Reflect, 'getMetadata').mockReturnValue([]);

describe('V2XDataApi', () => {
  let stationEnergyTransferPolicyRepository: {
    readAllByQuery: ReturnType<typeof vi.fn>;
    upsertAllowedEnergyTransfer: ReturnType<typeof vi.fn>;
  };
  let summarizeStationCapabilities: ReturnType<typeof vi.fn>;
  let api: V2XDataApi;

  beforeEach(() => {
    vi.clearAllMocks();

    stationEnergyTransferPolicyRepository = {
      readAllByQuery: vi.fn().mockResolvedValue([]),
      upsertAllowedEnergyTransfer: vi.fn().mockResolvedValue(undefined),
    };
    summarizeStationCapabilities = vi.fn().mockReturnValue([{ stationId: 'cs-v2x-7' }]);

    const moduleMock = {
      config: {
        modules: {
          v2x: {
            endpointPrefix: 'v2x',
          },
        },
      },
      stationEnergyTransferPolicyRepository,
      summarizeStationCapabilities,
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

    expect(call.where.transactionId).toEqual('tx-7');
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
        where: expect.objectContaining({
          transactionId: expect.any(Object),
        }),
        limit: 1,
      }),
    );

    const defaultCall = stationEnergyTransferPolicyRepository.readAllByQuery.mock.calls[0][1];
    const defaultTransactionIdFilter = defaultCall.where.transactionId as Record<symbol, string>;
    expect(defaultTransactionIdFilter[Op.ne]).toEqual('__diag_afrrsignal__');

    await expect(
      api.getStationEnergyTransferPolicies({
        query: {
          tenantId: 1,
          fromUpdatedAt: 'bad-date',
        },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('includes diagnostic rows when includeDiagnostics is true', async () => {
    await api.getStationEnergyTransferPolicies({
      query: {
        tenantId: 7,
        includeDiagnostics: true,
      },
    } as any);

    const call = stationEnergyTransferPolicyRepository.readAllByQuery.mock.calls[0][1];
    expect(call.where.transactionId).toBeUndefined();
  });

  it('does not overwrite explicit transactionId filter when includeDiagnostics is false', async () => {
    await api.getStationEnergyTransferPolicies({
      query: {
        tenantId: 7,
        transactionId: 'tx-7',
      },
    } as any);

    const call = stationEnergyTransferPolicyRepository.readAllByQuery.mock.calls[0][1];
    expect(call.where.transactionId).toEqual('tx-7');
  });

  it('returns summarized station capability view when summary is true', async () => {
    stationEnergyTransferPolicyRepository.readAllByQuery.mockResolvedValue([
      {
        toJSON: () => ({
          stationId: 'cs-v2x-7',
          transactionId: '__diag_afrrsignal__',
        }),
      },
    ]);

    const result = await api.getStationEnergyTransferPolicies({
      query: {
        tenantId: 7,
        summary: true,
      },
    } as any);

    const call = stationEnergyTransferPolicyRepository.readAllByQuery.mock.calls[0][1];
    expect(call.where.transactionId).toBeUndefined();
    expect(summarizeStationCapabilities).toHaveBeenCalledWith([
      {
        stationId: 'cs-v2x-7',
        transactionId: '__diag_afrrsignal__',
      },
    ]);
    expect(result).toEqual([{ stationId: 'cs-v2x-7' }]);
  });

  it('preserves extended summary observability fields from module summarization', async () => {
    summarizeStationCapabilities.mockReturnValue([
      {
        stationId: 'cs-v2x-7',
        afrrSignalSendAccepted: true,
        lastAfrrSignalSendAcceptedAt: '2026-08-19T06:45:00.000Z',
      },
    ]);

    const result = await api.getStationEnergyTransferPolicies({
      query: {
        tenantId: 7,
        summary: true,
      },
    } as any);

    expect(result).toEqual([
      {
        stationId: 'cs-v2x-7',
        afrrSignalSendAccepted: true,
        lastAfrrSignalSendAcceptedAt: '2026-08-19T06:45:00.000Z',
      },
    ]);
  });

  it('upserts manual station energy transfer policy overrides', async () => {
    stationEnergyTransferPolicyRepository.readAllByQuery.mockResolvedValue([
      {
        stationId: 'cs-v2x-7',
        transactionId: '__manual_override__',
        allowedModesJson: ['AC_BPT_DER'],
        exportEnabled: true,
        dischargeLimitW: 3200,
      },
    ]);

    const result = await api.upsertStationEnergyTransferPolicyOverride({
      query: {
        tenantId: 7,
      },
      body: {
        stationId: 'cs-v2x-7',
        allowedModes: ['AC_BPT_DER'],
        exportEnabled: true,
        dischargeLimitW: 3200,
      },
    } as any);

    expect(stationEnergyTransferPolicyRepository.upsertAllowedEnergyTransfer).toHaveBeenCalledWith(
      7,
      'cs-v2x-7',
      {
        transactionId: '__manual_override__',
        allowedModesJson: ['AC_BPT_DER'],
        exportEnabled: true,
        dischargeLimitW: 3200,
      },
    );
    expect(stationEnergyTransferPolicyRepository.readAllByQuery).toHaveBeenCalledWith(7, {
      where: {
        stationId: 'cs-v2x-7',
        transactionId: '__manual_override__',
      },
      order: [['updatedAt', 'DESC']],
      limit: 1,
    });
    expect(result).toEqual({
      stationId: 'cs-v2x-7',
      transactionId: '__manual_override__',
      allowedModesJson: ['AC_BPT_DER'],
      exportEnabled: true,
      dischargeLimitW: 3200,
    });
  });
});
