// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { BaseSchema } from './types/base.dto.js';

export const EmsIntentModeSchema = z.enum([
  'ChargingOnly',
  'ExternalLimits',
  'CentralSetpoint',
  'ExternalSetpoint',
  'LocalFrequency',
  'LocalLoadBalancing',
  'Idle',
]);

export const EmsIntentSourceSchema = z.object({
  system: z.string().min(1),
  component: z.string().min(1),
  instance: z.string().min(1),
});

export const EmsIntentConstraintsSchema = z.object({
  maxImportW: z.number().nonnegative().nullable().optional(),
  maxExportW: z.number().nonnegative().nullable().optional(),
  evChargeBudgetW: z.number().nonnegative().nullable().optional(),
  evDischargeBudgetW: z.number().nonnegative().nullable().optional(),
  rampRateWPerSec: z.number().nonnegative().nullable().optional(),
});

export const EmsIntentFlagsSchema = z.object({
  allowDischarge: z.boolean().default(false),
  emergencyCurtailment: z.boolean().default(false),
});

export const EmsSiteIntentSchema = BaseSchema.extend({
  messageId: z.uuid(),
  siteId: z.string().min(1),
  source: EmsIntentSourceSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  mode: EmsIntentModeSchema,
  constraints: EmsIntentConstraintsSchema,
  flags: EmsIntentFlagsSchema.default({
    allowDischarge: false,
    emergencyCurtailment: false,
  }),
  reason: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).superRefine((value, ctx) => {
  const createdAt = new Date(value.createdAt);
  const expiresAt = new Date(value.expiresAt);

  if (expiresAt.getTime() <= createdAt.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'expiresAt must be later than createdAt',
      path: ['expiresAt'],
    });
  }
});

export const EmsSiteIntentProps = EmsSiteIntentSchema.keyof().enum;

export type EmsSiteIntentDto = z.infer<typeof EmsSiteIntentSchema>;

export const EmsSiteIntentCreateSchema = EmsSiteIntentSchema.omit({
  tenant: true,
  updatedAt: true,
});

export type EmsSiteIntentCreate = z.infer<typeof EmsSiteIntentCreateSchema>;

export const emsSiteIntentSchemas = {
  EmsSiteIntent: EmsSiteIntentSchema,
  EmsSiteIntentCreate: EmsSiteIntentCreateSchema,
};