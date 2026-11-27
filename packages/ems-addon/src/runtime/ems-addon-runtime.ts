// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { EmsControlPlan, EmsStationSnapshot } from '../contracts/ems-control-plan.js';
import type {
  EmsIntentEnvelope,
  TopicValueMessage,
} from '../contracts/ems-intent-envelope.js';
import type { IEmsMqttIngressAdapter } from '../interfaces/i-ems-intent-ingress-adapter.js';
import type { IEmsIntentIngressAdapter } from '../interfaces/i-ems-intent-ingress-adapter.js';
import type { IEmsPolicyEngine } from '../interfaces/i-ems-policy-engine.js';
import type { ICitrineControlPublisher } from '../interfaces/i-citrine-control-publisher.js';
import { OcppDynamicSchedulePublisher } from '../services/ocpp-dynamic-schedule-publisher.js';

export interface EmsAddonRuntimeDependencies {
  restIngressAdapter: IEmsIntentIngressAdapter;
  mqttIngressAdapter: IEmsMqttIngressAdapter;
  policyEngine: IEmsPolicyEngine;
  publisher: ICitrineControlPublisher;
  stationSnapshots: EmsStationSnapshot[];
  enableRestIngress: boolean;
  dryRun: boolean;
  defaultChargingProfileId: number;
}

export interface RuntimeMutableConfig {
  enableRestIngress: boolean;
  dryRun: boolean;
  defaultChargingProfileId: number;
  stationSnapshots: EmsStationSnapshot[];
}

export interface RuntimeSnapshot {
  config: RuntimeMutableConfig;
  metrics: {
    acceptedCount: number;
    rejectedCount: number;
    publishedCount: number;
    topicMessageCount: number;
  };
  lastIntentEnvelope?: EmsIntentEnvelope;
  lastPlan?: EmsControlPlan;
  lastError?: string;
  lastUpdateAt?: string;
}

export class EmsAddonRuntime {
  private readonly mutableConfig: RuntimeMutableConfig;
  private readonly metrics = {
    acceptedCount: 0,
    rejectedCount: 0,
    publishedCount: 0,
    topicMessageCount: 0,
  };
  private lastIntentEnvelope?: EmsIntentEnvelope;
  private lastPlan?: EmsControlPlan;
  private lastError?: string;
  private lastUpdateAt?: string;

  constructor(private readonly deps: EmsAddonRuntimeDependencies) {
    this.mutableConfig = {
      enableRestIngress: deps.enableRestIngress,
      dryRun: deps.dryRun,
      defaultChargingProfileId: deps.defaultChargingProfileId,
      stationSnapshots: deps.stationSnapshots,
    };

    this.syncPublisherRuntimeOptions();
  }

  isRestIngressEnabled(): boolean {
    return this.mutableConfig.enableRestIngress;
  }

  patchConfig(patch: Partial<RuntimeMutableConfig>): RuntimeMutableConfig {
    this.mutableConfig.enableRestIngress =
      patch.enableRestIngress ?? this.mutableConfig.enableRestIngress;
    this.mutableConfig.dryRun = patch.dryRun ?? this.mutableConfig.dryRun;
    this.mutableConfig.defaultChargingProfileId =
      patch.defaultChargingProfileId ?? this.mutableConfig.defaultChargingProfileId;
    this.mutableConfig.stationSnapshots =
      patch.stationSnapshots ?? this.mutableConfig.stationSnapshots;

    this.syncPublisherRuntimeOptions();
    this.lastUpdateAt = new Date().toISOString();
    return this.getMutableConfig();
  }

  getMutableConfig(): RuntimeMutableConfig {
    return {
      enableRestIngress: this.mutableConfig.enableRestIngress,
      dryRun: this.mutableConfig.dryRun,
      defaultChargingProfileId: this.mutableConfig.defaultChargingProfileId,
      stationSnapshots: this.mutableConfig.stationSnapshots,
    };
  }

  getSnapshot(): RuntimeSnapshot {
    return {
      config: this.getMutableConfig(),
      metrics: { ...this.metrics },
      lastIntentEnvelope: this.lastIntentEnvelope,
      lastPlan: this.lastPlan,
      lastError: this.lastError,
      lastUpdateAt: this.lastUpdateAt,
    };
  }

  async processEnvelope(envelope: EmsIntentEnvelope): Promise<EmsControlPlan> {
    this.lastIntentEnvelope = envelope;
    this.lastUpdateAt = new Date().toISOString();

    try {
      const intent = this.deps.restIngressAdapter.fromEnvelope(envelope);
      const plan = this.deps.policyEngine.evaluate(intent, this.mutableConfig.stationSnapshots);
      await this.deps.publisher.publish(plan);

      this.metrics.acceptedCount += 1;
      this.metrics.publishedCount += 1;
      this.lastPlan = plan;
      this.lastError = undefined;
      return plan;
    } catch (error) {
      this.metrics.rejectedCount += 1;
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async processTopicValue(topic: string, message: TopicValueMessage): Promise<EmsControlPlan | null> {
    this.metrics.topicMessageCount += 1;
    this.lastUpdateAt = new Date().toISOString();

    try {
      const intent = this.deps.mqttIngressAdapter.fromTopicValue(topic, message);
      if (!intent) {
        return null;
      }

      const plan = this.deps.policyEngine.evaluate(intent, this.mutableConfig.stationSnapshots);
      await this.deps.publisher.publish(plan);

      this.metrics.acceptedCount += 1;
      this.metrics.publishedCount += 1;
      this.lastPlan = plan;
      this.lastError = undefined;
      return plan;
    } catch (error) {
      this.metrics.rejectedCount += 1;
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private syncPublisherRuntimeOptions(): void {
    if (this.deps.publisher instanceof OcppDynamicSchedulePublisher) {
      this.deps.publisher.updateRuntimeOptions({
        dryRun: this.mutableConfig.dryRun,
        defaultChargingProfileId: this.mutableConfig.defaultChargingProfileId,
      });
    }
  }
}
