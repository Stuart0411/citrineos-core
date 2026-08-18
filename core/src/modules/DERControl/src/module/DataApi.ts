// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import {
  AbstractModuleApi,
  AsDataEndpoint,
  DEFAULT_TENANT_ID,
  HttpMethod,
  Namespace,
  OCPP1_6_Namespace,
  OCPP2_Namespace,
} from '@citrineos/base';
import { DerControl, DerEvent } from '@dal/layers/sequelize/index.js';
import { TenantQuerySchema, type TenantQueryString } from '@dal/interfaces/index.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
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

  @AsDataEndpoint(Namespace.DerControl, HttpMethod.Get, TenantQuerySchema)
  async getDerControls(
    request: FastifyRequest<{ Querystring: TenantQueryString }>,
  ): Promise<DerControl[]> {
    const tenantId = request.query.tenantId ?? DEFAULT_TENANT_ID;
    return DerControl.findAll({
      where: { tenantId },
      order: [['updatedAt', 'DESC']],
      limit: 200,
    });
  }

  @AsDataEndpoint(Namespace.DerEvent, HttpMethod.Get, TenantQuerySchema)
  async getDerEvents(
    request: FastifyRequest<{ Querystring: TenantQueryString }>,
  ): Promise<DerEvent[]> {
    const tenantId = request.query.tenantId ?? DEFAULT_TENANT_ID;
    return DerEvent.findAll({
      where: { tenantId },
      order: [['occurredAt', 'DESC']],
      limit: 500,
    });
  }

  protected _toDataPath(input: OCPP2_Namespace | OCPP1_6_Namespace | Namespace): string {
    const endpointPrefix = this._module.config.modules.dercontrol?.endpointPrefix;
    return super._toDataPath(input, endpointPrefix);
  }
}
