// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { OCPP2_1 } from '@citrineos/base';
import { describe, expect, it } from 'vitest';
import { ChargingProfileMapper } from './ChargingProfileMapper.js';

describe('ChargingProfileMapper dynamic fields', () => {
  it('round-trips OCPP 2.1 dynamic schedule fields without truncation', () => {
    const input: OCPP2_1.ChargingProfileType = {
      id: 321,
      stackLevel: 2,
      chargingProfilePurpose: OCPP2_1.ChargingProfilePurposeEnumType.ChargingStationMaxProfile,
      chargingProfileKind: OCPP2_1.ChargingProfileKindEnumType.Dynamic,
      dynUpdateInterval: 120,
      dynUpdateTime: '2026-08-19T07:30:00.000Z',
      chargingSchedule: [
        {
          id: 654,
          chargingRateUnit: OCPP2_1.ChargingRateUnitEnumType.W,
          startSchedule: '2026-08-19T07:31:00.000Z',
          chargingSchedulePeriod: [
            {
              startPeriod: 0,
              limit: 11000,
              operationMode: OCPP2_1.OperationModeEnumType.ExternalLimits,
              setpoint: 9500,
              setpointReactive: 1200,
              dischargeLimit: 4000,
              v2xBaseline: -1500,
              v2xFreqWattCurve: [{ frequency: 49.8, power: -2000 }],
              v2xSignalWattCurve: [{ signal: 10, power: -3000 }],
            },
          ],
        },
      ],
    };

    const mapped = ChargingProfileMapper.fromChargingProfileType(input);
    expect(mapped.dynUpdateInterval).toBe(120);
    expect(mapped.dynUpdateTime).toBe('2026-08-19T07:30:00.000Z');
    expect(mapped.chargingSchedule[0].chargingSchedulePeriod[0]).toEqual(
      expect.objectContaining({
        operationMode: OCPP2_1.OperationModeEnumType.ExternalLimits,
        setpoint: 9500,
        setpointReactive: 1200,
        dischargeLimit: 4000,
        v2xBaseline: -1500,
        v2xFreqWattCurve: [{ frequency: 49.8, power: -2000 }],
        v2xSignalWattCurve: [{ signal: 10, power: -3000 }],
      }),
    );

    const roundTrip = ChargingProfileMapper.toChargingProfileType({
      id: mapped.id,
      stackLevel: mapped.stackLevel,
      chargingProfilePurpose: mapped.chargingProfilePurpose,
      chargingProfileKind: mapped.chargingProfileKind,
      dynUpdateInterval: mapped.dynUpdateInterval,
      dynUpdateTime: mapped.dynUpdateTime,
      recurrencyKind: mapped.recurrencyKind,
      validFrom: mapped.validFrom,
      validTo: mapped.validTo,
      chargingSchedule: mapped.chargingSchedule as any,
      transactionId: mapped.transactionId,
    } as any);

    expect((roundTrip as OCPP2_1.ChargingProfileType).dynUpdateInterval).toBe(120);
    expect((roundTrip as OCPP2_1.ChargingProfileType).dynUpdateTime).toBe(
      '2026-08-19T07:30:00.000Z',
    );
    expect(
      (roundTrip as OCPP2_1.ChargingProfileType).chargingSchedule[0].chargingSchedulePeriod[0],
    ).toEqual(
      expect.objectContaining({
        operationMode: OCPP2_1.OperationModeEnumType.ExternalLimits,
        setpoint: 9500,
        setpointReactive: 1200,
        dischargeLimit: 4000,
        v2xBaseline: -1500,
      }),
    );
  });
});
