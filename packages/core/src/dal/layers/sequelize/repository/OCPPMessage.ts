// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { type OCPPMessageDto } from '@citrineos/types';
import type { IOCPPMessageRepository } from '../../../interfaces/repositories.js';
import { OCPPMessage } from '../model/OCPPMessage.js';
import { SequelizeRepository, type SequelizeRepositoryDependencies } from './Base.js';
import { QueryTypes } from 'sequelize';

export class SequelizeOCPPMessageRepository
  extends SequelizeRepository<OCPPMessage>
  implements IOCPPMessageRepository
{
  constructor({ config, logger, sequelizeInstance }: SequelizeRepositoryDependencies) {
    super({ config, namespace: OCPPMessage.MODEL_NAME, logger, sequelizeInstance });
  }

  /**
   * This method does not handle associating request/response messages.
   * A database trigger handles that automatically on insert--make sure the trigger is installed in the database.
   *
   * @param tenantId
   * @param message
   * @returns
   */
  public async createOCPPMessage(tenantId: number, message: OCPPMessageDto): Promise<OCPPMessage> {
    const now = new Date();
    await this.s.query(
      `INSERT INTO "OCPPMessages"
        ("ocppConnectionName", "correlationId", "origin", "type", "state", "protocol", "action", "message", "payload", "raw", "timestamp", "tenantId", "createdAt", "updatedAt")
       VALUES
        (:ocppConnectionName, :correlationId, :origin, :type, :state, :protocol, :action, :message::jsonb, :payload::jsonb, :raw, :timestamp, :tenantId, :createdAt, :updatedAt)`,
      {
        replacements: {
          ocppConnectionName: message.ocppConnectionName,
          correlationId: message.correlationId,
          origin: message.origin,
          type: message.type ?? null,
          state: message.state ?? null,
          protocol: message.protocol,
          action: message.action ?? null,
          message: JSON.stringify(message.message ?? null),
          payload: JSON.stringify(message.payload ?? null),
          raw: message.raw,
          timestamp: message.timestamp,
          tenantId,
          createdAt: now,
          updatedAt: now,
        },
        type: QueryTypes.INSERT,
      },
    );

    const createdMessage = await this.s.models[OCPPMessage.MODEL_NAME].findOne({
      where: {
        tenantId,
        ocppConnectionName: message.ocppConnectionName,
        correlationId: message.correlationId,
      },
      order: [['createdAt', 'DESC']],
    });

    if (!createdMessage) {
      throw new Error('Failed to reload inserted OCPP message');
    }

    return createdMessage as OCPPMessage;
  }

  public async getRequestByCorrelationId(
    tenantId: number,
    correlationId: string,
  ): Promise<OCPPMessage | undefined> {
    return this.readOnlyOneByQuery(tenantId, {
      where: { tenantId, correlationId, requestMessageId: null },
    });
  }
}

export default SequelizeOCPPMessageRepository;
