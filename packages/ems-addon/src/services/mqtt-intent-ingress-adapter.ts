// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type {
  EmsIntentEnvelope,
  TopicValueMessage,
} from '../contracts/ems-intent-envelope.js';
import type { EmsIntentConstraints, EmsSiteIntent } from '../contracts/ems-site-intent.js';
import type { IEmsMqttIngressAdapter } from '../interfaces/i-ems-intent-ingress-adapter.js';
import { RestIntentIngressAdapter } from './rest-intent-ingress-adapter.js';

interface SiteTopicState {
  maxImportW?: number;
  maxExportW?: number;
  evChargeBudgetW?: number;
  evDischargeBudgetW?: number;
  emergencyCurtailed?: boolean;
  operationMode?: EmsSiteIntent['operationMode'];
}

const DEFAULT_TTL_SECONDS = 30;

export class MqttIntentIngressAdapter implements IEmsMqttIngressAdapter {
  private readonly restAdapter = new RestIntentIngressAdapter();
  private readonly stateBySite = new Map<string, SiteTopicState>();

  fromEnvelope(envelope: EmsIntentEnvelope): EmsSiteIntent {
    return this.restAdapter.fromEnvelope(envelope);
  }

  fromTopicValue(topic: string, message: TopicValueMessage): EmsSiteIntent | null {
    const siteKey = `${message.tenantId}:${message.siteId}`;
    const prior = this.stateBySite.get(siteKey) ?? {};
    const next = this.applyTopicValue(topic, message.value, prior);
    if (!next) {
      return null;
    }

    this.stateBySite.set(siteKey, next);

    const constraints: EmsIntentConstraints = {
      maxImportW: next.maxImportW,
      maxExportW: next.maxExportW,
      evChargeBudgetW: next.evChargeBudgetW,
      evDischargeBudgetW: next.evDischargeBudgetW,
    };

    return this.restAdapter.fromEnvelope({
      siteId: message.siteId,
      tenantId: message.tenantId,
      timestamp: message.timestamp,
      expiresAt: message.expiresAt ?? this.defaultExpiry(message.timestamp),
      operationMode: next.operationMode ?? 'ExternalLimits',
      constraints,
      source: message.source,
      reason: message.reason,
      dedupeKey: message.dedupeKey,
      emergencyCurtailed: next.emergencyCurtailed,
    });
  }

  private applyTopicValue(topic: string, value: TopicValueMessage['value'], state: SiteTopicState): SiteTopicState | null {
    const next = { ...state };

    switch (topic) {
      case 'ems/site/import_limit_w':
        next.maxImportW = this.toNumber(value);
        return next;
      case 'ems/site/export_limit_w':
        next.maxExportW = this.toNumber(value);
        return next;
      case 'ems/site/ev_budget_w':
        next.evChargeBudgetW = this.toNumber(value);
        return next;
      case 'ems/site/ev_discharge_budget_w':
        next.evDischargeBudgetW = this.toNumber(value);
        return next;
      case 'ems/site/emergency_curtailed':
        next.emergencyCurtailed = this.toBoolean(value);
        return next;
      case 'ems/site/operation_mode':
        next.operationMode = this.toOperationMode(value);
        return next;
      default:
        return null;
    }
  }

  private toNumber(value: TopicValueMessage['value']): number | undefined {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private toBoolean(value: TopicValueMessage['value']): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    const normalized = String(value).toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  private toOperationMode(value: TopicValueMessage['value']): EmsSiteIntent['operationMode'] {
    const normalized = String(value);
    const allowed = new Set<EmsSiteIntent['operationMode']>([
      'Idle',
      'ChargingOnly',
      'CentralSetpoint',
      'ExternalSetpoint',
      'ExternalLimits',
      'CentralFrequency',
      'LocalFrequency',
      'LocalLoadBalancing',
    ]);
    return allowed.has(normalized as EmsSiteIntent['operationMode'])
      ? (normalized as EmsSiteIntent['operationMode'])
      : 'ExternalLimits';
  }

  private defaultExpiry(timestamp?: string): string {
    const base = timestamp ? Date.parse(timestamp) : Date.now();
    const expiresAt = Number.isFinite(base) ? base + DEFAULT_TTL_SECONDS * 1000 : Date.now() + DEFAULT_TTL_SECONDS * 1000;
    return new Date(expiresAt).toISOString();
  }
}
