// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { EmsControlPlan } from '../contracts/ems-control-plan.js';

export interface ICitrineControlPublisher {
  publish(plan: EmsControlPlan): Promise<void>;
}
