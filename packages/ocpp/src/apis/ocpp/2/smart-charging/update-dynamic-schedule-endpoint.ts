// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import {
  type AbstractMessageEndpointDependencies,
  AbstractMessageEndpoint,
  DEFAULT_TENANT_ID,
  type IMessageConfirmation,
  type IMessageEndpointMetadata,
  type IOcppSender,
  type MessageDelivery,
} from '@citrineos/base';
import {
  EventGroup,
  OCPP_CallAction,
  type OCPP2_request_types,
  type OCPPVersion,
} from '@citrineos/types';
import { OCPP2_PROTOCOLS, ocpp2Schema } from '../schemas.js';

interface Dependencies extends AbstractMessageEndpointDependencies {
  ocppSender: IOcppSender;
}

export class UpdateDynamicScheduleEndpoint extends AbstractMessageEndpoint {
  static readonly route: IMessageEndpointMetadata = {
    action: OCPP_CallAction.UpdateDynamicSchedule,
    protocols: OCPP2_PROTOCOLS,
    eventGroup: EventGroup.SmartCharging,
    bodySchema: ocpp2Schema('UpdateDynamicScheduleRequestSchema'),
  };

  private readonly _ocppSender: IOcppSender;

  constructor({ logger, ocppSender }: Dependencies) {
    super(logger);
    this._ocppSender = ocppSender;
  }

  async handle(
    identifiers: string[],
    request: OCPP2_request_types.UpdateDynamicScheduleRequest,
    delivery: MessageDelivery,
    tenantId: number = DEFAULT_TENANT_ID,
    version: OCPPVersion,
  ): Promise<IMessageConfirmation[]> {
    return Promise.all(
      identifiers.map((ocppConnectionName) =>
        this._ocppSender.sendCall({
          ocppConnectionName,
          tenantId,
          protocol: version,
          action: OCPP_CallAction.UpdateDynamicSchedule,
          eventGroup: EventGroup.SmartCharging,
          payload: request,
          ...delivery,
        }),
      ),
    );
  }
}
