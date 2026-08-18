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
import type { IV2XModuleApi } from '../interface.js';
import { V2XModule } from '../module.js';

const DEFAULT_VERSION = OCPPVersion.OCPP2_1;

export class V2XOcpp2Api extends AbstractModuleApi<V2XModule> implements IV2XModuleApi {
  constructor(
    module: V2XModule,
    server: FastifyInstance,
    version: OCPPVersion = DEFAULT_VERSION,
    logger?: Logger<ILogObj>,
  ) {
    super(module, server, version, logger);
  }

  @AsMessageEndpoint(OCPP_CallAction.AFRRSignal, (instance: V2XOcpp2Api) =>
    getOcpp2Schema(
      (instance._ocppVersion ?? DEFAULT_VERSION) as Exclude<OCPPVersion, OCPPVersion.OCPP1_6>,
      'AFRRSignalRequestSchema',
    ),
  )
  afrrSignal(
    identifier: string[],
    request: OCPP2_1.AFRRSignalRequest,
    callbackUrl?: string,
    tenantId: number = DEFAULT_TENANT_ID,
  ): Promise<IMessageConfirmation[]> {
    return packageGroupCall(
      this._module,
      identifier,
      tenantId,
      this._ocppVersion ?? DEFAULT_VERSION,
      OCPP_CallAction.AFRRSignal,
      request,
      callbackUrl,
    );
  }
}
