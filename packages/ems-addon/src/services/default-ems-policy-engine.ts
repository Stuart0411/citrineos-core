// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { IEmsPolicyEngine } from '../interfaces/i-ems-policy-engine.js';
import type { IEmsAllocationStrategy } from '../interfaces/i-ems-allocation-strategy.js';
import type { IEmsIntentValidator } from '../interfaces/i-ems-intent-validator.js';
import type { EmsControlPlan, EmsStationSnapshot } from '../contracts/ems-control-plan.js';
import type { EmsSiteIntent } from '../contracts/ems-site-intent.js';

export class DefaultEmsPolicyEngine implements IEmsPolicyEngine {
  constructor(
    private readonly validator: IEmsIntentValidator,
    private readonly strategy: IEmsAllocationStrategy,
  ) {}

  evaluate(intent: EmsSiteIntent, stations: EmsStationSnapshot[]): EmsControlPlan {
    const issues = this.validator.validate(intent);
    if (issues.length > 0) {
      throw new Error(`Invalid EMS intent: ${issues.join('; ')}`);
    }

    if (!this.validator.isFresh(intent)) {
      throw new Error('Stale EMS intent rejected');
    }

    const stationTargets = this.strategy.allocate(intent, stations);
    return this.strategy.buildPlan(intent, stationTargets);
  }
}
