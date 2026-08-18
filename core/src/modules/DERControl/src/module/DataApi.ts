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
  DerControlQuerySchema,
  DerEventQuerySchema,
  StationDerCapabilityQuerySchema,
  type DerControlQuerystring,
  type DerEventQuerystring,
  type StationDerCapabilityQuerystring,
} from '@dal/interfaces/index.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Op } from 'sequelize';
import type { ILogObj } from 'tslog';
import { Logger } from 'tslog';
import type { IDerControlModuleApi } from './interface.js';
import { DerControlModule } from './module.js';

/**
 * Data API for DER control inspection.
 */
export class DerControlDataApi
  extends AbstractModuleApi<DerControlModule>
  implements IDerControlModuleApi
{
  constructor(module: DerControlModule, server: FastifyInstance, logger?: Logger<ILogObj>) {
    super(module, server, null, logger);
  }

  @AsDataEndpoint(Namespace.DerControl, HttpMethod.Get, DerControlQuerySchema)
  async getDerControls(request: FastifyRequest<{ Querystring: DerControlQuerystring }>) {
    const tenantId = request.query.tenantId ?? DEFAULT_TENANT_ID;
    const {
      stationId,
      controlId,
      controlType,
      isDefault,
      isSuperseded,
      status,
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
    if (controlId) {
      where.controlId = controlId;
    }
    if (controlType) {
      where.controlType = controlType;
    }
    if (isDefault !== undefined) {
      where.isDefault = isDefault;
    }
    if (isSuperseded !== undefined) {
      where.isSuperseded = isSuperseded;
    }
    if (status) {
      where.status = status;
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

    return this._module.derControlRepository.readAllByQuery(tenantId, {
      where,
      order: [['updatedAt', 'DESC']],
      limit: boundedLimit,
    });
  }

  @AsDataEndpoint(Namespace.DerEvent, HttpMethod.Get, DerEventQuerySchema)
  async getDerEvents(request: FastifyRequest<{ Querystring: DerEventQuerystring }>) {
    const tenantId = request.query.tenantId ?? DEFAULT_TENANT_ID;
    const { stationId, controlId, eventType, fromOccurredAt, toOccurredAt, limit } = request.query;

    const fromDate = fromOccurredAt ? new Date(fromOccurredAt) : undefined;
    const toDate = toOccurredAt ? new Date(toOccurredAt) : undefined;

    if (fromDate && Number.isNaN(fromDate.getTime())) {
      throw new BadRequestError('fromOccurredAt must be a valid datetime string');
    }
    if (toDate && Number.isNaN(toDate.getTime())) {
      throw new BadRequestError('toOccurredAt must be a valid datetime string');
    }
    if (fromDate && toDate && toDate < fromDate) {
      throw new BadRequestError('toOccurredAt must be greater than or equal to fromOccurredAt');
    }

    const where: Record<string, unknown> = {};
    if (stationId) {
      where.stationId = stationId;
    }
    if (controlId) {
      where.controlId = controlId;
    }
    if (eventType) {
      where.eventType = eventType;
    }

    if (fromDate || toDate) {
      const occurredAtFilter: Record<symbol, Date> = {};
      if (fromDate) {
        occurredAtFilter[Op.gte] = fromDate;
      }
      if (toDate) {
        occurredAtFilter[Op.lte] = toDate;
      }
      where.occurredAt = occurredAtFilter;
    }

    const boundedLimit = Math.min(Math.max(limit ?? 500, 1), 2000);

    return this._module.derEventRepository.readAllByQuery(tenantId, {
      where,
      order: [['occurredAt', 'DESC']],
      limit: boundedLimit,
    });
  }

  @AsDataEndpoint(Namespace.StationDerCapability, HttpMethod.Get, StationDerCapabilityQuerySchema)
  async getStationDerCapabilities(
    request: FastifyRequest<{ Querystring: StationDerCapabilityQuerystring }>,
  ) {
    const tenantId = request.query.tenantId ?? DEFAULT_TENANT_ID;
    const { stationId, fromUpdatedAt, toUpdatedAt, limit } = request.query;

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

    return this._module.stationDerCapabilityRepository.readAllByQuery(tenantId, {
      where,
      order: [['updatedAt', 'DESC']],
      limit: boundedLimit,
    });
  }

  protected _toDataPath(input: OCPP2_Namespace | OCPP1_6_Namespace | Namespace): string {
    const endpointPrefix = this._module.config.modules.dercontrol?.endpointPrefix;
    return super._toDataPath(input, endpointPrefix);
  }
}
