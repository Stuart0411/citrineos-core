// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { BootstrapConfig } from '@citrineos/base';
import { Sequelize } from 'sequelize-typescript';
import type { ILogObj } from 'tslog';
import { Logger } from 'tslog';
import type { IEmsDecisionRepository } from '../../../interfaces/repositories.js';
import { EmsDecision } from '../model/EmsDecision.js';
import { SequelizeRepository } from './Base.js';

export class SequelizeEmsDecisionRepository
  extends SequelizeRepository<EmsDecision>
  implements IEmsDecisionRepository
{
  constructor(config: BootstrapConfig, logger?: Logger<ILogObj>, sequelizeInstance?: Sequelize) {
    super(config, EmsDecision.MODEL_NAME, logger, sequelizeInstance);
  }

  createDecision(
    tenantId: number,
    value: {
      siteId: string;
      stationId: string;
      evseId: number;
      intentMessageId?: string | null;
      decisionType: string;
      decisionJson: Record<string, unknown>;
    },
  ): Promise<EmsDecision> {
    return super.create(
      tenantId,
      EmsDecision.build({
        tenantId,
        siteId: value.siteId,
        stationId: value.stationId,
        evseId: value.evseId,
        intentMessageId: value.intentMessageId ?? null,
        decisionType: value.decisionType,
        decisionJson: value.decisionJson,
      }),
    );
  }
}
