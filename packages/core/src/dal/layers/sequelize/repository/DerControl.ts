// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { BootstrapConfig } from '@citrineos/base';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import type { ILogObj } from 'tslog';
import { Logger } from 'tslog';
import type { IDerControlRepository } from '../../../interfaces/repositories.js';
import { DerControl } from '../model/DerControl.js';
import { SequelizeRepository } from './Base.js';

export class SequelizeDerControlRepository
  extends SequelizeRepository<DerControl>
  implements IDerControlRepository
{
  constructor(config: BootstrapConfig, logger?: Logger<ILogObj>, sequelizeInstance?: Sequelize) {
    super(config, DerControl.MODEL_NAME, logger, sequelizeInstance);
  }

  async upsertFromReport(
    tenantId: number,
    stationId: string,
    value: {
      controlId: string;
      controlType: string;
      isDefault: boolean;
      isSuperseded: boolean;
      priority: number | null;
      payloadJson: Record<string, unknown>;
      startTime: Date | null;
      durationSeconds: number | null;
      status: string | null;
      supersededByControlId: string | null;
    },
  ): Promise<void> {
    await DerControl.upsert({
      tenantId,
      stationId,
      controlId: value.controlId,
      controlType: value.controlType,
      isDefault: value.isDefault,
      isSuperseded: value.isSuperseded,
      priority: value.priority,
      payloadJson: value.payloadJson,
      startTime: value.startTime,
      durationSeconds: value.durationSeconds,
      status: value.status,
      supersededByControlId: value.supersededByControlId,
    });
  }

  async updateStartStopState(
    tenantId: number,
    stationId: string,
    controlId: string,
    started: boolean,
  ): Promise<void> {
    await DerControl.update(
      {
        status: started ? 'started' : 'stopped',
        isSuperseded: false,
        supersededByControlId: null,
      },
      {
        where: {
          tenantId,
          stationId,
          controlId,
        },
      },
    );
  }

  async markSupersededByControlId(
    tenantId: number,
    stationId: string,
    supersededIds: string[],
    supersededByControlId: string,
  ): Promise<void> {
    if (!supersededIds.length) {
      return;
    }

    await DerControl.update(
      {
        isSuperseded: true,
        supersededByControlId,
        status: 'superseded',
      },
      {
        where: {
          tenantId,
          stationId,
          controlId: {
            [Op.in]: supersededIds,
          },
        },
      },
    );
  }

  async updateStatusByControlId(
    tenantId: number,
    stationId: string,
    controlId: string,
    status: string,
  ): Promise<void> {
    await DerControl.update(
      {
        status,
      },
      {
        where: {
          tenantId,
          stationId,
          controlId,
        },
      },
    );
  }

  async updateStatusByControlSelection(
    tenantId: number,
    stationId: string,
    status: string,
    selection: {
      controlType?: string;
      isDefault?: boolean;
    },
  ): Promise<void> {
    const where: Record<string, unknown> = {
      tenantId,
      stationId,
    };

    if (selection.controlType) {
      where.controlType = selection.controlType;
    }
    if (selection.isDefault !== undefined) {
      where.isDefault = selection.isDefault;
    }

    await DerControl.update(
      {
        status,
      },
      {
        where,
      },
    );
  }
}
