// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import {
  AbstractModuleApi,
  AsMessageEndpoint,
  DEFAULT_TENANT_ID,
  getOcpp2Schema,
  OCPP2_1,
  OCPP_CallAction,
  OCPPVersion,
  type IMessageConfirmation,
} from '@citrineos/base';
import type { FastifyInstance } from 'fastify';
import type { ILogObj } from 'tslog';
import { Logger } from 'tslog';
import { packageGroupCall } from '@util/index.js';
import type { IDerControlModuleApi } from '../interface.js';
import { DerControlModule } from '../module.js';

const DEFAULT_VERSION = OCPPVersion.OCPP2_1;

/**
 * Server API for OCPP 2.1 DER control operations.
 */
export class DerControlOcpp2Api
  extends AbstractModuleApi<DerControlModule>
  implements IDerControlModuleApi
{
  constructor(
    module: DerControlModule,
    server: FastifyInstance,
    version: OCPPVersion = DEFAULT_VERSION,
    logger?: Logger<ILogObj>,
  ) {
    super(module, server, version, logger);
  }

  @AsMessageEndpoint(OCPP_CallAction.SetDERControl, (instance: DerControlOcpp2Api) =>
    getOcpp2Schema(
      (instance._ocppVersion ?? DEFAULT_VERSION) as Exclude<OCPPVersion, OCPPVersion.OCPP1_6>,
      'SetDERControlRequestSchema',
    ),
  )
  setDERControl(
    identifier: string[],
    request: OCPP2_1.SetDERControlRequest,
    callbackUrl?: string,
    tenantId: number = DEFAULT_TENANT_ID,
  ): Promise<IMessageConfirmation[]> {
    return packageGroupCall(
      this._module,
      identifier,
      tenantId,
      this._ocppVersion ?? DEFAULT_VERSION,
      OCPP_CallAction.SetDERControl,
      request,
      callbackUrl,
    );
  }

  @AsMessageEndpoint(OCPP_CallAction.GetDERControl, (instance: DerControlOcpp2Api) =>
    getOcpp2Schema(
      (instance._ocppVersion ?? DEFAULT_VERSION) as Exclude<OCPPVersion, OCPPVersion.OCPP1_6>,
      'GetDERControlRequestSchema',
    ),
  )
  getDERControl(
    identifier: string[],
    request: OCPP2_1.GetDERControlRequest,
    callbackUrl?: string,
    tenantId: number = DEFAULT_TENANT_ID,
  ): Promise<IMessageConfirmation[]> {
    return packageGroupCall(
      this._module,
      identifier,
      tenantId,
      this._ocppVersion ?? DEFAULT_VERSION,
      OCPP_CallAction.GetDERControl,
      request,
      callbackUrl,
    );
  }

  @AsMessageEndpoint(OCPP_CallAction.ClearDERControl, (instance: DerControlOcpp2Api) =>
    getOcpp2Schema(
      (instance._ocppVersion ?? DEFAULT_VERSION) as Exclude<OCPPVersion, OCPPVersion.OCPP1_6>,
      'ClearDERControlRequestSchema',
    ),
  )
  clearDERControl(
    identifier: string[],
    request: OCPP2_1.ClearDERControlRequest,
    callbackUrl?: string,
    tenantId: number = DEFAULT_TENANT_ID,
  ): Promise<IMessageConfirmation[]> {
    return packageGroupCall(
      this._module,
      identifier,
      tenantId,
      this._ocppVersion ?? DEFAULT_VERSION,
      OCPP_CallAction.ClearDERControl,
      request,
      callbackUrl,
    );
  }
}
