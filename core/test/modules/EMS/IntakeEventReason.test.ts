// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { UniqueConstraintError } from 'sequelize';
import { z } from 'zod';
import {
  mapEmsIntakeErrorToReason,
  mapEmsIntakeErrorToReasonCode,
} from '../../../src/modules/EMS/src/module/IntakeEventReason.js';

describe('IntakeEventReason', () => {
  it('maps duplicate constraint errors to duplicate_message_id', () => {
    const duplicateError = new UniqueConstraintError({ message: 'duplicate', errors: [] });
    expect(mapEmsIntakeErrorToReasonCode(duplicateError)).toBe('duplicate_message_id');
    expect(mapEmsIntakeErrorToReason(duplicateError)).toBe('Duplicate messageId');
  });

  it('maps zod and syntax errors to invalid_payload', () => {
    expect(mapEmsIntakeErrorToReasonCode(new z.ZodError([]))).toBe('invalid_payload');
    expect(mapEmsIntakeErrorToReasonCode(new SyntaxError('bad json'))).toBe('invalid_payload');
  });

  it('maps policy timing and bounds errors to specific policy reason codes', () => {
    expect(mapEmsIntakeErrorToReasonCode(new Error('EMS intent is stale by 1ms'))).toBe(
      'policy_time_window_violation',
    );
    expect(mapEmsIntakeErrorToReasonCode(new Error('EMS intent createdAt is too far in the future by 1ms'))).toBe(
      'policy_time_window_violation',
    );
    expect(mapEmsIntakeErrorToReasonCode(new Error('maxImportW exceeds configured maxPowerW (1000)'))).toBe(
      'policy_bounds_violation',
    );
    expect(mapEmsIntakeErrorToReasonCode(new Error('EMS intent expiresAt is already in the past'))).toBe(
      'policy_expired',
    );
  });

  it('maps unknown and generic errors to fallback codes', () => {
    expect(mapEmsIntakeErrorToReasonCode(new Error('unexpected'))).toBe('processing_error');
    expect(mapEmsIntakeErrorToReasonCode({ arbitrary: true })).toBe('unknown_error');
    expect(mapEmsIntakeErrorToReason({ arbitrary: true })).toBe('Failed processing EMS MQTT message');
  });
});