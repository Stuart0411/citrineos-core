// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { BadRequestError, DEFAULT_TENANT_ID } from '@citrineos/base';
import { Op } from 'sequelize';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DerControlDataApi } from '../../src/module/DataApi.js';

vi.mock('reflect-metadata', async (importOriginal) => {
  const actual = await importOriginal<typeof import('reflect-metadata')>();
  return {
    ...actual,
  };
});

vi.spyOn(Reflect, 'getMetadata').mockReturnValue([]);

describe('DerControlDataApi', () => {
  let derControlRepository: { readAllByQuery: ReturnType<typeof vi.fn> };
  let derEventRepository: { readAllByQuery: ReturnType<typeof vi.fn> };
  let api: DerControlDataApi;

  beforeEach(() => {
    vi.clearAllMocks();

    derControlRepository = {
      readAllByQuery: vi.fn().mockResolvedValue([]),
    };
    derEventRepository = {
      readAllByQuery: vi.fn().mockResolvedValue([]),
    };

    const moduleMock = {
      config: {
        modules: {
          dercontrol: {
            endpointPrefix: 'dercontrol',
          },
        },
      },
      derControlRepository,
      derEventRepository,
    } as any;

    api = new DerControlDataApi(moduleMock, {} as any);
  });

  it('maps DER control filters into repository query with bounded limit', async () => {
    await api.getDerControls({
      query: {
        tenantId: 9,
        stationId: 'cs-1',
        controlId: 'ctrl-1',
        controlType: 'Curve',
        isDefault: true,
        isSuperseded: false,
        status: 'started',
        fromUpdatedAt: '2026-08-18T00:00:00.000Z',
        toUpdatedAt: '2026-08-18T01:00:00.000Z',
        limit: 1500,
      },
    } as any);

    expect(derControlRepository.readAllByQuery).toHaveBeenCalledTimes(1);
    expect(derControlRepository.readAllByQuery).toHaveBeenCalledWith(
      9,
      expect.objectContaining({
        where: expect.objectContaining({
          stationId: 'cs-1',
          controlId: 'ctrl-1',
          controlType: 'Curve',
          isDefault: true,
          isSuperseded: false,
          status: 'started',
        }),
        order: [['updatedAt', 'DESC']],
        limit: 1000,
      }),
    );

    const call = derControlRepository.readAllByQuery.mock.calls[0][1];
    const updatedAtFilter = call.where.updatedAt as Record<symbol, Date>;
    expect(updatedAtFilter[Op.gte]).toEqual(new Date('2026-08-18T00:00:00.000Z'));
    expect(updatedAtFilter[Op.lte]).toEqual(new Date('2026-08-18T01:00:00.000Z'));
  });

  it('uses default tenant and lower-bounds DER control limit', async () => {
    await api.getDerControls({
      query: {
        limit: 0,
      },
    } as any);

    expect(derControlRepository.readAllByQuery).toHaveBeenCalledWith(
      DEFAULT_TENANT_ID,
      expect.objectContaining({
        where: {},
        limit: 1,
      }),
    );
  });

  it('throws BadRequestError for invalid DER control date windows', async () => {
    await expect(
      api.getDerControls({
        query: {
          tenantId: 1,
          fromUpdatedAt: 'invalid-date',
        },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      api.getDerControls({
        query: {
          tenantId: 1,
          fromUpdatedAt: '2026-08-18T01:00:00.000Z',
          toUpdatedAt: '2026-08-18T00:00:00.000Z',
        },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('maps DER event filters into repository query with bounded limit', async () => {
    await api.getDerEvents({
      query: {
        tenantId: 7,
        stationId: 'cs-9',
        controlId: 'ctrl-9',
        eventType: 'notify_der_start',
        fromOccurredAt: '2026-08-18T02:00:00.000Z',
        toOccurredAt: '2026-08-18T03:00:00.000Z',
        limit: 9000,
      },
    } as any);

    expect(derEventRepository.readAllByQuery).toHaveBeenCalledTimes(1);
    expect(derEventRepository.readAllByQuery).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        where: expect.objectContaining({
          stationId: 'cs-9',
          controlId: 'ctrl-9',
          eventType: 'notify_der_start',
        }),
        order: [['occurredAt', 'DESC']],
        limit: 2000,
      }),
    );

    const call = derEventRepository.readAllByQuery.mock.calls[0][1];
    const occurredAtFilter = call.where.occurredAt as Record<symbol, Date>;
    expect(occurredAtFilter[Op.gte]).toEqual(new Date('2026-08-18T02:00:00.000Z'));
    expect(occurredAtFilter[Op.lte]).toEqual(new Date('2026-08-18T03:00:00.000Z'));
  });

  it('throws BadRequestError for invalid DER event date windows', async () => {
    await expect(
      api.getDerEvents({
        query: {
          tenantId: 1,
          toOccurredAt: 'not-a-date',
        },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      api.getDerEvents({
        query: {
          tenantId: 1,
          fromOccurredAt: '2026-08-18T04:00:00.000Z',
          toOccurredAt: '2026-08-18T03:00:00.000Z',
        },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});
