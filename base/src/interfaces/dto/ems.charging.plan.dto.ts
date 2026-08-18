// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { ChargingProfilePurposeEnumSchema, ChargingRateUnitEnumSchema } from './types/enums.js';
import { OCPPVersionSchema } from './types/ocpp.message.js';

export const EmsChargingPlanStrategySchema = z.enum(['equal_share_online', 'equal_share_all']);
export const EmsOperationModeSchema = z.enum([
  'ChargingOnly',
  'ExternalLimits',
  'CentralSetpoint',
  'ExternalSetpoint',
  'LocalFrequency',
  'LocalLoadBalancing',
  'Idle',
]);

export const EmsChargingPlanRequestSchema = z.object({
  siteId: z.string().min(1),
  stationIds: z.array(z.string().min(1)).min(1),
  evseId: z.number().int().min(1).default(1),
  strategy: EmsChargingPlanStrategySchema.default('equal_share_online'),
  chargingProfilePurpose: ChargingProfilePurposeEnumSchema.default('ChargingStationMaxProfile'),
  operationMode: EmsOperationModeSchema.default('ExternalLimits'),
});

export const EmsChargingPlanRecommendationSchema = z.object({
  stationId: z.string(),
  isOnline: z.boolean().nullable(),
  protocol: OCPPVersionSchema.nullable().optional(),
  eligible: z.boolean(),
  eligibilityReason: z.string().nullable().optional(),
  evseId: z.number().int().min(1),
  chargingProfilePurpose: ChargingProfilePurposeEnumSchema,
  chargingProfileKind: z.literal('Dynamic'),
  chargingRateUnit: ChargingRateUnitEnumSchema,
  operationMode: EmsOperationModeSchema,
  limitW: z.number(),
  exportAllowed: z.boolean().default(false),
  dischargeLimitW: z.number().nullable().optional(),
  sourceIntentMessageId: z.string(),
});

export const EmsChargingPlanResponseSchema = z.object({
  siteId: z.string(),
  sourceIntentMessageId: z.string(),
  totalBudgetW: z.number(),
  eligibleStationCount: z.number().int().min(0),
  strategy: EmsChargingPlanStrategySchema,
  recommendations: z.array(EmsChargingPlanRecommendationSchema),
});

export const EmsApplyChargingPlanResultSchema = z.object({
  stationId: z.string(),
  applied: z.boolean(),
  reason: z.string().nullable().optional(),
  profileId: z.number().int().nullable().optional(),
  scheduleId: z.number().int().nullable().optional(),
  success: z.boolean(),
  payload: z.union([z.string(), z.any()]).optional(),
});

export const EmsApplyChargingPlanResponseSchema = z.object({
  siteId: z.string(),
  sourceIntentMessageId: z.string(),
  appliedCount: z.number().int().min(0),
  results: z.array(EmsApplyChargingPlanResultSchema),
});

export const EmsChargingPlanReconciliationResultSchema = z.object({
  stationId: z.string(),
  eligible: z.boolean(),
  protocol: OCPPVersionSchema.nullable().optional(),
  hasActiveProfile: z.boolean(),
  drifted: z.boolean(),
  reason: z.string().nullable().optional(),
  activeProfileId: z.number().int().nullable().optional(),
  plannedLimitW: z.number(),
  actualLimitW: z.number().nullable().optional(),
  plannedOperationMode: EmsOperationModeSchema,
  actualOperationMode: EmsOperationModeSchema.nullable().optional(),
});

export const EmsChargingPlanReconciliationResponseSchema = z.object({
  siteId: z.string(),
  sourceIntentMessageId: z.string(),
  comparedCount: z.number().int().min(0),
  driftedCount: z.number().int().min(0),
  results: z.array(EmsChargingPlanReconciliationResultSchema),
});

export type EmsChargingPlanRequest = z.infer<typeof EmsChargingPlanRequestSchema>;
export type EmsChargingPlanRecommendation = z.infer<typeof EmsChargingPlanRecommendationSchema>;
export type EmsChargingPlanResponse = z.infer<typeof EmsChargingPlanResponseSchema>;
export type EmsApplyChargingPlanResult = z.infer<typeof EmsApplyChargingPlanResultSchema>;
export type EmsApplyChargingPlanResponse = z.infer<typeof EmsApplyChargingPlanResponseSchema>;
export type EmsChargingPlanReconciliationResult = z.infer<
  typeof EmsChargingPlanReconciliationResultSchema
>;
export type EmsChargingPlanReconciliationResponse = z.infer<
  typeof EmsChargingPlanReconciliationResponseSchema
>;

export const emsChargingPlanSchemas = {
  EmsChargingPlanRequest: EmsChargingPlanRequestSchema,
  EmsChargingPlanResponse: EmsChargingPlanResponseSchema,
  EmsApplyChargingPlanResponse: EmsApplyChargingPlanResponseSchema,
  EmsChargingPlanReconciliationResponse: EmsChargingPlanReconciliationResponseSchema,
};
