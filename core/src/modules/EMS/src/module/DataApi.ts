// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type {
  CreateEmsSiteIntentQuerystring,
  EmsDecisionQuerystring,
  EmsIntakeTelemetryQuerystring,
  EmsSiteIntentQuerystring,
} from '@dal/interfaces/index.js';
import {
  CreateEmsSiteIntentQuerySchema,
  EmsDecisionQuerySchema,
  EmsIntakeTelemetryQuerySchema,
  EmsSiteIntentQuerySchema,
} from '@dal/interfaces/index.js';
import { EmsDecision, EmsSiteIntent } from '@dal/layers/sequelize/index.js';
import {
  EmsChargingPlanRequestSchema,
  AbstractModuleApi,
  AsDataEndpoint,
  BadRequestError,
  EmsSiteIntentCreateSchema,
  HttpMethod,
  Namespace,
  OCPP1_6_Namespace,
  OCPP2_Namespace,
} from '@citrineos/base';
import type {
  EmsApplyChargingPlanResponse,
  EmsChargingPlanReconciliationResponse,
  EmsChargingPlanRequest,
  EmsChargingPlanResponse,
  EmsSiteIntentCreate,
} from '@citrineos/base';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Op } from 'sequelize';
import { UniqueConstraintError } from 'sequelize';
import type { ILogObj } from 'tslog';
import { Logger } from 'tslog';
import { z } from 'zod';
import type { IEmsModuleApi } from './interface.js';
import { validateEmsIntentPolicy } from './IntentValidation.js';
import { EmsModule, type EmsAutoApplyConfig } from './module.js';
import { TenantQuerySchema, type TenantQueryString } from '@dal/interfaces/index.js';

const EmsAutoApplyConfigBodySchema = {
  $id: 'EmsAutoApplyConfigBodySchema',
  ...z.toJSONSchema(
    z.object({
      siteId: z.string().min(1),
      stationIds: z.array(z.string().min(1)).min(1),
      evseId: z.number().int().min(1).default(1),
      strategy: z.enum(['equal_share_online', 'equal_share_all']).default('equal_share_online'),
      chargingProfilePurpose: z.string().min(1).default('ChargingStationExternalConstraints'),
      operationMode: z.string().min(1).default('ExternalLimits'),
      applicationPath: z.enum(['absolute', 'dynamic']).default('absolute'),
      enabled: z.boolean().default(true),
    }),
    { target: 'draft-7', reused: 'ref' },
  ),
};

const EmsSiteIntentCreateBodySchema = {
  $id: 'EmsSiteIntentCreateBodySchema',
  ...z.toJSONSchema(EmsSiteIntentCreateSchema, { target: 'draft-7', reused: 'ref' }),
};

const EmsChargingPlanRequestBodySchema = {
  $id: 'EmsChargingPlanRequestBodySchema',
  ...z.toJSONSchema(EmsChargingPlanRequestSchema, { target: 'draft-7', reused: 'ref' }),
};

export class EmsDataApi extends AbstractModuleApi<EmsModule> implements IEmsModuleApi {
  constructor(emsModule: EmsModule, server: FastifyInstance, logger?: Logger<ILogObj>) {
    super(emsModule, server, null, logger);
  }

  @AsDataEndpoint(
    Namespace.EmsSiteIntent,
    HttpMethod.Post,
    CreateEmsSiteIntentQuerySchema,
    EmsSiteIntentCreateBodySchema,
  )
  async createSiteIntent(
    request: FastifyRequest<{
      Body: EmsSiteIntentCreate;
      Querystring: CreateEmsSiteIntentQuerystring;
    }>,
  ): Promise<EmsSiteIntent> {
    const tenantId = request.query.tenantId;
    if (request.body.tenantId !== undefined && request.body.tenantId !== tenantId) {
      throw new BadRequestError('tenantId in body must match tenantId in query');
    }

    const normalizedIntent: EmsSiteIntentCreate = {
      ...request.body,
      tenantId,
    };

    try {
      validateEmsIntentPolicy(this._module.config, normalizedIntent);
      return await this._module.emsSiteIntentRepository.createSiteIntent(
        tenantId,
        normalizedIntent,
      );
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new BadRequestError(
          `Duplicate EMS site intent messageId ${normalizedIntent.messageId}`,
        );
      }
      if (error instanceof BadRequestError) {
        throw error;
      }
      throw new BadRequestError(error instanceof Error ? error.message : 'Invalid EMS site intent');
    }
  }

  @AsDataEndpoint(Namespace.EmsSiteIntent, HttpMethod.Get, EmsSiteIntentQuerySchema)
  async getSiteIntents(
    request: FastifyRequest<{ Querystring: EmsSiteIntentQuerystring }>,
  ): Promise<EmsSiteIntent[]> {
    const { tenantId, siteId, messageId, currentOnly } = request.query;

    if (currentOnly) {
      if (!siteId) {
        throw new BadRequestError('siteId is required when currentOnly is true');
      }
      const currentIntent = await this._module.emsSiteIntentRepository.readLatestActiveBySiteId(
        tenantId,
        siteId,
      );
      return currentIntent ? [currentIntent] : [];
    }

    if (siteId) {
      return this._module.emsSiteIntentRepository.readAllBySiteId(tenantId, siteId);
    }

    if (messageId) {
      const intent = await this._module.emsSiteIntentRepository.readOnlyOneByQuery(tenantId, {
        where: { messageId },
      });
      return intent ? [intent] : [];
    }

    return this._module.emsSiteIntentRepository.readAllByQuery(tenantId, {
      order: [['intentCreatedAt', 'DESC']],
      limit: 100,
    });
  }

  @AsDataEndpoint(Namespace.EmsMqttBridge, HttpMethod.Get)
  getMqttBridgeStatus(): {
    enabled: boolean;
    started: boolean;
    startupMode: 'non_fatal' | 'required' | null;
    siteIntentsTopic: string | null;
  } {
    return this._module.getMqttBridgeStatus();
  }

  @AsDataEndpoint(Namespace.EmsDecision, HttpMethod.Get, EmsDecisionQuerySchema)
  async getDecisions(
    request: FastifyRequest<{ Querystring: EmsDecisionQuerystring }>,
  ): Promise<EmsDecision[]> {
    const {
      tenantId,
      siteId,
      stationId,
      decisionType,
      intentMessageId,
      fromCreatedAt,
      toCreatedAt,
      limit,
    } = request.query;

    const fromDate = fromCreatedAt ? new Date(fromCreatedAt) : undefined;
    const toDate = toCreatedAt ? new Date(toCreatedAt) : undefined;

    if (fromDate && Number.isNaN(fromDate.getTime())) {
      throw new BadRequestError('fromCreatedAt must be a valid datetime string');
    }
    if (toDate && Number.isNaN(toDate.getTime())) {
      throw new BadRequestError('toCreatedAt must be a valid datetime string');
    }
    if (fromDate && toDate && toDate < fromDate) {
      throw new BadRequestError('toCreatedAt must be greater than or equal to fromCreatedAt');
    }

    const where: Record<string, unknown> = {};
    if (siteId) {
      where.siteId = siteId;
    }
    if (stationId) {
      where.stationId = stationId;
    }
    if (decisionType) {
      where.decisionType = decisionType;
    }
    if (intentMessageId) {
      where.intentMessageId = intentMessageId;
    }

    if (fromDate || toDate) {
      const createdAtFilter: Record<symbol, Date> = {};
      if (fromDate) {
        createdAtFilter[Op.gte] = fromDate;
      }
      if (toDate) {
        createdAtFilter[Op.lte] = toDate;
      }
      where.createdAt = createdAtFilter;
    }

    const boundedLimit = Math.min(Math.max(limit ?? 100, 1), 500);
    return this._module.emsDecisionRepository.readAllByQuery(tenantId, {
      where,
      order: [['createdAt', 'DESC']],
      limit: boundedLimit,
    });
  }

  @AsDataEndpoint(Namespace.EmsIntakeTelemetry, HttpMethod.Get, EmsIntakeTelemetryQuerySchema)
  async getIntakeTelemetrySummary(
    request: FastifyRequest<{ Querystring: EmsIntakeTelemetryQuerystring }>,
  ): Promise<{
    tenantId: number;
    siteId: string | null;
    total: number;
    accepted: number;
    rejected: number;
    byReasonCode: Record<string, number>;
    latestCreatedAt: string | null;
  }> {
    const { tenantId, siteId, fromCreatedAt, toCreatedAt, limit } = request.query;

    const fromDate = fromCreatedAt ? new Date(fromCreatedAt) : undefined;
    const toDate = toCreatedAt ? new Date(toCreatedAt) : undefined;

    if (fromDate && Number.isNaN(fromDate.getTime())) {
      throw new BadRequestError('fromCreatedAt must be a valid datetime string');
    }
    if (toDate && Number.isNaN(toDate.getTime())) {
      throw new BadRequestError('toCreatedAt must be a valid datetime string');
    }
    if (fromDate && toDate && toDate < fromDate) {
      throw new BadRequestError('toCreatedAt must be greater than or equal to fromCreatedAt');
    }

    const where: Record<string, unknown> = {
      decisionType: 'intake_result',
    };
    if (siteId) {
      where.siteId = siteId;
    }

    if (fromDate || toDate) {
      const createdAtFilter: Record<symbol, Date> = {};
      if (fromDate) {
        createdAtFilter[Op.gte] = fromDate;
      }
      if (toDate) {
        createdAtFilter[Op.lte] = toDate;
      }
      where.createdAt = createdAtFilter;
    }

    const boundedLimit = Math.min(Math.max(limit ?? 500, 1), 2000);
    const decisions = await this._module.emsDecisionRepository.readAllByQuery(tenantId, {
      where,
      order: [['createdAt', 'DESC']],
      limit: boundedLimit,
    });

    const byReasonCode: Record<string, number> = {};
    let accepted = 0;
    let rejected = 0;

    for (const decision of decisions) {
      const decisionJson = decision.decisionJson as Record<string, unknown> | undefined;
      const status = decisionJson?.status;
      const reasonCode = decisionJson?.reasonCode;

      if (status === 'accepted') {
        accepted += 1;
      } else if (status === 'rejected') {
        rejected += 1;
      }

      if (typeof reasonCode === 'string' && reasonCode.length > 0) {
        byReasonCode[reasonCode] = (byReasonCode[reasonCode] ?? 0) + 1;
      }
    }

    return {
      tenantId,
      siteId: siteId ?? null,
      total: decisions.length,
      accepted,
      rejected,
      byReasonCode,
      latestCreatedAt: decisions[0]?.createdAt
        ? new Date(decisions[0].createdAt).toISOString()
        : null,
    };
  }

  @AsDataEndpoint(Namespace.EmsMqttBridge, HttpMethod.Post)
  async startMqttBridge(): Promise<{
    enabled: boolean;
    started: boolean;
    startupMode: 'non_fatal' | 'required' | null;
    siteIntentsTopic: string | null;
  }> {
    await this._module.startMqttBridge();
    return this._module.getMqttBridgeStatus();
  }

  @AsDataEndpoint(Namespace.EmsMqttBridge, HttpMethod.Delete)
  async stopMqttBridge(): Promise<{
    enabled: boolean;
    started: boolean;
    startupMode: 'non_fatal' | 'required' | null;
    siteIntentsTopic: string | null;
  }> {
    await this._module.stopMqttBridge();
    return this._module.getMqttBridgeStatus();
  }

  @AsDataEndpoint(
    Namespace.EmsChargingPlan,
    HttpMethod.Post,
    TenantQuerySchema,
    EmsChargingPlanRequestBodySchema,
  )
  async deriveChargingPlan(
    request: FastifyRequest<{
      Body: EmsChargingPlanRequest;
      Querystring: TenantQueryString;
    }>,
  ): Promise<EmsChargingPlanResponse> {
    const plan = await this._module.deriveChargingPlan(request.query.tenantId, request.body);
    if (!plan) {
      throw new BadRequestError(`No active EMS site intent found for site ${request.body.siteId}`);
    }
    return plan;
  }

  @AsDataEndpoint(
    Namespace.EmsChargingPlan,
    HttpMethod.Put,
    TenantQuerySchema,
    EmsChargingPlanRequestBodySchema,
  )
  async applyChargingPlan(
    request: FastifyRequest<{
      Body: EmsChargingPlanRequest;
      Querystring: TenantQueryString;
    }>,
  ): Promise<EmsApplyChargingPlanResponse> {
    const applied = await this._module.applyChargingPlan(request.query.tenantId, request.body);
    if (!applied) {
      throw new BadRequestError(`No active EMS site intent found for site ${request.body.siteId}`);
    }
    return applied;
  }

  @AsDataEndpoint(
    Namespace.EmsChargingPlan,
    HttpMethod.Patch,
    TenantQuerySchema,
    EmsChargingPlanRequestBodySchema,
  )
  async reconcileChargingPlan(
    request: FastifyRequest<{
      Body: EmsChargingPlanRequest;
      Querystring: TenantQueryString;
    }>,
  ): Promise<EmsChargingPlanReconciliationResponse> {
    const reconciled = await this._module.reconcileChargingPlan(
      request.query.tenantId,
      request.body,
    );
    if (!reconciled) {
      throw new BadRequestError(`No active EMS site intent found for site ${request.body.siteId}`);
    }
    return reconciled;
  }

  protected _toDataPath(input: OCPP2_Namespace | OCPP1_6_Namespace | Namespace): string {
    const endpointPrefix = this._module.config.modules.ems?.endpointPrefix || undefined;
    return super._toDataPath(input, endpointPrefix);
  }

  @AsDataEndpoint(Namespace.EmsAutoApply, HttpMethod.Get, TenantQuerySchema)
  getAutoApplyConfigs(
    request: FastifyRequest<{ Querystring: TenantQueryString }>,
  ): EmsAutoApplyConfig[] {
    return this._module.getAllAutoApplyConfigs(request.query.tenantId);
  }

  @AsDataEndpoint(
    Namespace.EmsAutoApply,
    HttpMethod.Post,
    TenantQuerySchema,
    EmsAutoApplyConfigBodySchema,
  )
  setAutoApplyConfig(
    request: FastifyRequest<{ Querystring: TenantQueryString; Body: EmsAutoApplyConfig }>,
  ): EmsAutoApplyConfig {
    const config: EmsAutoApplyConfig = {
      siteId: request.body.siteId,
      stationIds: request.body.stationIds,
      evseId: request.body.evseId ?? 1,
      strategy: request.body.strategy ?? 'equal_share_online',
      chargingProfilePurpose:
        request.body.chargingProfilePurpose ?? 'ChargingStationExternalConstraints',
      operationMode: request.body.operationMode ?? 'ExternalLimits',
      applicationPath: request.body.applicationPath ?? 'absolute',
      enabled: request.body.enabled !== false,
    };
    this._module.setAutoApplyConfig(request.query.tenantId, config);
    return config;
  }

  @AsDataEndpoint(Namespace.EmsAutoApply, HttpMethod.Delete, TenantQuerySchema)
  deleteAutoApplyConfig(
    request: FastifyRequest<{ Querystring: TenantQueryString & { siteId?: string } }>,
  ): { deleted: boolean } {
    const { tenantId, siteId } = request.query as { tenantId: number; siteId?: string };
    if (!siteId) {
      throw new BadRequestError('siteId query param is required');
    }
    this._module.removeAutoApplyConfig(tenantId, siteId);
    return { deleted: true };
  }
}
