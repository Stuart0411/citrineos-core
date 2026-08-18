// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type {
  BootstrapConfig,
  CallAction,
  HandlerProperties,
  ICache,
  IMessage,
  IMessageHandler,
  IMessageSender,
  OCPP2_1,
  SystemConfig,
} from '@citrineos/base';
import {
  AbstractModule,
  AsHandler,
  EventGroup,
  OCPP_CallAction,
  OCPPValidator,
  OCPPVersion,
} from '@citrineos/base';
import type { ILogObj } from 'tslog';
import { Logger } from 'tslog';

/**
 * Scaffold module for OCPP 2.1 DER control support.
 *
 * This module is intentionally minimal and only wires configuration and lifecycle
 * so DER handlers can be added incrementally in follow-up slices.
 */
export class DerControlModule extends AbstractModule {
  _requests: CallAction[] = [];
  _responses: CallAction[] = [];

  constructor(
    config: BootstrapConfig & SystemConfig,
    cache: ICache,
    sender: IMessageSender,
    handler: IMessageHandler,
    logger?: Logger<ILogObj>,
    ocppValidator?: OCPPValidator,
  ) {
    super(config, cache, handler, sender, EventGroup.DerControl, logger, ocppValidator);

    this._requests = config.modules.dercontrol?.requests ?? [];
    this._responses = config.modules.dercontrol?.responses ?? [];
  }

  @AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.SetDERControl)
  protected async _handleSetDERControlResponse(
    message: IMessage<OCPP2_1.SetDERControlResponse>,
    props?: HandlerProperties,
  ): Promise<void> {
    this._logger.debug('SetDERControl response received:', message, props);
  }

  @AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.GetDERControl)
  protected async _handleGetDERControlResponse(
    message: IMessage<OCPP2_1.GetDERControlResponse>,
    props?: HandlerProperties,
  ): Promise<void> {
    this._logger.debug('GetDERControl response received:', message, props);
  }

  @AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.ClearDERControl)
  protected async _handleClearDERControlResponse(
    message: IMessage<OCPP2_1.ClearDERControlResponse>,
    props?: HandlerProperties,
  ): Promise<void> {
    this._logger.debug('ClearDERControl response received:', message, props);
  }
}
