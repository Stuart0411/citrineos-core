// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StationEnergyTransferPolicy } from '../model/StationEnergyTransferPolicy.js';
import { SequelizeStationEnergyTransferPolicyRepository } from './StationEnergyTransferPolicy.js';

describe('V2X Sequelize repositories', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('upsertAllowedEnergyTransfer writes normalized station energy transfer policy state', async () => {
    const upsertSpy = vi
      .spyOn(StationEnergyTransferPolicy, 'upsert')
      .mockResolvedValue([{} as any, true]);
    const repository = new SequelizeStationEnergyTransferPolicyRepository(
      {} as any,
      undefined,
      {} as any,
    );

    await repository.upsertAllowedEnergyTransfer(5, 'cs-v2x-1', {
      transactionId: 'tx-1',
      allowedModesJson: ['AC_BPT_DER', 'AC_DER'],
      exportEnabled: true,
      dischargeLimitW: null,
    });

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 5,
        stationId: 'cs-v2x-1',
        transactionId: 'tx-1',
        allowedModesJson: ['AC_BPT_DER', 'AC_DER'],
        exportEnabled: true,
        dischargeLimitW: null,
      }),
    );
  });
});
