// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { OCPP2_1 } from '@citrineos/base';
import { ChargingProfileMapper } from '../../src/dal/layers/sequelize/mapper/2.0.1/ChargingProfileMapper.js';

describe('ChargingProfileMapper', () => {
  it('preserves OCPP 2.1 dynamic schedule fields when mapping from profile types', () => {
    const mapped = ChargingProfileMapper.fromChargingProfileType({
      id: 77,
      stackLevel: 0,
      chargingProfilePurpose: OCPP2_1.ChargingProfilePurposeEnumType.LocalGeneration,
      chargingProfileKind: OCPP2_1.ChargingProfileKindEnumType.Dynamic,
      dynUpdateInterval: 30,
      dynUpdateTime: '2026-08-17T12:00:00.000Z',
      chargingSchedule: [
        {
          id: 1,
          chargingRateUnit: OCPP2_1.ChargingRateUnitEnumType.W,
          operationMode: OCPP2_1.OperationModeEnumType.ExternalLimits,
          chargingSchedulePeriod: [
            {
              startPeriod: 0,
              limit: 12000,
              limit_L2: 6000,
              limit_L3: 6000,
              setpoint: 8000,
              dischargeLimit: -5000,
              operationMode: OCPP2_1.OperationModeEnumType.CentralSetpoint,
            },
          ],
        },
      ],
    } as OCPP2_1.ChargingProfileType);

    expect(mapped.chargingProfileKind).toBe('Dynamic');
    expect(mapped.chargingProfilePurpose).toBe('LocalGeneration');
    expect(mapped.dynUpdateInterval).toBe(30);
    expect(mapped.dynUpdateTime).toBe('2026-08-17T12:00:00.000Z');
    expect(mapped.chargingSchedule[0].chargingSchedulePeriod[0]).toMatchObject({
      limit_L2: 6000,
      limit_L3: 6000,
      setpoint: 8000,
      dischargeLimit: -5000,
      operationMode: 'CentralSetpoint',
    });
  });
});