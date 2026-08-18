// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { Op } from 'sequelize';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DerControl } from '../model/DerControl.js';
import { DerEvent } from '../model/DerEvent.js';
import { SequelizeRepository } from './Base.js';
import { SequelizeDerControlRepository } from './DerControl.js';
import { SequelizeDerEventRepository } from './DerEvent.js';

describe('DER Sequelize repositories', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('upsertFromReport writes normalized DER control fields', async () => {
    const upsertSpy = vi.spyOn(DerControl, 'upsert').mockResolvedValue([{} as any, true]);
    const repository = new SequelizeDerControlRepository({} as any, undefined, {} as any);

    await repository.upsertFromReport(3, 'cs-1', {
      controlId: 'ctrl-1',
      controlType: 'Curve',
      isDefault: true,
      isSuperseded: false,
      priority: 10,
      payloadJson: { k: 'v' },
      startTime: new Date('2026-08-18T08:00:00.000Z'),
      durationSeconds: 60,
      status: 'started',
      supersededByControlId: null,
    });

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 3,
        stationId: 'cs-1',
        controlId: 'ctrl-1',
        controlType: 'Curve',
        isDefault: true,
        isSuperseded: false,
        priority: 10,
        payloadJson: { k: 'v' },
        durationSeconds: 60,
        status: 'started',
        supersededByControlId: null,
      }),
    );
  });

  it('updateStartStopState marks started or stopped and clears supersede metadata', async () => {
    const updateSpy = vi.spyOn(DerControl, 'update').mockResolvedValue([1]);
    const repository = new SequelizeDerControlRepository({} as any, undefined, {} as any);

    await repository.updateStartStopState(2, 'cs-2', 'ctrl-2', true);

    expect(updateSpy).toHaveBeenCalledWith(
      {
        status: 'started',
        isSuperseded: false,
        supersededByControlId: null,
      },
      {
        where: {
          tenantId: 2,
          stationId: 'cs-2',
          controlId: 'ctrl-2',
        },
      },
    );
  });

  it('markSupersededByControlId is a no-op when supersededIds is empty', async () => {
    const updateSpy = vi.spyOn(DerControl, 'update').mockResolvedValue([1]);
    const repository = new SequelizeDerControlRepository({} as any, undefined, {} as any);

    await repository.markSupersededByControlId(1, 'cs-3', [], 'ctrl-new');

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('markSupersededByControlId updates rows using Op.in filter', async () => {
    const updateSpy = vi.spyOn(DerControl, 'update').mockResolvedValue([2]);
    const repository = new SequelizeDerControlRepository({} as any, undefined, {} as any);

    await repository.markSupersededByControlId(1, 'cs-3', ['ctrl-a', 'ctrl-b'], 'ctrl-new');

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const args = updateSpy.mock.calls[0];
    expect(args[0]).toEqual({
      isSuperseded: true,
      supersededByControlId: 'ctrl-new',
      status: 'superseded',
    });
    expect(args[1]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 1,
          stationId: 'cs-3',
        }),
      }),
    );

    const where = args[1].where as Record<string, unknown>;
    const controlIdFilter = where.controlId as Record<symbol, string[]>;
    expect(controlIdFilter[Op.in]).toEqual(['ctrl-a', 'ctrl-b']);
  });

  it('createEvent builds a DER event and delegates to base create', async () => {
    const builtEvent = { id: 7 } as any;
    const createdEvent = { id: 7, created: true } as any;

    const buildSpy = vi.spyOn(DerEvent, 'build').mockReturnValue(builtEvent);
    const createSpy = vi
      .spyOn(SequelizeRepository.prototype as any, 'create')
      .mockResolvedValue(createdEvent);

    const repository = new SequelizeDerEventRepository({} as any, undefined, {} as any);

    const result = await repository.createEvent(5, {
      stationId: 'cs-5',
      eventType: 'notify_der_alarm',
      payloadJson: { code: 'E01' },
      occurredAt: new Date('2026-08-18T10:00:00.000Z'),
    });

    expect(buildSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 5,
        stationId: 'cs-5',
        eventType: 'notify_der_alarm',
        controlId: null,
        payloadJson: { code: 'E01' },
      }),
    );
    expect(createSpy).toHaveBeenCalledWith(5, builtEvent);
    expect(result).toBe(createdEvent);
  });
});
