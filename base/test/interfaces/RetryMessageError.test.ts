// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  RetryMessageError,
  RetryMessageErrorCode,
} from '../../src/interfaces/messages/internal-types.js';
import { RetryMessageErrorCode as RetryMessageErrorCodeFromPackage } from '../../index.js';

describe('RetryMessageError', () => {
  it('preserves the retry reason message', () => {
    const err = new RetryMessageError('temporary outage');

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('temporary outage');
  });

  it('has undefined code when no retry code is supplied', () => {
    const err = new RetryMessageError('temporary outage');

    expect(err.code).toBeUndefined();
  });

  it('stores an explicit retry code when supplied', () => {
    const err = new RetryMessageError(
      'Call already in progress',
      RetryMessageErrorCode.CallInProgress,
    );

    expect(err.code).toBe(RetryMessageErrorCode.CallInProgress);
  });

  it('re-exports RetryMessageErrorCode from the package root', () => {
    expect(RetryMessageErrorCodeFromPackage.CallInProgress).toBe(
      RetryMessageErrorCode.CallInProgress,
    );
  });
});
