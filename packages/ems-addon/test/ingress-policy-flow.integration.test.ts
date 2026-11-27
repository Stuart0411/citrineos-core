// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { MqttIntentIngressAdapter } from '../src/services/mqtt-intent-ingress-adapter.js';
import { DefaultEmsIntentValidator } from '../src/services/default-ems-intent-validator.js';
import { EqualShareAllocationStrategy } from '../src/services/equal-share-allocation-strategy.js';
import { DefaultEmsPolicyEngine } from '../src/services/default-ems-policy-engine.js';

describe('EMS ingress to policy flow', () => {
  it('builds an equal-share station plan from topic-driven ingress', () => {
    const ingress = new MqttIntentIngressAdapter();

    const budgetIntent = ingress.fromTopicValue('ems/site/ev_budget_w', {
      siteId: 'site-a',
      tenantId: 1,
      value: 12000,
      timestamp: '2026-11-25T10:00:00.000Z',
      expiresAt: '2026-11-25T10:00:45.000Z',
      source: 'ha/ode',
      reason: 'dynamic_export',
    });

    expect(budgetIntent).not.toBeNull();

    const finalIntent = ingress.fromTopicValue('ems/site/operation_mode', {
      siteId: 'site-a',
      tenantId: 1,
      value: 'ExternalLimits',
      timestamp: '2026-11-25T10:00:01.000Z',
      expiresAt: '2026-11-25T10:00:45.000Z',
    });

    expect(finalIntent).not.toBeNull();

    const policy = new DefaultEmsPolicyEngine(
      new DefaultEmsIntentValidator(),
      new EqualShareAllocationStrategy(),
    );

    const plan = policy.evaluate(finalIntent!, [
      { stationId: 'A', online: true, supportsV2x: true, maxChargeW: 7000 },
      { stationId: 'B', online: true, supportsV2x: false, maxChargeW: 7000 },
      { stationId: 'C', online: false, supportsV2x: true, maxChargeW: 7000 },
    ]);

    expect(plan.stationTargets).toHaveLength(2);
    expect(plan.stationTargets[0].chargeLimitW).toBe(6000);
    expect(plan.stationTargets[1].chargeLimitW).toBe(6000);
    expect(plan.stationTargets[0].operationMode).toBe('ExternalLimits');
    expect(plan.stationTargets[1].operationMode).toBe('ExternalLimits');
  });
});
