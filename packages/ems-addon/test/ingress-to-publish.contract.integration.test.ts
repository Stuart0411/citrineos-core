// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { RestIntentIngressAdapter } from '../src/services/rest-intent-ingress-adapter.js';
import { DefaultEmsIntentValidator } from '../src/services/default-ems-intent-validator.js';
import { EqualShareAllocationStrategy } from '../src/services/equal-share-allocation-strategy.js';
import { DefaultEmsPolicyEngine } from '../src/services/default-ems-policy-engine.js';
import { OcppDynamicSchedulePublisher } from '../src/services/ocpp-dynamic-schedule-publisher.js';

describe('EMS contract flow: ingress -> plan -> publish', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('publishes dynamic schedule updates for planned stations from ingress envelope', async () => {
    const adapter = new RestIntentIngressAdapter();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30_000);

    const intent = adapter.fromEnvelope({
      siteId: 'site-a',
      tenantId: 1,
      timestamp: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      operationMode: 'ExternalLimits',
      constraints: {
        evChargeBudgetW: 10000,
      },
      source: 'home-assistant/ode',
      reason: 'dynamic-export',
    });

    const policy = new DefaultEmsPolicyEngine(
      new DefaultEmsIntentValidator(),
      new EqualShareAllocationStrategy(),
    );

    const plan = policy.evaluate(intent, [
      {
        stationId: 'station-1',
        online: true,
        supportsV2x: false,
        maxChargeW: 6000,
      },
      {
        stationId: 'station-2',
        online: true,
        supportsV2x: true,
        maxChargeW: 6000,
      },
    ]);

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ status: 'Accepted' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const publisher = new OcppDynamicSchedulePublisher({
      baseUrl: 'http://citrine:8080',
      tenantId: 1,
      defaultChargingProfileId: 901,
    });

    await publisher.publish(plan);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]?.[0]).toBe('http://citrine:8080/ocpp/2.1/smartcharging/updateDynamicSchedule?tenantId=1');
    expect(calls[1]?.[0]).toBe('http://citrine:8080/ocpp/2.1/smartcharging/updateDynamicSchedule?tenantId=1');

    const firstPayload = JSON.parse(String(calls[0]?.[1].body));
    const secondPayload = JSON.parse(String(calls[1]?.[1].body));
    expect(firstPayload.request.chargingProfileId).toBe(901);
    expect(secondPayload.request.chargingProfileId).toBe(901);
    expect(firstPayload.request.scheduleUpdate.limit).toBe(5000);
    expect(secondPayload.request.scheduleUpdate.limit).toBe(5000);
  });

  it('rejects stale intent envelopes during policy evaluation', () => {
    const adapter = new RestIntentIngressAdapter();
    const policy = new DefaultEmsPolicyEngine(
      new DefaultEmsIntentValidator(),
      new EqualShareAllocationStrategy(),
    );

    const intent = adapter.fromEnvelope({
      siteId: 'site-a',
      tenantId: 1,
      timestamp: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      operationMode: 'ExternalLimits',
      constraints: {
        evChargeBudgetW: 7000,
      },
      source: 'smoke-script',
      reason: 'stale-intent-regression',
    });

    expect(() =>
      policy.evaluate(intent, [
        {
          stationId: 'station-1',
          online: true,
          supportsV2x: false,
          maxChargeW: 6000,
        },
      ]),
    ).toThrow('Stale EMS intent rejected');
  });

  it('rejects invalid tenant identifiers during policy evaluation', () => {
    const adapter = new RestIntentIngressAdapter();
    const policy = new DefaultEmsPolicyEngine(
      new DefaultEmsIntentValidator(),
      new EqualShareAllocationStrategy(),
    );

    const intent = adapter.fromEnvelope({
      siteId: 'site-a',
      tenantId: 0,
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      operationMode: 'ExternalLimits',
      constraints: {
        evChargeBudgetW: 7000,
      },
      source: 'smoke-script',
      reason: 'invalid-tenant-regression',
    });

    expect(() =>
      policy.evaluate(intent, [
        {
          stationId: 'station-1',
          online: true,
          supportsV2x: false,
          maxChargeW: 6000,
        },
      ]),
    ).toThrow('Invalid EMS intent: tenantId must be a positive integer');
  });
});
