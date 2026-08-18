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
  BadRequestError,
  EventGroup,
  OCPP_CallAction,
  OCPPValidator,
  OCPPVersion,
} from '@citrineos/base';
import type {
  IDerControlRepository,
  IDerEventRepository,
  IOCPPMessageRepository,
  IStationDerCapabilityRepository,
} from '@dal/interfaces/repositories.js';
import {
  SequelizeDerControlRepository,
  SequelizeDerEventRepository,
  SequelizeOCPPMessageRepository,
  SequelizeStationDerCapabilityRepository,
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
  private static readonly DEFAULT_SUPPORTED_CONTROL_TYPES: string[] = [
    'Curve',
    'EnterService',
    'FixedPFAbsorb',
    'FixedPFInject',
    'FixedVar',
    'FreqDroop',
    'Gradients',
    'LimitMaxDischarge',
  ];

  _requests: CallAction[] = [];
  _responses: CallAction[] = [];
  protected _derControlRepository: IDerControlRepository;
  protected _derEventRepository: IDerEventRepository;
  protected _ocppMessageRepository: IOCPPMessageRepository;
  protected _stationDerCapabilityRepository: IStationDerCapabilityRepository;

  constructor(
    config: BootstrapConfig & SystemConfig,
    cache: ICache,
    sender: IMessageSender,
    handler: IMessageHandler,
    logger?: Logger<ILogObj>,
    ocppValidator?: OCPPValidator,
    derControlRepository?: IDerControlRepository,
    derEventRepository?: IDerEventRepository,
    ocppMessageRepository?: IOCPPMessageRepository,
    stationDerCapabilityRepository?: IStationDerCapabilityRepository,
  ) {
    super(config, cache, handler, sender, EventGroup.DerControl, logger, ocppValidator);

    this._requests = config.modules.dercontrol?.requests ?? [];
    this._responses = config.modules.dercontrol?.responses ?? [];
    this._derControlRepository =
      derControlRepository || new SequelizeDerControlRepository(config, logger);
    this._derEventRepository =
      derEventRepository || new SequelizeDerEventRepository(config, logger);
    this._ocppMessageRepository =
      ocppMessageRepository || new SequelizeOCPPMessageRepository(config, logger);
    this._stationDerCapabilityRepository =
      stationDerCapabilityRepository || new SequelizeStationDerCapabilityRepository(config, logger);
  }

  get derControlRepository(): IDerControlRepository {
    return this._derControlRepository;
  }

  get derEventRepository(): IDerEventRepository {
    return this._derEventRepository;
  }

  get stationDerCapabilityRepository(): IStationDerCapabilityRepository {
    return this._stationDerCapabilityRepository;
  }

  validateSetDERControlRequest(request: OCPP2_1.SetDERControlRequest): void {
    const policy = this.config.modules.dercontrol?.policy;
    const enforceSupportedControlTypes = policy?.enforceSupportedControlTypes ?? false;
    if (!enforceSupportedControlTypes) {
      return;
    }

    const supportedTypes = new Set(
      (policy?.supportedControlTypes ?? DerControlModule.DEFAULT_SUPPORTED_CONTROL_TYPES).map(
        (value: string) => value.toLowerCase(),
      ),
    );

    const requestedTypes = this._collectRequestedControlTypesFromSet(request);
    const unsupportedTypes = requestedTypes.filter(
      (controlType) => !supportedTypes.has(controlType.toLowerCase()),
    );
    if (unsupportedTypes.length > 0) {
      throw new BadRequestError(
        `Unsupported DER control type(s) requested: ${unsupportedTypes.join(', ')}`,
      );
    }
  }

  async validateOutboundSetDERControlRequest(
    stationIds: string[],
    request: OCPP2_1.SetDERControlRequest,
    tenantId: number,
  ): Promise<void> {
    this.validateSetDERControlRequest(request);

    const requestedTypes = this._collectRequestedControlTypesFromSet(request);
    if (requestedTypes.length === 0) {
      return;
    }

    for (const stationId of stationIds) {
      const capability = await this._stationDerCapabilityRepository.readOnlyOneByQuery(tenantId, {
        where: {
          stationId,
        },
        order: [['updatedAt', 'DESC']],
        limit: 1,
      });

      const supportedTypes = Array.isArray(capability?.supportedControlTypesJson)
        ? capability.supportedControlTypesJson
        : [];
      if (supportedTypes.length === 0) {
        continue;
      }

      const supportedTypeSet = new Set(supportedTypes.map((value) => value.toLowerCase()));
      const unsupportedTypes = requestedTypes.filter(
        (controlType) => !supportedTypeSet.has(controlType.toLowerCase()),
      );
      if (unsupportedTypes.length > 0) {
        throw new BadRequestError(
          `Station ${stationId} does not report support for DER control type(s): ${unsupportedTypes.join(', ')}`,
        );
      }
    }
  }
  validateClearDERControlRequest(request: OCPP2_1.ClearDERControlRequest): void {
    const requireSelector =
      this.config.modules.dercontrol?.policy?.requireExplicitControlSelectorOnClear ?? true;
    if (requireSelector && !request.controlId && !request.controlType) {
      throw new BadRequestError('ClearDERControl requires controlId or controlType');
    }
  }

  @AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.SetDERControl)
  protected async _handleSetDERControlResponse(
    message: IMessage<OCPP2_1.SetDERControlResponse>,
    props?: HandlerProperties,
  ): Promise<void> {
    this._logger.debug('SetDERControl response received:', message, props);

    await this._persistResponseEvent(message.context.tenantId, message.context.stationId, {
      eventType: 'set_der_control_response',
      payload: message.payload as unknown as Record<string, unknown>,
    });

    await this._reconcileResponseStatus(
      message.context.tenantId,
      message.context.stationId,
      message.context.correlationId,
      OCPP_CallAction.SetDERControl,
      message.payload as unknown as Record<string, unknown>,
    );
  }

  @AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.GetDERControl)
  protected async _handleGetDERControlResponse(
    message: IMessage<OCPP2_1.GetDERControlResponse>,
    props?: HandlerProperties,
  ): Promise<void> {
    this._logger.debug('GetDERControl response received:', message, props);

    await this._persistResponseEvent(message.context.tenantId, message.context.stationId, {
      eventType: 'get_der_control_response',
      payload: message.payload as unknown as Record<string, unknown>,
    });

    await this._reconcileResponseStatus(
      message.context.tenantId,
      message.context.stationId,
      message.context.correlationId,
      OCPP_CallAction.GetDERControl,
      message.payload as unknown as Record<string, unknown>,
    );
  }

  @AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.ClearDERControl)
  protected async _handleClearDERControlResponse(
    message: IMessage<OCPP2_1.ClearDERControlResponse>,
    props?: HandlerProperties,
  ): Promise<void> {
    this._logger.debug('ClearDERControl response received:', message, props);

    await this._persistResponseEvent(message.context.tenantId, message.context.stationId, {
      eventType: 'clear_der_control_response',
      payload: message.payload as unknown as Record<string, unknown>,
    });

    await this._reconcileResponseStatus(
      message.context.tenantId,
      message.context.stationId,
      message.context.correlationId,
      OCPP_CallAction.ClearDERControl,
      message.payload as unknown as Record<string, unknown>,
    );
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

    await this._derEventRepository.createEvent(message.context.tenantId, {
      stationId: message.context.stationId,
      eventType: 'report_der_capability_snapshot',
      controlId: null,
      payloadJson: this._buildCapabilitySnapshotPayload(message.payload),
      occurredAt: new Date(),
    });

    await this._stationDerCapabilityRepository.upsertCapabilitySnapshot(
      message.context.tenantId,
      message.context.stationId,
      this._buildCapabilityState(message.payload),
    );

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

  private async _persistResponseEvent(
    tenantId: number,
    stationId: string,
    value: {
      eventType: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await this._derEventRepository.createEvent(tenantId, {
      stationId,
      eventType: value.eventType,
      controlId: null,
      payloadJson: value.payload,
      occurredAt: new Date(),
    });
  }

  private async _reconcileResponseStatus(
    tenantId: number,
    stationId: string,
    correlationId: string | undefined,
    action: OCPP_CallAction,
    responsePayload: Record<string, unknown>,
  ): Promise<void> {
    if (!correlationId) {
      return;
    }

    const request = await this._ocppMessageRepository.getRequestByCorrelationId(
      tenantId,
      correlationId,
    );
    if (!request) {
      return;
    }

    const requestPayload = this._extractRequestPayload(request.message);
    const controlId =
      requestPayload && typeof requestPayload.controlId === 'string'
        ? requestPayload.controlId
        : undefined;

    const status = this._mapResponseStatus(action, responsePayload.status);
    if (!status) {
      return;
    }

    if (controlId) {
      await this._derControlRepository.updateStatusByControlId(
        tenantId,
        stationId,
        controlId,
        status,
      );
    } else if (action === OCPP_CallAction.ClearDERControl && status === 'cleared') {
      await this._reconcileClearBySelection(tenantId, stationId, requestPayload);
    }

    if (
      action === OCPP_CallAction.SetDERControl &&
      !!controlId &&
      status === 'accepted' &&
      Array.isArray(responsePayload.supersededIds)
    ) {
      const supersededIds = responsePayload.supersededIds.filter(
        (value): value is string => typeof value === 'string',
      );
      if (supersededIds.length > 0) {
        await this._derControlRepository.markSupersededByControlId(
          tenantId,
          stationId,
          supersededIds,
          controlId,
        );
      }
    }
  }

  private async _reconcileClearBySelection(
    tenantId: number,
    stationId: string,
    requestPayload: Record<string, unknown> | undefined,
  ): Promise<void> {
    if (!requestPayload) {
      return;
    }

    const controlType =
      typeof requestPayload.controlType === 'string' ? requestPayload.controlType : undefined;
    const isDefault =
      typeof requestPayload.isDefault === 'boolean' ? requestPayload.isDefault : undefined;

    await this._derControlRepository.updateStatusByControlSelection(
      tenantId,
      stationId,
      'cleared',
      {
        controlType,
        isDefault,
      },
    );
  }

  private _extractRequestPayload(rawMessage: unknown): Record<string, unknown> | undefined {
    if (Array.isArray(rawMessage) && rawMessage.length >= 4) {
      const payload = rawMessage[3];
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        return payload as Record<string, unknown>;
      }
    }

    if (rawMessage && typeof rawMessage === 'object' && !Array.isArray(rawMessage)) {
      const payload = (rawMessage as Record<string, unknown>).payload;
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        return payload as Record<string, unknown>;
      }
    }

    return undefined;
  }

  private _mapResponseStatus(action: OCPP_CallAction, rawStatus: unknown): string | undefined {
    if (typeof rawStatus !== 'string') {
      return undefined;
    }

    const normalized = rawStatus.toLowerCase();
    if (action === OCPP_CallAction.ClearDERControl && normalized === 'accepted') {
      return 'cleared';
    }
    return normalized;
  }

  private _collectRequestedControlTypesFromSet(request: OCPP2_1.SetDERControlRequest): string[] {
    if (typeof request.controlType === 'string' && request.controlType.length > 0) {
      return [request.controlType];
    }

    const fallbackTypeByKey: Record<string, string> = {
      curve: 'Curve',
      enterService: 'EnterService',
      fixedPFAbsorb: 'FixedPFAbsorb',
      fixedPFInject: 'FixedPFInject',
      fixedVar: 'FixedVar',
      freqDroop: 'FreqDroop',
      gradient: 'Gradients',
      limitMaxDischarge: 'LimitMaxDischarge',
    };

    const requestShape = request as unknown as Record<string, unknown>;
    for (const [key, fallbackType] of Object.entries(fallbackTypeByKey)) {
      if (requestShape[key] !== undefined && requestShape[key] !== null) {
        return [fallbackType];
      }
    }

    return [];
  }

  private _buildCapabilitySnapshotPayload(
    payload: OCPP2_1.ReportDERControlRequest,
  ): Record<string, unknown> {
    const controls = this._flattenReportControls(payload);
    const supportedControlTypes = Array.from(
      new Set(controls.map((control) => control.controlType)),
    );

    return {
      requestId: payload.requestId,
      tbc: payload.tbc ?? false,
      supportedControlTypes,
      supportedControlCount: supportedControlTypes.length,
      recordedControlCount: controls.length,
    };
  }

  private _buildCapabilityState(payload: OCPP2_1.ReportDERControlRequest): {
    supportedControlTypesJson: string[];
    snapshotJson: Record<string, unknown>;
    requestId: number;
    tbc: boolean;
    deviceModelSnapshotJson: null;
  } {
    const snapshot = this._buildCapabilitySnapshotPayload(payload);

    return {
      supportedControlTypesJson: snapshot.supportedControlTypes as string[],
      snapshotJson: {
        ...snapshot,
        rawReport: payload as unknown as Record<string, unknown>,
      },
      requestId: payload.requestId,
      tbc: payload.tbc ?? false,
      deviceModelSnapshotJson: null,
    };
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
