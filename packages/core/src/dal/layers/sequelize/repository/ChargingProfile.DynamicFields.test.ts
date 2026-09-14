// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { OCPP2_1 } from '@citrineos/base';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChargingSchedule } from '../model/ChargingProfile/ChargingSchedule.js';
import { SequelizeChargingProfileRepository } from './ChargingProfile.js';

describe('ChargingProfile repository dynamic fields', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('passes OCPP 2.1 dynamic schedule fields through createOrUpdateChargingProfile', async () => {
    const chargingNeedsRepo = {} as any;
    const chargingScheduleRepo = {
      create: vi.fn().mockResolvedValue({ databaseId: 2001 }),
      deleteAllByQuery: vi.fn().mockResolvedValue([]),
      readNextValue: vi.fn(),
    } as any;
    const salesTariffRepo = {
      create: vi.fn().mockResolvedValue(undefined),
      deleteAllByQuery: vi.fn().mockResolvedValue([]),
    } as any;
    const transactionRepo = {} as any;
    const evseRepo = {} as any;
    const compositeScheduleRepo = {} as any;

    const repository = new SequelizeChargingProfileRepository(
      {} as any,
      undefined,
      {} as any,
      chargingNeedsRepo,
      chargingScheduleRepo,
      salesTariffRepo,
      transactionRepo,
      evseRepo,
      compositeScheduleRepo,
    );

    vi.spyOn(repository, 'readOrCreateByQuery').mockResolvedValue([
      {
        databaseId: 1001,
      } as any,
      true,
    ]);
    vi.spyOn(ChargingSchedule, 'build').mockImplementation((value: any) => value);

    await repository.createOrUpdateChargingProfile(
      1,
      {
        id: 101,
        stackLevel: 1,
        chargingProfilePurpose: 'ChargingStationMaxProfile',
        chargingProfileKind: 'Dynamic',
        dynUpdateInterval: 300,
        dynUpdateTime: '2026-08-19T07:45:00.000Z',
        chargingSchedule: [
          {
            id: 201,
            chargingRateUnit: 'W',
            chargingSchedulePeriod: [
              {
                startPeriod: 0,
                limit: 10000,
                operationMode: OCPP2_1.OperationModeEnumType.ExternalLimits,
                setpoint: 9000,
                setpointReactive: 800,
                dischargeLimit: 3500,
                v2xBaseline: -1000,
                v2xFreqWattCurve: [{ frequency: 49.9, power: -1200 }],
                v2xSignalWattCurve: [{ signal: 12, power: -1800 }],
              },
            ],
          },
        ],
      },
      'cs-smart-1',
      1,
      'EMS',
      true,
    );

    expect(repository.readOrCreateByQuery).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        defaults: expect.objectContaining({
          dynUpdateInterval: 300,
          dynUpdateTime: '2026-08-19T07:45:00.000Z',
          chargingProfileKind: 'Dynamic',
        }),
      }),
    );

    const createdSchedule = chargingScheduleRepo.create.mock.calls[0][1];
    expect(createdSchedule.chargingSchedulePeriod[0]).toEqual(
      expect.objectContaining({
        operationMode: OCPP2_1.OperationModeEnumType.ExternalLimits,
        setpoint: 9000,
        setpointReactive: 800,
        dischargeLimit: 3500,
        v2xBaseline: -1000,
        v2xFreqWattCurve: [{ frequency: 49.9, power: -1200 }],
        v2xSignalWattCurve: [{ signal: 12, power: -1800 }],
      }),
    );
  });
});
