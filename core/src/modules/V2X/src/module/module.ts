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
  private static readonly DIAGNOSTIC_TRANSACTION_ID = '__diag_afrrsignal__';

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

  @AsHandler([OCPPVersion.OCPP2_1], OCPP_CallAction.AFRRSignal)
  protected async _handleAfrrSignalResponse(
    message: IMessage<OCPP2_1.AFRRSignalResponse>,
    props?: HandlerProperties,
  ): Promise<void> {
    this._logger.debug('AFRRSignal response received:', message, props);

    if (this._isCallErrorPayload(message.payload)) {
      await this._persistAfrrSignalCallError(message);
    }
  }

  private _isCallErrorPayload(payload: unknown): payload is {
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

  private async _persistAfrrSignalCallError(message: IMessage<OCPP2_1.AFRRSignalResponse>) {
    const payload = message.payload as unknown as {
      message?: string;
      _errorCode?: string;
      _errorDetails?: Record<string, unknown>;
    };

    const existingDiagnosticRow =
      await this._stationEnergyTransferPolicyRepository.readOnlyOneByQuery(
        message.context.tenantId,
        {
          where: {
            stationId: message.context.stationId,
            transactionId: V2XModule.DIAGNOSTIC_TRANSACTION_ID,
          },
          order: [['updatedAt', 'DESC']],
          limit: 1,
        },
      );

    const priorTimeoutCount =
      typeof existingDiagnosticRow?.dischargeLimitW === 'number'
        ? existingDiagnosticRow.dischargeLimitW
        : 0;

    const errorCode = payload._errorCode ?? 'InternalError';
    const errorDescription = payload.message ?? 'AFRRSignal call error';

    await this._stationEnergyTransferPolicyRepository.upsertAllowedEnergyTransfer(
      message.context.tenantId,
      message.context.stationId,
      {
        transactionId: V2XModule.DIAGNOSTIC_TRANSACTION_ID,
        allowedModesJson: [
          '__diag__',
          'afrr_signal_call_error',
          `error_code:${errorCode}`,
          `error_message:${errorDescription}`,
          `correlation_id:${message.context.correlationId}`,
        ],
        exportEnabled: false,
        dischargeLimitW: priorTimeoutCount + 1,
      },
    );
  }

  private _isExportEnabled(allowedModes: string[]): boolean {
    return allowedModes.some((mode) => mode.includes('BPT'));
  }

  summarizeStationCapabilities(
    rows: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>> {
    const byStation = new Map<string, Array<Record<string, unknown>>>();

    for (const row of rows) {
      const stationId = typeof row.stationId === 'string' ? row.stationId : '';
      if (!stationId) {
        continue;
      }

      const stationRows = byStation.get(stationId) ?? [];
      stationRows.push(row);
      byStation.set(stationId, stationRows);
    }

    const summaries: Array<Record<string, unknown>> = [];
    for (const [stationId, stationRows] of byStation.entries()) {
      const sortedRows = [...stationRows].sort((left, right) =>
        this._compareDateDesc(left.updatedAt, right.updatedAt),
      );

      const diagnosticRow = sortedRows.find(
        (row) => row.transactionId === V2XModule.DIAGNOSTIC_TRANSACTION_ID,
      );
      const latestPolicyRow = sortedRows.find(
        (row) => row.transactionId !== V2XModule.DIAGNOSTIC_TRANSACTION_ID,
      );

      const diagnosticTags = Array.isArray(diagnosticRow?.allowedModesJson)
        ? (diagnosticRow.allowedModesJson as string[])
        : [];

      const timeoutCount =
        typeof diagnosticRow?.dischargeLimitW === 'number' ? diagnosticRow.dischargeLimitW : 0;

      summaries.push({
        stationId,
        lastUpdatedAt:
          (typeof sortedRows[0]?.updatedAt === 'string' && sortedRows[0].updatedAt) ||
          (sortedRows[0]?.updatedAt instanceof Date && sortedRows[0].updatedAt.toISOString()) ||
          null,
        activeTransactionId:
          (typeof latestPolicyRow?.transactionId === 'string' && latestPolicyRow.transactionId) ||
          null,
        allowedEnergyTransfer:
          (Array.isArray(latestPolicyRow?.allowedModesJson) && latestPolicyRow.allowedModesJson) ||
          [],
        exportEnabled:
          (typeof latestPolicyRow?.exportEnabled === 'boolean' && latestPolicyRow.exportEnabled) ||
          false,
        dischargeLimitW:
          typeof latestPolicyRow?.dischargeLimitW === 'number'
            ? latestPolicyRow.dischargeLimitW
            : null,
        afrrSignalDispatchUnavailable: Boolean(diagnosticRow),
        afrrSignalTimeoutCount: timeoutCount,
        lastAfrrSignalError: diagnosticRow
          ? {
              at:
                (typeof diagnosticRow.updatedAt === 'string' && diagnosticRow.updatedAt) ||
                (diagnosticRow.updatedAt instanceof Date &&
                  diagnosticRow.updatedAt.toISOString()) ||
                null,
              errorCode: this._extractDiagnosticTagValue(diagnosticTags, 'error_code:'),
              errorDescription: this._extractDiagnosticTagValue(diagnosticTags, 'error_message:'),
              correlationId: this._extractDiagnosticTagValue(diagnosticTags, 'correlation_id:'),
            }
          : null,
      });
    }

    return summaries.sort((left, right) =>
      this._compareDateDesc(left.lastUpdatedAt, right.lastUpdatedAt),
    );
  }

  private _extractDiagnosticTagValue(tags: string[], prefix: string): string | null {
    const tag = tags.find((value) => value.startsWith(prefix));
    if (!tag) {
      return null;
    }

    return tag.slice(prefix.length) || null;
  }

  private _compareDateDesc(leftValue: unknown, rightValue: unknown): number {
    const leftTime = this._coerceTime(leftValue);
    const rightTime = this._coerceTime(rightValue);
    return rightTime - leftTime;
  }

  private _coerceTime(value: unknown): number {
    if (value instanceof Date) {
      return value.getTime();
    }
    if (typeof value === 'string') {
      const time = Date.parse(value);
      return Number.isFinite(time) ? time : 0;
    }

    return 0;
  }
}
