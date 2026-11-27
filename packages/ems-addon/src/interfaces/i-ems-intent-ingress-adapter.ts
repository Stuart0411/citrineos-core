// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { EmsIntentEnvelope, TopicValueMessage } from '../contracts/ems-intent-envelope.js';
import type { EmsSiteIntent } from '../contracts/ems-site-intent.js';

export interface IEmsIntentIngressAdapter {
  fromEnvelope(envelope: EmsIntentEnvelope): EmsSiteIntent;
}

export interface IEmsMqttIngressAdapter extends IEmsIntentIngressAdapter {
  fromTopicValue(topic: string, message: TopicValueMessage): EmsSiteIntent | null;
}
