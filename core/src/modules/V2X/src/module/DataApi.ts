// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import {
  AbstractModuleApi,
  AsDataEndpoint,
  BadRequestError,
  DEFAULT_TENANT_ID,
  HttpMethod,
  Namespace,
  OCPP1_6_Namespace,
  OCPP2_Namespace,
} from '@citrineos/base';
import {
  StationEnergyTransferPolicyQuerySchema,
  type StationEnergyTransferPolicyQuerystring,
} from '@dal/interfaces/index.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Op } from 'sequelize';
import type { ILogObj } from 'tslog';
import { Logger } from 'tslog';
import type { IV2XModuleApi } from './interface.js';
import { V2XModule } from './module.js';

export class V2XDataApi extends AbstractModuleApi<V2XModule> implements IV2XModuleApi {
  constructor(module: V2XModule, server: FastifyInstance, logger?: Logger<ILogObj>) {
    super(module, server, null, logger);
  }

  @AsDataEndpoint(
    Namespace.StationEnergyTransferPolicy,
    HttpMethod.Get,
    StationEnergyTransferPolicyQuerySchema,
  )
  async getStationEnergyTransferPolicies(
    request: FastifyRequest<{ Querystring: StationEnergyTransferPolicyQuerystring }>,
  ) {
    const tenantId = request.query.tenantId ?? DEFAULT_TENANT_ID;
    const {
      stationId,
      transactionId,
      exportEnabled,
      allowedMode,
      fromUpdatedAt,
      toUpdatedAt,
      limit,
    } = request.query;

    const fromDate = fromUpdatedAt ? new Date(fromUpdatedAt) : undefined;
    const toDate = toUpdatedAt ? new Date(toUpdatedAt) : undefined;

    if (fromDate && Number.isNaN(fromDate.getTime())) {
      throw new BadRequestError('fromUpdatedAt must be a valid datetime string');
    }
    if (toDate && Number.isNaN(toDate.getTime())) {
      throw new BadRequestError('toUpdatedAt must be a valid datetime string');
    }
    if (fromDate && toDate && toDate < fromDate) {
      throw new BadRequestError('toUpdatedAt must be greater than or equal to fromUpdatedAt');
    }

    const where: Record<string, unknown> = {};
    if (stationId) {
      where.stationId = stationId;
    }
    if (transactionId) {
      where.transactionId = transactionId;
    }
    if (exportEnabled !== undefined) {
      where.exportEnabled = exportEnabled;
    }
    if (allowedMode) {
      where.allowedModesJson = {
        [Op.contains]: [allowedMode],
      };
    }
    if (fromDate || toDate) {
      const updatedAtFilter: Record<symbol, Date> = {};
      if (fromDate) {
        updatedAtFilter[Op.gte] = fromDate;
      }
      if (toDate) {
        updatedAtFilter[Op.lte] = toDate;
      }
      where.updatedAt = updatedAtFilter;
    }

    const boundedLimit = Math.min(Math.max(limit ?? 200, 1), 1000);
    return this._module.stationEnergyTransferPolicyRepository.readAllByQuery(tenantId, {
      where,
      order: [['updatedAt', 'DESC']],
      limit: boundedLimit,
    });
  }

  protected _toDataPath(input: OCPP2_Namespace | OCPP1_6_Namespace | Namespace): string {
    const endpointPrefix = this._module.config.modules.v2x?.endpointPrefix;
    return super._toDataPath(input, endpointPrefix);
  }
}
