// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { RestIntentIngressAdapter } from '../services/rest-intent-ingress-adapter.js';
import { MqttIntentIngressAdapter } from '../services/mqtt-intent-ingress-adapter.js';
import { DefaultEmsIntentValidator } from '../services/default-ems-intent-validator.js';
import { EqualShareAllocationStrategy } from '../services/equal-share-allocation-strategy.js';
import { DefaultEmsPolicyEngine } from '../services/default-ems-policy-engine.js';
import { OcppDynamicSchedulePublisher } from '../services/ocpp-dynamic-schedule-publisher.js';
import { buildEmsAddonApp } from './app.js';
import { EmsAddonRuntime } from './ems-addon-runtime.js';
import { loadRuntimeConfig } from './config.js';
import { MqttIntentSubscriber } from './mqtt-subscriber.js';

async function main(): Promise<void> {
  const config = loadRuntimeConfig();

  const runtime = new EmsAddonRuntime({
    restIngressAdapter: new RestIntentIngressAdapter(),
    mqttIngressAdapter: new MqttIntentIngressAdapter(),
    policyEngine: new DefaultEmsPolicyEngine(
      new DefaultEmsIntentValidator(),
      new EqualShareAllocationStrategy(),
    ),
    publisher: new OcppDynamicSchedulePublisher({
      baseUrl: config.citrineBaseUrl,
      tenantId: config.citrineTenantId,
      authToken: config.citrineAuthToken,
      dryRun: config.dryRun,
      defaultChargingProfileId: config.defaultChargingProfileId,
    }),
    stationSnapshots: config.stationSnapshots,
    enableRestIngress: config.enableRestIngress,
    dryRun: config.dryRun,
    defaultChargingProfileId: config.defaultChargingProfileId,
  });

  const app = buildEmsAddonApp(runtime, config);

  const mqttSubscriber = config.enableMqttIngress
    ? new MqttIntentSubscriber(runtime, config)
    : null;

  if (mqttSubscriber) {
    await mqttSubscriber.start();
  }

  await app.listen({
    host: config.httpHost,
    port: config.httpPort,
  });

  const shutdown = async () => {
    if (mqttSubscriber) {
      await mqttSubscriber.stop();
    }
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

void main();
