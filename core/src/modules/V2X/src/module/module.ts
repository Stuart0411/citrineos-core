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
import type { IStationEnergyTransferPolicyRepository } from '@dal/interfaces/repositories.js';
import { SequelizeStationEnergyTransferPolicyRepository } from '@dal/layers/sequelize/index.js';
import type { ILogObj } from 'tslog';
import { Logger } from 'tslog';

export class V2XModule extends AbstractModule {
  _requests: CallAction[] = [];
  _responses: CallAction[] = [];
  protected _stationEnergyTransferPolicyRepository: IStationEnergyTransferPolicyRepository;

  constructor(
    config: BootstrapConfig & SystemConfig,
    cache: ICache,
    sender: IMessageSender,
    handler: IMessageHandler,
    logger?: Logger<ILogObj>,
    ocppValidator?: OCPPValidator,
    stationEnergyTransferPolicyRepository?: IStationEnergyTransferPolicyRepository,
  ) {
    super(config, cache, handler, sender, EventGroup.V2x, logger, ocppValidator);

    this._requests = config.modules.v2x?.requests ?? [];
    this._responses = config.modules.v2x?.responses ?? [];
    this._stationEnergyTransferPolicyRepository =
      stationEnergyTransferPolicyRepository ||
      new SequelizeStationEnergyTransferPolicyRepository(config, logger);
  }

  get stationEnergyTransferPolicyRepository(): IStationEnergyTransferPolicyRepository {
    return this._stationEnergyTransferPolicyRepository;
  }

  @AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.NotifyAllowedEnergyTransfer)
  protected async _handleNotifyAllowedEnergyTransferRequest(
    message: IMessage<OCPP2_1.NotifyAllowedEnergyTransferRequest>,
    props?: HandlerProperties,
  ): Promise<void> {
    this._logger.debug('NotifyAllowedEnergyTransfer request received:', message, props);

    const allowedModes = message.payload.allowedEnergyTransfer.map((value) => String(value));

    await this._stationEnergyTransferPolicyRepository.upsertAllowedEnergyTransfer(
      message.context.tenantId,
      message.context.stationId,
      {
        transactionId: message.payload.transactionId,
        allowedModesJson: allowedModes,
        exportEnabled: this._isExportEnabled(allowedModes),
        dischargeLimitW: null,
      },
    );

    await this.sendCallResultWithMessage(message, {
      status: 'Accepted',
    } as OCPP2_1.NotifyAllowedEnergyTransferResponse);
  }

  private _isExportEnabled(allowedModes: string[]): boolean {
    return allowedModes.some((mode) => mode.includes('BPT'));
  }
}
