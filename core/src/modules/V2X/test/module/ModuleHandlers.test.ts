// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { Logger } from 'tslog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V2XModule } from '../../src/module/module.js';

describe('V2XModule handlers', () => {
  let stationEnergyTransferPolicyRepository: {
    upsertAllowedEnergyTransfer: ReturnType<typeof vi.fn>;
  };
  let module: V2XModule;

  beforeEach(() => {
    vi.clearAllMocks();

    stationEnergyTransferPolicyRepository = {
      upsertAllowedEnergyTransfer: vi.fn().mockResolvedValue(undefined),
    };

    module = new V2XModule(
      {
        env: 'test',
        logLevel: 3,
        maxCachingSeconds: 60,
        modules: {
          v2x: {
            requests: [],
            responses: [],
          },
        },
      } as any,
      {
        get: vi.fn(),
        set: vi.fn(),
      } as any,
      {
        sendRequest: vi.fn(),
        sendResponse: vi.fn(),
        shutdown: vi.fn(),
      } as any,
      {
        module: null,
        subscribe: vi.fn().mockResolvedValue(true),
        shutdown: vi.fn(),
      } as any,
      new Logger({ name: 'V2XModuleTest', minLevel: 7 }),
      undefined,
      stationEnergyTransferPolicyRepository as any,
    );
  });

  it('persists NotifyAllowedEnergyTransfer policy state and acknowledges request', async () => {
    const ackSpy = vi.spyOn(module, 'sendCallResultWithMessage').mockResolvedValue({
      success: true,
      payload: 'ok',
    } as any);

    await (module as any)._handleNotifyAllowedEnergyTransferRequest({
      context: {
        tenantId: 4,
        stationId: 'cs-v2x-4',
      },
      payload: {
        transactionId: 'tx-v2x-4',
        allowedEnergyTransfer: ['AC_BPT_DER', 'AC_DER'],
      },
    } as any);

    expect(stationEnergyTransferPolicyRepository.upsertAllowedEnergyTransfer).toHaveBeenCalledWith(
      4,
      'cs-v2x-4',
      {
        transactionId: 'tx-v2x-4',
        allowedModesJson: ['AC_BPT_DER', 'AC_DER'],
        exportEnabled: true,
        dischargeLimitW: null,
      },
    );
    expect(ackSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'Accepted' }),
    );
  });
});
