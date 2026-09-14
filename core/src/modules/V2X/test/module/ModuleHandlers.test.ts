// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { Logger } from 'tslog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V2XModule } from '../../src/module/module.js';

describe('V2XModule handlers', () => {
  let stationEnergyTransferPolicyRepository: {
    upsertAllowedEnergyTransfer: ReturnType<typeof vi.fn>;
    readOnlyOneByQuery: ReturnType<typeof vi.fn>;
  };
  let module: V2XModule;

  beforeEach(() => {
    vi.clearAllMocks();

    stationEnergyTransferPolicyRepository = {
      upsertAllowedEnergyTransfer: vi.fn().mockResolvedValue(undefined),
      readOnlyOneByQuery: vi.fn().mockResolvedValue(undefined),
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

  it('persists AFRRSignal call errors as diagnostic policy state', async () => {
    stationEnergyTransferPolicyRepository.readOnlyOneByQuery.mockResolvedValue({
      dischargeLimitW: 2,
    });

    await (module as any)._handleAfrrSignalResponse({
      context: {
        tenantId: 4,
        stationId: 'cs-v2x-4',
        correlationId: 'corr-afrr-1',
      },
      payload: {
        _errorCode: 'InternalError',
        message: 'Request Timeout',
        _errorDetails: {},
      },
    } as any);

    expect(stationEnergyTransferPolicyRepository.readOnlyOneByQuery).toHaveBeenCalledWith(4, {
      where: {
        stationId: 'cs-v2x-4',
        transactionId: '__diag_afrrsignal__',
      },
      order: [['updatedAt', 'DESC']],
      limit: 1,
    });

    expect(stationEnergyTransferPolicyRepository.upsertAllowedEnergyTransfer).toHaveBeenCalledWith(
      4,
      'cs-v2x-4',
      expect.objectContaining({
        transactionId: '__diag_afrrsignal__',
        exportEnabled: false,
        dischargeLimitW: 3,
      }),
    );

    const upsertPayload =
      stationEnergyTransferPolicyRepository.upsertAllowedEnergyTransfer.mock.calls[0][2];
    expect(upsertPayload.allowedModesJson).toContain('__diag__');
    expect(upsertPayload.allowedModesJson).toContain('afrr_signal_call_error');
    expect(upsertPayload.allowedModesJson).toContain('error_code:InternalError');
    expect(upsertPayload.allowedModesJson).toContain('error_message:Request Timeout');
    expect(upsertPayload.allowedModesJson).toContain('correlation_id:corr-afrr-1');
  });

  it('persists AFRRSignal dispatch success as diagnostic policy state', async () => {
    stationEnergyTransferPolicyRepository.readOnlyOneByQuery.mockResolvedValue({
      dischargeLimitW: 4,
    });

    await (module as any)._handleAfrrSignalResponse({
      context: {
        tenantId: 4,
        stationId: 'cs-v2x-4',
        correlationId: 'corr-afrr-ok',
      },
      payload: {},
    } as any);

    expect(stationEnergyTransferPolicyRepository.readOnlyOneByQuery).toHaveBeenCalledWith(4, {
      where: {
        stationId: 'cs-v2x-4',
        transactionId: '__diag_afrrsignal__',
      },
      order: [['updatedAt', 'DESC']],
      limit: 1,
    });

    expect(stationEnergyTransferPolicyRepository.upsertAllowedEnergyTransfer).toHaveBeenCalledWith(
      4,
      'cs-v2x-4',
      expect.objectContaining({
        transactionId: '__diag_afrrsignal__',
        exportEnabled: false,
        dischargeLimitW: 4,
      }),
    );

    const upsertPayload =
      stationEnergyTransferPolicyRepository.upsertAllowedEnergyTransfer.mock.calls[0][2];
    expect(upsertPayload.allowedModesJson).toContain('__diag__');
    expect(upsertPayload.allowedModesJson).toContain('afrr_signal_dispatch_ok');
    expect(upsertPayload.allowedModesJson).toContain('correlation_id:corr-afrr-ok');
  });

  it('records AFRR send-accepted telemetry while preserving prior timeout/error context', async () => {
    stationEnergyTransferPolicyRepository.readOnlyOneByQuery.mockResolvedValue({
      dischargeLimitW: 5,
      allowedModesJson: [
        '__diag__',
        'afrr_signal_call_error',
        'error_code:InternalError',
        'error_message:Request Timeout',
      ],
    });

    await module.recordAfrrSignalSendAccepted(4, 'cs-v2x-4');

    expect(stationEnergyTransferPolicyRepository.upsertAllowedEnergyTransfer).toHaveBeenCalledWith(
      4,
      'cs-v2x-4',
      {
        transactionId: '__diag_afrrsignal__',
        allowedModesJson: [
          '__diag__',
          'afrr_signal_send_accepted',
          'afrr_signal_call_error',
          'error_code:InternalError',
          'error_message:Request Timeout',
        ],
        exportEnabled: false,
        dischargeLimitW: 5,
      },
    );
  });

  it('records AFRR send-accepted telemetry with default timeout when no prior row exists', async () => {
    stationEnergyTransferPolicyRepository.readOnlyOneByQuery.mockResolvedValue(undefined);

    await module.recordAfrrSignalSendAccepted(4, 'cs-v2x-4');

    expect(stationEnergyTransferPolicyRepository.upsertAllowedEnergyTransfer).toHaveBeenCalledWith(
      4,
      'cs-v2x-4',
      {
        transactionId: '__diag_afrrsignal__',
        allowedModesJson: ['__diag__', 'afrr_signal_send_accepted'],
        exportEnabled: false,
        dischargeLimitW: 0,
      },
    );
  });

  it('summarizes station capability including AFRR diagnostic status', () => {
    const summary = module.summarizeStationCapabilities([
      {
        stationId: 'cs-v2x-4',
        transactionId: 'tx-v2x-4',
        allowedModesJson: ['AC_BPT_DER', 'AC_DER'],
        exportEnabled: true,
        dischargeLimitW: null,
        updatedAt: '2026-08-19T01:00:00.000Z',
      },
      {
        stationId: 'cs-v2x-4',
        transactionId: '__diag_afrrsignal__',
        allowedModesJson: [
          '__diag__',
          'afrr_signal_call_error',
          'error_code:InternalError',
          'error_message:Request Timeout',
          'correlation_id:corr-afrr-1',
        ],
        exportEnabled: false,
        dischargeLimitW: 4,
        updatedAt: '2026-08-19T01:05:00.000Z',
      },
    ]);

    expect(summary).toEqual([
      {
        stationId: 'cs-v2x-4',
        lastUpdatedAt: '2026-08-19T01:05:00.000Z',
        activeTransactionId: 'tx-v2x-4',
        allowedEnergyTransfer: ['AC_BPT_DER', 'AC_DER'],
        exportEnabled: true,
        dischargeLimitW: null,
        afrrSignalDispatchUnavailable: true,
        afrrSignalTimeoutCount: 4,
        afrrSignalSendAccepted: false,
        lastAfrrSignalDispatchAt: '2026-08-19T01:05:00.000Z',
        lastAfrrSignalSendAcceptedAt: null,
        lastAfrrSignalError: {
          at: '2026-08-19T01:05:00.000Z',
          errorCode: 'InternalError',
          errorDescription: 'Request Timeout',
          correlationId: 'corr-afrr-1',
        },
      },
    ]);
  });

  it('summarizes success-only diagnostics without degraded status', () => {
    const summary = module.summarizeStationCapabilities([
      {
        stationId: 'cs-v2x-4',
        transactionId: '__diag_afrrsignal__',
        allowedModesJson: [
          '__diag__',
          'afrr_signal_dispatch_ok',
          'correlation_id:corr-afrr-2',
        ],
        exportEnabled: false,
        dischargeLimitW: 2,
        updatedAt: '2026-08-19T01:10:00.000Z',
      },
    ]);

    expect(summary).toEqual([
      {
        stationId: 'cs-v2x-4',
        lastUpdatedAt: '2026-08-19T01:10:00.000Z',
        activeTransactionId: null,
        allowedEnergyTransfer: [],
        exportEnabled: false,
        dischargeLimitW: null,
        afrrSignalDispatchUnavailable: false,
        afrrSignalTimeoutCount: 2,
        afrrSignalSendAccepted: false,
        lastAfrrSignalDispatchAt: '2026-08-19T01:10:00.000Z',
        lastAfrrSignalSendAcceptedAt: null,
        lastAfrrSignalError: null,
      },
    ]);
  });

  it('summarizes send-accepted diagnostics distinctly from response success/error', () => {
    const summary = module.summarizeStationCapabilities([
      {
        stationId: 'cs-v2x-4',
        transactionId: '__diag_afrrsignal__',
        allowedModesJson: ['__diag__', 'afrr_signal_send_accepted', 'afrr_signal_call_error'],
        exportEnabled: false,
        dischargeLimitW: 3,
        updatedAt: '2026-08-19T01:15:00.000Z',
      },
    ]);

    expect(summary).toEqual([
      {
        stationId: 'cs-v2x-4',
        lastUpdatedAt: '2026-08-19T01:15:00.000Z',
        activeTransactionId: null,
        allowedEnergyTransfer: [],
        exportEnabled: false,
        dischargeLimitW: null,
        afrrSignalDispatchUnavailable: true,
        afrrSignalTimeoutCount: 3,
        afrrSignalSendAccepted: true,
        lastAfrrSignalDispatchAt: '2026-08-19T01:15:00.000Z',
        lastAfrrSignalSendAcceptedAt: '2026-08-19T01:15:00.000Z',
        lastAfrrSignalError: {
          at: '2026-08-19T01:15:00.000Z',
          errorCode: null,
          errorDescription: null,
          correlationId: null,
        },
      },
    ]);
  });
});
