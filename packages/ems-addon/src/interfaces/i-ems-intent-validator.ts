// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { EmsSiteIntent } from '../contracts/ems-site-intent.js';

export interface IEmsIntentValidator {
  validate(intent: EmsSiteIntent): string[];
  isFresh(intent: EmsSiteIntent, nowIso?: string): boolean;
}
