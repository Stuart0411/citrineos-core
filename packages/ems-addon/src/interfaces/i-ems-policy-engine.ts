// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { EmsControlPlan, EmsStationSnapshot } from '../contracts/ems-control-plan.js';
import type { EmsSiteIntent } from '../contracts/ems-site-intent.js';

export interface IEmsPolicyEngine {
  evaluate(intent: EmsSiteIntent, stations: EmsStationSnapshot[]): EmsControlPlan;
}
