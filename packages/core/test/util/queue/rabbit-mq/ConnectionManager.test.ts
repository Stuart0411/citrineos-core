// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { RabbitMQConnectionManager } from '../../../queue/rabbit-mq/ConnectionManager.js';

describe('RabbitMQConnectionManager', () => {
  it('raises max event listener threshold for multi-module lifecycle subscribers', () => {
    const manager = new RabbitMQConnectionManager(5000, 'amqp://localhost:5672');
    expect(manager.getMaxListeners()).toBe(30);
  });
});
