// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import {
  DEFAULT_TENANT_ID,
  EmsSiteIntentSchema,
  type EmsSiteIntentCreate,
  type EmsIntakeEventReasonCode,
  type SystemConfig,
} from '@citrineos/base';
import type {
  IEmsDecisionRepository,
  IEmsSiteIntentRepository,
} from '@dal/interfaces/repositories.js';
import { randomUUID } from 'node:crypto';
import { UniqueConstraintError } from 'sequelize';
import { connect, type IClientOptions, type MqttClient } from 'mqtt';
import type { ILogObj } from 'tslog';
import { Logger } from 'tslog';
import { validateEmsIntentPolicy } from './IntentValidation.js';
import { mapEmsIntakeErrorToReason, mapEmsIntakeErrorToReasonCode } from './IntakeEventReason.js';

type ConnectFn = (brokerUrl: string, options?: IClientOptions) => MqttClient;

type IntakeEventPayload = {
  status: 'accepted' | 'rejected';
  reasonCode: EmsIntakeEventReasonCode;
  reason: string;
  receivedTopic: string;
  receivedAt: string;
  messageId?: string;
  siteId?: string;
  tenantId?: number;
};

export class EmsMqttBridge {
  private client?: MqttClient;
  private started = false;

  constructor(
    private readonly config: SystemConfig,
    private readonly emsSiteIntentRepository: IEmsSiteIntentRepository,
    private readonly logger: Logger<ILogObj>,
    private readonly connectFn: ConnectFn = connect,
    private readonly emsDecisionRepository?: IEmsDecisionRepository,
    private readonly onIntentStored?: (tenantId: number, siteId: string) => void,
  ) {}

  async start(): Promise<void> {
    if (this.started) {
      this.logger.info('EMS MQTT bridge already started.');
      return;
    }

    const mqttConfig = this.config.modules.ems?.mqtt;
    if (!mqttConfig?.enabled) {
      this.logger.info('EMS MQTT bridge disabled by configuration.');
      return;
    }

    if (!mqttConfig.brokerUrl) {
      await this.handleStartupFailure(new Error('EMS MQTT brokerUrl is not configured.'));
      return;
    }

    const clientId = mqttConfig.clientId || `citrine-ems-${process.pid}`;
    const topic = mqttConfig.siteIntentsTopic || 'citrine/ems/site/+/intent/current';
    const connectTimeoutMs = mqttConfig.connectTimeoutMs ?? 5000;

    this.client = this.connectFn(mqttConfig.brokerUrl, {
      clientId,
      username: mqttConfig.username,
      password: mqttConfig.password,
      connectTimeout: connectTimeoutMs,
      reconnectPeriod: 5000,
    });

    this.client.on('message', (receivedTopic, payload) => {
      void this.handleMessage(receivedTopic, payload);
    });
    this.client.on('error', (error) => {
      this.logger.warn(`EMS MQTT bridge error: ${error.message}`);
    });
    this.client.on('close', () => {
      this.logger.warn('EMS MQTT bridge connection closed.');
    });

    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;

        const timer = setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          reject(new Error(`EMS MQTT connection timed out after ${connectTimeoutMs}ms.`));
        }, connectTimeoutMs);

        const cleanup = () => {
          clearTimeout(timer);
          this.client?.off('connect', onConnect);
          this.client?.off('error', onError);
        };

        const onConnect = () => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          resolve();
        };

        const onError = (error: Error) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          reject(error);
        };

        this.client?.once('connect', onConnect);
        this.client?.once('error', onError);
      });

      await new Promise<void>((resolve, reject) => {
        this.client?.subscribe(topic, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });

      this.started = true;
      this.logger.info(`EMS MQTT bridge subscribed to ${topic}`);
    } catch (error) {
      await this.handleStartupFailure(error);
    }
  }

  async shutdown(): Promise<void> {
    if (!this.client) {
      this.started = false;
      return;
    }

    await new Promise<void>((resolve) => {
      this.client?.end(true, {}, () => resolve());
    });

    this.client = undefined;
    this.started = false;
  }

  isStarted(): boolean {
    return this.started;
  }

  isEnabled(): boolean {
    return this.config.modules.ems?.mqtt?.enabled ?? false;
  }

  private async handleMessage(topic: string, payload: Buffer): Promise<void> {
    const receivedAt = new Date().toISOString();
    const fallbackSiteId = this.extractSiteIdFromTopic(topic);

    try {
      const parsed = JSON.parse(payload.toString('utf8'));
      const intent = this.normalizeIncomingIntent(parsed, fallbackSiteId, receivedAt);
      const tenantId = intent.tenantId ?? DEFAULT_TENANT_ID;
      validateEmsIntentPolicy(this.config, {
        ...intent,
        tenantId,
      });
      await this.emsSiteIntentRepository.createSiteIntent(tenantId, {
        ...intent,
        tenantId,
      });
      this.logger.info(`Stored EMS site intent ${intent.messageId} from topic ${topic}`);
      const intakeEvent: IntakeEventPayload = {
        status: 'accepted',
        reasonCode: 'stored',
        reason: 'Intent persisted',
        receivedTopic: topic,
        receivedAt,
        messageId: intent.messageId,
        siteId: intent.siteId,
        tenantId,
      };
      await this.publishIntakeEvent('ack', intakeEvent);
      await this.persistIntakeOutcome(intakeEvent);
      this.onIntentStored?.(tenantId, intent.siteId);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        this.logger.warn(`Ignoring duplicate EMS site intent from topic ${topic}`);
      } else if (error instanceof Error) {
        this.logger.warn(`Failed processing EMS MQTT message on ${topic}: ${error.message}`);
      } else {
        this.logger.warn(`Failed processing EMS MQTT message on ${topic}`);
      }

      const intakeEvent: IntakeEventPayload = {
        status: 'rejected',
        reasonCode: mapEmsIntakeErrorToReasonCode(error),
        reason: mapEmsIntakeErrorToReason(error),
        receivedTopic: topic,
        receivedAt,
        siteId: fallbackSiteId,
      };
      await this.publishIntakeEvent('reject', intakeEvent);
      await this.persistIntakeOutcome(intakeEvent);
    }
  }

  private normalizeIncomingIntent(
    payload: unknown,
    fallbackSiteId: string | undefined,
    receivedAt: string,
  ): EmsSiteIntentCreate {
    try {
      return EmsSiteIntentSchema.parse(payload);
    } catch {
      // Fall through to compatibility normalization for ODE-style envelopes.
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('MQTT payload must be a JSON object');
    }

    const sourcePayload = payload as Record<string, unknown>;
    const constraintsPayload =
      sourcePayload.constraints &&
      typeof sourcePayload.constraints === 'object' &&
      !Array.isArray(sourcePayload.constraints)
        ? (sourcePayload.constraints as Record<string, unknown>)
        : {};

    const rawSource = sourcePayload.source;
    const source =
      rawSource && typeof rawSource === 'object' && !Array.isArray(rawSource)
        ? {
            system: String((rawSource as Record<string, unknown>).system ?? 'open-dynamic-export'),
            component: String((rawSource as Record<string, unknown>).component ?? 'ems-intent'),
            instance: String((rawSource as Record<string, unknown>).instance ?? 'mqtt'),
          }
        : {
            system: 'open-dynamic-export',
            component: 'ems-intent',
            instance: 'mqtt',
          };

    const createdAtCandidate =
      (typeof sourcePayload.createdAt === 'string' && sourcePayload.createdAt) ||
      (typeof sourcePayload.timestamp === 'string' && sourcePayload.timestamp) ||
      receivedAt;
    const createdAt = new Date(createdAtCandidate);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error('createdAt/timestamp must be a valid datetime string');
    }

    const expiresAtCandidate =
      (typeof sourcePayload.expiresAt === 'string' && sourcePayload.expiresAt) ||
      new Date(createdAt.getTime() + 30_000).toISOString();

    const mode =
      (typeof sourcePayload.mode === 'string' && sourcePayload.mode) ||
      (typeof sourcePayload.operationMode === 'string' && sourcePayload.operationMode) ||
      'ExternalLimits';

    const normalizedIntent: EmsSiteIntentCreate = {
      messageId:
        (typeof sourcePayload.messageId === 'string' && sourcePayload.messageId) || randomUUID(),
      siteId:
        (typeof sourcePayload.siteId === 'string' && sourcePayload.siteId) ||
        fallbackSiteId ||
        'unknown',
      source,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAtCandidate,
      mode: mode as EmsSiteIntentCreate['mode'],
      constraints: {
        maxImportW: this.coerceOptionalNumber(
          constraintsPayload.maxImportW,
          sourcePayload.maxImportW,
          constraintsPayload.importLimitW,
          sourcePayload.importLimitW,
          this.extractWrappedNumber(sourcePayload.opModImpLimW),
        ),
        maxExportW: this.coerceOptionalNumber(
          constraintsPayload.maxExportW,
          sourcePayload.maxExportW,
          constraintsPayload.exportLimitW,
          sourcePayload.exportLimitW,
          this.extractWrappedNumber(sourcePayload.opModExpLimW),
        ),
        evChargeBudgetW: this.coerceOptionalNumber(
          constraintsPayload.evChargeBudgetW,
          sourcePayload.evChargeBudgetW,
          constraintsPayload.chargeBudgetW,
          sourcePayload.chargeBudgetW,
          constraintsPayload.evBudgetW,
          sourcePayload.evBudgetW,
        ),
        evDischargeBudgetW: this.coerceOptionalNumber(
          constraintsPayload.evDischargeBudgetW,
          sourcePayload.evDischargeBudgetW,
          constraintsPayload.dischargeBudgetW,
          sourcePayload.dischargeBudgetW,
          constraintsPayload.evDischargeW,
          sourcePayload.evDischargeW,
        ),
        rampRateWPerSec: this.coerceOptionalNumber(
          constraintsPayload.rampRateWPerSec,
          sourcePayload.rampRateWPerSec,
        ),
      },
      flags: {
        allowDischarge:
          (sourcePayload.flags as Record<string, unknown> | undefined)?.allowDischarge === true,
        emergencyCurtailment:
          (sourcePayload.flags as Record<string, unknown> | undefined)?.emergencyCurtailment ===
          true,
      },
      reason:
        (typeof sourcePayload.reason === 'string' && sourcePayload.reason) ||
        'ode_compat_intake',
      metadata:
        sourcePayload.metadata &&
        typeof sourcePayload.metadata === 'object' &&
        !Array.isArray(sourcePayload.metadata)
          ? (sourcePayload.metadata as Record<string, unknown>)
          : undefined,
      tenantId:
        typeof sourcePayload.tenantId === 'number'
          ? sourcePayload.tenantId
          : typeof sourcePayload.tenantId === 'string' && sourcePayload.tenantId.trim() !== ''
            ? Number(sourcePayload.tenantId)
            : undefined,
    };

    return EmsSiteIntentSchema.parse(normalizedIntent);
  }

  private coerceOptionalNumber(...values: unknown[]): number | null | undefined {
    for (const value of values) {
      if (value === null) {
        return null;
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return undefined;
  }

  private extractWrappedNumber(value: unknown): number | null | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return this.coerceOptionalNumber((value as Record<string, unknown>).value);
  }

  private extractSiteIdFromTopic(topic: string): string | undefined {
    const parts = topic.split('/');
    const siteIndex = parts.findIndex((part) => part === 'site');
    if (siteIndex >= 0 && parts.length > siteIndex + 1) {
      return parts[siteIndex + 1];
    }
    return undefined;
  }

  private async publishIntakeEvent(
    type: 'ack' | 'reject',
    payload: IntakeEventPayload,
  ): Promise<void> {
    if (!this.client) {
      return;
    }

    const mqttConfig = this.config.modules.ems?.mqtt;
    const topicTemplate =
      type === 'ack'
        ? (mqttConfig?.eventAckTopicTemplate ?? 'citrine/ems/site/<siteId>/event/ack')
        : (mqttConfig?.eventRejectTopicTemplate ?? 'citrine/ems/site/<siteId>/event/reject');
    const siteId = payload.siteId ?? 'unknown';
    const publishTopic = topicTemplate.replace('<siteId>', siteId);

    try {
      await new Promise<void>((resolve, reject) => {
        this.client?.publish(
          publishTopic,
          JSON.stringify(payload),
          { qos: 0 },
          (error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          },
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed publishing EMS intake ${type} event to ${publishTopic}: ${message}`);
    }
  }

  private async persistIntakeOutcome(payload: IntakeEventPayload): Promise<void> {
    if (!this.emsDecisionRepository) {
      return;
    }

    const tenantId = payload.tenantId ?? DEFAULT_TENANT_ID;
    const siteId = payload.siteId ?? 'unknown';

    try {
      await this.emsDecisionRepository.createDecision(tenantId, {
        siteId,
        stationId: 'ems-mqtt-intake',
        evseId: 0,
        intentMessageId: payload.messageId ?? null,
        decisionType: 'intake_result',
        decisionJson: {
          ...payload,
          siteId,
          tenantId,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed persisting EMS intake outcome for site ${siteId}: ${message}`);
    }
  }

  private async handleStartupFailure(error: unknown): Promise<void> {
    const mqttConfig = this.config.modules.ems?.mqtt;
    const message = error instanceof Error ? error.message : 'Unknown EMS MQTT startup failure';

    if (mqttConfig?.startupMode === 'required') {
      throw error instanceof Error ? error : new Error(message);
    }

    this.logger.warn(`EMS MQTT bridge not started: ${message}`);
    await this.shutdown();
  }
}