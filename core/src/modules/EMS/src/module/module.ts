// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type {
  EmsApplyChargingPlanResponse,
  EmsChargingPlanReconciliationResponse,
  EmsChargingPlanRequest,
  BootstrapConfig,
  CallAction,
  ChargingLimitSourceEnumType,
  ICache,
  IMessage,
  IMessageConfirmation,
  IMessageHandler,
  IMessageSender,
  OCPP2_common_types,
  OCPP2_request_types,
  OCPP2_response_types,
  SystemConfig,
} from '@citrineos/base';
import {
  AbstractModule,
  AsHandler,
  ChargingLimitSourceEnum,
  ChargingProfileStatusEnum,
  ChargingStationSequenceTypeEnum,
  EventGroup,
  OCPPValidator,
  OCPP_2_VER_LIST,
} from '@citrineos/base';
import { OCPP2_0_1, OCPP2_1, OCPP_CallAction, OCPPVersion } from '@citrineos/base';
import type {
  IChargingProfileRepository,
  IDeviceModelRepository,
  IEmsDecisionRepository,
  IEmsSiteIntentRepository,
  IStationEnergyTransferPolicyRepository,
} from '@dal/interfaces/repositories.js';
import type { ILocationRepository } from '@dal/interfaces/repositories.js';
import * as OCPP2_0_1_Mapper from '@dal/layers/sequelize/mapper/2.0.1/index.js';
import {
  SequelizeChargingProfileRepository,
  SequelizeChargingStationSequenceRepository,
  SequelizeDeviceModelRepository,
  SequelizeEmsDecisionRepository,
  SequelizeEmsSiteIntentRepository,
  SequelizeLocationRepository,
} from '@dal/layers/sequelize/index.js';
import { Op } from 'sequelize';
import { IdGenerator } from '@util/util/idGenerator.js';
import type { ILogObj } from 'tslog';
import { Logger } from 'tslog';
import { EmsMqttBridge } from './MqttBridge.js';
import { EmsPolicyEngine } from './PolicyEngine.js';

export type EmsAutoApplyConfig = {
  siteId: string;
  stationIds: string[];
  evseId: number;
  strategy: EmsChargingPlanRequest['strategy'];
  profileOption?: EmsChargingPlanRequest['profileOption'];
  chargingProfilePurpose: EmsChargingPlanRequest['chargingProfilePurpose'];
  operationMode: EmsChargingPlanRequest['operationMode'];
  applicationPath: EmsChargingPlanRequest['applicationPath'];
  enabled: boolean;
};

type DynamicProfileSnapshot = {
  id?: unknown;
  chargingSchedule?: Array<{
    chargingSchedulePeriod?: Array<Record<string, unknown>>;
  }>;
};

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export class EmsModule extends AbstractModule {
  _requests: CallAction[] = [];
  _responses: CallAction[] = [];
  protected _emsSiteIntentRepository: IEmsSiteIntentRepository;
  protected _emsDecisionRepository: IEmsDecisionRepository;
  protected _locationRepository: ILocationRepository;
  protected _chargingProfileRepository: IChargingProfileRepository;
  protected _deviceModelRepository: IDeviceModelRepository;
  protected _stationEnergyTransferPolicyRepository?: IStationEnergyTransferPolicyRepository;
  protected _mqttBridge: EmsMqttBridge;
  protected _policyEngine: EmsPolicyEngine;
  protected _idGenerator: IdGenerator;
  private _autoApplyConfigs: Map<string, EmsAutoApplyConfig> = new Map();
  // Prevent concurrent applications and debounce rapid MQTT intent bursts per site key.
  private _autoApplyInFlight: Set<string> = new Set();
  private _autoApplyDebounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  // Fingerprint per "tenantId:stationId:evseId" to skip applying unchanged limits.
  private _lastAppliedFingerprints: Map<string, string> = new Map();

  private _getMaxProfileClearSetDelayMs(): number {
    const configuredDelay = this.config.modules.ems?.maxProfileClearSetDelayMs;
    if (
      typeof configuredDelay === 'number' &&
      Number.isFinite(configuredDelay) &&
      configuredDelay >= 0
    ) {
      return Math.floor(configuredDelay);
    }

    return 750;
  }

  private async _sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private static _createNoopDeviceModelRepository(): IDeviceModelRepository {
    return {
      readAllByQuerystring: async () => [],
    } as unknown as IDeviceModelRepository;
  }

  constructor(
    config: BootstrapConfig & SystemConfig,
    cache: ICache,
    sender: IMessageSender,
    handler: IMessageHandler,
    logger?: Logger<ILogObj>,
    ocppValidator?: OCPPValidator,
    emsSiteIntentRepository?: IEmsSiteIntentRepository,
    emsDecisionRepository?: IEmsDecisionRepository,
    locationRepository?: ILocationRepository,
    chargingProfileRepository?: IChargingProfileRepository,
    idGenerator?: IdGenerator,
    deviceModelRepository?: IDeviceModelRepository,
    stationEnergyTransferPolicyRepository?: IStationEnergyTransferPolicyRepository,
  ) {
    super(config, cache, handler, sender, EventGroup.Ems, logger, ocppValidator);
    this._requests = Array.from(
      new Set([...(config.modules.ems?.requests ?? []), OCPP_CallAction.ReportChargingProfiles]),
    );
    this._responses = Array.from(
      new Set([
        ...(config.modules.ems?.responses ?? []),
        OCPP_CallAction.SetChargingProfile,
        OCPP_CallAction.ClearChargingProfile,
      ]),
    );
    this._emsSiteIntentRepository =
      emsSiteIntentRepository || new SequelizeEmsSiteIntentRepository(config, logger);
    this._emsDecisionRepository =
      emsDecisionRepository || new SequelizeEmsDecisionRepository(config, logger);
    this._locationRepository =
      locationRepository || new SequelizeLocationRepository(config, logger);
    this._chargingProfileRepository =
      chargingProfileRepository || new SequelizeChargingProfileRepository(config, logger);
    this._deviceModelRepository =
      deviceModelRepository ||
      ((config as { database?: unknown }).database
        ? new SequelizeDeviceModelRepository(config, logger)
        : EmsModule._createNoopDeviceModelRepository());
    this._stationEnergyTransferPolicyRepository = stationEnergyTransferPolicyRepository;
    this._mqttBridge = new EmsMqttBridge(
      config,
      this._emsSiteIntentRepository,
      this._logger,
      undefined,
      this._emsDecisionRepository,
      (tenantId: number, siteId: string) => void this.maybeAutoApply(tenantId, siteId),
    );
    this._policyEngine = new EmsPolicyEngine(
      this._emsSiteIntentRepository,
      this._locationRepository,
      this._deviceModelRepository,
      this._stationEnergyTransferPolicyRepository,
    );
    this._idGenerator =
      idGenerator ||
      new IdGenerator(new SequelizeChargingStationSequenceRepository(config, this._logger));
  }

  get emsSiteIntentRepository(): IEmsSiteIntentRepository {
    return this._emsSiteIntentRepository;
  }

  get emsDecisionRepository(): IEmsDecisionRepository {
    return this._emsDecisionRepository;
  }

  setAutoApplyConfig(tenantId: number, config: EmsAutoApplyConfig): void {
    this._autoApplyConfigs.set(`${tenantId}:${config.siteId}`, config);
  }

  getAutoApplyConfig(tenantId: number, siteId: string): EmsAutoApplyConfig | undefined {
    return this._autoApplyConfigs.get(`${tenantId}:${siteId}`);
  }

  getAllAutoApplyConfigs(tenantId: number): EmsAutoApplyConfig[] {
    return Array.from(this._autoApplyConfigs.entries())
      .filter(([key]) => key.startsWith(`${tenantId}:`))
      .map(([, value]) => value);
  }

  removeAutoApplyConfig(tenantId: number, siteId: string): void {
    this._autoApplyConfigs.delete(`${tenantId}:${siteId}`);
  }

  async maybeAutoApply(tenantId: number, siteId: string): Promise<void> {
    const config = this._autoApplyConfigs.get(`${tenantId}:${siteId}`);
    if (!config || !config.enabled || config.stationIds.length === 0) {
      return;
    }
    const key = `${tenantId}:${siteId}`;
    // Debounce: cancel any pending call for this site and schedule a fresh one.
    const existing = this._autoApplyDebounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    const debounceMs = (this.config as any).modules?.ems?.autoApplyDebounceMs ?? 2000;
    const timer = setTimeout(() => {
      this._autoApplyDebounceTimers.delete(key);
      void this._runAutoApply(tenantId, siteId, config);
    }, debounceMs);
    this._autoApplyDebounceTimers.set(key, timer);
  }

  private async _runAutoApply(
    tenantId: number,
    siteId: string,
    config: EmsAutoApplyConfig,
  ): Promise<void> {
    const key = `${tenantId}:${siteId}`;
    if (this._autoApplyInFlight.has(key)) {
      this._logger.debug(`EMS auto-apply already in flight for ${key}, skipping.`);
      return;
    }
    this._autoApplyInFlight.add(key);
    try {
      await this.applyChargingPlan(tenantId, {
        siteId: config.siteId,
        stationIds: config.stationIds,
        evseId: config.evseId,
        strategy: config.strategy,
        profileOption: config.profileOption,
        chargingProfilePurpose: config.chargingProfilePurpose,
        operationMode: config.operationMode,
        applicationPath: config.applicationPath,
      });
      this._logger.debug(
        `EMS auto-apply triggered for site ${siteId} → ${config.stationIds.join(',')}`,
      );
    } catch (err) {
      this._logger.warn(
        `EMS auto-apply failed for site ${siteId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this._autoApplyInFlight.delete(key);
    }
  }

  async deriveChargingPlan(tenantId: number, request: EmsChargingPlanRequest) {
    const normalizedRequest = this._normalizeChargingPlanRequest(request);
    return this._policyEngine.deriveChargingPlan(tenantId, normalizedRequest);
  }

  async applyChargingPlan(
    tenantId: number,
    request: EmsChargingPlanRequest,
  ): Promise<EmsApplyChargingPlanResponse | null> {
    const normalizedRequest = this._normalizeChargingPlanRequest(request);
    const plan = await this.deriveChargingPlan(tenantId, normalizedRequest);
    if (!plan) {
      return null;
    }

    const results = [] as EmsApplyChargingPlanResponse['results'];
    const applicationPath = normalizedRequest.applicationPath ?? 'absolute';

    for (const recommendation of plan.recommendations) {
      if (!recommendation.eligible) {
        const reason =
          recommendation.eligibilityReason ??
          'Station not eligible for current allocation strategy';
        results.push({
          stationId: recommendation.stationId,
          applied: false,
          reason,
          success: false,
        });
        await this._persistEmsDecision(tenantId, {
          siteId: plan.siteId,
          stationId: recommendation.stationId,
          evseId: recommendation.evseId,
          intentMessageId: plan.sourceIntentMessageId,
          decisionType: 'apply_skipped',
          decisionJson: {
            reason,
            protocol: recommendation.protocol,
            recommendation,
          },
        });
        continue;
      }

      if (
        recommendation.protocol !== OCPPVersion.OCPP2_1 &&
        recommendation.protocol !== OCPPVersion.OCPP2_0_1
      ) {
        results.push({
          stationId: recommendation.stationId,
          applied: false,
          reason: `Station protocol ${recommendation.protocol ?? 'unknown'} is not compatible with EMS charging-profile fallback`,
          success: false,
        });
        await this._persistEmsDecision(tenantId, {
          siteId: plan.siteId,
          stationId: recommendation.stationId,
          evseId: recommendation.evseId,
          intentMessageId: plan.sourceIntentMessageId,
          decisionType: 'apply_skipped',
          decisionJson: {
            reason: `Station protocol ${recommendation.protocol ?? 'unknown'} is not compatible with EMS charging-profile fallback`,
            protocol: recommendation.protocol,
            recommendation,
          },
        });
        continue;
      }

      // Skip the application if the effective limits are unchanged from the last apply.
      const fingerprintKey = `${tenantId}:${recommendation.stationId}:${recommendation.evseId}:${recommendation.chargingProfilePurpose}`;
      const newFingerprint = JSON.stringify({
        limitW: recommendation.limitW,
        dischargeLimitW: recommendation.dischargeLimitW ?? null,
      });
      if (this._lastAppliedFingerprints.get(fingerprintKey) === newFingerprint) {
        this._logger.debug(
          `EMS skipping unchanged profile for ${recommendation.stationId} evse=${recommendation.evseId}`,
        );
        results.push({
          stationId: recommendation.stationId,
          applied: false,
          reason: 'No change from last applied profile',
          success: true,
        });
        await this._persistEmsDecision(tenantId, {
          siteId: plan.siteId,
          stationId: recommendation.stationId,
          evseId: recommendation.evseId,
          intentMessageId: plan.sourceIntentMessageId,
          decisionType: 'apply_skipped',
          decisionJson: { reason: 'No change from last applied profile', recommendation },
        });
        continue;
      }

      if (applicationPath === 'dynamic') {
        const dynamicApplyResult = await this._applyDynamicSchedule(
          tenantId,
          recommendation.stationId,
          recommendation.evseId,
          recommendation.protocol,
          recommendation.limitW,
          recommendation.dischargeLimitW ?? null,
          recommendation.operationMode,
        );

        if (dynamicApplyResult.applied) {
          this._lastAppliedFingerprints.set(fingerprintKey, newFingerprint);
        }

        results.push({
          stationId: recommendation.stationId,
          applied: dynamicApplyResult.applied,
          profileId: dynamicApplyResult.profileId ?? null,
          scheduleId: null,
          success: dynamicApplyResult.applied,
          payload: dynamicApplyResult.payload,
          reason: dynamicApplyResult.reason,
        });

        await this._persistEmsDecision(tenantId, {
          siteId: plan.siteId,
          stationId: recommendation.stationId,
          evseId: recommendation.evseId,
          intentMessageId: plan.sourceIntentMessageId,
          decisionType: dynamicApplyResult.applied ? 'apply_result' : 'apply_skipped',
          decisionJson: {
            applicationPath,
            profileId: dynamicApplyResult.profileId ?? null,
            confirmation: dynamicApplyResult.payload ?? null,
            recommendation,
            reason: dynamicApplyResult.reason,
          },
        });
        continue;
      }

      const profileId = await this._chargingProfileRepository.getNextChargingProfileId(
        tenantId,
        recommendation.stationId,
      );
      const scheduleId = await this._chargingProfileRepository.getNextChargingScheduleId(
        tenantId,
        recommendation.stationId,
      );
      // EMS always uses stack level 0 so SetChargingProfile replaces the previous EMS profile in-place.
      const stackLevel = 0;

      // OCPP 2.1: station-level profiles must use evseId 0.
      const stationLevelPurposes = [
        OCPP2_1.ChargingProfilePurposeEnumType.ChargingStationMaxProfile as string,
        OCPP2_1.ChargingProfilePurposeEnumType.ChargingStationExternalConstraints as string,
      ];
      const ocppEvseId = stationLevelPurposes.includes(recommendation.chargingProfilePurpose)
        ? 0
        : recommendation.evseId;

      const isMaxChargingProfile =
        recommendation.chargingProfilePurpose ===
        OCPP2_1.ChargingProfilePurposeEnumType.ChargingStationMaxProfile;

      if (isMaxChargingProfile) {
        try {
          await this.sendCall(
            recommendation.stationId,
            tenantId,
            recommendation.protocol as OCPPVersion,
            OCPP_CallAction.ClearChargingProfile,
            {
              chargingProfileCriteria: {
                chargingProfilePurpose:
                  OCPP2_1.ChargingProfilePurposeEnumType.ChargingStationMaxProfile,
                stackLevel: 0,
                evseId: 0,
              },
            } as OCPP2_request_types.ClearChargingProfileRequest,
          );
        } catch {
          // Ignore ClearChargingProfile failures — proceed with SetChargingProfile.
        }

        // Some stations process ClearChargingProfile asynchronously; wait before SetChargingProfile
        // to avoid the new profile being cleared by the prior clear operation.
        await this._sleep(this._getMaxProfileClearSetDelayMs());
      }

      const validFrom = new Date().toISOString();
      const startSchedule = new Date().toISOString();
      const fallbackPurpose =
        recommendation.chargingProfilePurpose ===
          OCPP2_0_1.ChargingProfilePurposeEnumType.TxProfile ||
        recommendation.chargingProfilePurpose ===
          OCPP2_0_1.ChargingProfilePurposeEnumType.TxDefaultProfile ||
        recommendation.chargingProfilePurpose ===
          OCPP2_0_1.ChargingProfilePurposeEnumType.ChargingStationMaxProfile
          ? (recommendation.chargingProfilePurpose as OCPP2_0_1.ChargingProfilePurposeEnumType)
          : OCPP2_0_1.ChargingProfilePurposeEnumType.ChargingStationMaxProfile;

      const protocol = recommendation.protocol as OCPPVersion;
      const chargingProfile: OCPP2_1.ChargingProfileType | OCPP2_0_1.ChargingProfileType =
        protocol === OCPPVersion.OCPP2_1
          ? {
              id: profileId,
              stackLevel,
              chargingProfilePurpose:
                recommendation.chargingProfilePurpose as OCPP2_1.ChargingProfilePurposeEnumType,
              chargingProfileKind: OCPP2_1.ChargingProfileKindEnumType.Absolute,
              validFrom,
              chargingSchedule: [
                {
                  id: scheduleId,
                  chargingRateUnit: OCPP2_1.ChargingRateUnitEnumType.W,
                  startSchedule,
                  chargingSchedulePeriod: [
                    {
                      startPeriod: 0,
                      // Use a small positive minimum when limit is 0 to avoid InvalidProfile rejection (pure V2G mode).
                      limit:
                        recommendation.limitW > 0
                          ? recommendation.limitW
                          : typeof recommendation.dischargeLimitW === 'number'
                            ? 100
                            : 0,
                      operationMode: recommendation.operationMode as OCPP2_1.OperationModeEnumType,
                      ...(typeof recommendation.dischargeLimitW === 'number'
                        ? { dischargeLimit: -Math.abs(recommendation.dischargeLimitW) }
                        : {}),
                    },
                  ],
                },
              ],
            }
          : {
              id: profileId,
              stackLevel,
              chargingProfilePurpose: fallbackPurpose,
              chargingProfileKind: OCPP2_0_1.ChargingProfileKindEnumType.Absolute,
              validFrom,
              chargingSchedule: [
                {
                  id: scheduleId,
                  chargingRateUnit: OCPP2_0_1.ChargingRateUnitEnumType.W,
                  startSchedule,
                  chargingSchedulePeriod: [
                    {
                      startPeriod: 0,
                      limit: recommendation.limitW,
                    },
                  ],
                },
              ],
            };

      const confirmation: IMessageConfirmation = await this.sendCall(
        recommendation.stationId,
        tenantId,
        protocol,
        OCPP_CallAction.SetChargingProfile,
        {
          evseId: ocppEvseId,
          chargingProfile,
        } as OCPP2_request_types.SetChargingProfileRequest,
      );

      // sendCall is dispatched async; treat success as applied and update fingerprint so unchanged limits are skipped.
      const applied =
        confirmation.success &&
        (confirmation.payload === undefined ||
          confirmation.payload === null ||
          (confirmation.payload as { status?: string } | undefined)?.status === 'Accepted');

      if (applied) {
        this._lastAppliedFingerprints.set(fingerprintKey, newFingerprint);
      }

      await this._chargingProfileRepository.createOrUpdateChargingProfile(
        tenantId,
        OCPP2_0_1_Mapper.ChargingProfileMapper.fromChargingProfileType(chargingProfile),
        recommendation.stationId,
        recommendation.evseId,
        ChargingLimitSourceEnum.EMS as ChargingLimitSourceEnumType,
      );

      results.push({
        stationId: recommendation.stationId,
        applied,
        profileId,
        scheduleId,
        success: applied,
        payload: confirmation.payload,
        reason: applied
          ? protocol === OCPPVersion.OCPP2_0_1
            ? 'Applied OCPP 2.0.1 Absolute-profile fallback'
            : null
          : String(confirmation.payload),
      });

      await this._persistEmsDecision(tenantId, {
        siteId: plan.siteId,
        stationId: recommendation.stationId,
        evseId: recommendation.evseId,
        intentMessageId: plan.sourceIntentMessageId,
        decisionType: 'apply_result',
        decisionJson: {
          profileId,
          scheduleId,
          protocol,
          confirmation,
          recommendation,
        },
      });
    }

    return {
      siteId: plan.siteId,
      sourceIntentMessageId: plan.sourceIntentMessageId,
      appliedCount: results.filter((result) => result.applied).length,
      results,
    };
  }

  async reconcileChargingPlan(
    tenantId: number,
    request: EmsChargingPlanRequest,
  ): Promise<EmsChargingPlanReconciliationResponse | null> {
    const plan = await this.deriveChargingPlan(tenantId, request);
    if (!plan) {
      return null;
    }

    const results = [] as EmsChargingPlanReconciliationResponse['results'];

    for (const recommendation of plan.recommendations) {
      const activeProfiles = await this._chargingProfileRepository.readAllByQuery(tenantId, {
        where: {
          stationId: recommendation.stationId,
          chargingLimitSource: ChargingLimitSourceEnum.EMS,
          isActive: true,
        },
        order: [['updatedAt', 'DESC']],
        limit: 1,
      });

      const activeProfile = activeProfiles[0];
      const activeSchedule = activeProfile?.chargingSchedule?.[0] as
        | { chargingSchedulePeriod?: Array<Record<string, unknown>> }
        | undefined;
      const activePeriod = activeSchedule?.chargingSchedulePeriod?.[0];

      const actualLimitW =
        typeof activePeriod?.limit === 'number' ? (activePeriod.limit as number) : null;
      const actualOperationMode =
        typeof activePeriod?.operationMode === 'string'
          ? (activePeriod.operationMode as
              | 'ChargingOnly'
              | 'ExternalLimits'
              | 'CentralSetpoint'
              | 'ExternalSetpoint'
              | 'LocalFrequency'
              | 'LocalLoadBalancing'
              | 'Idle')
          : null;

      const hasActiveProfile = Boolean(activeProfile);
      const drifted =
        !hasActiveProfile ||
        actualLimitW !== recommendation.limitW ||
        actualOperationMode !== recommendation.operationMode;

      const reason = !recommendation.eligible
        ? recommendation.eligibilityReason ?? 'Station not eligible for current allocation strategy'
        : !hasActiveProfile
          ? 'No active EMS charging profile found'
          : actualLimitW !== recommendation.limitW
            ? 'Charging limit differs from planned value'
            : actualOperationMode !== recommendation.operationMode
              ? 'Operation mode differs from planned value'
              : null;

      results.push({
        stationId: recommendation.stationId,
        eligible: recommendation.eligible,
        protocol: recommendation.protocol ?? null,
        hasActiveProfile,
        drifted,
        reason,
        activeProfileId: activeProfile?.id ?? null,
        plannedLimitW: recommendation.limitW,
        actualLimitW,
        plannedOperationMode: recommendation.operationMode,
        actualOperationMode,
      });

      await this._persistEmsDecision(tenantId, {
        siteId: plan.siteId,
        stationId: recommendation.stationId,
        evseId: recommendation.evseId,
        intentMessageId: plan.sourceIntentMessageId,
        decisionType: 'reconcile_result',
        decisionJson: {
          protocol: recommendation.protocol,
          hasActiveProfile,
          drifted,
          reason,
          plannedLimitW: recommendation.limitW,
          actualLimitW,
          plannedOperationMode: recommendation.operationMode,
          actualOperationMode,
          activeProfileId: activeProfile?.id ?? null,
        },
      });
    }

    return {
      siteId: plan.siteId,
      sourceIntentMessageId: plan.sourceIntentMessageId,
      comparedCount: results.length,
      driftedCount: results.filter((result) => result.drifted).length,
      results,
    };
  }

  private async _findDynamicChargingProfile(
    tenantId: number,
    stationId: string,
    evseId: number,
  ): Promise<DynamicProfileSnapshot | null> {
    const dynamicKind = OCPP2_1.ChargingProfileKindEnumType.Dynamic;
    const byEvse = await this._chargingProfileRepository.readAllByQuery(tenantId, {
      where: {
        stationId,
        evseId,
        isActive: true,
        chargingProfileKind: dynamicKind,
      },
      order: [['updatedAt', 'DESC']],
      limit: 1,
    });

    const candidate =
      byEvse[0] ??
      (
        await this._chargingProfileRepository.readAllByQuery(tenantId, {
          where: {
            stationId,
            isActive: true,
            chargingProfileKind: dynamicKind,
          },
          order: [['updatedAt', 'DESC']],
          limit: 1,
        })
      )[0];

    return (candidate as DynamicProfileSnapshot | undefined) ?? null;
  }

  private async _applyDynamicSchedule(
    tenantId: number,
    stationId: string,
    evseId: number,
    protocol: OCPPVersion | null | undefined,
    limitW: number,
    dischargeLimitW: number | null,
    operationMode?: EmsChargingPlanRequest['operationMode'],
  ): Promise<{
    applied: boolean;
    reason: string | null;
    profileId: number | null;
    payload?: unknown;
  }> {
    if (protocol !== OCPPVersion.OCPP2_1) {
      return {
        applied: false,
        reason: `Dynamic path requires OCPP 2.1, got ${protocol ?? 'unknown'}`,
        profileId: null,
      };
    }

    const activeDynamicProfile = await this._findDynamicChargingProfile(
      tenantId,
      stationId,
      evseId,
    );
    if (!activeDynamicProfile) {
      return {
        applied: false,
        reason: 'No active Dynamic charging profile found to update.',
        profileId: null,
      };
    }

    const profileId = Number(activeDynamicProfile?.id);
    if (!Number.isInteger(profileId) || profileId <= 0) {
      return {
        applied: false,
        reason: 'No active Dynamic charging profile found to update.',
        profileId: null,
      };
    }

    const periods = (activeDynamicProfile.chargingSchedule ?? []).flatMap(
      (schedule) => schedule.chargingSchedulePeriod ?? [],
    );
    const periodWithSetpoint = periods.find(
      (period) => toFiniteNumber(period?.setpoint ?? period?.setPoint) !== undefined,
    );
    const activePeriod = periodWithSetpoint ?? periods[0];
    const existingSetpoint = toFiniteNumber(activePeriod?.setpoint ?? activePeriod?.setPoint);
    const existingOperationMode =
      typeof activePeriod?.operationMode === 'string'
        ? (activePeriod.operationMode as OCPP2_1.OperationModeEnumType)
        : undefined;

    const requestedOperationMode = operationMode as OCPP2_1.OperationModeEnumType | undefined;
    const resolvedOperationMode =
      existingSetpoint !== undefined &&
      requestedOperationMode === OCPP2_1.OperationModeEnumType.ExternalLimits &&
      (existingOperationMode === OCPP2_1.OperationModeEnumType.CentralSetpoint ||
        existingOperationMode === OCPP2_1.OperationModeEnumType.ExternalSetpoint)
        ? existingOperationMode
        : requestedOperationMode ??
          existingOperationMode ??
          OCPP2_1.OperationModeEnumType.ExternalLimits;

    const scheduleUpdate: OCPP2_1.ChargingScheduleUpdateType = {
      limit: limitW > 0 ? limitW : typeof dischargeLimitW === 'number' ? 100 : 0,
      operationMode: resolvedOperationMode,
      ...(existingSetpoint !== undefined ? { setpoint: existingSetpoint } : {}),
      ...(typeof dischargeLimitW === 'number'
        ? { dischargeLimit: -Math.abs(dischargeLimitW) }
        : {}),
    };

    const confirmation: IMessageConfirmation = await this.sendCall(
      stationId,
      tenantId,
      OCPPVersion.OCPP2_1,
      OCPP_CallAction.UpdateDynamicSchedule,
      {
        chargingProfileId: profileId,
        scheduleUpdate,
      } as OCPP2_1.UpdateDynamicScheduleRequest,
    );

    const payload = confirmation.payload as { status?: string } | undefined;
    const accepted = confirmation.success && (!payload?.status || payload.status === 'Accepted');
    return {
      applied: accepted,
      reason: accepted ? 'Applied UpdateDynamicSchedule' : String(confirmation.payload),
      profileId,
      payload: confirmation.payload,
    };
  }

  private _normalizeChargingPlanRequest(request: EmsChargingPlanRequest): EmsChargingPlanRequest {
    if (!request.profileOption) {
      return request;
    }

    if (request.profileOption === 'maxChargingProfile') {
      return {
        ...request,
        chargingProfilePurpose: OCPP2_1.ChargingProfilePurposeEnumType.ChargingStationMaxProfile,
        applicationPath: 'absolute',
      };
    }

    if (request.profileOption === 'externalConstraints') {
      return {
        ...request,
        chargingProfilePurpose:
          OCPP2_1.ChargingProfilePurposeEnumType.ChargingStationExternalConstraints,
        applicationPath: 'absolute',
      };
    }

    return {
      ...request,
      chargingProfilePurpose: OCPP2_1.ChargingProfilePurposeEnumType.TxProfile,
      operationMode: 'ExternalLimits',
      applicationPath: 'dynamic',
    };
  }

  async startMqttBridge(): Promise<void> {
    await this._mqttBridge.start();
  }

  async stopMqttBridge(): Promise<void> {
    await this._mqttBridge.shutdown();
  }

  isMqttBridgeStarted(): boolean {
    return this._mqttBridge.isStarted();
  }

  getMqttBridgeStatus(): {
    enabled: boolean;
    started: boolean;
    startupMode: 'non_fatal' | 'required' | null;
    siteIntentsTopic: string | null;
  } {
    return {
      enabled: this._mqttBridge.isEnabled(),
      started: this._mqttBridge.isStarted(),
      startupMode: this.config.modules.ems?.mqtt?.startupMode ?? null,
      siteIntentsTopic: this.config.modules.ems?.mqtt?.siteIntentsTopic ?? null,
    };
  }

  override async shutdown(): Promise<void> {
    await this._mqttBridge.shutdown();
    await super.shutdown();
  }

  @AsHandler(OCPP_2_VER_LIST, OCPP_CallAction.ReportChargingProfiles)
  protected async _handleReportChargingProfiles(
    message: IMessage<OCPP2_request_types.ReportChargingProfilesRequest>,
  ): Promise<void> {
    const chargingProfiles = message.payload
      .chargingProfile as OCPP2_common_types.ChargingProfileType[];
    const tenantId = message.context.tenantId;

    for (const chargingProfile of chargingProfiles) {
      await this._chargingProfileRepository.createOrUpdateChargingProfile(
        tenantId,
        OCPP2_0_1_Mapper.ChargingProfileMapper.fromChargingProfileType(chargingProfile),
        message.context.stationId,
        message.payload.evseId,
        message.payload.chargingLimitSource,
        true,
      );
    }

    await this.sendCallResultWithMessage(
      message,
      {} as OCPP2_response_types.ReportChargingProfilesResponse,
    );
  }

  @AsHandler(OCPP_2_VER_LIST, OCPP_CallAction.SetChargingProfile)
  protected async _handleSetChargingProfile(
    message: IMessage<OCPP2_response_types.SetChargingProfileResponse>,
  ): Promise<void> {
    const tenantId = message.context.tenantId;
    const response = message.payload;

    if (response.status === ChargingProfileStatusEnum.Rejected) {
      this._logger.error(`EMS SetChargingProfile rejected: ${JSON.stringify(response)}`);
      return;
    }

    await this._chargingProfileRepository.updateAllByQuery(
      tenantId,
      {
        isActive: false,
      },
      {
        where: {
          tenantId,
          stationId: message.context.stationId,
          isActive: true,
          chargingLimitSource: ChargingLimitSourceEnum.EMS,
          chargingProfilePurpose: {
            [Op.in]: [
              OCPP2_1.ChargingProfilePurposeEnumType.ChargingStationMaxProfile,
              OCPP2_1.ChargingProfilePurposeEnumType.ChargingStationExternalConstraints,
            ],
          },
        },
        returning: false,
      },
    );

    await this.sendCall(
      message.context.stationId,
      tenantId,
      message.protocol,
      OCPP_CallAction.GetChargingProfiles,
      {
        requestId: await this._idGenerator.generateRequestId(
          tenantId,
          message.context.stationId,
          ChargingStationSequenceTypeEnum.getChargingProfiles,
        ),
        chargingProfile: {
          chargingLimitSource: [ChargingLimitSourceEnum.EMS],
        } as OCPP2_common_types.ChargingProfileCriterionType,
      } as OCPP2_request_types.GetChargingProfilesRequest,
    );
  }

  protected async _persistEmsDecision(
    tenantId: number,
    value: Parameters<IEmsDecisionRepository['createDecision']>[1],
  ): Promise<void> {
    try {
      await this._emsDecisionRepository.createDecision(tenantId, value);
    } catch (error) {
      this._logger.warn(
        `Failed to persist EMS decision ${value.decisionType} for station ${value.stationId}: ${String(error)}`,
      );
    }
  }
}
