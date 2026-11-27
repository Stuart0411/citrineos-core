// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { EmsSiteIntent } from '../contracts/ems-site-intent.js';
import type { EmsStationSnapshot } from '../contracts/ems-control-plan.js';
import type { IEmsPolicyEngine } from '../interfaces/i-ems-policy-engine.js';
import type { ICitrineControlPublisher } from '../interfaces/i-citrine-control-publisher.js';

export class EmsControlLoop {
  constructor(
    private readonly policyEngine: IEmsPolicyEngine,
    private readonly publisher: ICitrineControlPublisher,
  ) {}

  async run(intent: EmsSiteIntent, stations: EmsStationSnapshot[]): Promise<void> {
    const plan = this.policyEngine.evaluate(intent, stations);
    await this.publisher.publish(plan);
  }
}
