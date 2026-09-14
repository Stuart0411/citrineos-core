// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { BootstrapConfig } from '@citrineos/base';
import { Sequelize } from 'sequelize-typescript';
import type { ILogObj } from 'tslog';
import { Logger } from 'tslog';
import type { IDerEventRepository } from '../../../interfaces/repositories.js';
import { DerEvent } from '../model/DerEvent.js';
import { SequelizeRepository } from './Base.js';

export class SequelizeDerEventRepository
  extends SequelizeRepository<DerEvent>
  implements IDerEventRepository
{
  constructor(config: BootstrapConfig, logger?: Logger<ILogObj>, sequelizeInstance?: Sequelize) {
    super(config, DerEvent.MODEL_NAME, logger, sequelizeInstance);
  }

  createEvent(
    tenantId: number,
    value: {
      stationId: string;
      eventType: string;
      controlId?: string | null;
      payloadJson: Record<string, unknown>;
      occurredAt: Date;
    },
  ): Promise<DerEvent> {
    return super.create(
      tenantId,
      DerEvent.build({
        tenantId,
        stationId: value.stationId,
        eventType: value.eventType,
        controlId: value.controlId ?? null,
        payloadJson: value.payloadJson,
        occurredAt: value.occurredAt,
      }),
    );
  }
}
