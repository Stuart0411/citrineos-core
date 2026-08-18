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
import type { IDerControlRepository, IDerEventRepository } from '@dal/interfaces/repositories.js';
import {
  SequelizeDerControlRepository,
  SequelizeDerEventRepository,
} from '@dal/layers/sequelize/index.js';
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
  protected _derControlRepository: IDerControlRepository;
  protected _derEventRepository: IDerEventRepository;

  constructor(
    config: BootstrapConfig & SystemConfig,
    cache: ICache,
    sender: IMessageSender,
    handler: IMessageHandler,
    logger?: Logger<ILogObj>,
    ocppValidator?: OCPPValidator,
    derControlRepository?: IDerControlRepository,
    derEventRepository?: IDerEventRepository,
  ) {
    super(config, cache, handler, sender, EventGroup.DerControl, logger, ocppValidator);

    this._requests = config.modules.dercontrol?.requests ?? [];
    this._responses = config.modules.dercontrol?.responses ?? [];
    this._derControlRepository =
      derControlRepository || new SequelizeDerControlRepository(config, logger);
    this._derEventRepository =
      derEventRepository || new SequelizeDerEventRepository(config, logger);
  }

  get derControlRepository(): IDerControlRepository {
    return this._derControlRepository;
  }

  get derEventRepository(): IDerEventRepository {
    return this._derEventRepository;
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

  @AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.ReportDERControl)
  protected async _handleReportDERControlRequest(
    message: IMessage<OCPP2_1.ReportDERControlRequest>,
    props?: HandlerProperties,
  ): Promise<void> {
    this._logger.debug('ReportDERControl request received:', message, props);

    const controls = this._flattenReportControls(message.payload);
    for (const control of controls) {
      await this._derControlRepository.upsertFromReport(
        message.context.tenantId,
        message.context.stationId,
        control,
      );
    }

    await this.sendCallResultWithMessage(message, {} as OCPP2_1.ReportDERControlResponse);
  }

  @AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.NotifyDERAlarm)
  protected async _handleNotifyDERAlarmRequest(
    message: IMessage<OCPP2_1.NotifyDERAlarmRequest>,
    props?: HandlerProperties,
  ): Promise<void> {
    this._logger.debug('NotifyDERAlarm request received:', message, props);

    await this._derEventRepository.createEvent(message.context.tenantId, {
      stationId: message.context.stationId,
      eventType: 'notify_der_alarm',
      controlId: null,
      payloadJson: message.payload as unknown as Record<string, unknown>,
      occurredAt: this._coerceDate(message.payload.timestamp),
    });

    await this.sendCallResultWithMessage(message, {} as OCPP2_1.NotifyDERAlarmResponse);
  }

  @AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.NotifyDERStartStop)
  protected async _handleNotifyDERStartStopRequest(
    message: IMessage<OCPP2_1.NotifyDERStartStopRequest>,
    props?: HandlerProperties,
  ): Promise<void> {
    this._logger.debug('NotifyDERStartStop request received:', message, props);

    await this._derEventRepository.createEvent(message.context.tenantId, {
      stationId: message.context.stationId,
      eventType: message.payload.started ? 'notify_der_start' : 'notify_der_stop',
      controlId: message.payload.controlId,
      payloadJson: message.payload as unknown as Record<string, unknown>,
      occurredAt: this._coerceDate(message.payload.timestamp),
    });

    await this._derControlRepository.updateStartStopState(
      message.context.tenantId,
      message.context.stationId,
      message.payload.controlId,
      message.payload.started,
    );

    if (message.payload.started && message.payload.supersededIds?.length) {
      await this._derControlRepository.markSupersededByControlId(
        message.context.tenantId,
        message.context.stationId,
        message.payload.supersededIds,
        message.payload.controlId,
      );
    }

    await this.sendCallResultWithMessage(message, {} as OCPP2_1.NotifyDERStartStopResponse);
  }

  private _coerceDate(isoLike: string): Date {
    const parsed = new Date(isoLike);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private _flattenReportControls(payload: OCPP2_1.ReportDERControlRequest): Array<{
    controlId: string;
    controlType: string;
    isDefault: boolean;
    isSuperseded: boolean;
    priority: number | null;
    payloadJson: Record<string, unknown>;
    startTime: Date | null;
    durationSeconds: number | null;
    status: string | null;
    supersededByControlId: string | null;
  }> {
    const groups: Array<[string, unknown[] | null | undefined]> = [
      ['Curve', payload.curve as unknown[] | null | undefined],
      ['EnterService', payload.enterService as unknown[] | null | undefined],
      ['FixedPFAbsorb', payload.fixedPFAbsorb as unknown[] | null | undefined],
      ['FixedPFInject', payload.fixedPFInject as unknown[] | null | undefined],
      ['FixedVar', payload.fixedVar as unknown[] | null | undefined],
      ['FreqDroop', payload.freqDroop as unknown[] | null | undefined],
      ['Gradients', payload.gradient as unknown[] | null | undefined],
      ['LimitMaxDischarge', payload.limitMaxDischarge as unknown[] | null | undefined],
    ];

    const controls: Array<{
      controlId: string;
      controlType: string;
      isDefault: boolean;
      isSuperseded: boolean;
      priority: number | null;
      payloadJson: Record<string, unknown>;
      startTime: Date | null;
      durationSeconds: number | null;
      status: string | null;
      supersededByControlId: string | null;
    }> = [];

    for (const [fallbackType, rows] of groups) {
      for (const row of rows ?? []) {
        const item = row as Record<string, unknown>;
        const inner = Object.values(item).find(
          (candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate),
        ) as Record<string, unknown> | undefined;

        const controlType = (item.controlType as string | undefined) ?? fallbackType;
        const priority = typeof inner?.priority === 'number' ? inner.priority : null;
        const durationSeconds = typeof inner?.duration === 'number' ? inner.duration : null;
        const startTime =
          typeof inner?.startTime === 'string' ? this._coerceDate(inner.startTime) : null;

        controls.push({
          controlId: String(item.id ?? ''),
          controlType,
          isDefault: Boolean(item.isDefault),
          isSuperseded: Boolean(item.isSuperseded),
          priority,
          payloadJson: item,
          startTime,
          durationSeconds,
          status: null,
          supersededByControlId: null,
        });
      }
    }

    return controls.filter((entry) => entry.controlId.length > 0);
  }
}
