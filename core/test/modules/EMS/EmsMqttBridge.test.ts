// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { Logger } from 'tslog';
import type { SystemConfig } from '@citrineos/base';
import { UniqueConstraintError } from 'sequelize';
import { EmsMqttBridge } from '../../../src/modules/EMS/src/module/MqttBridge.js';

class FakeMqttClient extends EventEmitter {
  public subscribe = vi.fn((_topic: string, callback: (error?: Error | null) => void) => {
    callback(null);
  });

  public publish = vi.fn(
    (
      _topic: string,
      _message: string,
      _options: object,
      callback: (error?: Error | null) => void,
    ) => {
      callback(null);
    },
  );

  public end = vi.fn((_force: boolean, _opts: object, callback: () => void) => {
    callback();
  });

  public off(eventName: string | symbol, listener: (...args: any[]) => void): this {
    return super.off(eventName, listener);
  }

  public once(eventName: string | symbol, listener: (...args: any[]) => void): this {
    return super.once(eventName, listener);
  }

  public on(eventName: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(eventName, listener);
  }
}

describe('EmsMqttBridge', () => {
  const flushAsync = async (ticks: number = 8) => {
    for (let index = 0; index < ticks; index += 1) {
      await Promise.resolve();
    }
  };

  const baseRepo = () => ({
    createSiteIntent: vi.fn(),
  });
  const baseDecisionRepo = () => ({
    createDecision: vi.fn().mockResolvedValue(undefined),
  });

  const logger = new Logger({ name: 'EmsMqttBridgeTest' });

  it('does nothing when MQTT is disabled', async () => {
    const repo = baseRepo();
    const connectFn = vi.fn();
    const bridge = new EmsMqttBridge(
      {
        env: 'development',
        logLevel: 2,
        modules: { ems: { mqtt: { enabled: false } } },
      } as any as SystemConfig,
      repo as any,
      logger,
      connectFn as any,
    );

    await bridge.start();

    expect(connectFn).not.toHaveBeenCalled();
    expect(bridge.isStarted()).toBe(false);
  });

  it('does not throw when MQTT is enabled but brokerUrl is missing in non-fatal mode', async () => {
    const repo = baseRepo();
    const bridge = new EmsMqttBridge(
      {
        env: 'development',
        logLevel: 2,
        modules: { ems: { mqtt: { enabled: true, startupMode: 'non_fatal' } } },
      } as any as SystemConfig,
      repo as any,
      logger,
      vi.fn() as any,
    );

    await expect(bridge.start()).resolves.toBeUndefined();
    expect(bridge.isStarted()).toBe(false);
  });

  it('throws when MQTT is required but brokerUrl is missing', async () => {
    const repo = baseRepo();
    const bridge = new EmsMqttBridge(
      {
        env: 'development',
        logLevel: 2,
        modules: { ems: { mqtt: { enabled: true, startupMode: 'required' } } },
      } as any as SystemConfig,
      repo as any,
      logger,
      vi.fn() as any,
    );

    await expect(bridge.start()).rejects.toThrow('brokerUrl is not configured');
  });

  it('stores valid incoming site intents when connected', async () => {
    const repo = baseRepo();
    const decisionRepo = baseDecisionRepo();
    const fakeClient = new FakeMqttClient();
    const bridge = new EmsMqttBridge(
      {
        env: 'development',
        logLevel: 2,
        modules: {
          ems: {
            mqtt: {
              enabled: true,
              brokerUrl: 'mqtt://localhost:1883',
              startupMode: 'non_fatal',
              siteIntentsTopic: 'citrine/ems/site/+/intent/current',
              connectTimeoutMs: 1000,
            },
          },
        },
      } as any as SystemConfig,
      repo as any,
      logger,
      vi.fn(() => fakeClient as any) as any,
      decisionRepo as any,
    );

    const startPromise = bridge.start();
    fakeClient.emit('connect');
    await startPromise;

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 30000);

    fakeClient.emit(
      'message',
      'citrine/ems/site/site-1/intent/current',
      Buffer.from(
        JSON.stringify({
          messageId: '7f3f8b10-0c30-4f9d-bf81-79269ae7b8ea',
          tenantId: 1,
          siteId: 'site-1',
          source: { system: 'home-assistant', component: 'open-dynamic-export', instance: 'ha' },
          createdAt: createdAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          mode: 'ExternalLimits',
          constraints: { maxImportW: 10000 },
          flags: { allowDischarge: false, emergencyCurtailment: false },
          reason: 'test',
        }),
      ),
    );

    await flushAsync();

    expect(repo.createSiteIntent).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ siteId: 'site-1', mode: 'ExternalLimits' }),
    );
    expect(fakeClient.publish).toHaveBeenCalledWith(
      'citrine/ems/site/site-1/event/ack',
      expect.any(String),
      { qos: 0 },
      expect.any(Function),
    );
    expect(decisionRepo.createDecision).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        siteId: 'site-1',
        stationId: 'ems-mqtt-intake',
        evseId: 0,
        decisionType: 'intake_result',
      }),
    );

    const ackCall = fakeClient.publish.mock.calls.find(
      (call) => call[0] === 'citrine/ems/site/site-1/event/ack',
    );
    expect(ackCall).toBeDefined();
    const ackPayload = JSON.parse(ackCall?.[1] as string);
    expect(ackPayload.status).toBe('accepted');
    expect(ackPayload.reasonCode).toBe('stored');
    expect(ackPayload.messageId).toBe('7f3f8b10-0c30-4f9d-bf81-79269ae7b8ea');
    expect(ackPayload.receivedTopic).toBe('citrine/ems/site/site-1/intent/current');
    expect(bridge.isStarted()).toBe(true);
  });

  it('ignores stale incoming site intents', async () => {
    const repo = baseRepo();
    const decisionRepo = baseDecisionRepo();
    const fakeClient = new FakeMqttClient();
    const bridge = new EmsMqttBridge(
      {
        env: 'development',
        logLevel: 2,
        modules: {
          ems: {
            intentValidation: { maxAgeMs: 1000 },
            mqtt: {
              enabled: true,
              brokerUrl: 'mqtt://localhost:1883',
              startupMode: 'non_fatal',
              siteIntentsTopic: 'citrine/ems/site/+/intent/current',
              connectTimeoutMs: 1000,
            },
          },
        },
      } as any as SystemConfig,
      repo as any,
      logger,
      vi.fn(() => fakeClient as any) as any,
      decisionRepo as any,
    );

    const startPromise = bridge.start();
    fakeClient.emit('connect');
    await startPromise;

    fakeClient.emit(
      'message',
      'citrine/ems/site/site-1/intent/current',
      Buffer.from(
        JSON.stringify({
          messageId: '7f3f8b10-0c30-4f9d-bf81-79269ae7b8ea',
          tenantId: 1,
          siteId: 'site-1',
          source: { system: 'home-assistant', component: 'open-dynamic-export', instance: 'ha' },
          createdAt: '2020-08-17T10:00:00.000Z',
          expiresAt: '2099-08-17T10:00:30.000Z',
          mode: 'ExternalLimits',
          constraints: { maxImportW: 10000 },
          flags: { allowDischarge: false, emergencyCurtailment: false },
          reason: 'stale-test',
        }),
      ),
    );

    await flushAsync();

    expect(repo.createSiteIntent).not.toHaveBeenCalled();
    expect(fakeClient.publish).toHaveBeenCalledWith(
      'citrine/ems/site/site-1/event/reject',
      expect.any(String),
      { qos: 0 },
      expect.any(Function),
    );

    const rejectCall = fakeClient.publish.mock.calls.find(
      (call) => call[0] === 'citrine/ems/site/site-1/event/reject',
    );
    expect(rejectCall).toBeDefined();
    const rejectPayload = JSON.parse(rejectCall?.[1] as string);
    expect(rejectPayload.status).toBe('rejected');
    expect(rejectPayload.reasonCode).toBe('policy_time_window_violation');
    expect(rejectPayload.siteId).toBe('site-1');
    expect(decisionRepo.createDecision).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        siteId: 'site-1',
        stationId: 'ems-mqtt-intake',
        evseId: 0,
        decisionType: 'intake_result',
      }),
    );
  });

  it('rejects duplicate incoming site intents with duplicate reason code', async () => {
    const repo = baseRepo();
    const decisionRepo = baseDecisionRepo();
    repo.createSiteIntent.mockRejectedValue(new UniqueConstraintError({ message: 'duplicate', errors: [] }));
    const fakeClient = new FakeMqttClient();
    const bridge = new EmsMqttBridge(
      {
        env: 'development',
        logLevel: 2,
        modules: {
          ems: {
            mqtt: {
              enabled: true,
              brokerUrl: 'mqtt://localhost:1883',
              startupMode: 'non_fatal',
              siteIntentsTopic: 'citrine/ems/site/+/intent/current',
              connectTimeoutMs: 1000,
            },
          },
        },
      } as any as SystemConfig,
      repo as any,
      logger,
      vi.fn(() => fakeClient as any) as any,
      decisionRepo as any,
    );

    const startPromise = bridge.start();
    fakeClient.emit('connect');
    await startPromise;

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 30000);

    fakeClient.emit(
      'message',
      'citrine/ems/site/site-1/intent/current',
      Buffer.from(
        JSON.stringify({
          messageId: '7f3f8b10-0c30-4f9d-bf81-79269ae7b8ea',
          tenantId: 1,
          siteId: 'site-1',
          source: { system: 'home-assistant', component: 'open-dynamic-export', instance: 'ha' },
          createdAt: createdAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          mode: 'ExternalLimits',
          constraints: { maxImportW: 10000 },
          flags: { allowDischarge: false, emergencyCurtailment: false },
          reason: 'duplicate-test',
        }),
      ),
    );

    await flushAsync();

    const rejectCall = fakeClient.publish.mock.calls.find(
      (call) => call[0] === 'citrine/ems/site/site-1/event/reject',
    );
    expect(rejectCall).toBeDefined();
    const rejectPayload = JSON.parse(rejectCall?.[1] as string);
    expect(rejectPayload.status).toBe('rejected');
    expect(rejectPayload.reasonCode).toBe('duplicate_message_id');
    expect(rejectPayload.reason).toBe('Duplicate messageId');
    expect(decisionRepo.createDecision).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        siteId: 'site-1',
        stationId: 'ems-mqtt-intake',
        evseId: 0,
        decisionType: 'intake_result',
      }),
    );
  });

  it('normalizes ODE-style envelopes into EMS site intents', async () => {
    const repo = baseRepo();
    const decisionRepo = baseDecisionRepo();
    const fakeClient = new FakeMqttClient();
    const bridge = new EmsMqttBridge(
      {
        env: 'development',
        logLevel: 2,
        modules: {
          ems: {
            mqtt: {
              enabled: true,
              brokerUrl: 'mqtt://localhost:1883',
              startupMode: 'non_fatal',
              siteIntentsTopic: 'citrine/ems/site/+/intent/current',
              connectTimeoutMs: 1000,
            },
          },
        },
      } as any as SystemConfig,
      repo as any,
      logger,
      vi.fn(() => fakeClient as any) as any,
      decisionRepo as any,
    );

    const startPromise = bridge.start();
    fakeClient.emit('connect');
    await startPromise;

    const now = new Date().toISOString();

    fakeClient.emit(
      'message',
      'citrine/ems/site/site-ode/intent/current',
      Buffer.from(
        JSON.stringify({
          timestamp: now,
          operationMode: 'ExternalLimits',
          constraints: {
            importLimitW: '22000',
            exportLimitW: 6000,
            evBudgetW: 9000,
            dischargeBudgetW: 4000,
          },
          reason: 'ode_runtime_control',
        }),
      ),
    );

    await flushAsync();

    expect(repo.createSiteIntent).toHaveBeenCalledTimes(1);
    const [tenantId, intent] = repo.createSiteIntent.mock.calls[0];
    expect(tenantId).toBe(1);
    expect(intent).toEqual(
      expect.objectContaining({
        siteId: 'site-ode',
        mode: 'ExternalLimits',
        reason: 'ode_runtime_control',
        constraints: {
          maxImportW: 22000,
          maxExportW: 6000,
          evChargeBudgetW: 9000,
          evDischargeBudgetW: 4000,
        },
      }),
    );
    expect(intent.messageId).toEqual(expect.any(String));
    expect(intent.expiresAt).toEqual(expect.any(String));
  });

  it('uses topic site id fallback for ODE-style envelopes missing siteId', async () => {
    const repo = baseRepo();
    const decisionRepo = baseDecisionRepo();
    const fakeClient = new FakeMqttClient();
    const bridge = new EmsMqttBridge(
      {
        env: 'development',
        logLevel: 2,
        modules: {
          ems: {
            mqtt: {
              enabled: true,
              brokerUrl: 'mqtt://localhost:1883',
              startupMode: 'non_fatal',
              siteIntentsTopic: 'citrine/ems/site/+/intent/current',
              connectTimeoutMs: 1000,
            },
          },
        },
      } as any as SystemConfig,
      repo as any,
      logger,
      vi.fn(() => fakeClient as any) as any,
      decisionRepo as any,
    );

    const startPromise = bridge.start();
    fakeClient.emit('connect');
    await startPromise;

    const now = new Date().toISOString();

    fakeClient.emit(
      'message',
      'citrine/ems/site/site-topic/intent/current',
      Buffer.from(
        JSON.stringify({
          timestamp: now,
          mode: 'ChargingOnly',
          constraints: { importLimitW: 12000 },
          reason: 'topic_site_fallback',
        }),
      ),
    );

    await flushAsync();

    const [, intent] = repo.createSiteIntent.mock.calls[0];
    expect(intent.siteId).toBe('site-topic');
  });

  it('normalizes opModImpLimW and opModExpLimW wrapped values', async () => {
    const repo = baseRepo();
    const decisionRepo = baseDecisionRepo();
    const fakeClient = new FakeMqttClient();
    const bridge = new EmsMqttBridge(
      {
        env: 'development',
        logLevel: 2,
        modules: {
          ems: {
            mqtt: {
              enabled: true,
              brokerUrl: 'mqtt://localhost:1883',
              startupMode: 'non_fatal',
              siteIntentsTopic: 'citrine/ems/site/+/intent/current',
              connectTimeoutMs: 1000,
            },
          },
        },
      } as any as SystemConfig,
      repo as any,
      logger,
      vi.fn(() => fakeClient as any) as any,
      decisionRepo as any,
    );

    const startPromise = bridge.start();
    fakeClient.emit('connect');
    await startPromise;

    fakeClient.emit(
      'message',
      'citrine/ems/site/nexus/intent/current',
      Buffer.from(
        JSON.stringify({
          opModExpLimW: { source: 'csipAus', value: 5000 },
          opModImpLimW: { source: 'csipAus', value: 0 },
        }),
      ),
    );

    await flushAsync();

    expect(repo.createSiteIntent).toHaveBeenCalledTimes(1);
    const [tenantId, intent] = repo.createSiteIntent.mock.calls[0];
    expect(tenantId).toBe(1);
    expect(intent.siteId).toBe('nexus');
    expect(intent.constraints.maxImportW).toBe(0);
    expect(intent.constraints.maxExportW).toBe(5000);
  });
});