// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { BootstrapConfig, EmsSiteIntentCreate } from '@citrineos/base';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import type { ILogObj } from 'tslog';
import { Logger } from 'tslog';
import type { IEmsSiteIntentRepository } from '../../../interfaces/repositories.js';
import { EmsSiteIntent } from '../model/EmsSiteIntent.js';
import { SequelizeRepository } from './Base.js';

export class SequelizeEmsSiteIntentRepository
  extends SequelizeRepository<EmsSiteIntent>
  implements IEmsSiteIntentRepository
{
  constructor(config: BootstrapConfig, logger?: Logger<ILogObj>, sequelizeInstance?: Sequelize) {
    super(config, EmsSiteIntent.MODEL_NAME, logger, sequelizeInstance);
  }

  createSiteIntent(tenantId: number, value: EmsSiteIntentCreate): Promise<EmsSiteIntent> {
    return super.create(
      tenantId,
      EmsSiteIntent.build({
        tenantId,
        messageId: value.messageId,
        siteId: value.siteId,
        source: value.source,
        intentCreatedAt: value.createdAt,
        expiresAt: value.expiresAt,
        mode: value.mode,
        constraints: value.constraints,
        flags: value.flags,
        reason: value.reason,
        metadata: value.metadata ?? null,
      }),
    );
  }

  readAllBySiteId(tenantId: number, siteId: string): Promise<EmsSiteIntent[]> {
    return super.readAllByQuery(tenantId, {
      where: { siteId },
      order: [['intentCreatedAt', 'DESC']],
    });
  }

  readLatestActiveBySiteId(
    tenantId: number,
    siteId: string,
    atTime: Date = new Date(),
  ): Promise<EmsSiteIntent | undefined> {
    return super.readOnlyOneByQuery(tenantId, {
      where: {
        siteId,
        expiresAt: { [Op.gt]: atTime },
      },
      order: [['intentCreatedAt', 'DESC']],
      limit: 1,
    });
  }
}