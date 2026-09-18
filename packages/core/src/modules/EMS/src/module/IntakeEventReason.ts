// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { EmsIntakeEventReasonCode } from '@citrineos/base';
import { UniqueConstraintError } from 'sequelize';
import { ZodError } from 'zod';

export function mapEmsIntakeErrorToReasonCode(error: unknown): EmsIntakeEventReasonCode {
  if (error instanceof UniqueConstraintError) {
    return 'duplicate_message_id';
  }

  if (error instanceof ZodError || error instanceof SyntaxError) {
    return 'invalid_payload';
  }

  if (!(error instanceof Error)) {
    return 'unknown_error';
  }

  if (error.message.includes('stale') || error.message.includes('future')) {
    return 'policy_time_window_violation';
  }

  if (error.message.includes('maxPowerW')) {
    return 'policy_bounds_violation';
  }

  if (error.message.includes('expiresAt')) {
    return 'policy_expired';
  }

  return 'processing_error';
}

export function mapEmsIntakeErrorToReason(error: unknown): string {
  if (error instanceof UniqueConstraintError) {
    return 'Duplicate messageId';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Failed processing EMS MQTT message';
}