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
    updateStatusByControlId: ReturnType<typeof vi.fn>;
    updateStatusByControlSelection: ReturnType<typeof vi.fn>;
  };
  let derEventRepository: {
    createEvent: ReturnType<typeof vi.fn>;
  };
  let ocppMessageRepository: {
    getRequestByCorrelationId: ReturnType<typeof vi.fn>;
  };
  let module: DerControlModule;

  beforeEach(() => {
    vi.clearAllMocks();

    derControlRepository = {
      upsertFromReport: vi.fn().mockResolvedValue(undefined),
      updateStartStopState: vi.fn().mockResolvedValue(undefined),
      markSupersededByControlId: vi.fn().mockResolvedValue(undefined),
      updateStatusByControlId: vi.fn().mockResolvedValue(undefined),
      updateStatusByControlSelection: vi.fn().mockResolvedValue(undefined),
    };

    derEventRepository = {
      createEvent: vi.fn().mockResolvedValue(undefined),
    };

    ocppMessageRepository = {
      getRequestByCorrelationId: vi.fn().mockResolvedValue(undefined),
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
      ocppMessageRepository as any,
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
    expect(derEventRepository.createEvent).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        stationId: 'cs-1',
        eventType: 'report_der_capability_snapshot',
        controlId: null,
        payloadJson: expect.objectContaining({
          supportedControlTypes: ['Curve', 'Gradients'],
          supportedControlCount: 2,
          recordedControlCount: 2,
        }),
      }),
    );
    expect(ackSpy).toHaveBeenCalledTimes(1);
  });

  it('persists SetDERControl responses as DER events', async () => {
    ocppMessageRepository.getRequestByCorrelationId.mockResolvedValue({
      message: [2, 'corr-set-1', 'SetDERControl', { controlId: 'ctrl-new' }],
    });

    await (module as any)._handleSetDERControlResponse({
      context: {
        tenantId: 2,
        stationId: 'cs-2',
        correlationId: 'corr-set-1',
      },
      payload: {
        status: 'Accepted',
        supersededIds: ['ctrl-1'],
      },
    } as any);

    expect(derEventRepository.createEvent).toHaveBeenCalledWith(
      2,
      expect.objectContaining({
        stationId: 'cs-2',
        eventType: 'set_der_control_response',
        controlId: null,
        payloadJson: expect.objectContaining({
          status: 'Accepted',
        }),
      }),
    );
    expect(derControlRepository.updateStatusByControlId).toHaveBeenCalledWith(
      2,
      'cs-2',
      'ctrl-new',
      'accepted',
    );
    expect(derControlRepository.markSupersededByControlId).toHaveBeenCalledWith(
      2,
      'cs-2',
      ['ctrl-1'],
      'ctrl-new',
    );
  });

  it('persists GetDERControl responses as DER events', async () => {
    ocppMessageRepository.getRequestByCorrelationId.mockResolvedValue({
      message: [2, 'corr-get-1', 'GetDERControl', { controlId: 'ctrl-get-1' }],
    });

    await (module as any)._handleGetDERControlResponse({
      context: {
        tenantId: 3,
        stationId: 'cs-3',
        correlationId: 'corr-get-1',
      },
      payload: {
        status: 'NotFound',
      },
    } as any);

    expect(derEventRepository.createEvent).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        stationId: 'cs-3',
        eventType: 'get_der_control_response',
        controlId: null,
        payloadJson: expect.objectContaining({
          status: 'NotFound',
        }),
      }),
    );
    expect(derControlRepository.updateStatusByControlId).toHaveBeenCalledWith(
      3,
      'cs-3',
      'ctrl-get-1',
      'notfound',
    );
  });

  it('persists ClearDERControl responses as DER events', async () => {
    ocppMessageRepository.getRequestByCorrelationId.mockResolvedValue({
      message: [2, 'corr-clear-1', 'ClearDERControl', { controlId: 'ctrl-clear-1' }],
    });

    await (module as any)._handleClearDERControlResponse({
      context: {
        tenantId: 4,
        stationId: 'cs-4',
        correlationId: 'corr-clear-1',
      },
      payload: {
        status: 'Rejected',
      },
    } as any);

    expect(derEventRepository.createEvent).toHaveBeenCalledWith(
      4,
      expect.objectContaining({
        stationId: 'cs-4',
        eventType: 'clear_der_control_response',
        controlId: null,
        payloadJson: expect.objectContaining({
          status: 'Rejected',
        }),
      }),
    );
    expect(derControlRepository.updateStatusByControlId).toHaveBeenCalledWith(
      4,
      'cs-4',
      'ctrl-clear-1',
      'rejected',
    );
  });

  it('maps clear accepted status to cleared when controlId can be correlated', async () => {
    ocppMessageRepository.getRequestByCorrelationId.mockResolvedValue({
      message: [2, 'corr-clear-2', 'ClearDERControl', { controlId: 'ctrl-clear-2' }],
    });

    await (module as any)._handleClearDERControlResponse({
      context: {
        tenantId: 4,
        stationId: 'cs-4',
        correlationId: 'corr-clear-2',
      },
      payload: {
        status: 'Accepted',
      },
    } as any);

    expect(derControlRepository.updateStatusByControlId).toHaveBeenCalledWith(
      4,
      'cs-4',
      'ctrl-clear-2',
      'cleared',
    );
  });

  it('skips status updates when correlation request does not expose a controlId', async () => {
    ocppMessageRepository.getRequestByCorrelationId.mockResolvedValue({
      message: [2, 'corr-set-2', 'SetDERControl', { controlType: 'Curve' }],
    });

    await (module as any)._handleSetDERControlResponse({
      context: {
        tenantId: 9,
        stationId: 'cs-9',
        correlationId: 'corr-set-2',
      },
      payload: {
        status: 'Accepted',
      },
    } as any);

    expect(derControlRepository.updateStatusByControlId).not.toHaveBeenCalled();
  });

  it('clears matching controls by selection when clear request has no controlId', async () => {
    ocppMessageRepository.getRequestByCorrelationId.mockResolvedValue({
      message: [2, 'corr-clear-3', 'ClearDERControl', { isDefault: true, controlType: 'Curve' }],
    });

    await (module as any)._handleClearDERControlResponse({
      context: {
        tenantId: 10,
        stationId: 'cs-10',
        correlationId: 'corr-clear-3',
      },
      payload: {
        status: 'Accepted',
      },
    } as any);

    expect(derControlRepository.updateStatusByControlId).not.toHaveBeenCalled();
    expect(derControlRepository.updateStatusByControlSelection).toHaveBeenCalledWith(
      10,
      'cs-10',
      'cleared',
      {
        controlType: 'Curve',
        isDefault: true,
      },
    );
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

  it('rejects unsupported SetDERControl controlType when policy enforcement is enabled', () => {
    module = new DerControlModule(
      {
        env: 'test',
        logLevel: 3,
        maxCachingSeconds: 60,
        modules: {
          dercontrol: {
            requests: [],
            responses: [],
            policy: {
              enforceSupportedControlTypes: true,
              supportedControlTypes: ['Gradients'],
            },
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
      ocppMessageRepository as any,
    );

    expect(() =>
      module.validateSetDERControlRequest({
        controlId: 'ctrl-1',
        controlType: 'FreqWatt',
        isDefault: true,
        curve: {
          priority: 0,
          yUnit: 'PctMaxW',
          curveData: [{ x: 0, y: 0 }],
        },
      } as any),
    ).toThrow('Unsupported DER control type(s) requested: FreqWatt');
  });

  it('rejects ClearDERControl when request has no control selector', () => {
    expect(() =>
      module.validateClearDERControlRequest({
        isDefault: false,
      } as any),
    ).toThrow('ClearDERControl requires controlId or controlType');
  });
});
