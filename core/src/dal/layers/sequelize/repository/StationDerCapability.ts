// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { BootstrapConfig } from '@citrineos/base';
import { Sequelize } from 'sequelize-typescript';
import type { ILogObj } from 'tslog';
import { Logger } from 'tslog';
import type { IStationDerCapabilityRepository } from '../../../interfaces/repositories.js';
import { StationDerCapability } from '../model/StationDerCapability.js';
import { SequelizeRepository } from './Base.js';

export class SequelizeStationDerCapabilityRepository
  extends SequelizeRepository<StationDerCapability>
  implements IStationDerCapabilityRepository
{
  constructor(config: BootstrapConfig, logger?: Logger<ILogObj>, sequelizeInstance?: Sequelize) {
    super(config, StationDerCapability.MODEL_NAME, logger, sequelizeInstance);
  }

  async upsertCapabilitySnapshot(
    tenantId: number,
    stationId: string,
    value: {
      supportedControlTypesJson: string[];
      snapshotJson: Record<string, unknown>;
      requestId: number;
      tbc: boolean;
      deviceModelSnapshotJson?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    await StationDerCapability.upsert({
      tenantId,
      stationId,
      supportedControlTypesJson: value.supportedControlTypesJson,
      snapshotJson: value.snapshotJson,
      requestId: value.requestId,
      tbc: value.tbc,
      deviceModelSnapshotJson: value.deviceModelSnapshotJson ?? null,
    });
  }
}
