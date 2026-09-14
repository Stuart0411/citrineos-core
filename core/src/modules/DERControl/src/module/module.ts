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
  IDeviceModelRepository,
  IOCPPMessageRepository,
  IStationDerCapabilityRepository,
} from '@dal/interfaces/repositories.js';
import {
  SequelizeDeviceModelRepository,
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
  protected _deviceModelRepository: IDeviceModelRepository;

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
    deviceModelRepository?: IDeviceModelRepository,
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
    this._deviceModelRepository =
      deviceModelRepository || new SequelizeDeviceModelRepository(config, logger);
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
      const inferredTypes = this._inferSupportedTypesFromDeviceModelSnapshot(
        capability?.deviceModelSnapshotJson as Record<string, unknown> | null | undefined,
      );
      const effectiveSupportedTypes = supportedTypes.length > 0 ? supportedTypes : inferredTypes;
      if (effectiveSupportedTypes.length === 0) {
        continue;
      }

      const supportedTypeSet = new Set(effectiveSupportedTypes.map((value) => value.toLowerCase()));
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

    if (this._isCallErrorPayload(message.payload)) {
      await this._persistGetDerControlFallback(message);
      return;
    }

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

  private _isCallErrorPayload(payload: unknown): payload is {
    name?: string;
    message?: string;
    _errorCode?: string;
    _errorDetails?: Record<string, unknown>;
  } {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return false;
    }

    const candidate = payload as Record<string, unknown>;
    return (
      typeof candidate._errorCode === 'string' ||
      candidate.name === 'OcppError' ||
      (typeof candidate.message === 'string' && typeof candidate._errorDetails === 'object')
    );
  }

  private async _persistGetDerControlFallback(
    message: IMessage<OCPP2_1.GetDERControlResponse>,
  ): Promise<void> {
    const tenantId = message.context.tenantId;
    const stationId = message.context.stationId;
    const now = new Date();

    const payload = message.payload as unknown as {
      message?: string;
      _errorCode?: string;
      _errorDetails?: Record<string, unknown>;
    };

    const request = message.context.correlationId
      ? await this._ocppMessageRepository.getRequestByCorrelationId(
          tenantId,
          message.context.correlationId,
        )
      : undefined;

    const requestPayload = request ? this._extractRequestPayload(request.message) : undefined;
    const requestId = typeof requestPayload?.requestId === 'number' ? requestPayload.requestId : -1;

    const existingCapability = await this._stationDerCapabilityRepository.readOnlyOneByQuery(
      tenantId,
      {
        where: {
          stationId,
        },
        order: [['updatedAt', 'DESC']],
        limit: 1,
      },
    );

    const existingSnapshot =
      existingCapability?.snapshotJson && typeof existingCapability.snapshotJson === 'object'
        ? (existingCapability.snapshotJson as Record<string, unknown>)
        : {};

    const existingFallback =
      existingSnapshot.fallback && typeof existingSnapshot.fallback === 'object'
        ? (existingSnapshot.fallback as Record<string, unknown>)
        : {};

    const previousTimeoutCount =
      typeof existingFallback.timeoutCount === 'number' ? existingFallback.timeoutCount : 0;

    const fallback = {
      derReadbackUnavailable: true,
      timeoutCount: previousTimeoutCount + 1,
      lastGetDerControlError: {
        at: now.toISOString(),
        correlationId: message.context.correlationId,
        errorCode: payload._errorCode ?? 'InternalError',
        errorDescription: payload.message ?? 'GetDERControl call error',
        errorDetails: payload._errorDetails ?? {},
      },
    };

    const supportedControlTypesJson = Array.isArray(existingCapability?.supportedControlTypesJson)
      ? existingCapability.supportedControlTypesJson
      : [];

    const deviceModelSnapshotJson =
      existingCapability?.deviceModelSnapshotJson &&
      typeof existingCapability.deviceModelSnapshotJson === 'object'
        ? (existingCapability.deviceModelSnapshotJson as Record<string, unknown>)
        : null;

    await this._derEventRepository.createEvent(tenantId, {
      stationId,
      eventType: 'get_der_control_call_error',
      controlId: null,
      payloadJson: {
        requestId,
        correlationId: message.context.correlationId,
        errorCode: payload._errorCode ?? 'InternalError',
        errorDescription: payload.message ?? 'GetDERControl call error',
        errorDetails: payload._errorDetails ?? {},
      },
      occurredAt: now,
    });

    await this._stationDerCapabilityRepository.upsertCapabilitySnapshot(tenantId, stationId, {
      supportedControlTypesJson,
      snapshotJson: {
        ...existingSnapshot,
        fallback,
      },
      requestId,
      tbc: false,
      deviceModelSnapshotJson,
    });
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
      await this._buildCapabilityState(
        message.context.tenantId,
        message.context.stationId,
        message.payload,
      ),
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

  private async _buildCapabilityState(
    tenantId: number,
    stationId: string,
    payload: OCPP2_1.ReportDERControlRequest,
  ): Promise<{
    supportedControlTypesJson: string[];
    snapshotJson: Record<string, unknown>;
    requestId: number;
    tbc: boolean;
    deviceModelSnapshotJson: Record<string, unknown> | null;
  }> {
    const snapshot = this._buildCapabilitySnapshotPayload(payload);
    const deviceModelSnapshotJson = await this._readDeviceModelSnapshot(tenantId, stationId);

    return {
      supportedControlTypesJson: snapshot.supportedControlTypes as string[],
      snapshotJson: {
        ...snapshot,
        rawReport: payload as unknown as Record<string, unknown>,
        inferredSupportedControlTypesFromDeviceModel:
          this._inferSupportedTypesFromDeviceModelSnapshot(deviceModelSnapshotJson),
      },
      requestId: payload.requestId,
      tbc: payload.tbc ?? false,
      deviceModelSnapshotJson,
    };
  }

  private async _readDeviceModelSnapshot(
    tenantId: number,
    stationId: string,
  ): Promise<Record<string, unknown> | null> {
    const rows = await this._deviceModelRepository.readAllByQuery(tenantId, {
      where: {
        stationId,
      },
      order: [['updatedAt', 'DESC']],
      limit: 50,
    });

    if (rows.length === 0) {
      return null;
    }

    return {
      sampledAttributeCount: rows.length,
      attributes: rows.map((row) => {
        const item = row as unknown as Record<string, unknown>;
        const variable = item.variable as Record<string, unknown> | undefined;
        const component = item.component as Record<string, unknown> | undefined;

        return {
          type: typeof item.type === 'string' ? item.type : null,
          dataType: typeof item.dataType === 'string' ? item.dataType : null,
          value: item.value ?? null,
          generatedAt: typeof item.generatedAt === 'string' ? item.generatedAt : null,
          variableId: typeof item.variableId === 'number' ? item.variableId : null,
          componentId: typeof item.componentId === 'number' ? item.componentId : null,
          evseDatabaseId: typeof item.evseDatabaseId === 'number' ? item.evseDatabaseId : null,
          variableName: typeof variable?.name === 'string' ? variable.name : null,
          variableInstance: typeof variable?.instance === 'string' ? variable.instance : null,
          componentName: typeof component?.name === 'string' ? component.name : null,
          componentInstance: typeof component?.instance === 'string' ? component.instance : null,
        };
      }),
    };
  }

  summarizeStationCapability(input: Record<string, unknown>): Record<string, unknown> {
    const supportedControlTypesJson = Array.isArray(input.supportedControlTypesJson)
      ? input.supportedControlTypesJson.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    const deviceModelSnapshotJson =
      input.deviceModelSnapshotJson && typeof input.deviceModelSnapshotJson === 'object'
        ? (input.deviceModelSnapshotJson as Record<string, unknown>)
        : null;

    return {
      stationId: input.stationId ?? null,
      transactionCountHint: null,
      requestId: input.requestId ?? null,
      updatedAt: input.updatedAt ?? null,
      reportedSupportedControlTypes: supportedControlTypesJson,
      inferredSupportedControlTypes:
        this._inferSupportedTypesFromDeviceModelSnapshot(deviceModelSnapshotJson),
      hasDeviceModelSnapshot: deviceModelSnapshotJson !== null,
      deviceModelAttributeCount:
        typeof deviceModelSnapshotJson?.sampledAttributeCount === 'number'
          ? deviceModelSnapshotJson.sampledAttributeCount
          : 0,
      derReadbackUnavailable:
        !!(
          input.snapshotJson &&
          typeof input.snapshotJson === 'object' &&
          (input.snapshotJson as Record<string, unknown>).fallback &&
          typeof (input.snapshotJson as Record<string, unknown>).fallback === 'object' &&
          ((input.snapshotJson as Record<string, unknown>).fallback as Record<string, unknown>)
            .derReadbackUnavailable === true
        ),
      derReadbackTimeoutCount:
        input.snapshotJson &&
        typeof input.snapshotJson === 'object' &&
        (input.snapshotJson as Record<string, unknown>).fallback &&
        typeof (input.snapshotJson as Record<string, unknown>).fallback === 'object' &&
        typeof ((input.snapshotJson as Record<string, unknown>).fallback as Record<string, unknown>)
          .timeoutCount === 'number'
          ? (((input.snapshotJson as Record<string, unknown>).fallback as Record<string, unknown>)
              .timeoutCount as number)
          : 0,
    };
  }

  private _inferSupportedTypesFromDeviceModelSnapshot(
    snapshot: Record<string, unknown> | null | undefined,
  ): string[] {
    const attributes = Array.isArray(snapshot?.attributes)
      ? (snapshot.attributes as Array<Record<string, unknown>>)
      : [];
    if (attributes.length === 0) {
      return [];
    }

    const mapping: Array<[string, RegExp[]]> = [
      ['Curve', [/curve/i, /voltvar/i, /voltwatt/i, /freqwatt/i, /wattvar/i, /wattpf/i]],
      ['EnterService', [/enter.?service/i]],
      ['FixedPFAbsorb', [/fixed.?pf.?absorb/i, /pf.?absorb/i]],
      ['FixedPFInject', [/fixed.?pf.?inject/i, /pf.?inject/i]],
      ['FixedVar', [/fixed.?var/i]],
      ['FreqDroop', [/freq.?droop/i]],
      ['Gradients', [/gradient/i, /ramp/i]],
      ['LimitMaxDischarge', [/limit.?max.?discharge/i, /max.?discharge/i]],
    ];

    const haystack = attributes
      .flatMap((attribute) => [
        attribute.variableName,
        attribute.variableInstance,
        attribute.componentName,
        attribute.componentInstance,
        attribute.value,
      ])
      .filter((value): value is string => typeof value === 'string')
      .join(' ');

    const inferredTypes = mapping
      .filter(([, patterns]) => patterns.some((pattern) => pattern.test(haystack)))
      .map(([controlType]) => controlType);

    return Array.from(new Set(inferredTypes));
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
