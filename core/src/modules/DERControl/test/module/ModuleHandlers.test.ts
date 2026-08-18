// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { Logger } from 'tslog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DerControlModule } from '../../src/module/module.js';

describe('DerControlModule handlers', () => {
  let derControlRepository: {
    upsertFromReport: ReturnType<typeof vi.fn>;
    updateStartStopState: ReturnType<typeof vi.fn>;
    markSupersededByControlId: ReturnType<typeof vi.fn>;
  };
  let derEventRepository: {
    createEvent: ReturnType<typeof vi.fn>;
  };
  let module: DerControlModule;

  beforeEach(() => {
    vi.clearAllMocks();

    derControlRepository = {
      upsertFromReport: vi.fn().mockResolvedValue(undefined),
      updateStartStopState: vi.fn().mockResolvedValue(undefined),
      markSupersededByControlId: vi.fn().mockResolvedValue(undefined),
    };

    derEventRepository = {
      createEvent: vi.fn().mockResolvedValue(undefined),
    };

    module = new DerControlModule(
      {
        env: 'test',
        logLevel: 3,
        maxCachingSeconds: 60,
        modules: {
          dercontrol: {
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
      new Logger({ name: 'DerControlModuleTest', minLevel: 7 }),
      undefined,
      derControlRepository as any,
      derEventRepository as any,
    );
  });

  it('persists flattened controls on ReportDERControl and acknowledges request', async () => {
    const ackSpy = vi.spyOn(module, 'sendCallResultWithMessage').mockResolvedValue({
      success: true,
      payload: 'ok',
    } as any);

    const message = {
      context: {
        tenantId: 1,
        stationId: 'cs-1',
      },
      payload: {
        curve: [
          {
            id: 'ctrl-curve-1',
            isDefault: true,
            isSuperseded: false,
            curve: {
              priority: 4,
              duration: 30,
              startTime: '2026-08-18T11:00:00.000Z',
            },
          },
          {
            id: '',
            isDefault: false,
            isSuperseded: false,
            curve: {
              priority: 1,
            },
          },
        ],
        gradient: [
          {
            id: 'ctrl-grad-1',
            isDefault: false,
            isSuperseded: true,
            gradient: {
              priority: 2,
              duration: 15,
              startTime: '2026-08-18T11:01:00.000Z',
            },
          },
        ],
      },
    } as any;

    await (module as any)._handleReportDERControlRequest(message);

    expect(derControlRepository.upsertFromReport).toHaveBeenCalledTimes(2);
    expect(derControlRepository.upsertFromReport).toHaveBeenNthCalledWith(
      1,
      1,
      'cs-1',
      expect.objectContaining({
        controlId: 'ctrl-curve-1',
        controlType: 'Curve',
        isDefault: true,
        isSuperseded: false,
        priority: 4,
        durationSeconds: 30,
      }),
    );
    expect(derControlRepository.upsertFromReport).toHaveBeenNthCalledWith(
      2,
      1,
      'cs-1',
      expect.objectContaining({
        controlId: 'ctrl-grad-1',
        controlType: 'Gradients',
        isDefault: false,
        isSuperseded: true,
        priority: 2,
        durationSeconds: 15,
      }),
    );
    expect(ackSpy).toHaveBeenCalledTimes(1);
  });

  it('persists DER alarm events and acknowledges request', async () => {
    const ackSpy = vi.spyOn(module, 'sendCallResultWithMessage').mockResolvedValue({
      success: true,
      payload: 'ok',
    } as any);

    await (module as any)._handleNotifyDERAlarmRequest({
      context: {
        tenantId: 5,
        stationId: 'cs-5',
      },
      payload: {
        timestamp: '2026-08-18T12:00:00.000Z',
        alarms: [],
      },
    } as any);

    expect(derEventRepository.createEvent).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        stationId: 'cs-5',
        eventType: 'notify_der_alarm',
        controlId: null,
      }),
    );
    expect(ackSpy).toHaveBeenCalledTimes(1);
  });

  it('persists start event and supersedes prior controls when started=true', async () => {
    const ackSpy = vi.spyOn(module, 'sendCallResultWithMessage').mockResolvedValue({
      success: true,
      payload: 'ok',
    } as any);

    await (module as any)._handleNotifyDERStartStopRequest({
      context: {
        tenantId: 7,
        stationId: 'cs-7',
      },
      payload: {
        controlId: 'ctrl-new',
        started: true,
        supersededIds: ['ctrl-old-1', 'ctrl-old-2'],
        timestamp: '2026-08-18T13:00:00.000Z',
      },
    } as any);

    expect(derEventRepository.createEvent).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        stationId: 'cs-7',
        eventType: 'notify_der_start',
        controlId: 'ctrl-new',
      }),
    );
    expect(derControlRepository.updateStartStopState).toHaveBeenCalledWith(
      7,
      'cs-7',
      'ctrl-new',
      true,
    );
    expect(derControlRepository.markSupersededByControlId).toHaveBeenCalledWith(
      7,
      'cs-7',
      ['ctrl-old-1', 'ctrl-old-2'],
      'ctrl-new',
    );
    expect(ackSpy).toHaveBeenCalledTimes(1);
  });

  it('does not supersede controls when started=false', async () => {
    vi.spyOn(module, 'sendCallResultWithMessage').mockResolvedValue({
      success: true,
      payload: 'ok',
    } as any);

    await (module as any)._handleNotifyDERStartStopRequest({
      context: {
        tenantId: 8,
        stationId: 'cs-8',
      },
      payload: {
        controlId: 'ctrl-stop',
        started: false,
        timestamp: '2026-08-18T14:00:00.000Z',
      },
    } as any);

    expect(derControlRepository.updateStartStopState).toHaveBeenCalledWith(
      8,
      'cs-8',
      'ctrl-stop',
      false,
    );
    expect(derControlRepository.markSupersededByControlId).not.toHaveBeenCalled();
  });
});
