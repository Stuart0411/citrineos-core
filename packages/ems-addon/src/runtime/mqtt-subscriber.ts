// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import mqtt, { type MqttClient } from 'mqtt';
import type { TopicValueMessage } from '../contracts/ems-intent-envelope.js';
import type { EmsAddonRuntimeConfig } from './config.js';
import type { EmsAddonRuntime } from './ems-addon-runtime.js';

const TOPIC_SUFFIXES = [
  'import_limit_w',
  'export_limit_w',
  'ev_budget_w',
  'ev_discharge_budget_w',
  'operation_mode',
  'emergency_curtailed',
] as const;

export class MqttIntentSubscriber {
  private client: MqttClient | null = null;

  constructor(
    private readonly runtime: EmsAddonRuntime,
    private readonly config: EmsAddonRuntimeConfig,
  ) {}

  async start(): Promise<void> {
    this.client = mqtt.connect(this.config.mqttBrokerUrl);

    this.client.on('connect', () => {
      for (const suffix of TOPIC_SUFFIXES) {
        const topic = `${this.config.mqttTopicPrefix}/${suffix}`;
        this.client?.subscribe(topic);
      }
    });

    this.client.on('message', async (topic, payload) => {
      const message = this.parseTopicMessage(payload.toString());
      if (!message) {
        return;
      }

      const canonicalTopic = this.toCanonicalTopic(topic);
      await this.runtime.processTopicValue(canonicalTopic, message);
    });

    this.client.on('error', (error) => {
      // Keep logging simple and explicit for sidecar diagnostics.
      console.error('EMS MQTT error:', error);
    });
  }

  async stop(): Promise<void> {
    if (!this.client) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.client?.end(false, {}, () => resolve());
    });
  }

  private toCanonicalTopic(topic: string): string {
    const prefix = `${this.config.mqttTopicPrefix}/`;
    if (topic.startsWith(prefix)) {
      return `ems/site/${topic.slice(prefix.length)}`;
    }
    return topic;
  }

  private parseTopicMessage(rawPayload: string): TopicValueMessage | null {
    const parsed = this.tryParseJson(rawPayload);

    if (typeof parsed === 'object' && parsed !== null && 'value' in parsed) {
      const valueMessage = parsed as Partial<TopicValueMessage>;
      return {
        siteId: valueMessage.siteId ?? this.config.defaultSiteId,
        tenantId: valueMessage.tenantId ?? this.config.defaultTenantId,
        value: valueMessage.value as TopicValueMessage['value'],
        timestamp: valueMessage.timestamp,
        expiresAt: valueMessage.expiresAt,
        source: valueMessage.source,
        reason: valueMessage.reason,
        dedupeKey: valueMessage.dedupeKey,
      };
    }

    return {
      siteId: this.config.defaultSiteId,
      tenantId: this.config.defaultTenantId,
      value: parsed as TopicValueMessage['value'],
    };
  }

  private tryParseJson(payload: string): unknown {
    try {
      return JSON.parse(payload) as unknown;
    } catch {
      return payload;
    }
  }
}
