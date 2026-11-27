// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { OcppDynamicSchedulePublisher } from '../src/services/ocpp-dynamic-schedule-publisher.js';
import type { EmsControlPlan } from '../src/contracts/ems-control-plan.js';

const samplePlan: EmsControlPlan = {
  siteId: 'site-a',
  tenantId: 1,
  createdAt: '2026-11-25T10:00:02.000Z',
  intentTimestamp: '2026-11-25T10:00:01.000Z',
  stationTargets: [
    {
      stationId: '10919352',
      evseId: 0,
      operationMode: 'ExternalLimits',
      chargeLimitW: 7000,
    },
  ],
  derActions: [],
};

const planWithDerAction: EmsControlPlan = {
  ...samplePlan,
  derActions: [
    {
      stationId: '10919352',
      action: 'SetTargetPower',
      parameters: {
        targetActivePowerW: 3500,
      },
    },
  ],
};

describe('OcppDynamicSchedulePublisher', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts updateDynamicSchedule payload to Citrine API', async () => {
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
      defaultChargingProfileId: 101,
    });

    await publisher.publish(samplePlan);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const firstCall = calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) {
      throw new Error('Expected fetch to be called once');
    }

    const [url, init] = firstCall;
    expect(url).toBe('http://citrine:8080/ocpp/2.1/smartcharging/updateDynamicSchedule?tenantId=1');
    expect(init.method).toBe('POST');

    const parsedBody = JSON.parse(String(init.body));
    expect(parsedBody.identifier).toEqual(['10919352']);
    expect(parsedBody.request.chargingProfileId).toBe(101);
    expect(parsedBody.request.scheduleUpdate.operationMode).toBe('ExternalLimits');
    expect(parsedBody.request.scheduleUpdate.limit).toBe(7000);
  });

  it('does not publish when dryRun is enabled', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const publisher = new OcppDynamicSchedulePublisher({
      baseUrl: 'http://citrine:8080',
      tenantId: 1,
      dryRun: true,
    });

    await publisher.publish(samplePlan);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to secondary DER endpoint when primary is unsupported', async () => {
    const fetchMock = vi
      .fn<
        (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      >()
      .mockResolvedValueOnce(
        new Response('Not Found', {
          status: 404,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'Accepted' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const publisher = new OcppDynamicSchedulePublisher({
      baseUrl: 'http://citrine:8080',
      tenantId: 1,
      dynamicScheduleEndpointPath: '/ocpp/2.1/smartcharging/updateDynamicSchedule',
      derEndpointPaths: {
        SetTargetPower: ['/ocpp/2.1/der/setDERControl', '/commands/der/setTargetPower'],
      },
    });

    await publisher.publish({
      ...samplePlan,
      stationTargets: [],
      derActions: planWithDerAction.derActions,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]?.[0]).toBe('http://citrine:8080/ocpp/2.1/der/setDERControl?tenantId=1');
    expect(calls[1]?.[0]).toBe('http://citrine:8080/commands/der/setTargetPower?tenantId=1');
  });

  it('publishes schedule and DER action in one control plan', async () => {
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
      defaultChargingProfileId: 101,
      derEndpointPaths: {
        SetTargetPower: ['/commands/der/setTargetPower'],
      },
    });

    await publisher.publish(planWithDerAction);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]?.[0]).toBe('http://citrine:8080/ocpp/2.1/smartcharging/updateDynamicSchedule?tenantId=1');
    expect(calls[1]?.[0]).toBe('http://citrine:8080/commands/der/setTargetPower?tenantId=1');
  });
});
