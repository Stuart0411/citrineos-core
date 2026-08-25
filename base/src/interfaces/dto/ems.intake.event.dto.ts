// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

export const EMS_INTAKE_EVENT_STATUSES = ['accepted', 'rejected'] as const;

export const EmsIntakeEventStatusSchema = z.enum(EMS_INTAKE_EVENT_STATUSES);

export const EMS_INTAKE_EVENT_REASON_CODES = [
  'stored',
  'invalid_payload',
  'policy_time_window_violation',
  'policy_bounds_violation',
  'policy_expired',
  'duplicate_message_id',
  'processing_error',
  'unknown_error',
] as const;

export const EmsIntakeEventReasonCodeSchema = z.enum(EMS_INTAKE_EVENT_REASON_CODES);

export const EmsIntakeEventSchema = z.object({
  status: EmsIntakeEventStatusSchema,
  reasonCode: EmsIntakeEventReasonCodeSchema,
  reason: z.string().min(1),
  receivedTopic: z.string().min(1),
  receivedAt: z.iso.datetime(),
  messageId: z.string().min(1).optional(),
  siteId: z.string().min(1).optional(),
  tenantId: z.number().int().optional(),
});

export const EmsIntakeEventProps = EmsIntakeEventSchema.keyof().enum;

export type EmsIntakeEventDto = z.infer<typeof EmsIntakeEventSchema>;
export type EmsIntakeEventStatus = z.infer<typeof EmsIntakeEventStatusSchema>;
export type EmsIntakeEventReasonCode = z.infer<typeof EmsIntakeEventReasonCodeSchema>;

export const emsIntakeEventSchemas = {
  EmsIntakeEvent: EmsIntakeEventSchema,
};