// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { EmsIntentEnvelope } from '../contracts/ems-intent-envelope.js';
import type { EmsSiteIntent } from '../contracts/ems-site-intent.js';
import type { IEmsIntentIngressAdapter } from '../interfaces/i-ems-intent-ingress-adapter.js';

const DEFAULT_TTL_SECONDS = 30;

export class RestIntentIngressAdapter implements IEmsIntentIngressAdapter {
  fromEnvelope(envelope: EmsIntentEnvelope): EmsSiteIntent {
    const timestamp = envelope.timestamp ?? new Date().toISOString();
    const expiresAt = envelope.expiresAt ?? this.defaultExpiry(timestamp);

    return {
      siteId: envelope.siteId,
      tenantId: envelope.tenantId,
      timestamp,
      expiresAt,
      operationMode: envelope.operationMode ?? 'ExternalLimits',
      constraints: envelope.constraints,
      metadata: {
        sourceSystem: envelope.source,
        reason: envelope.reason,
        emergencyCurtailed: envelope.emergencyCurtailed,
      },
    };
  }

  private defaultExpiry(timestamp: string): string {
    const base = Date.parse(timestamp);
    const expiresAt = Number.isFinite(base) ? base + DEFAULT_TTL_SECONDS * 1000 : Date.now() + DEFAULT_TTL_SECONDS * 1000;
    return new Date(expiresAt).toISOString();
  }
}
